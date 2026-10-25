import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { makeDemoAudio } from '../../src/audio';

const applicationErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }, testInfo) => {
  const errors: string[] = [], origin = new URL(testInfo.project.use.baseURL!).origin;
  applicationErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.url().startsWith(origin + '/') && response.status() >= 400) errors.push(response.status() + ' ' + response.url());
  });
});
test.afterEach(async ({ page }) => {
  expect(applicationErrors.get(page) || [], 'No application exceptions or missing production assets').toEqual([]);
});
async function requireWebAudio(page: Page) {
  test.skip(await page.evaluate(() => typeof AudioContext === 'undefined'), 'This browser runtime has no Web Audio API. Full audio flows require WebKit on Linux/macOS or physical Safari; no audio mock is used.');
}
async function showChartSettings(page: Page) {
  // Opening an existing track decodes its audio before Studio mounts. Wait for
  // that view before checking responsive visibility; isVisible() never waits.
  await expect(page.locator('#timeline')).toBeVisible();
  const settings=page.locator('.chart-settings');
  if(!(await settings.isVisible())){
    await page.locator('[data-editor="settings"]').click();
    await expect(page.locator('#studio-mount')).toHaveClass(/settings-open/);
  }
  await expect(settings).toBeVisible();
  await expect(page.locator('#chart-name')).toBeVisible();
}

async function expectImmersivePlay(page: Page, edgeInset = 8) {
  const viewport=page.viewportSize()!;
  const surface=await page.locator('.game-stage').boundingBox();
  expect(surface).toEqual({x:0,y:0,width:viewport.width,height:viewport.height});
  await expect(page.locator('.app-header')).toBeHidden();
  const metrics=await page.locator('.game-stage').evaluate(el=>({
    border:getComputedStyle(el).borderTopWidth,
    radius:getComputedStyle(el).borderRadius,
    scrollWidth:document.documentElement.scrollWidth,
    scrollHeight:document.documentElement.scrollHeight
  }));
  expect(metrics.border).toBe('0px');expect(metrics.radius).toBe('0px');
  expect(metrics.scrollWidth).toBe(viewport.width);expect(metrics.scrollHeight).toBe(viewport.height);
  const pads=await page.locator('.game-key').evaluateAll(elements=>elements.map(el=>{
    const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};
  }));
  for(const bank of [pads.slice(0,4),pads.slice(4)]){
    expect(bank).toHaveLength(4);
    for(let i=0;i<4;i++){
      expect(Math.abs(bank[i].width-bank[i].height)).toBeLessThan(2);
      expect(bank[i].width).toBeGreaterThanOrEqual(44);
      expect(Math.abs(bank[i].x-bank[0].x)).toBeLessThan(2);
      expect(bank[i].y).toBeGreaterThanOrEqual(0);
      expect(bank[i].y+bank[i].height).toBeLessThan(viewport.height);
      if(i)expect(bank[i].y).toBeGreaterThanOrEqual(bank[i-1].y+bank[i-1].height);
    }
  }
  expect(pads[0].x).toBeCloseTo(edgeInset,1);
  expect(viewport.width-pads[4].x-pads[4].width).toBeCloseTo(edgeInset,1);
  const stage=(await page.locator('#game-canvas').boundingBox())!;
  expect(stage.x).toBeGreaterThan(pads[0].x+pads[0].width);
  expect(stage.x+stage.width).toBeLessThan(pads[4].x);
  expect(stage.width).toBeGreaterThan(100);expect(stage.height).toBeGreaterThan(100);
  for(const selector of ['.play-top','.play-bottom']){
    const box=(await page.locator(selector).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x+box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y+box.height).toBeLessThanOrEqual(viewport.height);
  }
  const top=(await page.locator('.play-top').boundingBox())!;
  expect(top.y+top.height).toBeLessThanOrEqual(stage.y+2);
}

