/* ============================================================
   BẮT MÂY — Flying Cloud Quiz · Game engine (MVP v0.4)
   State machine: cover → howto → round → play ⇄ bonus → result
   Luật theo PRD Match & Catch: 3 mạng, 2 vòng × 10 câu,
   chuỗi 5 mở bonus (tối đa 2), main 0–20 + bonus 0–6 = tối đa 26.
   ============================================================ */
'use strict';

/* ---------- helpers ---------- */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function shuffle(a) {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
}
const HEART_SVG = '<svg viewBox="0 0 24 24"><path d="M12 21s-7.1-4.6-9.3-8.6C1.2 9.7 2.9 6 6.2 5.2 8.5 4.7 10.4 5.9 12 7.8c1.6-1.9 3.5-3.1 5.8-2.6 3.3.8 5 4.5 3.1 7.2C19.1 16.4 12 21 12 21z" fill="currentColor"/></svg>';

/* ---------- lưu trữ (GameAPI — backend Django chấm điểm, offline fallback localStorage) ---------- */
async function playsLeft(mssv, name) {
  try {
    const result = await window.GameAPI.playsLeft(mssv, name);
    return result.left;
  } catch (e) {
    console.error('[Game] Check plays left failed:', e);
    return 0;
  }
}

/* ---------- state ---------- */
const S = {
  player: null,
  pack: null, packSource: null,
  round: 0, questions: [], qIndex: 0,
  main: 0, bonus: 0, lives: CFG.lives,
  streak: 0, bonusCount: 0, usedBonus: [],
  phase: 'cover', paused: false, resolving: false,
  qRemain: 0, pendingBonus: false,
  answers: [], arenaRect: null,
  bonusQ: null,
  raf: null, lastTs: 0,
  lastSubmitTs: 0,
  endedByLives: false,
  attemptId: null, sessionToken: null,
  online: false, bonusQuestions: null, serverResult: null,
  gameStartTime: 0,
  actionLogs: [], bonusAnswers: [],
};
const TO = [];
function st(fn, ms) { TO.push(setTimeout(fn, ms)); }
function clearTO() { TO.forEach(clearTimeout); TO.length = 0; }

/* ---------- màn hình ---------- */
function showScreen(id) {
  $$('.screen').forEach((s) => s.classList.remove('active'));
  if (id === 'bonus') {
    $('#screen-play').classList.add('active');
    $('#screen-bonus').classList.add('active');
    return;
  }
  $('#screen-' + id).classList.add('active');
}

/* ---------- ambient ---------- */
function initAmbient() {
  const holder = $('#bg-particles');
  for (let i = 0; i < 16; i++) {
    const p = document.createElement('span');
    p.className = 'p';
    const s = rand(1.5, 3.2);
    p.style.cssText = `left:${rand(2, 98)}%;top:${rand(4, 96)}%;width:${s}px;height:${s}px;--tw:${rand(3, 7).toFixed(1)}s;--twd:${rand(0, 5).toFixed(1)}s`;
    holder.appendChild(p);
  }
}

/* ---------- HUD ---------- */
function renderHearts() {
  const el = $('#hud-lives');
  el.innerHTML = '';
  for (let i = 0; i < CFG.lives; i++) {
    const h = document.createElement('span');
    h.className = 'heart' + (i < S.lives ? '' : ' lost');
    h.innerHTML = HEART_SVG;
    el.appendChild(h);
  }
}
async function resetPlay(name, mssv) {
  clearTO();
  stopLoop();
  S.player = { name, mssv };
  S.round = 0; S.questions = []; S.qIndex = 0;
  S.main = 0; S.bonus = 0; S.lives = CFG.lives;
  S.streak = 0; S.bonusCount = 0; S.usedBonus = [];
  S.phase = 'cover'; S.paused = false; S.resolving = false;
  S.qRemain = 0; S.pendingBonus = false; S.answers = [];
  S.arenaRect = null; S.bonusQ = null; S.endedByLives = false;
  S.attemptId = null; S.sessionToken = null;
  S.online = false; S.bonusQuestions = null; S.serverResult = null;
  S.gameStartTime = Date.now();
  S.actionLogs = []; S.bonusAnswers = [];
  $('#hud-score').textContent = '0';
  $('#progress').style.width = '0%';
  renderHearts();
  updateStreak();

  // Mở lượt trên BE (nhận session_token + 2 câu bonus thật của lượt này)
  try {
    const session = await window.GameAPI.startGame(mssv, name);
    S.attemptId = session.attemptId;
    S.sessionToken = session.sessionToken;
    S.online = session.online;
    S.bonusQuestions = session.bonusQuestions;
    console.info('[Game] Lượt chơi:', session.online ? S.attemptId : 'offline');
  } catch (e) {
    console.error('[Game] Failed to start session:', e);
    alert(e.message);
    throw e;
  }
}
function breakHeartAnim() {
  const hearts = $$('#hud-lives .heart');
  const target = hearts[S.lives]; // heart vừa mất (index = lives sau khi giảm)
  if (target) { target.classList.add('breaking'); st(() => target.classList.remove('breaking'), 600); }
}
function updateStreak() {
  const el = $('#hud-streak');
  el.hidden = S.streak <= 0;
  if (S.streak > 0) {
    $('#hud-streak-n').textContent = S.streak;
    el.classList.remove('bump', 'hot'); void el.offsetWidth;
    el.classList.add('bump');
    el.classList.toggle('hot', S.streak >= CFG.streakForBonus);
  }
}
function bumpScore() {
  const el = $('.score-chip');
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
}
function setProgress() {
  $('#progress').style.width = (S.qIndex / S.questions.length * 100) + '%';
}

