/* QA chức năng cho BẮT MÂY — chạy: node qa-check.mjs */
import { chromium } from 'playwright-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://127.0.0.1:8642/';
const QA_DIR = '/Users/nhan/Documents/01_CongViec/Projects/project_aws_01/aws-flying-quiz/qa/';

const results = [];
const errors = [];
const ok = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond });
  console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : ''));
};

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));

async function state() {
  return page.evaluate(() => {
    const vis = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), visible: r.width > 0 && r.height > 0 };
    };
    return {
      active: (document.querySelector('.screen.active') || {}).id || null,
      answers: document.querySelectorAll('#arena .answer').length,
      dock: vis('#qdock'),
      dockHidden: !!document.querySelector('#qdock')?.hidden,
      timer: document.querySelector('#timer-n')?.textContent,
      hearts: document.querySelectorAll('#hud-lives .heart:not(.lost)').length,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      bonusActive: !!document.querySelector('#screen-bonus.active'),
      bopts: document.querySelectorAll('#bonus-options .bopt').length,
      gift: document.querySelector('#gift-card')?.className || '',
      leader: document.querySelectorAll('#leader li').length,
      podium: document.querySelectorAll('#podium .pod').length,
    };
  });
}
const tapNth = (sel, n) => page.locator(sel).nth(n).dispatchEvent('pointerdown');
/* chờ màn chơi sẵn sàng (3 thẻ đã bay, chưa resolving) */
async function waitPlayReady(timeout = 7000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const okp = await page.evaluate(() =>
      S.phase === 'play' && !S.resolving && S.answers.length === (S.round === 1 ? 4 : 3) &&
      document.querySelectorAll('#arena .answer').length === (S.round === 1 ? 4 : 3));
    if (okp) return true;
    await page.waitForTimeout(200);
  }
  return false;
}

/* ---------- 1. các màn hình ---------- */
for (const s of ['cover', 'howto', 'round', 'play', 'bonus', 'result']) {
  await page.goto(BASE + '?debug=' + s, { waitUntil: 'load' });
  await page.waitForTimeout(s === 'play' || s === 'bonus' ? 3400 : 1200);
  const st = await state();
  if (s === 'bonus') {
    ok('screen:bonus overlay mở', st.bonusActive, 'bonusActive=' + st.bonusActive);
  } else {
    ok('screen:' + s + ' active', st.active === 'screen-' + s, 'active=' + st.active);
  }
  ok('screen:' + s + ' no-hoverflow', st.overflowX <= 0, 'overflowX=' + st.overflowX);
}

/* ---------- 2. màn chơi: đáp án bay + timer ---------- */
await page.goto(BASE + '?debug=play', { waitUntil: 'load' });
await page.waitForTimeout(2600);
let st = await state();
ok('play: 4 đáp án bay (vòng 1)', st.answers === 4, 'answers=' + st.answers);
ok('pack: nạp từ js/questions.json', await page.evaluate(() => S.packSource) === 'json', 'src=' + await page.evaluate(() => S.packSource));
ok('vòng 1: đáp án đúng là tên đầy đủ + có 2 fake', await page.evaluate(() => {
  const q = S.questions[S.qIndex];
  const labels = q.options.map((o) => o.label);
  const okReal = ['Amazon Web Services', 'Google Cloud'].every((l) => labels.includes(l));
  const okCorrect = ['Amazon Web Services', 'Google Cloud'].includes(q.options[q.correctIdx].label);
  const fakes = labels.filter((l) => !['Amazon Web Services', 'Google Cloud'].includes(l));
  return q.options.length === 4 && okReal && okCorrect && fakes.length === 2;
}));
ok('tốc độ: block ×1.0/×1.2/×1.4/×1.6', await page.evaluate(() =>
  speedMult(1, 0) === 1 && speedMult(1, 5) === 1.2 && speedMult(2, 0) === 1.4 && speedMult(2, 5) === 1.6
), 'm=' + await page.evaluate(() => [speedMult(1, 0), speedMult(1, 5), speedMult(2, 0), speedMult(2, 5)].join(',')));
ok('play: dock câu hỏi hiển thị', st.dock && st.dock.visible && !st.dockHidden, 'dock=' + JSON.stringify(st.dock));
ok('play: timer đếm', /^[1-5]$/.test(st.timer || ''), 'timer=' + st.timer);

