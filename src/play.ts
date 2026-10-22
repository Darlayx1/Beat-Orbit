import { GLYPHS, SYMBOLS, formatTime, type Chart, type Result, type Song, uid } from './domain';
import { AudioTransport } from './audio';
import { Gameplay, WINDOWS, type Judgement } from './gameplay';
import { esc, icon, toast } from './ui';

const COLORS = ['#b5f578', '#9daaff', '#f6b97b', '#e7a6ed'];
const KEYS = ['KeyA','KeyS','KeyD','KeyF','KeyJ','KeyK','KeyL','Semicolon'];
export class PlayView {
  private game: Gameplay;
  private root?: HTMLElement;
  private canvas?: HTMLCanvasElement;
  private observer?: ResizeObserver;
  private raf = 0;
  private countdown = 0;
  private starting = false;
  private started = false;
  private endedAt = 0;
  private paused = false;
  private done = false;
  private judgement = '';
  private judgeUntil = 0;
  private effect = [0,0,0,0];
  private lookahead = 1600;
  constructor(private song: Song, private chart: Chart, private transport: AudioTransport, private playtest: boolean, private onExit: () => void, private onFinish: (result: Result) => void) {
    this.game = new Gameplay(chart);
    this.game.onJudge = (judge, note) => {
      this.judgement = judge.toUpperCase(); this.judgeUntil = performance.now() + 550;
      this.effect[SYMBOLS.indexOf(note.symbol)] = performance.now() + 170;
    };
  }
  async mount(root: HTMLElement) {
    this.root = root;
    root.innerHTML = `<div class="play-top"><button class="button ghost" data-play="exit">${icon('back')} ${this.playtest ? 'Back to Studio' : 'Song Library'}</button><div class="play-song"><h2>${esc(this.song.title)}</h2><span>${esc(this.song.artist)} <i>·</i> ${esc(this.chart.difficulty)} <i>·</i> ${this.chart.timing.bpm} BPM</span></div><button class="button ghost" data-play="pause">${icon('pause')} Pause</button></div>
      <div class="play-info"><div><span class="eyebrow">SCORE</span><b id="game-score">0000000</b></div><div class="play-mode"><span class="live-dot"></span>${this.playtest ? 'STUDIO PLAYTEST · RESULTS NOT SAVED' : 'STANDARD PLAY'}</div><div class="text-right"><span class="eyebrow">ACCURACY</span><b id="game-accuracy">100.00<span>%</span></b></div></div>
      <div class="game-stage"><div class="game-controls left-controls">${GLYPHS.map((g,i) => `<button class="game-key key-${i}" data-pad="${i}" style="--note-color:${COLORS[i]}" aria-label="Left ${SYMBOLS[i]}">${g}<small>${['A','S','D','F'][i]}</small></button>`).join('')}</div>
      <div class="orbit-stage"><canvas id="game-canvas" aria-label="BeatOrbit gameplay orbit"></canvas><div class="orbit-center"><strong id="combo-number"></strong><span id="combo-label">FEEL THE ORBIT</span><div id="judgement" aria-live="off"></div></div></div>
      <div class="game-controls right-controls">${GLYPHS.map((g,i) => `<button class="game-key key-${i}" data-pad="${i+4}" style="--note-color:${COLORS[i]}" aria-label="Right ${SYMBOLS[i]}">${g}<small>${['J','K','L',';'][i]}</small></button>`).join('')}</div></div>
      <div class="play-bottom"><div><span class="small-muted" id="game-time">0:00</span><div class="game-progress"><div id="game-progress-fill"></div></div><span class="small-muted">${formatTime(this.song.durationMs)}</span></div><p>Tap as notes reach the outer orbit. Hold until the trail ends. <span>Left or right. Find your flow.</span></p></div>
      <div id="game-overlay" class="game-overlay hidden"></div>`;
    this.canvas = root.querySelector('#game-canvas')!;
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(this.canvas.parentElement!); this.resize();
    root.addEventListener('pointerdown', this.down); root.addEventListener('click', this.click);
    window.addEventListener('pointerup', this.up); window.addEventListener('pointercancel', this.cancel);
    window.addEventListener('keydown', this.keydown); window.addEventListener('keyup', this.keyup); window.addEventListener('blur', this.interrupt);
    document.addEventListener('visibilitychange', this.visibility);
    try { await this.start(); } catch(e) { this.pause((e as Error).message); }
    const frame = () => { this.frame(); if (this.root && !this.done) this.raf = requestAnimationFrame(frame); }; frame();
  }
  private resize() {
    if (!this.canvas) return;
    const rect = this.canvas.parentElement!.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1,2);
    this.canvas.width = rect.width*dpr; this.canvas.height = rect.height*dpr;
  }
  private async start() {
    this.transport.stop(); this.transport.onEnded = () => { this.endedAt = performance.now(); }; this.transport.onInterrupted = () => this.pause('Audio was interrupted.');
    await this.transport.unlock();
    this.countdown = performance.now() + 2600; this.starting = false; this.started = false; this.endedAt = 0; this.paused = false; this.done = false;
  }
  unmount() {
    cancelAnimationFrame(this.raf); this.observer?.disconnect(); this.transport.stop(); this.transport.onEnded = undefined; this.transport.onInterrupted = undefined;
    this.root?.removeEventListener('pointerdown', this.down); this.root?.removeEventListener('click', this.click);
    window.removeEventListener('pointerup', this.up); window.removeEventListener('pointercancel', this.cancel); window.removeEventListener('keydown', this.keydown); window.removeEventListener('keyup', this.keyup); window.removeEventListener('blur', this.interrupt); document.removeEventListener('visibilitychange', this.visibility);
    this.done = true; this.root = undefined;
  }
  private get time() { return this.endedAt ? this.song.durationMs + performance.now() - this.endedAt : this.started ? this.transport.nowMs : -Math.max(0,this.countdown-performance.now()); }
  private down = (e: PointerEvent) => {
    const pad = (e.target as HTMLElement).closest<HTMLElement>('[data-pad]'); if (!pad || this.paused || !this.started || this.done) return;
    e.preventDefault(); pad.setPointerCapture(e.pointerId); pad.classList.add('pressed');
    const key = Number(pad.dataset.pad); this.game.press('p'+e.pointerId,SYMBOLS[key%4],key<4?'left':'right',this.transport.eventTimeMs(e.timeStamp,this.time));
  };
  private up = (e: PointerEvent) => { this.game.release('p'+e.pointerId,this.transport.eventTimeMs(e.timeStamp,this.time)); this.root?.querySelectorAll('.pressed').forEach(el => { if (el instanceof HTMLElement && el.hasPointerCapture(e.pointerId)) el.classList.remove('pressed'); }); };
  private cancel = (e: PointerEvent) => { this.game.release('p'+e.pointerId,this.time,true); this.root?.querySelectorAll('.pressed').forEach(el => el.classList.remove('pressed')); };
  private keydown = (e: KeyboardEvent) => {
    if (e.target instanceof Element && e.target.closest('input,textarea,select,[contenteditable="true"]') || document.querySelector('#modal-root')?.childElementCount) return;
    if (e.code === 'Escape') { e.preventDefault(); this.pause(); return; }
    const index = KEYS.indexOf(e.code); if (index<0 || e.repeat || this.paused || !this.started || this.done) return;
    e.preventDefault(); this.root?.querySelector('[data-pad="'+index+'"]')?.classList.add('pressed');
    this.game.press('k'+e.code,SYMBOLS[index%4],index<4?'left':'right',this.transport.eventTimeMs(e.timeStamp,this.time));
  };
  private keyup = (e: KeyboardEvent) => { const index=KEYS.indexOf(e.code); if(index>=0){this.game.release('k'+e.code,this.transport.eventTimeMs(e.timeStamp,this.time));this.root?.querySelector('[data-pad="'+index+'"]')?.classList.remove('pressed');} };
  private click = (e: Event) => {
    const action=(e.target as HTMLElement).closest<HTMLElement>('[data-play]')?.dataset.play;
    if(action==='exit') this.onExit();
    if(action==='pause') this.pause();
    if(action==='restart') {
      this.game = new Gameplay(this.chart); this.game.onJudge = (judge, note) => { this.judgement=judge.toUpperCase();this.judgeUntil=performance.now()+550;this.effect[SYMBOLS.indexOf(note.symbol)]=performance.now()+170; };
      this.root!.querySelector('#game-overlay')!.classList.add('hidden');
      void this.start().catch(e => this.pause(e.message));
    }
  };
  private interrupt = () => { if (!this.done) this.pause('The window lost focus.'); };
  suspend() { this.pause(); }
  private visibility = () => { if(document.hidden) this.interrupt(); };
  private pause(message = 'Take a breath. Your next orbit is waiting.') {
    if (!this.root || this.done || this.paused) return;
    this.paused=true; this.transport.pause(); this.game.cancelInputs(this.time);
    this.root.querySelectorAll('.pressed').forEach(el=>el.classList.remove('pressed'));
    const overlay=this.root.querySelector('#game-overlay')!;
    overlay.classList.remove('hidden'); overlay.innerHTML=`<div class="pause-card panel"><span class="eyebrow">RUN PAUSED</span><h2>Back in your own time.</h2><p>${esc(message)} Restart to begin a clean run without interrupted Holds.</p><button class="button primary" data-play="restart">${icon('play')} Restart run</button><button class="button ghost" data-play="exit">${icon('back')} ${this.playtest?'Back to Studio':'Return to library'}</button></div>`;
  }
  private frame() {
    if (!this.root || !this.canvas || this.done) return;
    const real=performance.now();
    if(!this.paused && !this.started && !this.starting && real>=this.countdown){this.starting=true;void this.transport.play(0).then(()=>{if(!this.done&&!this.paused)this.started=true;}).catch(e=>this.pause(e.message));}
    const time=this.time;
    if(!this.paused&&this.started) this.game.update(time);
    if(!this.paused&&this.endedAt&&time>this.song.durationMs+WINDOWS.good+40){
      this.game.update(this.song.durationMs+WINDOWS.good+1);this.done=true;
      this.onFinish({id:uid(),chartId:this.chart.chartId,revision:this.chart.revision,title:this.song.title,score:this.game.score,accuracy:this.game.accuracy,maxCombo:this.game.maxCombo,...this.game.counts,createdAt:new Date().toISOString()});return;
    }
    this.root.querySelector('#game-score')!.textContent=String(this.game.score).padStart(7,'0');
    const resolved = this.game.counts.perfect + this.game.counts.great + this.game.counts.good + this.game.counts.miss;
    this.root.querySelector('#game-accuracy')!.innerHTML=(resolved ? this.game.score / (resolved * 1000) * 100 : 100).toFixed(2)+'<span>%</span>';
    this.root.querySelector('#combo-number')!.textContent=this.started?(this.game.combo>0?String(this.game.combo):''):String(Math.ceil(Math.max(0,this.countdown-real)/1000)||'GO');
    this.root.querySelector('#combo-label')!.textContent=this.started?(this.game.combo>0?'COMBO':'FEEL THE ORBIT'):'GET READY';
    const judgement=this.root.querySelector<HTMLElement>('#judgement')!;
    judgement.textContent=real<this.judgeUntil?this.judgement:'';judgement.className=this.judgement.toLowerCase();
    this.root.querySelector('#game-time')!.textContent=formatTime(Math.max(0,time));
    this.root.querySelector<HTMLElement>('#game-progress-fill')!.style.width=Math.min(100,Math.max(0,time/this.song.durationMs*100))+'%';
    const dpr=Math.min(devicePixelRatio||1,2),w=this.canvas.width/dpr,h=this.canvas.height/dpr,c=this.canvas.getContext('2d')!;
    c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);
    const cx=w/2,cy=h/2,r=Math.min(w,h)*.39;
    for(let i=1;i<=4;i++){c.beginPath();c.arc(cx,cy,r*i/4,0,Math.PI*2);c.strokeStyle=i===4?'#5d7850':'#1c2a2c';c.lineWidth=i===4?2:1;c.stroke();}
    c.setLineDash([2,8]);c.beginPath();c.arc(cx,cy,r*1.16,0,Math.PI*2);c.strokeStyle='#304036';c.stroke();c.setLineDash([]);
    for(let i=0;i<4;i++){
      const angle=-Math.PI/2+i*Math.PI/2,px=cx+Math.cos(angle)*r,py=cy+Math.sin(angle)*r;
      c.beginPath();c.moveTo(cx+Math.cos(angle)*r*.52,cy+Math.sin(angle)*r*.52);c.lineTo(px,py);c.strokeStyle='#26342c';c.stroke();
      c.beginPath();c.arc(px,py,real<this.effect[i]?22:17,0,Math.PI*2);c.fillStyle='#111a19';c.fill();c.strokeStyle=COLORS[i];c.globalAlpha=real<this.effect[i]?1:.45;c.stroke();c.globalAlpha=1;
      c.fillStyle=COLORS[i];c.font='22px "Segoe UI",sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(GLYPHS[i],px,py);
    }
    for(const n of this.game.notes){
      if(n.timeMs>time+this.lookahead)break;
      if(n.state==='done'||n.timeMs+(n.durationMs||0)<time-180)continue;
      const lane=SYMBOLS.indexOf(n.symbol),angle=-Math.PI/2+lane*Math.PI/2+(n.side==='left'?-.12:n.side==='right'?.12:0),progress=1-(n.timeMs-time)/this.lookahead,rad=r*Math.max(.13,Math.min(1.18,progress));
      if(n.type==='hold'){
        const tail=r*Math.max(.13,Math.min(1,1-(n.timeMs+n.durationMs!-time)/this.lookahead));
        c.lineWidth=7;c.strokeStyle=COLORS[lane];c.globalAlpha=.4;c.beginPath();c.moveTo(cx+Math.cos(angle)*tail,cy+Math.sin(angle)*tail);c.lineTo(cx+Math.cos(angle)*(n.state==='holding'?r:rad),cy+Math.sin(angle)*(n.state==='holding'?r:rad));c.stroke();c.globalAlpha=1;c.lineWidth=1;
      }
      const px=cx+Math.cos(angle)*(n.state==='holding'?r:rad),py=cy+Math.sin(angle)*(n.state==='holding'?r:rad);
      c.shadowColor=COLORS[lane];c.shadowBlur=12;c.fillStyle=COLORS[lane];c.font='bold '+Math.max(15,24*Math.max(.5,progress))+'px "Segoe UI",sans-serif';c.fillText(GLYPHS[lane],px,py);c.shadowBlur=0;
      if(n.side!=='either'){c.font='9px "Segoe UI",sans-serif';c.fillText(n.side==='left'?'L':'R',px+17,py);}
    }
  }
}
