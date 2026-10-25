import { clone, parseChart, type Chart, type Note, type Side, type SymbolName } from './domain';

export const WINDOWS = { perfect: 45, great: 90, good: 135 };
export type Judgement = 'perfect' | 'great' | 'good' | 'miss';
export type JudgePart = 'tap' | 'head' | 'tail';
type RuntimeNote = Note & { state: 'pending' | 'holding' | 'done'; judgement?: Judgement; owner?: string; head?: Judgement; boundSide?: Side };
export class Gameplay {
  notes: RuntimeNote[];
  score = 0; combo = 0; maxCombo = 0;
  comboHits = 0;
  readonly maxPossibleCombo: number;
  counts = { perfect: 0, great: 0, good: 0, miss: 0 };
  private cursor = 0;
  private holds = new Map<string, RuntimeNote>();
  private active = new Set<string>();
  private suspended = new Set<RuntimeNote>();
  onJudge?: (judgement: Judgement, note: Note, part?: JudgePart) => void;
  constructor(chart: Chart) {
    this.notes = clone(parseChart(chart).notes).sort((a, b) => a.timeMs - b.timeMs || a.id.localeCompare(b.id)).map(n => ({ ...n, state: 'pending' }));
    this.maxPossibleCombo = this.notes.reduce((sum, n) => sum + (n.type === 'hold' ? 2 : 1), 0);
  }
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
      this.recordJudge(candidate, judge, 'head');
    } else this.finish(candidate, judge, 'tap');
    return true;
  }
  release(owner: string, time: number, cancelled = false) {
    this.active.delete(owner);
    const note = this.holds.get(owner);
    if (!note) return;
    this.holds.delete(owner);
    const endTime = note.timeMs + note.durationMs!;
    const delta = Math.abs(time - endTime);
    if (cancelled || delta > WINDOWS.good) {
      this.finish(note, 'miss', 'tail');
    } else {
      const tailJudge: Judgement = delta <= WINDOWS.perfect ? 'perfect' : delta <= WINDOWS.great ? 'great' : 'good';
      this.finish(note, tailJudge, 'tail');
    }
  }
  update(time: number) {
    for (const [owner, n] of this.holds) if (time > n.timeMs + n.durationMs! + WINDOWS.good) { this.holds.delete(owner); this.finish(n, 'miss', 'tail'); }
    for (const n of this.suspended) if (time > n.timeMs + n.durationMs! + WINDOWS.good) { this.suspended.delete(n); this.finish(n, 'miss', 'tail'); }
    while (this.cursor < this.notes.length && this.notes[this.cursor].timeMs < time - WINDOWS.good) {
      const n = this.notes[this.cursor++];
      if (n.state === 'pending') this.finish(n, 'miss', n.type === 'hold' ? 'head' : 'tap');
    }
  }
  // Pause does not judge a Hold. A matching fresh press can rebind it after resume.
  suspendInputs() { for (const n of this.holds.values()) { n.owner = undefined; this.suspended.add(n); } this.holds.clear(); this.active.clear(); }
  cancelInputs(time: number) { for(const n of this.suspended)this.finish(n,'miss','tail');this.suspended.clear(); [...this.active].forEach(owner => this.release(owner, time, true)); this.active.clear(); }
  private recordJudge(n: RuntimeNote, judgement: Judgement, part: JudgePart) {
    this.counts[judgement]++;
    const value = { perfect: 1000, great: 700, good: 300, miss: 0 }[judgement];
    this.score += value;
    this.combo = judgement === 'miss' ? 0 : this.combo + 1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    if (judgement === 'perfect' || judgement === 'great') this.comboHits++;
    this.onJudge?.(judgement, n, part);
  }
  private finish(n: RuntimeNote, judgement: Judgement, part: JudgePart = 'tap') {
    if (n.state === 'done') return;
    n.state = 'done'; n.judgement = judgement;
    this.recordJudge(n, judgement, part);
  }
  get accuracy() { return this.maxPossibleCombo ? (this.comboHits / this.maxPossibleCombo) * 100 : 0; }
  get complete() { return this.notes.every(n => n.state === 'done'); }
}
