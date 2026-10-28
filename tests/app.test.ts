// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { File } from 'node:buffer';
import { makeDemoAudio } from '../src/audio';
import { auth } from '../src/auth';
import { Repository } from '../src/storage';
import { chart, song } from './fixtures';
import { DOMAudioContext, change, click, domSetup, pointer } from './dom-helpers';

it('requires Login/Sign Up first, then runs Import → Studio → Save → Play → Results → Reopen → Sign Out',async()=>{
  const ui=domSetup(),repo=new Repository();await repo.open();
  await repo.seed([song],[makeDemoAudio(120,10)],[{...chart(),revision:1}]);
  let clock=100;
  vi.spyOn(performance,'now').mockImplementation(()=>clock);
  vi.spyOn(auth,'init').mockResolvedValue(null);
  vi.spyOn(auth,'signIn').mockImplementation(async(email: string)=>{
    const testUser={id:'user-test-1',email,displayName:'Orbit Tester',localOnly:true} as never;
    auth.setTestUser(testUser);
    return testUser;
  });
  vi.spyOn(auth,'signOut').mockImplementation(async()=>{
    auth.setTestUser(null);
  });

  await import('../src/main');
  // 1. Verify mandatory authentication screen is shown before accessing workspace
  await vi.waitFor(()=>expect(document.querySelector('.auth-header h1')?.textContent).toContain('Sign in to BeatOrbit'));
  // Switch to Sign Up page and back to Sign In page
  click('[data-auth-switch="signup"]');
  expect(document.querySelector('.auth-header h1')?.textContent).toContain('Create your account');
  click('[data-auth-switch="login"]');
  expect(document.querySelector('.auth-header h1')?.textContent).toContain('Sign in to BeatOrbit');

  // Sign in via dedicated Login form
  change('#auth-email','tester@beatorbit.app');
  change('#auth-password','secret123');
  document.querySelector<HTMLFormElement>('#auth-form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));

  await vi.waitFor(()=>expect(document.querySelector('.page-title h1')?.textContent).toContain('Music Library'));
  const input=document.querySelector<HTMLInputElement>('#audio-file')!;
  Object.defineProperty(input,'files',{configurable:true,value:[new File(['broken'],'broken.mp3')]});
  input.dispatchEvent(new Event('change'));
  await vi.waitFor(()=>expect(document.querySelector('#toast')!.textContent).toContain('could not be decoded'));
  const file=new File([await makeDemoAudio(120,2).arrayBuffer()],'Integration.wav',{type:'audio/wav'});
  Object.defineProperty(input,'files',{configurable:true,value:[file]});
  input.dispatchEvent(new Event('change'));
  await vi.waitFor(()=>expect(document.querySelector('#import-title')).not.toBeNull());
  change('#import-title','My imported rhythm');click('#confirm-import');
  await vi.waitFor(()=>expect(document.querySelector('[data-choice="studio"]')).not.toBeNull());
  click('[data-choice="studio"]');
  await vi.waitFor(()=>expect(document.querySelector('#timeline')).not.toBeNull());
  const canvas=document.querySelector('#timeline')!;
  pointer(canvas,'pointerdown',155,126);pointer(canvas,'pointerup',155,126);
  change('#chart-name','My first beatmap');click('[data-editor="save"]');
  await vi.waitFor(()=>expect(document.querySelector('#save-status')!.textContent).toBe('All changes saved'));
  click('[data-action="library"]');
  await vi.waitFor(()=>expect(document.querySelector('.track-row [data-action="play-song"]')).not.toBeNull());
  const imported=(await repo.songs()).find(s=>s.title==='My imported rhythm')!;
  const saved=(await repo.charts()).find(c=>c.songId===imported.id)!;
  expect(saved.notes).toHaveLength(1);
  const button=document.querySelector<HTMLButtonElement>('.track-row[data-song="'+imported.id+'"] [data-action="play-song"]')!;
  expect(button.disabled).toBe(false);button.click();
  await vi.waitFor(()=>expect(document.querySelector('#game-score')).not.toBeNull());
  // Virtual audio and frame clocks exercise the real view/controller without a browser.
  clock=3000;ui.frame();
  await vi.waitFor(()=>expect(DOMAudioContext.latest.sources.some(s=>s.active)).toBe(true));
  DOMAudioContext.latest.currentTime=1;
  const down = new KeyboardEvent('keydown',{code:'KeyA',key:'a',bubbles:true});
  const up = new KeyboardEvent('keyup',{code:'KeyA',key:'a',bubbles:true});
  Object.defineProperty(down,'timeStamp',{value:clock});Object.defineProperty(up,'timeStamp',{value:clock});
  window.dispatchEvent(down);window.dispatchEvent(up);
  ui.frame();expect(document.querySelector('#game-score')!.textContent).toBe('0001000');
  DOMAudioContext.latest.currentTime=2;
  DOMAudioContext.latest.sources.at(-1)!.onended?.();
  clock=3250;ui.frame();
  await vi.waitFor(()=>expect(document.querySelector('.results-view h1')?.textContent).toBe('Your rhythm, realized.'));
  await vi.waitFor(async()=>expect((await repo.results()).some(r=>r.chartId===saved.chartId&&r.score===1000)).toBe(true));
  click('[data-action="result-edit"]');
  await vi.waitFor(()=>expect(document.querySelector('#chart-name')).not.toBeNull());
  expect((document.querySelector('#chart-name') as HTMLInputElement).value).toBe('My first beatmap');
  change('#chart-name','Continue this tomorrow');
  click('[data-action="library"]');
  await vi.waitFor(()=>expect(document.querySelector('[data-choice="draft"]')).not.toBeNull());
  click('[data-choice="draft"]');
  await vi.waitFor(()=>expect(document.querySelector('.recovery-banner')).not.toBeNull());
  expect((await repo.drafts())[0].chart.name).toBe('Continue this tomorrow');
  // Sign out returns to dedicated Login page
  click('[data-action="signout"]');
  await vi.waitFor(()=>expect(document.querySelector('.auth-header h1')?.textContent).toContain('Sign in to BeatOrbit'));
  repo.close();vi.restoreAllMocks();vi.unstubAllGlobals();
},15000);
