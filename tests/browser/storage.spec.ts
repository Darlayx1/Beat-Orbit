import { test, expect } from '@playwright/test';

// Use the default ephemeral context: this must work without the persistent
// profile workaround used by the older WebKit flows.
test('demo audio persists in a fresh context without IndexedDB Blob support', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  await expect(page.locator('.track-row')).toHaveCount(10, { timeout: 14500 });
  const readAudio = () => page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('beatorbit-local-v1', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<{ size: number; type: string; header: string }[]>((resolve, reject) => {
        const tx = db.transaction('audio', 'readonly');
        const request = tx.objectStore('audio').getAll();
        tx.oncomplete = () => resolve(request.result.map(value => ({
          size: value.data.byteLength,
          type: value.type,
          header: String.fromCharCode(...new Uint8Array(value.data, 0, 4))
        })));
        tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
  });
  const audio = await readAudio();
  expect(audio).toHaveLength(10);
  for (const track of audio) {
    expect(track.size).toBeGreaterThan(1000000);
    expect(track.type).toBe('audio/wav');
    expect(track.header).toBe('RIFF');
  }
  await page.reload();
  await expect(page.locator('.track-row')).toHaveCount(10);
  expect(await readAudio()).toEqual(audio);
  expect(errors).toEqual([]);
});
