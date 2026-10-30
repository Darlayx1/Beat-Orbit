import { makeDemoAudio, normalizeAudioMimeType } from './audio';
import { DEMO_SPECS } from './demos';
import { clone, parseChart, type Chart, type Draft, type Result, type Song } from './domain';
import { SchemaNotInitializedError, SupabaseCloudDriver, type CloudDriver } from './cloud-driver';

const DB_NAME = 'beatorbit-local-v1';
type StoredAudio = { data: ArrayBuffer; type: string };

export class ConflictError extends Error {
  constructor() {
    super('This chart changed in another tab or device. Export your work, then reopen the latest version.');
  }
}

export class Repository {
  private db?: IDBDatabase;
  private generation = 0;
  private transactions = new Set<IDBTransaction>();
  private cloudUserId?: string;
  private cloudDriver: CloudDriver;

  constructor(private timeoutMs = 8000, driver?: CloudDriver) {
    this.cloudDriver = driver || new SupabaseCloudDriver();
  }

  enableCloud(userId: string, driver?: CloudDriver) {
    this.cloudUserId = userId;
    if (driver) this.cloudDriver = driver;
  }

  disableCloud() {
    this.cloudUserId = undefined;
  }

  get activeUserId(): string | undefined {
    return this.cloudUserId;
  }

  async open() {
    this.close();
    const generation = this.generation;
    this.db = await new Promise<IDBDatabase>((resolve, reject) => {
      let settled = false;
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      };
      const timer = setTimeout(
        () => fail(new Error('Opening local storage timed out. Close other BeatOrbit tabs and retry.')),
        this.timeoutMs
      );
      let req: IDBOpenDBRequest;
      try {
        req = indexedDB.open(DB_NAME, 1);
      } catch (e) {
        fail(e);
        return;
      }
      req.onupgradeneeded = () => {
        if (settled || generation !== this.generation) {
          req.transaction?.abort();
          return;
        }
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
      req.onerror = () => fail(req.error);
      req.onblocked = () =>
        fail(new Error('Database upgrade blocked. Close other BeatOrbit tabs and retry.'));
      req.onsuccess = () => {
        if (settled || generation !== this.generation) {
          req.result.close();
          fail(new Error('Storage attempt superseded.'));
          return;
        }
        settled = true;
        clearTimeout(timer);
        req.result.onversionchange = () => req.result.close();
        resolve(req.result);
      };
    });
    if (generation !== this.generation) {
      this.db.close();
      this.db = undefined;
      throw new Error('Storage attempt superseded.');
    }

    if (this.cloudUserId) {
      await this.syncFromCloud(this.cloudUserId, generation);
    }
  }

  private async syncFromCloud(userId: string, generation: number) {
    const remote = await this.cloudDriver.fetchWorkspace(userId);
    if (generation !== this.generation || !this.db) {
      throw new Error('Storage attempt superseded.');
    }

    const previousUser = await this.read<string | undefined>('settings', 'active-user-id');
    const switchedUser = previousUser !== undefined && previousUser !== userId;

    await this.run<void>(
      ['songs', 'audio', 'charts', 'drafts', 'results', 'settings'],
      'readwrite',
      tx => {
        const songStore = tx.objectStore('songs');
        const audioStore = tx.objectStore('audio');
        const chartStore = tx.objectStore('charts');
        const draftStore = tx.objectStore('drafts');
        const resultStore = tx.objectStore('results');
        const settingsStore = tx.objectStore('settings');

        if (switchedUser) {
          audioStore.clear();
        }

        songStore.clear();
        chartStore.clear();
        draftStore.clear();
        resultStore.clear();

        for (const s of remote.songs) songStore.put(s);
        for (const c of remote.charts) chartStore.put(parseChart(c));
        for (const d of remote.drafts) draftStore.put({ ...d, chart: parseChart(d.chart) });
        for (const r of remote.results) resultStore.put(r);

        settingsStore.put(userId, 'active-user-id');
        if (remote.demoSeeded !== undefined) {
          settingsStore.put(remote.demoSeeded, 'demo-seeded');
        } else {
          settingsStore.delete('demo-seeded');
        }
      }
    );
  }