/* ---------- luồng chính ---------- */
function initCover() {
  $('#start-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#inp-name').value.trim();
    const mssv = $('#inp-mssv').value.trim();
    if (!name) { shakeInput($('#inp-name')); return; }
    if (!mssv) { shakeInput($('#inp-mssv')); return; }

    const left = await playsLeft(mssv, name);
    if (left <= 0) {
      shakeInput($('#inp-mssv'));
      alert('Mã sinh viên này đã dùng hết ' + CFG.maxPlays + ' lượt chơi.');
      return;
    }

    try {
      await resetPlay(name, mssv);
      showScreen('howto');
    } catch (e) {
      // Error đã được xử lý trong resetPlay
    }
  });
  $('#inp-mssv').addEventListener('input', refreshPlayLeft);
  $('#inp-name').addEventListener('input', refreshPlayLeft);
  refreshPlayLeft();
}
function shakeInput(el) {
  el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(7px)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(0)' }], { duration: 380 });
  el.focus();
}
async function refreshPlayLeft() {
  const m = $('#inp-mssv').value.trim();
  const el = $('#play-left');
  if (!m) { el.hidden = true; return; }
  const left = await playsLeft(m, $('#inp-name').value.trim());
  el.hidden = false;
  el.textContent = left > 0 ? 'ⓘ MSSV này còn ' + left + '/' + CFG.maxPlays + ' lượt chơi' : '⛔ MSSV này đã dùng hết ' + CFG.maxPlays + ' lượt';
}

/* ---------- vòng ---------- */
async function ensurePack() {
  if (!S.pack) {
    S.pack = await loadPack();
    S.packSource = window.__PACK_SOURCE || 'unknown';
  }
  return S.pack;
}
function roundIntro(r) {
  clearTO();
  S.round = r;
  ensurePack().then(() => {
    $('#round-label').textContent = ROUNDS[r - 1].label;
    $('#round-title').textContent = ROUNDS[r - 1].title;
    $('#round-desc').textContent = ROUNDS[r - 1].desc;
    showScreen('round');
    countdown(() => startRound(r));
  });
}
function roundTransition(r) {
  clearTO();
  S.phase = 'round';
  $('#round-label').textContent = 'VÒNG ' + (r - 1) + ' HOÀN THÀNH';
  $('#round-title').textContent = 'Điểm chính: ' + S.main + '/' + (CFG.mainPerRound * 2);
  $('#round-desc').textContent = r === 2
    ? 'Chuẩn bị vòng 2 — Hiểu dịch vụ AWS. Bay nhanh hơn đấy, bình tĩnh nhé!'
    : 'Còn ' + S.lives + ' mạng · vào vòng 2 thôi!';
  showScreen('round');
  countdown(() => startRound(r));
}
function countdown(go) {
  const cd = $('#countdown');
  let n = 3;
  const paint = () => { cd.textContent = n; cd.classList.remove('tick'); void cd.offsetWidth; cd.classList.add('tick'); };
  paint();
  const iv = setInterval(() => {
    n--;
    if (n <= 0) { clearInterval(iv); go(); return; }
    paint();
  }, 760);
  TO.push(iv);
}
/* Tốc độ bay tăng CFG.speedStep (6%) mỗi block 5 câu toàn lượt 1–20:
   câu 1–5 ×1.0 · 6–10 ×1.06 · 11–15 ×1.12 · 16–20 ×1.18 (chậm, dễ nhìn) */
function speedMult(round, qIndex) {
  const g = (round - 1) * CFG.mainPerRound + qIndex; // 0–19
  return 1 + CFG.speedStep * Math.floor(g / 5);
}
function toPlayable(q, round) {
  const opts = shuffle(q.options.map((o) => ({ ...o })));
  return {
    round,
    id: q.id,
    cardId: q.cardId,   // thẻ tương ứng trong backend/data/cards.json (BE chấm theo card_id)
    icon: q.icon,
    text: q.text,
    timeMs: q.timeLimitMs || CFG.qTime,
    options: opts,
    correctIdx: opts.findIndex((o) => o.id === q.correctOptionId),
  };
}
function buildRoundQuestions(r) {
  const R = S.pack.rounds[r - 1];
  if (r === 1) {
    // cân 5 AWS + 5 GCP (theo field provider) để đáp án đúng không lệch hẳn 1 bên
    const aws = shuffle(R.questions.filter((q) => q.provider === 'aws'));
    const gcp = shuffle(R.questions.filter((q) => q.provider !== 'aws'));
    const take = [
      ...aws.slice(0, Math.ceil(CFG.mainPerRound / 2)),
      ...gcp.slice(0, Math.floor(CFG.mainPerRound / 2)),
    ];
    const rest = shuffle(R.questions.filter((q) => !take.includes(q)));
    while (take.length < Math.min(CFG.mainPerRound, R.questions.length)) take.push(rest.pop());
    return shuffle(take).map((q) => toPlayable(q, 1));
  }
  return shuffle(R.questions).slice(0, Math.min(CFG.mainPerRound, R.questions.length)).map((q) => toPlayable(q, 2));
}

function startRound(r) {
  S.round = r;
  S.questions = buildRoundQuestions(r);
  S.qIndex = 0;
  showScreen('play');
  setProgress();
  startQuestion();
}

