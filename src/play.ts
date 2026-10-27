import { GLYPHS, SYMBOLS, formatTime, type Chart, type Result, type Song, uid } from './domain';
import { HIT_PRESETS, AudioTransport, type HitPreset } from './audio';
import { Gameplay, WINDOWS, type Feedback, type Judgement } from './gameplay';
import { esc, icon } from './ui';
import { COLORS, drawStage, groupNotes, stageScale, symbolSVG, targetPoint, type NoteGroup } from './stage';

const KEYS = ['KeyA','KeyS','KeyD','KeyF','KeyJ','KeyK','KeyL','Semicolon'];
const JUDGE_COLORS: Record<Judgement, string> = {
  perfect: '#35d9a8',
  great: '#6b95f5',
  good: '#ffd166',
  miss: '#ff6b6b'
};
const WRONG_COLOR = '#ffb454';
const GRADES = ['D', 'C', 'B', 'A', 'S'];
const GRADE_COLORS: Record<string, string> = { S: '#2fd6a1', A: '#5b8def', B: '#ec66a2', C: '#ffc857', D: '#ff5d5d' };
const gradeOf = (pct: number) => pct >= 98 ? 'S' : pct >= 90 ? 'A' : pct >= 75 ? 'B' : pct >= 50 ? 'C' : 'D';
type HitEffect = { note: Chart['notes'][number]; judge: Judgement; label: string; wrong: boolean; combo: number; start: number; until: number };

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
  private groups: NoteGroup[] = [];
  private effects: HitEffect[] = [];
  private lastGrade = 'D';
  private lastCount = '';
  private glowTimer?: ReturnType<typeof setTimeout>;
  constructor(private song: Song, private chart: Chart, private transport: AudioTransport, private playtest: boolean, private onExit: () => void, private onFinish: (result: Result) => void) {
    this.game = new Gameplay(chart); this.groups = groupNotes(this.game.notes);
    this.bindJudge();
  }
  private get sfx() { return this.transport.sfx; }
  private bindJudge() {
    this.game.onJudge = (judge, note, part, feedback: Feedback = judge) => {
      const now = performance.now(), wrong = feedback.endsWith('?');
      this.effects.push({ note, judge, label: feedback.toUpperCase(), wrong, combo: this.game.combo, start: now, until: now + 620 });
      this.sfx.hit(wrong ? 'wrong' : judge, note.symbol, part === 'tail' ? .7 : 1);
    };
    this.game.onHold = (note, active) => { if (active) this.sfx.startHold(note.id, note.symbol); else this.sfx.stopHold(note.id); };
  }
  async mount(root: HTMLElement) {
    this.root = root;
    root.innerHTML = `<div class="game-stage"><div class="play-top"><button class="icon-button pause-btn" data-play="pause" aria-label="Pause" title="Pause">${icon('pause')}</button><div class="play-song"><h2>${esc(this.song.title)}</h2><span class="play-difficulty diff-${esc(this.chart.difficulty)}">${esc(this.chart.difficulty)}</span></div><div class="play-score"><span class="eyebrow">SCORE</span><b id="game-score">0000000</b></div></div>
      <div class="game-controls left-controls">${GLYPHS.map((_,i) => `<button class="game-key key-${i}" data-pad="${i}" style="--note-color:${COLORS[i]}" aria-label="Left ${SYMBOLS[i]}">${symbolSVG(SYMBOLS[i])}<small>${['A','S','D','F'][i]}</small></button>`).join('')}</div>
      <div class="orbit-stage"><canvas id="game-canvas" aria-label="BeatOrbit performance stage"></canvas></div><div class="orbit-center"><strong id="combo-number"></strong></div>
      <div class="game-controls right-controls">${GLYPHS.map((_,i) => `<button class="game-key key-${i}" data-pad="${i+4}" style="--note-color:${COLORS[i]}" aria-label="Right ${SYMBOLS[i]}">${symbolSVG(SYMBOLS[i])}<small>${['J','K','L',';'][i]}</small></button>`).join('')}</div>
      <div class="play-bottom"><div class="grade-progress-row" style="--grade-color:${GRADE_COLORS.D}"><span class="grade-badge grade-d" id="game-grade">D</span><div class="game-progress"><div id="game-progress-fill"></div><i class="grade-tick" style="left:50%" data-tier="C"></i><i class="grade-tick" style="left:75%" data-tier="B"></i><i class="grade-tick" style="left:90%" data-tier="A"></i><i class="grade-tick" style="left:98%" data-tier="S"></i></div><b id="game-accuracy">0.00<span>%</span></b></div></div>
      <div id="game-overlay" class="game-overlay hidden"></div></div>`;
    this.canvas = root.querySelector('#game-canvas')!;
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(this.canvas.parentElement!); this.resize();
    root.addEventListener('pointerdown', this.down); root.addEventListener('click', this.click);
    root.addEventListener('input', this.mix); root.addEventListener('change', this.mixPreview);
    window.addEventListener('pointerup', this.up); window.addEventListener('pointercancel', this.cancel);
    window.addEventListener('keydown', this.keydown); window.addEventListener('keyup', this.keyup); window.addEventListener('blur', this.interrupt);
    window.addEventListener('resize', this.orient);
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
    this.countdown = performance.now() + 2600; this.starting = false; this.started = false; this.endedAt = 0; this.paused = false; this.done = false; this.lastCount = '';
  }
  unmount() {
    cancelAnimationFrame(this.raf); clearTimeout(this.glowTimer); this.observer?.disconnect(); this.transport.stop(); this.transport.onEnded = undefined; this.transport.onInterrupted = undefined;
    this.sfx.stopAllHolds();
    this.root?.removeEventListener('pointerdown', this.down); this.root?.removeEventListener('click', this.click);
    this.root?.removeEventListener('input', this.mix); this.root?.removeEventListener('change', this.mixPreview);
    window.removeEventListener('pointerup', this.up); window.removeEventListener('pointercancel', this.cancel); window.removeEventListener('keydown', this.keydown); window.removeEventListener('keyup', this.keyup); window.removeEventListener('blur', this.interrupt); window.removeEventListener('resize', this.orient); document.removeEventListener('visibilitychange', this.visibility);
    this.done = true; this.root = undefined;
  }
  // Audio clock minus the user's calibration offset, so visuals and judgement shift together.
  private get time() { return this.paused ? this.pausedTime : this.endedAt ? this.song.durationMs + performance.now() - this.endedAt : this.started ? this.transport.nowMs - this.transport.settings.offsetMs : -Math.max(0,this.countdown-performance.now()); }
  private down = (e: PointerEvent) => {
    const pad = (e.target as HTMLElement).closest<HTMLElement>('[data-pad]'); if (!pad || this.paused || !this.started || this.done) return;
    e.preventDefault(); pad.setPointerCapture(e.pointerId); pad.classList.add('pressed');
    const key = Number(pad.dataset.pad); this.game.press('p'+e.pointerId,SYMBOLS[key%4],key<4?'left':'right',this.transport.eventTimeMs(e.timeStamp,this.time));
  };
  private up = (e: PointerEvent) => { this.game.release('p'+e.pointerId,this.transport.eventTimeMs(e.timeStamp,this.time)); this.root?.querySelectorAll('.pressed').forEach(el => { if (el instanceof HTMLElement && el.hasPointerCapture(e.pointerId)) el.classList.remove('pressed'); }); };
  private cancel = (e: PointerEvent) => { this.game.release('p'+e.pointerId,this.time,true); this.root?.querySelectorAll('.pressed').forEach(el => el.classList.remove('pressed')); };
  private keydown = (e: KeyboardEvent) => {
    if (document.querySelector('#modal-root')?.childElementCount) return;
    if (e.code === 'Escape') { e.preventDefault(); if (this.paused) this.resume(); else this.pause(); return; }
    if (e.target instanceof Element && e.target.closest('input,textarea,select,[contenteditable="true"]')) return;
    const index = KEYS.indexOf(e.code); if (index<0 || e.repeat || this.paused || !this.started || this.done) return;
    e.preventDefault(); this.root?.querySelector('[data-pad="'+index+'"]')?.classList.add('pressed');
    this.game.press('k'+e.code,SYMBOLS[index%4],index<4?'left':'right',this.transport.eventTimeMs(e.timeStamp,this.time));
  };
  private keyup = (e: KeyboardEvent) => { const index=KEYS.indexOf(e.code); if(index>=0){this.game.release('k'+e.code,this.transport.eventTimeMs(e.timeStamp,this.time));this.root?.querySelector('[data-pad="'+index+'"]')?.classList.remove('pressed');} };
  private resume() {
    if (this.resuming) return;
    this.resuming = true;
    void this.transport.unlock().then(async()=>{
      if(!this.root||this.done)return;
      if(!this.started){await this.start();}else{if(this.endedAt)this.endedAt=performance.now()-(this.pausedTime-this.song.durationMs);else await this.transport.play();this.paused=false;}
      this.sfx.ui('close');
      this.root?.querySelector('#game-overlay')?.classList.add('hidden');
    }).catch(e=>{this.paused=false;this.pause(e.message);}).finally(()=>{this.resuming=false;});
  }
  private click = (e: Event) => {
    const action=(e.target as HTMLElement).closest<HTMLElement>('[data-play]')?.dataset.play;
    if(action && action !== 'resume') this.sfx.ui(action === 'pause' ? 'open' : 'click');
    if(action==='exit') this.onExit();
    if(action==='pause') this.pause();
    if(action==='resume') this.resume();
    if(action==='restart') {
      this.sfx.stopAllHolds();
      this.game = new Gameplay(this.chart); this.groups = groupNotes(this.game.notes); this.effects = []; this.bindJudge(); this.lastGrade = 'D';
      this.root!.querySelector('#game-overlay')!.classList.add('hidden');
      void this.start().catch(e => this.pause(e.message));
    }
  };
  // Quick mixer inside the pause card shares its persisted settings with the Settings dialog.
  private mix = (e: Event) => {
    const el = e.target as HTMLInputElement | HTMLSelectElement, key = el.dataset.mix; if (!key) return;
    if (key === 'hitPreset') this.transport.updateSettings({ hitPreset: el.value as HitPreset });
    else if (key === 'music' || key === 'sfx') {
      this.transport.updateSettings({ [key]: Number(el.value) });
      const out = el.parentElement?.querySelector('output'); if (out) out.textContent = Math.round(Number(el.value) * 100) + '%';
    }
  };
  private mixPreview = (e: Event) => { const key = (e.target as HTMLElement).dataset.mix; if (key === 'sfx' || key === 'hitPreset') this.sfx.hit('perfect', 0); };
  private interrupt = () => { if (!this.done) this.pause('The window lost focus.'); };
  private orient = () => { if (!this.done && window.innerHeight > window.innerWidth) this.pause('BeatOrbit needs a widescreen view. Rotate your device to continue.'); };
  suspend() { this.pause(); }
  private visibility = () => { if(document.hidden) this.interrupt(); };
  private pause(message = 'Take a breath. Your next orbit is waiting.') {
    if (!this.root || this.done || this.paused) return;
    this.pausedTime=this.time; this.paused=true; this.transport.pause(); this.game.suspendInputs(); this.sfx.stopAllHolds();
    this.root.querySelectorAll('.pressed').forEach(el=>el.classList.remove('pressed'));
    const s = this.transport.settings, pct = Math.min(100, Math.max(0, this.game.accuracy)), grade = gradeOf(pct), played = Math.max(0, Math.min(this.song.durationMs, this.pausedTime));
    const overlay=this.root.querySelector('#game-overlay')!;
    overlay.classList.remove('hidden');
    overlay.innerHTML=`<div class="pause-panel" role="dialog" aria-modal="true" aria-label="Run paused">
      <header class="pause-head"><span class="eyebrow">RUN PAUSED</span><h2>Back in your own time.</h2><p>${esc(message)} Resume when ready, or restart for a fresh run.</p></header>
      <div class="pause-meta"><strong>${esc(this.song.title)}</strong><span class="play-difficulty diff-${esc(this.chart.difficulty)}">${esc(this.chart.difficulty)}</span><span class="pause-clock">${formatTime(played)} / ${formatTime(this.song.durationMs)}</span></div>
      <div class="pause-track"><i style="width:${(played / this.song.durationMs * 100).toFixed(1)}%"></i></div>
      <div class="pause-stats"><div><small>SCORE</small><b>${String(this.game.score).padStart(7,'0')}</b></div><div><small>ACCURACY</small><b>${pct.toFixed(2)}<span>%</span></b></div><div><small>COMBO</small><b>${this.game.combo}</b></div><div class="pause-grade" style="--grade-color:${GRADE_COLORS[grade]}"><small>GRADE</small><b>${grade}</b></div></div>
      <div class="pause-mixer"><label><span>MUSIC</span><input type="range" min="0" max="1" step=".01" value="${s.music}" data-mix="music" aria-label="Music volume"><output>${Math.round(s.music*100)}%</output></label><label><span>EFFECTS</span><input type="range" min="0" max="1" step=".01" value="${s.sfx}" data-mix="sfx" aria-label="Effects volume"><output>${Math.round(s.sfx*100)}%</output></label><label class="pause-select"><span>HIT SOUND</span><select data-mix="hitPreset" aria-label="Hit sound">${HIT_PRESETS.map(p=>`<option value="${p.id}" ${p.id===s.hitPreset?'selected':''}>${p.label}</option>`).join('')}</select></label></div>
      <div class="pause-actions"><button class="button primary" data-play="resume">${icon('play')} Resume run</button><button class="button ghost" data-play="restart">Restart run</button><button class="button ghost" data-play="exit">${icon('back')} ${this.playtest?'Back to Studio':'Return to library'}</button></div>
      <p class="pause-hint"><kbd>Esc</kbd> resume · Hold notes can be pressed again after resuming</p></div>`;
    overlay.querySelector<HTMLElement>('[data-play="resume"]')?.focus({ preventScroll: true });
  }
  private frame() {
    if (!this.root || !this.canvas || this.done) return;
    const real=performance.now();
    if(!this.paused && !this.started && !this.starting && real>=this.countdown){this.starting=true;void this.transport.play(0).then(()=>{if(!this.done&&!this.paused)this.started=true;}).catch(e=>this.pause(e.message));}
    const time=this.time;
    if(!this.paused&&this.started) this.game.update(time);
    if(!this.paused&&this.endedAt&&time>this.song.durationMs+WINDOWS.good+40){
      this.game.update(this.song.durationMs+WINDOWS.good+1);this.done=true;this.sfx.stopAllHolds();
      this.onFinish({id:uid(),chartId:this.chart.chartId,revision:this.chart.revision,title:this.song.title,score:this.game.score,accuracy:this.game.accuracy,maxCombo:this.game.maxCombo,...this.game.counts,createdAt:new Date().toISOString()});return;
    }
    this.root.querySelector('#game-score')!.textContent=String(this.game.score).padStart(7,'0');
    const pct = Math.min(100, Math.max(0, this.game.accuracy)), grade = gradeOf(pct);
    const gradeEl = this.root.querySelector<HTMLElement>('#game-grade')!, row = this.root.querySelector<HTMLElement>('.grade-progress-row')!;
    gradeEl.textContent = grade;
    gradeEl.className = 'grade-badge grade-' + grade.toLowerCase();
    row.style.setProperty('--grade-color', GRADE_COLORS[grade]);
    if (grade !== this.lastGrade) {
      // Grade change: the solid bar swaps color and glows briefly.
      if (GRADES.indexOf(grade) > GRADES.indexOf(this.lastGrade) && !this.paused) this.sfx.gradeUp(GRADES.indexOf(grade) - 1);
      this.lastGrade = grade;
      row.classList.remove('grade-glow'); void row.offsetWidth; row.classList.add('grade-glow');
      clearTimeout(this.glowTimer); this.glowTimer = setTimeout(() => row.classList.remove('grade-glow'), 1000);
    }
    this.root.querySelector('#game-accuracy')!.innerHTML=pct.toFixed(2)+'<span>%</span>';
    this.root.querySelector<HTMLElement>('#game-progress-fill')!.style.width=pct+'%';
    const label = this.started ? '' : String(Math.ceil(Math.max(0,this.countdown-real)/1000)||'GO');
    if (label !== this.lastCount) {
      this.lastCount = label;
      const center = this.root.querySelector<HTMLElement>('#combo-number')!;
      center.textContent = label;
      center.style.animation = 'none'; void center.offsetWidth; center.style.animation = '';
      if (label && !this.paused) this.sfx.countdown(label === 'GO' ? 'go' : Number(label));
    }
    const dpr=Math.min(devicePixelRatio||1,2),w=this.canvas.width/dpr,h=this.canvas.height/dpr,c=this.canvas.getContext('2d')!;
    c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);
    drawStage(c,w,h,this.groups,time,undefined,false);
    this.drawEffects(c,w,h,real);
  }
  private drawEffects(c: CanvasRenderingContext2D, w: number, h: number, real: number) {
    this.effects=this.effects.filter(effect=>effect.until>real);
    const u = stageScale(w, h);
    for(const effect of this.effects){
      const p=targetPoint(effect.note,w,h);
      const color=COLORS[SYMBOLS.indexOf(effect.note.symbol)];
      const judgeColor=effect.wrong?WRONG_COLOR:JUDGE_COLORS[effect.judge];
      const progress=Math.max(0,Math.min(1,(real-effect.start)/(effect.until-effect.start)));

      // Soft impact ring and short sparks; wrong presses and misses stay quiet.
      if (!effect.wrong && effect.judge !== 'miss' && progress < 0.5) {
        const burst = progress / 0.5;
        c.strokeStyle = color; c.globalAlpha = (1 - burst) * 0.8; c.lineWidth = 2.6 * u * (1 - burst * 0.5);
        c.beginPath(); c.arc(p.x, p.y, (19 + burst * 24) * u, 0, Math.PI * 2); c.stroke();
        c.strokeStyle = judgeColor; c.lineWidth = 1.8 * u;
        for (let k = 0; k < 8; k++) {
          const angle = (k * Math.PI) / 4 + burst * 0.25, r1 = (19 + burst * 12) * u, r2 = (25 + burst * 20) * u;
          c.beginPath(); c.moveTo(p.x + Math.cos(angle) * r1, p.y + Math.sin(angle) * r1); c.lineTo(p.x + Math.cos(angle) * r2, p.y + Math.sin(angle) * r2); c.stroke();
        }
      }

      // Floating judgement (+ combo) above the target; wrong presses wobble.
      const textAlpha = progress < 0.65 ? 1 : (1 - progress) / 0.35;
      const baseY = p.y > 62 * u ? p.y - 34 * u - progress * 16 : p.y + 44 * u - progress * 6;
      const shake = effect.wrong ? Math.sin(progress * 38) * 3 * (1 - progress) : 0;
      c.globalAlpha = Math.max(0, Math.min(1, textAlpha));
      c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      if (effect.combo > 0 && !effect.wrong) {
        c.font = `800 ${Math.round(14 * u + 3)}px "Barlow Condensed", "Arial Narrow", sans-serif`;
        c.fillStyle = '#ffffff';
        c.fillText(`${effect.combo} COMBO`, p.x, baseY - 14 * u - 2);
      }
      c.font = `700 ${Math.round(10 * u + 3)}px "DM Sans", "Segoe UI", sans-serif`;
      c.fillStyle = judgeColor;
      c.fillText(effect.label, p.x + shake, baseY);
      c.globalAlpha = 1;
    }
  }
}
