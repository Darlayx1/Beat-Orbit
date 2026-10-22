import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { ConflictError, Repository } from '../src/storage';
import { chart, song, tap } from './fixtures';

let repo: Repository;
beforeEach(async()=>{globalThis.indexedDB=new IDBFactory();repo=new Repository();await repo.open();});
afterEach(()=>{repo.close();vi.restoreAllMocks();});
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