test('vertical control banks, free stage, pause/resume and orientation',async({page},testInfo)=>{
  await page.goto('./');
  await requireWebAudio(page);
  await page.locator('[data-action="hero-play"]').click();
  await expect(page.locator('#combo-number')).toHaveText('',{timeout:12000});
  await expectImmersivePlay(page);
  await page.screenshot({path:testInfo.outputPath('controllers.png'),fullPage:true});
  const intervals=await page.evaluate(()=>new Promise<number[]>(resolve=>{
    const samples:number[]=[];let previous=performance.now();
    const tick=(now:number)=>{samples.push(now-previous);previous=now;if(samples.length===60)resolve(samples);else requestAnimationFrame(tick);};requestAnimationFrame(tick);
  }));
  await testInfo.attach('frame-times.json',{body:JSON.stringify({intervals,averageMs:intervals.reduce((a,b)=>a+b,0)/intervals.length}),contentType:'application/json'});
  await page.locator('[data-play="pause"]').click();
  await expect(page.locator('#game-overlay')).toBeVisible();
  await page.locator('[data-play="resume"]').click();
  await expect(page.locator('#game-overlay')).toBeHidden();
  for(const viewport of [{width:390,height:844},{width:844,height:390},{width:667,height:375},{width:568,height:320},{width:320,height:568}]){
    await page.setViewportSize(viewport);
    await expectImmersivePlay(page);
  }
  // Simulate a landscape notch and home indicator, then restore real CSS env values.
  await page.setViewportSize({width:844,height:390});
  await page.locator('.game-stage').evaluate(el=>{
    const style=(el as HTMLElement).style;
    style.setProperty('--edge-left','47px');style.setProperty('--edge-right','47px');style.setProperty('--edge-top','21px');style.setProperty('--edge-bottom','21px');
  });
  await expectImmersivePlay(page,47);
  await page.locator('.game-stage').evaluate(el=>el.removeAttribute('style'));
  await page.setViewportSize({width:390,height:844});
  await expectImmersivePlay(page);
  await page.screenshot({path:testInfo.outputPath('controllers-portrait.png'),fullPage:true});
  await page.locator('[data-play="pause"]').click();
  await page.locator('#game-overlay [data-play="exit"]').click();
  await expect(page.locator('.track-row')).toHaveCount(3);
  await expect(page.locator('.app-header')).toBeVisible();
  await expect(page.locator('#play-mount')).toHaveCount(0);
});

for(const mode of ['unavailable','blocked','stalled'] as const){
  test(`boot handles ${mode} storage with an actionable failure`,async({page})=>{
    await page.addInitScript(mode=>{
      Object.defineProperty(window,'indexedDB',{configurable:true,value:{open(){
        if(mode==='unavailable')throw new DOMException('Site storage unavailable','SecurityError');
        const request={onblocked:null as null|(()=>void)};
        if(mode==='blocked')setTimeout(()=>request.onblocked?.(),0);
        return request;
      }}});
    },mode);
    const start=Date.now();await page.goto('./');
    await expect(page.locator('#reload-app')).toBeVisible({timeout:14500});
    expect(Date.now()-start).toBeLessThan(15000);
    await expect(page.locator('.spinner')).toHaveCount(0);
    await expect(page.locator('.boot-screen')).toContainText('Opening local storage');
  });
}

test('first visit seeds all demos within the boot budget and survives refresh',async({page})=>{
  const start=Date.now();await page.goto('./');
  await expect(page.locator('.track-row')).toHaveCount(3,{timeout:14500});
  expect(Date.now()-start).toBeLessThan(15000);
  await page.reload();await expect(page.locator('.track-row')).toHaveCount(3);
  await expect(page.locator('.spinner')).toHaveCount(0);
});

