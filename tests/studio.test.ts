// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioTransport } from '../src/audio';
import { Repository } from '../src/storage';
import { Studio } from '../src/studio';
import { clone } from '../src/domain';
import { chart, song, tap } from './fixtures';
import { buffer, change, click, domSetup, pointer } from './dom-helpers';
let repo:Repository,audio:AudioTransport,studio:Studio|undefined;
beforeEach(async()=>{domSetup();repo=new Repository();await repo.open();audio=new AudioTransport();audio.setBuffer(buffer());});
afterEach(async()=>{await studio?.dispose().catch(()=>{});studio=undefined;audio.dispose();repo.close();vi.restoreAllMocks();vi.unstubAllGlobals();});
async function mount(notes= [] as ReturnType<typeof tap>[]){
  const c=await repo.saveChart(chart(notes),0),playtest=vi.fn();
  studio=new Studio(song,c,audio,repo,playtest,()=>{});studio.mount(document.querySelector('#mount')!);
  return{c,playtest,canvas:document.querySelector('canvas')!};
}
describe('Studio DOM interactions',()=>{
  it('places Tap, Hold, and matching Dual notes through the actual tools',async()=>{
    const {canvas}=await mount();
    pointer(canvas,'pointerdown',155,126);pointer(canvas,'pointerup',155,126);
    expect(studio!.chart.notes[0].timeMs).toBe(1000);
    click('[data-tool="hold"]');pointer(canvas,'pointerdown',265,185);pointer(canvas,'pointerup',265,185);
    expect(studio!.chart.notes.find(n=>n.type==='hold')!.durationMs).toBe(500);
    click('[data-tool="dual"]');change('#second-symbol','0');
    pointer(canvas,'pointerdown',375,126);pointer(canvas,'pointerup',375,126);
    const dual=studio!.chart.notes.filter(n=>n.timeMs===3000);
    expect(dual.map(n=>n.side).sort()).toEqual(['left','right']);
    expect(dual[0].chordId).toBe(dual[1].chordId);
    click('[data-editor="undo"]');expect(studio!.chart.notes).toHaveLength(2);
    click('[data-editor="redo"]');expect(studio!.chart.notes).toHaveLength(4);
  });
  it('moves and resizes with one history step per completed gesture',async()=>{
    const {canvas}=await mount([tap(1000,{symbol:'circle',type:'hold',durationMs:500})]);
    click('[data-tool="select"]');
    pointer(canvas,'pointerdown',210,185);pointer(canvas,'pointermove',265,185);pointer(canvas,'pointerup',265,185);
    expect(studio!.chart.notes[0].durationMs).toBe(1000);
    click('[data-editor="undo"]');expect(studio!.chart.notes[0].durationMs).toBe(500);
    pointer(canvas,'pointerdown',155,185);pointer(canvas,'pointermove',265,245);pointer(canvas,'pointerup',265,245);
    expect(studio!.chart.notes[0].timeMs).toBe(2000);expect(studio!.chart.notes[0].symbol).toBe('square');
    click('[data-editor="undo"]');expect(studio!.chart.notes[0].timeMs).toBe(1000);expect(studio!.chart.notes[0].symbol).toBe('circle');
  });
  it('uses symbol tools to insert at the playhead and edit a selected symbol',async()=>{
    await mount();click('[data-symbol="2"]');
    window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyN',key:'n',bubbles:true}));
    expect(studio!.chart.notes).toHaveLength(1);expect(studio!.chart.notes[0].symbol).toBe('square');
    click('[data-symbol="1"]');expect(studio!.chart.notes[0].symbol).toBe('circle');
    click('[data-editor="undo"]');expect(studio!.chart.notes[0].symbol).toBe('square');
  });
  it('cancels a drag without committing and keeps shortcuts inactive while typing',async()=>{
    const {canvas}=await mount([tap(1000)]);
    pointer(canvas,'pointerdown',155,126);pointer(canvas,'pointermove',265,126);pointer(canvas,'pointercancel',265,126);
    expect(studio!.chart.notes[0].timeMs).toBe(1000);
    change('#chart-name','Edited title');
    const input=document.querySelector<HTMLInputElement>('#chart-name')!;
    input.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:'z',ctrlKey:true}));
    expect(studio!.chart.name).toBe('Edited title');
    window.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:'z',ctrlKey:true}));
    expect(studio!.chart.name).toBe('Untitled chart');
  });
  it('debounces actual draft persistence and does not replace the saved chart',async()=>{
    await mount([tap(1000)]);change('#chart-name','Recovered rhythm');
    expect((await repo.charts())[0].name).toBe('Untitled chart');
    await vi.waitFor(async()=>expect((await repo.drafts())[0]?.chart.name).toBe('Recovered rhythm'),{timeout:3000,interval:30});
    expect(document.querySelector('#save-status')!.textContent).toMatch(/Draft saved/);
    await studio!.save();
    expect((await repo.charts())[0].name).toBe('Recovered rhythm');expect(await repo.drafts()).toEqual([]);
  });
  it('keeps the document editable after failed storage and allows an explicit save',async()=>{
    await mount([tap(1000)]);change('#chart-name','Keep this work');
    vi.spyOn(repo,'saveDraft').mockRejectedValueOnce(new DOMException('Full','QuotaExceededError'));
    await expect(studio!.flushDraft()).rejects.toMatchObject({name:'QuotaExceededError'});
    expect(studio!.chart.name).toBe('Keep this work');expect(document.querySelector('#save-status')!.textContent).toMatch(/Save failed/);
    await studio!.save();expect((await repo.charts())[0].name).toBe('Keep this work');
    await expect(studio!.dispose()).resolves.toBeUndefined();
  });
  it('shares an in-flight save and preserves edits made while its transaction is pending',async()=>{
    await mount([tap(1000)]);change('#chart-name','Saved snapshot');
    let release!:()=>void;
    const gate=new Promise<void>(resolve=>{release=resolve;}),save=repo.saveChart.bind(repo);
    vi.spyOn(repo,'saveChart').mockImplementation(async(c,r)=>{await gate;return save(c,r);});
    const one=studio!.save(),two=studio!.save();expect(one).toBe(two);
    // Let the first save capture the requested document before the next user edit.
    await new Promise(resolve=>setTimeout(resolve,0));
    change('#chart-name','Newer unsaved work');release();await one;
    expect((await repo.charts())[0].name).toBe('Saved snapshot');
    expect(studio!.chart.name).toBe('Newer unsaved work');expect(studio!.dirty).toBe(true);
    await studio!.flushDraft();expect((await repo.drafts())[0].chart.name).toBe('Newer unsaved work');
  });
  it('playtests an independent unsaved snapshot without changing persisted data',async()=>{
    const {playtest}=await mount([tap(1000)]);
    change('#chart-name','Unsaved chart');
    click('[data-editor="playtest"]');
    expect(playtest).toHaveBeenCalledTimes(1);
    const snapshot=playtest.mock.calls[0][0];expect(snapshot.name).toBe('Unsaved chart');
    snapshot.notes[0].timeMs=9000;expect(studio!.chart.notes[0].timeMs).toBe(1000);
    expect((await repo.charts())[0].name).toBe('Untitled chart');
  });
  it('restores a draft without replacing the saved version',async()=>{
    const {c}=await mount([tap(1000)]),draft=clone(c);draft.name='Recovered chart';
    studio!.restore(draft);expect(studio!.chart.name).toBe('Recovered chart');
    expect((await repo.charts())[0].name).toBe('Untitled chart');expect(studio!.dirty).toBe(true);
  });
});