/* ---------- câu hỏi ---------- */
function startQuestion() {
  const q = S.questions[S.qIndex];
  S.resolving = false;
  S.paused = false;
  S.phase = 'play';
  S.qRemain = 0; // timer chỉ chạy sau khi đáp án đã bay (tránh timeout ma trong lúc focus)

  $('#hud-round').textContent = 'V' + S.round;
  $('#hud-q').textContent = (S.qIndex + 1) + '/' + S.questions.length;
  const mult = speedMult(S.round, S.qIndex);
  $('#hud-speed').textContent = '×' + mult.toFixed(1);
  setProgress();

  const dock = $('#qdock');
  $('#q-icon').src = q.icon;
  $('#q-text').textContent = q.text;
  dock.hidden = true;

  const focus = $('#focus');
  $('#focus-icon').src = q.icon;
  $('#focus-text').textContent = q.text;
  focus.style.display = '';
  focus.classList.remove('dock');
  focus.classList.remove('in'); void focus.offsetWidth;
  focus.classList.add('in');

  clearArena();

  st(() => {
    if (S.phase !== 'play' || S.resolving) return;
    dockToTop(focus, dock, () => {
      if (S.phase !== 'play') return;
      focus.style.display = 'none';
      spawnAnswers(q);
      S.qRemain = q.timeMs;
    });
  }, CFG.focusMs);
}
function dockToTop(focus, dock, done) {
  const fr = focus.getBoundingClientRect();
  dock.hidden = false;
  void dock.offsetWidth;
  const dr = dock.getBoundingClientRect();
  focus.style.setProperty('--dx', (dr.left + dr.width / 2 - fr.left - fr.width / 2) + 'px');
  focus.style.setProperty('--dy', (dr.top + dr.height / 2 - fr.top - fr.height / 2) + 'px');
  focus.style.setProperty('--sx', (dr.width / fr.width).toFixed(3));
  focus.style.setProperty('--sy', (dr.height / fr.height).toFixed(3));
  focus.classList.remove('in');      // animation fill "both" đè transition — phải gỡ trước
  focus.classList.add('dock');
  st(done, 350);
}
function clearArena() {
  const cards = $$('#arena .answer');
  if (cards.length) {
    cards.forEach((c) => c.classList.add('fly-out'));
    st(() => { $('#arena').innerHTML = ''; S.answers = []; }, 320);
  } else {
    $('#arena').innerHTML = '';
    S.answers = [];
  }
}

/* ---------- đáp án bay ---------- */
const P1 = ['horizontal', 'vertical', 'diagonal', 'opposite'];
const P2 = ['horizontal', 'vertical', 'diagonal', 'cross', 'opposite'];
function pickPattern() {
  const p = S.round === 1 ? P1 : P2;
  return p[S.qIndex % p.length];
}
function entryState(pattern, i, W, H, w, h, lane, rev = false) {
  const T = (S.round === 1 ? CFG.flyMsR1 : CFG.flyMsR2) / speedMult(S.round, S.qIndex);
  const m = 30;
  const px = W + w + 2 * m;  // quãng đường ngang đầy đủ (vào → ra khỏi màn hình)
  const py = H + h + 2 * m;  // quãng đường dọc đầy đủ
  const spd = () => T * rand(0.88, 1.14) / 1000; // giây để đi hết quãng ngang
  // Tốc độ chuẩn px/s lấy theo trục ngang → mọi pattern bay cùng tốc độ cảm nhận.
  // (Trước đây dọc/chéo tự chia theo T nên nhanh hơn hẳn: dọc ~1,3x, chéo ~1,5x.)
  const vRef = () => px / spd();
  const lanesY = [0.18, 0.5, 0.82].map((f) => f * H);
  const lanesY4 = [0.14, 0.38, 0.62, 0.86].map((f) => f * H); // vòng 1 giờ 4 đáp án
  const lanesX = [0.24, 0.5, 0.76].map((f) => f * W);
  switch (pattern) {
    case 'horizontal': {
      const flip = Math.random() < 0.5 ? 1 : -1;
      return { x0: flip > 0 ? -w - m : W + m, y0: lanesY4[lane % 4] - h / 2, vx: flip * vRef(), vy: 0, kind: 'h' };
    }
    case 'vertical': {
      const flip = Math.random() < 0.5 ? 1 : -1;
      return { x0: lanesX[lane % 3] - w / 2, y0: flip > 0 ? -h - m : H + m, vx: 0, vy: flip * vRef(), kind: 'v' };
    }
    case 'diagonal': {
      const corners = [[0, 0], [1, 0], [0, 1], [1, 1]];
      let [cx, cy] = corners[lane % 4];
      if (rev) { cx = 1 - cx; cy = 1 - cy; }
      const vxS = rev ? (cx ? 1 : -1) : (cx ? -1 : 1);
      const vyS = rev ? (cy ? 1 : -1) : (cy ? -1 : 1);
      let x0 = cx ? W + m : -w - m;
      let y0 = cy ? H + m : -h - m;
      // Hướng chéo góc-đối-góc nhưng chuẩn hoá độ lớn về vRef → không nhanh hơn ngang
      const dx = vxS * px, dy = vyS * py;
      const L = Math.hypot(dx, dy) || 1;
      const v = vRef();
      const vx = v * dx / L, vy = v * dy / L;
      // 3 đường chéo song song lệch nhau để không đụng nhau giữa màn hình
      const off = (i % 3 - 1) * Math.min(W, H) * 0.22;
      x0 += -vy / v * off; y0 += vx / v * off;
      return { x0, y0, vx, vy, kind: 'd' };
    }
    case 'opposite': {
      const side = i < 2 ? -1 : 1;
      return { x0: side < 0 ? -w - m : W + m, y0: lanesY4[lane % 4] - h / 2, vx: -side * vRef(), vy: 0, kind: 'h' };
    }
    case 'cross': {
      if (i === 0) return rev
        ? { x0: W / 2 - w / 2, y0: H + m, vx: 0, vy: -vRef(), kind: 'v' }
        : { x0: W / 2 - w / 2, y0: -h - m, vx: 0, vy: vRef(), kind: 'v' };
      if (i === 1) return rev
        ? { x0: W + m, y0: H * 0.32 - h / 2, vx: -vRef(), vy: 0, kind: 'h' }
        : { x0: -w - m, y0: H * 0.32 - h / 2, vx: vRef(), vy: 0, kind: 'h' };
      return rev
        ? { x0: -w - m, y0: H * 0.7 - h / 2, vx: vRef(), vy: 0, kind: 'h' }
        : { x0: W + m, y0: H * 0.7 - h / 2, vx: -vRef(), vy: 0, kind: 'h' };
    }
  }
}
function spawnAnswers(q) {
  const arena = $('#arena');
  const rect = arena.getBoundingClientRect();
  S.arenaRect = { W: rect.width, H: rect.height };
  const pattern = pickPattern();
  const letters = ['A', 'B', 'C', 'D'];

  S.answers = q.options.map((opt, i) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'answer';
    if (q.round === 1) {
      el.innerHTML = '<img class="ans-icon" src="' + opt.icon + '" alt=""><span class="ans-text">' + opt.label + '</span>';
    } else {
      el.innerHTML = '<span class="ans-letter">' + letters[i] + '</span><span class="ans-text">' + opt.label + '</span>';
    }
    el.addEventListener('pointerdown', (ev) => { ev.preventDefault(); tapAnswer(i); });
    arena.appendChild(el);

    const w = el.offsetWidth, h = el.offsetHeight;
    const stt = entryState(pattern, i, rect.width, rect.height, w, h, i);
    const stagger = pattern === 'diagonal' ? 260 + i * 520 : 260 + i * 270;
    const a = {
      el, i, w, h, pattern, lane: i, kind: stt.kind,
      x: stt.x0, y: stt.y0, vx: stt.vx, vy: stt.vy,
      mode: 'wait', wait: stagger,
      rot: rand(-3.5, 3.5), rotNow: 0,
      sway: { amp: rand(14, 22), freq: rand(1.1, 1.7) },
      swayT: rand(0, Math.PI * 2), rev: false,
      respawnDelay: rand(280, 520),
      crossings: 0,
      tx: stt.x0, ty: stt.y0,
      inv: 1 / (Math.hypot(stt.vx, stt.vy) || 1), // nghịch đảo độ dài v — tính 1 lần, khỏi hypot mỗi frame
    };
    a.el.style.transform = 'translate3d(' + a.x.toFixed(1) + 'px,' + a.y.toFixed(1) + 'px,0) rotate(' + a.rot.toFixed(2) + 'deg)';
    return a;
  });
  ensureLoop();
}

