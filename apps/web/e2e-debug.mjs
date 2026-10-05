import { chromium } from '@playwright/test';
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const ctx = await browser.newContext({ permissions: ['camera'] });
const page = await ctx.newPage();
page.on('console', (m) => console.log(`[console.${m.type()}]`, m.text().slice(0, 300)));
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 500)));
page.on('requestfailed', (r) => console.log('[requestfailed]', r.url(), r.failure()?.errorText));
page.on('response', (r) => { if (r.status() >= 400) console.log('[http]', r.status(), r.url()); });
await page.goto('http://localhost:3100/scan');
for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(5000);
  const status = await page.locator('[role=status], [role=alert]').allTextContents();
  const picker = await page.getByTestId('product-picker').textContent();
  console.log(`t+${(i + 1) * 5}s status=${JSON.stringify(status)} picker=${JSON.stringify(picker)}`);
}
const backend = await page.evaluate(() => ({ webgl: !!document.createElement('canvas').getContext('webgl'), idb: typeof indexedDB, sw: !!navigator.serviceWorker?.controller }));
console.log('env', JSON.stringify(backend));
await browser.close();
