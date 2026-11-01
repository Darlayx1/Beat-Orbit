import { test, expect } from './fixtures';
import { makeDemoAudio } from '../../src/audio';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// Optional in-process delivery of the unchanged production build for environments
// where the browser cannot reach a localhost server. Audio/DOM/storage stay real.
test.beforeEach(async({page})=>{
  if(process.env.PLAYWRIGHT_ROUTE_DIST!=='1')return;
  const root=path.resolve('dist');
  await page.route('https://beatorbit-review.invalid/**',async route=>{
    const pathname=decodeURIComponent(new URL(route.request().url()).pathname);
    const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(root+path.sep)){await route.abort();return;}
    const types:Record<string,string>={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff':'font/woff','.woff2':'font/woff2'};
    try{await route.fulfill({body:await readFile(file),contentType:types[path.extname(file)]||'application/octet-stream'});}catch{await route.fulfill({status:404,body:'Not found'});}
  });
});

test('one-lane editor: wheel, Dual conversion, persistence and reachable transport',async({page},testInfo)=>{
  test.setTimeout(45000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('./');
  test.skip(await page.evaluate(()=>typeof AudioContext==='undefined'),'This runtime has no Web Audio API.');
  await page.locator('#audio-file').setInputFiles({name:'Editor interaction.wav',mimeType:'audio/wav',buffer:Buffer.from(await makeDemoAudio(120,8).arrayBuffer())});
  await page.locator('#import-title').fill('Editor interaction');
  await page.locator('#confirm-import').click();
  await page.locator('[data-choice="studio"]').click();
  await expect(page.locator('#timeline')).toBeVisible();
  const canvas=page.locator('#timeline');
  await canvas.click({position:{x:155,y:await canvas.evaluate(el=>el.clientHeight-35)}});
  await expect(page.locator('#note-count')).toHaveText('1 notes');
  if(!await page.locator('#inspector').isVisible())await page.locator('[data-editor="inspector"]').first().click();
  await page.locator('[data-note-type="dual"]').click();
  await expect(page.locator('#note-count')).toHaveText('2 notes');
  const wheel=page.locator('#direction-wheel');await wheel.scrollIntoViewIfNeeded();
  const rect=(await wheel.boundingBox())!;
  await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height*.17);
  await page.mouse.down();
  await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height*.83,{steps:8});
  await expect(wheel).toHaveAttribute('aria-valuenow','90');
  await page.mouse.up();
  await expect(page.locator('#note-entry')).toHaveValue('90');
  if(testInfo.project.name.includes('mobile')){
    await page.locator('[data-angle="180"]').tap();await expect(page.locator('#note-entry')).toHaveValue('180');
    await page.locator('[data-angle="90"]').tap();await expect(page.locator('#note-entry')).toHaveValue('90');
  }
  await wheel.focus();await page.keyboard.press('ArrowRight');
  await expect(wheel).toHaveAttribute('aria-valuenow','135');
  // A wheel gesture cancelled by Escape must retain both selection and angle.
  await wheel.scrollIntoViewIfNeeded();const r=(await wheel.boundingBox())!;
  await page.mouse.move(r.x+r.width*.83,r.y+r.height/2);await page.mouse.down();
  await page.mouse.move(r.x+r.width/2,r.y+r.height*.83);
  await page.keyboard.press('Escape');await page.mouse.up();
  await expect(page.locator('#note-entry')).toHaveValue('135');
  await page.locator('#free-direction').check();
  await page.locator('#note-entry').fill('22.5');await page.locator('#note-entry').press('Tab');
  await expect(page.locator('#direction-value')).toHaveText('Sudut bebas · 22.5°');
  // Toolbar symbol choice prepares the next placement without mutating the pair.
  if(await page.locator('.inspector-close').isVisible())await page.locator('.inspector-close').click();
  await page.locator('[data-editor="save"]').click();
  await expect(page.locator('#save-status')).toHaveText('All changes saved');
  await page.reload();await page.locator('.track-row').first().waitFor();
  const row=page.locator('.track-row').filter({hasText:'Editor interaction'});
  await row.locator('[data-action="edit-song"]').click();await expect(canvas).toBeVisible();
  const navigator=page.locator('#note-navigator');
  const values=await navigator.locator('option').evaluateAll(options=>options.map(el=>(el as HTMLOptionElement).value).filter(Boolean));
  expect(values).toHaveLength(2);
  for(const value of values){
    await navigator.selectOption(value);
    await expect(page.locator('#note-entry')).toHaveValue('22.5');
    await expect(page.locator('[data-note-type="dual"]')).toHaveAttribute('aria-pressed','true');
  }
  if(await page.locator('.inspector-close').isVisible())await page.locator('.inspector-close').click();
  await page.locator('[data-editor="playtest"]').click();
  await expect(page.locator('#game-score')).toBeVisible();
  await page.locator('[data-play="pause"]').click();
  await page.locator('[data-play="exit"]').click();
  await expect(canvas).toBeVisible();
  await expect(page.locator('#note-count')).toHaveText('2 notes');
  await expect(page.locator('#note-entry')).toHaveValue('22.5');
  for(const viewport of [{width:1440,height:1000},{width:844,height:390},{width:568,height:320}]){
    await page.setViewportSize(viewport);
    await page.evaluate(()=>window.scrollTo(0,0));
    await expect.poll(async()=>{
      const box=await page.locator('.timeline-transport').boundingBox();return !!box&&box.y>=0&&box.y+box.height<=viewport.height+1;
    }).toBe(true);
    const box=(await canvas.boundingBox())!;
    const center=box.y+(viewport.height<540?48:96)+(box.height-(viewport.height<540?48:96)-16)/2;
    const transport=(await page.locator('.timeline-transport').boundingBox())!;
    expect(center).toBeLessThan(transport.y);
    for(const symbol of await page.locator('[data-symbol]').all()){
      const button=(await symbol.boundingBox())!;expect(button.x).toBeGreaterThanOrEqual(0);expect(button.x+button.width).toBeLessThanOrEqual(viewport.width);
    }
    await page.screenshot({path:testInfo.outputPath('editor-'+viewport.width+'.png')});
  }
  await page.screenshot({path:testInfo.outputPath('editor-landscape.png'),fullPage:true});
  expect(errors).toEqual([]);
});
