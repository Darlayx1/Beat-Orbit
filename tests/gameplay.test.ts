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
  it('judges a matching Dual as one hit only after both Left and Right land', () => {
    const game=new Gameplay(chart([tap(1000,{side:'left'}),tap(1000,{side:'right'})]));
    expect(game.maxPossibleCombo).toBe(1);
    expect(game.press('one','triangle','left',1000)).toBe(true);
    expect(game.press('one','triangle','right',1000)).toBe(false);
    expect(game.score).toBe(0);expect(game.counts.perfect).toBe(0);
    expect(game.press('two','triangle','right',1010)).toBe(true);
    expect(game.score).toBe(1000);expect(game.combo).toBe(1);expect(game.counts.perfect).toBe(1);
    game.update(3000);expect(game.complete).toBe(true);expect(game.counts.miss).toBe(0);expect(game.accuracy).toBe(100);
  });
  it('uses the worse of the two presses to judge a Dual and ignores a repeated side', () => {
    const game=new Gameplay(chart([tap(1000,{side:'left'}),tap(1000,{side:'right'})]));
    game.press('a','triangle','left',1000);game.release('a',1010);
    expect(game.press('b','triangle','left',1020)).toBe(false);
    game.press('c','triangle','right',1100);
    expect(game.counts.good).toBe(1);expect(game.counts.perfect).toBe(0);expect(game.score).toBe(300);expect(game.combo).toBe(0);
    const late=new Gameplay(chart([tap(1000,{side:'left'}),tap(1000,{side:'right'})]));
    late.press('a','triangle','left',1000);late.press('b','triangle','right',1070);
    expect(late.counts.great).toBe(1);expect(late.score).toBe(700);
  });
  it('counts a half-pressed Dual as a single miss', () => {
    const game=new Gameplay(chart([tap(1000,{side:'left'}),tap(1000,{side:'right'})]));
    game.press('a','triangle','left',1000);game.update(1200);
    expect(game.counts.miss).toBe(1);expect(game.score).toBe(0);expect(game.complete).toBe(true);
  });
  it('resolves a Dual Hold once for its head and once for its tail', () => {
    const game=new Gameplay(chart([tap(1000,{type:'hold',durationMs:1000,side:'left'}),tap(1000,{type:'hold',durationMs:1000,side:'right'})]));
    expect(game.maxPossibleCombo).toBe(2);
    game.press('a','triangle','left',1000);game.press('b','triangle','right',1000);
    expect(game.counts.perfect).toBe(1);
    game.release('a',2000);expect(game.counts.perfect).toBe(1);
    game.release('b',2010);
    expect(game.counts.perfect).toBe(2);expect(game.score).toBe(2000);expect(game.complete).toBe(true);
  });
  it('fails the whole Dual Hold when one thumb lets go early', () => {
    const game=new Gameplay(chart([tap(1000,{type:'hold',durationMs:1000,side:'left'}),tap(1000,{type:'hold',durationMs:1000,side:'right'})]));
    game.press('a','triangle','left',1000);game.press('b','triangle','right',1000);
    game.release('a',1400);
    expect(game.counts.miss).toBe(1);expect(game.combo).toBe(0);expect(game.complete).toBe(true);
    game.release('b',2000);expect(game.counts.miss).toBe(1);
  });
  it('treats a wrong symbol on a live target as PERFECT?/GREAT?/GOOD? with no score or combo', () => {
    const labels:string[]=[];
    for(const [delta,label] of [[0,'perfect?'],[70,'great?'],[120,'good?']] as const){
      const game=new Gameplay(chart([tap(1000),tap(500,{symbol:'circle'})]));game.onJudge=(_j,_n,_p,f)=>labels.push(f!);
      game.press('p','circle','left',500);expect(game.combo).toBe(1);
      expect(game.press('w','square','right',1000+delta)).toBe(true);
      expect(game.score).toBe(1000);expect(game.combo).toBe(0);expect(game.counts.miss).toBe(1);
      expect(game.press('late','triangle','left',1000+delta)).toBe(false);
    }
    expect(labels.filter(l=>l.endsWith('?'))).toEqual(['perfect?','great?','good?']);
  });
  it('does not penalize stray presses when no note is live', () => {
    const game=new Gameplay(chart([tap(5000)]));
    expect(game.press('a','square','left',1000)).toBe(false);
    expect(game.counts.miss).toBe(0);expect(game.combo).toBe(0);
  });
  it('prevents a Hold from continuing after a wrong-symbol press on its head', () => {
    const game=new Gameplay(chart([tap(1000,{type:'hold',durationMs:1000})]));
    game.press('w','circle','left',1000);
    expect(game.counts.miss).toBe(1);
    expect(game.press('right-key','triangle','left',1005)).toBe(false);
    game.release('right-key',2000);expect(game.score).toBe(0);expect(game.complete).toBe(true);
  });
  it('lets only Perfect and Great extend the combo', () => {
    const game=new Gameplay(chart([tap(1000),tap(2000),tap(3000),tap(4000)]));
    game.press('a','triangle','left',1000);game.release('a',1001);
    game.press('a','triangle','left',2070);game.release('a',2071);
    expect(game.combo).toBe(2);
    game.press('a','triangle','left',3120);game.release('a',3121);
    expect(game.counts.good).toBe(1);expect(game.combo).toBe(0);expect(game.maxCombo).toBe(2);
    game.press('a','triangle','left',4000);expect(game.combo).toBe(1);
  });
  it('reports when a Hold starts and stops being held', () => {
    const game=new Gameplay(chart([tap(1000,{type:'hold',durationMs:1000})])),events:boolean[]=[];
    game.onHold=(_n,active)=>events.push(active);
    game.press('a','triangle','left',1000);game.suspendInputs();game.press('b','triangle','left',1300);game.release('b',2000);
    expect(events).toEqual([true,false,true,false]);
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
