'use strict';
// Drives the editor in headless Chromium: loads a face, clicks/drags,
// screenshots each step, and dumps selection state + console errors.
// Usage: node tools/pebble-editor/drive.js [baseUrl] [outDir]
const { chromium } = require('playwright');

(async () => {
  const base = process.argv[2] || 'http://localhost:8137';
  const out = process.argv[3] || '/tmp/pebble-sandbox/drive';
  const face = 'tools/pebble-editor/examples/neubrutalism-plus.design.json';
  const errors = [];

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
  });

  await page.goto(base + '/app/?face=' + face, { waitUntil: 'networkidle' });
  await page.waitForSelector('canvas[data-screen="w200"]');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: out + '-0-loaded.png' });

  const canvasPos = await page.evaluate(() => {
    const cv = document.querySelector('canvas[data-screen="w200"]');
    const r = cv.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });
  console.log('canvas w200 at', JSON.stringify(canvasPos));
  const px = (dx, dy) => ({ x: canvasPos.x + dx * 3, y: canvasPos.y + dy * 3 });

  const sel = () => page.evaluate(() => JSON.stringify(window.__editor.selections));

  // click battery bar (w200 stacked: x22 y141 w155 h32 -> device ~(100,157))
  let p = px(100, 157);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(300);
  console.log('click battery bar ->', await sel());
  await page.screenshot({ path: out + '-1-click-battery.png' });

  // click steps bar (device ~(100,197))
  p = px(100, 197);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(300);
  console.log('click steps bar ->', await sel());
  await page.screenshot({ path: out + '-2-click-steps.png' });

  // click date text (device ~(145,20))
  p = px(145, 20);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(300);
  console.log('click date text ->', await sel());

  // drag battery bar +10x: down at (100,157), move in steps, up
  p = px(100, 157);
  await page.mouse.click(p.x, p.y);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  for (let i = 1; i <= 5; i++) {
    await page.mouse.move(p.x + i * 6, p.y);
    await page.waitForTimeout(60);
  }
  await page.mouse.up();
  await page.waitForTimeout(300);
  console.log('after drag ->', await sel());
  const box = await page.evaluate(() => {
    const S = window.__editor;
    const l = S.design.screens.w200.layers.find(l => l.id === 'bars');
    const item = l.items.find(i => i.value === '$battery' && i.visibleWhen && i.visibleWhen.value === 0);
    return JSON.stringify(item.box);
  });
  console.log('battery box now:', box);
  await page.screenshot({ path: out + '-3-after-drag.png' });

  console.log('ERRORS:', errors.length ? errors : 'none');
  await browser.close();
})().catch(e => { console.error('DRIVER FAILED:', e); process.exit(1); });
