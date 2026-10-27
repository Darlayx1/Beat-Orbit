import { clone, parseChart, type Chart, type Note, type Side, type SymbolName } from './domain';

export const WINDOWS = { perfect: 45, great: 90, good: 135 };
export type Judgement = 'perfect' | 'great' | 'good' | 'miss';
// A wrong-symbol press keeps the timing label with a question mark: no score, no combo.
export type Feedback = Judgement | 'perfect?' | 'great?' | 'good?';
export type JudgePart = 'tap' | 'head' | 'tail';
// A matching Dual (same symbol, Left + Right) is judged as one unit and counts as one hit.
type DualUnit = { presses: Map<Side, { owner: string; time: number }>; releases: Map<Side, number> };
type RuntimeNote = Note & { state: 'pending' | 'holding' | 'done'; lead: boolean; judgement?: Judgement; owner?: string; head?: Judgement; boundSide?: Side; partner?: RuntimeNote; unit?: DualUnit; holdTicks?: number };
const judgeFor = (delta: number): Judgement => delta <= WINDOWS.perfect ? 'perfect' : delta <= WINDOWS.great ? 'great' : 'good';
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
  onJudge?: (judgement: Judgement, note: Note, part?: JudgePart, feedback?: Feedback) => void;
  // Fired when a Hold starts or stops being physically held (drives the sustain sound).
  onHold?: (note: Note, active: boolean) => void;
  constructor(chart: Chart) {
    this.notes = clone(parseChart(chart).notes).sort((a, b) => a.timeMs - b.timeMs || a.id.localeCompare(b.id)).map(n => ({ ...n, state: 'pending' as const, lead: true }));
    this.pairDuals();
    this.maxPossibleCombo = this.notes.reduce((sum, n) => sum + (n.lead ? (n.type === 'hold' ? 2 : 1) : 0), 0);
  }
  private pairDuals() {
    for (let start = 0; start < this.notes.length;) {
      let end = start;
      while (end < this.notes.length && this.notes[end].timeMs === this.notes[start].timeMs) end++;
      const group = this.notes.slice(start, end);
      for (const a of group) {
        if (a.partner || a.side !== 'left') continue;
        const b = group.find(n => n !== a && !n.partner && n.side === 'right' && n.symbol === a.symbol && n.type === a.type && Math.abs((n.durationMs || 0) - (a.durationMs || 0)) < 1);
        if (!b) continue;
        const unit: DualUnit = { presses: new Map(), releases: new Map() };
        a.partner = b; b.partner = a; b.lead = false; a.unit = unit; b.unit = unit;
      }
      start = end;
    }
  }
  press(owner: string, symbol: SymbolName, side: 'left' | 'right', time: number): boolean {
    if (this.active.has(owner)) return false;
    this.active.add(owner);
    const suspended = [...this.suspended].find(n => n.symbol === symbol && n.boundSide === side);
    if (suspended) { this.suspended.delete(suspended); suspended.owner = owner; this.holds.set(owner, suspended); this.onHold?.(suspended, true); return true; }
    if ([...this.holds.values()].some(n => n.boundSide === side)) return false;
    let candidate: RuntimeNote | undefined, delta = Infinity, wrong: RuntimeNote | undefined, wrongDelta = Infinity;
    // Search only the hittable interval, not every note on each input.
    let low = this.cursor, high = this.notes.length;
    while (low < high) { const mid = (low + high) >>> 1; if (this.notes[mid].timeMs < time - WINDOWS.good) low = mid + 1; else high = mid; }
    for (let i = low; i < this.notes.length && this.notes[i].timeMs <= time + WINDOWS.good; i++) {
      const n = this.notes[i], distance = Math.abs(n.timeMs - time);
      if (n.state !== 'pending' || !(n.side === 'either' || n.side === side)) continue;
      if (n.symbol === symbol) { if (!n.unit?.presses.has(side) && distance < delta) { candidate = n; delta = distance; } }
      else if (distance < wrongDelta) { wrong = n; wrongDelta = distance; }
    }
    if (!candidate) {
      if (!wrong) return false;
      // Wrong button on a live target: the timing label gets a "?", nothing is scored, and a Hold cannot continue.
      this.finish(wrong, 'miss', wrong.type === 'hold' ? 'head' : 'tap', `${judgeFor(wrongDelta)}?` as Feedback);
      return true;
    }
    if (candidate.unit) return this.pressDual(candidate, owner, side, time);
    const judge = judgeFor(delta);
    if (candidate.type === 'hold') {
      candidate.state = 'holding'; candidate.owner = owner; candidate.head = judge; candidate.boundSide = side; this.holds.set(owner, candidate);
      this.onHold?.(candidate, true);
      this.recordJudge(candidate, judge, 'head');
    } else this.finish(candidate, judge, 'tap');
    return true;
  }
  private pressDual(candidate: RuntimeNote, owner: string, side: 'left' | 'right', time: number) {
    const unit = candidate.unit!, a = candidate.lead ? candidate : candidate.partner!, b = a.partner!;
    unit.presses.set(side, { owner, time });
    if (unit.presses.size < 2) return true;
    const judge = judgeFor(Math.max(...[...unit.presses.values()].map(p => Math.abs(a.timeMs - p.time))));
    if (a.type === 'hold') {
      for (const n of [a, b]) {
        n.state = 'holding'; n.head = judge; n.boundSide = n.side; n.owner = unit.presses.get(n.side as Side)!.owner;
        this.holds.set(n.owner, n);
      }
      this.onHold?.(a, true);
      this.recordJudge(a, judge, 'head');
    } else this.finish(a, judge, 'tap');
    return true;
  }
  release(owner: string, time: number, cancelled = false) {
    this.active.delete(owner);
    const note = this.holds.get(owner);
    if (!note) return;
    this.holds.delete(owner);
    const endTime = note.timeMs + note.durationMs!;
    const delta = Math.abs(time - endTime);
    if (cancelled || delta > WINDOWS.good) { this.finish(note, 'miss', 'tail'); return; }
    this.tickHold(note, time);
    if (note.unit) {
      // Both thumbs must let go inside the window; the worse release decides the judgement.
      note.unit.releases.set(note.boundSide!, delta);
      if (note.unit.releases.size < 2) return;
      this.finish(note.lead ? note : note.partner!, judgeFor(Math.max(...note.unit.releases.values())), 'tail');
      return;
    }
    this.finish(note, judgeFor(delta), 'tail');
  }
  private tickHold(n: RuntimeNote, time: number) {
    const lead = n.lead ? n : n.partner!;
    const elapsed = Math.max(0, Math.min(time, lead.timeMs + (lead.durationMs || 0)) - lead.timeMs);
    const ticks = Math.floor(elapsed / 25), prev = lead.holdTicks || 0;
    if (ticks > prev) { this.score += (ticks - prev) * 10; lead.holdTicks = ticks; }
  }
  update(time: number) {
    for (const [owner, n] of this.holds) {
      if (time > n.timeMs + n.durationMs! + WINDOWS.good) { this.holds.delete(owner); this.finish(n, 'miss', 'tail'); }
      else this.tickHold(n, time);
    }
    for (const n of this.suspended) if (time > n.timeMs + n.durationMs! + WINDOWS.good) { this.suspended.delete(n); this.finish(n, 'miss', 'tail'); }
    while (this.cursor < this.notes.length && this.notes[this.cursor].timeMs < time - WINDOWS.good) {
      const n = this.notes[this.cursor++];
      if (n.state === 'pending') this.finish(n, 'miss', n.type === 'hold' ? 'head' : 'tap');
    }
  }
  // Pause does not judge a Hold. A matching fresh press can rebind it after resume.
  suspendInputs() { for (const n of this.holds.values()) { n.owner = undefined; this.suspended.add(n); this.onHold?.(n, false); } this.holds.clear(); this.active.clear(); }
  cancelInputs(time: number) { for(const n of this.suspended)this.finish(n,'miss','tail');this.suspended.clear(); [...this.active].forEach(owner => this.release(owner, time, true)); this.active.clear(); }
  private recordJudge(n: RuntimeNote, judgement: Judgement, part: JudgePart, feedback: Feedback = judgement) {
    this.counts[judgement]++;
    const value = { perfect: 1000, great: 700, good: 300, miss: 0 }[judgement];
    // Wrong-symbol presses arrive as a miss, so they never score or extend the combo.
    this.score += value;
    if (judgement === 'perfect' || judgement === 'great') { this.combo++; this.comboHits++; this.maxCombo = Math.max(this.maxCombo, this.combo); }
    else this.combo = 0;
    this.onJudge?.(judgement, n, part, feedback);
  }
  private finish(n: RuntimeNote, judgement: Judgement, part: JudgePart = 'tap', feedback: Feedback = judgement) {
    if (n.state === 'done') return;
    // A Dual unit resolves once: the partner closes silently with the same outcome.
    for (const m of [n, n.partner]) {
      if (!m || m.state === 'done') continue;
      m.state = 'done'; m.judgement = judgement;
      if (m.owner) this.holds.delete(m.owner);
      this.suspended.delete(m);
      if (m.type === 'hold') this.onHold?.(m, false);
    }
    this.recordJudge(n.lead ? n : n.partner!, judgement, part, feedback);
  }
  get accuracy() { return this.maxPossibleCombo ? (this.comboHits / this.maxPossibleCombo) * 100 : 0; }
  get complete() { return this.notes.every(n => n.state === 'done'); }
}