/* ---------- 3. overlap giữa các thẻ ---------- */
const overlaps = [];
for (let k = 0; k < 6; k++) {
  await page.waitForTimeout(300);
  overlaps.push(await page.evaluate(() => {
    const els = [...document.querySelectorAll('#arena .answer')];
    const rects = els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    let worst = 0;
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
      const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
      const area = ix * iy, minArea = Math.min(a.w * a.h, b.w * b.h);
      if (minArea > 0) worst = Math.max(worst, area / minArea);
    }
    return worst;
  }));
}
ok('play: thẻ không đè nhau (>30%)', Math.max(...overlaps) < 0.3, 'max=' + Math.max(...overlaps).toFixed(2) + ' [' + overlaps.map((v) => v.toFixed(2)).join(',') + ']');

/* ---------- 4. chạm đúng (qua DOM) ---------- */
let pre = await page.evaluate(() => ({ correctIdx: S.questions[S.qIndex].correctIdx, main: S.main, lives: S.lives, qIndex: S.qIndex }));
await tapNth('#arena .answer', pre.correctIdx);
await page.waitForTimeout(1600);
let post = await page.evaluate(() => ({ main: S.main, lives: S.lives, qIndex: S.qIndex, streak: S.streak }));
ok('chạm đúng → +1 điểm', post.main === pre.main + 1, `main ${pre.main}→${post.main}`);
ok('chạm đúng → sang câu mới', post.qIndex === pre.qIndex + 1, `q ${pre.qIndex}→${post.qIndex}`);
ok('chạm đúng → không mất mạng', post.lives === pre.lives);

/* ---------- 3b. đáp án bơi qua lại (respawn) ---------- */
let respawnSeen = false;
for (let k = 0; k < 48 && !respawnSeen; k++) {
  respawnSeen = await page.evaluate(() => S.answers.some((a) => a.crossings > 0));
  if (!respawnSeen) await page.waitForTimeout(250);
}
ok('play: đáp án quay lại sau khi bơi qua (respawn)', respawnSeen,
  'crossings=' + (await page.evaluate(() => S.answers.map((a) => a.crossings).join(','))));

/* ---------- 5. chạm sai → −1 mạng (qua engine cho deterministic) ---------- */
ok('chạm sai: đủ điều kiện test', await waitPlayReady(), 'playReady');
pre = await page.evaluate(() => ({ lives: S.lives }));
await page.evaluate(() => { const q = S.questions[S.qIndex]; resolve((q.correctIdx + 1) % q.options.length); });
await page.waitForTimeout(1800);
post = await page.evaluate(() => ({ lives: S.lives, streak: S.streak }));
ok('chạm sai → −1 mạng', post.lives === pre.lives - 1, `lives ${pre.lives}→${post.lives}`);
ok('chạm sai → streak về 0', post.streak === 0, 'streak=' + post.streak);

/* ---------- 6. timeout trừ mạng ---------- */
ok('timeout: đủ điều kiện test', await waitPlayReady(), 'playReady');
pre = await page.evaluate(() => ({ lives: S.lives }));
await page.evaluate(() => { S.lives = 2; resolve(null); });
await page.waitForTimeout(1800);
post = await page.evaluate(() => ({ lives: S.lives }));
ok('hết giờ → −1 mạng', post.lives === 1, `lives ${pre.lives}→${post.lives}`);

