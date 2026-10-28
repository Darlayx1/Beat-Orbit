import { describe, expect, it, vi } from 'vitest';
import { EditorDocument, clone, defaultLayout, parseChart } from '../src/domain';
import { drawStage, entryPoint, groupNotes, notePoint, pointToTarget, stageRect, targetPoint, travelSpan } from '../src/stage';
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
  it('snaps target positions to the finer beat grid (1/16 and 1/32 lines) and derives travel time from BPM', () => {
    const raw=chart([tap(2000,{target:{x:.18,y:.81},entryAngleDeg:315,travelTimeMs:2400})]);
    const doc=new EditorDocument(raw);
    expect(doc.chart.notes[0].target).toEqual({x:.175,y:.8});
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
  const sizes=[[300,500],[900,230],[1440,1000]] as const;
  it.each([0,45,90,135,180,225,270,315])('arrives on time from %s degrees, swings laterally in flight, and keeps straight-line axis speed constant',angle=>{
    const n=tap(3000,{target:{x:.28,y:.72},entryAngleDeg:angle,travelTimeMs:1800});
    const far=tap(3000,{target:{x:.8,y:.2},entryAngleDeg:angle,travelTimeMs:1800});
    const rad=angle*Math.PI/180, dx=Math.cos(rad), dy=Math.sin(rad), nx=-dy, ny=dx;
    for(const [w,h] of sizes){
      const entry=entryPoint(n,w,h), target=targetPoint(n,w,h);
      expect(notePoint(n,1200,w,h)).toEqual(entry);
      const point=notePoint(n,3000,w,h);expect(point.x).toBeCloseTo(target.x);expect(point.y).toBeCloseTo(target.y);
      // A skipped frame cannot accumulate positional drift.
      notePoint(n,1700,w,h);notePoint(n,2900,w,h);
      expect(notePoint(n,3000,w,h)).toEqual(point);
      // At mid-flight (remaining = 0.5), the note swings perpendicular to the entry-to-target line while staying at 50% along the straight chord.
      const mid=notePoint(n,2100,w,h);
      const along=(mid.x-target.x)*dx+(mid.y-target.y)*dy;
      const lateral=Math.abs((mid.x-target.x)*nx+(mid.y-target.y)*ny);
      expect(along).toBeCloseTo(travelSpan(w,h)*.5,8);
      expect(lateral).toBeCloseTo(travelSpan(w,h)*.15,8);
      // Speed no longer depends on how far the target sits from an edge.
      const speed=(note:typeof n)=>{const a=notePoint(note,2000,w,h),b=notePoint(note,2100,w,h);return Math.hypot(a.x-b.x,a.y-b.y)/100;};
      expect(speed(n)).toBeCloseTo(speed(far),8);
      const axialSpeed=(note:typeof n)=>{const a=notePoint(note,2000,w,h),b=notePoint(note,2100,w,h);return Math.abs((a.x-b.x)*dx+(a.y-b.y)*dy)/100;};
      expect(axialSpeed(n)).toBeCloseTo(travelSpan(w,h)/1800,8);
    }
  });
  it('slows every note when the song BPM is lower',()=>{
    const slow=tap(3000,{travelTimeMs:2400}),fast=tap(3000,{travelTimeMs:1200});
    const rad=slow.entryAngleDeg*Math.PI/180, dx=Math.cos(rad), dy=Math.sin(rad);
    const step=(n:typeof slow)=>{const a=notePoint(n,2500,800,450),b=notePoint(n,2600,800,450);return Math.abs((a.x-b.x)*dx+(a.y-b.y)*dy);};
    expect(step(fast)).toBeCloseTo(step(slow)*2,8);
  });
  it('maps Studio and gameplay through the same 16:9 stage, in both directions',()=>{
    for(const [w,h] of [[560,315],[800,450],[1200,500],[390,600]]){
      const r=stageRect(w,h);expect(r.width/r.height).toBeCloseTo(16/9);
      expect(r.x*2+r.width).toBeCloseTo(w);expect(r.y*2+r.height).toBeCloseTo(h);
      const n=tap(1000,{target:{x:.3,y:.65}}),p=targetPoint(n,w,h),back=pointToTarget(p.x,p.y,w,h);
      expect(back.x).toBeCloseTo(.3);expect(back.y).toBeCloseTo(.65);
    }
    // A 16:9 canvas is the stage, so the preview is placed exactly like gameplay scaled down.
    const a=targetPoint(tap(1000,{target:{x:.4,y:.7}}),1600,900),b=targetPoint(tap(1000,{target:{x:.4,y:.7}}),800,450);
    expect(b.x/800).toBeCloseTo(a.x/1600,1);
  });
  it('keeps judgement unchanged when the target or direction moves',()=>{
    const c=chart(), moved=clone(c);moved.notes[0].target={x:.8,y:.2};moved.notes[0].entryAngleDeg=135;
    const a=new Gameplay(c),b=new Gameplay(moved);a.press('a','triangle','left',1046);b.press('b','triangle','left',1046);
    expect(a.score).toBe(b.score);expect(a.counts).toEqual(b.counts);
  });
  it('groups matching Duals into one symbol that scores once both sides land',()=>{
    const game=new Gameplay(chart([tap(1000,{chordId:'dual',side:'left'}),tap(1000,{chordId:'dual',side:'right'})]));
    const groups=groupNotes(game.notes);expect(groups).toHaveLength(1);
    game.press('one','triangle','left',1000);expect(groups[0].filter(n=>n.state==='done')).toHaveLength(0);
    expect(groups[0].some(n=>n.unit?.presses.has('left'))).toBe(true);
    expect(game.score).toBe(0);game.press('two','triangle','right',1000);expect(game.score).toBe(1000);
    expect(groups[0].every(n=>n.state==='done')).toBe(true);
    game.update(2000);expect(game.score).toBe(1000);
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
    expect(game.score).toBe(2400);expect(game.counts.perfect).toBe(2);expect(game.combo).toBe(2);expect(game.complete).toBe(true);
  });
  it('misses an unclaimed suspended Hold without leaving it stuck',()=>{
    const game=new Gameplay(chart([tap(1000,{type:'hold',durationMs:1000})]));
    game.press('old','triangle','left',1000);game.suspendInputs();game.update(2200);
    expect(game.counts.miss).toBe(1);expect(game.complete).toBe(true);
  });
  it('renders shape targets, clock needles, and Hold pipes across all four symbols without HOLD text labels',()=>{
    const fillText=vi.fn(), fill=vi.fn(), stroke=vi.fn();
    const gradient={addColorStop:vi.fn()};
    const ctx={
      clearRect:vi.fn(), fillRect:vi.fn(), strokeRect:vi.fn(), setLineDash:vi.fn(),
      beginPath:vi.fn(), closePath:vi.fn(), moveTo:vi.fn(), lineTo:vi.fn(), arc:vi.fn(), ellipse:vi.fn(),
      fill, stroke, fillText, save:vi.fn(), restore:vi.fn(),
      createLinearGradient:vi.fn(()=>gradient), createRadialGradient:vi.fn(()=>gradient),
      lineWidth:1, strokeStyle:'', fillStyle:'', lineCap:'butt', lineJoin:'miter', globalAlpha:1, font:'', textAlign:'center', textBaseline:'alphabetic'
    } as unknown as CanvasRenderingContext2D;
    const notes=[
      tap(1000,{symbol:'triangle',type:'hold',durationMs:600}),
      tap(1100,{symbol:'circle',chordId:'d1',side:'left'}),
      tap(1100,{symbol:'circle',chordId:'d1',side:'right'}),
      tap(1200,{symbol:'square',type:'hold',durationMs:500,chordId:'d2',side:'left'}),
      tap(1200,{symbol:'square',type:'hold',durationMs:500,chordId:'d2',side:'right'}),
      tap(1300,{symbol:'cross'})
    ];
    const game=new Gameplay(chart(notes));
    game.press('p1','triangle','left',1000);
    drawStage(ctx,960,540,groupNotes(game.notes),1050,notes[0].id,true);
    expect(fillText).not.toHaveBeenCalled();
    expect(fill).toHaveBeenCalledWith('evenodd');
    expect(stroke).toHaveBeenCalled();
  });
});
