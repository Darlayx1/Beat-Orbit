import { describe, expect, it } from 'vitest';
import { EditorDocument, clone, defaultLayout, parseChart } from '../src/domain';
import { entryPoint, groupNotes, notePoint, targetPoint } from '../src/stage';
import { Gameplay } from '../src/gameplay';
import { chart, tap } from './fixtures';

describe('free target schema and migration', () => {
  it('migrates v1 deterministically without changing identity, timing, holds or chords', () => {
    const legacy = { ...chart([tap(1000,{type:'hold',durationMs:500,chordId:'duo'})]), schemaVersion:1 };
    const {target,entryAngleDeg,travelTimeMs,...old} = legacy.notes[0];
    const input = { ...legacy, notes:[old] };
    const parsed = parseChart(input);
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.notes[0]).toEqual({...old,...defaultLayout(old.symbol)});
    expect(parseChart(input)).toEqual(parsed);
    expect(input.notes[0]).not.toHaveProperty('target');
  });
  it('snaps target positions to the beat grid (1/16 and 1/32 lines) and derives travel time from BPM', () => {
    const raw=chart([tap(2000,{target:{x:.18,y:.81},entryAngleDeg:315,travelTimeMs:2400})]);
    const doc=new EditorDocument(raw);
    expect(doc.chart.notes[0].target).toEqual({x:.2,y:.8});
    expect(doc.chart.notes[0].travelTimeMs).toBe(2000);
    const before=clone(doc.chart);
    doc.apply(c=>{c.notes[0].target.x=.65;});
    expect(doc.chart.notes[0].target.x).toBe(.65); // 1/32 half-step grid line
    doc.undo();
    expect(doc.chart).toEqual(before);doc.redo();
    expect(parseChart(JSON.parse(JSON.stringify(doc.chart)))).toEqual(doc.chart);
    expect(raw.notes[0].target.x).toBe(.18);
  });
  it.each([{target:{x:NaN,y:.5}},{target:{x:1,y:.5}},{entryAngleDeg:360},{entryAngleDeg:Infinity},{travelTimeMs:0},{travelTimeMs:5001}])('rejects invalid spatial data %j', more=>{
    expect(()=>parseChart(chart([tap(1000,more)]))).toThrow();
  });
  it('requires spatial data in v2',()=>{
    const c=chart();delete (c.notes[0] as Partial<typeof c.notes[0]>).target;
    expect(()=>parseChart(c)).toThrow(/Target/);
  });
});
describe('audio-time geometry',()=>{
  it.each([0,45,90,135,180,225,270,315])('starts at an edge and arrives on time from %s degrees on every viewport',angle=>{
    const n=tap(3000,{target:{x:.28,y:.72},entryAngleDeg:angle,travelTimeMs:1800});
    for(const [w,h] of [[300,500],[900,230],[1440,1000]]){
      const entry=entryPoint(n,w,h), target=targetPoint(n,w,h);
      expect(Math.min(Math.abs(entry.x),Math.abs(entry.y),Math.abs(entry.x-w),Math.abs(entry.y-h))).toBeLessThan(.0001);
      expect(notePoint(n,1200,w,h)).toEqual(entry);
      const point=notePoint(n,3000,w,h);expect(point.x).toBeCloseTo(target.x);expect(point.y).toBeCloseTo(target.y);
      // A skipped frame cannot accumulate positional drift.
      notePoint(n,1700,w,h);notePoint(n,2900,w,h);
      expect(notePoint(n,3000,w,h)).toEqual(point);
    }
  });
  it('keeps judgement unchanged when the target or direction moves',()=>{
    const c=chart(), moved=clone(c);moved.notes[0].target={x:.8,y:.2};moved.notes[0].entryAngleDeg=135;
    const a=new Gameplay(c),b=new Gameplay(moved);a.press('a','triangle','left',1046);b.press('b','triangle','left',1046);
    expect(a.score).toBe(b.score);expect(a.counts).toEqual(b.counts);
  });
  it('groups matching Duals into one symbol and retains partial input state',()=>{
    const game=new Gameplay(chart([tap(1000,{chordId:'dual',side:'left'}),tap(1000,{chordId:'dual',side:'right'})]));
    const groups=groupNotes(game.notes);expect(groups).toHaveLength(1);
    game.press('one','triangle','left',1000);expect(groups[0].filter(n=>n.state==='done')).toHaveLength(1);
    expect(game.score).toBe(1000);game.press('two','triangle','right',1000);expect(game.score).toBe(2000);
    game.update(2000);expect(game.score).toBe(2000);
  });
  it('keeps different symbols and different targets separate within a chord',()=>{
    expect(groupNotes([tap(1000,{chordId:'d'}),tap(1000,{chordId:'d',symbol:'circle'})])).toHaveLength(2);
    expect(groupNotes([tap(1000,{chordId:'d'}),tap(1000,{chordId:'d',target:{x:.8,y:.8}})])).toHaveLength(2);
  });
  it('recognizes simultaneous two-input patterns even without an explicit chord ID',()=>{
    const groups=groupNotes([tap(1000,{side:'left'}),tap(1000,{side:'right'})]);
    expect(groups).toHaveLength(1);expect(groups[0].dual).toBe(true);expect(groups[0]).toHaveLength(2);
  });
});
describe('pause/resume Holds',()=>{
  it('rebinds a suspended Hold and resolves End Hold upon timed release',()=>{
    const game=new Gameplay(chart([tap(1000,{type:'hold',durationMs:1000})]));
    game.press('old','triangle','left',1000);game.suspendInputs();game.release('old',1200);
    expect(game.score).toBe(1000);game.press('new','triangle','left',1300);game.update(1980);game.release('new',2000);game.update(2200);
    expect(game.score).toBe(2000);expect(game.counts.perfect).toBe(2);expect(game.combo).toBe(2);expect(game.complete).toBe(true);
  });
  it('misses an unclaimed suspended Hold without leaving it stuck',()=>{
    const game=new Gameplay(chart([tap(1000,{type:'hold',durationMs:1000})]));
    game.press('old','triangle','left',1000);game.suspendInputs();game.update(2200);
    expect(game.counts.miss).toBe(1);expect(game.complete).toBe(true);
  });
});
