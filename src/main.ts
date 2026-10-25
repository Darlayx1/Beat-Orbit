import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/dm-sans/latin-700.css';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/barlow-condensed/latin-800.css';
import './style.css';
import { DIFFICULTIES, GLYPHS, LIMITS, SYMBOLS, clone, defaultLayout, formatTime, newChart, parseChart, uid, validatePlayable, type Chart, type Draft, type Result, type Song } from './domain';
import { AudioTransport, makeDemoAudioAsync } from './audio';
import { Repository, storageMessage } from './storage';
import { symbolSVG } from './stage';
import { BootSession } from './boot';
import { Studio } from './studio';
import { PlayView } from './play';
import { downloadJSON, esc, icon, toast } from './ui';

const app = document.querySelector<HTMLDivElement>('#app')!;
const modalRoot = document.querySelector<HTMLDivElement>('#modal-root')!;
const repo = new Repository(), transport = new AudioTransport();
let songs: Song[] = [], charts: Chart[] = [], results: Result[] = [], drafts: Draft[] = [];
let page: 'library' | 'studio' | 'play' | 'results' = 'library';
let studio: Studio | undefined, game: PlayView | undefined;
let loadedSong: string | undefined, previewSong: string | undefined;
let filter: 'all' | 'imported' | 'demo' = 'all', search = '', sort = 'recent';
let importOperation = 0;
let latestResult: Result | undefined, resultPlaytest = false, lastChart: Chart | undefined, lastSong: Song | undefined;
let volume = .65;
try { volume = Number(localStorage.getItem('beatorbit-volume') || .65); } catch { /* preferences are optional */ }
volume = Number.isFinite(volume) ? Math.max(0,Math.min(1,volume)) : .65;
transport.setVolume(volume);
const selectedCharts = new Map<string,string>();
let modalCleanup: (() => void) | undefined;

