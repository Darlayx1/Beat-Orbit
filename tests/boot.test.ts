import { afterEach, expect, it, vi } from 'vitest';
import { BootSession } from '../src/boot';
import { makeDemoAudio, makeDemoAudioAsync } from '../src/audio';
import { Repository } from '../src/storage';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it('stops an unresolved boot within its shared deadline and rejects subsequent stages', async () => {
  vi.useFakeTimers(); const session = new BootSession(14000);
  const work = session.stage('Reading settings', () => new Promise(() => {}));
  const check = expect(work).rejects.toThrow(/Reading settings/);
  await vi.advanceTimersByTimeAsync(14000); await check;
  await expect(session.stage('Stale work', async () => 1)).rejects.toThrow(/Reading settings/);
  session.finish();
});
it('ignores completion from an expired stage', async () => {
  vi.useFakeTimers(); const session = new BootSession(20);
  let complete!: (value: number) => void;
  const work = session.stage('Open', () => new Promise<number>(resolve => { complete = resolve; }));
  const check = expect(work).rejects.toThrow(/Timed out/);
  await vi.advanceTimersByTimeAsync(20); await check; complete(42);
  expect(session.signal.aborted).toBe(true); session.finish();
});
it('closes a database that opens after timeout', async () => {
  vi.useFakeTimers(); const request = {} as IDBOpenDBRequest;
  const close = vi.fn(); Object.assign(request, { result: { close } });
  vi.stubGlobal('indexedDB', { open: () => request });
  const repo = new Repository(20), work = repo.open();
  const check = expect(work).rejects.toThrow(/timed out/);
  await vi.advanceTimersByTimeAsync(20); await check;
  request.onsuccess?.call(request, {} as Event);
  expect(close).toHaveBeenCalledOnce();
  await expect(repo.songs()).rejects.toThrow(/not available/);
});
it('aborts stalled transactions and ignores late completion', async () => {
  vi.useFakeTimers();
  const tx = { abort: vi.fn(), objectStore: () => ({ getAll: () => ({}) }) };
  const request = { result: { close() {}, transaction: () => tx } } as unknown as IDBOpenDBRequest;
  vi.stubGlobal('indexedDB', { open: () => request });
  const repo = new Repository(20), opening = repo.open();
  request.onsuccess?.call(request, {} as Event); await opening;
  const work = repo.songs(), check = expect(work).rejects.toThrow(/timed out/);
  await vi.advanceTimersByTimeAsync(20); await check;
  expect(tx.abort).toHaveBeenCalledOnce(); repo.close();
});
it('generates identical PCM in chunks and supports cancellation', async () => {
  const blob = await makeDemoAudioAsync(120, 1.1);
  expect(await blob.arrayBuffer()).toEqual(await makeDemoAudio(120, 1.1).arrayBuffer());
  const controller = new AbortController(); controller.abort(new Error('Cancelled'));
  await expect(makeDemoAudioAsync(120, 64, 220, controller.signal)).rejects.toThrow('Cancelled');
});
