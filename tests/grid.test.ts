import { describe, expect, it } from 'vitest';
import { EditorDocument, clone, defaultLayout, gridFromNote, invalidDualGroups, parseChart, quantizeNote } from '../src/domain';
import { isNoteVisible, notePoint } from '../src/stage';
import { chart, tap } from './fixtures';

describe('musical grid persistence', () => {
  it.each([3, 6])('preserves 1/%s Hold endpoints through timing changes, JSON and undo', subdivision => {
    const c=chart([tap(2000,{type:'hold',durationMs:2000/subdivision})]);
    const doc=new EditorDocument(c), before=clone(doc.chart);
    doc.apply(next=>{next.timing.bpm=90;next.timing.offsetMs=125;});
    expect(doc.chart.notes[0].grid).toEqual(before.notes[0].grid);
    expect(doc.chart.notes[0].durationMs).toBeCloseTo(240000/90/subdivision,9);
    const reopened=parseChart(JSON.parse(JSON.stringify(doc.chart)));
    expect(reopened).toEqual(doc.chart);
    doc.undo();expect(doc.chart).toEqual(before);doc.redo();expect(doc.chart).toEqual(reopened);
  });
  it('rejects timing changes beyond audio without adding history or clipping notes', () => {
    const doc=new EditorDocument(chart([tap(9500,{type:'hold',durationMs:500})])),before=clone(doc.chart);
    expect(()=>doc.apply(c=>{c.timing.offsetMs=200;})).toThrow(/batas audio/);
    expect(doc.chart).toEqual(before);expect(doc.canUndo).toBe(false);
  });
  it('quantizes only requested endpoints and preserves length when moving the start', () => {
    const c=chart([tap(1120,{type:'hold',durationMs:620})]);
    const moved=clone(c.notes[0]);quantizeNote(moved,c,6,'start');
    expect(moved.timeMs).toBeCloseTo(1000);expect(moved.durationMs).toBeCloseTo(620);
    const ended=clone(c.notes[0]);quantizeNote(ended,c,6,'end');
    expect(ended.timeMs).toBeCloseTo(1120);expect(ended.timeMs+ended.durationMs!).toBeCloseTo(1666.666666667);
  });
  it('keeps automatic target placement independent of insertion order and Hold length', () => {
    const a=tap(1000),b=tap(1000,{type:'hold',durationMs:2000});
    const c=chart([a,b]);for(const n of c.notes)n.grid={...gridFromNote(n,c),subdivision:6,autoTarget:true};
    const parsed=parseChart(c);expect(parsed.notes[0].target).toEqual(parsed.notes[1].target);
    const position=parsed.notes[0].target;const doc=new EditorDocument(parsed);
    doc.apply(next=>{next.timing.offsetMs=250;});
    expect(doc.chart.notes[0].target).toEqual(position);expect(doc.chart.notes[0].timeMs).toBe(1250);
    expect(defaultLayout('triangle',120,1,3).target.x).not.toBe(defaultLayout('triangle',120,1,6).target.x);
  });
  it('identifies legacy mixed pairs without silently rewriting them', () => {
    const c=chart([tap(1000,{chordId:'old',side:'left'}),tap(1000,{chordId:'old',side:'right',symbol:'cross'})]);
    const parsed=parseChart(c);expect(invalidDualGroups(parsed.notes)).toHaveLength(1);
    expect(parsed.notes.map(n=>n.symbol).sort()).toEqual(['cross','triangle']);
  });
  it('shares exact visibility boundaries for tap and Hold targets', () => {
    const n=tap(3000,{travelTimeMs:1000,type:'hold',durationMs:500});
    expect(isNoteVisible(n,1999)).toBe(false);expect(isNoteVisible(n,2000)).toBe(true);
    expect(isNoteVisible(n,3635)).toBe(true);expect(isNoteVisible(n,3636)).toBe(false);
  });
  it('alternates swing by musical beat and keeps both Dual members in phase', () => {
    const a=tap(1000,{grid:{startBeat:2,subdivision:16}}),b={...a,id:'other',side:'right' as const};
    expect(notePoint(a,0,960,540)).toEqual(notePoint(b,0,960,540));
    const next={...a,grid:{startBeat:3,subdivision:16}};
    expect(notePoint(a,0,960,540).x).not.toBe(notePoint(next,0,960,540).x);
  });
});
