import { LIMITS } from './domain';
import { SoundBank } from './sfx';

export type HitPreset = 'crystal' | 'tactile' | 'synth' | 'classic';
export const HIT_PRESETS: { id: HitPreset; label: string }[] = [
  { id: 'crystal', label: 'Crystal chime' }, { id: 'tactile', label: 'Tactile click' }, { id: 'synth', label: 'Soft synth' }, { id: 'classic', label: 'Classic wood' }
];
export type AudioSettings = { master: number; music: number; sfx: number; ui: number; muted: boolean; hitPreset: HitPreset; holdSustain: boolean; offsetMs: number };
export const DEFAULT_AUDIO_SETTINGS: AudioSettings = { master: .65, music: 1, sfx: .8, ui: .6, muted: false, hitPreset: 'crystal', holdSustain: true, offsetMs: 0 };
const SETTINGS_KEY = 'beatorbit-audio-settings', LEGACY_VOLUME_KEY = 'beatorbit-volume';
const unit = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
export function sanitizeAudioSettings(value: Partial<AudioSettings> | undefined, base: AudioSettings = DEFAULT_AUDIO_SETTINGS): AudioSettings {
  const v = value || {};
  return {
    master: unit(v.master, base.master), music: unit(v.music, base.music), sfx: unit(v.sfx, base.sfx), ui: unit(v.ui, base.ui),
    muted: typeof v.muted === 'boolean' ? v.muted : base.muted,
    hitPreset: HIT_PRESETS.some(p => p.id === v.hitPreset) ? v.hitPreset as HitPreset : base.hitPreset,
    holdSustain: typeof v.holdSustain === 'boolean' ? v.holdSustain : base.holdSustain,
    offsetMs: typeof v.offsetMs === 'number' && Number.isFinite(v.offsetMs) ? Math.round(Math.max(-200, Math.min(200, v.offsetMs))) : base.offsetMs
  };
}
export function loadAudioSettings(): AudioSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return sanitizeAudioSettings(JSON.parse(raw));
    // Older builds stored a single master volume.
    const legacy = localStorage.getItem(LEGACY_VOLUME_KEY);
    if (legacy !== null) return sanitizeAudioSettings({ master: Number(legacy) });
  } catch { /* preferences are optional */ }
  return { ...DEFAULT_AUDIO_SETTINGS };
}
export function saveAudioSettings(settings: AudioSettings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* preferences are optional */ }
}

