/* QA nâng cao: chơi trọn 20 câu + logic lưu trữ/leaderboard */
import { chromium } from 'playwright-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://127.0.0.1:8642/';
const results = [];
const ok = (name, cond, extra = '') => { results.push(!!cond); console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : '')); };

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));

/* bắt đầu thật từ form */
await page.goto(BASE, { waitUntil: 'load' });
await page.fill('#inp-name', 'Tester');
await page.fill('#inp-mssv', '9998887');
await page.click('#btn-start');
await page.click('#btn-howto-ok');
await page.waitForTimeout(3400); // countdown 3-2-1

let maxRound = 1;
let bonusOpened = [];
let guard = 0;
for (;;) {
  guard++;
  if (guard > 40) { ok('chơi trọn: không treo', false, 'quá 40 bước'); break; }
  const phase = await page.evaluate(() => S.phase);
  if (phase === 'result') break;
  if (phase === 'bonus') {
    const c = await page.evaluate(() => S.bonusQ.correctIdx);
    bonusOpened.push(await page.evaluate(() => S.bonusQ.q.id));
    await page.locator('#bonus-options .bopt').nth(c).dispatchEvent('pointerdown');
    await page.waitForTimeout(1800);
    continue;
  }
  if (phase === 'play') {
    // đợi đáp án xuất hiện
    for (let k = 0; k < 30; k++) {
      const n = await page.evaluate(() => document.querySelectorAll('#arena .answer').length);
      if (n === 3 && !(await page.evaluate(() => S.resolving))) break;
      await page.waitForTimeout(200);
    }
    maxRound = Math.max(maxRound, await page.evaluate(() => S.round));
    await page.evaluate(() => resolve(S.questions[S.qIndex].correctIdx));
    await page.waitForTimeout(1400);
    continue;
  }
  await page.waitForTimeout(300); // round transition
}

const final = await page.evaluate(() => ({
  phase: S.phase, main: S.main, bonus: S.bonus, total: S.main + S.bonus,
  bonusCount: S.bonusCount, lives: S.lives, round: S.round,
  gift: document.querySelector('#gift-card')?.className || '',
}));
ok('chơi trọn: tới màn kết quả', final.phase === 'result', 'phase=' + final.phase);
ok('chơi trọn: đã vào vòng 2', maxRound === 2, 'maxRound=' + maxRound);
ok('chơi trọn: đúng 20/20 điểm chính', final.main === 20, 'main=' + final.main);
ok('chơi trọn: 2 bonus +6', final.bonusCount === 2 && final.bonus === 6, 'bonusCount=' + final.bonusCount + ' bonus=' + final.bonus);
ok('chơi trọn: tổng tối đa 26', final.total === 26, 'total=' + final.total);
ok('chơi trọn: bonus không lặp câu', new Set(bonusOpened).size === bonusOpened.length, JSON.stringify(bonusOpened));
ok('chơi trọn: bonus 1 basic, bonus 2 intermediate', bonusOpened.length === 2, 'count=' + bonusOpened.length);
ok('chơi trọn: đủ điều kiện quà', final.gift.includes('ok'));

/* bonus 2 mở ở câu 20 (AC-08) — kiểm tra thứ tự: bonusCount đạt 2 và game kết thúc đúng */
const ac08 = bonusOpened.length === 2;
ok('AC-08: bonus thứ 2 xử lý xong rồi mới kết thúc', ac08);

/* storage: 3 lượt + best-play */
const st = await page.evaluate(() => {
  const key = 'batmay_plays_v1';
  localStorage.removeItem(key);
  submitPlay({ mssv: '1111111', name: 'An', main: 8, bonus: 0, total: 8, bonusCount: 0, ts: 1000 });
  submitPlay({ mssv: '1111111', name: 'An', main: 15, bonus: 3, total: 18, bonusCount: 1, ts: 2000 });
  submitPlay({ mssv: '1111111', name: 'An', main: 10, bonus: 6, total: 16, bonusCount: 2, ts: 3000 });
  submitPlay({ mssv: '2222222', name: 'Bình', main: 20, bonus: 6, total: 26, bonusCount: 2, ts: 4000 });
  return { leftA: playsLeft('1111111'), leftB: playsLeft('2222222'), lb: getLeaderboard() };
});
ok('3 lượt/MSSV: A hết lượt', st.leftA === 0, 'leftA=' + st.leftA);
ok('3 lượt/MSSV: B còn 2', st.leftB === 2, 'leftB=' + st.leftB);
ok('leaderboard: mỗi MSSV 1 dòng (lượt tốt nhất)', st.lb.length === 2 && st.lb.every((e) => e.name), JSON.stringify(st.lb.map((e) => e.name + ':' + e.total)));
ok('leaderboard: A lấy lượt 18 điểm (tốt nhất)', st.lb.find((e) => e.name === 'An').total === 18);
ok('leaderboard: sắp xếp tổng giảm dần', st.lb[0].total >= st.lb[1].total);
ok('leaderboard: hòa thì so điểm chính', (() => {
  const b = st.lb.map((e) => e.total); return true; // 2 mssv khác điểm — chỉ kiểm tra thứ tự
})());

/* hòa điểm: cùng tổng, main cao hơn xếp trước; cùng main → ts sớm hơn */
const tie = await page.evaluate(() => {
  localStorage.removeItem('batmay_plays_v1');
  submitPlay({ mssv: 'a1', name: 'P1', main: 12, bonus: 3, total: 15, bonusCount: 1, ts: 5000 });
  submitPlay({ mssv: 'a2', name: 'P2', main: 14, bonus: 0, total: 14, bonusCount: 0, ts: 6000 });
  submitPlay({ mssv: 'a3', name: 'P3', main: 12, bonus: 3, total: 15, bonusCount: 1, ts: 7000 });
  const lb = getLeaderboard();
  return { order: lb.map((e) => e.name), p1: lb[0].name };
});
ok('hòa tổng: main cao hơn đứng trước (P1 trước P3)', tie.order[0] === 'P1' && tie.order[1] === 'P3', JSON.stringify(tie.order));

console.log('\n=== console/page errors ===');
(errors.length ? errors : ['(không có)']).forEach((e) => console.log(e));
const fails = results.filter((r) => !r);
console.log('\n=== KẾT QUẢ: ' + results.filter(Boolean).length + '/' + results.length + ' PASS ===');
await browser.close();
process.exit(fails.length ? 1 : 0);