/* ---------- 7. bonus mở sau chuỗi 5 + đúng +3 + resume ---------- */
await page.evaluate(() => { S.lives = 3; S.streak = 4; S.bonusCount = 0; S.usedBonus = []; S.bonus = 0; });
ok('bonus: đủ điều kiện test', await waitPlayReady(), 'playReady');
await page.evaluate(() => resolve(S.questions[S.qIndex].correctIdx));
await page.waitForTimeout(1500);
st = await state();
ok('chuỗi 5 → mở bonus chọn-nhiều', st.bonusActive && st.bopts === 4, 'bonusActive=' + st.bonusActive + ' bopts=' + st.bopts);
// tích ĐÚNG HẾT rồi chốt → +3
const bq = await page.evaluate(() => ({ nCorrect: S.bonusQ.correctIds.length, bonus: S.bonus }));
ok('bonus multi: có >= 2 đáp án đúng', bq.nCorrect >= 2, 'nCorrect=' + bq.nCorrect);
await page.evaluate(() => {
  S.bonusQ.order.forEach((o, idx) => { if (S.bonusQ.correctIds.includes(o.id)) bonusToggle(idx); });
  bonusSubmit();
});
await page.waitForTimeout(2400);
let bst = await page.evaluate(() => ({ bonus: S.bonus, bonusCount: S.bonusCount, phase: S.phase, paused: S.paused, streak: S.streak, lives: S.lives }));
ok('bonus đúng hết → +3', bst.bonus === bq.bonus + 3, `bonus ${bq.bonus}→${bst.bonus}`);
ok('bonus xong → resume play', bst.phase === 'play' && !bst.paused, 'phase=' + bst.phase);
ok('bonus xong → streak về 0', bst.streak === 0);
ok('bonus không trừ mạng', bst.lives === 3, 'lives=' + bst.lives);
// mở bonus thứ 2, tích SAI 1 câu → +0
await page.evaluate(() => { openBonus(); });
await page.waitForTimeout(600);
await page.evaluate(() => {
  const bq2 = S.bonusQ;
  const wrongIdx = bq2.order.findIndex((o) => !bq2.correctIds.includes(o.id));
  bq2.order.forEach((o, idx) => { if (bq2.correctIds.includes(o.id)) bonusToggle(idx); });
  bonusToggle(wrongIdx); // thêm 1 câu sai
  bonusSubmit();
});
await page.waitForTimeout(2400);
bst = await page.evaluate(() => ({ bonus: S.bonus, phase: S.phase }));
ok('bonus sai 1 câu → +0', bst.bonus === 3, 'bonus=' + bst.bonus);
ok('bonus sai → vẫn resume play', bst.phase === 'play', 'phase=' + bst.phase);

/* ---------- 8. hết mạng → kết quả ---------- */
ok('kết thúc: đủ điều kiện test', await waitPlayReady(), 'playReady');
await page.evaluate(() => { S.lives = 1; S.main = 15; resolve(null); });
await page.waitForTimeout(2600);
st = await state();
ok('hết mạng → màn kết quả', st.active === 'screen-result', 'active=' + st.active);
ok('kết quả: đủ điều kiện quà (main 15)', st.gift.includes('ok'), 'gift=' + st.gift);
ok('kết quả: podium 3 người', st.podium === 3, 'podium=' + st.podium);
ok('kết quả: bảng xếp hạng có dòng', st.leader >= 1, 'leader=' + st.leader);
const resTotals = await page.evaluate(() => ({
  total: document.querySelector('#result-total').textContent,
  main: document.querySelector('#res-main').textContent,
  bonus: document.querySelector('#res-bonus').textContent,
  max: document.querySelector('#result-max').textContent,
}));
ok('kết quả: tổng = chính + bonus', Number(resTotals.total) === Number(resTotals.main) + Number(resTotals.bonus), JSON.stringify(resTotals));

/* ---------- 9. chụp ảnh cuối ---------- */
for (const s of ['cover', 'howto', 'round', 'play', 'bonus', 'result']) {
  await page.goto(BASE + '?debug=' + s, { waitUntil: 'load' });
  await page.waitForTimeout(s === 'play' || s === 'bonus' ? 3400 : 1200);
  await page.screenshot({ path: QA_DIR + 'final-' + s + '.png' });
}

/* ---------- tổng kết ---------- */
const fails = results.filter((r) => !r.pass);
console.log('\n=== console/page errors ===');
(errors.length ? errors : ['(không có)']).forEach((e) => console.log(e));
console.log('\n=== KẾT QUẢ: ' + (results.length - fails.length) + '/' + results.length + ' PASS ===');
await browser.close();
process.exit(fails.length ? 1 : 0);