export class AudioTransport {
  private context?: AudioContext;
  private source?: AudioBufferSourceNode;
  private buffer?: AudioBuffer;
  private anchor = 0;
  private position = 0;
  private playing = false;
  private session = 0;
  settings: AudioSettings = loadAudioSettings();
  private buses?: { master: GainNode; music: GainNode; sfx: GainNode; ui: GainNode };
  private soundBank?: SoundBank;
  private decodeSequence = 0;
  private decodePending: Promise<unknown> = Promise.resolve();
  onEnded?: () => void;
  onInterrupted?: () => void;
  get ctx() {
    if (!this.context) {
      this.context = new AudioContext();
      const master = this.context.createGain(), music = this.context.createGain(), sfx = this.context.createGain(), ui = this.context.createGain();
      music.connect(master); sfx.connect(master); ui.connect(master); master.connect(this.context.destination);
      this.buses = { master, music, sfx, ui };
      this.applyGains(true);
      this.context.onstatechange = () => {
        if (this.context?.state !== 'running' && this.playing) { this.pause(); this.onInterrupted?.(); }
      };
    }
    return this.context;
  }
  /** Gameplay sound effects, synthesised locally through the shared audio context. */
  get sfx() { return this.soundBank ??= new SoundBank(this); }
  bus(name: 'sfx' | 'ui') { this.ctx; return this.buses![name]; }
  private applyGains(immediate = false) {
    if (!this.buses || !this.context) return;
    const s = this.settings, now = this.context.currentTime;
    for (const [node, value] of [[this.buses.master, s.muted ? 0 : s.master], [this.buses.music, s.music], [this.buses.sfx, s.sfx], [this.buses.ui, s.ui]] as const) {
      if (immediate) node.gain.value = value; else node.gain.setTargetAtTime(value, now, 0.02);
    }
  }
  updateSettings(patch: Partial<AudioSettings>) {
    this.settings = sanitizeAudioSettings({ ...this.settings, ...patch }, this.settings);
    saveAudioSettings(this.settings); this.applyGains();
    return this.settings;
  }
  async unlock() { const ctx = this.ctx; if (ctx.state !== 'running') await ctx.resume(); }
  get currentBuffer() { return this.buffer; }
  get isPlaying() { return this.playing; }
  get durationMs() { return (this.buffer?.duration || 0) * 1000; }
  get nowMs() {
    if (!this.playing || !this.context) return this.position;
    return Math.min(this.durationMs, this.position + (this.context.currentTime - this.anchor) * 1000);
  }
  eventTimeMs(timeStamp: number, position = this.nowMs) {
    // Modern DOM timestamps are monotonic; older implementations may use epoch time.
    const stamp = timeStamp > 1e12 ? timeStamp - performance.timeOrigin : timeStamp;
    const elapsed = performance.now() - stamp;
    return position - (Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : 0);
  }
  decode(blob: Blob): Promise<AudioBuffer> {
    const work = this.decodePending.catch(() => {}).then(() => this.decodeFile(blob));
    this.decodePending = work.then(() => undefined, () => undefined);
    return work;
  }
  private async decodeFile(blob: Blob): Promise<AudioBuffer> {
    if (!blob.size) throw new Error('This audio file is empty.');
    if (blob.size > LIMITS.audioBytes) throw new Error('Audio is larger than the 64 MiB import limit.');
    // Reject known long files before allocating a full decoded PCM buffer.
    if (typeof Audio !== 'undefined') {
      const duration = await this.inspectDuration(blob);
      if (duration && duration * 1000 > LIMITS.durationMs) throw new Error('Audio is longer than the 10 minute limit.');
      if (duration && duration * this.ctx.sampleRate * 2 * 4 > LIMITS.decodedBytes) throw new Error('This track exceeds the conservative mobile decode budget. Use a shorter recording (about 5 minutes at 48 kHz stereo).');
    }
    let buffer: AudioBuffer;
    try { buffer = await this.ctx.decodeAudioData(await blob.arrayBuffer()); }
    catch { throw new Error('This audio could not be decoded. The file may be damaged or its codec unsupported by this browser.'); }
    if (!Number.isFinite(buffer.duration) || buffer.duration <= 0) throw new Error('The audio has no usable duration.');
    if (buffer.duration * 1000 > LIMITS.durationMs) throw new Error('Audio is longer than the 10 minute limit.');
    if (buffer.length * buffer.numberOfChannels * 4 > LIMITS.decodedBytes) throw new Error('Decoded audio exceeds the 128 MiB memory budget. Try a shorter or mono file.');
    return buffer;
  }
  private inspectDuration(blob: Blob): Promise<number | undefined> {
    return new Promise(resolve => {
      const audio = new Audio(), url = URL.createObjectURL(blob);
      const finish = (duration?: number) => { clearTimeout(timer); audio.onloadedmetadata = null; audio.onerror = null; audio.removeAttribute('src'); audio.load(); URL.revokeObjectURL(url); resolve(duration); };
      const timer = setTimeout(() => finish(), 8000);
      audio.preload = 'metadata';
      audio.onloadedmetadata = () => finish(Number.isFinite(audio.duration) ? audio.duration : undefined);
      audio.onerror = () => finish();
      audio.src = url;
    });
  }
  async load(blob: Blob) {
    const sequence = ++this.decodeSequence;
    this.stop(); this.buffer = undefined;
    const decoded = await this.decode(blob);
    if (sequence !== this.decodeSequence) throw new Error('Audio load superseded.');
    this.buffer = decoded; return decoded;
  }
  setBuffer(buffer: AudioBuffer) { ++this.decodeSequence; this.stop(); this.buffer = buffer; }
  unload() { ++this.decodeSequence; this.stop(); this.buffer = undefined; }
  async play(position = this.position) {
    if (!this.buffer) throw new Error('Load an audio file first.');
    const request = ++this.session;
    await this.unlock();
    if (request !== this.session) return;
    this.detach();
    this.position = Math.max(0, Math.min(position, this.durationMs));
    if (this.position >= this.durationMs) this.position = 0;
    const node = this.ctx.createBufferSource(); node.buffer = this.buffer; node.connect(this.buses!.music);
    this.source = node; this.anchor = this.ctx.currentTime; this.playing = true;
    node.onended = () => {
      if (request !== this.session || this.source !== node) return;
      this.playing = false; this.position = this.durationMs; this.detach(); this.onEnded?.();
    };
    node.start(this.anchor, this.position / 1000);
  }
  pause() { const time = this.nowMs; ++this.session; this.detach(); this.playing = false; this.position = time; }
  stop() { this.pause(); this.position = 0; }
  seek(ms: number) {
    const play = this.playing; this.pause(); this.position = Math.max(0, Math.min(ms, this.durationMs));
    if (play && this.position < this.durationMs) return this.play();
    return Promise.resolve();
  }
  /** Kept for callers that only know a master volume. */
  setVolume(value: number) { if (!Number.isFinite(value)) return; this.updateSettings({ master: value }); }
  private detach() { if (this.source) { this.source.onended = null; try { this.source.stop(); } catch { /* already stopped */ } this.source.disconnect(); this.source = undefined; } }
  dispose() { ++this.decodeSequence; this.stop(); this.buffer = undefined; this.soundBank?.stopAllHolds(); void this.context?.close(); }
}

