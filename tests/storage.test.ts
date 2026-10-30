import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { ConflictError, Repository } from '../src/storage';
import { SchemaNotInitializedError, SupabaseCloudDriver, type CloudDriver } from '../src/cloud-driver';
import { clone, parseChart, type Chart, type Draft, type Result, type Song } from '../src/domain';
import { chart, song, tap } from './fixtures';

let repo: Repository;
beforeEach(async()=>{globalThis.indexedDB=new IDBFactory();repo=new Repository();await repo.open();});
afterEach(()=>{repo.close();vi.restoreAllMocks();vi.useRealTimers();});
describe('transactional local library',()=>{
  it('seeds idempotently and preserves preexisting song/chart data without a seed marker',async()=>{
    const c=chart();await repo.addSong({...song,title:'My title'},new Blob(['my audio']));
    const saved=await repo.saveChart({...c,name:'My edited chart'},0);
    await repo.seed([song],[new Blob(['demo audio'])],[c]);
    await repo.seed([song],[new Blob(['replacement'])],[c]);
    expect((await repo.songs())[0].title).toBe('My title');
    expect(await(await repo.audio(song.id))!.text()).toBe('my audio');
    expect(await repo.charts()).toEqual([saved]);
  });
  it('persists Blob audio and metadata across repository reopen',async()=>{
    await repo.addSong(song,new Blob(['original-audio'],{type:'audio/wav'}));
    repo.close();repo=new Repository();await repo.open();
    expect(await repo.songs()).toEqual([song]);
    expect(await(await repo.audio(song.id))!.text()).toBe('original-audio');
    expect((await repo.audio(song.id))!.type).toBe('audio/wav');
  });
  it('seeds, imports, and relinks audio when the browser rejects IndexedDB Blob writes',async()=>{
    for(const method of ['add','put'] as const){
      const original=IDBObjectStore.prototype[method];
      vi.spyOn(IDBObjectStore.prototype,method).mockImplementation(function(this:IDBObjectStore,...args:Parameters<typeof original>){
        if(this.name==='audio'&&args[0] instanceof Blob)throw new DOMException('Error preparing Blob/File data','UnknownError');
        return original.apply(this,args);
      });
    }
    const demo=new Blob([new Uint8Array([0,255,128,42])],{type:'audio/wav'});
    await repo.seed([song],[demo],[chart()]);
    expect(await(await repo.audio(song.id))!.arrayBuffer()).toEqual(await demo.arrayBuffer());
    const imported={...song,id:'imported-song'};
    await repo.addSong(imported,new Blob(['imported'],{type:'audio/mpeg'}));
    await repo.relinkSong({...imported,title:'Relinked'},new Blob(['replacement'],{type:'audio/ogg'}));
    repo.close();repo=new Repository();await repo.open();
    const audio=(await repo.audio(imported.id))!;
    expect(await audio.text()).toBe('replacement');expect(audio.type).toBe('audio/ogg');
    expect((await repo.songs()).find(s=>s.id===imported.id)!.title).toBe('Relinked');
  });
  it('reads legacy Blob audio without rewriting or upgrading the database',async()=>{
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{
      const request=indexedDB.open('beatorbit-local-v1',1);
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
    try{
      await new Promise<void>((resolve,reject)=>{
        const tx=db.transaction('audio','readwrite');
        tx.objectStore('audio').add(new Blob(['legacy-audio'],{type:'audio/wav'}),song.id);
        tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);
      });
    }finally{db.close();}
    const audio=(await repo.audio(song.id))!;
    expect(await audio.text()).toBe('legacy-audio');expect(audio.type).toBe('audio/wav');
    expect(await repo.audio('missing')).toBeUndefined();
  });
  it('keeps seed data and the seed marker atomic when audio persistence fails',async()=>{
    const add=IDBObjectStore.prototype.add;
    vi.spyOn(IDBObjectStore.prototype,'add').mockImplementation(function(this:IDBObjectStore,...args:Parameters<typeof add>){
      if(this.name==='audio')throw new DOMException('Quota reached','QuotaExceededError');
      return add.apply(this,args);
    });
    // Exceptions from an IndexedDB request callback abort the transaction;
    // fake-indexeddb reports AbortError rather than the original quota error.
    await expect(repo.seed([song],[new Blob(['demo'])],[chart()])).rejects.toThrow();
    expect(await repo.songs()).toEqual([]);expect(await repo.charts()).toEqual([]);
    expect(await repo.audio(song.id)).toBeUndefined();expect(await repo.setting('demo-seeded')).toBeUndefined();
  });
  it('does not create song metadata if audio preparation fails',async()=>{
    const blob=new Blob(['audio']);vi.spyOn(blob,'arrayBuffer').mockRejectedValue(new Error('Unreadable audio'));
    await expect(repo.addSong(song,blob)).rejects.toThrow('Unreadable audio');
    expect(await repo.songs()).toEqual([]);
  });
  it('rejects audio prepared for a closed repository instead of writing into a reopened session',async()=>{
    const blob=new Blob(['audio']);let complete!:(data:ArrayBuffer)=>void;
    vi.spyOn(blob,'arrayBuffer').mockImplementation(()=>new Promise(resolve=>{complete=resolve;}));
    const pending=repo.addSong(song,blob),check=expect(pending).rejects.toThrow(/superseded/);
    repo.close();await repo.open();complete(new ArrayBuffer(1));await check;
    expect(await repo.songs()).toEqual([]);
  });
  it('bounds stalled audio preparation without starting a storage transaction',async()=>{
    repo.close();repo=new Repository(20);await repo.open();
    vi.useFakeTimers();const blob=new Blob(['audio']);
    vi.spyOn(blob,'arrayBuffer').mockImplementation(()=>new Promise(()=>{}));
    const check=expect(repo.addSong(song,blob)).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(20);await check;vi.useRealTimers();
    expect(await repo.songs()).toEqual([]);
  });
  it('edits metadata without rewriting audio or related charts',async()=>{
    await repo.addSong(song,new Blob(['audio']));const saved=await repo.saveChart(chart(),0);
    await repo.updateSong({...song,title:'New title'});
    expect((await repo.songs())[0].title).toBe('New title');
    expect(await(await repo.audio(song.id))!.text()).toBe('audio');
    expect(await repo.charts()).toEqual([saved]);
  });
  it('rolls back a failed song transaction rather than leaving partial records',async()=>{
    const add=IDBObjectStore.prototype.add;
    vi.spyOn(IDBObjectStore.prototype,'add').mockImplementation(function(this:IDBObjectStore,...args:Parameters<typeof add>){
      if(this.name==='audio')throw new DOMException('Quota reached','QuotaExceededError');
      return add.apply(this,args);
    });
    await expect(repo.addSong(song,new Blob(['audio']))).rejects.toMatchObject({name:'QuotaExceededError'});
    expect(await repo.songs()).toEqual([]);expect(await repo.audio(song.id)).toBeUndefined();
  });
  it('saves revisions and clears the matching draft atomically',async()=>{
    const c=chart();await repo.saveDraft({chartId:c.chartId,chart:c,baseRevision:0,savedAt:new Date().toISOString()});
    const saved=await repo.saveChart(c,0);expect(saved.revision).toBe(1);
    expect(await repo.draft(c.chartId)).toBeUndefined();expect((await repo.charts())[0].revision).toBe(1);
  });
  it('restores a new-chart draft even before the first explicit chart save',async()=>{
    await repo.addSong(song,new Blob(['audio']));const c=chart();
    await repo.saveDraft({chartId:c.chartId,chart:c,baseRevision:0,savedAt:new Date().toISOString()});
    repo.close();repo=new Repository();await repo.open();
    expect((await repo.drafts())[0].chart.notes).toEqual(c.notes);
    expect(await repo.charts()).toHaveLength(0);
  });
  it('prevents two tabs from silently overwriting one revision',async()=>{
    const saved=await repo.saveChart(chart(),0),other=new Repository();await other.open();
    const outcomes=await Promise.allSettled([repo.saveChart({...saved,name:'One'},1),other.saveChart({...saved,name:'Two'},1)]);
    expect(outcomes.filter(o=>o.status==='fulfilled')).toHaveLength(1);
    const failure=outcomes.find(o=>o.status==='rejected') as PromiseRejectedResult;
    expect(failure.reason).toBeInstanceOf(ConflictError);
    expect((await repo.charts())[0].revision).toBe(2);other.close();
  });
  it('rejects stale drafts after a newer explicit save',async()=>{
    const saved=await repo.saveChart(chart(),0);await repo.saveChart(saved,1);
    await expect(repo.saveDraft({chartId:saved.chartId,chart:saved,baseRevision:1,savedAt:new Date().toISOString()})).rejects.toBeInstanceOf(ConflictError);
  });
  it('keeps difficulty charts independent',async()=>{
    const easy=chart(),hard=chart([tap(2000)]);easy.difficulty='easy';hard.difficulty='hard';
    const e=await repo.saveChart(easy,0);await repo.saveChart(hard,0);await repo.saveChart({...e,notes:[]},1);
    expect((await repo.charts()).find(c=>c.chartId===hard.chartId)!.notes).toEqual(hard.notes);
  });
  it('deletes audio, charts, results, and unsaved-chart drafts with a song',async()=>{
    await repo.addSong(song,new Blob(['audio']));const saved=await repo.saveChart(chart(),0),unsaved=chart();
    await repo.saveDraft({chartId:unsaved.chartId,chart:unsaved,baseRevision:0,savedAt:new Date().toISOString()});
    await repo.addResult({id:'result',chartId:saved.chartId,revision:1,title:song.title,score:1000,accuracy:100,maxCombo:1,perfect:1,great:0,good:0,miss:0,createdAt:new Date().toISOString()});
    await repo.deleteSong(song.id);
    expect(await repo.songs()).toEqual([]);expect(await repo.charts()).toEqual([]);expect(await repo.drafts()).toEqual([]);expect(await repo.results()).toEqual([]);expect(await repo.audio(song.id)).toBeUndefined();
  });
});