function closeModal() {
  modalCleanup?.(); modalCleanup=undefined; modalRoot.innerHTML=''; app.inert=false;
}
function modal(title: string, body: string, footer: string, onCancel?: () => void) {
  game?.suspend();
  closeModal();
  const previous=document.activeElement as HTMLElement;
  modalRoot.innerHTML=`<div class="modal-backdrop"><section class="modal panel" role="dialog" aria-modal="true" aria-label="${esc(title)}" tabindex="-1"><div class="modal-heading"><div><span class="eyebrow">BEATORBIT</span><h2>${esc(title)}</h2></div><button class="icon-button" data-modal-close aria-label="Close dialog">${icon('close')}</button></div><div class="modal-body">${body}</div><div class="modal-footer">${footer}</div></section></div>`;
  app.inert=true;
  const dismiss=()=>{if(modalRoot.querySelector<HTMLElement>('.modal')?.dataset.busy==='true')return;closeModal();onCancel?.();previous?.focus();};
  modalRoot.querySelector('[data-modal-close]')!.addEventListener('click',dismiss);
  modalRoot.querySelectorAll('[data-cancel]').forEach(b=>b.addEventListener('click',dismiss));
  const trap=(e: KeyboardEvent)=>{
    if(e.key==='Escape'){e.preventDefault();dismiss();}
    if(e.key==='Tab'){
      const focusable=Array.from(modalRoot.querySelectorAll<HTMLElement>('button:not([disabled]),input,select,a[href]'));
      const first=focusable[0],last=focusable.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
    }
  };
  modalRoot.addEventListener('keydown',trap);
  modalCleanup=()=>modalRoot.removeEventListener('keydown',trap);
  queueMicrotask(()=>modalRoot.querySelector<HTMLElement>('input,select,.modal')?.focus());
  return modalRoot;
}
async function choose(title: string, message: string, options: {id:string;label:string;kind?:string}[]) {
  return new Promise<string>(resolve=>{
    const root=modal(title,'<p class="muted">'+esc(message)+'</p>',options.map(o=>`<button class="button ${o.kind||'ghost'}" data-choice="${o.id}">${esc(o.label)}</button>`).join(''),()=>resolve('cancel'));
    root.querySelectorAll<HTMLElement>('[data-choice]').forEach(b=>b.addEventListener('click',()=>{const id=b.dataset.choice!;closeModal();resolve(id);}));
  });
}
function modalBusy(root: HTMLElement, busy: boolean) {
  root.querySelector<HTMLElement>('.modal')!.dataset.busy=String(busy);
  root.querySelectorAll<HTMLButtonElement|HTMLInputElement>('button,input,select').forEach(el=>{el.disabled=busy;});
}
async function refreshData() { [songs,charts,results,drafts]=await Promise.all([repo.songs(),repo.charts(),repo.results(),repo.drafts()]); }
function logo() { return '<span class="brand-icon"><svg viewBox="0 0 40 40" fill="none"><ellipse cx="20" cy="20" rx="17" ry="8" transform="rotate(-38 20 20)" stroke="currentColor" stroke-width="2.4"/><circle cx="20" cy="20" r="4.5" fill="currentColor"/><circle cx="33" cy="10" r="3" fill="currentColor"/></svg></span><span>beat<span class="brand-light">orbit</span><sup>®</sup></span>'; }
function shell(active: string, content: string) {
  app.innerHTML=`<div class="app-shell ${active==='studio'?'studio-shell':''} ${active==='play'?'play-shell':''}">
    <aside class="sidebar"><a href="#" class="brand" data-action="library" aria-label="BeatOrbit library">${logo()}</a><div class="workspace-label">YOUR SPACE</div><nav aria-label="Main navigation">
      <button class="nav-item ${active==='library'?'active':''}" data-action="library">${icon('music')}<span>Music Library</span><small>${songs.length}</small></button>
      <button class="nav-item ${active==='studio'?'active':''}" data-action="studio-picker">${icon('studio')}<span>Orbit Studio</span><span class="new-label">CREATE</span></button>
      <button class="nav-item" data-action="activity">${icon('clock')}<span>Recent Sessions</span></button>
    </nav><div class="sidebar-separator"></div><div class="workspace-label">GET IN THE FLOW</div><button class="nav-item" data-action="guide">${icon('info')}<span>How to play</span></button><button class="nav-item" data-action="import-json">${icon('download')}<span>Import chart</span></button>
    <div class="sidebar-bottom"><div class="local-card">${icon('shield')}<div><strong>Local. Private. Yours.</strong><p>No uploads. Just your music.</p></div><span class="live-dot"></span></div><div class="sidebar-foot"><span>BEATORBIT / V0.1</span><button class="icon-button" data-action="settings" title="Settings" aria-label="Settings">⚙</button></div></div></aside>
    <div class="app-main"><header class="app-header">${active==='studio'?'<button class="mobile-brand studio-mobile-library" data-action="library" aria-label="Back to Music Library"><span>Music Library</span></button>':`<div class="mobile-brand">${logo()}</div>`}<span class="header-label">YOUR MUSIC. YOUR ORBIT.</span><div class="header-right"><span class="local-status"><span class="live-dot"></span> LOCAL WORKSPACE</span><button class="avatar" data-action="settings" aria-label="Workspace settings">B</button></div></header><main id="main-content">${content}</main><footer class="app-footer"><span>Made for the music you love.</span><span>△ &nbsp; ○ &nbsp; □ &nbsp; × <i>Find your rhythm.</i></span></footer></div></div><input type="file" id="audio-file" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg" hidden><input type="file" id="chart-file" accept=".json,application/json" hidden>`;
  app.querySelector<HTMLInputElement>('#audio-file')!.addEventListener('change',e=>{const input=e.target as HTMLInputElement;const file=input.files?.[0];input.value='';if(file)void importAudio(file);});
  app.querySelector<HTMLInputElement>('#chart-file')!.addEventListener('change',e=>{const input=e.target as HTMLInputElement;const file=input.files?.[0];input.value='';if(file)void importJSON(file).catch(e=>toast(storageMessage(e),true));});
}
function songCharts(song: Song) { return charts.filter(c=>c.songId===song.id); }
function chosen(song: Song) { const available=songCharts(song);return available.find(c=>c.chartId===selectedCharts.get(song.id))||available[0]; }
function cover(song: Song, large=false) {
  return `<div class="album-art palette-${song.palette%5} ${large?'large':''}"><div class="art-grid"></div><div class="art-orbit"></div><div class="art-planet"></div><span class="art-symbol">${GLYPHS[song.palette%4]}</span><span class="art-catalog">BO / ${String(song.palette+1).padStart(3,'0')}</span></div>`;
}
function library() {
  page='library'; transport.onEnded=undefined;
  const featured=songs.find(s=>s.id==='demo-lunar')||songs[0],playable=charts.filter(c=>!validatePlayable(c,songs.find(s=>s.id===c.songId)?.durationMs||0).errors.length).length;
  shell('library',`<section class="page-title"><div><span class="eyebrow">A SPACE FOR YOUR SOUND</span><h1>Music Library<span class="title-dot">.</span></h1><p>Your tracks. Your charts. Your next high score.</p></div><button class="button primary" data-action="import-audio">${icon('plus')} Import Music</button></section>
    <section class="hero"><div class="hero-grain"></div><div class="hero-copy"><span class="hero-kicker"><span class="live-dot"></span> MAKE THE MUSIC YOURS</span><h2>FIND YOUR<br>OWN <em>ORBIT.</em></h2><p>Every track has a rhythm.<br>Turn yours into something you can play.</p><div class="hero-buttons"><button class="button primary" data-action="hero-play" ${featured?'':'disabled'}>${icon('play')} Play a demo</button><button class="button hero-secondary" data-action="studio-picker">Explore Orbit Studio ${icon('arrow')}</button></div><span class="hero-note">No account. No uploads. Just press play.</span></div><div class="hero-art" aria-hidden="true"><div class="orbit-glow"></div><div class="hero-ring ring-1"></div><div class="hero-ring ring-2"></div><div class="hero-ring ring-3"></div><div class="hero-ring ring-4"></div><div class="orbit-core"><span>BO</span><small>BEAT / ORBIT</small></div><div class="orbit-node node-triangle">△</div><div class="orbit-node node-circle">○</div><div class="orbit-node node-square">□</div><div class="orbit-node node-cross">×</div><span class="orbit-coordinate coordinate-top">AUDIO SYNC · ACTIVE</span><span class="orbit-coordinate coordinate-bottom">34° 08′ &nbsp; / &nbsp; FIND YOUR FREQUENCY</span><span class="orbit-caption">RHYTHM IS A<br>STATE OF MIND.</span></div><div class="hero-index">01 / YOUR NEXT ORBIT</div></section>
    <section class="library-metrics"><div>${icon('music')}<span><strong>${songs.length.toString().padStart(2,'0')}</strong> tracks in your space</span></div><div>${icon('studio')}<span><strong>${playable.toString().padStart(2,'0')}</strong> playable charts</span></div><div>${icon('trophy')}<span><strong>${results.length.toString().padStart(2,'0')}</strong> completed sessions</span></div><span class="metrics-note">A little rhythm goes a long way.</span></section>
    ${drafts.length?`<section class="recovery-banner">${icon('clock')}<div><strong>You have ${drafts.length} saved draft${drafts.length===1?'':'s'}.</strong><span>Pick up where your rhythm left off.</span></div><button class="button subtle" data-action="recover">Recover a draft ${icon('arrow')}</button></section>`:''}
    <section class="collection"><div class="collection-header"><div class="filter-tabs" role="group" aria-label="Song filter"><button class="${filter==='all'?'active':''}" data-filter="all">All tracks <span>${songs.length}</span></button><button class="${filter==='imported'?'active':''}" data-filter="imported">Imported</button><button class="${filter==='demo'?'active':''}" data-filter="demo">Demo tracks</button></div><div class="collection-tools"><label class="search-field">${icon('search')}<input id="library-search" placeholder="Search your music..." aria-label="Search music" value="${esc(search)}"></label><select id="library-sort" aria-label="Sort music"><option value="recent" ${sort==='recent'?'selected':''}>Recently added</option><option value="title" ${sort==='title'?'selected':''}>Title A–Z</option><option value="duration" ${sort==='duration'?'selected':''}>Duration</option></select></div></div>
    <div class="track-table-heading"><span>TRACK / ARTIST</span><span>DURATION</span><span>CHART</span><span>JUMP IN</span></div><div id="song-list"></div></section>
    <section class="create-callout"><div class="callout-icon">${icon('studio')}</div><div><span class="eyebrow">FROM LISTENER TO CREATOR</span><h3>Your favorite song deserves a chart.</h3><p>Import a track. Place your notes. Make it your own.</p></div><button class="button ghost" data-action="import-audio">Create your first chart ${icon('arrow')}</button><span class="callout-decoration">↗</span></section>
    <div id="preview-player" class="preview-player hidden"></div>`);
  renderSongs();
  app.querySelector('#library-search')!.addEventListener('input',e=>{search=(e.target as HTMLInputElement).value;renderSongs();});
  app.querySelector('#library-sort')!.addEventListener('change',e=>{sort=(e.target as HTMLSelectElement).value;renderSongs();});
  mountPreview();
}
function renderSongs() {
  const list=app.querySelector('#song-list');if(!list)return;
  const visible=songs.filter(s=>(filter==='all'||s.source===filter)&&(s.title+' '+s.artist).toLowerCase().includes(search.toLowerCase())).sort((a,b)=>sort==='title'?a.title.localeCompare(b.title):sort==='duration'?a.durationMs-b.durationMs:b.importedAt.localeCompare(a.importedAt));
  list.innerHTML=visible.length?visible.map(song=>{
    const available=songCharts(song),c=chosen(song),valid=c&&!validatePlayable(c,song.durationMs).errors.length;
    return `<article class="track-row" data-song="${song.id}"><div class="track-identity"><button class="cover-button" data-action="preview" data-id="${song.id}" aria-label="Preview ${esc(song.title)}">${cover(song)}<span class="cover-play">${icon('play')}</span></button><div><h3>${esc(song.title)} ${song.source==='demo'?'<span class="demo-tag">DEMO</span>':''}</h3><p>${esc(song.artist||'Unknown artist')}<span class="track-format">· ${esc(song.format.toUpperCase())}</span></p></div></div><div class="track-duration"><b>${formatTime(song.durationMs)}</b><small>${song.bpm?song.bpm+' BPM':'LOCAL AUDIO'}</small></div><div class="track-chart">${available.length?`<select data-chart-for="${song.id}" class="difficulty-select ${c?.difficulty}" aria-label="Chart for ${esc(song.title)}">${available.map(chart=>`<option value="${chart.chartId}" ${chart.chartId===c?.chartId?'selected':''}>${esc(chart.difficulty.toUpperCase())} · ${chart.notes.length} notes${available.length>1?' · '+esc(chart.name):''}</option>`).join('')}</select>`:'<span class="no-chart">No chart yet</span>'}</div><div class="track-actions"><button class="button play-track" data-action="play-song" data-id="${song.id}" ${valid?'':'disabled'} title="${valid?'Play chart':'Create a valid chart to play'}">${icon('play')}<span>Play</span></button><button class="icon-button edit-track" data-action="edit-song" data-id="${song.id}" title="Open in Orbit Studio" aria-label="Edit ${esc(song.title)}">${icon('studio')}</button><button class="icon-button" data-action="manage-song" data-id="${song.id}" title="Manage song" aria-label="Manage ${esc(song.title)}">${icon('more')}</button></div></article>`;
  }).join(''):`<div class="empty-state">${icon('music')}<h3>${search?'No tracks found.':'Your next favorite track belongs here.'}</h3><p>${search?'Try a different title or artist.':'Import music from your device to start creating.'}</p>${search?'':'<button class="button primary" data-action="import-audio">Import Music</button>'}</div>`;
  list.querySelectorAll<HTMLSelectElement>('[data-chart-for]').forEach(el=>el.addEventListener('change',()=>{selectedCharts.set(el.dataset.chartFor!,el.value);renderSongs();}));
}
async function ensureAudio(song: Song) {
  if(loadedSong===song.id&&transport.currentBuffer)return;
  transport.stop();previewSong=undefined;
  const blob=await repo.audio(song.id);
  if(!blob)throw new Error('Audio is missing. Use Manage song → Relink audio to reconnect the original file.');
  await transport.load(blob);loadedSong=song.id;
}
function mountPreview() {
  const player=app.querySelector<HTMLElement>('#preview-player');
  if(!player||!previewSong)return;
  const song=songs.find(s=>s.id===previewSong);if(!song)return;
  player.classList.remove('hidden');
  player.innerHTML=`<div class="preview-track">${cover(song)}<div><strong>${esc(song.title)}</strong><small>${esc(song.artist)}</small></div></div><button class="icon-button" data-action="toggle-preview" aria-label="Toggle preview">${icon('pause')}</button><span id="preview-time">0:00</span><input id="preview-seek" type="range" min="0" max="${song.durationMs}" step="10" value="${transport.nowMs}" aria-label="Seek preview"><span>${formatTime(song.durationMs)}</span><button class="icon-button" data-action="close-preview" aria-label="Close preview">${icon('close')}</button>`;
  player.querySelector<HTMLInputElement>('#preview-seek')!.addEventListener('input',e=>void transport.seek(Number((e.target as HTMLInputElement).value)).catch(e=>toast(e.message,true)));
}
async function preview(song: Song) {
  await transport.unlock();
  if(previewSong===song.id){if(transport.isPlaying)transport.pause();else await transport.play();return;}
  await ensureAudio(song);previewSong=song.id;await transport.play(0);mountPreview();
}
function previewFrame() {
  if(page==='library'&&previewSong){
    const time=app.querySelector('#preview-time'),seek=app.querySelector<HTMLInputElement>('#preview-seek'),button=app.querySelector('[data-action="toggle-preview"]');
    if(time)time.textContent=formatTime(transport.nowMs);
    if(seek&&document.activeElement!==seek)seek.value=String(transport.nowMs);
    if(button&&button.getAttribute('data-playing')!==String(transport.isPlaying)){button.innerHTML=icon(transport.isPlaying?'pause':'play');button.setAttribute('data-playing',String(transport.isPlaying));}
  }
  requestAnimationFrame(previewFrame);
}
async function leaveStudio() {
  if(!studio)return true;
  if(studio.dirty){
    const answer=await choose('Keep your rhythm?', 'You have changes in Orbit Studio. Save the chart now, or keep a recovery draft before leaving.',[{id:'cancel',label:'Keep editing'},{id:'draft',label:'Keep draft & leave'},{id:'save',label:'Save & leave',kind:'primary'}]);
    if(answer==='cancel')return false;
    if(answer==='save')await studio.save();else await studio.flushDraft();
  }
  await studio.dispose();studio=undefined;return true;
}
async function goLibrary() {
  if(game){game.unmount();game=undefined;}
  if(!(await leaveStudio()))return;
  transport.stop();previewSong=undefined;await refreshData();library();
}
async function openStudio(song: Song, chart?: Chart, recovered?: Draft) {
  if(!(await leaveStudio()))return;
  await transport.unlock();await ensureAudio(song);transport.stop();previewSong=undefined;
  const documentChart=chart||newChart(song);
  studio=new Studio(song,documentChart,transport,repo,c=>void startGame(song,c,true).catch(e=>toast(e.message,true)),()=>{void refreshData();});
  renderStudio();
  const draft=recovered||await repo.draft(documentChart.chartId);
  if(draft){
    const answer=await choose('A rhythm worth returning to.', 'A saved draft is available for this chart. Restore it without replacing your saved version.',[{id:'cancel',label:'Decide later'},{id:'discard',label:'Discard draft'},{id:'restore',label:'Restore draft',kind:'primary'}]);
    if(answer==='restore') {studio.restore(draft.chart);studio.unmount();renderStudio();}
    if(answer==='discard')await repo.deleteDraft(draft.chartId);
  }
}
function renderStudio() {
  page='studio';shell('studio','<div id="studio-mount"></div>');studio!.mount(app.querySelector('#studio-mount')!);
}
async function startGame(song: Song, chart: Chart, playtest=false) {
  const check=validatePlayable(chart,song.durationMs);if(check.errors.length)throw new Error(check.errors[0]);
  await transport.unlock();await ensureAudio(song);transport.stop();previewSong=undefined;
  if(studio)studio.unmount();
  game?.unmount();
  lastChart=clone(chart);lastSong=song;page='play';
  shell('play','<div id="play-mount"></div>');
  game=new PlayView(song,clone(chart),transport,playtest,()=>{
    game?.unmount();game=undefined;
    if(studio){renderStudio();}else{library();}
  },result=>{
    game?.unmount();game=undefined;latestResult=result;resultPlaytest=playtest;
    if(!playtest)void repo.addResult(result).then(refreshData).catch(e=>toast('Result could not be saved: '+storageMessage(e),true));
    renderResults(result,playtest);
  });
  await game.mount(app.querySelector('#play-mount')!);
}
function renderResults(result: Result, playtest: boolean) {
  page='results';
  const grade=result.accuracy>=98?'S':result.accuracy>=90?'A':result.accuracy>=75?'B':result.accuracy>=50?'C':'D';
  shell('play',`<section class="results-view"><span class="eyebrow">${playtest?'STUDIO PLAYTEST':'ORBIT COMPLETE'}</span><h1>Your rhythm, realized.</h1><p>${esc(result.title)} <span>·</span> ${esc(lastChart?.difficulty||'normal')}</p><div class="result-grade grade-${grade.toLowerCase()}">${grade}</div><div class="result-score">${result.score.toLocaleString()}<span>FINAL SCORE</span></div><div class="results-metrics"><div><strong>${result.accuracy.toFixed(2)}<small>%</small></strong><span>ACCURACY</span></div><div><strong>${result.maxCombo}<small>×</small></strong><span>MAX COMBO</span></div></div><div class="judgement-totals">${(['perfect','great','good','miss'] as const).map(j=>`<div class="${j}"><span>${j.toUpperCase()}</span><b>${result[j]}</b></div>`).join('')}</div><p class="small-muted">${playtest?'Playtest results are not added to your session history.':'Saved with chart revision '+result.revision+' · BeatOrbit Standard v1'}</p><div class="result-actions"><button class="button ghost" data-action="result-return">${icon('back')} ${playtest?'Back to Studio':'Music Library'}</button><button class="button primary" data-action="retry">${icon('play')} Play again</button>${playtest?'':'<button class="button ghost" data-action="result-edit">'+icon('studio')+' Edit chart</button>'}</div></section>`);
}
async function importAudio(file: File, relinkSong?: Song) {
  const operation=++importOperation;transport.unload();loadedSong=undefined;previewSong=undefined;
  const loading=modal(relinkSong?'Relink local audio':'Bring your music into orbit',`<div class="processing"><span class="spinner"></span><h3 id="import-stage">Reading file</h3><p>${esc(file.name)}</p><span class="small-muted">Processing on your device. Nothing is uploaded.</span></div>`,'<button class="button ghost" data-cancel>Cancel</button>',()=>{++importOperation;});
  try{
    await transport.unlock();
    loading.querySelector('#import-stage')!.textContent='Processing audio';
    const buffer=await transport.decode(file);
    if(operation!==importOperation)return;
    const duration=buffer.duration*1000;
    const root=modal(relinkSong?'Confirm audio connection':'Audio details',`<div class="import-file-card">${icon('music')}<div><strong>${esc(file.name)}</strong><span>${formatTime(duration)} · ${(file.size/1024/1024).toFixed(1)} MiB · Decoded successfully</span></div><span class="ready-badge">${icon('check')} READY</span></div>
      ${relinkSong?'<p class="muted">This reconnects audio for '+esc(relinkSong.title)+'. Notes are kept exactly as they are. Timing may differ if this is a different recording.</p>':''}
      <label>TITLE<input id="import-title" maxlength="200" value="${esc(relinkSong?.title||file.name.replace(/\.[^.]+$/,'').slice(0,200))}"></label><label>ARTIST<input id="import-artist" maxlength="200" placeholder="Unknown artist" value="${esc(relinkSong?.artist||'')}"></label><label>SUGGESTED BPM <span class="small-muted">(optional; set per chart in Studio)</span><input id="import-bpm" type="number" min="1" max="1000" placeholder="Not detected" value="${relinkSong?.bpm||''}"></label><p class="privacy-note">${icon('shield')} Stored only in this browser. Keep your original audio and export your charts as a backup.</p>`,'<button class="button ghost" data-cancel>Cancel</button><button class="button primary" id="confirm-import">'+icon('check')+' '+(relinkSong?'Relink audio':'Save to library')+'</button>',()=>{++importOperation;});
    root.querySelector('#confirm-import')!.addEventListener('click',async()=>{
      const button=root.querySelector<HTMLButtonElement>('#confirm-import')!,title=root.querySelector<HTMLInputElement>('#import-title')!.value.trim(),bpmValue=root.querySelector<HTMLInputElement>('#import-bpm')!.value;
      const bpm=bpmValue?Number(bpmValue):undefined;
      if(!title||title.length>200||bpm!==undefined&&(!Number.isFinite(bpm)||bpm<1||bpm>1000)){toast('Enter a title and a valid optional BPM (1–1000).',true);return;}
      modalBusy(root,true);button.textContent='Saving…';
      const song: Song={id:relinkSong?.id||uid(),title,artist:root.querySelector<HTMLInputElement>('#import-artist')!.value.trim()||'Unknown artist',durationMs:duration,fileName:file.name,format:file.name.split('.').at(-1)?.toLowerCase()||'audio',fileSize:file.size,importedAt:relinkSong?.importedAt||new Date().toISOString(),source:'imported',bpm,palette:relinkSong?.palette??songs.length};
      try{
        if(relinkSong)await repo.relinkSong(song,file);else await repo.addSong(song,file);
        if(operation!==importOperation)return;
        transport.setBuffer(buffer);loadedSong=song.id;await refreshData();closeModal();library();toast(relinkSong?'Audio reconnected. Review chart validation before playing.':'Music imported. Open Orbit Studio to make it playable.');
        if(!relinkSong){const answer=await choose('Your track is ready.', 'Create a beatmap for '+song.title+' in Orbit Studio.',[{id:'library',label:'Stay in library'},{id:'studio',label:'Open Orbit Studio',kind:'primary'}]);if(answer==='studio')await openStudio(song);}
      }catch(e){toast(storageMessage(e),true);modalBusy(root,false);button.textContent='Try saving again';}
    });
  }catch(e){if(operation!==importOperation)return;closeModal();toast(storageMessage(e),true);}
}
async function importJSON(file: File) {
  if(file.size>LIMITS.jsonBytes)throw new Error('Chart JSON exceeds the 5 MiB limit.');
  let chart: Chart;
  try{chart=parseChart(JSON.parse(await file.text()));}catch(e){throw new Error('Chart import failed: '+(e as Error).message);}
  const available=songs.filter(s=>s.durationMs>=Math.max(...chart.notes.map(n=>n.timeMs+(n.durationMs||0)),0));
  if(!available.length)throw new Error('Import or relink a suitable local audio file first, then import this chart again.');
  const preferred=available.find(s=>s.fileName===chart.audioRef.fileName&&Math.abs(s.durationMs-chart.audioRef.durationMs)<100)||available[0];
  const root=modal('Connect your chart',`<p class="muted"><strong>${esc(chart.name)}</strong> · ${chart.notes.length} notes · ${esc(chart.difficulty)} · ${chart.timing.bpm} BPM</p><p class="small-muted">Audio reference: ${esc(chart.audioRef.fileName)} (${formatTime(chart.audioRef.durationMs)}). Chart JSON does not contain audio.</p><label>LOCAL AUDIO<select id="chart-audio">${available.map(s=>`<option value="${s.id}" ${s.id===preferred.id?'selected':''}>${esc(s.title)} · ${formatTime(s.durationMs)}</option>`).join('')}</select></label><p class="privacy-note">Choose the same recording to keep timing aligned. Import always creates an independent chart.</p>`,'<button class="button ghost" data-cancel>Cancel</button><button class="button primary" id="confirm-chart">Import chart</button>');
  root.querySelector('#confirm-chart')!.addEventListener('click',async()=>{
    const button=root.querySelector<HTMLButtonElement>('#confirm-chart')!;modalBusy(root,true);button.textContent='Saving…';
    try{
      const song=songs.find(s=>s.id===root.querySelector<HTMLSelectElement>('#chart-audio')!.value)!;
      const copy=clone(chart);copy.chartId=uid();copy.songId=song.id;copy.revision=0;copy.audioRef={fileName:song.fileName,durationMs:song.durationMs};
      await repo.saveChart(copy,0);await refreshData();closeModal();library();toast('Chart imported. Open it in Studio to review and playtest.');
    }catch(e){modalBusy(root,false);button.textContent='Import chart';toast(storageMessage(e),true);}
  });
}
function studioPicker() {
  if(studio){if(page!=='studio'){game?.unmount();game=undefined;transport.stop();renderStudio();}return;}
  const root=modal('Find your starting point','<p class="muted">Choose a track to create or continue a beatmap.</p><div class="song-picker">'+songs.map(s=>`<button data-pick="${s.id}">${cover(s)}<span><strong>${esc(s.title)}</strong><small>${esc(s.artist)}</small></span>${icon('arrow')}</button>`).join('')+'</div>','<button class="button ghost" data-cancel>Cancel</button><button class="button primary" id="picker-import">Import Music</button>');
  root.querySelectorAll<HTMLElement>('[data-pick]').forEach(b=>b.addEventListener('click',()=>{const song=songs.find(s=>s.id===b.dataset.pick)!;closeModal();void openStudio(song,chosen(song)).catch(e=>toast(storageMessage(e),true));}));
  root.querySelector('#picker-import')!.addEventListener('click',()=>{closeModal();app.querySelector<HTMLInputElement>('#audio-file')!.click();});
}
function manageSong(song: Song) {
  const related=songCharts(song);
  const root=modal('Your track, your rules',`<div class="manage-song-heading">${cover(song,true)}<div><h3>${esc(song.title)}</h3><p>${esc(song.artist)}</p><span class="small-muted">${formatTime(song.durationMs)} · ${(song.fileSize/1024/1024).toFixed(1)} MiB · ${esc(song.format.toUpperCase())}</span></div></div><label>TITLE<input id="meta-title" maxlength="200" value="${esc(song.title)}"></label><label>ARTIST<input id="meta-artist" maxlength="200" value="${esc(song.artist)}"></label><div class="manage-chart-heading"><h3>Associated charts <span>${related.length}</span></h3><button class="button subtle" id="new-chart">${icon('plus')} New chart</button></div><div class="manage-charts">${related.length?related.map(c=>`<div><span><strong>${esc(c.name)}</strong><small>${esc(c.difficulty)} · ${c.notes.length} notes · revision ${c.revision}</small></span><button class="icon-button" data-manage="edit" data-chart="${c.chartId}" aria-label="Edit chart">${icon('studio')}</button><button class="icon-button" data-manage="export" data-chart="${c.chartId}" aria-label="Export chart">${icon('download')}</button><button class="icon-button" data-manage="duplicate" data-chart="${c.chartId}" aria-label="Duplicate chart">${icon('plus')}</button><button class="icon-button danger" data-manage="delete" data-chart="${c.chartId}" aria-label="Delete chart">${icon('trash')}</button></div>`).join(''):'<p class="small-muted">No charts yet. Your first orbit starts in Studio.</p>'}</div><div class="manage-danger"><button class="button subtle" id="relink-audio">Relink audio</button><button class="button danger" id="delete-song">${icon('trash')} Delete song</button></div>`,'<button class="button ghost" data-cancel>Close</button><button class="button primary" id="save-metadata">Save details</button>');
  root.querySelector('#save-metadata')!.addEventListener('click',async()=>{
    const title=root.querySelector<HTMLInputElement>('#meta-title')!.value.trim();if(!title){toast('A title is required.',true);return;}
    try{await repo.updateSong({...song,title,artist:root.querySelector<HTMLInputElement>('#meta-artist')!.value.trim()||'Unknown artist'});await refreshData();closeModal();library();toast('Track details updated.');}catch(e){toast(storageMessage(e),true);}
  });
  root.querySelector('#new-chart')!.addEventListener('click',()=>{closeModal();void openStudio(song).catch(e=>toast(storageMessage(e),true));});
  root.querySelector('#relink-audio')!.addEventListener('click',()=>{
    const input=document.createElement('input');input.type='file';input.accept='audio/*,.mp3,.m4a,.wav,.aac,.ogg';input.addEventListener('change',()=>{if(input.files?.[0])void importAudio(input.files[0],song);});input.click();
  });
  root.querySelector('#delete-song')!.addEventListener('click',async()=>{
    const answer=await choose('Delete this song?', song.title+' and its '+related.length+' chart(s), drafts, and results will be removed from this browser. Export charts first if you need a backup.',[{id:'cancel',label:'Keep song'},{id:'delete',label:'Delete song',kind:'danger'}]);
    if(answer==='delete'){try{if(loadedSong===song.id){transport.stop();loadedSong=undefined;previewSong=undefined;}await repo.deleteSong(song.id);await refreshData();library();toast('Song and associated charts deleted.');}catch(e){toast(storageMessage(e),true);}}
  });
  root.querySelectorAll<HTMLElement>('[data-manage]').forEach(button=>button.addEventListener('click',async()=>{
    const c=related.find(c=>c.chartId===button.dataset.chart)!;
    try{
      if(button.dataset.manage==='edit'){closeModal();await openStudio(song,c);}
      if(button.dataset.manage==='export')downloadJSON(parseChart(c),song.title+' - '+c.name);
      if(button.dataset.manage==='duplicate'){
        const copy=clone(c);copy.chartId=uid();copy.revision=0;copy.name=(c.name+' copy').slice(0,200);
        const chordIds=new Map<string,string>();copy.notes.forEach(n=>{n.id=uid();if(n.chordId){if(!chordIds.has(n.chordId))chordIds.set(n.chordId,uid());n.chordId=chordIds.get(n.chordId);}});
        await repo.saveChart(copy,0);await refreshData();library();manageSong(song);toast('Independent chart copy created.');
      }
      if(button.dataset.manage==='delete'){
        const answer=await choose('Delete chart?',c.name+' and its saved draft and results will be deleted.',[{id:'cancel',label:'Keep chart'},{id:'delete',label:'Delete chart',kind:'danger'}]);
        if(answer==='delete'){await repo.deleteChart(c.chartId);await refreshData();library();manageSong(song);}
      }
    }catch(e){toast(storageMessage(e),true);}
  }));
}
function guide() {
  modal('A little rhythm goes a long way.',`<div class="guide-symbols">${SYMBOLS.map(symbol=>'<span>'+symbolSVG(symbol)+'</span>').join('')}</div><ol class="guide-steps"><li><strong>Bring your own sound.</strong> Import an audio file, or start with our locally generated demo tracks.</li><li><strong>Make an orbit.</strong> In Studio, set BPM and grid offset, then place Tap, Hold, and Dual notes on the timeline. Save your chart.</li><li><strong>Find the rhythm.</strong> Notes travel from any edge to stationary targets. Tap the matching symbol when the note meets its target. Keep pressing Hold notes until their trail ends.</li><li><strong>Choose either side.</strong> Ordinary notes work on either control bank. Solid Dual symbols need two separate inputs. Matching symbols share one target; its counter shows partial progress. Use both banks for matching Duals. After resuming, press any interrupted Hold again until its end.</li></ol><p class="small-muted">Dual example: ${symbolSVG('triangle',true)} Solid = two inputs. Outline = single input.</p><div class="keyboard-guide"><b>LEFT</b><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><kbd>F</kbd><span> / </span><b>RIGHT</b><kbd>J</kbd><kbd>K</kbd><kbd>L</kbd><kbd>;</kbd></div><p class="small-muted">Perfect ±45 ms · Great ±90 ms · Good ±135 ms. Each note scores 1000 / 700 / 300 / 0. A Hold resolves once; release over 135 ms early counts as a miss.</p><p class="small-muted">Studio: Space to preview · Ctrl/Cmd+Z to undo · Ctrl/Cmd+Shift+Z to redo · Delete to remove selection. Shortcuts are disabled while typing.</p>`,'<button class="button primary" data-cancel>Find my flow '+icon('arrow')+'</button>');
}
async function settings() {
  let estimate: StorageEstimate={};try{estimate=await navigator.storage?.estimate?.()||{};}catch{/* optional */}
  const used=songs.reduce((sum,s)=>sum+s.fileSize,0);
  const root=modal('Your local workspace',`<label>MASTER VOLUME<input id="volume-setting" type="range" min="0" max="1" step=".01" value="${volume}"></label><div class="settings-stat"><span>Audio in your library</span><b>${(used/1024/1024).toFixed(1)} MiB</b></div><div class="settings-stat"><span>Estimated browser usage</span><b>${estimate.usage?(estimate.usage/1024/1024).toFixed(1)+' MiB':'Unavailable'}</b></div><p class="small-muted">Import limits: 64 MiB per file, 10 minutes, and 128 MiB decoded PCM. Decoded audio can use much more memory than its file size.</p><p class="privacy-note">${icon('shield')} Music and charts are stored in this browser, on this device. Clearing site data removes them. Export chart JSON and keep the original audio files.</p><button class="button ghost" id="persist-storage">Request persistent storage</button><p id="persist-status" class="small-muted"></p>`,'<button class="button primary" data-cancel>Done</button>');
  root.querySelector('#volume-setting')!.addEventListener('input',e=>{volume=Number((e.target as HTMLInputElement).value);transport.setVolume(volume);try{localStorage.setItem('beatorbit-volume',String(volume));}catch{/* optional */}});
  root.querySelector('#persist-storage')!.addEventListener('click',async()=>{const status=root.querySelector('#persist-status')!;try{status.textContent=navigator.storage?.persist?(await navigator.storage.persist()?'Persistent storage granted. Manual clearing of site data still removes your library.':'The browser did not grant persistent storage. Keep backups of your charts.'):'Persistent storage is not available in this browser.';}catch{status.textContent='Persistent storage could not be requested.';}});
}
function activity() {
  const sorted=[...results].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  modal('Recent sessions',sorted.length?'<div class="session-list">'+sorted.slice(0,30).map(r=>`<div><span class="session-grade">${r.accuracy>=90?'A':r.accuracy>=75?'B':'C'}</span><div><strong>${esc(r.title)}</strong><small>${new Date(r.createdAt).toLocaleDateString()} · revision ${r.revision} · ${r.accuracy.toFixed(2)}%</small></div><b>${r.score.toLocaleString()}</b></div>`).join('')+'</div>':'<div class="empty-state">'+icon('trophy')+'<h3>Your story starts with a play.</h3><p>Complete a Standard Play session to see it here.</p></div>','<button class="button primary" data-cancel>Back to the music</button>');
}
function recover() {
  const available=drafts.filter(d=>songs.some(s=>s.id===d.chart.songId));
  const root=modal('Pick up your rhythm','<div class="song-picker">'+available.map(d=>`<button data-draft="${d.chartId}"><span><strong>${esc(d.chart.name)}</strong><small>${esc(songs.find(s=>s.id===d.chart.songId)?.title)} · ${new Date(d.savedAt).toLocaleString()}</small></span>${icon('arrow')}</button>`).join('')+'</div>','<button class="button ghost" data-cancel>Cancel</button>');
  root.querySelectorAll<HTMLElement>('[data-draft]').forEach(b=>b.addEventListener('click',()=>{const d=available.find(d=>d.chartId===b.dataset.draft)!;closeModal();void openStudio(songs.find(s=>s.id===d.chart.songId)!,charts.find(c=>c.chartId===d.chartId)||{...d.chart,revision:0},d).catch(e=>toast(storageMessage(e),true));}));
}
app.addEventListener('click',e=>{
  const el=(e.target as HTMLElement).closest<HTMLElement>('[data-action],[data-filter]');if(!el)return;
  e.preventDefault();
  if(el.dataset.filter){filter=el.dataset.filter as typeof filter;library();return;}
  const action=el.dataset.action,song=songs.find(s=>s.id===el.dataset.id);
  void(async()=>{
    if(action==='library')await goLibrary();
    if(action==='studio-picker')studioPicker();
    if(action==='import-audio'){
      if(page==='studio'&&!(await leaveStudio()))return;
      if(game){game.unmount();game=undefined;}
      if(page!=='library'){await refreshData();library();}
      app.querySelector<HTMLInputElement>('#audio-file')!.click();
    }
    if(action==='import-json'){
      if(page==='studio'&&!(await leaveStudio()))return;
      if(game){game.unmount();game=undefined;}
      if(page!=='library'){await refreshData();library();}
      app.querySelector<HTMLInputElement>('#chart-file')!.click();
    }
    if(action==='hero-play'){const demo=songs.find(s=>s.source==='demo'&&chosen(s));if(demo)await startGame(demo,chosen(demo)!);}
    if(action==='preview'&&song)await preview(song);
    if(action==='toggle-preview'){if(transport.isPlaying)transport.pause();else await transport.play();}
    if(action==='close-preview'){transport.stop();previewSong=undefined;app.querySelector('#preview-player')!.classList.add('hidden');}
    if(action==='edit-song'&&song)await openStudio(song,chosen(song));
    if(action==='play-song'&&song&&chosen(song))await startGame(song,chosen(song)!);
    if(action==='manage-song'&&song)manageSong(song);
    if(action==='guide')guide();
    if(action==='settings')await settings();
    if(action==='activity')activity();
    if(action==='recover')recover();
    if(action==='retry'&&lastSong&&lastChart)await startGame(lastSong,lastChart,resultPlaytest);
    if(action==='result-return'){if(studio){renderStudio();}else{await refreshData();library();}}
    if(action==='result-edit'&&lastSong&&lastChart)await openStudio(lastSong,lastChart);
  })().catch(e=>toast(storageMessage(e),true));
});
window.addEventListener('beforeunload',e=>{if(studio?.dirty){e.preventDefault();e.returnValue='';}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&studio)void studio.flushDraft().catch(()=>{});});
let boot: BootSession | undefined;
let previewStarted = false;
async function init() {
  boot?.cancel(); repo.close();
  const session = boot = new BootSession();
  session.signal.addEventListener('abort', () => repo.close(), { once: true });
  const stage = <T>(name: string, work: () => Promise<T>) => {
    const status = app.querySelector('#boot-status'); if (status) status.textContent = name + '…';
    return session.stage(name, work);
  };
  app.innerHTML='<div class="boot-screen"><div class="boot-logo">'+logo()+'</div><span class="spinner"></span><p id="boot-status">Opening your local workspace…</p></div>';
  try{
    await stage('Opening local storage', () => repo.open());
    if(!(await stage('Reading demo settings', () => repo.setting('demo-seeded')))){
      app.querySelector('#boot-status')!.textContent='Creating your original demo tracks…';
      await new Promise(resolve=>setTimeout(resolve,30));
      const configs=[{id:'demo-lunar',title:'Lunar Drift',artist:'BeatOrbit Originals',bpm:112,seconds:64,root:220},{id:'demo-midnight',title:'Midnight Circuit',artist:'BeatOrbit Originals',bpm:128,seconds:72,root:246.94},{id:'demo-afterglow',title:'Afterglow',artist:'BeatOrbit Originals',bpm:96,seconds:58,root:196}];
      const demoSongs:Song[]=[],audio:Blob[]=[],demoCharts:Chart[]=[];
      for(let i=0;i<configs.length;i++){
        const config=configs[i],blob=await stage('Generating demo '+(i+1)+'/3', () => makeDemoAudioAsync(config.bpm,config.seconds,config.root,session.signal));
        const song:Song={id:config.id,title:config.title,artist:config.artist,bpm:config.bpm,durationMs:config.seconds*1000,fileName:config.title+'.wav',format:'wav',fileSize:blob.size,importedAt:'2026-01-01T00:00:0'+(3-i)+'.000Z',source:'demo',palette:i};
        const chart=newChart(song,i===1?'hard':i===2?'easy':'normal');chart.name=['Lunar flow','Circuit run','Golden hour'][i];chart.chartId='chart-'+config.id;chart.revision=1;
        const beat=60000/config.bpm;
        for(let n=0,time=beat*8;time<song.durationMs-4000;n++,time+=beat*(i===2?2:1)){
          const points=[{x:.2,y:.25},{x:.75,y:.25},{x:.5,y:.5},{x:.25,y:.75},{x:.8,y:.7}];
          const layout={...defaultLayout(SYMBOLS[n%4]),target:points[n%points.length],entryAngleDeg:n%8*45};
          if(n%12===8){const chord=uid();chart.notes.push({...layout,id:uid(),symbol:SYMBOLS[n%4],type:'tap',side:'left',timeMs:time,chordId:chord},{...layout,id:uid(),symbol:SYMBOLS[n%4],type:'tap',side:'right',timeMs:time,chordId:chord});}
          else chart.notes.push({...layout,id:uid(),symbol:SYMBOLS[n%4],type:n%10===5?'hold':'tap',side:'either',timeMs:time,...(n%10===5?{durationMs:beat*.7}:{})});
        }
        demoSongs.push(song);audio.push(blob);demoCharts.push(chart);
        await new Promise(resolve=>setTimeout(resolve,0));
      }
      await stage('Saving demos', () => repo.seed(demoSongs,audio,demoCharts));
    }
    const data=await stage('Loading library', () => Promise.all([repo.songs(),repo.charts(),repo.results(),repo.drafts()]));
    if (boot !== session || session.signal.aborted) return;
    [songs,charts,results,drafts]=data;
    library();if(!previewStarted){previewStarted=true;requestAnimationFrame(previewFrame);}
  }catch(e){
    if(boot !== session)return;
    repo.close();
    app.innerHTML=`<div class="boot-screen"><div class="boot-logo">${logo()}</div><h1>Your local workspace could not open.</h1><p>${esc(session.currentStage)}: ${esc(storageMessage(e))}</p><p class="small-muted">Enable browser storage for this site, close older BeatOrbit tabs, and reload. Existing data has not been reset.</p><button class="button primary" id="reload-app">Retry workspace</button></div>`;
    app.querySelector('#reload-app')!.addEventListener('click',()=>void init());
  }finally{session.finish();}
}
void init();
