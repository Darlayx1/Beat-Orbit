import { GLYPHS, SYMBOLS, formatTime, type Chart, type Result, type Song, uid } from './domain';
import { AudioTransport } from './audio';
import { Gameplay, WINDOWS, type Judgement } from './gameplay';
import { esc, icon } from './ui';
import { COLORS, drawStage, groupNotes, symbolSVG, targetPoint, type NoteGroup } from './stage';

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
  private pausedTime = 0;
  private resuming = false;
  private done = false;
  private judgement = '';
  private judgeUntil = 0;
  private groups: NoteGroup[] = [];
  private effects: { note: Chart['notes'][number]; until: number }[] = [];
  constructor(private song: Song, private chart: Chart, private transport: AudioTransport, private playtest: boolean, private onExit: () => void, private onFinish: (result: Result) => void) {
    this.game = new Gameplay(chart); this.groups = groupNotes(this.game.notes);
    this.game.onJudge = (judge, note) => {
      this.judgement = judge.toUpperCase(); this.judgeUntil = performance.now() + 550;
      this.effects.push({ note, until: performance.now() + 170 });
    };
  }
  async mount(root: HTMLElement) {
    this.root = root;
    root.innerHTML = `<div class="game-stage"><div class="play-top"><button class="button ghost" data-play="exit" aria-label="${this.playtest ? 'Back to Studio' : 'Song Library'}">${icon('back')} <span>${this.playtest ? 'Back to Studio' : 'Song Library'}</span></button><div class="play-song"><h2>${esc(this.song.title)}</h2><span>${esc(this.song.artist)} <i>·</i> ${esc(this.chart.difficulty)} <i>·</i> ${this.chart.timing.bpm} BPM</span></div><button class="button ghost" data-play="pause" aria-label="Pause">${icon('pause')} <span>Pause</span></button></div>
      <div class="play-info"><div><span class="eyebrow">SCORE</span><b id="game-score">0000000</b></div><div class="play-mode"><span class="live-dot"></span>${this.playtest ? 'STUDIO PLAYTEST · RESULTS NOT SAVED' : 'STANDARD PLAY'}</div><div class="text-right"><span class="eyebrow">ACCURACY</span><b id="game-accuracy">100.00<span>%</span></b></div></div>
      <div class="game-controls left-controls">${GLYPHS.map((g,i) => `<button class="game-key key-${i}" data-pad="${i}" style="--note-color:${COLORS[i]}" aria-label="Left ${SYMBOLS[i]}">${symbolSVG(SYMBOLS[i])}<small>${['A','S','D','F'][i]}</small></button>`).join('')}</div>
      <div class="orbit-stage"><canvas id="game-canvas" aria-label="BeatOrbit performance stage"></canvas></div><div class="orbit-center"><strong id="combo-number"></strong><span id="combo-label">FEEL THE ORBIT</span><div id="judgement" aria-live="off"></div></div>
      <div class="game-controls right-controls">${GLYPHS.map((g,i) => `<button class="game-key key-${i}" data-pad="${i+4}" style="--note-color:${COLORS[i]}" aria-label="Right ${SYMBOLS[i]}">${symbolSVG(SYMBOLS[i])}<small>${['J','K','L',';'][i]}</small></button>`).join('')}</div>
      <div class="play-bottom"><div><span class="small-muted" id="game-time">0:00</span><div class="game-progress"><div id="game-progress-fill"></div></div><span class="small-muted">${formatTime(this.song.durationMs)}</span></div></div>
      <div id="game-overlay" class="game-overlay hidden"></div></div>`;
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
    if(!this.root)return;
    this.countdown = performance.now() + 2600; this.starting = false; this.started = false; this.endedAt = 0; this.paused = false; this.done = false;
  }
  unmount() {
    cancelAnimationFrame(this.raf); this.observer?.disconnect(); this.transport.stop(); this.transport.onEnded = undefined; this.transport.onInterrupted = undefined;
    this.root?.removeEventListener('pointerdown', this.down); this.root?.removeEventListener('click', this.click);
    window.removeEventListener('pointerup', this.up); window.removeEventListener('pointercancel', this.cancel); window.removeEventListener('keydown', this.keydown); window.removeEventListener('keyup', this.keyup); window.removeEventListener('blur', this.interrupt); document.removeEventListener('visibilitychange', this.visibility);
    this.done = true; this.root = undefined;
  }
  private get time() { return this.paused ? this.pausedTime : this.endedAt ? this.song.durationMs + performance.now() - this.endedAt : this.started ? this.transport.nowMs : -Math.max(0,this.countdown-performance.now()); }
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
    if(action==='resume' && !this.resuming) {
      this.resuming=true;
      void this.transport.unlock().then(async()=>{
        if(!this.root||this.done)return;
        if(!this.started){await this.start();}else{if(this.endedAt)this.endedAt=performance.now()-(this.pausedTime-this.song.durationMs);else await this.transport.play();this.paused=false;}
        this.root?.querySelector('#game-overlay')?.classList.add('hidden');
      }).catch(e=>{this.paused=false;this.pause(e.message);}).finally(()=>{this.resuming=false;});
    }
    if(action==='restart') {
      this.game = new Gameplay(this.chart); this.groups = groupNotes(this.game.notes); this.effects = []; this.game.onJudge = (judge, note) => { this.judgement=judge.toUpperCase();this.judgeUntil=performance.now()+550;this.effects.push({note,until:performance.now()+170}); };
      this.root!.querySelector('#game-overlay')!.classList.add('hidden');
      void this.start().catch(e => this.pause(e.message));
    }
  };
  private interrupt = () => { if (!this.done) this.pause('The window lost focus.'); };
  suspend() { this.pause(); }
  private visibility = () => { if(document.hidden) this.interrupt(); };
  private pause(message = 'Take a breath. Your next orbit is waiting.') {
    if (!this.root || this.done || this.paused) return;
    this.pausedTime=this.time; this.paused=true; this.transport.pause(); this.game.suspendInputs();
    this.root.querySelectorAll('.pressed').forEach(el=>el.classList.remove('pressed'));
    const overlay=this.root.querySelector('#game-overlay')!;
    overlay.classList.remove('hidden'); overlay.innerHTML=`<div class="pause-card panel"><span class="eyebrow">RUN PAUSED</span><h2>Back in your own time.</h2><p>${esc(message)} Resume when ready, or restart for a fresh run.</p><button class="button primary" data-play="resume">Resume run</button><button class="button ghost" data-play="restart">${icon('play')} Restart run</button><button class="button ghost" data-play="exit">${icon('back')} ${this.playtest?'Back to Studio':'Return to library'}</button></div>`;
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
    drawStage(c,w,h,this.groups,time,undefined,false);
    this.effects=this.effects.filter(effect=>effect.until>real);
    for(const effect of this.effects){const p=targetPoint(effect.note,w,h);c.strokeStyle=COLORS[SYMBOLS.indexOf(effect.note.symbol)];c.globalAlpha=(effect.until-real)/170;c.lineWidth=2;c.beginPath();c.arc(p.x,p.y,25+(1-c.globalAlpha)*12,0,Math.PI*2);c.stroke();c.globalAlpha=1;}
  }
}
