/* E2E: chơi tự động FE (127.0.0.1:8642) → BE Django (localhost:8000), so điểm. */
import { chromium } from 'playwright-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://127.0.0.1:8642/';
const API = 'http://localhost:8000';

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));

const MSSV = 'E2E' + String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
const NAME = 'E2E Tester';
const MODE = process.env.MODE || 'quick';                 // quick = 5 đúng rồi sai hết | full = 14 đúng (hết vòng 1 + 4 câu vòng 2) rồi sai hết
const CORRECT_TAPS = MODE === 'full' ? 14 : 5;
console.log('MSSV test:', MSSV, '| mode:', MODE);

await page.goto(BASE);
await page.fill('#inp-name', NAME);
await page.fill('#inp-mssv', MSSV);
await page.waitForTimeout(600);
console.log('hint lượt:', await page.textContent('#play-left'));

await page.click('#btn-start');
await page.waitForFunction(() => document.querySelector('#screen-howto.active'), null, { timeout: 15000 });
const started = await page.evaluate(() => ({ attemptId: S.attemptId, online: S.online, bonus: (S.bonusQuestions || []).map((b) => b.id) }));
console.log('start:', JSON.stringify(started));
if (!started.online || !started.attemptId) throw new Error('FE không mở được lượt trên BE');

await page.click('#btn-howto-ok');

let taps = 0, bonusDone = 0;
const t0 = Date.now();
while (Date.now() - t0 < 240000) {
  const st = await page.evaluate(() => ({
    phase: S.phase, resolving: S.resolving, n: S.answers.length, round: S.round,
    qIndex: S.qIndex, lives: S.lives, main: S.main, streak: S.streak,
    correctIdx: S.questions[S.qIndex] ? S.questions[S.qIndex].correctIdx : -1,
  }));

  if (st.phase === 'result') break;

  if (st.phase === 'bonus') {
    const bq = await page.evaluate(() => ({
      id: S.bonusQ.q.id,
      order: S.bonusQ.order.map((o) => ({ id: o.id, orig: o.orig })),
      correct: S.bonusQ.correctIds,
    }));
    const picks = bq.order.map((o, i) => (bq.correct.includes(o.id) ? i : -1)).filter((i) => i >= 0);
    for (const i of picks) await page.locator('#bonus-options .bopt').nth(i).dispatchEvent('pointerdown');
    await page.click('#bonus-submit');
    bonusDone++;
    console.log(`bonus ${bonusDone}: ${bq.id} chọn ${picks.length}/${bq.correct.length} đáp án đúng`);
    await page.waitForFunction(() => S.phase === 'play', null, { timeout: 10000 });
    continue;
  }

  if (st.phase === 'play' && !st.resolving && st.n > 0) {
    const wantCorrect = taps < CORRECT_TAPS;         // đúng N câu đầu → hết vòng 1 / vào vòng 2
    const idx = wantCorrect ? st.correctIdx : (st.correctIdx + 1) % st.n;
    await page.locator('#arena .answer').nth(idx).dispatchEvent('pointerdown');
    taps++;
    console.log(`tap #${taps} (V${st.round} câu ${st.qIndex + 1}) ${wantCorrect ? 'ĐÚNG' : 'SAI'} → tim ${st.lives}${wantCorrect ? '' : '→' + (st.lives - 1)}`);
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(120);
}

await page.waitForFunction(() => document.querySelector('#screen-result.active'), null, { timeout: 20000 });
await page.waitForTimeout(2500); // chờ leaderboard render

const out = await page.evaluate(() => ({
  main: S.main, bonus: S.bonus, lives: S.lives,
  server: S.serverResult,
  shown: {
    total: document.querySelector('#result-total').textContent,
    main: document.querySelector('#res-main').textContent,
    bonus: document.querySelector('#res-bonus').textContent,
    gift: document.querySelector('#gift-card').className,
    note: document.querySelector('#result-note').textContent,
  },
  leader: [...document.querySelectorAll('#leader li')].map((li) => li.textContent.replace(/\s+/g, ' ').trim()),
  logs: S.actionLogs, bonusAnswers: S.bonusAnswers,
}));

const lb = await (await fetch(API + '/api/leaderboard/')).json();
const mine = lb.top_entries.find((e) => e.display_name === NAME);
const rw = await (await fetch(API + `/api/game/attempts/${out.server.attempt_id}/`)).json();

console.log('\n===== KẾT QUẢ =====');
console.log('client  : main', out.main, '| bonus', out.bonus, '| lives', out.lives);
console.log('server  :', JSON.stringify(out.server));
console.log('hiển thị: total', out.shown.total, '| main', out.shown.main, '| bonus', out.shown.bonus, '|', out.shown.gift);
console.log('note    :', out.shown.note);
console.log('BXH BE  :', JSON.stringify(mine));
console.log('attempt :', JSON.stringify({ status: rw.status, main: rw.main_score, bonus: rw.bonus_points, wrong: rw.wrong, hearts: rw.hearts_left, b1: rw.bonus_1_correct, b2: rw.bonus_2_correct }));
console.log('BXH FE  :', out.leader.slice(0, 3));
console.log('lỗi JS  :', errors.length ? errors : 'không');

const checks = [
  ['server chấm điểm (không phải local)', !!out.server],
  ['main khớp', out.server.main_score === out.main],
  ['bonus khớp', out.server.bonus_points === out.bonus],
  ['total khớp', out.server.total_score === out.main + out.bonus],
  ['màn kết quả hiện điểm server', Number(out.shown.total) === out.server.total_score],
  ['hết 3 tim đúng lúc kết thúc', out.server.hearts_left === 0 && out.server.wrong === 3],
  ['bonus server khớp local (+' + (MODE === 'full' ? 6 : 3) + ')', out.server.bonus_points === out.bonus],
  ['BXH BE có người chơi này', !!mine && mine.total_score === out.server.total_score],
  ['BXH FE có tên này', out.leader.some((r) => r.includes(NAME))],
  ['không lỗi JS', errors.length === 0],
];
console.log('\n===== CHECK =====');
let fail = 0;
for (const [name, pass] of checks) { if (!pass) fail++; console.log((pass ? 'PASS' : 'FAIL') + ' | ' + name); }

await page.screenshot({ path: '/tmp/mnc-result.png', fullPage: true });
console.log('\nscreenshot: /tmp/mnc-result.png');
await browser.close();
process.exit(fail ? 1 : 0);
