import { test as base, webkit, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// WebKit ephemeral contexts cannot store Blob/File in IndexedDB (upstream
// microsoft/playwright#42795). A fresh persistent profile tests normal Safari
// storage without mocking IndexedDB or weakening the user-gesture audio policy.
export const test = base.extend({
  context: async ({ browser, browserName, baseURL, viewport, hasTouch, isMobile }, use, testInfo) => {
    const options = { baseURL, viewport, hasTouch, isMobile, acceptDownloads: true };
    if (browserName !== 'webkit') {
      const context = await browser.newContext(options);
      await context.addInitScript(() => {
        try {
          if (!window.localStorage.getItem('beatorbit-test-user')) {
            window.localStorage.setItem(
              'beatorbit-test-user',
              JSON.stringify({ id: 'e2e-tester', email: 'e2e@beatorbit.app', displayName: 'E2E Tester' })
            );
          }
        } catch {}
      });
      try { await use(context); } finally { await context.close(); }
      return;
    }
    // Keep the profile path short: nested WebKit database/blob paths can exceed
    // Windows path limits beneath Playwright's descriptive test output paths.
    const profile = path.resolve(await mkdtemp(path.join(tmpdir(), 'bo-webkit-')));
    if (path.dirname(profile) !== path.resolve(tmpdir()) || !path.basename(profile).startsWith('bo-webkit-')) throw new Error('Unsafe test profile path.');
    const context = await webkit.launchPersistentContext(profile, options);
    await context.addInitScript(() => {
      try {
        if (!window.localStorage.getItem('beatorbit-test-user')) {
          window.localStorage.setItem(
            'beatorbit-test-user',
            JSON.stringify({ id: 'e2e-tester', email: 'e2e@beatorbit.app', displayName: 'E2E Tester' })
          );
        }
      } catch {}
    });
    try { await use(context); }
    finally { await context.close(); await rm(profile, { recursive: true, force: true }); }
  }
});
export { expect };
