// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioTransport } from '../src/audio';
import { Repository } from '../src/storage';
import { Studio } from '../src/studio';
import { clone } from '../src/domain';
import { targetPoint } from '../src/stage';
import { chart, song, tap } from './fixtures';
import { buffer, change, click, domSetup, pointer } from './dom-helpers';
let repo:Repository,audio:AudioTransport,studio:Studio|undefined;
let frame:ReturnType<typeof domSetup>['frame'];
beforeEach(async()=>{({frame}=domSetup());repo=new Repository();await repo.open();audio=new AudioTransport();audio.setBuffer(buffer());});
afterEach(async()=>{await studio?.dispose().catch(()=>{});studio=undefined;audio.dispose();repo.close();vi.restoreAllMocks();vi.unstubAllGlobals();});
async function mount(notes= [] as ReturnType<typeof tap>[]){
  const c=await repo.saveChart(chart(notes),0),playtest=vi.fn();
  studio=new Studio(song,c,audio,repo,playtest,()=>{});studio.mount(document.querySelector('#mount')!);
  return{c,playtest,canvas:document.querySelector('canvas')!};
}
describe('Studio DOM interactions',()=>{
  it('moves short Hold heads without resizing and resizes only the dragged Hold in a multi-selection',async()=>{
    const {canvas}=await mount([tap(1000,{type:'hold',durationMs:125}),tap(3000,{type:'hold',durationMs:1000})]);
    click('[data-tool="select"]');
    window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyA',ctrlKey:true,bubbles:true}));
    pointer(canvas,'pointerdown',168.75,126);pointer(canvas,'pointermove',223.75,126);pointer(canvas,'pointerup',223.75,126);
    expect(studio!.chart.notes.map(n=>n.durationMs)).toEqual([625,1000]);
    click('[data-editor="undo"]');
    pointer(canvas,'pointerdown',155,126);pointer(canvas,'pointermove',265,126);pointer(canvas,'pointerup',265,126);
    expect(studio!.chart.notes.map(n=>n.timeMs)).toEqual([2000,4000]);
    expect(studio!.chart.notes.map(n=>n.durationMs)).toEqual([125,1000]);
    click('[data-editor="undo"]');expect(studio!.chart.notes.map(n=>n.timeMs)).toEqual([1000,3000]);
  });
  it('highlights every selected note on the timeline',async()=>{
    const {canvas}=await mount([tap(1000),tap(2000)]);
    click('[data-editor="stage-toggle"]');
    window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyA',ctrlKey:true,bubbles:true}));
    const context=canvas.getContext('2d')!,strokes:string[]=[];
    context.stroke=()=>{strokes.push(String(context.strokeStyle));};
    frame();expect(strokes.filter(color=>color==='#fff')).toHaveLength(2);
  });
  it('keeps fractional zoom labels consistent with the editable value',async()=>{
    await mount();
    for(const value of ['0.5','33.5']){
      change('#zoom-value',value);
      expect(document.querySelector<HTMLInputElement>('#zoom-value')!.value).toBe(value);
      expect(document.querySelector('#zoom-label')!.textContent).toBe(value+'%');
    }
  });
  it('preserves finer target placement on a legacy note when using a thirds stage grid',async()=>{
    const {canvas}=await mount([tap(1000)]);
    pointer(canvas,'pointerdown',155,126);pointer(canvas,'pointerup',155,126);
    change('#snap-resolution','6');
    const stage=document.querySelector('#stage-preview')!,start=targetPoint(studio!.chart.notes[0],800,350);
    const end=targetPoint({...studio!.chart.notes[0],target:{x:7/15,y:.5}},800,350);
    pointer(stage,'pointerdown',start.x,start.y);pointer(stage,'pointermove',end.x,end.y);pointer(stage,'pointerup',end.x,end.y);
    const n=studio!.chart.notes[0];
    expect(n.target.x).toBe(.4667);expect(n.grid!.subdivision).toBe(16);expect(n.grid!.targetSubdivision).toBe(6);
    await studio!.save();expect((await repo.charts())[0].notes[0].target.x).toBe(.4667);
    change('#note-target-x','0.533333333');expect(studio!.chart.notes[0].target.x).toBe(.5333);
  });
  it('previews legacy conversion, blocks saving mixed pairs, and converts with one undo step',async()=>{
    const {canvas}=await mount([tap(1000,{chordId:'legacy',side:'left'}),tap(1000,{chordId:'legacy',side:'right',symbol:'cross'})]);
    pointer(canvas,'pointerdown',155,126);pointer(canvas,'pointerup',155,126);
    await expect(studio!.save()).rejects.toThrow(/Konversi/);
    const source=studio!.chart.notes.find(n=>n.symbol==='cross')!;
    click('[data-normalize="'+source.id+'"]');
    expect(studio!.chart.notes.every(n=>n.symbol==='cross')).toBe(true);
    await studio!.save();click('[data-editor="undo"]');
    expect(studio!.chart.notes.map(n=>n.symbol).sort()).toEqual(['cross','triangle']);
  });
  it('restores automatic target placement after manual dragging and exposes shortcuts',async()=>{
    await mount();window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyN',bubbles:true}));
    expect(studio!.chart.notes[0].grid!.autoTarget).toBe(true);
    change('#note-target-x','0.7');expect(studio!.chart.notes[0].grid!.autoTarget).toBe(false);
    click('[data-editor="auto-target"]');expect(studio!.chart.notes[0].grid!.autoTarget).toBe(true);
    expect(studio!.chart.notes[0].target.x).toBe(.5);
    click('[data-editor="shortcuts"]');expect(document.querySelector('#shortcut-guide')!.hasAttribute('hidden')).toBe(false);
    expect(document.querySelector('#shortcut-guide')!.textContent).toContain('Shift+D');
    const first=document.querySelector<HTMLElement>('[data-tool="select"]')!;first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
    expect((document.activeElement as HTMLElement).dataset.tool).toBe('tap');
  });
  it('prepares types and shapes with shortcuts, edits pairs atomically and ignores text input',async()=>{
    await mount();
    const key=(code:string,extra:KeyboardEventInit={})=>window.dispatchEvent(new KeyboardEvent('keydown',{code,bubbles:true,...extra}));
    key('KeyD',{shiftKey:true});key('Digit4');key('KeyN');
    expect(studio!.chart.notes).toHaveLength(2);
    expect(studio!.chart.notes.every(n=>n.type==='hold'&&n.symbol==='cross'&&n.durationMs===125)).toBe(true);
    key('Digit1',{altKey:true});expect(studio!.chart.notes.every(n=>n.symbol==='triangle')).toBe(true);
    key('KeyT',{altKey:true});expect(document.querySelector('.conversion-choice')).not.toBeNull();
    const field=document.querySelector<HTMLInputElement>('#chart-name')!;field.focus();
    field.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyE',key:'e',bubbles:true}));
    expect(studio!.tool).toBe('dual-hold');
  });
  it('moves selected Hold endpoints together when BPM and offset change and persists thirds',async()=>{
    const {canvas}=await mount([tap(1000,{type:'hold',durationMs:500})]);
    pointer(canvas,'pointerdown',155,126);pointer(canvas,'pointerup',155,126);
    change('#snap-resolution','6');change('#note-length','2');
    expect(studio!.chart.notes[0].durationMs).toBeCloseTo(2000/3);
    const grid=clone(studio!.chart.notes[0].grid);
    change('#chart-offset','125');change('#chart-bpm','90');
    expect(studio!.chart.notes[0].grid).toEqual(grid);
    expect(studio!.chart.notes[0].timeMs).toBeCloseTo(125+4000/3);
    expect(studio!.chart.notes[0].durationMs).toBeCloseTo(8000/9);
    await studio!.save();expect((await repo.charts())[0].notes[0].grid).toEqual(grid);
  });
  it('changes grid resolution without moving old notes and quantizes only on request',async()=>{
    const {canvas}=await mount([tap(1120,{type:'hold',durationMs:620})]);
    pointer(canvas,'pointerdown',168,126);pointer(canvas,'pointerup',168,126);
    change('#snap-resolution','6');expect(studio!.chart.notes[0].timeMs).toBe(1120);
    change('#quantize-scope','start');click('[data-editor="quantize"]');
    expect(studio!.chart.notes[0].timeMs).toBeCloseTo(1000);
    expect(studio!.chart.notes[0].durationMs).toBeCloseTo(620);
    click('[data-editor="undo"]');expect(studio!.chart.notes[0].timeMs).toBe(1120);
  });
  it('selects all for atomic duplication and deletion without merging independent pairs',async()=>{
    await mount([tap(1000),tap(2000,{side:'left',chordId:'pair'}),tap(2000,{side:'right',chordId:'pair'})]);
    window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyA',ctrlKey:true,bubbles:true}));
    window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyD',ctrlKey:true,bubbles:true}));
    expect(studio!.chart.notes).toHaveLength(6);
    const copies=studio!.chart.notes.filter(n=>n.timeMs===2500);expect(copies).toHaveLength(2);
    expect(copies[0].chordId).toBe(copies[1].chordId);expect(copies[0].chordId).not.toBe('pair');
    window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyA',ctrlKey:true,bubbles:true}));
    click('[data-editor="delete"]');expect(studio!.chart.notes).toHaveLength(0);
    click('[data-editor="undo"]');expect(studio!.chart.notes).toHaveLength(6);
  });
  it('pans empty space with Select and never inserts a note',async()=>{
    const {canvas}=await mount();click('[data-tool="select"]');
    pointer(canvas,'pointerdown',300,126);pointer(canvas,'pointermove',200,126);pointer(canvas,'pointerup',200,126);
    expect(document.querySelector('#timeline-scroll')!.scrollLeft).toBe(100);
    expect(studio!.chart.notes).toHaveLength(0);
    expect(document.querySelector('[data-tool="pan"]')).toBeNull();
    expect(document.querySelector('#note-navigator')).toBeNull();
  });
  it('rejects interaction with an invisible selected target and restores Snap state immediately',async()=>{
    const {canvas}=await mount([tap(5000)]);
    pointer(canvas,'pointerdown',595,126);pointer(canvas,'pointerup',595,126);
    const before=clone(studio!.chart.notes[0].target),p=targetPoint(studio!.chart.notes[0],800,350),stage=document.querySelector('#stage-preview')!;
    pointer(stage,'pointerdown',p.x,p.y);pointer(stage,'pointermove',450,240);pointer(stage,'pointerup',450,240);
    expect(studio!.chart.notes[0].target).toEqual(before);expect(studio!.doc.canUndo).toBe(false);
    click('[data-editor="snap"]');
    expect(document.querySelector('[data-editor="snap"]')!.getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelector('[data-editor="snap"]')!.classList.contains('active')).toBe(false);
  });
  it('uses reversible zoom steps and preserves the pointer time during wheel zoom',async()=>{
    const {canvas}=await mount();
    const viewport=document.querySelector('#timeline-scroll')!;viewport.scrollLeft=100;viewport.dispatchEvent(new Event('scroll'));
    const before=(studio!.scroll+200-45)/studio!.zoom;
    canvas.dispatchEvent(new WheelEvent('wheel',{ctrlKey:true,clientX:200,deltaY:-40,bubbles:true,cancelable:true}));
    expect((studio!.scroll+200-45)/studio!.zoom).toBeCloseTo(before,8);
    change('#zoom-value','100');click('[data-editor="zoom-in"]');expect(studio!.zoom).toBeCloseTo(137.5);
    click('[data-editor="zoom-out"]');expect(studio!.zoom).toBeCloseTo(110);
  });
  it('previews wheel rotation without mutating notes and commits a whole pair in one undo step',async()=>{
    const {canvas}=await mount([tap(1000,{side:'left',chordId:'wheel',entryAngleDeg:0}),tap(1000,{symbol:'circle',side:'right',chordId:'wheel',entryAngleDeg:0})]);
    pointer(canvas,'pointerdown',155,126);pointer(canvas,'pointerup',155,126);
    const wheel=document.querySelector('#direction-wheel')!;
    pointer(wheel,'pointerdown',700,175);pointer(wheel,'pointermove',400,330);
    expect(studio!.chart.notes.map(n=>n.entryAngleDeg)).toEqual([0,0]);
    expect(document.querySelector('#direction-value')!.textContent).toBe('Bawah · 90°');
    pointer(wheel,'pointerup',400,330);
    expect(studio!.chart.notes.map(n=>n.entryAngleDeg)).toEqual([90,90]);
    click('[data-editor="undo"]');expect(studio!.chart.notes.map(n=>n.entryAngleDeg)).toEqual([0,0]);
    expect(studio!.doc.canUndo).toBe(false);
  });
  it('cancels a wheel gesture on capture loss and Escape without changing selection or history',async()=>{
    const {canvas}=await mount([tap(1000,{entryAngleDeg:22.5})]);
    pointer(canvas,'pointerdown',155,126);pointer(canvas,'pointerup',155,126);
    const id=studio!.selected;
    for(const event of ['pointercancel','lostpointercapture','Escape']){
      const wheel=document.querySelector('#direction-wheel')!;
      pointer(wheel,'pointerdown',700,175);pointer(wheel,'pointermove',400,330);
      if(event==='Escape')window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));else pointer(wheel,event,400,330);
      expect(studio!.chart.notes[0].entryAngleDeg).toBe(22.5);expect(studio!.selected).toBe(id);expect(studio!.doc.canUndo).toBe(false);
    }
  });
  it('supports free angles, keyboard rotation and save/reopen without rounding a custom angle',async()=>{
    const {canvas}=await mount([tap(1000,{entryAngleDeg:22.5})]);
    pointer(canvas,'pointerdown',155,126);pointer(canvas,'pointerup',155,126);
    const checkbox=document.querySelector<HTMLInputElement>('#free-direction')!;checkbox.checked=true;checkbox.dispatchEvent(new Event('change',{bubbles:true}));
    expect(studio!.chart.notes[0].entryAngleDeg).toBe(22.5);
    const wheel=document.querySelector<HTMLElement>('#direction-wheel')!;wheel.focus();wheel.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
    expect(studio!.chart.notes[0].entryAngleDeg).toBe(23.5);expect(document.activeElement?.id).toBe('direction-wheel');
    change('#note-entry','-337.5');expect(studio!.chart.notes[0].entryAngleDeg).toBe(22.5);
    await studio!.save();expect((await repo.charts())[0].notes[0].entryAngleDeg).toBe(22.5);
  });
  it('moves, duplicates and erases mixed Duals atomically while retaining symbols and targets',async()=>{
    const {canvas}=await mount([tap(1000,{chordId:'mixed',side:'left',target:{x:.2,y:.3}}),tap(1000,{chordId:'mixed',symbol:'square',side:'right',target:{x:.8,y:.7}})]);
    const before=clone(studio!.chart.notes);click('[data-tool="select"]');
    pointer(canvas,'pointerdown',155,126);pointer(canvas,'pointermove',265,200);pointer(canvas,'pointerup',265,200);
    expect(studio!.chart.notes.every(n=>n.timeMs===2000)).toBe(true);
    expect(studio!.chart.notes.map(n=>n.symbol).sort()).toEqual(['square','triangle']);
    expect(studio!.chart.notes.map(n=>n.target)).toEqual(before.map(n=>n.target));
    click('[data-editor="duplicate"]');
    const copies=studio!.chart.notes.filter(n=>n.timeMs===2500);expect(copies).toHaveLength(2);expect(copies[0].chordId).toBe(copies[1].chordId);expect(copies[0].chordId).not.toBe('mixed');
    click('[data-editor="delete"]');expect(studio!.chart.notes).toHaveLength(2);
    click('[data-editor="undo"]');expect(studio!.chart.notes).toHaveLength(4);
    click('[data-tool="erase"]');pointer(canvas,'pointerdown',265,126);pointer(canvas,'pointerup',265,126);
    expect(studio!.chart.notes).toHaveLength(2);expect(studio!.chart.notes.every(n=>n.timeMs===2500)).toBe(true);
  });
  it('requires an explicit member choice before a Dual-to-single conversion and supports cancel/undo',async()=>{
    const {canvas}=await mount([tap(1000,{chordId:'convert',side:'left'}),tap(1000,{chordId:'convert',symbol:'circle',side:'right'})]);
    pointer(canvas,'pointerdown',155,126);pointer(canvas,'pointerup',155,126);
    click('[data-note-type="hold"]');expect(studio!.chart.notes).toHaveLength(2);
    click('[data-editor="cancel-conversion"]');expect(studio!.doc.canUndo).toBe(false);
    click('[data-note-type="hold"]');
    const keep=studio!.chart.notes.find(n=>n.symbol==='circle')!;click('[data-keep-note="'+keep.id+'"]');
    expect(studio!.chart.notes).toHaveLength(1);expect(studio!.chart.notes[0]).toMatchObject({symbol:'circle',type:'hold',side:'either',durationMs:125});expect(studio!.chart.notes[0].chordId).toBeUndefined();
    click('[data-editor="undo"]');expect(studio!.chart.notes).toHaveLength(2);expect(studio!.chart.notes.every(n=>n.chordId==='convert'&&n.type==='tap')).toBe(true);
  });
  it('keeps an overlapping Tap and Hold selectable and does not insert with eraser, pan or select',async()=>{
    const {canvas}=await mount([tap(500,{type:'hold',durationMs:2000}),tap(1000,{symbol:'circle'})]);
    pointer(canvas,'pointerdown',155,126);pointer(canvas,'pointerup',155,126);
    const picker=document.querySelector<HTMLElement>('#timeline-selection')!;expect(picker.hidden).toBe(false);expect(picker.querySelectorAll('[data-pick-note]')).toHaveLength(2);
    const circle=studio!.chart.notes.find(n=>n.symbol==='circle')!;click('#timeline-selection [data-pick-note="'+circle.id+'"]');expect(studio!.selected).toBe(circle.id);
    for(const tool of ['erase','select']){click('[data-tool="'+tool+'"]');window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyN',key:'n',bubbles:true}));}
    expect(studio!.chart.notes).toHaveLength(2);
  });
  it('does not move a selected target when empty stage space is clicked',async()=>{
    const {canvas}=await mount([tap(1000)]);pointer(canvas,'pointerdown',155,126);pointer(canvas,'pointerup',155,126);
    const before=clone(studio!.chart.notes[0].target),stage=document.querySelector('#stage-preview')!;
    pointer(stage,'pointerdown',0,0);pointer(stage,'pointerup',0,0);
    expect(studio!.chart.notes[0].target).toEqual(before);expect(studio!.doc.canUndo).toBe(false);
  });
  it('preserves panel and transport settings across a Playtest remount',async()=>{
    await mount([tap(1000)]);click('[data-editor="snap"]');click('[data-editor="follow"]');click('[data-editor="zoom-in"]');click('[data-editor="inspector"]');click('[data-editor="stage-toggle"]');
    const zoom=document.querySelector('#zoom-label')!.textContent;
    studio!.unmount();studio!.mount(document.querySelector('#mount')!);
    expect(document.querySelector('[data-editor="snap"]')!.getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelector('[data-editor="follow"]')!.getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelector('#zoom-label')!.textContent).toBe(zoom);
    expect(document.querySelector('.editor-layout')!.classList.contains('show-inspector')).toBe(true);
    expect(document.querySelector('.stage-preview')!.hasAttribute('hidden')).toBe(true);
  });
  it('moves a matching Dual target in one undo step and retains direction through save and reload',async()=>{
    await mount([tap(1000,{side:'left',chordId:'d'}),tap(1000,{side:'right',chordId:'d'})]);
    click('[data-tool="select"]');
    const timeline=document.querySelector('#timeline')!;
    pointer(timeline,'pointerdown',155,126);pointer(timeline,'pointerup',155,126);
    change('#note-entry','225');change('#note-travel','2200');
    const stage=document.querySelector('#stage-preview')!;
    const point=targetPoint(studio!.chart.notes[0],800,350);
    pointer(stage,'pointerdown',point.x,point.y);pointer(stage,'pointermove',450,240);pointer(stage,'pointerup',450,240);
    expect(studio!.chart.notes[0].target).toEqual(studio!.chart.notes[1].target);
    expect(studio!.chart.notes[0].target.x).not.toBe(.5);
    click('[data-editor="undo"]');expect(studio!.chart.notes[0].target.x).toBe(.5);
    click('[data-editor="redo"]');await studio!.save();
    const saved=(await repo.charts())[0];expect(saved.notes).toEqual(studio!.chart.notes);
    expect(saved.notes.every(n=>n.entryAngleDeg===225&&n.travelTimeMs===2000)).toBe(true);
  });
  it('sets bottom spawn and converts a selected tap into a two-input Dual',async()=>{
    const {canvas}=await mount();pointer(canvas,'pointerdown',155,126);pointer(canvas,'pointerup',155,126);
    click('[data-angle="90"]');expect(studio!.chart.notes[0].entryAngleDeg).toBe(90);
    click('[data-note-type="dual"]');expect(studio!.chart.notes).toHaveLength(2);
    expect(studio!.chart.notes.map(n=>n.side).sort()).toEqual(['left','right']);
    expect(studio!.chart.notes[0].chordId).toBe(studio!.chart.notes[1].chordId);
    click('[data-editor="undo"]');expect(studio!.chart.notes).toHaveLength(1);
  });
  it('places Tap, Hold, and matching Dual notes through the actual tools',async()=>{
    const {canvas}=await mount();
    pointer(canvas,'pointerdown',155,126);pointer(canvas,'pointerup',155,126);
    expect(studio!.chart.notes[0].timeMs).toBe(1000);
    click('[data-tool="hold"]');pointer(canvas,'pointerdown',265,185);pointer(canvas,'pointerup',265,185);
    expect(studio!.chart.notes.find(n=>n.type==='hold')!.durationMs).toBe(125);
    click('[data-tool="dual"]');
    pointer(canvas,'pointerdown',375,126);pointer(canvas,'pointerup',375,126);
    const dual=studio!.chart.notes.filter(n=>n.timeMs===3000);
    expect(dual.map(n=>n.side).sort()).toEqual(['left','right']);
    expect(dual[0].chordId).toBe(dual[1].chordId);
    click('[data- editor="undo"]'.replace(' ',''));expect(studio!.chart.notes).toHaveLength(2);
    click('[data-editor="redo"]');expect(studio!.chart.notes).toHaveLength(4);
    click('[data-tool="dual-hold"]');
    pointer(canvas,'pointerdown',485,126);pointer(canvas,'pointerup',485,126);
    const dualHold=studio!.chart.notes.filter(n=>n.timeMs===4000);
    expect(dualHold).toHaveLength(2);
    expect(dualHold.every(n=>n.type==='hold'&&n.durationMs===125)).toBe(true);
    expect(dualHold.map(n=>n.side).sort()).toEqual(['left','right']);
  });
  it('moves and resizes with one history step per completed gesture',async()=>{
    const {canvas}=await mount([tap(1000,{symbol:'circle',type:'hold',durationMs:500})]);
    click('[data-tool="select"]');
    pointer(canvas,'pointerdown',210,185);pointer(canvas,'pointermove',265,185);pointer(canvas,'pointerup',265,185);
    expect(studio!.chart.notes[0].durationMs).toBe(1000);
    click('[data-editor="undo"]');expect(studio!.chart.notes[0].durationMs).toBe(500);
    pointer(canvas,'pointerdown',155,185);pointer(canvas,'pointermove',265,245);pointer(canvas,'pointerup',265,245);
    expect(studio!.chart.notes[0].timeMs).toBe(2000);expect(studio!.chart.notes[0].symbol).toBe('circle');
    click('[data-editor="undo"]');expect(studio!.chart.notes[0].timeMs).toBe(1000);expect(studio!.chart.notes[0].symbol).toBe('circle');
  });
  it('uses symbol tools to insert at the playhead and edit a selected symbol',async()=>{
    await mount();click('[data-symbol="2"]');
    window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyN',key:'n',bubbles:true}));
    expect(studio!.chart.notes).toHaveLength(1);expect(studio!.chart.notes[0].symbol).toBe('square');
    click('[data-symbol="1"]');expect(studio!.chart.notes[0].symbol).toBe('square');
    click('[data-property-symbol="circle"]');expect(studio!.chart.notes[0].symbol).toBe('circle');
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
