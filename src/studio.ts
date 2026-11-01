import { DIFFICULTIES, EditorDocument, beatMs, gridFromNote, quantizeNote, invalidDualGroups, GLYPHS, STAGE_GRID, targetGridStep, SYMBOLS, bpmTravelTimeMs, clone, defaultLayout, exactTime, formatTime, parseChart, snapTarget, snapTargetCoord, snapTime, uid, validatePlayable, type Chart, type Note, type Song } from './domain';
import { AudioTransport, waveform } from './audio';
import { Repository, storageMessage } from './storage';
import { COLORS, isNoteVisible, drawStage, drawSymbol, groupNotes, pointToTarget, stageScale, symbolSVG, targetPoint, type NoteGroup } from './stage';
import { downloadJSON, esc, icon, toast } from './ui';
import { directionLabel, normalizeDirection, noteMembers } from './editor-controls';

type Tool = 'select' | 'tap' | 'hold' | 'dual' | 'dual-hold' | 'erase' | 'pan';
type Gesture = { pointer: number; startX: number; startY: number; startScroll: number; time: number; lane: number; note?: Note; mode: 'move' | 'resize' | 'pan' | 'place'; moved: boolean; preview?: Note };
const signature = (chart: Chart) => JSON.stringify({ ...chart, revision: 0, updatedAt: '' });
export class Studio {
  doc: EditorDocument;
  private savedSignature: string;
  private revision: number;
  private root?: HTMLElement;
  private canvas?: HTMLCanvasElement;
  private viewport?: HTMLElement;
  private stage?: HTMLCanvasElement;
  private stageNotes?: Note[];
  private stageGroups: NoteGroup[] = [];
  private stageDrag?: { pointer: number; ids: string[]; target: {x:number;y:number} };
  private observer?: ResizeObserver;
  private raf = 0;
  private resizeRaf = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private writes: Promise<unknown> = Promise.resolve();
  private epoch = 0;
  private active = true;
  private status = 'All changes saved';
  private saveBusy = false;
  private saving?: Promise<void>;
  private lastDraft = '';
  private settingsOpen = false;
  private peaks: Float32Array;
  private gesture?: Gesture;
  private taps: number[] = [];
  private directionDrag?: { pointer?: number; angle: number; ids: string[] };
  private freeDirection = false;
  private inspectorOpen = false;
  private stageOpen = true;
  private quantizeScope: 'start'|'end'|'both' = 'both';
  private selection = new Set<string>();
  private sidebarCollapsed = false;
  private shortcutsOpen = false;
  private pendingType?: 'tap' | 'hold';
  private overlapIds: string[] = [];
  tool: Tool = 'tap';
  symbol = 0;
  selected?: string;
  zoom = 110;
  scroll = 0;
  snap = 16;
  snapping = true;
  follow = true;
  constructor(public song: Song, chart: Chart, private transport: AudioTransport, private repo: Repository, private onPlaytest: (chart: Chart) => void, private onSaved: () => void) {
    this.doc = new EditorDocument(chart); this.revision = chart.revision; this.savedSignature = signature(chart);
    try { this.peaks = transport.currentBuffer ? waveform(transport.currentBuffer) : new Float32Array(); }
    catch { this.peaks = new Float32Array(); toast('Waveform unavailable. Beat grid editing is still ready.'); }
    if (!chart.revision) this.status = 'New chart · not saved';
  }
  get chart() { return this.doc.chart; }
  get dirty() { return signature(this.chart) !== this.savedSignature || this.revision === 0; }
  restore(chart: Chart) { this.doc = new EditorDocument(chart); this.status = 'Recovered draft'; this.schedule(); }
  mount(root: HTMLElement) {
    this.root = root;
    root.classList.toggle('settings-open',this.settingsOpen);
    root.innerHTML = `
      <div class="studio-top">
        <div><span class="eyebrow">ORBIT STUDIO <span class="live-dot"></span></span><h1>${esc(this.song.title)}<span class="small-muted"> / Beatmap editor</span></h1></div>
        <div class="studio-actions"><span id="save-status" class="save-status" role="status" aria-live="polite"></span><button class="button ghost" data-editor="export">${icon('download')}<span>Export</span></button><button class="button ghost" data-editor="save">${icon('save')}<span>Save chart</span></button><button class="button primary" data-editor="playtest">${icon('play')} Playtest</button></div>
      </div>
      <div class="chart-settings panel">
        <label>CHART NAME<input id="chart-name" maxlength="200" value="${esc(this.chart.name)}" aria-label="Chart name"></label>
        <label>DIFFICULTY<select id="chart-difficulty">${DIFFICULTIES.map(d => `<option value="${d}" ${this.chart.difficulty === d ? 'selected' : ''}>${d[0].toUpperCase() + d.slice(1)}</option>`).join('')}</select></label>
        <label>BPM<input id="chart-bpm" type="number" min="1" max="1000" step="0.1" value="${this.chart.timing.bpm}" aria-label="BPM"></label>
        <button class="button subtle tap-bpm" data-editor="tap-bpm" title="Tap several times to estimate BPM">Tap BPM</button>
        <label>GRID OFFSET · MS<input id="chart-offset" type="number" min="-600000" max="600000" value="${this.chart.timing.offsetMs}" aria-label="Grid offset in milliseconds"></label>
        <label>METER<select id="chart-meter"><option value="4" ${this.chart.timing.timeSignature.numerator === 4 ? 'selected' : ''}>4/4</option><option value="3" ${this.chart.timing.timeSignature.numerator === 3 ? 'selected' : ''}>3/4</option></select></label>
      </div>
      <div class="editor-layout">
        <aside class="tools panel" aria-label="Penempatan baru"><span class="eyebrow">PENEMPATAN BARU</span>
          <button class="tool" data-editor="sidebar" aria-label="Ringkas atau perluas sidebar kiri (B)">☰</button>
          ${([['select','select','Select / Pan'],['tap','plus','Tap note'],['hold','clock','Hold note'],['dual','grid','Dual note'],['dual-hold','clock','Dual hold'],['erase','trash','Eraser']] as const).map(([tool, ico, label]) => `<button data-tool="${tool}" title="${label}" aria-label="${label}" class="tool ${this.tool === tool ? 'active' : ''}">${icon(ico)}<span>${label.replace(' note','')}</span></button>`).join('')}
          <span class="eyebrow symbol-heading">SYMBOL</span><div class="symbol-tools">${GLYPHS.map((g,i) => `<button data-symbol="${i}" style="--note-color:${COLORS[i]}" class="${this.symbol === i ? 'active' : ''}" aria-label="${SYMBOLS[i]} symbol">${g}</button>`).join('')}</div>
        </aside>
        <div class="timeline-panel panel">
          <div class="timeline-toolbar"><div class="toolbar-group"><button class="icon-button" data-editor="undo" aria-label="Undo" title="Undo (Ctrl/Cmd+Z)">${icon('undo')}</button><button class="icon-button" data-editor="redo" aria-label="Redo" title="Redo (Ctrl/Cmd+Shift+Z)">${icon('redo')}</button><span class="divider"></span><button class="snap-button active" data-editor="snap">SNAP</button><select id="snap-resolution" aria-label="Snap resolution">${[1,2,3,4,6,8,16,32].map(n => `<option value="${n}" ${this.snap === n ? 'selected' : ''}>1/${n}</option>`).join('')}</select></div>
          <div class="toolbar-group"><button class="icon-button zoom-button" data-editor="zoom-out" aria-label="Zoom out">−</button><span id="zoom-label">100%</span><input id="zoom-value" type="number" min="0.5" max="800" step="0.5" aria-label="Zoom percent" value="100"><button data-editor="zoom-reset" title="Reset zoom (Ctrl+0)">100%</button><button data-editor="zoom-fit" title="Fit chart (Shift+F)">Fit</button><button class="icon-button zoom-button" data-editor="zoom-in" aria-label="Zoom in">+</button><button class="icon-button" data-editor="inspector" aria-label="Toggle note inspector">${icon('info')}</button></div></div>
          <div id="timeline-selection" class="timeline-selection" role="group" aria-label="Pilih note bertumpuk" hidden></div>
          <div class="timeline-scroll" id="timeline-scroll"><canvas id="timeline" tabindex="0" aria-label="Timeline satu lajur. Gunakan navigasi note untuk memilih dengan keyboard."></canvas><div id="timeline-spacer"></div></div>
          <div class="timeline-transport"><div class="transport-buttons"><button class="icon-button" data-editor="restart" aria-label="Return to start">↤</button><button class="transport-play" data-editor="preview" aria-label="Preview audio">${icon('play')}</button><span id="studio-time">0:00.000</span><span class="small-muted"> / ${formatTime(this.song.durationMs)}</span></div><button class="button subtle follow active" data-editor="follow">Follow playhead</button><span class="timeline-count" id="note-count"></span><button data-editor="previous-note" aria-label="Previous note" title="Previous note ([)">←</button><button data-editor="next-note" aria-label="Next note" title="Next note (])">→</button><button data-editor="stage-toggle" aria-expanded="${this.stageOpen}">Stage</button><button data-editor="shortcuts" aria-expanded="false" title="Keyboard shortcuts (?)">?</button></div><div id="shortcut-guide" hidden></div>
          <div class="stage-preview" ${this.stageOpen?'':'hidden'}><div class="stage-preview-header"><span class="eyebrow">PERFORMANCE STAGE</span><span>Drag handle target · klik kosong tidak mengubah note</span></div><canvas id="stage-preview" aria-label="Drag selected target in performance stage"></canvas><label>SCRUB<input id="stage-scrub" aria-label="Stage preview time" type="range" min="0" max="${this.song.durationMs}" step="1" value="${this.transport.nowMs}"></label></div>
          <div class="timeline-help"><span>Place notes on a track · Pan tool to scroll · Drag selected notes to edit</span><span>1/4 = one beat</span></div>
        </div>
        <aside class="inspector panel" id="inspector"></aside>
      </div>
      <div class="editor-footer"><div>${icon('shield')} ${this.repo.activeUserId ? 'Account cloud sync · local audio cache' : 'Local workspace'}</div><span>Awal dan akhir Hold mengikuti beat, BPM, dan grid offset.</span></div>`;
    const timing = document.createElement('button');
    timing.className = 'button ghost settings-toggle'; timing.dataset.editor = 'settings'; timing.textContent = 'Timing';
    timing.setAttribute('aria-label','Chart and timing settings');
    root.querySelector('.studio-actions')!.insertBefore(timing,root.querySelector('[data-editor="export"]'));
    root.closest('.app-shell')?.classList.toggle('sidebar-collapsed',this.sidebarCollapsed);
    root.querySelector('#shortcut-guide')!.innerHTML='<strong>Keyboard shortcuts</strong>'+[['V / E','Select & Pan / Eraser'],['T / H / D / Shift+D','Tap / Hold / Dual / Dual Hold'],['1–4 / Alt+1–4','Pilih bentuk / ubah pilihan'],['Alt+T/H/D/Shift+D','Konversi pilihan'],['N / Delete','Sisipkan / hapus'],['Space / Home / End','Play / awal / akhir'],['← → / Shift+← →','Seek grid / birama'],['Alt+← →','Geser pilihan'],['[ / ]','Note sebelumnya / berikutnya'],['S / Q','Snap / Quantize'],['− / + / Ctrl+0','Zoom out / in / reset'],['Shift+F / Ctrl+Shift+F','Fit chart / pilihan'],['B / P / I','Sidebar / Stage / Inspector'],['Ctrl+A / Shift+click','Pilih semua / tambah pilihan'],['Ctrl+D / Ctrl+S','Duplikasi / Simpan'],['Ctrl+Z / Ctrl+Shift+Z','Undo / Redo'],['Esc / ?','Batal / Shortcut']].map(([key,label])=>'<div><kbd>'+key+'</kbd><span>'+label+'</span></div>').join('');
    root.querySelectorAll<HTMLElement>('[data-tool]').forEach(b=>{const key=({select:'V',tap:'T',hold:'H',dual:'D','dual-hold':'Shift+D',erase:'E'} as Record<string,string>)[b.dataset.tool!];b.title+=' ('+key+')';b.setAttribute('aria-keyshortcuts',key);});
    root.querySelectorAll<HTMLElement>('[data-symbol]').forEach(b=>{b.title=SYMBOLS[Number(b.dataset.symbol)]+' ('+(Number(b.dataset.symbol)+1)+')';});
    this.stage = root.querySelector('#stage-preview')!;
    this.stage.addEventListener('pointerdown',this.stageDown);this.stage.addEventListener('pointermove',this.stageMove);this.stage.addEventListener('pointerup',this.stageUp);this.stage.addEventListener('pointercancel',this.stageCancel);this.stage.addEventListener('lostpointercapture',this.stageCancel);
    this.canvas = root.querySelector('#timeline')!; this.viewport = root.querySelector('#timeline-scroll')!;
    root.querySelector('.timeline-help span')!.textContent = 'V Select/Pan · T/H/D tipe · 1–4 bentuk · N sisipkan · ? shortcut';
    this.viewport.scrollLeft = this.scroll;
    this.observer = new ResizeObserver(() => {
      if (this.resizeRaf) cancelAnimationFrame(this.resizeRaf);
      this.resizeRaf = requestAnimationFrame(() => { this.resizeRaf = 0; this.resize(); });
    }); this.observer.observe(this.viewport);
    this.resize(); this.update();
    root.addEventListener('click', this.click);
    root.addEventListener('change', this.change);
    root.addEventListener('input', this.input);
    root.addEventListener('pointerdown',this.directionDown);root.addEventListener('pointermove',this.directionMove);root.addEventListener('pointerup',this.directionUp);root.addEventListener('pointercancel',this.directionCancel);root.addEventListener('lostpointercapture',this.directionLost);
    this.viewport.addEventListener('scroll', this.onScroll);
    this.canvas.addEventListener('pointerdown', this.down);
    this.canvas.addEventListener('wheel',this.wheel,{passive:false});
    this.canvas.addEventListener('pointermove', this.move);
    this.canvas.addEventListener('pointerup', this.up);
    this.canvas.addEventListener('pointercancel', this.cancel);
    this.canvas.addEventListener('lostpointercapture', this.cancel);
    window.addEventListener('keydown', this.key);
    const frame = () => { this.draw(); this.raf = requestAnimationFrame(frame); }; frame();
  }
  unmount() {
    this.root?.removeEventListener('pointerdown',this.directionDown);this.root?.removeEventListener('pointermove',this.directionMove);this.root?.removeEventListener('pointerup',this.directionUp);this.root?.removeEventListener('pointercancel',this.directionCancel);this.root?.removeEventListener('lostpointercapture',this.directionLost);this.directionDrag=undefined;
    cancelAnimationFrame(this.raf); cancelAnimationFrame(this.resizeRaf); this.resizeRaf = 0; this.observer?.disconnect();
    this.root?.removeEventListener('click', this.click); this.root?.removeEventListener('change', this.change);
    this.root?.removeEventListener('input', this.input);
    this.viewport?.removeEventListener('scroll', this.onScroll);
    this.canvas?.removeEventListener('wheel',this.wheel);
    this.canvas?.removeEventListener('pointerdown', this.down); this.canvas?.removeEventListener('pointermove', this.move);
    this.canvas?.removeEventListener('pointerup', this.up); this.canvas?.removeEventListener('pointercancel', this.cancel); this.canvas?.removeEventListener('lostpointercapture', this.cancel);
    this.stage?.removeEventListener('pointerdown',this.stageDown);this.stage?.removeEventListener('pointermove',this.stageMove);this.stage?.removeEventListener('pointerup',this.stageUp);this.stage?.removeEventListener('pointercancel',this.stageCancel);this.stage?.removeEventListener('lostpointercapture',this.stageCancel);this.stageDrag=undefined;
    window.removeEventListener('keydown', this.key); this.gesture = undefined; this.root = undefined;
  }
  async dispose() { clearTimeout(this.timer); await this.saving; await this.flushDraft(); this.unmount(); this.active = false; }
  private resize() {
    if (!this.canvas || !this.viewport || !this.root) return;
    if(this.stage){const rect=this.stage.getBoundingClientRect(),scale=Math.min(devicePixelRatio||1,2);if(this.stage.width!==Math.round(rect.width*scale))this.stage.width=Math.round(rect.width*scale);if(this.stage.height!==Math.round(rect.height*scale))this.stage.height=Math.round(rect.height*scale);}
    const width = this.viewport.clientWidth, height = window.innerHeight < 540 ? Math.max(96,Math.min(166,window.innerHeight-this.viewport.getBoundingClientRect().top-64)) : 210, dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.style.width = width + 'px'; this.canvas.style.height = height + 'px';
    if(this.canvas.width!==Math.round(width*dpr))this.canvas.width=Math.round(width*dpr);
    if(this.canvas.height!==Math.round(height*dpr))this.canvas.height=Math.round(height*dpr);
    this.root.querySelector<HTMLElement>('#timeline-spacer')!.style.width = Math.max(width, this.song.durationMs / 1000 * this.zoom + 100) + 'px';
  }
  private setZoom(value: number, anchorX = this.viewport!.clientWidth/2, anchorMs?: number) {
    if(!Number.isFinite(value)||value<=0)return;
    const time=anchorMs??(this.scroll+anchorX-45)/this.zoom*1000;
    this.zoom=Math.max(.55,Math.min(880,value));this.follow=false;this.resize();
    this.viewport!.scrollLeft=Math.max(0,45+time/1000*this.zoom-anchorX);this.scroll=this.viewport!.scrollLeft;this.update();
  }
  private wheel = (event: WheelEvent) => {
    if(!event.ctrlKey&&!event.metaKey)return;
    event.preventDefault();const x=event.clientX-this.canvas!.getBoundingClientRect().left;
    this.setZoom(this.zoom*Math.exp(-Math.max(-100,Math.min(100,event.deltaY))*.004),x);
  };
  private onScroll = () => { if (this.viewport) this.scroll = this.viewport.scrollLeft; };
  private edit(fn: (chart: Chart) => void) {
    try { if (this.doc.apply(fn)) { this.status = 'Unsaved changes'; this.schedule(); this.update(); } }
    catch (e) { toast((e as Error).message, true); this.update(); }
  }
  private schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.flushDraft().catch(() => {}); }, 900);
  }
  async flushDraft() {
    clearTimeout(this.timer);
    if (!this.dirty || !this.active) return;
    if (this.saveBusy) { this.schedule(); return this.saving; }
    const snapshot = clone(this.chart), baseRevision = this.revision, epoch = this.epoch, sig = signature(snapshot);
    if (this.lastDraft === baseRevision + ':' + sig) return this.writes;
    this.status = 'Saving draft…'; this.updateStatus();
    this.writes = this.writes.catch(() => {}).then(async () => {
      if (epoch !== this.epoch || !this.active) return;
      await this.repo.saveDraft({ chartId: snapshot.chartId, chart: snapshot, baseRevision, savedAt: new Date().toISOString() });
      this.lastDraft = baseRevision + ':' + sig;
      if (epoch === this.epoch && sig === signature(this.chart)) { this.status = 'Draft saved · chart not published'; this.updateStatus(); }
    }).catch(e => { this.status = 'Save failed · export a backup'; this.updateStatus(); toast(storageMessage(e), true); throw e; });
    return this.writes;
  }
  save() {
    if (this.saving) return this.saving;
    this.saving = this.performSave().finally(() => { this.saving = undefined; });
    return this.saving;
  }
  private async performSave() {
    if(invalidDualGroups(this.chart.notes).length)throw new Error('Konversi pasangan Dual lama sebelum menyimpan. Draft dan ekspor tetap tersedia.');
    this.saveBusy = true; clearTimeout(this.timer); ++this.epoch;
    this.status = 'Saving chart…'; this.updateStatus();
    try {
      await this.writes.catch(() => {});
      this.writes = Promise.resolve();
      const snapshot = clone(this.chart), sig = signature(snapshot);
      const saved = await this.repo.saveChart(snapshot, this.revision);
      this.revision = saved.revision; this.doc.chart.revision = saved.revision; this.doc.chart.updatedAt = saved.updatedAt;
      this.savedSignature = sig; this.status = this.dirty ? 'Unsaved changes' : 'All changes saved';
      this.lastDraft = '';
      if (this.dirty) this.schedule();
      this.onSaved(); toast('Chart saved to your library.'); this.updateStatus();
    } catch (e) { this.status = 'Save failed · export a backup'; this.updateStatus(); throw e; }
    finally { this.saveBusy = false; this.updateStatus(); }
  }
  private updateStatus() {
    const el = this.root?.querySelector('#save-status'); if (el) el.textContent = this.status;
    const save = this.root?.querySelector<HTMLButtonElement>('[data-editor="save"]'); if (save) save.disabled = this.saveBusy;
  }
  private update() {
    if (!this.root) return;
    this.updateStatus();
    this.root.querySelector('[data-editor="snap"]')!.classList.toggle('active',this.snapping);
    this.root.querySelector('[data-editor="follow"]')!.classList.toggle('active',this.follow);
    this.root.querySelector('#zoom-label')!.textContent=Number((this.zoom/110*100).toFixed(1))+'%';
    this.root.querySelector<HTMLInputElement>('#zoom-value')!.value=String(Number((this.zoom/110*100).toFixed(1)));
    const available=new Set(this.chart.notes.map(n=>n.id));this.selection=new Set([...this.selection].filter(id=>available.has(id)));
    this.root.querySelector('#shortcut-guide')!.toggleAttribute('hidden',!this.shortcutsOpen);
    this.root.querySelector('[data-editor=shortcuts]')!.setAttribute('aria-expanded',String(this.shortcutsOpen));
    this.root.querySelector('[data-editor=sidebar]')!.setAttribute('aria-expanded',String(!this.sidebarCollapsed));
    this.root.querySelectorAll<HTMLElement>('[data-symbol]').forEach(b => b.classList.toggle('active',Number(b.dataset.symbol) === this.symbol));
    this.root.querySelector<HTMLButtonElement>('[data-editor="undo"]')!.disabled = !this.doc.canUndo;
    this.root.querySelector<HTMLButtonElement>('[data-editor="redo"]')!.disabled = !this.doc.canRedo;
    this.root.querySelector('#note-count')!.textContent = this.chart.notes.length + ' notes';
    this.root.querySelector<HTMLInputElement>('#chart-name')!.value = this.chart.name;
    this.root.querySelector<HTMLInputElement>('#chart-bpm')!.value = String(this.chart.timing.bpm);
    this.root.querySelector<HTMLInputElement>('#chart-offset')!.value = String(this.chart.timing.offsetMs);
    this.root.querySelector<HTMLSelectElement>('#chart-difficulty')!.value = this.chart.difficulty;
    this.root.querySelector<HTMLSelectElement>('#chart-meter')!.value = String(this.chart.timing.timeSignature.numerator);
    const n = this.chart.notes.find(n => n.id === this.selected);
    const members = noteMembers(this.chart.notes, this.selected);
    const paired = members.length > 1;
    this.root.querySelector('#note-count')!.setAttribute('title',this.scope().length+' selected');
    const type = n ? (paired ? 'dual'+(n.type==='hold'?'-hold':'') : n.type) : '';
    const check = validatePlayable(this.chart, this.song.durationMs);
    this.root.querySelector('.editor-layout')!.classList.toggle('show-inspector',this.inspectorOpen);
    this.root.querySelector('.stage-preview')!.toggleAttribute('hidden',!this.stageOpen);
    this.root.querySelector('[data-editor="stage-toggle"]')!.setAttribute('aria-expanded',String(this.stageOpen));
    this.root.querySelector('[data-editor="inspector"]')!.setAttribute('aria-expanded',String(this.inspectorOpen));
    for(const action of ['snap','follow'] as const)this.root.querySelector('[data-editor="'+action+'"]')!.setAttribute('aria-pressed',String(action==='snap'?this.snapping:this.follow));
    this.root.querySelectorAll<HTMLElement>('[data-tool]').forEach(b=>{b.classList.toggle('active',b.dataset.tool===this.tool);b.setAttribute('aria-pressed',String(b.dataset.tool===this.tool));});
    this.root.querySelectorAll<HTMLElement>('[data-symbol]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.symbol)===this.symbol)));
    const overlap=this.root.querySelector<HTMLElement>('#timeline-selection')!;
    const choices=this.chart.notes.filter(item=>this.overlapIds.includes(item.id));
    overlap.hidden=choices.length<2;
    overlap.innerHTML='<span>Pilih note · '+choices.length+' objek</span>'+choices.map(item=>'<button data-pick-note="'+esc(item.id)+'" aria-pressed="'+(item.id===this.selected)+'">'+GLYPHS[SYMBOLS.indexOf(item.symbol)]+' '+exactTime(item.timeMs)+' · '+item.type+' · '+item.side+'</button>').join('');
    const inspector = this.root.querySelector('#inspector')!;
    const focus=document.activeElement instanceof HTMLElement && inspector.contains(document.activeElement)?document.activeElement:null;
    const focusId=focus?.id;
    const focusKey=focus?.getAttribute('data-focus');
    const inspectorScroll=inspector.scrollTop;
    const detailsOpen=inspector.querySelector('details')?.open;
    inspector.innerHTML = `<div class="inspector-title"><span class="eyebrow">${n ? 'NOTE TERPILIH' : 'CHART OVERVIEW'}</span><button data-editor="inspector" class="inspector-close" aria-label="Close properties">×</button></div>${n ? `
      <div class="selection-summary"><span class="selected-symbol" style="color:${COLORS[SYMBOLS.indexOf(n.symbol)]}">${symbolSVG(n.symbol,paired)}</span><span>${paired?'Pasangan Dual':'Note tunggal'}<small>${exactTime(n.timeMs)}</small></span></div>
      <div class="property-heading">SIMBOL ${paired?'PASANGAN':''}</div>
      <div class="property-symbols">${SYMBOLS.map((symbol,i)=>`<button data-property-symbol="${symbol}" data-focus="symbol-${i}" aria-label="Set symbol ${symbol}" aria-pressed="${n.symbol===symbol}">${GLYPHS[i]}</button>`).join('')}</div>
      <div class="property-heading">TYPE</div><div class="note-types">${(['tap','hold','dual','dual-hold'] as const).map(t=>`<button data-note-type="${t}" data-focus="type-${t}" aria-pressed="${type===t}">${t==='dual-hold'?'Dual Hold':t[0].toUpperCase()+t.slice(1)}</button>`).join('')}</div>
      ${this.pendingType?`<div class="conversion-choice" role="group" aria-label="Pilih anggota yang dipertahankan"><p>Ubah menjadi ${this.pendingType}. Pilih anggota yang dipertahankan; anggota lain akan dilepas.</p>${members.map((item,i)=>`<button data-keep-note="${esc(item.id)}">Simpan ${i?'B':'A'} · ${GLYPHS[SYMBOLS.indexOf(item.symbol)]}</button>`).join('')}<button data-editor="cancel-conversion">Batal</button></div>`:''}
      <div class="direction-control"><span class="property-heading">ARAH SPAWN</span>
        <div id="direction-wheel" class="direction-wheel" style="--preview:${n.entryAngleDeg}deg" role="slider" tabindex="0" aria-label="Arah spawn" aria-valuemin="0" aria-valuemax="359.9" aria-valuenow="${n.entryAngleDeg}" aria-valuetext="${directionLabel(n.entryAngleDeg)}">
          <span class="compass north">Atas</span><span class="compass south">Bawah</span><span class="compass west">Kiri</span><span class="compass east">Kanan</span><span class="wheel-arm"><span class="wheel-handle"></span></span><b>◎</b>
        </div><output id="direction-value" for="note-entry">${directionLabel(n.entryAngleDeg)}</output>
        <div class="direction-presets">${[270,315,0,45,90,135,180,225].map(deg=>`<button data-angle="${deg}" data-focus="angle-${deg}" aria-label="Spawn ${directionLabel(deg)}" aria-pressed="${n.entryAngleDeg===deg}">${({0:'→',45:'↘',90:'↓',135:'↙',180:'←',225:'↖',270:'↑',315:'↗'} as Record<number,string>)[deg]}</button>`).join('')}</div>
        <label class="free-direction"><input id="free-direction" type="checkbox" ${this.freeDirection?'checked':''}> Sudut bebas</label>
        <label>SUDUT · °<input id="note-entry" type="number" min="0" max="359.9" step="0.1" value="${n.entryAngleDeg}"></label><small>Sisi handle = sisi spawn. Note bergerak dari tepi menuju target.</small>
      </div>
      <details class="note-details"><summary>Timing & posisi target</summary>
        <label>WAKTU · MS<input id="note-time" type="number" min="0" max="${this.song.durationMs}" step="1" value="${Math.round(n.timeMs)}" readonly></label><label>AWAL · BEAT<input id="note-beat" type="number" step="${4/this.snap}" value="${n.grid!.startBeat}"></label>
        ${n.type==='hold'?`<label>PANJANG · LANGKAH 1/${this.snap}<input id="note-length" type="number" min="1" step="1" value="${Number(((n.grid!.endBeat!-n.grid!.startBeat)/(4/this.snap)).toFixed(6))}"></label><label>END HOLD · BEAT<input id="note-end-beat" type="number" step="${4/this.snap}" value="${n.grid!.endBeat}"></label><output>${Number((n.durationMs!/beatMs(this.chart)).toFixed(4))} beat · ${Math.round(n.durationMs!)} ms · TAHAN</output><div class="duration-presets">${[1,2,4,8].map(steps=>`<button data-duration-steps="${steps}">${steps} × 1/${this.snap}</button>`).join('')}</div>`:''}
        <label>TARGET X<input id="note-target-x" type="number" min="${STAGE_GRID.min}" max="${STAGE_GRID.max}" step="${targetGridStep(this.snap)}" value="${n.target.x}"></label>
        <label>TARGET Y<input id="note-target-y" type="number" min="${STAGE_GRID.min}" max="${STAGE_GRID.max}" step="${STAGE_GRID.minorStep}" value="${n.target.y}"></label>
        <button data-editor="center-target">Pusatkan target</button><button data-editor="auto-target">Ikuti jalur grid</button><label>TRAVEL · MS (BPM)<input id="note-travel" type="number" value="${bpmTravelTimeMs(this.chart.timing.bpm)}" readonly></label>
      </details>
      <div class="inspector-actions"><button class="button subtle" data-editor="duplicate">Duplicate</button><button class="button danger" data-editor="delete">Delete ${paired?'pair':'note'}</button></div>` : `
      <h3>Satu lajur, semua simbol.</h3><p class="muted">Pilih simbol dan tipe pada Penempatan baru, lalu klik waktu pada timeline. Gunakan navigasi note untuk mengedit chart yang sudah ada.</p><div class="chart-stat"><span>Total notes</span><b>${this.chart.notes.length}</b></div>`}
      <div class="quantize-controls"><label>Quantize<select id="quantize-scope"><option value="both">Awal & End Hold</option><option value="start">Awal (panjang tetap)</option><option value="end">End Hold</option></select></label><button data-editor="quantize">Quantize pilihan (Q)</button></div>
      ${n?.chordId&&invalidDualGroups(members).length>0?`<div class="validation warning">Pasangan lama berbeda. Pilih acuan konversi: ${members.map(item=>`<button data-normalize="${item.id}">${GLYPHS[SYMBOLS.indexOf(item.symbol)]} ${item.type}</button>`).join('')}</div>`:''}
      <div class="validation ${check.errors.length?'warning':'valid'}">${icon(check.errors.length?'info':'check')}<span>${esc(check.errors[0]||check.warnings[0]||'Ready to playtest')}</span></div>`;
    inspector.querySelector<HTMLSelectElement>('#quantize-scope')!.value=this.quantizeScope;
    inspector.scrollTop=inspectorScroll;
    const details=inspector.querySelector('details');if(details&&detailsOpen)details.open=true;
    if(focusId)inspector.querySelector<HTMLElement>('#'+focusId)?.focus({preventScroll:true});
    else if(focusKey)inspector.querySelector<HTMLElement>('[data-focus="'+focusKey+'"]')?.focus({preventScroll:true});
  }
  private scope(notes = this.chart.notes): Note[] {
    const members=noteMembers(notes,this.selected);
    const ids=new Set([...this.selection,...members.map(n=>n.id)]);
    const chords=new Set(notes.filter(n=>ids.has(n.id)&&n.chordId).map(n=>n.chordId));
    return notes.filter(n=>ids.has(n.id)||!!n.chordId&&chords.has(n.chordId));
  }
  private selectNote(id: string, seek = false) {
    this.selected=id;this.selection.clear();this.pendingType=undefined;
    if(seek){const n=this.chart.notes.find(n=>n.id===id);if(n){this.follow=false;void this.transport.seek(n.timeMs).catch(e=>toast(e.message,true));if(this.viewport)this.viewport.scrollLeft=Math.max(0,n.timeMs/1000*this.zoom-this.viewport.clientWidth/2);}}
    this.update();
  }
  private click = (event: Event) => {
    const target = event.target as HTMLElement, tool = target.closest<HTMLElement>('[data-tool]'), symbol = target.closest<HTMLElement>('[data-symbol]');
    if (tool) { this.tool = tool.dataset.tool as Tool; this.update(); return; }
    if (symbol) {
      this.symbol = Number(symbol.dataset.symbol);

      this.update(); return;
    }
    const normalized=target.closest<HTMLElement>('[data-normalize]')?.dataset.normalize;
    if(normalized){this.edit(c=>{const source=c.notes.find(n=>n.id===normalized)!,group=noteMembers(c.notes,source.id);if(group.length>2)throw new Error('Konversi ke Tap dahulu untuk memilih satu anggota, lalu ubah ke Dual.');if(group.length===1){delete source.chordId;source.side='either';}else{group[0].side='left';group[1].side='right';}for(const n of group){n.symbol=source.symbol;n.type=source.type;n.timeMs=source.timeMs;n.target=clone(source.target);if(source.type==='hold')n.durationMs=source.durationMs;else delete n.durationMs;}});return;}
    const propertySymbol=target.closest<HTMLElement>('[data-property-symbol]')?.dataset.propertySymbol;
    if(propertySymbol){this.edit(c=>{for(const n of this.scope(c.notes))n.symbol=propertySymbol as Note['symbol'];const members=noteMembers(c.notes,this.selected);if(members.length===2&&members[0].symbol===members[1].symbol){members[0].side='left';members[1].side='right';}});return;}
    const beats=target.closest<HTMLElement>('[data-duration-steps]')?.dataset.durationSteps;
    if(beats){this.edit(c=>{for(const n of this.scope(c.notes))if(n.type==='hold'){const duration=Number(beats)*4/this.snap*beatMs(c);if(n.timeMs+duration>this.song.durationMs)throw new Error('Durasi melewati akhir audio.');n.durationMs=duration;}});return;}
    const picked=target.closest<HTMLElement>('[data-pick-note]')?.dataset.pickNote;
    if(picked){this.selectNote(picked);return;}
    const keep=target.closest<HTMLElement>('[data-keep-note]')?.dataset.keepNote;
    if(keep&&this.pendingType){const type=this.pendingType;this.edit(c=>{const n=c.notes.find(n=>n.id===keep);if(!n||!n.chordId)return;c.notes=c.notes.filter(item=>item.id===n.id||item.chordId!==n.chordId);delete n.chordId;n.side='either';n.type=type;if(type==='hold'){n.durationMs=n.durationMs||240000/c.timing.bpm/this.snap;if(n.durationMs<=0||n.timeMs+n.durationMs>this.song.durationMs)throw new Error('Tidak ada ruang untuk Hold.');}else delete n.durationMs;});this.selected=keep;this.pendingType=undefined;this.update();return;}
    const angle=target.closest<HTMLElement>('[data-angle]');
    if(angle){this.setDirection(Number(angle.dataset.angle));return;}
    const type=target.closest<HTMLElement>('[data-note-type]')?.dataset.noteType;
    if(type){this.convertType(type);return;}
    const action = target.closest<HTMLElement>('[data-editor]')?.dataset.editor;
    if (action) void this.action(action).catch(e => toast(storageMessage(e), true));
  };
  private async action(action: string) {
    if(action==='sidebar'){this.sidebarCollapsed=!this.sidebarCollapsed;this.root?.closest('.app-shell')?.classList.toggle('sidebar-collapsed',this.sidebarCollapsed);this.update();this.resize();return;}
    if(action==='shortcuts'){this.shortcutsOpen=!this.shortcutsOpen;this.update();return;}
    if(action==='quantize'){const mode=this.quantizeScope;this.edit(c=>{for(const n of this.scope(c.notes))quantizeNote(n,c,this.snap,mode);});return;}
    if(action==='auto-target'){this.edit(c=>{for(const n of this.scope(c.notes)){n.grid={...gridFromNote(n,c),autoTarget:true,subdivision:this.snap};n.target=defaultLayout(n.symbol,c.timing.bpm,Math.round(n.grid.startBeat*this.snap/4),this.snap).target;}});return;}
    if(action==='zoom-reset'){this.setZoom(110);return;}
    if(action==='zoom-fit'||action==='zoom-selection'){const notes=action==='zoom-selection'?this.scope():this.chart.notes;const start=action==='zoom-selection'&&notes.length?Math.min(...notes.map(n=>n.timeMs)):0;const end=action==='zoom-selection'&&notes.length?Math.max(...notes.map(n=>n.timeMs+(n.durationMs||beatMs(this.chart)))):this.song.durationMs;this.setZoom((this.viewport!.clientWidth-100)/Math.max(.1,(end-start)/1000),50,start);return;}
    if (action === 'settings') { this.settingsOpen = !this.settingsOpen; this.root!.classList.toggle('settings-open',this.settingsOpen); this.resize(); }
    if (action === 'insert') { if(!['tap','hold','dual','dual-hold'].includes(this.tool))return;this.place(this.snapping ? snapTime(this.transport.nowMs,this.chart,this.snap) : this.transport.nowMs,this.symbol); return; }
    if(action==='cancel-conversion'){this.pendingType=undefined;this.update();return;}
    if(action==='stage-toggle'){this.stageOpen=!this.stageOpen;this.update();this.resize();return;}
    if(action==='previous-note'||action==='next-note'){const notes=this.chart.notes;if(notes.length){const index=notes.findIndex(n=>n.id===this.selected);const next=index<0?(action==='next-note'?0:notes.length-1):(index+(action==='next-note'?1:-1)+notes.length)%notes.length;this.selectNote(notes[next].id,true);}return;}
    if(action==='center-target'){this.edit(c=>{for(const n of this.scope(c.notes))n.target={x:.5,y:.5};});return;}
    if (action === 'save') return this.save();
    if (action === 'export') { downloadJSON(parseChart(this.chart), this.song.title + ' - ' + this.chart.name); return; }
    if (action === 'preview') { if (this.transport.isPlaying) this.transport.pause(); else await this.transport.play(); }
    if (action === 'restart') { this.transport.stop(); this.viewport!.scrollLeft = 0; }
    if (action === 'playtest') {
      const check = validatePlayable(this.chart, this.song.durationMs);
      if (check.errors.length) throw new Error(check.errors[0]);
      this.onPlaytest(clone(this.chart)); return;
    }
    if (action === 'undo' || action === 'redo') { if (this.doc[action]()) { this.status = 'Unsaved changes'; this.schedule(); this.update(); } }
    if (action === 'delete' && this.selected) { const ids=new Set(this.scope().map(n=>n.id));this.edit(c => { c.notes = c.notes.filter(n => !ids.has(n.id)); }); this.selected = undefined;this.selection.clear();this.pendingType=undefined;this.overlapIds=[];this.update(); }
    if (action === 'duplicate') {
      const members=this.scope(),chords=new Map<string,string>();
      const copies=members.map(n=>{if(n.chordId&&!chords.has(n.chordId))chords.set(n.chordId,uid());return {...clone(n),id:uid(),timeMs:n.timeMs+beatMs(this.chart),...(n.chordId?{chordId:chords.get(n.chordId)}:{})};});
      if(copies.some(n=>n.timeMs>=this.song.durationMs||n.timeMs+(n.durationMs||0)>this.song.durationMs))throw new Error('The duplicate would extend beyond the audio.');
      if(copies.length){this.edit(c=>c.notes.push(...copies));this.selectNote(copies[0].id);}
    }
    if (action === 'snap') { this.snapping = !this.snapping; this.root!.querySelector('[data-editor="snap"]')!.classList.toggle('active', this.snapping); this.update(); }
    if (action === 'follow') { this.follow = !this.follow; this.root!.querySelector('[data-editor="follow"]')!.classList.toggle('active', this.follow); this.update(); }
    if (action === 'inspector') {this.inspectorOpen=!this.inspectorOpen;this.update();this.resize();}
    if (action === 'zoom-in' || action === 'zoom-out') {
      const levels=[.5,1,2,5,10,15,20,25,35,50,70,100,125,150,200,300,400,600,800],percent=this.zoom/1.1;
      const next=action==='zoom-in'?levels.find(n=>n>percent+.01):levels.slice().reverse().find(n=>n<percent-.01);
      const playX=45+this.transport.nowMs/1000*this.zoom-this.scroll;
      this.setZoom((next??(action==='zoom-in'?800:.5))*1.1,playX>=45&&playX<=this.viewport!.clientWidth?playX:this.viewport!.clientWidth/2);
    }
    if (action === 'tap-bpm') {
      const now = performance.now(); if (this.taps.length && now - this.taps.at(-1)! > 2000) this.taps = [];
      this.taps.push(now); this.taps = this.taps.slice(-8);
      if (this.taps.length > 2) { const bpm = Math.round(60000 * (this.taps.length - 1) / (now - this.taps[0]) * 10) / 10; this.edit(c => { c.timing.bpm = bpm; }); }
      else toast('Keep tapping to set the BPM…');
    }
  }
  private syncDirectionPreview(angle: number) {
    const wheel=this.root?.querySelector<HTMLElement>('.direction-wheel');
    wheel?.style.setProperty('--preview',angle+'deg');
    wheel?.setAttribute('aria-valuenow',String(angle));wheel?.setAttribute('aria-valuetext',directionLabel(angle));
    const label=this.root?.querySelector('#direction-value');if(label)label.textContent=directionLabel(angle);
  }
  private directionDown = (e: PointerEvent) => {
    const el=(e.target as Element).closest<HTMLElement>('.direction-wheel');
    if(!el||e.button!==0||this.directionDrag)return;
    const rect=el.getBoundingClientRect();if(Math.hypot(e.clientX-rect.left-rect.width/2,e.clientY-rect.top-rect.height/2)<12)return;
    e.preventDefault();this.transport.pause();el.focus();
    this.directionDrag={pointer:e.pointerId,angle:this.chart.notes.find(n=>n.id===this.selected)?.entryAngleDeg||0,ids:this.scope().map(n=>n.id)};
    el.setPointerCapture(e.pointerId);this.directionMove(e);
  };
  private directionMove = (e: PointerEvent) => {
    if(this.directionDrag?.pointer!==e.pointerId)return;
    const el=this.root?.querySelector<HTMLElement>('.direction-wheel');if(!el)return;
    const r=el.getBoundingClientRect();
    const raw=Math.atan2(e.clientY-r.top-r.height/2,e.clientX-r.left-r.width/2)*180/Math.PI;
    this.directionDrag.angle=normalizeDirection(this.freeDirection?raw:Math.round(raw/45)*45);
    this.syncDirectionPreview(this.directionDrag.angle);
  };
  private directionUp = (e: PointerEvent) => {
    if(this.directionDrag?.pointer!==e.pointerId)return;
    const drag=this.directionDrag;this.directionDrag=undefined;
    this.setDirection(drag.angle,drag.ids);
  };
  private directionCancel = (e?: PointerEvent) => {
    if(!this.directionDrag || e&&this.directionDrag.pointer!==e.pointerId)return;
    this.directionDrag=undefined;this.update();
  };
  private directionLost = (e: PointerEvent) => {if((e.target as Element).matches('.direction-wheel'))this.directionCancel(e);};
  private setDirection(angle: number, ids=this.scope().map(n=>n.id)) {
    if(!Number.isFinite(angle))return;
    this.edit(c=>{for(const item of c.notes)if(ids.includes(item.id))item.entryAngleDeg=normalizeDirection(angle);});
  }
  private convertType(type: string) {
    if(!['tap','hold','dual','dual-hold'].includes(type))return;
    const original=this.chart.notes.find(n=>n.id===this.selected);if(!original)return;
    const members=noteMembers(this.chart.notes,original.id);
    if(members.length>1&&!type.startsWith('dual')){this.pendingType=type as 'tap'|'hold';this.update();return;}
    this.pendingType=undefined;
    this.edit(c=>{
      const n=c.notes.find(n=>n.id===original.id)!;
      if(!type.startsWith('dual')&&members.length===1){delete n.chordId;n.side='either';}
      if(type.startsWith('dual')&&members.length<2){n.chordId=uid();n.side='left';c.notes.push({...clone(n),id:uid(),side:'right'});}
      for(const item of noteMembers(c.notes,n.id)){
        item.symbol=n.symbol;item.timeMs=n.timeMs;item.target=clone(n.target);item.type=type.includes('hold')?'hold':'tap';
        if(item.type==='hold'){item.durationMs=n.durationMs||240000/c.timing.bpm/this.snap;if(item.durationMs<=0||item.timeMs+item.durationMs>this.song.durationMs)throw new Error('Tidak ada ruang untuk Hold.');}
        else delete item.durationMs;
      }
    });
  }
  private input = (event: Event) => {
    const input=event.target as HTMLInputElement;
    if(input.id==='stage-scrub'){this.follow=false;this.root?.querySelector('[data-editor="follow"]')?.classList.remove('active');void this.transport.seek(Number(input.value)).catch(e=>toast(e.message,true));}
  };
  private change = (event: Event) => {
    const input = event.target as HTMLInputElement, value = input.value;
    if(input.id==='zoom-value'){this.setZoom(Number(value)*1.1);return;}
    if(input.id==='quantize-scope'){this.quantizeScope=value as 'start'|'end'|'both';return;}
    if(input.id==='free-direction'){this.freeDirection=input.checked;return;}
    if(input.id==='note-entry'){if(value.trim()&&Number.isFinite(Number(value)))this.setDirection(Number(value));else this.update();return;}
    if(input.id==='stage-scrub'){this.follow=false;void this.transport.seek(Number(value)).catch(e=>toast(e.message,true));return;}
    if (input.id === 'snap-resolution') { this.snap = Number(value); this.update(); return; }
    this.edit(c => {
      if (input.id === 'chart-name') c.name = value.trim();
      if (input.id === 'chart-difficulty') c.difficulty = value as Chart['difficulty'];
      if (input.id === 'chart-bpm') c.timing.bpm = Number(value);
      if (input.id === 'chart-offset') c.timing.offsetMs = Number(value);
      if (input.id === 'chart-meter') c.timing.timeSignature.numerator = Number(value);
      const n = c.notes.find(n => n.id === this.selected); if (!n) return;
      const group = this.scope(c.notes);
      if (['note-target-x','note-target-y','note-entry','note-travel'].includes(input.id)) {
        for(const item of group){if(input.id==='note-target-x'||input.id==='note-target-y'){item.grid={...gridFromNote(item,c),autoTarget:false,targetSubdivision:this.snap};item.target[input.id==='note-target-x'?'x':'y']=snapTargetCoord(Number(value),targetGridStep(this.snap));}if(input.id==='note-entry')item.entryAngleDeg=Number(value);if(input.id==='note-travel')item.travelTimeMs=bpmTravelTimeMs(c.timing.bpm);}
      }
      if(input.id==='note-beat'){const target=Math.round(Number(value)/(4/this.snap))*(4/this.snap);const delta=(target-n.grid!.startBeat)*beatMs(c);for(const item of group)item.timeMs+=delta;}
      if(input.id==='note-length'||input.id==='note-end-beat'){const duration=input.id==='note-length'?Math.round(Number(value))*4/this.snap*beatMs(c):(Math.round(Number(value)/(4/this.snap))*(4/this.snap)-n.grid!.startBeat)*beatMs(c);if(!Number.isFinite(duration)||duration<4/this.snap*beatMs(c)-1e-7)throw new Error('Hold minimal satu langkah grid.');for(const item of group)if(item.type==='hold')item.durationMs=duration;}


      if (input.id === 'note-symbol') for (const item of group) item.symbol = value as Note['symbol'];

      if (input.id === 'note-type') {
        for (const item of group) {
          item.type = value as Note['type'];
          if (item.type === 'hold') item.durationMs = 60000 / c.timing.bpm; else delete item.durationMs;
        }
      }
    });
  };
  private key = (e: KeyboardEvent) => {
    if(e.key==='Escape'&&this.directionDrag){e.preventDefault();this.directionCancel();return;}
    if(e.target instanceof Element&&e.target.closest('.direction-wheel')&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key)){
      e.preventDefault();const n=this.chart.notes.find(n=>n.id===this.selected);if(n)this.setDirection(e.key==='Home'?0:e.key==='End'?359.9:n.entryAngleDeg+(['ArrowRight','ArrowDown'].includes(e.key)?1:-1)*(this.freeDirection?(e.shiftKey?.1:1):45));return;
    }
    if (e.target instanceof Element && e.target.closest('input,textarea,select,[contenteditable="true"]') || document.querySelector('#modal-root')!.childElementCount) return;
    if(e.target instanceof Element&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)&&!e.altKey&&!e.ctrlKey&&!e.metaKey){
      const toolbar=e.target.closest('.tools,.toolbar-group');
      if(toolbar){const controls=[...toolbar.querySelectorAll<HTMLElement>('button:not(:disabled),input,select')].filter(el=>!el.closest('[hidden]'));const index=controls.indexOf(e.target as HTMLElement);if(index>=0){e.preventDefault();controls[(index+(['ArrowLeft','ArrowUp'].includes(e.key)?-1:1)+controls.length)%controls.length]?.focus();return;}}
    }
    if(!e.ctrlKey&&!e.metaKey){
      const type=({KeyT:'tap',KeyH:'hold',KeyD:e.shiftKey?'dual-hold':'dual'} as Record<string,Tool>)[e.code];
      if(type){e.preventDefault();if(e.altKey)this.convertType(type);else{this.tool=type;this.update();}return;}
      if(/^Digit[1-4]$/.test(e.code)){e.preventDefault();const index=Number(e.code.slice(-1))-1;if(e.altKey)this.edit(c=>{for(const n of this.scope(c.notes))n.symbol=SYMBOLS[index];});else{this.symbol=index;this.update();}return;}
      if(e.code==='KeyV'||e.code==='KeyE'){e.preventDefault();this.tool=e.code==='KeyV'?'select':'erase';this.update();return;}
    }
    let action = '';
    const command=e.ctrlKey||e.metaKey;
    if(command&&e.code==='KeyA'){e.preventDefault();this.selection=new Set(this.chart.notes.map(n=>n.id));this.selected=this.chart.notes[0]?.id;this.update();return;}
    if(command&&e.code==='KeyD')action='duplicate';
    if(command&&e.code==='Digit0')action='zoom-reset';
    if(e.code==='KeyF'&&e.shiftKey)action=command?'zoom-selection':'zoom-fit';
    if(!command&&!e.altKey){
      const shortcuts:Record<string,string>={KeyS:'snap',KeyQ:'quantize',KeyB:'sidebar',KeyP:'stage-toggle',KeyI:'inspector',BracketLeft:'previous-note',BracketRight:'next-note',Minus:'zoom-out',Equal:'zoom-in'};
      action=shortcuts[e.code]||action;
      if(e.key==='?')action='shortcuts';
    }
    if(e.key==='ArrowLeft'||e.key==='ArrowRight'){
      e.preventDefault();const delta=(e.key==='ArrowLeft'?-1:1)*(e.shiftKey?this.chart.timing.timeSignature.numerator:4/this.snap)*beatMs(this.chart);
      if(e.altKey)this.edit(c=>{for(const n of this.scope(c.notes))n.timeMs+=delta;});
      else{this.follow=false;void this.transport.seek(Math.max(0,Math.min(this.song.durationMs,this.transport.nowMs+delta))).catch(err=>toast(err.message,true));}return;
    }
    if(e.key==='Home'||e.key==='End'){e.preventDefault();this.follow=false;void this.transport.seek(e.key==='Home'?0:this.song.durationMs).catch(err=>toast(err.message,true));return;}

    if (e.code === 'Space') action = 'preview';
    if (e.code === 'KeyN' && !e.ctrlKey && !e.metaKey && !e.altKey) action = 'insert';
    if (e.key === 'Delete' || e.key === 'Backspace') action = 'delete';
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') action = e.shiftKey ? 'redo' : 'undo';
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') action = 'save';
    if (e.key === 'Escape') { this.stageDrag=undefined;this.gesture=undefined;this.pendingType=undefined;this.selected=undefined;this.selection.clear();this.overlapIds=[];this.update(); }
    if (action) { e.preventDefault(); void this.action(action).catch(e => toast(storageMessage(e), true)); }
  };
  private coordinates(e: PointerEvent) {
    const rect = this.canvas!.getBoundingClientRect(), y = e.clientY - rect.top;
    return { x: e.clientX - rect.left, y, time: Math.max(0, (e.clientX - rect.left + this.scroll - 45) / this.zoom * 1000), lane: this.symbol };
  }
  private get rulerHeight() { return window.innerHeight < 540 ? 48 : 96; }
  private down = (e: PointerEvent) => {
    if (e.button !== 0 || this.gesture) return;
    const p = this.coordinates(e);
    if (p.y < this.rulerHeight) { this.follow = false;this.update();void this.transport.seek(Math.min(this.song.durationMs, p.time)).catch(e => toast(e.message, true)); return; }
    if (p.lane < 0 || p.lane > 3) return;
    this.canvas!.setPointerCapture(e.pointerId);
    const height=this.canvas!.getBoundingClientRect().height;
    if(p.x<40||p.y>height-16)return;
    const candidates=this.chart.notes.filter(n=>p.time>=n.timeMs-14000/this.zoom&&p.time<=n.timeMs+(n.durationMs||0)+14000/this.zoom);
    candidates.sort((a,b)=>Math.abs(a.timeMs-p.time)-Math.abs(b.timeMs-p.time)||a.id.localeCompare(b.id));
    const hit = candidates.length>1 ? candidates[(candidates.findIndex(n=>n.id===this.selected)+1)%candidates.length] : candidates[0];
    this.overlapIds=candidates.length>1?candidates.map(n=>n.id):[];
    if(this.tool==='erase'){
      if(hit){const ids=new Set(noteMembers(this.chart.notes,hit.id).map(n=>n.id));this.selected=undefined;this.edit(c=>{c.notes=c.notes.filter(n=>!ids.has(n.id));});}return;
    }
    if (hit && this.tool !== 'pan') { if(e.shiftKey){for(const item of noteMembers(this.chart.notes,this.selected))this.selection.add(item.id);for(const item of noteMembers(this.chart.notes,hit.id))this.selection.add(item.id);}else if(!this.selection.has(hit.id))this.selection.clear();this.selected = hit.id;this.pendingType=undefined;this.update(); }
    else if(this.tool==='select'){this.selection.clear();this.selected=undefined;this.update();}
    const endDistance=hit?Math.abs(p.time-hit.timeMs-(hit.durationMs||0)):Infinity;
    const resize = hit?.type === 'hold' && endDistance < Math.abs(p.time-hit.timeMs) && endDistance*this.zoom/1000 <= Math.min(8,hit.durationMs!*this.zoom/3000);
    this.gesture = { pointer: e.pointerId, startX: e.clientX, startY: e.clientY, startScroll: this.scroll, time: p.time, lane: p.lane, note: hit ? clone(hit) : undefined, mode: this.tool === 'pan' || this.tool === 'select' && !hit ? 'pan' : hit ? resize ? 'resize' : 'move' : 'place', moved: false };
  };
  private move = (e: PointerEvent) => {
    const g = this.gesture; if (!g || g.pointer !== e.pointerId) return;
    if (Math.hypot(e.clientX - g.startX, e.clientY - g.startY) > 5) g.moved = true;
    if (g.mode === 'pan' && g.moved) { this.follow = false; this.viewport!.scrollLeft = g.startScroll - e.clientX + g.startX; return; }
    if (!g.note || !g.moved) return;
    const p = this.coordinates(e), delta = p.time - g.time, n = clone(g.note);
    if (g.mode === 'resize') n.durationMs = Math.max(4/this.snap*beatMs(this.chart), snapTime(n.timeMs + g.note.durationMs! + delta, this.chart, this.snap) - n.timeMs);
    else {
      n.timeMs = Math.max(0, Math.min(this.song.durationMs - (n.durationMs || 1), this.snapping ? snapTime(g.note.timeMs + delta, this.chart, this.snap) : g.note.timeMs + delta));

    }
    g.preview = n;
  };
  private up = (e: PointerEvent) => {
    const g = this.gesture; if (!g || g.pointer !== e.pointerId) return;
    this.gesture = undefined;
    if (g.preview) {
      this.edit(c => {
        const members=g.mode==='resize'?noteMembers(c.notes,g.note!.id):this.scope(c.notes),delta=g.preview!.timeMs-g.note!.timeMs;
        if(members.some(n=>n.timeMs+delta<0||n.timeMs+delta+(g.mode==='resize'?g.preview!.durationMs||0:n.durationMs||0)>this.song.durationMs))throw new Error('Pasangan melewati batas audio.');
        for(const item of members){item.timeMs+=delta;if(g.mode==='resize'&&item.type==='hold')item.durationMs=g.preview!.durationMs;}
      });
      return;
    }
    if (g.mode !== 'place' || g.moved || !['tap','hold','dual','dual-hold'].includes(this.tool)) return;
    const time = this.snapping ? snapTime(g.time, this.chart, this.snap) : g.time;
    this.place(time,g.lane);
  };
  private place(time: number, lane: number) {
    if (time >= this.song.durationMs) return;
    const stepIndex = Math.round((time-this.chart.timing.offsetMs)/(240000/this.chart.timing.bpm/this.snap)), isHold = this.tool === 'hold' || this.tool === 'dual-hold', isDual = this.tool === 'dual' || this.tool === 'dual-hold';
    const note: Note = { ...defaultLayout(SYMBOLS[lane], this.chart.timing.bpm, stepIndex, this.snap), id: uid(), type: isHold ? 'hold' : 'tap', symbol: SYMBOLS[lane], side: 'either', timeMs: time };
    this.symbol = lane;
    if (note.type === 'hold') {note.durationMs=240000/this.chart.timing.bpm/this.snap;if(time+note.durationMs>this.song.durationMs){toast('Tidak ada ruang untuk satu langkah Hold.',true);return;}}
    note.grid={...gridFromNote(note,this.chart),subdivision:this.snap,autoTarget:true};
    this.selection.clear();
    this.selected = note.id;
    this.edit(c => {
      if (isDual) {
        const chordId = uid(); note.chordId = chordId;
        const other: Note = { ...clone(note),  id: uid(), symbol: note.symbol };
        note.side = 'left'; other.side = 'right';
        c.notes.push(note, other);
      } else c.notes.push(note);
    });
  }
  private cancel = () => { this.gesture = undefined; };
  private stagePosition(e: PointerEvent) {
    // Same 16:9 mapping as gameplay, so a dragged target lands exactly where it will be played.
    const rect=this.stage!.getBoundingClientRect();
    return snapTarget(pointToTarget(e.clientX-rect.left,e.clientY-rect.top,rect.width,rect.height),targetGridStep(this.snap));
  }
  private stageDown = (e: PointerEvent) => {
    if(e.button!==0||this.stageDrag)return;
    const rect=this.stage!.getBoundingClientRect(),reach=Math.max(24,26*stageScale(rect.width,rect.height));
    const selected=this.chart.notes.find(n=>n.id===this.selected);
    const hit=(n:Note)=>{const p=targetPoint(n,rect.width,rect.height);return Math.hypot(p.x-e.clientX+rect.left,p.y-e.clientY+rect.top)<reach;};
    const visible=(n:Note)=>isNoteVisible(n,this.transport.nowMs); const n=selected&&visible(selected)&&hit(selected)?selected:this.chart.notes.filter(visible).find(hit);
    if(!n)return;
    this.selected=n.id;this.selection.clear();
    e.preventDefault();this.stage!.setPointerCapture(e.pointerId);this.transport.pause();
    const group=this.scope();
    this.stageDrag={pointer:e.pointerId,ids:group.map(item=>item.id),target:{...n.target}};this.update();
  };
  private stageMove = (e: PointerEvent) => {if(this.stageDrag?.pointer===e.pointerId)this.stageDrag.target=this.stagePosition(e);};
  private stageUp = (e: PointerEvent) => {
    const drag=this.stageDrag;if(!drag||drag.pointer!==e.pointerId)return;this.stageDrag=undefined;
    this.edit(c=>{for(const n of c.notes)if(drag.ids.includes(n.id)){n.target={...drag.target};n.grid={...gridFromNote(n,c),autoTarget:false,targetSubdivision:this.snap};}});
  };
  private stageCancel = (e: PointerEvent) => {if(this.stageDrag?.pointer===e.pointerId)this.stageDrag=undefined;};
  private draw() {
    if (!this.canvas || !this.viewport || !this.root) return;
    const dpr = Math.min(devicePixelRatio || 1, 2), w = this.canvas.width / dpr, h = this.canvas.height / dpr, ctx = this.canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#101720'; ctx.fillRect(0,0,w,h);
    const now = this.transport.nowMs;
    if(this.stageNotes!==this.chart.notes){this.stageNotes=this.chart.notes;this.stageGroups=groupNotes(this.chart.notes);}
    if(this.stage&&!this.stage.closest('[hidden]')){
      const scale=Math.min(devicePixelRatio||1,2),context=this.stage.getContext('2d')!;
      context.setTransform(scale,0,0,scale,0,0);
      const groups=this.stageDrag?this.stageGroups.map(group=>Object.assign(group.map(n=>this.stageDrag!.ids.includes(n.id)?{...n,target:this.stageDrag!.target}:n),{dual:group.dual,chordKey:group.chordKey})):this.stageGroups;
      const previewGroups=this.directionDrag?groups.map(g=>Object.assign(g.map(n=>this.directionDrag!.ids.includes(n.id)?{...n,entryAngleDeg:this.directionDrag!.angle}:n),{dual:g.dual,chordKey:g.chordKey})):groups;
      drawStage(context,this.stage.width/scale,this.stage.height/scale,previewGroups,now,this.selected,true,this.snap);
      const scrub=this.root.querySelector<HTMLInputElement>('#stage-scrub')!;if(document.activeElement!==scrub)scrub.value=String(now);
    }
    if (this.transport.isPlaying && this.follow && (now / 1000 * this.zoom - this.scroll > w * 0.78 || now / 1000 * this.zoom < this.scroll)) this.viewport.scrollLeft = Math.max(0, now / 1000 * this.zoom - w * 0.25);
    const x = (ms: number) => 45 + ms / 1000 * this.zoom - this.scroll, header=this.rulerHeight,row = h-header-16;
    ctx.fillStyle = COLORS[this.symbol] + '06'; ctx.fillRect(40,header,w-40,row);
    const start = Math.max(0, (this.scroll - 45) / this.zoom * 1000), end = (this.scroll + w) / this.zoom * 1000;
    const baseStep = 60000 / this.chart.timing.bpm * 4 / this.snap;
    const stride = Math.max(1, Math.ceil(9 / (baseStep / 1000 * this.zoom))), step = baseStep * stride;
    const first = Math.floor((start - this.chart.timing.offsetMs) / step);
    ctx.font = '10px "Segoe UI",sans-serif'; ctx.textBaseline = 'middle';
    for (let i = first; i * step + this.chart.timing.offsetMs <= end; i++) {
      const t = i * step + this.chart.timing.offsetMs; if (t < 0) continue;
      const px = x(t), beat = (t - this.chart.timing.offsetMs) / (60000 / this.chart.timing.bpm), major = Math.abs(beat - Math.round(beat)) < 0.001;
      ctx.strokeStyle = major ? '#2a3541' : '#1a2430'; ctx.beginPath(); ctx.moveTo(px,29); ctx.lineTo(px,h); ctx.stroke();
      if (major && this.zoom > 55) { ctx.fillStyle = '#788390'; ctx.fillText(String(Math.floor(beat / this.chart.timing.timeSignature.numerator) + 1) + '.' + (Math.round(beat) % this.chart.timing.timeSignature.numerator + 1), px+4,15); }
    }
    ctx.fillStyle = '#59714c';
    for (let px=45; px<w; px+=3) { const index = Math.floor(((px + this.scroll - 45) / this.zoom * 1000) / this.song.durationMs * this.peaks.length); const amplitude = (this.peaks[index] || 0) * (header<96?12:32); ctx.fillRect(px,header-25-amplitude,1.5,Math.max(1,amplitude*2)); }
    for (let i=0;i<2;i++) { const y=header+i*row; ctx.strokeStyle='#23303b';ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke(); }
    const selectedIds=new Set(this.scope().map(n=>n.id));
    const previewMembers=this.gesture?.note?new Set((this.gesture.mode==='resize'?noteMembers(this.chart.notes,this.gesture.note.id):this.scope()).map(n=>n.id)):new Set<string>();
    const notes=this.chart.notes.map(n=>{
      const g=this.gesture;if(!g?.preview||!previewMembers.has(n.id))return n;
      return {...n,timeMs:n.timeMs+g.preview.timeMs-g.note!.timeMs,...(g.mode==='resize'&&n.type==='hold'?{durationMs:g.preview.durationMs}:{})};
    }).filter(n=>n.timeMs<=end&&n.timeMs+(n.durationMs||0)>=start-200).sort((a,b)=>a.timeMs-b.timeMs);
    const py=header+row/2;
    for(const n of notes){
      if(n.type==='hold'){
        const px=x(n.timeMs),length=n.durationMs!/1000*this.zoom;
        ctx.fillStyle=COLORS[SYMBOLS.indexOf(n.symbol)];const size=Math.max(2,Math.min(10,this.zoom/11));ctx.globalAlpha=selectedIds.has(n.id)?.45:.18;ctx.fillRect(px,py-size,length,size*2);ctx.globalAlpha=1;
        ctx.fillRect(px+length-2,py-size-3,4,size*2+6);
      }
    }
    const painted=new Set<string>();
    for(let i=0;i<notes.length;i++){
      const n=notes[i],key=n.chordId?JSON.stringify([n.chordId,n.timeMs,n.symbol]):n.id;if(painted.has(key))continue;painted.add(key);
      const previous=notes[i-1],next=notes[i+1];
      const gap=Math.min(previous&&previous.timeMs!==n.timeMs?Math.abs(x(n.timeMs)-x(previous.timeMs)):Infinity,next&&next.timeMs!==n.timeMs?Math.abs(x(next.timeMs)-x(n.timeMs)):Infinity);
      const size=Math.max(1.5,Math.min(12,this.zoom/110*12,gap*.4)),px=x(n.timeMs);
      ctx.fillStyle=COLORS[SYMBOLS.indexOf(n.symbol)];ctx.strokeStyle=selectedIds.has(n.id)?'#fff':ctx.fillStyle;
      drawSymbol(ctx,n.symbol,px,py,size,!!n.chordId,selectedIds.has(n.id)?2.5:1.2);
      if(n.chordId)drawSymbol(ctx,n.symbol,px,py,size*1.35,false,1);
      if(n.type==='hold'&&size>5){ctx.font='bold 9px sans-serif';ctx.fillStyle='#fff';ctx.fillText(n.chordId?'DUAL HOLD':'HOLD',px-size,py-24);}
    }
    ctx.fillStyle='#101720';ctx.fillRect(0,28,40,h-28);

    const playX=x(now);ctx.fillStyle='#bcf87e';ctx.fillRect(playX,25,1.5,h-25);ctx.beginPath();ctx.moveTo(playX-5,24);ctx.lineTo(playX+6,24);ctx.lineTo(playX,32);ctx.fill();
    this.root.querySelector('#studio-time')!.textContent=exactTime(now);
    const play=this.root.querySelector('[data-editor="preview"]')!;if(play.getAttribute('data-playing')!==String(this.transport.isPlaying)){play.innerHTML=icon(this.transport.isPlaying?'pause':'play');play.setAttribute('data-playing',String(this.transport.isPlaying));play.setAttribute('aria-label',this.transport.isPlaying?'Pause audio':'Preview audio');}
  }
}
