import { test, expect, type Page } from '@playwright/test';
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

test('import → unsaved playtest → save → Standard Play → reopen',async({page},testInfo)=>{
  await page.goto('./');
  await expect(page.locator('.track-row')).toHaveCount(3);
  await page.locator('#audio-file').setInputFiles({name:'Browser fixture.wav',mimeType:'audio/wav',buffer:Buffer.from(await makeDemoAudio(120,2).arrayBuffer())});
  await expect(page.locator('#import-title')).toBeVisible();
  await page.locator('#import-title').fill('Browser test track');
  await page.locator('#confirm-import').click();
  await page.locator('[data-choice="studio"]').click();
  await expect(page.locator('#timeline')).toBeVisible();
  if(testInfo.project.name.startsWith('mobile'))await page.locator('[data-editor="settings"]').click();
  await page.locator('#chart-name').fill('Playable browser chart');
  await page.locator('#chart-name').press('Tab');
  if(testInfo.project.name.startsWith('mobile'))await page.locator('[data-editor="settings"]').click();
  // Canvas coordinates use the same viewport transform as the production editor.
  await page.locator('#timeline').click({position:{x:155,y:126}});
  await page.locator('[data-editor="playtest"]').click();
  await expect(page.locator('.play-mode')).toContainText('STUDIO PLAYTEST');
  await expect(page.locator('.results-view')).toBeVisible({timeout:12000});
  await page.locator('[data-action="result-return"]').click();
  await expect(page.locator('#note-count')).toHaveText('1 notes');
  await page.locator('[data-editor="save"]').click();
  await expect(page.locator('#save-status')).toHaveText('All changes saved');
  await page.locator('.sidebar [data-action="library"]').click();
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

test('recovers an unsaved draft after refresh without replacing its saved chart',async({page},testInfo)=>{
  await page.goto('./');
  await page.locator('.track-row').first().locator('[data-action="manage-song"]').click();
  await page.locator('[data-manage="edit"]').first().click();
  if(testInfo.project.name.startsWith('mobile'))await page.locator('[data-editor="settings"]').click();
  await page.locator('#chart-name').fill('Recover this draft');
  await page.locator('#chart-name').press('Tab');
  await expect(page.locator('#save-status')).toContainText('Draft saved');
  page.once('dialog',dialog=>dialog.accept());
  await page.reload();
  await page.locator('[data-action="recover"]').click();
  await page.locator('[data-draft]').first().click();
  await page.locator('[data-choice="restore"]').click();
  if(testInfo.project.name.startsWith('mobile'))await page.locator('[data-editor="settings"]').click();
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
