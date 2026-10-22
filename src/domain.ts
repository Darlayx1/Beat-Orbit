export const SYMBOLS = ['triangle', 'circle', 'square', 'cross'] as const;
export const GLYPHS = ['△', '○', '□', '×'];
export const DIFFICULTIES = ['easy', 'normal', 'hard', 'expert'] as const;
export type SymbolName = typeof SYMBOLS[number];
export type Side = 'either' | 'left' | 'right';
export type Note = { id: string; type: 'tap' | 'hold'; symbol: SymbolName; side: Side; timeMs: number; durationMs?: number; chordId?: string };
export type Song = { id: string; title: string; artist: string; durationMs: number; fileName: string; format: string; fileSize: number; importedAt: string; source: 'demo' | 'imported'; bpm?: number; palette: number };
export type Chart = { schemaVersion: 1; chartId: string; songId: string; name: string; difficulty: typeof DIFFICULTIES[number]; rulesetId: 'beatorbit-standard-v1'; revision: number; timing: { bpm: number; offsetMs: number; timeSignature: { numerator: number; denominator: 4 } }; audioRef: { fileName: string; durationMs: number }; notes: Note[]; updatedAt: string };
export type Draft = { chartId: string; chart: Chart; baseRevision: number; savedAt: string };
export type Result = { id: string; chartId: string; revision: number; title: string; score: number; accuracy: number; maxCombo: number; perfect: number; great: number; good: number; miss: number; createdAt: string };
export const LIMITS = { audioBytes: 64 * 1024 * 1024, durationMs: 10 * 60 * 1000, decodedBytes: 128 * 1024 * 1024, notes: 10000, jsonBytes: 5 * 1024 * 1024 };
export const uid = () => crypto.randomUUID();
export const clone = <T>(x: T): T => structuredClone(x);
export const sortNotes = (notes: Note[]) => notes.sort((a, b) => a.timeMs - b.timeMs || a.id.localeCompare(b.id));
export const formatTime = (ms: number) => Math.floor(Math.max(0, ms) / 60000) + ':' + String(Math.floor(Math.max(0, ms) / 1000) % 60).padStart(2, '0');
export const exactTime = (ms: number) => formatTime(ms) + '.' + String(Math.round(Math.max(0, ms) % 1000)).padStart(3, '0');
export function newChart(song: Song, difficulty: Chart['difficulty'] = 'normal'): Chart {
  return { schemaVersion: 1, chartId: uid(), songId: song.id, name: 'Untitled chart', difficulty, rulesetId: 'beatorbit-standard-v1', revision: 0, timing: { bpm: song.bpm || 120, offsetMs: 0, timeSignature: { numerator: 4, denominator: 4 } }, audioRef: { fileName: song.fileName, durationMs: song.durationMs }, notes: [], updatedAt: new Date().toISOString() };
}
export function snapTime(timeMs: number, chart: Chart, denominator: number): number {
  const step = 60000 / chart.timing.bpm * 4 / denominator;
  return Math.max(0, Math.round((timeMs - chart.timing.offsetMs) / step) * step + chart.timing.offsetMs);
}
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const text = (x: unknown): x is string => typeof x === 'string' && x.length > 0 && x.length <= 200;
export function parseChart(value: unknown): Chart {
  if (!value || typeof value !== 'object') throw new Error('Chart must be a JSON object.');
  const c = value as Chart;
  if (c.schemaVersion !== 1) throw new Error('Unsupported chart schema. This app supports version 1.');
  if (!text(c.chartId) || !text(c.songId) || !text(c.name) || !DIFFICULTIES.includes(c.difficulty) || c.rulesetId !== 'beatorbit-standard-v1') throw new Error('Invalid chart identity, name, difficulty, or ruleset.');
  if (!Number.isInteger(c.revision) || c.revision < 0 || typeof c.updatedAt !== 'string' || !Number.isFinite(Date.parse(c.updatedAt))) throw new Error('Invalid chart revision or date.');
  if (!c.timing || !finite(c.timing.bpm) || c.timing.bpm < 1 || c.timing.bpm > 1000 || !finite(c.timing.offsetMs) || Math.abs(c.timing.offsetMs) > LIMITS.durationMs) throw new Error('BPM must be 1–1000 and offset must be within 10 minutes.');
  if (![3, 4].includes(c.timing.timeSignature?.numerator) || c.timing.timeSignature?.denominator !== 4) throw new Error('Supported time signatures: 3/4 and 4/4.');
  if (!c.audioRef || typeof c.audioRef.fileName !== 'string' || c.audioRef.fileName.length > 300 || !finite(c.audioRef.durationMs) || c.audioRef.durationMs <= 0 || c.audioRef.durationMs > LIMITS.durationMs) throw new Error('Invalid audio reference or duration.');
  if (!Array.isArray(c.notes) || c.notes.length > LIMITS.notes) throw new Error('A chart may contain up to 10,000 notes.');
  const ids = new Set<string>();
  const notes: Note[] = c.notes.map(n => {
    if (!n || !text(n.id) || ids.has(n.id) || !SYMBOLS.includes(n.symbol) || !['tap', 'hold'].includes(n.type) || !['either', 'left', 'right'].includes(n.side) || !finite(n.timeMs) || n.timeMs < 0 || n.timeMs > LIMITS.durationMs) throw new Error('Invalid note or duplicate note ID.');
    if (n.type === 'hold' && (!finite(n.durationMs) || n.durationMs <= 0 || n.durationMs > LIMITS.durationMs)) throw new Error('Hold duration must be positive.');
    if (n.chordId !== undefined && !text(n.chordId)) throw new Error('Invalid chord ID.');
    ids.add(n.id);
    return { id: n.id, type: n.type, symbol: n.symbol, side: n.side, timeMs: n.timeMs, ...(n.type === 'hold' ? { durationMs: n.durationMs } : {}), ...(n.chordId ? { chordId: n.chordId } : {}) };
  });
  return { schemaVersion: 1, chartId: c.chartId, songId: c.songId, name: c.name, difficulty: c.difficulty, rulesetId: 'beatorbit-standard-v1', revision: c.revision, timing: clone(c.timing), audioRef: { fileName: c.audioRef.fileName, durationMs: c.audioRef.durationMs }, notes: sortNotes(notes), updatedAt: c.updatedAt };
}
export function validatePlayable(chart: Chart, durationMs: number): { errors: string[]; warnings: string[] } {
  const errors: string[] = [], warnings: string[] = [];
  try { parseChart(chart); } catch (e) { return { errors: [(e as Error).message], warnings }; }
  if (!chart.notes.length) errors.push('Add at least one note before playing.');
  const notes = sortNotes([...chart.notes]);
  for (const n of notes) {
    if (n.timeMs >= durationMs || n.timeMs + (n.durationMs || 0) > durationMs) { errors.push('A note or Hold extends beyond the audio.'); break; }
  }
  // Sweep active Holds and simultaneous attacks. Half-open Hold intervals permit
  // a release followed by a fresh press at the exact end timestamp.
  let active: Note[] = [];
  for (let i = 0; i < notes.length;) {
    const time = notes[i].timeMs;
    active = active.filter(n => n.timeMs + (n.durationMs || 0) > time);
    const attacks: Note[] = [];
    while (i < notes.length && notes[i].timeMs === time) attacks.push(notes[i++]);
    const contacts = [...active, ...attacks];
    const canAssign = (j: number, used: Set<string>): boolean => {
      if (j >= contacts.length) return true;
      const choices = contacts[j].side === 'either' ? ['left', 'right'] : [contacts[j].side];
      return choices.some(side => !used.has(side) && canAssign(j + 1, new Set([...used, side])));
    };
    if (contacts.length > 2 || !canAssign(0, new Set())) { errors.push('A pattern needs more than two thumbs, or conflicts on one side.'); break; }
    if (attacks.length === 2 && attacks[0].symbol === attacks[1].symbol && !(attacks.some(n => n.side === 'left') && attacks.some(n => n.side === 'right'))) {
      errors.push('Matching simultaneous symbols must be assigned Left and Right.'); break;
    }
    active.push(...attacks.filter(n => n.type === 'hold'));
  }
  if (notes.some((n, i) => i > 0 && n.timeMs > notes[i - 1].timeMs && n.timeMs - notes[i - 1].timeMs < 100)) warnings.push('Dense pattern: some notes are less than 100 ms apart.');
  const chords = new Map<string, number>();
  for (const n of notes) if (n.chordId) {
    if (chords.has(n.chordId) && chords.get(n.chordId) !== n.timeMs) { warnings.push('A chord group contains notes at different times.'); break; }
    chords.set(n.chordId, n.timeMs);
  }
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}
export class EditorDocument {
  chart: Chart;
  private past: Chart[] = [];
  private future: Chart[] = [];
  constructor(chart: Chart) { this.chart = clone(chart); }
  apply(edit: (chart: Chart) => void) {
    const next = clone(this.chart);
    edit(next);
    if (JSON.stringify(next) === JSON.stringify(this.chart)) return false;
    parseChart(next);
    this.past.push(clone(this.chart));
    while (this.past.length > 100 || this.past.length > 1 && this.past.reduce((sum, c) => sum + c.notes.length, 0) > 50000) this.past.shift();
    this.future = []; this.chart = next; sortNotes(this.chart.notes); return true;
  }
  undo() { if (!this.past.length) return false; this.future.push(clone(this.chart)); this.chart = this.past.pop()!; return true; }
  redo() { if (!this.future.length) return false; this.past.push(clone(this.chart)); this.chart = this.future.pop()!; return true; }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
}
