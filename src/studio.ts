import { DIFFICULTIES, EditorDocument, GLYPHS, STAGE_GRID, SYMBOLS, bpmTravelTimeMs, clone, defaultLayout, exactTime, formatTime, parseChart, snapTarget, snapTargetCoord, snapTime, sortNotes, uid, validatePlayable, type Chart, type Note, type Song } from './domain';
import { AudioTransport, waveform } from './audio';
import { Repository, storageMessage } from './storage';
import { COLORS, drawStage, drawSymbol, groupNotes, pointToTarget, stageScale, symbolSVG, targetPoint, type NoteGroup } from './stage';
import { downloadJSON, esc, icon, toast } from './ui';

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
  tool: Tool = 'tap';
  symbol = 0;
  secondSymbol = 1;
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
        <div class="studio-actions"><span id="save-status" class="save-status"></span><button class="button ghost" data-editor="export">${icon('download')}<span>Export</span></button><button class="button ghost" data-editor="save">${icon('save')}<span>Save chart</span></button><button class="button primary" data-editor="playtest">${icon('play')} Playtest</button></div>
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
        <aside class="tools panel"><span class="eyebrow">TOOLS</span>
          ${([['select','select','Select'],['tap','plus','Tap note'],['hold','clock','Hold note'],['dual','grid','Dual note'],['dual-hold','clock','Dual hold'],['erase','trash','Eraser'],['pan','hand','Pan']] as const).map(([tool, ico, label]) => `<button data-tool="${tool}" title="${label}" aria-label="${label}" class="tool ${this.tool === tool ? 'active' : ''}">${icon(ico)}<span>${label}</span></button>`).join('')}
          <span class="eyebrow symbol-heading">SYMBOL</span><div class="symbol-tools">${GLYPHS.map((g,i) => `<button data-symbol="${i}" style="--note-color:${COLORS[i]}" class="${this.symbol === i ? 'active' : ''}" aria-label="${SYMBOLS[i]} symbol">${g}</button>`).join('')}</div>
          <label class="second-symbol">DUAL PARTNER<select id="second-symbol">${GLYPHS.map((g,i) => `<option value="${i}" ${this.secondSymbol === i ? 'selected' : ''}>${g} ${SYMBOLS[i]}</option>`).join('')}</select></label>
        </aside>
        <div class="timeline-panel panel">
          <div class="timeline-toolbar"><div class="toolbar-group"><button class="icon-button" data-editor="undo" aria-label="Undo" title="Undo (Ctrl/Cmd+Z)">${icon('undo')}</button><button class="icon-button" data-editor="redo" aria-label="Redo" title="Redo (Ctrl/Cmd+Shift+Z)">${icon('redo')}</button><span class="divider"></span><button class="snap-button active" data-editor="snap">SNAP</button><select id="snap-resolution" aria-label="Snap resolution">${[1,2,4,8,16,32].map(n => `<option value="${n}" ${this.snap === n ? 'selected' : ''}>1/${n}</option>`).join('')}</select></div>
          <div class="toolbar-group"><button class="icon-button zoom-button" data-editor="zoom-out" aria-label="Zoom out">−</button><span id="zoom-label">100%</span><button class="icon-button zoom-button" data-editor="zoom-in" aria-label="Zoom in">+</button><button class="icon-button" data-editor="inspector" aria-label="Toggle note inspector">${icon('info')}</button></div></div>
          <div class="timeline-scroll" id="timeline-scroll"><canvas id="timeline" aria-label="Interactive beatmap timeline"></canvas><div id="timeline-spacer"></div></div>
          <div class="timeline-transport"><div class="transport-buttons"><button class="icon-button" data-editor="restart" aria-label="Return to start">↤</button><button class="transport-play" data-editor="preview" aria-label="Preview audio">${icon('play')}</button><span id="studio-time">0:00.000</span><span class="small-muted"> / ${formatTime(this.song.durationMs)}</span></div><button class="button subtle follow active" data-editor="follow">Follow playhead</button><span class="timeline-count" id="note-count"></span></div>
          <div class="stage-preview"><div class="stage-preview-header"><span class="eyebrow">PERFORMANCE STAGE</span><span>Choose a note, then drag its target</span></div><canvas id="stage-preview" aria-label="Drag selected target in performance stage"></canvas><label>SCRUB<input id="stage-scrub" aria-label="Stage preview time" type="range" min="0" max="${this.song.durationMs}" step="1" value="${this.transport.nowMs}"></label></div>
          <div class="timeline-help"><span>Place notes on a track · Pan tool to scroll · Drag selected notes to edit</span><span>1/4 = one beat</span></div>
        </div>
        <aside class="inspector panel" id="inspector"></aside>
      </div>
      <div class="editor-footer"><div>${icon('shield')} Your music and charts stay on this device.</div><span>Changing BPM or offset moves the grid, never your notes.</span></div>`;
    const timing = document.createElement('button');
    timing.className = 'button ghost settings-toggle'; timing.dataset.editor = 'settings'; timing.textContent = 'Timing';
    timing.setAttribute('aria-label','Chart and timing settings');
    root.querySelector('.studio-actions')!.insertBefore(timing,root.querySelector('[data-editor="export"]'));
    this.stage = root.querySelector('#stage-preview')!;
    this.stage.addEventListener('pointerdown',this.stageDown);this.stage.addEventListener('pointermove',this.stageMove);this.stage.addEventListener('pointerup',this.stageUp);this.stage.addEventListener('pointercancel',this.stageCancel);
    this.canvas = root.querySelector('#timeline')!; this.viewport = root.querySelector('#timeline-scroll')!;
    root.querySelector('.timeline-help span')!.textContent = 'Click a track to place · N inserts the selected symbol at the playhead · Pan to scroll';
    this.viewport.scrollLeft = this.scroll;
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(this.viewport);
    this.resize(); this.update();
    root.addEventListener('click', this.click);
    root.addEventListener('change', this.change);
    this.viewport.addEventListener('scroll', this.onScroll);
    this.canvas.addEventListener('pointerdown', this.down);
    this.canvas.addEventListener('pointermove', this.move);
    this.canvas.addEventListener('pointerup', this.up);
    this.canvas.addEventListener('pointercancel', this.cancel);
    this.canvas.addEventListener('lostpointercapture', this.cancel);
    window.addEventListener('keydown', this.key);
    const frame = () => { this.draw(); this.raf = requestAnimationFrame(frame); }; frame();
  }
  unmount() {
    cancelAnimationFrame(this.raf); this.observer?.disconnect();
    this.root?.removeEventListener('click', this.click); this.root?.removeEventListener('change', this.change);
    this.viewport?.removeEventListener('scroll', this.onScroll);
    this.canvas?.removeEventListener('pointerdown', this.down); this.canvas?.removeEventListener('pointermove', this.move);
    this.canvas?.removeEventListener('pointerup', this.up); this.canvas?.removeEventListener('pointercancel', this.cancel); this.canvas?.removeEventListener('lostpointercapture', this.cancel);
    this.stage?.removeEventListener('pointerdown',this.stageDown);this.stage?.removeEventListener('pointermove',this.stageMove);this.stage?.removeEventListener('pointerup',this.stageUp);this.stage?.removeEventListener('pointercancel',this.stageCancel);this.stageDrag=undefined;
    window.removeEventListener('keydown', this.key); this.gesture = undefined; this.root = undefined;
  }
  async dispose() { clearTimeout(this.timer); await this.saving; await this.flushDraft(); this.unmount(); this.active = false; }
  private resize() {
    if (!this.canvas || !this.viewport || !this.root) return;
    if(this.stage){const rect=this.stage.getBoundingClientRect(),scale=Math.min(devicePixelRatio||1,2);this.stage.width=rect.width*scale;this.stage.height=rect.height*scale;}
    const width = this.viewport.clientWidth, height = window.innerHeight < 540 ? 246 : 350, dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.style.width = width + 'px'; this.canvas.style.height = height + 'px';
    this.canvas.width = width * dpr; this.canvas.height = height * dpr;
    this.root.querySelector<HTMLElement>('#timeline-spacer')!.style.width = Math.max(width, this.song.durationMs / 1000 * this.zoom + 100) + 'px';
  }
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
    this.root.querySelectorAll<HTMLElement>('[data-symbol]').forEach(b => b.classList.toggle('active',Number(b.dataset.symbol) === this.symbol));
    this.root.querySelector<HTMLButtonElement>('[data-editor="undo"]')!.disabled = !this.doc.canUndo;
    this.root.querySelector<HTMLButtonElement>('[data-editor="redo"]')!.disabled = !this.doc.canRedo;
    this.root.querySelector('#note-count')!.textContent = this.chart.notes.length + ' notes';
    this.root.querySelector<HTMLInputElement>('#chart-name')!.value = this.chart.name;
    this.root.querySelector<HTMLInputElement>('#chart-bpm')!.value = String(this.chart.timing.bpm);
    this.root.querySelector<HTMLInputElement>('#chart-offset')!.value = String(this.chart.timing.offsetMs);
    this.root.querySelector<HTMLSelectElement>('#chart-difficulty')!.value = this.chart.difficulty;
    this.root.querySelector<HTMLSelectElement>('#chart-meter')!.value = String(this.chart.timing.timeSignature.numerator);
    const n = this.chart.notes.find(n => n.id === this.selected), selectedGroup = groupNotes(this.chart.notes).find(g=>g.some(item=>item.id===this.selected)), check = validatePlayable(this.chart, this.song.durationMs);
    const inspector = this.root.querySelector('#inspector')!;
    inspector.innerHTML = `<div class="inspector-title"><span class="eyebrow">${n ? 'NOTE PROPERTIES' : 'CHART OVERVIEW'}</span><span class="tiny-tag">${n ? n.type.toUpperCase() : this.chart.difficulty.toUpperCase()}</span></div>${n ? `
      <div class="selected-symbol" style="color:${COLORS[SYMBOLS.indexOf(n.symbol)]}">${symbolSVG(n.symbol,!!selectedGroup?.dual)}</div>
      <label>SYMBOL<select id="note-symbol">${SYMBOLS.map((s,i) => `<option value="${s}" ${n.symbol === s ? 'selected' : ''}>${GLYPHS[i]} ${s}</option>`).join('')}</select></label>
      <label>TYPE<select id="note-type"><option value="tap" ${n.type === 'tap' ? 'selected' : ''}>Tap</option><option value="hold" ${n.type === 'hold' ? 'selected' : ''}>Hold</option></select></label>
      <label>TIME · MS<input id="note-time" type="number" min="0" max="${this.song.durationMs}" step="1" value="${Math.round(n.timeMs)}"></label>
      ${n.type === 'hold' ? `<label>DURATION · MS<input id="note-duration" type="number" min="1" step="1" value="${Math.round(n.durationMs!)}"></label>` : ''}
      <label>INPUT SIDE<select id="note-side">${['either','left','right'].map(s => `<option value="${s}" ${n.side === s ? 'selected' : ''}>${s === 'either' ? 'Either side' : s[0].toUpperCase() + s.slice(1)}</option>`).join('')}</select></label>
      <label>TARGET X · GRID<input id="note-target-x" type="number" min="${STAGE_GRID.min}" max="${STAGE_GRID.max}" step="${STAGE_GRID.minorStep}" value="${n.target.x}"></label>
      <label>TARGET Y · GRID<input id="note-target-y" type="number" min="${STAGE_GRID.min}" max="${STAGE_GRID.max}" step="${STAGE_GRID.minorStep}" value="${n.target.y}"></label>
      <label>ENTRY DIRECTION<select id="note-entry">${Array.from(new Set([0,45,90,135,180,225,270,315,n.entryAngleDeg])).sort((a,b)=>a-b).map(deg=>`<option value="${deg}" ${n.entryAngleDeg===deg?'selected':''}>${deg}° · ${({0:'Right',45:'Bottom right',90:'Bottom',135:'Bottom left',180:'Left',225:'Top left',270:'Top',315:'Top right'} as Record<number,string>)[deg]||'Custom'}</option>`).join('')}</select></label>
      <label>TRAVEL · MS (BPM)<input id="note-travel" type="number" min="200" max="5000" step="50" value="${bpmTravelTimeMs(this.chart.timing.bpm)}" readonly></label>
      <div class="inspector-actions"><button class="button subtle" data-editor="duplicate">Duplicate</button><button class="icon-button danger" data-editor="delete" aria-label="Delete selected note">${icon('trash')}</button></div>` : `
      <div class="overview-orbit">◎</div><h3>Build your rhythm.</h3><p class="muted">Choose a tool and symbol, then tap a track to place your first note.</p>
      <div class="chart-stat"><span>Total notes</span><b>${this.chart.notes.length}</b></div><div class="chart-stat"><span>Hold notes</span><b>${this.chart.notes.filter(n => n.type === 'hold').length}</b></div><div class="chart-stat"><span>Chart span</span><b>${formatTime(Math.max(0, ...this.chart.notes.map(n => n.timeMs + (n.durationMs || 0))))}</b></div>`}
      <div class="validation ${check.errors.length ? 'warning' : 'valid'}">${icon(check.errors.length ? 'info' : 'check')}<span>${esc(check.errors[0] || check.warnings[0] || 'Ready to playtest')}</span></div>`;
  }
  private click = (event: Event) => {
    const target = event.target as HTMLElement, tool = target.closest<HTMLElement>('[data-tool]'), symbol = target.closest<HTMLElement>('[data-symbol]');
    if (tool) { this.tool = tool.dataset.tool as Tool; this.root!.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('active', (b as HTMLElement).dataset.tool === this.tool)); return; }
    if (symbol) {
      this.symbol = Number(symbol.dataset.symbol);
      if (this.selected) this.edit(c => { const n = c.notes.find(n => n.id === this.selected); if (n) n.symbol = SYMBOLS[this.symbol]; });
      this.update(); return;
    }
    const action = target.closest<HTMLElement>('[data-editor]')?.dataset.editor;
    if (action) void this.action(action).catch(e => toast(storageMessage(e), true));
  };
  private async action(action: string) {
    if (action === 'settings') { this.settingsOpen = !this.settingsOpen; this.root!.classList.toggle('settings-open',this.settingsOpen); this.resize(); }
    if (action === 'insert') { this.place(this.snapping ? snapTime(this.transport.nowMs,this.chart,this.snap) : this.transport.nowMs,this.symbol); return; }
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
    if (action === 'delete' && this.selected) { this.edit(c => { c.notes = c.notes.filter(n => n.id !== this.selected); }); this.selected = undefined; this.update(); }
    if (action === 'duplicate') {
      const note = this.chart.notes.find(n => n.id === this.selected);
      if (note) { const copy = { ...note, id: uid(), timeMs: note.timeMs + 60000 / this.chart.timing.bpm }; delete copy.chordId; if (copy.timeMs + (copy.durationMs || 0) > this.song.durationMs) throw new Error('The duplicate would extend beyond the audio.'); this.edit(c => c.notes.push(copy)); this.selected = copy.id; this.update(); }
    }
    if (action === 'snap') { this.snapping = !this.snapping; this.root!.querySelector('[data-editor="snap"]')!.classList.toggle('active', this.snapping); }
    if (action === 'follow') { this.follow = !this.follow; this.root!.querySelector('[data-editor="follow"]')!.classList.toggle('active', this.follow); }
    if (action === 'inspector') this.root!.querySelector('.editor-layout')!.classList.toggle('show-inspector');
    if (action === 'zoom-in' || action === 'zoom-out') {
      const center = (this.scroll + this.viewport!.clientWidth / 2) / this.zoom;
      this.zoom = Math.max(24, Math.min(600, this.zoom * (action === 'zoom-in' ? 1.4 : 1 / 1.4)));
      this.resize(); this.viewport!.scrollLeft = Math.max(0, center * this.zoom - this.viewport!.clientWidth / 2);
      this.root!.querySelector('#zoom-label')!.textContent = Math.round(this.zoom / 110 * 100) + '%';
    }
    if (action === 'tap-bpm') {
      const now = performance.now(); if (this.taps.length && now - this.taps.at(-1)! > 2000) this.taps = [];
      this.taps.push(now); this.taps = this.taps.slice(-8);
      if (this.taps.length > 2) { const bpm = Math.round(60000 * (this.taps.length - 1) / (now - this.taps[0]) * 10) / 10; this.edit(c => { c.timing.bpm = bpm; }); }
      else toast('Keep tapping to set the BPM…');
    }
  }
  private change = (event: Event) => {
    const input = event.target as HTMLInputElement, value = input.value;
    if(input.id==='stage-scrub'){this.follow=false;void this.transport.seek(Number(value)).catch(e=>toast(e.message,true));return;}
    if (input.id === 'second-symbol') { this.secondSymbol = Number(value); return; }
    if (input.id === 'snap-resolution') { this.snap = Number(value); return; }
    this.edit(c => {
      if (input.id === 'chart-name') c.name = value.trim();
      if (input.id === 'chart-difficulty') c.difficulty = value as Chart['difficulty'];
      if (input.id === 'chart-bpm') c.timing.bpm = Number(value);
      if (input.id === 'chart-offset') c.timing.offsetMs = Number(value);
      if (input.id === 'chart-meter') c.timing.timeSignature.numerator = Number(value);
      const n = c.notes.find(n => n.id === this.selected); if (!n) return;
      const group = groupNotes(c.notes).find(g => g.some(item => item.id === n.id)) || [n];
      if (['note-target-x','note-target-y','note-entry','note-travel'].includes(input.id)) {
        for(const item of group){if(input.id==='note-target-x')item.target.x=snapTargetCoord(Number(value));if(input.id==='note-target-y')item.target.y=snapTargetCoord(Number(value));if(input.id==='note-entry')item.entryAngleDeg=Number(value);if(input.id==='note-travel')item.travelTimeMs=bpmTravelTimeMs(c.timing.bpm);}
      }
      if (input.id === 'note-time') for (const item of group) item.timeMs = Number(value);
      if (input.id === 'note-duration') for (const item of group) item.durationMs = Number(value);
      if (input.id === 'note-symbol') for (const item of group) item.symbol = value as Note['symbol'];
      if (input.id === 'note-side') n.side = value as Note['side'];
      if (input.id === 'note-type') {
        for (const item of group) {
          item.type = value as Note['type'];
          if (item.type === 'hold') item.durationMs = 60000 / c.timing.bpm; else delete item.durationMs;
        }
      }
    });
  };
  private key = (e: KeyboardEvent) => {
    if (e.target instanceof Element && e.target.closest('input,textarea,select,[contenteditable="true"]') || document.querySelector('#modal-root')!.childElementCount) return;
    let action = '';
    if (e.code === 'Space') action = 'preview';
    if (e.code === 'KeyN' && !e.ctrlKey && !e.metaKey && !e.altKey) action = 'insert';
    if (e.key === 'Delete' || e.key === 'Backspace') action = 'delete';
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') action = e.shiftKey ? 'redo' : 'undo';
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') action = 'save';
    if (e.key === 'Escape') { this.gesture = undefined; this.selected = undefined; this.update(); }
    if (action) { e.preventDefault(); void this.action(action).catch(e => toast(storageMessage(e), true)); }
  };
  private coordinates(e: PointerEvent) {
    const rect = this.canvas!.getBoundingClientRect(), y = e.clientY - rect.top;
    return { x: e.clientX - rect.left, y, time: Math.max(0, (e.clientX - rect.left + this.scroll - 45) / this.zoom * 1000), lane: Math.floor((y - 96) / ((rect.height - 112) / 4)) };
  }
  private down = (e: PointerEvent) => {
    if (e.button !== 0 || this.gesture) return;
    const p = this.coordinates(e);
    if (p.y < 96) { this.follow = false; void this.transport.seek(Math.min(this.song.durationMs, p.time)).catch(e => toast(e.message, true)); return; }
    if (p.lane < 0 || p.lane > 3) return;
    this.canvas!.setPointerCapture(e.pointerId);
    const row = (this.canvas!.getBoundingClientRect().height - 112) / 4;
    const dualIds=new Set(groupNotes(this.chart.notes).filter(g=>g.dual).flatMap(g=>g.map(n=>n.id)));
    const hit = [...this.chart.notes].reverse().find(n => {
      const y = 96 + row * (p.lane + .5) + (dualIds.has(n.id) ? 0 : n.side === 'left' ? -row * .19 : n.side === 'right' ? row * .19 : 0);
      return SYMBOLS.indexOf(n.symbol) === p.lane && Math.abs(p.y - y) < Math.min(18, row * .32) && p.time >= n.timeMs - 14000 / this.zoom && p.time <= n.timeMs + (n.durationMs || 0) + 14000 / this.zoom;
    });
    if (this.tool === 'erase' && hit) { this.selected = undefined; this.edit(c => { c.notes = c.notes.filter(n => n.id !== hit.id); }); return; }
    if (hit && this.tool !== 'pan') { this.selected = hit.id; this.update(); }
    const resize = hit?.type === 'hold' && Math.abs(p.time - hit.timeMs - hit.durationMs!) < 14000 / this.zoom;
    this.gesture = { pointer: e.pointerId, startX: e.clientX, startY: e.clientY, startScroll: this.scroll, time: p.time, lane: p.lane, note: hit ? clone(hit) : undefined, mode: this.tool === 'pan' ? 'pan' : hit ? resize ? 'resize' : 'move' : 'place', moved: false };
  };
  private move = (e: PointerEvent) => {
    const g = this.gesture; if (!g || g.pointer !== e.pointerId) return;
    if (Math.hypot(e.clientX - g.startX, e.clientY - g.startY) > 5) g.moved = true;
    if (g.mode === 'pan') { this.follow = false; this.viewport!.scrollLeft = g.startScroll - e.clientX + g.startX; return; }
    if (!g.note || !g.moved) return;
    const p = this.coordinates(e), delta = p.time - g.time, n = clone(g.note);
    if (g.mode === 'resize') n.durationMs = Math.max(1, Math.min(this.song.durationMs - n.timeMs, (this.snapping ? snapTime(n.timeMs + g.note.durationMs! + delta, this.chart, this.snap) : n.timeMs + g.note.durationMs! + delta) - n.timeMs));
    else {
      n.timeMs = Math.max(0, Math.min(this.song.durationMs - (n.durationMs || 1), this.snapping ? snapTime(g.note.timeMs + delta, this.chart, this.snap) : g.note.timeMs + delta));
      if (p.lane >= 0 && p.lane < 4) n.symbol = SYMBOLS[p.lane];
    }
    g.preview = n;
  };
  private up = (e: PointerEvent) => {
    const g = this.gesture; if (!g || g.pointer !== e.pointerId) return;
    this.gesture = undefined;
    if (g.preview) {
      this.edit(c => {
        const group = groupNotes(c.notes).find(grp => grp.some(item => item.id === g.note!.id));
        if (group && group.dual && group.length > 1) {
          for (const item of group) {
            item.timeMs = g.preview!.timeMs;
            item.symbol = g.preview!.symbol;
            if (g.preview!.durationMs !== undefined) item.durationMs = g.preview!.durationMs;
          }
        } else {
          const i = c.notes.findIndex(n => n.id === g.note!.id);
          if (i >= 0) c.notes[i] = g.preview!;
        }
      });
      return;
    }
    if (g.mode !== 'place' || g.moved || !['tap','hold','dual','dual-hold'].includes(this.tool)) return;
    const time = this.snapping ? snapTime(g.time, this.chart, this.snap) : g.time;
    this.place(time,g.lane);
  };
  private place(time: number, lane: number) {
    if (time >= this.song.durationMs) return;
    const stepIndex = this.chart.notes.length, isHold = this.tool === 'hold' || this.tool === 'dual-hold', isDual = this.tool === 'dual' || this.tool === 'dual-hold';
    const note: Note = { ...defaultLayout(SYMBOLS[lane], this.chart.timing.bpm, stepIndex, this.snap), id: uid(), type: isHold ? 'hold' : 'tap', symbol: SYMBOLS[lane], side: 'either', timeMs: time };
    this.symbol = lane;
    if (note.type === 'hold') note.durationMs = Math.min(60000 / this.chart.timing.bpm, this.song.durationMs - time);
    this.selected = note.id;
    this.edit(c => {
      if (isDual) {
        const chordId = uid(); note.chordId = chordId;
        const other: Note = { ...clone(note), ...(SYMBOLS[this.secondSymbol]!==note.symbol?defaultLayout(SYMBOLS[this.secondSymbol], this.chart.timing.bpm, stepIndex, this.snap):{}), id: uid(), symbol: SYMBOLS[this.secondSymbol] };
        if (other.symbol === note.symbol) { note.side = 'left'; other.side = 'right'; }
        c.notes.push(note, other);
      } else c.notes.push(note);
    });
  }
  private cancel = () => { this.gesture = undefined; };
  private stagePosition(e: PointerEvent) {
    // Same 16:9 mapping as gameplay, so a dragged target lands exactly where it will be played.
    const rect=this.stage!.getBoundingClientRect();
    return snapTarget(pointToTarget(e.clientX-rect.left,e.clientY-rect.top,rect.width,rect.height));
  }
  private stageDown = (e: PointerEvent) => {
    if(e.button!==0||this.stageDrag)return;
    const rect=this.stage!.getBoundingClientRect(),reach=Math.max(24,26*stageScale(rect.width,rect.height));
    const near=this.chart.notes.filter(n=>Math.abs(n.timeMs-this.transport.nowMs)<=n.travelTimeMs).find(n=>{const p=targetPoint(n,rect.width,rect.height);return Math.hypot(p.x-e.clientX+rect.left,p.y-e.clientY+rect.top)<reach;});
    if(near)this.selected=near.id;
    const n=this.chart.notes.find(n=>n.id===this.selected);if(!n)return;
    e.preventDefault();this.stage!.setPointerCapture(e.pointerId);this.transport.pause();
    const group=groupNotes(this.chart.notes).find(g=>g.some(item=>item.id===n.id))!;
    this.stageDrag={pointer:e.pointerId,ids:group.map(item=>item.id),target:this.stagePosition(e)};this.update();
  };
  private stageMove = (e: PointerEvent) => {if(this.stageDrag?.pointer===e.pointerId)this.stageDrag.target=this.stagePosition(e);};
  private stageUp = (e: PointerEvent) => {
    const drag=this.stageDrag;if(!drag||drag.pointer!==e.pointerId)return;this.stageDrag=undefined;
    this.edit(c=>{for(const n of c.notes)if(drag.ids.includes(n.id))n.target={...drag.target};});
  };
  private stageCancel = () => {this.stageDrag=undefined;};
  private draw() {
    if (!this.canvas || !this.viewport || !this.root) return;
    const dpr = Math.min(devicePixelRatio || 1, 2), w = this.canvas.width / dpr, h = this.canvas.height / dpr, ctx = this.canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#101720'; ctx.fillRect(0,0,w,h);
    const now = this.transport.nowMs;
    if(this.stage){
      if(this.stageNotes!==this.chart.notes){this.stageNotes=this.chart.notes;this.stageGroups=groupNotes(this.chart.notes);}
      const scale=Math.min(devicePixelRatio||1,2),context=this.stage.getContext('2d')!;
      context.setTransform(scale,0,0,scale,0,0);
      const groups=this.stageDrag?this.stageGroups.map(group=>Object.assign(group.map(n=>this.stageDrag!.ids.includes(n.id)?{...n,target:this.stageDrag!.target}:n),{dual:group.dual,chordKey:group.chordKey})):this.stageGroups;
      drawStage(context,this.stage.width/scale,this.stage.height/scale,groups,now,this.selected);
      if(this.selected){const n=this.chart.notes.find(n=>n.id===this.selected);if(n&&(now<n.timeMs-n.travelTimeMs||now>n.timeMs+(n.durationMs||0)+135)){const sw=this.stage.width/scale,sh=this.stage.height/scale,p=targetPoint({...n,target:this.stageDrag?.target||n.target},sw,sh);context.strokeStyle='#fff';context.fillStyle='#fff';drawSymbol(context,n.symbol,p.x,p.y,8.6*stageScale(sw,sh),!!n.chordId);}}
      const scrub=this.root.querySelector<HTMLInputElement>('#stage-scrub')!;if(document.activeElement!==scrub)scrub.value=String(now);
    }
    if (this.transport.isPlaying && this.follow && (now / 1000 * this.zoom - this.scroll > w * 0.78 || now / 1000 * this.zoom < this.scroll)) this.viewport.scrollLeft = Math.max(0, now / 1000 * this.zoom - w * 0.25);
    const x = (ms: number) => 45 + ms / 1000 * this.zoom - this.scroll, row = (h - 112) / 4;
    ctx.fillStyle = COLORS[this.symbol] + '06'; ctx.fillRect(40,96+row*this.symbol,w-40,row);
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
    for (let px=45; px<w; px+=3) { const index = Math.floor(((px + this.scroll - 45) / this.zoom * 1000) / this.song.durationMs * this.peaks.length); const amplitude = (this.peaks[index] || 0) * 32; ctx.fillRect(px,61-amplitude,1.5,Math.max(1,amplitude*2)); }
    for (let i=0;i<4;i++) { const y=96+i*row; ctx.strokeStyle='#23303b';ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke(); }
    for (const group of this.stageGroups) {
      const original=group[0];
      if (original.timeMs > end) break;
      const n = this.gesture?.preview?.id === original.id ? this.gesture.preview : original;
      if (n.timeMs + (n.durationMs || 0) < start - 200) continue;
      const lane=SYMBOLS.indexOf(n.symbol), px=x(n.timeMs), py=96+row*(lane+.5)+(group.dual?0:n.side==='left'?-row*.19:n.side==='right'?row*.19:0), selected=n.id===this.selected;
      ctx.fillStyle=COLORS[lane];ctx.strokeStyle=selected?'#fff':COLORS[lane];
      if(n.type==='hold'){const length=n.durationMs!/1000*this.zoom;ctx.globalAlpha=.22;ctx.fillRect(px,py-8,length,16);ctx.globalAlpha=1;ctx.fillRect(px+length-3,py-10,5,20);}
      ctx.fillStyle=selected?'#fff':COLORS[lane];drawSymbol(ctx,n.symbol,px,py,11,group.dual);
      if(n.side!=='either'){ctx.font='8px "Segoe UI",sans-serif';ctx.fillText(n.side==='left'?'L':'R',px+13,py);}
      if(selected){ctx.lineWidth=1;ctx.strokeRect(px-15,py-17,30,34);}
    }
    ctx.fillStyle='#101720';ctx.fillRect(0,28,40,h-28);
    for(let i=0;i<4;i++){ctx.fillStyle=COLORS[i];ctx.font='22px "Segoe UI",sans-serif';ctx.fillText(GLYPHS[i],9,96+row*(i+.5));}
    const playX=x(now);ctx.fillStyle='#bcf87e';ctx.fillRect(playX,25,1.5,h-25);ctx.beginPath();ctx.moveTo(playX-5,24);ctx.lineTo(playX+6,24);ctx.lineTo(playX,32);ctx.fill();
    this.root.querySelector('#studio-time')!.textContent=exactTime(now);
    const play=this.root.querySelector('[data-editor="preview"]')!;if(play.getAttribute('data-playing')!==String(this.transport.isPlaying)){play.innerHTML=icon(this.transport.isPlaying?'pause':'play');play.setAttribute('data-playing',String(this.transport.isPlaying));}
  }
}
