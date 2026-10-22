import { expect, it } from 'vitest';
import { EditorDocument, parseChart, validatePlayable } from '../src/domain';
import { Gameplay } from '../src/gameplay';
import { chart, tap } from './fixtures';

it('processes a five-minute chart with 2,000 notes through validation, editing, and judgement',()=>{
  const c=chart(Array.from({length:2000},(_,i)=>tap(1000+i*140,{symbol:(['triangle','circle','square','cross'] as const)[i%4]})));
  c.audioRef.durationMs=300000;
  const parsed=parseChart(JSON.parse(JSON.stringify(c)));
  expect(validatePlayable(parsed,300000).errors).toEqual([]);
  const doc=new EditorDocument(parsed);doc.apply(c=>{c.name='Scale fixture';});doc.undo();
  expect(doc.chart.notes).toHaveLength(2000);
  const game=new Gameplay(doc.chart);
  for(const note of c.notes){game.update(note.timeMs);game.press(note.id,note.symbol,'left',note.timeMs);game.release(note.id,note.timeMs+1);}
  game.update(300000);
  expect(game.score).toBe(2000000);expect(game.counts.perfect).toBe(2000);expect(game.complete).toBe(true);
});