test('import → unsaved playtest → save → Standard Play → reopen',async({page},testInfo)=>{
  test.setTimeout(45000);
  await page.goto('./');
  await requireWebAudio(page);
  await expect(page.locator('.track-row')).toHaveCount(3);
  await page.screenshot({path:testInfo.outputPath('library.png'),fullPage:true});
  await test.step('Import local audio and open Orbit Studio',async()=>{
    await page.locator('#audio-file').setInputFiles({name:'Browser fixture.wav',mimeType:'audio/wav',buffer:Buffer.from(await makeDemoAudio(120,2).arrayBuffer())});
    await expect(page.locator('#import-title')).toBeVisible();
    await page.locator('#import-title').fill('Browser test track');
    await page.locator('#confirm-import').click();
    await page.locator('[data-choice="studio"]').click();
    await expect(page.locator('#timeline')).toBeVisible();
  });
  await test.step('Name the chart and complete Studio Playtest',async()=>{
    await showChartSettings(page);
    const timingToggle=page.locator('[data-editor="settings"]');
    await page.locator('#chart-name').fill('Playable browser chart');
    await page.locator('#chart-name').press('Tab');
    if(await timingToggle.isVisible())await timingToggle.click();
    // Canvas coordinates use the same viewport transform as the production editor.
    await page.locator('#timeline').click({position:{x:155,y:126}});
    await page.locator('[data-editor="playtest"]').click();
    await expect(page.locator('#game-score')).toBeVisible();
    await expect(page.locator('.results-view')).toBeVisible({timeout:12000});
    await page.locator('[data-action="result-return"]').click();
    await expect(page.locator('#note-count')).toHaveText('1 notes');
    await page.locator('[data-editor="save"]').click();
    await expect(page.locator('#save-status')).toHaveText('All changes saved');
  });
  await test.step('Complete Standard Play and reopen the saved chart',async()=>{
    const sidebarLibrary=page.locator('.sidebar button[data-action="library"]');
    if(await sidebarLibrary.isVisible())await sidebarLibrary.click();
    else await page.locator('.studio-mobile-library').click();
    const row=page.locator('.track-row').filter({hasText:'Browser test track'});
    await expect(row.locator('[data-action="play-song"]')).toBeEnabled();
    await row.locator('[data-action="play-song"]').click();
    await expect(page.locator('.results-view')).toBeVisible({timeout:12000});
    await expect(page.locator('.results-view')).toContainText('chart revision 1');
    await page.locator('[data-action="result-return"]').click();
    await page.reload();
    await expect(page.locator('.track-row').filter({hasText:'Browser test track'})).toBeVisible();
    await page.locator('.track-row').filter({hasText:'Browser test track'}).locator('[data-action="manage-song"]').click();
    await page.locator('[data-manage="edit"]').first().click();
    await expect(page.locator('#note-count')).toHaveText('1 notes');
    await page.screenshot({path:testInfo.outputPath('studio.png'),fullPage:true});
  });
});

test('recovers an unsaved draft after refresh without replacing its saved chart',async({page},testInfo)=>{
  await page.goto('./');
  await requireWebAudio(page);
  await page.locator('.track-row').first().locator('[data-action="manage-song"]').click();
  await page.locator('[data-manage="edit"]').first().click();
  await showChartSettings(page);
  await page.locator('#chart-name').fill('Recover this draft');
  await page.locator('#chart-name').press('Tab');
  await expect(page.locator('#save-status')).toContainText('Draft saved');
  page.once('dialog',dialog=>dialog.accept());
  await page.reload();
  await page.locator('[data-action="recover"]').click();
  await page.locator('[data-draft]').first().click();
  await page.locator('[data-choice="restore"]').click();
  await showChartSettings(page);
  await expect(page.locator('#chart-name')).toHaveValue('Recover this draft');
});

test('exports and imports portable chart JSON against an explicitly selected audio file',async({page})=>{
  await page.goto('./');
  await page.locator('.track-row').first().locator('[data-action="manage-song"]').click();
  const downloadPromise=page.waitForEvent('download');
  await page.locator('[data-manage="export"]').first().click();
  const download=await downloadPromise;
  const stream=await download.createReadStream();
  const chunks:Buffer[]=[];for await(const chunk of stream!)chunks.push(Buffer.from(chunk));
  const data=Buffer.concat(chunks);
  await page.locator('[data-modal-close]').click();
  await page.locator('#chart-file').setInputFiles({name:'roundtrip.json',mimeType:'application/json',buffer:data});
  await expect(page.locator('#chart-audio')).toBeVisible();
  await page.locator('#confirm-chart').click();
  await expect(page.locator('.library-metrics')).toContainText('04');
});