class InMemoryCloudDriver implements CloudDriver {
  private songsByUser = new Map<string, Map<string, Song>>();
  private chartsByUser = new Map<string, Map<string, Chart>>();
  private draftsByUser = new Map<string, Map<string, Draft>>();
  private resultsByUser = new Map<string, Map<string, Result>>();
  private settingsByUser = new Map<string, Map<string, unknown>>();
  private audioBucket = new Map<string, Blob>();

  private map<T>(store: Map<string, Map<string, T>>, userId: string): Map<string, T> {
    if (!store.has(userId)) store.set(userId, new Map());
    return store.get(userId)!;
  }

  async fetchWorkspace(userId: string) {
    return {
      songs: Array.from(this.map(this.songsByUser, userId).values()).map(clone),
      charts: Array.from(this.map(this.chartsByUser, userId).values()).map(clone),
      drafts: Array.from(this.map(this.draftsByUser, userId).values()).map(clone),
      results: Array.from(this.map(this.resultsByUser, userId).values()).map(clone),
      demoSeeded: this.map(this.settingsByUser, userId).get('demo-seeded') as number | undefined
    };
  }
  async getSetting(userId: string, key: string) {
    return this.map(this.settingsByUser, userId).get(key);
  }
  async setSetting(userId: string, key: string, value: unknown) {
    this.map(this.settingsByUser, userId).set(key, clone(value));
  }
  async seed(userId: string, songs: Song[], charts: Chart[]) {
    const sMap = this.map(this.songsByUser, userId);
    const cMap = this.map(this.chartsByUser, userId);
    if (this.map(this.settingsByUser, userId).get('demo-seeded') === 2) return;
    songs.forEach(s => { if (!sMap.has(s.id)) sMap.set(s.id, clone(s)); });
    charts.forEach(c => { if (!cMap.has(c.chartId)) cMap.set(c.chartId, parseChart(clone(c))); });
    this.map(this.settingsByUser, userId).set('demo-seeded', 2);
  }
  async addSong(userId: string, s: Song, audioData: ArrayBuffer, mimeType: string) {
    if (s.source === 'imported') {
      this.audioBucket.set(`${userId}/${s.id}`, new Blob([audioData], { type: mimeType }));
    }
    this.map(this.songsByUser, userId).set(s.id, clone(s));
  }
  async updateSong(userId: string, s: Song) {
    this.map(this.songsByUser, userId).set(s.id, clone(s));
  }
  async relinkSong(userId: string, s: Song, audioData: ArrayBuffer, mimeType: string) {
    this.audioBucket.set(`${userId}/${s.id}`, new Blob([audioData], { type: mimeType }));
    this.map(this.songsByUser, userId).set(s.id, clone(s));
  }
  async downloadAudio(userId: string, songId: string) {
    return this.audioBucket.get(`${userId}/${songId}`);
  }
  async saveChart(userId: string, c: Chart, expectedRevision: number, onConflict: () => Error) {
    const cMap = this.map(this.chartsByUser, userId);
    const current = cMap.get(c.chartId)?.revision || 0;
    if (current !== expectedRevision) throw onConflict();
    const updated = parseChart({ ...clone(c), revision: expectedRevision + 1, updatedAt: new Date().toISOString() });
    cMap.set(updated.chartId, updated);
    this.map(this.draftsByUser, userId).delete(updated.chartId);
    return clone(updated);
  }
  async saveDraft(userId: string, d: Draft, onConflict: () => Error) {
    const current = this.map(this.chartsByUser, userId).get(d.chartId)?.revision || 0;
    if (current !== d.baseRevision) throw onConflict();
    this.map(this.draftsByUser, userId).set(d.chartId, clone(d));
  }
  async deleteDraft(userId: string, chartId: string) {
    this.map(this.draftsByUser, userId).delete(chartId);
  }
  async deleteChart(userId: string, chartId: string) {
    this.map(this.chartsByUser, userId).delete(chartId);
    this.map(this.draftsByUser, userId).delete(chartId);
    const rMap = this.map(this.resultsByUser, userId);
    for (const [k, r] of rMap.entries()) if (r.chartId === chartId) rMap.delete(k);
  }
  async deleteSong(userId: string, songId: string) {
    this.map(this.songsByUser, userId).delete(songId);
    this.audioBucket.delete(`${userId}/${songId}`);
    const dMap = this.map(this.draftsByUser, userId);
    for (const [k, d] of dMap.entries()) if (d.chart.songId === songId) dMap.delete(k);
    const cMap = this.map(this.chartsByUser, userId);
    for (const [cid, c] of cMap.entries()) {
      if (c.songId === songId) {
        cMap.delete(cid);
        dMap.delete(cid);
        const rMap = this.map(this.resultsByUser, userId);
        for (const [rid, r] of rMap.entries()) if (r.chartId === cid) rMap.delete(rid);
      }
    }
  }
  async addResult(userId: string, r: Result) {
    this.map(this.resultsByUser, userId).set(r.id, clone(r));
  }
}

