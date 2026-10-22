import { clone, parseChart, type Chart, type Note, type Side, type SymbolName } from './domain';

export const WINDOWS = { perfect: 45, great: 90, good: 135 };
export type Judgement = 'perfect' | 'great' | 'good' | 'miss';
type RuntimeNote = Note & { state: 'pending' | 'holding' | 'done'; judgement?: Judgement; owner?: string; head?: Judgement; boundSide?: Side };
export class Gameplay {
  notes: RuntimeNote[];
  score = 0; combo = 0; maxCombo = 0;
  counts = { perfect: 0, great: 0, good: 0, miss: 0 };
  private cursor = 0;
  private holds = new Map<string, RuntimeNote>();
  private active = new Set<string>();
  private suspended = new Set<RuntimeNote>();
  onJudge?: (judgement: Judgement, note: Note) => void;
  constructor(chart: Chart) { this.notes = clone(parseChart(chart).notes).sort((a, b) => a.timeMs - b.timeMs || a.id.localeCompare(b.id)).map(n => ({ ...n, state: 'pending' })); }
  press(owner: string, symbol: SymbolName, side: 'left' | 'right', time: number): boolean {
    if (this.active.has(owner)) return false;
    this.active.add(owner);
    const suspended = [...this.suspended].find(n => n.symbol === symbol && n.boundSide === side);
    if (suspended) { this.suspended.delete(suspended); suspended.owner = owner; this.holds.set(owner, suspended); return true; }
    if ([...this.holds.values()].some(n => n.boundSide === side)) return false;
    let candidate: RuntimeNote | undefined, delta = Infinity;
    // Search only the hittable interval, not every note on each input.
    let low = this.cursor, high = this.notes.length;
    while (low < high) { const mid = (low + high) >>> 1; if (this.notes[mid].timeMs < time - WINDOWS.good) low = mid + 1; else high = mid; }
    for (let i = low; i < this.notes.length && this.notes[i].timeMs <= time + WINDOWS.good; i++) {
      const n = this.notes[i], distance = Math.abs(n.timeMs - time);
      if (n.state === 'pending' && n.symbol === symbol && (n.side === 'either' || n.side === side) && distance < delta) { candidate = n; delta = distance; }
    }
    if (!candidate) return false;
    const judge: Judgement = delta <= WINDOWS.perfect ? 'perfect' : delta <= WINDOWS.great ? 'great' : 'good';
    if (candidate.type === 'hold') {
      candidate.state = 'holding'; candidate.owner = owner; candidate.head = judge; candidate.boundSide = side; this.holds.set(owner, candidate);
      this.onJudge?.(judge, candidate);
    } else this.finish(candidate, judge);
    return true;
  }
  release(owner: string, time: number, cancelled = false) {
    this.active.delete(owner);
    const note = this.holds.get(owner);
    if (!note) return;
    this.holds.delete(owner);
    this.finish(note, cancelled || time < note.timeMs + note.durationMs! - WINDOWS.good ? 'miss' : note.head!);
  }
  update(time: number) {
    for (const [owner, n] of this.holds) if (time >= n.timeMs + n.durationMs!) { this.holds.delete(owner); this.finish(n, n.head!); }
    for (const n of this.suspended) if (time >= n.timeMs + n.durationMs!) { this.suspended.delete(n); this.finish(n, 'miss'); }
    while (this.cursor < this.notes.length && this.notes[this.cursor].timeMs < time - WINDOWS.good) {
      const n = this.notes[this.cursor++];
      if (n.state === 'pending') this.finish(n, 'miss');
    }
  }
  // Pause does not judge a Hold. A matching fresh press can rebind it after resume.
  suspendInputs() { for (const n of this.holds.values()) { n.owner = undefined; this.suspended.add(n); } this.holds.clear(); this.active.clear(); }
  cancelInputs(time: number) { for(const n of this.suspended)this.finish(n,'miss');this.suspended.clear(); [...this.active].forEach(owner => this.release(owner, time, true)); this.active.clear(); }
  private finish(n: RuntimeNote, judgement: Judgement) {
    if (n.state === 'done') return;
    n.state = 'done'; n.judgement = judgement; this.counts[judgement]++;
    const value = { perfect: 1000, great: 700, good: 300, miss: 0 }[judgement];
    this.score += value; this.combo = judgement === 'miss' ? 0 : this.combo + 1; this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.onJudge?.(judgement, n);
  }
  get accuracy() { return this.notes.length ? this.score / (this.notes.length * 1000) * 100 : 0; }
  get complete() { return this.notes.every(n => n.state === 'done'); }
}
