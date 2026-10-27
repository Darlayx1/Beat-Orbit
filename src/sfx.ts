import type { AudioTransport } from './audio';
import { SYMBOLS, type SymbolName } from './domain';

// Every sound is synthesised locally with Web Audio. No sample files, uploads or network requests.
export type HitKind = 'perfect' | 'great' | 'good' | 'miss' | 'wrong';
export type UiSound = 'click' | 'open' | 'close' | 'confirm' | 'tick';
type ToneOptions = { type?: OscillatorType; from: number; to?: number; dur: number; vol: number; at?: number; attack?: number; filter?: { type: BiquadFilterType; freq: number } };
type Sustain = { oscillators: OscillatorNode[]; gain: GainNode };
// Pentatonic-ish offsets keep each symbol recognisable without sounding like a melody.
const RATIOS = [1, 1.122, 1.26, 1.498];
const KIND_PITCH: Record<HitKind, number> = { perfect: 1, great: .9, good: .75, miss: 1, wrong: 1 };
const KIND_LEVEL: Record<HitKind, number> = { perfect: .5, great: .42, good: .32, miss: .36, wrong: .42 };

export class SoundBank {
  private noise?: AudioBuffer;
  private sustains = new Map<string, Sustain>();
  constructor(private transport: AudioTransport) {}

