/* Giả lập Safari iOS cũ (không có dvh, không có AbortSignal.timeout) — chạy: node qa/old-safari-check.mjs
   Cần server tĩnh ở frontend/: python3 -m http.server 8642 */
import { chromium } from 'playwright-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://127.0.0.1:8642/';
let fail = 0;
const ok = (name, cond, extra = '') => { if (!cond) fail++; console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : '')); };

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
for (const oldSafari of [false, true]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (oldSafari) {
    // dvh không hỗ trợ → trình duyệt bỏ cả khai báo; giả lập bằng unit rác
    await page.route('**/css/style.css', async (route) => {
      const res = await route.fetch();
      route.fulfill({ response: res, body: (await res.text()).replaceAll('100dvh', '100bogusunit') });
    });
    await page.addInitScript(() => { delete AbortSignal.timeout; });
  }
  const tag = oldSafari ? '[old-safari] ' : '[modern] ';
  // api trỏ vào server tĩnh → request trả 404 (không phải TypeError)
  await page.goto(BASE + '?debug=play&api=' + encodeURIComponent(BASE.slice(0, -1)));
  await page.waitForTimeout(3500);
  const m = await page.evaluate(() => {
    const h = (s) => Math.round(document.querySelector(s).getBoundingClientRect().height);
    const ar = document.querySelector('#arena').getBoundingClientRect();
    const inside = ar.height <= 0 ? 0 : [...document.querySelectorAll('#arena .answer')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.bottom > ar.top && r.top < ar.bottom && r.right > ar.left && r.left < ar.right;
    }).length;
    return { app: h('#app'), arena: h('#arena'), answers: document.querySelectorAll('#arena .answer').length, inside };
  });
  ok(tag + '#app cao đầy màn hình', m.app >= 800, 'app=' + m.app);
  ok(tag + '#arena có chiều cao', m.arena > 200, 'arena=' + m.arena);
  ok(tag + 'đáp án đã spawn', m.answers >= 3, 'answers=' + m.answers);
  ok(tag + 'có đáp án bay trong arena', m.inside >= 1, 'inside=' + m.inside);
  const reqErr = await page.evaluate(() => request('/health/').then(() => 'ok', (e) => e.name + ': ' + e.message));
  ok(tag + 'request không chết vì thiếu API', !/TypeError/.test(reqErr), reqErr);
  ok(tag + 'không có pageerror', errors.length === 0, errors.join(' ; '));
  await ctx.close();
}
await browser.close();
process.exit(fail ? 1 : 0);