  private run<T>(
    names: string[],
    mode: IDBTransactionMode,
    work: (tx: IDBTransaction, set: (value: T) => void, fail: (error: Error) => void) => void
  ): Promise<T> {
    if (!this.db) return Promise.reject(new Error('Local storage is not available.'));
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(names, mode);
      this.transactions.add(tx);
      let result: T,
        failure: Error | undefined,
        settled = false;
      const finish = (error?: Error | DOMException | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.transactions.delete(tx);
        if (error) reject(error);
        else resolve(result);
      };
      const timer = setTimeout(() => {
        failure = new Error('Local storage operation timed out. Check site storage permission and retry.');
        try {
          tx.abort();
        } catch {
          /* already inactive */
        }
        finish(failure);
      }, this.timeoutMs);
      tx.oncomplete = () => finish();
      tx.onerror = () => {
        /* abort reports the transaction failure */
      };
      tx.onabort = () => finish(failure || tx.error || new Error('Storage transaction aborted.'));
      try {
        work(
          tx,
          value => {
            result = value;
          },
          e => {
            failure = e;
            tx.abort();
          }
        );
      } catch (e) {
        failure = e as Error;
        try {
          tx.abort();
        } catch {
          finish(failure);
        }
      }
    });
  }

  private read<T>(store: string, key?: IDBValidKey): Promise<T> {
    return this.run([store], 'readonly', (tx, set) => {
      const object = tx.objectStore(store);
      const req = key === undefined ? object.getAll() : object.get(key);
      req.onsuccess = () => set(req.result);
    });
  }

  songs() {
    return this.read<Song[]>('songs');
  }
  async charts() {
    return (await this.read<Chart[]>('charts')).map(parseChart);
  }
  results() {
    return this.read<Result[]>('results');
  }
  async drafts() {
    return (await this.read<Draft[]>('drafts')).map(d => ({ ...d, chart: parseChart(d.chart) }));
  }
  async draft(chartId: string) {
    const d = await this.read<Draft | undefined>('drafts', chartId);
    return d ? { ...d, chart: parseChart(d.chart) } : undefined;
  }

  async audio(songId: string): Promise<Blob | undefined> {
    const cached = await this.read<StoredAudio | Blob | undefined>('audio', songId);
    if (cached) {
      if (cached instanceof Blob) return cached;
      return new Blob([cached.data], { type: cached.type });
    }

    // Cache miss: check if this is a demo track that can be synthesized locally
    const song = await this.read<Song | undefined>('songs', songId);
    if (song?.source === 'demo') {
      const spec = DEMO_SPECS.find(d => d.id === song.id) || DEMO_SPECS[0];
      const blob = makeDemoAudio(spec.bpm, spec.seconds, spec.root);
      const prepared = await this.prepareAudio(blob);
      await this.run<void>(['audio'], 'readwrite', tx => {
        tx.objectStore('audio').put(prepared, songId);
      });
      return blob;
    }

    // Cache miss on imported song: fetch from Supabase Storage bucket
    if (this.cloudUserId) {
      const downloaded = await this.cloudDriver.downloadAudio(this.cloudUserId, songId);
      if (downloaded) {
        const prepared = await this.prepareAudio(downloaded);
        await this.run<void>(['audio'], 'readwrite', tx => {
          tx.objectStore('audio').put(prepared, songId);
        });
        return downloaded;
      }
    }

    return undefined;
  }

  private async prepareAudio(blob: Blob): Promise<StoredAudio> {
    if (!this.db) throw new Error('Local storage is not available.');
    const generation = this.generation;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // WebKit can stall or reject Blob/File serialization in IndexedDB. Read
      // bytes before opening a transaction, which must never wait on Blob I/O.
      const data = await Promise.race([
        blob.arrayBuffer(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Preparing local audio timed out. Retry this operation.')),
            this.timeoutMs
          );
        })
      ]);
      if (generation !== this.generation) throw new Error('Storage attempt superseded.');
      const type = normalizeAudioMimeType(blob.type, (blob as { name?: string }).name);
      return { data, type };
    } finally {
      clearTimeout(timer);
    }
  }

  async setting(key: string) {
    const localVal = await this.read<unknown>('settings', key);
    if (localVal !== undefined || !this.cloudUserId) return localVal;
    const remoteVal = await this.cloudDriver.getSetting(this.cloudUserId, key);
    if (remoteVal !== undefined) {
      await this.run<void>(['settings'], 'readwrite', tx => {
        tx.objectStore('settings').put(remoteVal, key);
      });
    }
    return remoteVal;
  }

  async seed(songs: Song[], audio: Blob[], charts: Chart[]) {
    const prepared = await Promise.all(audio.map(blob => this.prepareAudio(blob)));
    if (this.cloudUserId) {
      await this.cloudDriver.seed(this.cloudUserId, songs, charts);
    }
    return this.run<void>(['songs', 'audio', 'charts', 'settings'], 'readwrite', tx => {
      const songStore = tx.objectStore('songs');
      const audioStore = tx.objectStore('audio');
      const chartStore = tx.objectStore('charts');
      const settingsStore = tx.objectStore('settings');

      const songKeysReq = songStore.getAllKeys();
      const chartKeysReq = chartStore.getAllKeys();
      const settingsReq = settingsStore.get('demo-seeded');

      let songKeys: IDBValidKey[] | undefined;
      let chartKeys: IDBValidKey[] | undefined;
      let written = false;

      const tryWrite = () => {
        if (written || !songKeys || !chartKeys || settingsReq.readyState !== 'done') return;
        written = true;
        if (settingsReq.result === 2) return;
        const songKeySet = new Set(songKeys.map(String));
        const chartKeySet = new Set(chartKeys.map(String));

        songs.forEach((s, i) => {
          if (!songKeySet.has(s.id)) {
            songStore.add(s);
            audioStore.add(prepared[i], s.id);
          }
        });
        charts.forEach(c => {
          if (!chartKeySet.has(c.chartId)) {
            chartStore.add(parseChart(c));
          }
        });
        settingsStore.put(2, 'demo-seeded');
      };

      settingsReq.onsuccess = tryWrite;
      songKeysReq.onsuccess = () => {
        songKeys = songKeysReq.result;
        tryWrite();
      };
      chartKeysReq.onsuccess = () => {
        chartKeys = chartKeysReq.result;
        tryWrite();
      };
    });
  }

  async addSong(song: Song, blob: Blob) {
    const audio = await this.prepareAudio(blob);
    if (this.cloudUserId) {
      await this.cloudDriver.addSong(this.cloudUserId, song, audio.data, audio.type);
    }
    return this.run<void>(['songs', 'audio'], 'readwrite', tx => {
      tx.objectStore('songs').add(song);
      tx.objectStore('audio').add(audio, song.id);
    });
  }

  async updateSong(song: Song) {
    if (this.cloudUserId) {
      await this.cloudDriver.updateSong(this.cloudUserId, song);
    }
    return this.run<void>(['songs'], 'readwrite', tx => {
      tx.objectStore('songs').put(song);
    });
  }

  async relinkSong(song: Song, blob: Blob) {
    const audio = await this.prepareAudio(blob);
    if (this.cloudUserId) {
      await this.cloudDriver.relinkSong(this.cloudUserId, song, audio.data, audio.type);
    }
    return this.run<void>(['songs', 'audio'], 'readwrite', tx => {
      tx.objectStore('songs').put(song);
      tx.objectStore('audio').put(audio, song.id);
    });
  }

  async saveChart(chart: Chart, expectedRevision: number): Promise<Chart> {
    const value = parseChart(clone(chart));
    if (this.cloudUserId) {
      const remoteSaved = await this.cloudDriver.saveChart(
        this.cloudUserId,
        value,
        expectedRevision,
        () => new ConflictError()
      );
      await this.run<void>(['charts', 'drafts'], 'readwrite', tx => {
        tx.objectStore('charts').put(remoteSaved);
        tx.objectStore('drafts').delete(remoteSaved.chartId);
      });
      return remoteSaved;
    }

    return this.run(['charts', 'drafts'], 'readwrite', (tx, set, fail) => {
      const charts = tx.objectStore('charts');
      const req = charts.get(value.chartId);
      req.onsuccess = () => {
        const old = req.result as Chart | undefined;
        if ((old?.revision || 0) !== expectedRevision) return fail(new ConflictError());
        value.revision = expectedRevision + 1;
        value.updatedAt = new Date().toISOString();
        charts.put(value);
        tx.objectStore('drafts').delete(value.chartId);
        set(value);
      };
    });
  }

  async saveDraft(draft: Draft) {
    parseChart(draft.chart);
    if (this.cloudUserId) {
      await this.cloudDriver.saveDraft(this.cloudUserId, draft, () => new ConflictError());
      await this.run<void>(['drafts'], 'readwrite', tx => {
        tx.objectStore('drafts').put({ ...clone(draft), chart: parseChart(draft.chart) });
      });
      return;
    }

    return this.run<void>(['charts', 'drafts'], 'readwrite', (tx, _set, fail) => {
      const req = tx.objectStore('charts').get(draft.chartId);
      req.onsuccess = () => {
        if (((req.result as Chart | undefined)?.revision || 0) !== draft.baseRevision)
          return fail(new ConflictError());
        tx.objectStore('drafts').put({ ...clone(draft), chart: parseChart(draft.chart) });
      };
    });
  }

  async deleteDraft(chartId: string) {
    if (this.cloudUserId) {
      await this.cloudDriver.deleteDraft(this.cloudUserId, chartId);
    }
    return this.run<void>(['drafts'], 'readwrite', tx => {
      tx.objectStore('drafts').delete(chartId);
    });
  }

  async deleteChart(chartId: string) {
    if (this.cloudUserId) {
      await this.cloudDriver.deleteChart(this.cloudUserId, chartId);
    }
    return this.run<void>(['charts', 'drafts', 'results'], 'readwrite', tx => {
      tx.objectStore('charts').delete(chartId);
      tx.objectStore('drafts').delete(chartId);
      const req = tx.objectStore('results').index('chartId').getAllKeys(chartId);
      req.onsuccess = () => req.result.forEach(key => tx.objectStore('results').delete(key));
    });
  }

  async deleteSong(songId: string) {
    if (this.cloudUserId) {
      await this.cloudDriver.deleteSong(this.cloudUserId, songId);
    }
    return this.run<void>(['songs', 'audio', 'charts', 'drafts', 'results'], 'readwrite', tx => {
      tx.objectStore('songs').delete(songId);
      tx.objectStore('audio').delete(songId);
      const orphanDrafts = tx.objectStore('drafts').index('songId').getAllKeys(songId);
      orphanDrafts.onsuccess = () =>
        orphanDrafts.result.forEach(key => tx.objectStore('drafts').delete(key));
      const charts = tx.objectStore('charts').index('songId').getAll(songId);
      charts.onsuccess = () =>
        (charts.result as Chart[]).forEach(c => {
          tx.objectStore('charts').delete(c.chartId);
          tx.objectStore('drafts').delete(c.chartId);
          const results = tx.objectStore('results').index('chartId').getAllKeys(c.chartId);
          results.onsuccess = () =>
            results.result.forEach(key => tx.objectStore('results').delete(key));
        });
    });
  }

  async addResult(result: Result) {
    if (this.cloudUserId) {
      await this.cloudDriver.addResult(this.cloudUserId, result);
    }
    return this.run<void>(['results'], 'readwrite', tx => {
      tx.objectStore('results').add(result);
    });
  }

  close() {
    ++this.generation;
    for (const tx of this.transactions) {
      try {
        tx.abort();
      } catch {
        /* already inactive */
      }
    }
    this.db?.close();
    this.db = undefined;
  }
}

export function storageMessage(error: unknown) {
  if (error instanceof SchemaNotInitializedError) return error.message;
  if (error instanceof DOMException && error.name === 'QuotaExceededError')
    return 'Storage quota is full. Export your chart, then free space in your library.';
  return error instanceof Error ? error.message : 'Storage could not complete this operation.';
}