  private run(bus: 'sfx' | 'ui', play: (ctx: AudioContext, out: AudioNode, now: number) => void) {
    try {
      const settings = this.transport.settings;
      if (settings.muted || (bus === 'sfx' ? settings.sfx : settings.ui) <= 0) return;
      const ctx = this.transport.ctx;
      if (ctx.state !== 'running' || typeof ctx.createOscillator !== 'function') return;
      play(ctx, this.transport.bus(bus), ctx.currentTime);
    } catch { /* sound is optional and must never interrupt play */ }
  }
  private tone(ctx: AudioContext, out: AudioNode, now: number, o: ToneOptions) {
    const t = now + (o.at || 0), osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.from, t);
    if (o.to && o.to !== o.from) osc.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(o.vol, t + (o.attack ?? .004));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    let head: AudioNode = osc;
    if (o.filter) { const f = ctx.createBiquadFilter(); f.type = o.filter.type; f.frequency.value = o.filter.freq; osc.connect(f); head = f; }
    head.connect(gain); gain.connect(out);
    osc.start(t); osc.stop(t + o.dur + .03);
  }
  private tick(ctx: AudioContext, out: AudioNode, now: number, freq: number, dur: number, vol: number, at = 0) {
    if (!this.noise) {
      const length = Math.floor(ctx.sampleRate * .25), buffer = ctx.createBuffer(1, length, ctx.sampleRate), data = buffer.getChannelData(0);
      let seed = 12345;
      for (let i = 0; i < length; i++) { seed = (seed * 16807) % 2147483647; data[i] = seed / 2147483647 * 2 - 1; }
      this.noise = buffer;
    }
    const t = now + at, src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    src.buffer = this.noise; filter.type = 'bandpass'; filter.frequency.value = freq; filter.Q.value = 1.2;
    gain.gain.setValueAtTime(vol, t); gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter); filter.connect(gain); gain.connect(out);
    src.start(t); src.stop(t + dur + .02);
  }

  /** Note hit, hold head/tail, miss, or a wrong-symbol press. `scale` softens secondary sounds. */
  hit(kind: HitKind, symbol: SymbolName | number = 0, scale = 1) {
    this.run('sfx', (ctx, out, now) => {
      const index = typeof symbol === 'number' ? symbol : SYMBOLS.indexOf(symbol), ratio = RATIOS[Math.max(0, index) % 4] * KIND_PITCH[kind];
      const vol = KIND_LEVEL[kind] * scale;
      if (kind === 'wrong') {
        // Two falling, muffled tones read as a questioning "uh-uh".
        this.tone(ctx, out, now, { type: 'sawtooth', from: 310, to: 230, dur: .1, vol: vol * .8, filter: { type: 'lowpass', freq: 800 } });
        this.tone(ctx, out, now, { type: 'sawtooth', from: 250, to: 160, dur: .16, vol: vol * .8, at: .1, filter: { type: 'lowpass', freq: 650 } });
        return;
      }
      if (kind === 'miss') { this.tone(ctx, out, now, { from: 140, to: 62, dur: .16, vol, filter: { type: 'lowpass', freq: 500 } }); return; }
      switch (this.transport.settings.hitPreset) {
        case 'tactile':
          this.tone(ctx, out, now, { from: 230 * ratio, to: 90, dur: .09, vol: vol * 1.2 });
          this.tick(ctx, out, now, 2300 * ratio, .035, vol * .8);
          break;
        case 'synth':
          this.tone(ctx, out, now, { type: 'sawtooth', from: 440 * ratio * 1.5, to: 440 * ratio * .75, dur: .15, vol: vol * .5, filter: { type: 'lowpass', freq: 3200 } });
          this.tone(ctx, out, now, { type: 'square', from: 220 * ratio, dur: .09, vol: vol * .18, filter: { type: 'lowpass', freq: 1400 } });
          break;
        case 'classic':
          this.tone(ctx, out, now, { type: 'triangle', from: 880 * ratio, to: 640 * ratio, dur: .08, vol: vol * 1.1 });
          this.tick(ctx, out, now, 3200, .02, vol * .6);
          break;
        default:
          this.tone(ctx, out, now, { type: 'triangle', from: 1318.5 * ratio * .75, dur: .24, vol: vol * .9 });
          this.tone(ctx, out, now, { from: 1318.5 * ratio * 1.5, dur: .12, vol: vol * .3 });
          this.tick(ctx, out, now, 6200, .02, vol * .35);
      }
    });
  }

  /** Continuous bed while a Hold is physically pressed. */
  startHold(id: string, symbol: SymbolName | number = 0) {
    if (!this.transport.settings.holdSustain) return;
    this.stopHold(id);
    this.run('sfx', (ctx, out, now) => {
      const index = typeof symbol === 'number' ? symbol : SYMBOLS.indexOf(symbol), base = 196 * RATIOS[Math.max(0, index) % 4];
      const body = ctx.createOscillator(), shimmer = ctx.createOscillator(), lfo = ctx.createOscillator();
      const filter = ctx.createBiquadFilter(), gain = ctx.createGain(), shimmerGain = ctx.createGain(), lfoGain = ctx.createGain();
      body.type = 'triangle'; body.frequency.value = base;
      shimmer.type = 'sawtooth'; shimmer.frequency.value = base * 2.004; shimmerGain.gain.value = .28;
      lfo.frequency.value = 6.5; lfoGain.gain.value = .02;
      filter.type = 'lowpass'; filter.frequency.value = 1300;
      gain.gain.setValueAtTime(0.0001, now); gain.gain.linearRampToValueAtTime(.12, now + .07);
      body.connect(filter); shimmer.connect(shimmerGain); shimmerGain.connect(filter); filter.connect(gain); gain.connect(out);
      lfo.connect(lfoGain); lfoGain.connect(gain.gain);
      for (const o of [body, shimmer, lfo]) o.start(now);
      this.sustains.set(id, { oscillators: [body, shimmer, lfo], gain });
    });
  }
  stopHold(id: string) {
    const sustain = this.sustains.get(id);
    if (!sustain) return;
    this.sustains.delete(id);
    try {
      const ctx = this.transport.ctx, now = ctx.currentTime;
      sustain.gain.gain.setTargetAtTime(0.0001, now, .03);
      for (const o of sustain.oscillators) o.stop(now + .2);
    } catch { /* already stopped */ }
  }
  stopAllHolds() { for (const id of [...this.sustains.keys()]) this.stopHold(id); }

  /** Rising shimmer when the live grade improves (level 0 = C … 3 = S). */
  gradeUp(level: number) {
    this.run('sfx', (ctx, out, now) => {
      const root = [523.25, 587.33, 659.25, 783.99][Math.max(0, Math.min(3, level))];
      [1, 1.25, 1.5].forEach((ratio, i) => this.tone(ctx, out, now, { type: 'triangle', from: root * ratio, dur: .24, vol: .3, at: i * .07 }));
    });
  }
  countdown(step: number | 'go') {
    this.run('sfx', (ctx, out, now) => {
      if (step === 'go') { this.tone(ctx, out, now, { from: 990, dur: .28, vol: .4 }); this.tone(ctx, out, now, { from: 1485, dur: .22, vol: .18 }); }
      else this.tone(ctx, out, now, { from: 660, dur: .13, vol: .32 });
    });
  }
  ui(kind: UiSound) {
    this.run('ui', (ctx, out, now) => {
      if (kind === 'click') this.tone(ctx, out, now, { from: 1500, to: 950, dur: .04, vol: .28 });
      else if (kind === 'tick') this.tone(ctx, out, now, { from: 1900, dur: .018, vol: .12 });
      else if (kind === 'open') this.tone(ctx, out, now, { type: 'triangle', from: 480, to: 840, dur: .13, vol: .28 });
      else if (kind === 'close') this.tone(ctx, out, now, { type: 'triangle', from: 840, to: 480, dur: .12, vol: .26 });
      else { this.tone(ctx, out, now, { from: 660, dur: .1, vol: .28 }); this.tone(ctx, out, now, { from: 880, dur: .14, vol: .28, at: .08 }); }
    });
  }
  /** Result screen jingle; brighter and longer for higher grades. */
  fanfare(grade: string) {
    this.run('ui', (ctx, out, now) => {
      const notes = ({ S: [523, 659, 784, 1047, 1319], A: [523, 659, 784, 1047], B: [523, 659, 784], C: [440, 523], D: [330, 262] } as Record<string, number[]>)[grade] || [440];
      notes.forEach((freq, i) => this.tone(ctx, out, now, { type: 'triangle', from: freq, dur: .3, vol: .32, at: i * .11 }));
    });
  }
}
