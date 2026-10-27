import type { AudioTransport } from './audio';
import { type SymbolName } from './domain';

// Every sound is synthesised locally with Web Audio. No sample files, uploads or network requests.
export type HitKind = 'perfect' | 'great' | 'good' | 'miss' | 'wrong';
export type UiSound = 'click' | 'open' | 'close' | 'confirm' | 'tick';
type ToneOptions = { type?: OscillatorType; from: number; to?: number; dur: number; vol: number; at?: number; attack?: number; filter?: { type: BiquadFilterType; freq: number; q?: number } };
type Sustain = { oscillators: OscillatorNode[]; gain: GainNode };

// Subtle dynamic shading per judgement without shifting musical pitch out of the song's key.
const KIND_LEVEL: Record<HitKind, number> = { perfect: .34, great: .28, good: .22, miss: .2, wrong: .24 };
const KIND_BRIGHTNESS: Record<HitKind, number> = { perfect: 1, great: .92, good: .82, miss: .7, wrong: .75 };

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
    const attack = o.attack ?? .007;
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.from, t);
    if (o.to && o.to !== o.from) osc.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(o.vol, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    let head: AudioNode = osc;
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = o.filter.type;
      f.frequency.value = o.filter.freq;
      if (o.filter.q) f.Q.value = o.filter.q;
      osc.connect(f);
      head = f;
    }
    head.connect(gain); gain.connect(out);
    osc.start(t); osc.stop(t + o.dur + .03);
  }
  // Soft felt/wood transient with low-pass warmth instead of harsh high-frequency noise.
  private softTap(ctx: AudioContext, out: AudioNode, now: number, freq: number, dur: number, vol: number, at = 0) {
    if (!this.noise) {
      const length = Math.floor(ctx.sampleRate * .2), buffer = ctx.createBuffer(1, length, ctx.sampleRate), data = buffer.getChannelData(0);
      let seed = 12345, prev = 0;
      for (let i = 0; i < length; i++) {
        seed = (seed * 16807) % 2147483647;
        const white = seed / 2147483647 * 2 - 1;
        prev = prev * .82 + white * .18; // Warm pink-ish smoothing
        data[i] = prev;
      }
      this.noise = buffer;
    }
    const t = now + at, src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    src.buffer = this.noise; filter.type = 'lowpass'; filter.frequency.value = freq; filter.Q.value = .7;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(vol, t + .004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter); filter.connect(gain); gain.connect(out);
    src.start(t); src.stop(t + dur + .02);
  }

  /** Note hit, hold head/tail, miss, or a wrong-symbol press. `scale` softens secondary sounds. */
  hit(kind: HitKind, _symbol: SymbolName | number = 0, scale = 1) {
    this.run('sfx', (ctx, out, now) => {
      const vol = KIND_LEVEL[kind] * scale, bright = KIND_BRIGHTNESS[kind];
      if (kind === 'wrong') {
        // Soft, muted double wood-tap ("uh-uh") without any harsh buzzer waveforms.
        this.tone(ctx, out, now, { type: 'sine', from: 190, to: 145, dur: .085, vol: vol * .85, attack: .006, filter: { type: 'lowpass', freq: 380 } });
        this.tone(ctx, out, now, { type: 'sine', from: 150, to: 112, dur: .12, vol: vol * .8, at: .075, attack: .006, filter: { type: 'lowpass', freq: 320 } });
        return;
      }
      if (kind === 'miss') {
        this.tone(ctx, out, now, { type: 'sine', from: 135, to: 78, dur: .12, vol: vol * .75, attack: .008, filter: { type: 'lowpass', freq: 300 } });
        return;
      }
      switch (this.transport.settings.hitPreset) {
        case 'tactile':
          // Cushioned felt-mallet thock: warm low body + soft wood transient.
          this.tone(ctx, out, now, { type: 'sine', from: 195 * bright, to: 86, dur: .075, vol: vol * 1.15, attack: .005, filter: { type: 'lowpass', freq: 650 } });
          this.tone(ctx, out, now, { type: 'triangle', from: 420 * bright, to: 180, dur: .04, vol: vol * .42, attack: .004, filter: { type: 'lowpass', freq: 820 } });
          this.softTap(ctx, out, now, 780 * bright, .028, vol * .35);
          break;
        case 'synth':
          // Velvet electric-piano pluck: warm sine + filtered triangle overtone.
          this.tone(ctx, out, now, { type: 'sine', from: 396 * bright, to: 392 * bright, dur: .16, vol: vol * .95, attack: .008 });
          this.tone(ctx, out, now, { type: 'triangle', from: 594 * bright, dur: .11, vol: vol * .32, attack: .008, filter: { type: 'lowpass', freq: 980 } });
          this.softTap(ctx, out, now, 680, .022, vol * .2);
          break;
        case 'classic':
          // Studio soft tap: clean, neutral, and effortless on long sessions.
          this.tone(ctx, out, now, { type: 'sine', from: 330 * bright, to: 155, dur: .065, vol: vol * 1.05, attack: .005, filter: { type: 'lowpass', freq: 780 } });
          this.softTap(ctx, out, now, 920 * bright, .02, vol * .28);
          break;
        default:
          // Crystal (default): warm glass marimba chime with rounded sine harmonics.
          this.tone(ctx, out, now, { type: 'sine', from: 528 * bright, to: 520 * bright, dur: .17, vol: vol * .9, attack: .006, filter: { type: 'lowpass', freq: 1350 } });
          this.tone(ctx, out, now, { type: 'sine', from: 264 * bright, to: 176, dur: .09, vol: vol * .55, attack: .005 });
          this.tone(ctx, out, now, { type: 'sine', from: 1056 * bright, dur: .075, vol: vol * .2, attack: .006, filter: { type: 'lowpass', freq: 1600 } });
      }
    });
  }

  /** Warm, soothing sub-air pad while a Hold is physically pressed. */
  startHold(id: string, _symbol: SymbolName | number = 0) {
    if (!this.transport.settings.holdSustain) return;
    this.stopHold(id);
    this.run('sfx', (ctx, out, now) => {
      const base = 220;
      const body = ctx.createOscillator(), fifth = ctx.createOscillator(), lfo = ctx.createOscillator();
      const filter = ctx.createBiquadFilter(), gain = ctx.createGain(), fifthGain = ctx.createGain(), lfoGain = ctx.createGain();
      body.type = 'sine'; body.frequency.value = base;
      fifth.type = 'sine'; fifth.frequency.value = base * 1.5; fifthGain.gain.value = .22;
      lfo.type = 'sine'; lfo.frequency.value = 4.2; lfoGain.gain.value = .008;
      filter.type = 'lowpass'; filter.frequency.value = 560;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(.058, now + .11);
      body.connect(filter); fifth.connect(fifthGain); fifthGain.connect(filter); filter.connect(gain); gain.connect(out);
      lfo.connect(lfoGain); lfoGain.connect(gain.gain);
      for (const o of [body, fifth, lfo]) o.start(now);
      this.sustains.set(id, { oscillators: [body, fifth, lfo], gain });
    });
  }
  stopHold(id: string) {
    const sustain = this.sustains.get(id);
    if (!sustain) return;
    this.sustains.delete(id);
    try {
      const ctx = this.transport.ctx, now = ctx.currentTime;
      sustain.gain.gain.setTargetAtTime(0.0001, now, .04);
      for (const o of sustain.oscillators) o.stop(now + .22);
    } catch { /* already stopped */ }
  }
  stopAllHolds() { for (const id of [...this.sustains.keys()]) this.stopHold(id); }

  /** Gentle rising chime when the live grade improves (level 0 = C … 3 = S). */
  gradeUp(level: number) {
    this.run('sfx', (ctx, out, now) => {
      const root = [440, 493.88, 523.25, 587.33][Math.max(0, Math.min(3, level))];
      [1, 1.25, 1.5].forEach((ratio, i) => this.tone(ctx, out, now, { type: 'sine', from: root * ratio, dur: .26, vol: .2, at: i * .075, attack: .01, filter: { type: 'lowpass', freq: 1400 } }));
    });
  }
  countdown(step: number | 'go') {
    this.run('sfx', (ctx, out, now) => {
      if (step === 'go') {
        this.tone(ctx, out, now, { type: 'sine', from: 587.33, dur: .24, vol: .24, attack: .008 });
        this.tone(ctx, out, now, { type: 'sine', from: 880, dur: .2, vol: .14, attack: .008 });
      } else {
        this.tone(ctx, out, now, { type: 'sine', from: 440, to: 436, dur: .12, vol: .2, attack: .007 });
      }
    });
  }
  ui(kind: UiSound) {
    this.run('ui', (ctx, out, now) => {
      if (kind === 'click') this.tone(ctx, out, now, { type: 'sine', from: 520, to: 320, dur: .038, vol: .15, attack: .004 });
      else if (kind === 'tick') this.tone(ctx, out, now, { type: 'sine', from: 680, to: 480, dur: .024, vol: .1, attack: .003 });
      else if (kind === 'open') this.tone(ctx, out, now, { type: 'sine', from: 360, to: 540, dur: .12, vol: .16, attack: .008 });
      else if (kind === 'close') this.tone(ctx, out, now, { type: 'sine', from: 540, to: 360, dur: .11, vol: .15, attack: .008 });
      else {
        this.tone(ctx, out, now, { type: 'sine', from: 440, dur: .1, vol: .16, attack: .007 });
        this.tone(ctx, out, now, { type: 'sine', from: 587.33, dur: .14, vol: .16, at: .075, attack: .007 });
      }
    });
  }
  /** Warm result screen chord; fuller for higher grades. */
  fanfare(grade: string) {
    this.run('ui', (ctx, out, now) => {
      const notes = ({ S: [392, 493.88, 587.33, 783.99], A: [392, 493.88, 587.33], B: [349.23, 440, 523.25], C: [329.63, 392], D: [293.66, 261.63] } as Record<string, number[]>)[grade] || [392];
      notes.forEach((freq, i) => this.tone(ctx, out, now, { type: 'sine', from: freq, dur: .34, vol: .2, at: i * .1, attack: .012, filter: { type: 'lowpass', freq: 1200 } }));
    });
  }
}
