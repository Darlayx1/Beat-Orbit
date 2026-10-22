import { clone, parseChart, type Chart, type Draft, type Result, type Song } from './domain';

const DB_NAME = 'beatorbit-local-v1';
export class ConflictError extends Error { constructor() { super('This chart changed in another tab. Export your work, then reopen the latest version.'); } }
export class Repository {
  private db?: IDBDatabase;
  async open() {
    this.db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('songs', { keyPath: 'id' });
        db.createObjectStore('audio');
        const charts = db.createObjectStore('charts', { keyPath: 'chartId' });
        charts.createIndex('songId', 'songId');
        db.createObjectStore('drafts', { keyPath: 'chartId' }).createIndex('songId', 'chart.songId');
        const results = db.createObjectStore('results', { keyPath: 'id' });
        results.createIndex('chartId', 'chartId');
        db.createObjectStore('settings');
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Database upgrade blocked. Close other BeatOrbit tabs and reload.'));
      req.onsuccess = () => { req.result.onversionchange = () => req.result.close(); resolve(req.result); };
    });
  }
  private run<T>(names: string[], mode: IDBTransactionMode, work: (tx: IDBTransaction, set: (value: T) => void, fail: (error: Error) => void) => void): Promise<T> {
    if (!this.db) return Promise.reject(new Error('Local storage is not available.'));
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(names, mode);
      let result: T, failure: Error | undefined;
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => { /* abort reports the transaction failure */ };
      tx.onabort = () => reject(failure || tx.error || new Error('Storage transaction aborted.'));
      try { work(tx, value => { result = value; }, e => { failure = e; tx.abort(); }); }
      catch (e) { failure = e as Error; tx.abort(); }
    });
  }
  private read<T>(store: string, key?: IDBValidKey): Promise<T> {
    return this.run([store], 'readonly', (tx, set) => {
      const object = tx.objectStore(store);
      const req = key === undefined ? object.getAll() : object.get(key);
      req.onsuccess = () => set(req.result);
    });
  }
  songs() { return this.read<Song[]>('songs'); }
  charts() { return this.read<Chart[]>('charts'); }
  results() { return this.read<Result[]>('results'); }
  drafts() { return this.read<Draft[]>('drafts'); }
  draft(chartId: string) { return this.read<Draft | undefined>('drafts', chartId); }
  audio(songId: string) { return this.read<Blob | undefined>('audio', songId); }
  setting(key: string) { return this.read<unknown>('settings', key); }
  async seed(songs: Song[], audio: Blob[], charts: Chart[]) {
    return this.run<void>(['songs', 'audio', 'charts', 'settings'], 'readwrite', tx => {
      const req = tx.objectStore('settings').get('demo-seeded');
      req.onsuccess = () => {
        if (req.result) return;
        songs.forEach((s, i) => { tx.objectStore('songs').put(s); tx.objectStore('audio').put(audio[i], s.id); });
        charts.forEach(c => tx.objectStore('charts').put(parseChart(c)));
        tx.objectStore('settings').put(true, 'demo-seeded');
      };
    });
  }
  async addSong(song: Song, blob: Blob) {
    return this.run<void>(['songs', 'audio'], 'readwrite', tx => { tx.objectStore('songs').add(song); tx.objectStore('audio').add(blob, song.id); });
  }
  async updateSong(song: Song) { return this.run<void>(['songs'], 'readwrite', tx => { tx.objectStore('songs').put(song); }); }
  async relinkSong(song: Song, blob: Blob) {
    return this.run<void>(['songs', 'audio'], 'readwrite', tx => { tx.objectStore('songs').put(song); tx.objectStore('audio').put(blob, song.id); });
  }
  async saveChart(chart: Chart, expectedRevision: number): Promise<Chart> {
    const value = parseChart(clone(chart));
    return this.run(['charts', 'drafts'], 'readwrite', (tx, set, fail) => {
      const charts = tx.objectStore('charts');
      const req = charts.get(value.chartId);
      req.onsuccess = () => {
        const old = req.result as Chart | undefined;
        if ((old?.revision || 0) !== expectedRevision) return fail(new ConflictError());
        value.revision = expectedRevision + 1; value.updatedAt = new Date().toISOString();
        charts.put(value); tx.objectStore('drafts').delete(value.chartId); set(value);
      };
    });
  }
  async saveDraft(draft: Draft) {
    parseChart(draft.chart);
    return this.run<void>(['charts', 'drafts'], 'readwrite', (tx, _set, fail) => {
      const req = tx.objectStore('charts').get(draft.chartId);
      req.onsuccess = () => {
        if (((req.result as Chart | undefined)?.revision || 0) !== draft.baseRevision) return fail(new ConflictError());
        tx.objectStore('drafts').put(clone(draft));
      };
    });
  }
  deleteDraft(chartId: string) { return this.run<void>(['drafts'], 'readwrite', tx => { tx.objectStore('drafts').delete(chartId); }); }
  async deleteChart(chartId: string) {
    return this.run<void>(['charts', 'drafts', 'results'], 'readwrite', tx => {
      tx.objectStore('charts').delete(chartId); tx.objectStore('drafts').delete(chartId);
      const req = tx.objectStore('results').index('chartId').getAllKeys(chartId);
      req.onsuccess = () => req.result.forEach(key => tx.objectStore('results').delete(key));
    });
  }
  async deleteSong(songId: string) {
    return this.run<void>(['songs', 'audio', 'charts', 'drafts', 'results'], 'readwrite', tx => {
      tx.objectStore('songs').delete(songId); tx.objectStore('audio').delete(songId);
      const orphanDrafts = tx.objectStore('drafts').index('songId').getAllKeys(songId);
      orphanDrafts.onsuccess = () => orphanDrafts.result.forEach(key => tx.objectStore('drafts').delete(key));
      const charts = tx.objectStore('charts').index('songId').getAll(songId);
      charts.onsuccess = () => (charts.result as Chart[]).forEach(c => {
        tx.objectStore('charts').delete(c.chartId); tx.objectStore('drafts').delete(c.chartId);
        const results = tx.objectStore('results').index('chartId').getAllKeys(c.chartId);
        results.onsuccess = () => results.result.forEach(key => tx.objectStore('results').delete(key));
      });
    });
  }
  addResult(result: Result) { return this.run<void>(['results'], 'readwrite', tx => { tx.objectStore('results').add(result); }); }
  close() { this.db?.close(); }
}
export function storageMessage(error: unknown) {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') return 'Local storage is full. Export your chart, then free space in your library.';
  return error instanceof Error ? error.message : 'Local storage could not complete this operation.';
}
