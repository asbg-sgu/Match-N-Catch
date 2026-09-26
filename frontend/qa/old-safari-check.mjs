/* Tương thích trình duyệt: chạy game + BXH trên Chromium / WebKit / Firefox,
   mỗi engine thêm 1 lượt giả lập trình duyệt cũ (không có dvh, không có AbortSignal.timeout).
   Chạy: (cd frontend && python3 -m http.server 8642) rồi node qa/old-safari-check.mjs
   WebKit/Firefox cần: npx playwright-core install webkit firefox (thiếu thì bỏ qua) */
import { chromium, webkit, firefox } from 'playwright-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://127.0.0.1:8642/';
const API = BASE.slice(0, -1); // trỏ vào server tĩnh → request trả 404 (không phải TypeError)
let fail = 0;
const ok = (name, cond, extra = '') => { if (!cond) fail++; console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : '')); };

const engines = [
  ['chrome', () => chromium.launch({ executablePath: CHROME, headless: true })],
  ['webkit', () => webkit.launch()],
  ['firefox', () => firefox.launch()],
];

for (const [name, launch] of engines) {
  let browser;
  try { browser = await launch(); } catch (e) { console.log('SKIP | ' + name + ' chưa cài'); continue; }
  for (const old of [false, true]) {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 }, hasTouch: true, ...(name === 'firefox' ? {} : { isMobile: true }),
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    if (old) {
      // dvh không hỗ trợ → trình duyệt bỏ cả khai báo; giả lập bằng unit rác
      await page.route('**/css/*.css', async (route) => {
        const res = await route.fetch();
        route.fulfill({ response: res, body: (await res.text()).replaceAll('100dvh', '100bogusunit') });
      });
      await page.addInitScript(() => { delete AbortSignal.timeout; });
    }
    const tag = '[' + name + (old ? '/old' : '') + '] ';

    await page.goto(BASE + '?debug=play&api=' + encodeURIComponent(API));
    await page.waitForTimeout(3500);
    const m = await page.evaluate(() => {
      const h = (s) => Math.round(document.querySelector(s).getBoundingClientRect().height);
      const ar = document.querySelector('#arena').getBoundingClientRect();
      const inside = ar.height <= 0 ? 0 : [...document.querySelectorAll('#arena .answer')].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.bottom > ar.top && r.top < ar.bottom && r.right > ar.left && r.left < ar.right;
      }).length;
      const q = document.querySelector('#q-text').getBoundingClientRect();
      return { app: h('#app'), arena: h('#arena'), answers: document.querySelectorAll('#arena .answer').length, inside, qVisible: q.width > 0 && q.height > 0 };
    });
    ok(tag + '#app cao đầy màn hình', m.app >= 800, 'app=' + m.app);
    ok(tag + '#arena có chiều cao', m.arena > 200, 'arena=' + m.arena);
    ok(tag + 'câu hỏi hiển thị', m.qVisible);
    ok(tag + 'đáp án đã spawn', m.answers >= 2, 'answers=' + m.answers);
    ok(tag + 'có đáp án bay trong arena', m.inside >= 1, 'inside=' + m.inside);
    const reqErr = await page.evaluate(() => request('/health/').then(() => 'ok', (e) => e.name + ': ' + e.message));
    ok(tag + 'request không chết vì thiếu API', !/TypeError/.test(reqErr), reqErr);

    await page.goto(BASE + 'leaderboard.html?api=' + encodeURIComponent(API));
    await page.waitForTimeout(1500);
    const lb = await page.evaluate(() => Math.round(document.querySelector('.lb-page').getBoundingClientRect().height));
    ok(tag + 'BXH: .lb-page cao >= màn hình', lb >= 800, 'h=' + lb);
    const lbErr = await page.evaluate(() => fetch('/x', { signal: timeoutSignal(1000) }).then(() => 'ok', (e) => e.name + ': ' + e.message));
    ok(tag + 'BXH: timeoutSignal dùng được', !/TypeError/.test(lbErr), lbErr);
    ok(tag + 'không có pageerror', errors.length === 0, errors.join(' ; '));
    await ctx.close();
  }
  await browser.close();
}
process.exit(fail ? 1 : 0);