describe('Supabase hybrid cloud storage & multi-user isolation', () => {
  it('isolates songs, charts, drafts, and audio per authenticated user account', async () => {
    const cloud = new InMemoryCloudDriver();
    const repoA = new Repository(8000, cloud);
    repoA.enableCloud('user-alpha', cloud);
    await repoA.open();
    await repoA.addSong({ ...song, id: 'track-1', title: 'Alpha Exclusive' }, new Blob(['alpha-bytes'], { type: 'audio/wav' }));
    await repoA.saveChart({ ...chart(), chartId: 'chart-alpha', songId: 'track-1', name: 'Alpha Beatmap' }, 0);
    repoA.close();

    // User Beta logs in on the same browser: previous user's local cache is cleared and isolated
    const repoB = new Repository(8000, cloud);
    repoB.enableCloud('user-beta', cloud);
    await repoB.open();
    expect(await repoB.songs()).toEqual([]);
    expect(await repoB.charts()).toEqual([]);
    expect(await repoB.audio('track-1')).toBeUndefined();

    await repoB.addSong({ ...song, id: 'track-1', title: 'Beta Track' }, new Blob(['beta-bytes'], { type: 'audio/mp3' }));
    repoB.close();

    // User Alpha logs back in on a fresh device (empty IndexedDB) and downloads from Supabase cloud
    globalThis.indexedDB = new IDBFactory();
    const repoA2 = new Repository(8000, cloud);
    repoA2.enableCloud('user-alpha', cloud);
    await repoA2.open();
    expect((await repoA2.songs()).map(s => s.title)).toEqual(['Alpha Exclusive']);
    expect((await repoA2.charts()).map(c => c.name)).toEqual(['Alpha Beatmap']);
    const downloadedAudio = await repoA2.audio('track-1');
    expect(await downloadedAudio!.text()).toBe('alpha-bytes');
    repoA2.close();
  });

  it('enforces cloud optimistic locking ConflictError across concurrent devices', async () => {
    const cloud = new InMemoryCloudDriver();
    const device1 = new Repository(8000, cloud);
    device1.enableCloud('user-1', cloud);
    await device1.open();
    const initial = await device1.saveChart(chart(), 0);

    const device2 = new Repository(8000, cloud);
    device2.enableCloud('user-1', cloud);
    await device2.open();

    await device1.saveChart({ ...initial, name: 'Device 1 update' }, 1);
    await expect(device2.saveChart({ ...initial, name: 'Stale Device 2 update' }, 1)).rejects.toBeInstanceOf(ConflictError);
    await expect(
      device2.saveDraft({ chartId: initial.chartId, chart: initial, baseRevision: 1, savedAt: new Date().toISOString() })
    ).rejects.toBeInstanceOf(ConflictError);

    device1.close();
    device2.close();
  });

  it('synthesizes demo audio on demand when logged in on a new device without uploading demo WAVs', async () => {
    const cloud = new InMemoryCloudDriver();
    const device1 = new Repository(8000, cloud);
    device1.enableCloud('user-demo', cloud);
    await device1.open();
    const demoSong: Song = { ...song, id: 'demo-afterglow', source: 'demo', durationMs: 2000 };
    await device1.seed([demoSong], [new Blob(['local-demo'], { type: 'audio/wav' })], [chart()]);
    device1.close();

    // New device with empty IndexedDB: demo metadata is fetched from cloud, audio is synthesized locally
    globalThis.indexedDB = new IDBFactory();
    const device2 = new Repository(8000, cloud);
    device2.enableCloud('user-demo', cloud);
    await device2.open();
    expect((await device2.songs())[0].id).toBe('demo-afterglow');
    const generated = await device2.audio('demo-afterglow');
    expect(generated).toBeDefined();
    expect(generated!.type).toBe('audio/wav');
    device2.close();
  });

  it('rolls back uploaded Storage object in SupabaseCloudDriver if database song insert fails', async () => {
    const removedPaths: string[] = [];
    const mockClient = {
      storage: {
        from: () => ({
          upload: vi.fn().mockResolvedValue({ data: { path: 'u1/s1' }, error: null }),
          remove: vi.fn().mockImplementation(async (paths: string[]) => {
            removedPaths.push(...paths);
            return { data: [], error: null };
          })
        })
      },
      from: () => ({
        insert: vi.fn().mockResolvedValue({
          error: { code: '42P01', message: 'relation "public.songs" does not exist' }
        })
      })
    };
    const driver = new SupabaseCloudDriver(() => mockClient as never);
    await expect(
      driver.addSong('u1', { ...song, id: 's1', source: 'imported' }, new ArrayBuffer(8), 'audio/wav')
    ).rejects.toBeInstanceOf(SchemaNotInitializedError);
    expect(removedPaths).toEqual(['u1/s1']);
  });

  it('normalizes video/webm to audio/webm and retries with audio/mpeg if bucket rejects MIME type', async () => {
    const uploadedContentTypes: string[] = [];
    const mockClient = {
      storage: {
        from: () => ({
          upload: vi.fn().mockImplementation(async (_path: string, _blob: Blob, options: { contentType: string }) => {
            uploadedContentTypes.push(options.contentType);
            if (options.contentType === 'audio/webm') {
              return { data: null, error: { message: 'mime type video/webm is not supported' } };
            }
            return { data: { path: 'u1/s-webm' }, error: null };
          })
        })
      },
      from: () => ({
        insert: vi.fn().mockResolvedValue({ error: null })
      })
    };
    const driver = new SupabaseCloudDriver(() => mockClient as never);
    await driver.addSong(
      'u1',
      { ...song, id: 's-webm', fileName: 'one_direction.webm', source: 'imported' },
      new ArrayBuffer(16),
      'video/webm'
    );
    // Verified: First attempted audio/webm, then gracefully fell back to audio/mpeg upon MIME error
    expect(uploadedContentTypes).toEqual(['audio/webm', 'audio/mpeg']);
  });

  it('normalizes container MIME types in Repository.prepareAudio', async () => {
    const webmBlob = new Blob(['webm-data'], { type: 'video/webm' });
    Object.defineProperty(webmBlob, 'name', { value: 'track.webm' });
    await repo.addSong({ ...song, id: 'webm-test', fileName: 'track.webm' }, webmBlob);
    const audio = await repo.audio('webm-test');
    expect(audio).toBeDefined();
    expect(audio!.type).toBe('audio/webm');
  });
});
