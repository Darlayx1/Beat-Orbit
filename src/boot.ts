// One deadline for the whole boot, including demo generation. Diagnostics contain
// stage names and durations only; music and chart data never leave the device.
export class BootSession {
  private controller = new AbortController();
  readonly signal = this.controller.signal;
  readonly diagnostics: { stage: string; elapsedMs: number; outcome: string }[] = [];
  private timer: ReturnType<typeof setTimeout>;
  currentStage = 'Opening local storage';
  constructor(timeoutMs = 14000) {
    this.timer = setTimeout(() => this.controller.abort(new Error(`Timed out: ${this.currentStage}. Retry, or close other BeatOrbit tabs and check site storage permission.`)), timeoutMs);
  }
  async stage<T>(name: string, work: () => Promise<T>): Promise<T> {
    this.signal.throwIfAborted(); this.currentStage = name;
    const start = performance.now();
    let abort: () => void = () => {};
    try {
      return await Promise.race([Promise.resolve().then(() => { this.signal.throwIfAborted(); return work(); }), new Promise<never>((_, reject) => {
        abort = () => reject(this.signal.reason);
        this.signal.addEventListener('abort', abort, { once: true });
      })]);
    } finally {
      this.signal.removeEventListener('abort', abort);
      this.diagnostics.push({ stage: name, elapsedMs: Math.round(performance.now() - start), outcome: this.signal.aborted ? 'cancelled' : 'settled' });
      console.info('[BeatOrbit boot]', this.diagnostics.at(-1));
    }
  }
  finish() { clearTimeout(this.timer); }
  cancel() { this.finish(); this.controller.abort(new Error('Boot attempt superseded.')); }
}