function respawn(a) {
  const { W, H } = S.arenaRect;
  // cá quay đầu: chéo & cross bơi ngược lại; ngang/dọc tự đổi hướng ngẫu nhiên
  if (a.pattern === 'diagonal' || a.pattern === 'cross') a.rev = !a.rev;
  const lane = a.pattern === 'diagonal' ? a.lane : randInt(0, 3);
  const stt = entryState(a.pattern, a.i, W, H, a.w, a.h, lane, a.rev);
  a.x = stt.x0; a.y = stt.y0; a.vx = stt.vx; a.vy = stt.vy;
  a.inv = 1 / (Math.hypot(stt.vx, stt.vy) || 1);
  a.swayT = rand(0, Math.PI * 2);
  a.crossings++;
}
function isOff(a, W, H) {
  // Ngưỡng 130px: điểm spawn chéo lệch tới ~116px (m=30 + off 0.22*min(W,H)≈86) nên phải nằm trong ngưỡng, nếu không thẻ vừa bay đã bị thu hồi → kẹt tàng hình
  return a.x > W + 130 || a.x < -a.w - 130 || a.y > H + 130 || a.y < -a.h - 130;
}
function randInt(a, b) { return Math.floor(rand(a, b + 1)); }

/* ---------- vòng lặp chính ---------- */
function ensureLoop() {
  if (S.raf) return;
  S.lastTs = 0;
  const loop = (ts) => {
    S.raf = requestAnimationFrame(loop);
    if (S.phase !== 'play' && S.phase !== 'bonus') {
      stopLoop();
      return;
    }
    if (!S.lastTs) S.lastTs = ts;
    const dt = Math.min(50, ts - S.lastTs);
    S.lastTs = ts;

    if (S.phase === 'play') {
      if (!S.paused && !S.resolving && S.qRemain > 0) {
        S.qRemain -= dt;
        const tMs = (S.questions[S.qIndex] && S.questions[S.qIndex].timeMs) || CFG.qTime;
        renderTimer('timer', 'timer-n', 'ring', S.qRemain, tMs);
        if (S.qRemain <= 0) { S.qRemain = 0; resolve(null); }
      }
      if (!S.paused && !S.resolving) {
        const { W, H } = S.arenaRect || { W: 0, H: 0 };
        for (const a of S.answers) {
          if (a.mode === 'wait') {
            a.wait -= dt;
            if (a.wait <= 0) {
              if (a.needsRespawn) { a.needsRespawn = false; respawn(a); }
              a.mode = 'fly';
            }
            continue;
          }
          if (a.mode === 'fly') {
            a.x += a.vx * dt / 1000;
            a.y += a.vy * dt / 1000;
            a.swayT += dt / 1000 * a.sway.freq;
            const s = Math.sin(a.swayT);
            let ox = 0, oy = 0;
            if (a.kind === 'h') oy = s * a.sway.amp;
            else if (a.kind === 'v') ox = s * a.sway.amp;
            else {
              ox = -a.vy * a.inv * s * a.sway.amp;
              oy = a.vx * a.inv * s * a.sway.amp;
            }
            a.rotNow = a.rot + s * 2.5; // vẫy nhẹ (trước ±5° gây raster lại liên tục trên mobile)
            a.tx = a.x + ox; a.ty = a.y + oy;
            a.el.style.transform = 'translate3d(' + a.tx.toFixed(1) + 'px,' + a.ty.toFixed(1) + 'px,0) rotate(' + a.rotNow.toFixed(2) + 'deg)';
            if (isOff(a, W, H)) { a.mode = 'wait'; a.wait = a.respawnDelay; a.needsRespawn = true; }
          }
        }
      }
    } else if (S.phase === 'bonus' && S.bonusQ) {
      if (!S.bonusQ.graded) {
        S.bonusQ.remain -= dt;
        renderTimer('bonus-timer', 'bonus-n', 'bonus-ring', S.bonusQ.remain, S.bonusQ.timeMs);
        if (S.bonusQ.remain <= 0) { S.bonusQ.remain = 0; bonusTimeout(); }
      }
    }
  };
  S.raf = requestAnimationFrame(loop);
}
function stopLoop() {
  if (S.raf) { cancelAnimationFrame(S.raf); S.raf = null; }
  S.lastTs = 0;
}
function renderTimer(holderId, numId, ringId, remain, total) {
  const holder = document.getElementById(holderId);
  // Vòng ring: throttle ~10fps (đủ mượt cho timer 5s, giảm 6x ghi DOM so với 60fps)
  const now = performance.now();
  if (!holder._lastRing || now - holder._lastRing > 100) {
    holder._lastRing = now;
    const frac = Math.max(0, Math.min(1, remain / total));
    const C = ringId === 'ring' ? 100.53 : 150.8;
    document.getElementById(ringId).style.strokeDashoffset = (C * (1 - frac)).toFixed(1);
  }
  // Số giây: chỉ ghi DOM khi đổi số (tránh layout thrash mỗi frame)
  const sec = Math.ceil(remain / 1000);
  if (holder._lastSec !== sec) {
    holder._lastSec = sec;
    document.getElementById(numId).textContent = sec;
  }
  // Màu cảnh báo: chỉ chạm classList khi đổi bucket
  const bucket = remain <= 1500 ? 'danger' : (remain <= 2800 ? 'warn' : '');
  if (holder._lastBucket !== bucket) {
    holder._lastBucket = bucket;
    holder.classList.toggle('danger', bucket === 'danger');
    holder.classList.toggle('warn', bucket === 'warn');
  }
}

