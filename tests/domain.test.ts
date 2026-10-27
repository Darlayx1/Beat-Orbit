import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, EditorDocument, clone, parseChart, snapTime, sortNotes, validatePlayable, type Song } from '../src/domain';
import { DEMO_SPECS, buildDemoChart } from '../src/demos';
import { makeDemoAudio } from '../src/audio';
import { Gameplay } from '../src/gameplay';
import { chart, song, tap } from './fixtures';

describe('portable chart schema', () => {
  it('round-trips Tap, Hold, and explicit matching Dual notes', () => {
    const c = chart([tap(1000),tap(2000,{type:'hold',durationMs:500}),tap(4000,{side:'left',chordId:'duo'}),tap(4000,{side:'right',chordId:'duo'})]);
    expect(parseChart(JSON.parse(JSON.stringify(c)))).toEqual({...c,notes:sortNotes([...c.notes])});
    expect(validatePlayable(c,song.durationMs).errors).toEqual([]);
  });
  it.each([NaN,Infinity,-1])('rejects invalid note timestamp %s', time => {
    expect(()=>parseChart(chart([tap(time)]))).toThrow();
  });
  it('rejects unknown versions and rulesets', () => {
    expect(()=>parseChart({...chart(),schemaVersion:99})).toThrow(/version/i);
    expect(()=>parseChart({...chart(),rulesetId:'unknown'})).toThrow(/ruleset/i);
  });
  it('rejects duplicate IDs and non-positive Holds', () => {
    const note=tap(1000);
    expect(()=>parseChart(chart([note,{...note,timeMs:2000}]))).toThrow(/duplicate/i);
    expect(()=>parseChart(chart([tap(1000,{type:'hold',durationMs:0})]))).toThrow(/duration/i);
  });
  it('projects known fields instead of retaining untrusted HTML metadata', () => {
    const c=parseChart({...chart(),unsafeHtml:'<script>alert(1)</script>'});
    expect(c).not.toHaveProperty('unsafeHtml');
  });
  it('preserves unknown-artist Unicode names without HTML interpretation', () => {
    const c=chart();c.name='夜空 <orbit> & rhythm';
    expect(parseChart(c).name).toBe(c.name);
  });
});
describe('timing and playable patterns', () => {
  it('snaps quarter-note and eighth-note grids using the explicit audio offset', () => {
    const c=chart();c.timing.bpm=120;c.timing.offsetMs=100;
    expect(snapTime(580,c,4)).toBe(600);
    expect(snapTime(330,c,8)).toBe(350);
    expect(snapTime(15,c,16)).toBeGreaterThanOrEqual(0);
  });
  it('does not change note timestamps when BPM or grid offset changes', () => {
    const doc=new EditorDocument(chart([tap(1375)]));
    doc.apply(c=>{c.timing.bpm=165;c.timing.offsetMs=-120;});
    expect(doc.chart.notes[0].timeMs).toBe(1375);
  });
  it('rejects notes and tails outside audio duration', () => {
    expect(validatePlayable(chart([tap(10000)]),10000).errors.length).toBeGreaterThan(0);
    expect(validatePlayable(chart([tap(9500,{type:'hold',durationMs:700})]),10000).errors.length).toBeGreaterThan(0);
  });
  it('requires explicit opposite sides for matching Dual symbols', () => {
    expect(validatePlayable(chart([tap(1000),tap(1000)]),10000).errors[0]).toMatch(/Left and Right/);
    expect(validatePlayable(chart([tap(1000,{side:'left'}),tap(1000,{side:'right'})]),10000).errors).toEqual([]);
  });
  it('detects two-thumb impossibility including active Holds', () => {
    const notes=[tap(1000,{type:'hold',durationMs:2000}),tap(1500,{symbol:'circle'}),tap(1500,{symbol:'square'})];
    expect(validatePlayable(chart(notes),10000).errors[0]).toMatch(/two thumbs/);
  });
  it('rejects same-side conflicts and permits release-to-press boundaries', () => {
    expect(validatePlayable(chart([tap(1000,{side:'left'}),tap(1000,{side:'left',symbol:'circle'})]),10000).errors.length).toBeGreaterThan(0);
    expect(validatePlayable(chart([tap(1000,{type:'hold',side:'left',durationMs:500}),tap(1500,{side:'left'})]),10000).errors).toEqual([]);
  });
  it('warns for dense but structurally valid patterns without modifying notes', () => {
    const c=chart([tap(1000),tap(1050,{symbol:'circle'})]),snapshot=clone(c);
    expect(validatePlayable(c,10000).warnings.length).toBeGreaterThan(0);
    expect(c).toEqual(snapshot);
  });
});
describe('editor command history', () => {
  it('undoes a compound Dual placement in one step and redoes it', () => {
    const doc=new EditorDocument(chart([])),before=clone(doc.chart);
    doc.apply(c=>c.notes.push(tap(1000,{side:'left'}),tap(1000,{side:'right'})));
    expect(doc.chart.notes).toHaveLength(2);
    doc.undo();expect(doc.chart).toEqual(before);
    doc.redo();expect(doc.chart.notes).toHaveLength(2);
  });
  it('restores resize, move, delete, and metadata edits', () => {
    const doc=new EditorDocument(chart([tap(1000,{type:'hold',durationMs:500})])),before=clone(doc.chart);
    doc.apply(c=>{c.notes[0].durationMs=900;});
    doc.apply(c=>{c.notes[0].timeMs=2000;});
    doc.apply(c=>{c.notes=[];});
    doc.apply(c=>{c.name='Renamed';});
    for(let i=0;i<4;i++)doc.undo();
    expect(doc.chart).toEqual(before);
  });
  it('invalidates redo after an alternate edit and isolates source documents', () => {
    const original=chart(),doc=new EditorDocument(original);
    doc.apply(c=>{c.name='First';});doc.undo();doc.apply(c=>{c.name='Second';});
    expect(doc.canRedo).toBe(false);expect(original.name).toBe('Untitled chart');
  });
  it('rejects invalid commands without changing history or data', () => {
    const doc=new EditorDocument(chart()),before=clone(doc.chart);
    expect(()=>doc.apply(c=>{c.timing.bpm=0;})).toThrow();
    expect(doc.chart).toEqual(before);expect(doc.canUndo).toBe(false);
  });
});
describe('10 progressive demo tracks and systematic charts', () => {
  it('defines 10 tracks ordered from easiest to most challenging with valid playable charts', () => {
    expect(DEMO_SPECS).toHaveLength(10);
    const charts = DEMO_SPECS.map((spec, i) => {
      expect(spec.level).toBe(i + 1);
      expect(spec.seconds).toBeGreaterThanOrEqual(90);
      if (i > 0) {
        expect(spec.bpm).toBeGreaterThan(DEMO_SPECS[i - 1].bpm);
        expect(DIFFICULTIES.indexOf(spec.difficulty)).toBeGreaterThanOrEqual(DIFFICULTIES.indexOf(DEMO_SPECS[i - 1].difficulty));
      }
      const demoSong: Song = {
        id: spec.id,
        title: spec.title,
        artist: spec.artist,
        bpm: spec.bpm,
        durationMs: spec.seconds * 1000,
        fileName: spec.title + '.wav',
        format: 'wav',
        fileSize: spec.seconds * 32000 + 44,
        importedAt: new Date().toISOString(),
        source: 'demo',
        palette: spec.palette
      };
      const built = buildDemoChart(spec, demoSong);
      const parsed = parseChart(built);
      const validation = validatePlayable(parsed, demoSong.durationMs);
      expect(validation.errors, `Errors in ${spec.title}`).toEqual([]);
      expect(validation.warnings, `Warnings in ${spec.title}`).toEqual([]);
      expect(parsed.notes.some(n => n.type === 'tap')).toBe(true);
      expect(parsed.notes.some(n => n.type === 'hold')).toBe(true);
      expect(parsed.notes.some(n => n.side === 'left') && parsed.notes.some(n => n.side === 'right')).toBe(true);
      const game = new Gameplay(parsed);
      expect(game.maxPossibleCombo).toBeGreaterThan(40);
      return { chart: parsed, combo: game.maxPossibleCombo };
    });
    for (let i = 1; i < charts.length; i++) {
      expect(
        charts[i].combo,
        `Expected track ${i + 1} (${DEMO_SPECS[i].title}: ${charts[i].combo}) to have more combo than track ${i} (${DEMO_SPECS[i - 1].title}: ${charts[i - 1].combo})`
      ).toBeGreaterThan(charts[i - 1].combo);
    }
    expect(charts[9].chart.notes.length).toBeGreaterThan(charts[0].chart.notes.length * 2.5);
  });
  it('synthesizes dynamic multi-section audio rather than repeating a static bar loop', async () => {
    const spec = DEMO_SPECS[0];
    const blob = makeDemoAudio(spec.bpm, 40, spec.root, spec);
    const view = new DataView(await blob.arrayBuffer());
    const rmsAtSecond = (sec: number) => {
      const startSample = Math.floor(sec * 16000);
      let sumSq = 0;
      for (let i = 0; i < 8000; i++) {
        const s = view.getInt16(44 + (startSample + i) * 2, true) / 32768;
        sumSq += s * s;
      }
      return Math.sqrt(sumSq / 8000);
    };
    const introRms = rmsAtSecond(2);
    const activeRms = rmsAtSecond(30);
    expect(introRms).toBeGreaterThan(0.01);
    expect(activeRms).toBeGreaterThan(introRms * 1.15);
  });
});
