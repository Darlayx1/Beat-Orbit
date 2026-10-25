import { describe, expect, it } from 'vitest';
import { Gameplay } from '../src/gameplay';
import { clone } from '../src/domain';
import { chart, tap } from './fixtures';

describe('shared judgement and scoring engine', () => {
  it.each([[0,'perfect',1000],[45,'perfect',1000],[46,'great',700],[90,'great',700],[91,'good',300],[135,'good',300],[-135,'good',300]] as const)('judges delta %s as %s', (delta,judge,score) => {
    const game=new Gameplay(chart());game.press('finger','triangle','left',1000+delta);
    expect(game.counts[judge]).toBe(1);expect(game.score).toBe(score);
  });
  it('rejects out-of-window attacks and misses once the window expires', () => {
    const game=new Gameplay(chart());expect(game.press('one','triangle','left',1136)).toBe(false);
    game.update(1136);game.update(2000);
    expect(game.counts.miss).toBe(1);expect(game.complete).toBe(true);
  });
  it('never consumes two matching Dual notes with one pointer or repeated down', () => {
    const game=new Gameplay(chart([tap(1000,{side:'left'}),tap(1000,{side:'right'})]));
    expect(game.press('one','triangle','left',1000)).toBe(true);
    expect(game.press('one','triangle','right',1000)).toBe(false);
    expect(game.score).toBe(1000);
    expect(game.press('two','triangle','right',1000)).toBe(true);
    expect(game.score).toBe(2000);
  });
  it('consumes only one attack from an unrestricted simultaneous pair', () => {
    const game=new Gameplay(chart([tap(1000),tap(1000,{symbol:'circle'})]));
    game.press('one','triangle','left',1000);game.press('one','circle','right',1000);
    expect(game.counts.perfect).toBe(1);
  });
  it('locks a Hold to its input and side, and scores both Head press and End Hold release', () => {
    const game=new Gameplay(chart([tap(1000,{type:'hold',durationMs:1000}),tap(1500,{symbol:'circle'})]));
    game.press('one','triangle','left',1000);
    expect(game.score).toBe(1000);expect(game.combo).toBe(1);
    expect(game.press('two','circle','left',1500)).toBe(false);
    expect(game.press('three','circle','right',1500)).toBe(true);
    game.update(2000);game.release('one',2020);game.update(3000);
    expect(game.counts.perfect).toBe(3);expect(game.score).toBe(3000);expect(game.combo).toBe(3);expect(game.accuracy).toBe(100);
  });
  it('fails early releases, late over-holds, and pointer cancellations without stuck inputs', () => {
    const game=new Gameplay(chart([tap(1000,{type:'hold',durationMs:1000}),tap(2500)]));
    game.press('one','triangle','left',1000);game.release('one',1500);
    expect(game.counts.perfect).toBe(1);expect(game.counts.miss).toBe(1);expect(game.combo).toBe(0);
    game.press('one','triangle','left',2500);expect(game.counts.perfect).toBe(2);expect(game.combo).toBe(1);
    const other=new Gameplay(chart([tap(1000,{type:'hold',durationMs:1000})]));
    other.press('one','triangle','left',1000);other.cancelInputs(1800);other.update(3000);
    expect(other.counts.miss).toBe(1);
    const overheld=new Gameplay(chart([tap(1000,{type:'hold',durationMs:1000})]));
    overheld.press('one','triangle','left',1000);overheld.update(2200);
    expect(overheld.counts.perfect).toBe(1);expect(overheld.counts.miss).toBe(1);expect(overheld.combo).toBe(0);
  });
  it('judges Head press and End Hold release independently and advances Full Combo percentage on Perfect and Great', () => {
    const game=new Gameplay(chart([tap(1000,{type:'hold',durationMs:1000})]));
    game.press('one','triangle','right',1080);
    expect(game.counts.great).toBe(1);expect(game.score).toBe(700);expect(game.combo).toBe(1);expect(game.accuracy).toBe(50);
    game.release('one',2000);
    expect(game.counts.perfect).toBe(1);expect(game.score).toBe(1700);expect(game.combo).toBe(2);expect(game.accuracy).toBe(100);
  });
  it('breaks combo on miss and preserves the maximum', () => {
    const game=new Gameplay(chart([tap(1000),tap(2000),tap(3000)]));
    game.press('one','triangle','left',1000);game.release('one',1001);
    game.press('one','triangle','left',2000);game.release('one',2001);
    game.update(3136);expect(game.combo).toBe(0);expect(game.maxCombo).toBe(2);
    expect(game.accuracy).toBeCloseTo(2000/3000*100);
  });
  it('gives identical results to Standard and Playtest snapshots without mutating chart data', () => {
    const c=chart([tap(1000),tap(2000,{symbol:'circle',type:'hold',durationMs:500})]),before=clone(c);
    const run=(copy:typeof c)=>{const g=new Gameplay(copy);g.press('a','triangle','left',1040);g.release('a',1050);g.press('b','circle','right',2070);g.update(2500);return{score:g.score,counts:g.counts,combo:g.maxCombo};};
    expect(run(c)).toEqual(run(clone(c)));expect(c).toEqual(before);
  });
  it('uses timestamps rather than render-frame counts for delayed updates', () => {
    const game=new Gameplay(chart([tap(1000),tap(5000)]));
    game.update(4000);expect(game.counts.miss).toBe(1);
    game.press('one','triangle','right',5000);game.update(9000);
    expect(game.counts.perfect).toBe(1);expect(game.complete).toBe(true);
  });
});