/* ---------- xử lý chạm ---------- */
function tapAnswer(i) {
  if (S.phase !== 'play' || S.resolving || S.paused) return;
  resolve(i);
}
function resolve(tapped) {
  if (S.resolving) return;
  S.resolving = true;
  const q = S.questions[S.qIndex];
  const correct = tapped !== null && tapped === q.correctIdx;
  const wrong = tapped !== null && !correct;
  const timeout = tapped === null;

  // Nhật ký thao tác để BE chấm điểm (cardId khớp backend/data/cards.json)
  S.actionLogs.push({ cardId: q.cardId, correct, timeout, timestamp: Date.now() });

  S.answers.forEach((a) => { a.mode = 'freeze'; });

  if (correct) {
    S.main++; S.streak++;
    $('#hud-score').textContent = S.main;
    bumpScore();
    const a = S.answers[tapped];
    a.el.classList.add('is-correct');
    burstAt(a.tx + a.w / 2, a.ty + a.h / 2, '#3ddc84');
    fxAt(a.tx + a.w / 2 - 14, a.ty - 6, '+1', 'good');
    S.answers.forEach((x, xi) => { if (xi !== tapped) x.el.classList.add('is-dim'); });
    updateStreak();
    if (S.streak === CFG.streakForBonus && S.bonusCount < CFG.maxBonus && S.lives > 0) {
      S.pendingBonus = true;
    }
  } else {
    S.lives--; S.streak = 0;
    renderHearts(); breakHeartAnim();
    updateStreak();
    if (wrong) {
      const a = S.answers[tapped];
      a.el.classList.add('is-wrong');
      S.answers[q.correctIdx].el.classList.add('reveal-correct');
      S.answers.forEach((x, xi) => { if (xi !== tapped && xi !== q.correctIdx) x.el.classList.add('is-dim'); });
      fxAt(a.tx + a.w / 2 - 16, a.ty - 6, '−1 ❤️', 'bad');
      showBanner('✖ SAI — MẤT 1 MẠNG', 'bad');
    }
    if (timeout) {
      S.answers[q.correctIdx].el.classList.add('reveal-correct');
      S.answers.forEach((x, xi) => { if (xi !== q.correctIdx) x.el.classList.add('is-dim'); });
      showBanner('⏰ HẾT GIỜ — MẤT 1 MẠNG', 'time');
    }
  }

  const delay = correct ? 1000 : 1450;
  st(() => {
    if (S.lives <= 0) { endPlay(true); return; }
    if (correct && S.pendingBonus) { S.pendingBonus = false; openBonus(); return; }
    advanceQuestion();
  }, delay);
}
function advanceQuestion() {
  S.qIndex++;
  if (S.qIndex >= S.questions.length) {
    if (S.round === 1) roundTransition(2);
    else endPlay(false);
  } else {
    startQuestion();
  }
}