export function waveform(buffer: AudioBuffer, buckets = 1800) {
  const out = new Float32Array(buckets);
  const data = buffer.getChannelData(0);
  const stride = Math.max(1, Math.floor(data.length / buckets));
  for (let i = 0; i < buckets; i++) {
    let peak = 0;
    // Bound waveform work while sampling across each bucket.
    for (let j = i * stride; j < Math.min((i + 1) * stride, data.length); j += Math.max(1, Math.floor(stride / 40))) peak = Math.max(peak, Math.abs(data[j]));
    out[i] = peak;
  }
  return out;
}

// Original procedural demo music, generated locally as PCM WAV. No network audio.
export function makeDemoAudio(bpm: number, seconds: number, root = 220): Blob {
  const work = demoAudio(bpm, seconds, root); let next = work.next();
  while (!next.done) next = work.next();
  return next.value;
}
export async function makeDemoAudioAsync(bpm: number, seconds: number, root = 220, signal?: AbortSignal): Promise<Blob> {
  const work = demoAudio(bpm, seconds, root);
  for (;;) {
    signal?.throwIfAborted();
    const next = work.next();
    if (next.done) return next.value;
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}
function* demoAudio(bpm: number, seconds: number, root: number): Generator<void, Blob> {
  const rate = 16000, count = Math.floor(seconds * rate), raw = new ArrayBuffer(44 + count * 2), view = new DataView(raw);
  const write = (at: number, s: string) => [...s].forEach((v, i) => view.setUint8(at + i, v.charCodeAt(0)));
  write(0, 'RIFF'); view.setUint32(4, 36 + count * 2, true); write(8, 'WAVE'); write(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, count * 2, true);
  const beat = 60 / bpm, progression = [1, 0.7937, 0.8909, 0.6674], melody = [1, 1.5, 2, 1.25, 1.5, 1.125, 2, 1.5];
  let noise = 18273;
  for (let i = 0; i < count; i++) {
    if (i > 0 && i % 16384 === 0) yield;
    const t = i / rate, b = t / beat, phase = t % beat, sub = t % (beat / 2), chord = progression[Math.floor(b / 8) % 4];
    const kick = Math.sin(2 * Math.PI * (48 * phase + 4 * (1 - Math.exp(-phase * 24)))) * Math.exp(-phase * 14) * 0.45;
    noise = (noise * 16807) % 2147483647;
    const hat = (noise / 2147483647 * 2 - 1) * Math.exp(-sub * 100) * 0.055;
    const bass = Math.sin(2 * Math.PI * root / 4 * chord * t) * (0.65 + 0.35 * Math.exp(-phase * 6)) * 0.16;
    const arp = Math.sin(2 * Math.PI * root * chord * melody[Math.floor(b * 2) % 8] * t) * Math.exp(-sub * 8) * 0.12;
    const pad = (Math.sin(2 * Math.PI * root * chord * t) + Math.sin(2 * Math.PI * root * chord * 1.5 * t)) * 0.035;
    const fade = Math.min(1, t * 2, (seconds - t) / 1.5);
    view.setInt16(44 + i * 2, Math.max(-32767, Math.min(32767, (kick + hat + bass + arp + pad) * fade * 28000)), true);
  }
  return new Blob([raw], { type: 'audio/wav' });
}