/* ---------- hiệu ứng ---------- */
function fxAt(x, y, text, cls, parentEl) {
  const parent = parentEl || $('#fx');
  const el = document.createElement('span');
  el.className = 'fx ' + cls;
  el.textContent = text;
  el.style.left = Math.max(6, x) + 'px';
  el.style.top = Math.max(6, y) + 'px';
  parent.appendChild(el);
  st(() => el.remove(), 1100);
}
function burstAt(x, y, color) {
  for (let i = 0; i < 10; i++) {
    const d = document.createElement('span');
    d.className = 'burst';
    const ang = rand(0, Math.PI * 2), r = rand(24, 62);
    const size = rand(5, 10);
    d.style.cssText = 'left:' + x + 'px;top:' + y + 'px;width:' + size + 'px;height:' + size + 'px;background:' + color + ';--bx:' + Math.cos(ang) * r + 'px;--by:' + Math.sin(ang) * r + 'px';
    $('#fx').appendChild(d);
    st(() => d.remove(), 800);
  }
}
function showBanner(text, cls) {
  const b = $('#banner');
  b.textContent = text;
  b.className = 'banner ' + cls;
  void b.offsetWidth;
  b.classList.add('show');
  st(() => b.classList.remove('show'), 1300);
}

/* ---------- bonus: chọn NHIỀU đáp án, khớp tuyệt đối mới +điểm ---------- */
/* Câu bonus lấy từ /api/game/start (BE chấm theo id + selected_indices);
   offline thì rơi về ngân hàng trong questions.json. */
function openBonus() {
  let b;
  if (S.bonusQuestions && S.bonusQuestions.length) {
    // BE gắn bonus_1 = câu đầu, bonus_2 = câu thứ hai của lượt → hiện đúng thứ tự,
    // không random (lệch thứ tự là mất điểm bonus dù chọn đúng).
    b = S.bonusQuestions[Math.min(S.bonusCount, S.bonusQuestions.length - 1)];
  } else {
    const pool = S.pack.bonus.filter((x) => !S.usedBonus.includes(x.id));
    const basic = pool.filter((x) => x.difficulty === 'basic');
    const inter = pool.filter((x) => x.difficulty !== 'basic');
    const group = S.bonusCount === 0 ? (basic.length ? basic : inter) : (inter.length ? inter : basic);
    b = pick(group.length ? group : pool);
  }
  S.usedBonus.push(b.id);
  S.bonusCount++;
  S.streak = 0;
  updateStreak();

  S.paused = true;
  S.phase = 'bonus';

  const timeMs = b.timeLimitMs || CFG.bonusTime;
  $('#bonus-q').textContent = b.text;
  const box = $('#bonus-options');
  box.innerHTML = '';
  const order = shuffle(b.options.map((o, i) => ({ ...o, orig: i })));
  S.bonusQ = {
    q: b, order,
    correctIds: [...(b.correctOptionIds || [])],
    selected: new Array(order.length).fill(false),
    remain: timeMs, timeMs, graded: false,
  };

  order.forEach((o, i) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'bopt';
    const media = o.icon ? '<img src="' + o.icon + '" alt="">' : '';
    const tag = o.tag ? '<span class="bopt-tag">' + o.tag + '</span>' : '';
    el.innerHTML = '<span class="tick" aria-hidden="true"></span>' + media + '<span><span class="bopt-name">' + o.name + '</span>' + tag + '</span>';
    el.addEventListener('pointerdown', (ev) => { ev.preventDefault(); bonusToggle(i); });
    box.appendChild(el);
  });
  $('#bonus-submit').hidden = false;
  renderTimer('bonus-timer', 'bonus-n', 'bonus-ring', timeMs, timeMs);
  showScreen('bonus');
  ensureLoop();
}
function bonusToggle(i) {
  const bq = S.bonusQ;
  if (!bq || bq.graded) return;
  bq.selected[i] = !bq.selected[i];
  $$('#bonus-options .bopt')[i].classList.toggle('selected', bq.selected[i]);
}
function bonusSubmit() {
  if (!S.bonusQ || S.bonusQ.graded) return;

  // Log bonus answer
  const picked = S.bonusQ.order.filter((o, idx) => S.bonusQ.selected[idx]).map((o) => o.orig);
  S.bonusAnswers.push({
    questionId: S.bonusQ.q.id,
    selectedIndices: picked,
  });

  gradeBonus(false);
}
function gradeBonus(timeout) {
  const bq = S.bonusQ;
  if (!bq || bq.graded) return;
  bq.graded = true;
  $('#bonus-submit').hidden = true;
  const opts = $$('#bonus-options .bopt');
  const card = $('#screen-bonus');
  const r = $('#screen-bonus .bonus-card').getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height * 0.34;

  // Không có bảng đáp án (offline / thiếu bonus-key.json) → không tự đoán điểm,
  // chờ con số chính thức từ BE ở màn kết quả.
  if (!bq.correctIds.length) {
    fxAt(cx - 60, cy, 'ĐÃ GHI NHẬN ✓', 'gold', card);
    st(closeBonus, 1400);
    return;
  }

  const picked = bq.order.filter((o, idx) => bq.selected[idx]).map((o) => o.id).sort();
  const want = [...bq.correctIds].sort();
  const exact = picked.length === want.length && picked.every((id, k) => id === want[k]);
  if (exact) {
    S.bonus += CFG.bonusScore;
    opts.forEach((el, idx) => { el.classList.toggle('is-correct', bq.selected[idx]); el.classList.toggle('is-dim', !bq.selected[idx]); });
    burstAtGold(card);
    fxAt(cx - 40, cy, '+' + CFG.bonusScore + ' ⭐', 'gold', card);
  } else {
    opts.forEach((el, idx) => {
      const isRight = bq.correctIds.includes(bq.order[idx].id);
      if (bq.selected[idx] && !isRight) el.classList.add('is-wrong');
      else if (isRight) el.classList.add('reveal-correct');
      else el.classList.add('is-dim');
    });
    fxAt(cx - 20, cy, timeout ? '⏰ HẾT GIỜ — +0' : '+0', 'bad', card);
  }
  st(closeBonus, 1800);
}
function burstAtGold(parent) {
  const rect = $('#screen-bonus .bonus-card').getBoundingClientRect();
  const layer = document.createElement('div');
  layer.style.cssText = 'position:absolute;inset:0;z-index:5;pointer-events:none';
  for (let i = 0; i < 26; i++) {
    const d = document.createElement('span');
    d.className = 'burst';
    const ang = rand(0, Math.PI * 2), r = rand(40, 130);
    const size = rand(5, 11);
    d.style.cssText = 'left:' + (rect.left + rect.width / 2) + 'px;top:' + (rect.top + rect.height / 2) + 'px;width:' + size + 'px;height:' + size + 'px;background:' + pick(['#ffb84d', '#ff9900', '#fff', '#4fd2ff']) + ';--bx:' + Math.cos(ang) * r + 'px;--by:' + Math.sin(ang) * r + 'px';
    layer.appendChild(d);
  }
  parent.appendChild(layer);
  st(() => layer.remove(), 850);
}
function bonusTimeout() {
  if (!S.bonusQ || S.bonusQ.graded) return;

  // Log bonus timeout
  const picked = S.bonusQ.order.filter((o, idx) => S.bonusQ.selected[idx]).map((o) => o.orig);
  S.bonusAnswers.push({
    questionId: S.bonusQ.q.id,
    selectedIndices: picked,
  });

  gradeBonus(true);
}
function closeBonus() {
  if (S.phase !== 'bonus') return;
  S.phase = 'play';
  S.paused = false;
  S.bonusQ = null;
  $('#screen-bonus').classList.remove('active');
  advanceQuestion();
}

/* ---------- kết thúc ---------- */
async function endPlay(died) {
  clearTO();
  stopLoop();
  S.phase = 'result';
  S.endedByLives = died;
  clearArena();
  $('#progress').style.width = '100%';

  const durationMs = Date.now() - S.gameStartTime;
  S.lastSubmitTs = Date.now();

  // BE chấm điểm server-side (idempotent). Offline → lưu localStorage.
  try {
    const res = await window.GameAPI.submitGame({
      attemptId: S.attemptId,
      mssv: S.player.mssv,
      name: S.player.name,
      main: S.main,
      bonus: S.bonus,
      bonusCount: S.bonusCount,
      answers: S.actionLogs,
      bonusAnswers: S.bonusAnswers,
      durationMs,
    });
    S.serverResult = res.server;
    if (res.server) {
      console.info('[Game] Điểm server:', res.server);
      const detail = await window.GameAPI.attemptDetails(res.server.attempt_id);
      if (detail && detail.finished_at) S.lastSubmitTs = Date.parse(detail.finished_at);
    } else if (res.error) {
      console.warn('[Game] Server chấm lỗi — hiển thị điểm local:', res.error);
    }
  } catch (e) {
    console.error('[Game] Failed to submit game:', e);
  }

  renderResult(died);
  showScreen('result');
}
function countUp(el, v) {
  const t0 = performance.now();
  const dur = 950;
  const tick = (t) => {
    const k = Math.min(1, (t - t0) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = Math.round(v * e);
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
async function renderResult(died) {
  // Điểm hiển thị lấy từ BE (server chấm); chỉ offline mới dùng số local
  const srv = S.serverResult;
  const main = srv ? srv.main_score : S.main;
  const bonus = srv ? srv.bonus_points : S.bonus;
  const total = srv ? srv.total_score : S.main + S.bonus;
  const threshold = srv ? srv.reward_threshold : CFG.giftMainMin;
  const eligible = srv ? srv.is_eligible_reward : (S.main + S.bonus >= CFG.giftMainMin);

  $('#result-badge').textContent = died ? '💔' : (total >= 10 ? '🏆' : '🎯');
  countUp($('#result-total'), total);
  $('#result-hello').textContent = died
    ? S.player.name + ' — hết mạng rồi! Lần sau bình tĩnh hơn nhé.'
    : S.player.name + ' — đã chinh phục cả 2 vòng!';
  $('#res-main').textContent = main;
  $('#res-bonus').textContent = bonus;

  const gc = $('#gift-card');
  if (eligible) {
    gc.className = 'gift-card ok';
    gc.innerHTML = '<b>🎁 ĐỦ ĐIỀU KIỆN NHẬN QUÀ</b><p>Tổng điểm ' + total + ' ≥ ngưỡng ' + threshold + '. Đưa màn hình này cho ban tổ chức để đối chiếu MSSV.</p>';
  } else {
    gc.className = 'gift-card no';
    gc.innerHTML = '<b>Chưa đủ điều kiện nhận quà</b><p>Cần ≥ ' + threshold + ' điểm tổng — bạn có ' + total + '.</p>';
  }
  await renderLeaderboard();

  const left = await playsLeft(S.player.mssv, S.player.name);
  $('#btn-replay').hidden = left <= 0;
  $('#result-note').textContent = (srv ? 'Điểm do server chấm. ' : 'Đang offline — điểm chỉ lưu trên máy. ')
    + (left > 0
      ? 'MSSV còn ' + left + '/' + CFG.maxPlays + ' lượt chơi — bảng xếp hạng chỉ lấy lượt tốt nhất của bạn.'
      : 'Đã dùng hết ' + CFG.maxPlays + ' lượt chơi của MSSV này.');

  if (total >= 10) confettiBurst();
}
async function renderLeaderboard() {
  let lb = [];
  try {
    lb = await window.GameAPI.leaderboard(10);
  } catch (e) {
    console.error('[Game] Failed to fetch leaderboard:', e);
    lb = [];
  }

  const myIdx = lb.findIndex((e) => e.ts === S.lastSubmitTs);
  if (myIdx >= 0) lb[myIdx].you = true;

  // podium
  const pod = $('#podium');
  pod.innerHTML = '';
  const order = [lb[1], lb[0], lb[2]];
  const medals = ['🥈', '🥇', '🥉'];
  const maxTotal = lb.length ? lb[0].total : 1;
  order.forEach((e, i) => {
    const d = document.createElement('div');
    d.className = 'pod';
    d.innerHTML = e
      ? '<div class="pod-rank">' + medals[i] + '</div><div class="pod-body"><span class="pod-name">' + e.name + '</span><span class="pod-score">' + e.total + '</span><span class="pod-base"><i class="pod-bar" style="width:' + Math.round(e.total / maxTotal * 100) + '%"></i></span></div><div class="pod-mid"></div>'
      : '<div class="pod-rank">' + medals[i] + '</div><div class="pod-body"><span class="pod-name">—</span><span class="pod-score">0</span><span class="pod-base"><i class="pod-bar" style="width:0%"></i></span></div><div class="pod-mid"></div>';
    pod.appendChild(d);
  });

  // danh sách
  const list = $('#leader');
  list.innerHTML = '';
  const rows = lb.slice(0, 10);
  if (myIdx >= 10) rows.push(lb[myIdx]);
  rows.forEach((e, i) => {
    const rank = e.you ? myIdx + 1 : lb.indexOf(e) + 1;
    const li = document.createElement('li');
    if (e.you) li.className = 'you';
    li.innerHTML = '<span class="rk">' + rank + '</span><span class="nm">' + e.name + '<small>Chính ' + e.main + ' · Bonus ' + e.bonus + '</small></span><span class="sc">' + e.total + '</span><span class="mm">' + (e.you ? 'BẠN' : '') + '</span>';
    list.appendChild(li);
  });
}

/* ---------- confetti ---------- */
function confettiBurst() {
  const cv = $('#confetti');
  const ctx = cv.getContext('2d');
  cv.width = innerWidth; cv.height = innerHeight;
  const colors = ['#ff9900', '#ffb84d', '#4fd2ff', '#3ddc84', '#b48bff', '#ff5c72', '#ffffff'];
  const parts = [];
  for (let i = 0; i < 170; i++) {
    parts.push({
      x: cv.width / 2 + rand(-80, 80), y: cv.height * 0.32,
      vx: rand(-7.5, 7.5), vy: rand(-12, -3.5),
      g: rand(0.14, 0.24), s: rand(5, 10), rot: rand(0, 6.28), vr: rand(-0.3, 0.3),
      c: pick(colors), r: Math.random() < 0.5,
    });
  }
  let frames = 0;
  (function tick() {
    frames++;
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (const p of parts) {
      p.vy += p.g; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.c;
      if (p.r) ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.62);
      else { ctx.beginPath(); ctx.arc(0, 0, p.s / 2, 0, 6.29); ctx.fill(); }
      ctx.restore();
    }
    if (frames < 170) requestAnimationFrame(tick);
    else ctx.clearRect(0, 0, cv.width, cv.height);
  })();
}

/* ---------- khởi động ---------- */
function applyDebug() {
  const dbg = new URLSearchParams(location.search).get('debug');
  if (!dbg) return;
  S.player = { name: 'Minh Anh', mssv: '2212345' };
  S.main = 9; S.bonus = 3; S.lives = 2; S.streak = 2; S.round = 1;
  renderHearts(); updateStreak(); $('#hud-score').textContent = S.main;
  if (dbg === 'howto') return showScreen('howto');
  if (dbg === 'round') {
    $('#round-label').textContent = ROUNDS[0].label;
    $('#round-title').textContent = ROUNDS[0].title;
    $('#round-desc').textContent = ROUNDS[0].desc;
    $('#countdown').textContent = '1';
    return showScreen('round');
  }
  if (dbg === 'play') { S.questions = buildRoundQuestions(1); S.qIndex = 0; showScreen('play'); setProgress(); startQuestion(); return; }
  if (dbg === 'bonus') {
    S.questions = buildRoundQuestions(1); S.qIndex = 0; S.phase = 'play';
    showScreen('play'); startQuestion();
    st(() => { S.usedBonus = []; S.bonusCount = 0; openBonus(); }, 2600);
    return;
  }
  if (dbg === 'result') {
    S.endedByLives = false; S.lastSubmitTs = Date.now();
    renderResult(false);
    return showScreen('result');
  }
}
function init() {
  initAmbient();
  renderHearts();
  initCover();
  // Kiểm tra BE 1 lần rồi mới nạp pack (để playsLeft/leaderboard biết đang online)
  window.GameAPI.health().then(() => {
    refreshPlayLeft();
    return ensurePack();
  }).then(() => applyDebug());
  $('#btn-howto-ok').addEventListener('click', () => roundIntro(1));
  $('#bonus-submit').addEventListener('click', (ev) => { ev.preventDefault(); bonusSubmit(); });
  $('#btn-replay').addEventListener('click', () => {
    $('#inp-name').value = S.player ? S.player.name : '';
    $('#inp-mssv').value = S.player ? S.player.mssv : '';
    refreshPlayLeft();
    showScreen('cover');
  });
  $('#btn-home').addEventListener('click', () => {
    showScreen('cover');
  });
  window.addEventListener('resize', () => {
    const arena = $('#arena');
    if (arena && S.phase === 'play') {
      const r = arena.getBoundingClientRect();
      S.arenaRect = { W: r.width, H: r.height };
    }
  });
}
document.addEventListener('DOMContentLoaded', init);
