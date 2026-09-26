/* ============================================================
   BẮT MÂY — API client + mapping sang Django backend
   (thay cho backend-api.js + game-api-connector.js cũ)

   Backend: backend/ (Django REST) — endpoints:
     POST /api/players/                  tra cứu / tạo người chơi
     POST /api/game/start/               mở lượt, trả 40 thẻ + 2 câu bonus + session_token
     POST /api/game/submit/              nộp nhật ký thao tác, server chấm điểm
     GET  /api/game/attempts/<id>/       chi tiết lượt chơi
     GET  /api/leaderboard/?limit=10     top 10 (không lộ MSSV)
     GET  /api/rewards/me/               điều kiện nhận quà của phiên hiện tại
     GET  /health/                       health check

   Điểm quan trọng — BE chấm theo mô hình THẺ:
     mỗi log gửi lên phải có card_id tồn tại trong backend/data/cards.json;
     vòng 1 target = AWS, vòng 2 target = GCP; action 'clicked' | 'missed'.
   Quiz FE vì vậy được MAP sang thẻ: mỗi câu hỏi có q.cardId (xem js/questions.json),
   chạm đúng → clicked card của câu; chạm sai / hết giờ → clicked thẻ provider đối diện
   (để BE ghi nhận 1 lượt sai, khớp đúng số tim FE hiển thị).
   ============================================================ */
'use strict';

const API_BASE = (new URLSearchParams(location.search).get('api'))
  || (/^__/.test(window.API_BASE_URL || '') ? '' : window.API_BASE_URL) // placeholder chưa được CI thay → bỏ qua
  || 'http://localhost:8000';

const API_TIMEOUT = 12000;
const LS_KEY = 'batmay_plays_v1';   // fallback offline (giữ nguyên key cũ)

let session = null;      // { token, attemptId }
let online = false;

/* ---------- HTTP ---------- */
// AbortSignal.timeout chỉ có từ iOS Safari 16 — máy cũ tự dựng bằng AbortController
function timeoutSignal(ms) {
  if (AbortSignal.timeout) return AbortSignal.timeout(ms);
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}
async function request(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const res = await fetch(API_BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: timeoutSignal(API_TIMEOUT),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.detail || firstError(data) || ('HTTP ' + res.status));
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function firstError(data) {
  // DRF trả {field: ["msg"]} khi validate lỗi
  for (const k of Object.keys(data || {})) {
    const v = data[k];
    if (Array.isArray(v) && v.length) return k + ': ' + v[0];
    if (typeof v === 'string') return v;
  }
  return null;
}

/* ---------- health ---------- */
async function health() {
  try {
    const d = await request('/health/');
    online = d.status === 'ok';
  } catch (e) {
    online = false;
  }
  return online;
}

/* ---------- người chơi / lượt chơi ---------- */
/**
 * Tra cứu số lượt còn lại. Không truyền tên (hoặc tên rỗng) thì BE giữ nguyên tên cũ.
 * @returns {Promise<{left:number,total:number,canPlay:boolean,online:boolean}>}
 */
async function playsLeft(mssv, name) {
  if (online) {
    try {
      const d = await request('/api/players/', {
        method: 'POST',
        body: { student_id: mssv, display_name: name || '' },
      });
      const max = (window.CFG && CFG.maxPlays) || 3;
      return { left: Math.max(0, max - d.attempts_count), total: max, canPlay: d.can_play, online: true };
    } catch (e) {
      console.warn('[API] playsLeft lỗi, dùng localStorage:', e.message);
    }
  }
  const max = (window.CFG && CFG.maxPlays) || 3;
  const left = Math.max(0, max - localPlays(mssv).length);
  return { left, total: max, canPlay: left > 0, online: false };
}

/**
 * Mở lượt chơi mới trên BE.
 * @returns {Promise<{attemptId, sessionToken, bonusQuestions, attemptsLeft, online}>}
 */
async function startGame(mssv, name) {
  if (online) {
    try {
      const d = await request('/api/game/start/', {
        method: 'POST',
        body: { student_id: mssv, display_name: name },
      });
      session = { token: d.session_token, attemptId: d.attempt_id };
      const key = await bonusKey();
      return {
        attemptId: d.attempt_id,
        sessionToken: d.session_token,
        attemptsLeft: d.attempts_left,
        bonusQuestions: d.bonus_questions.map((q) => normalizeBonus(q, key)),
        online: true,
      };
    } catch (e) {
      if (e.status === 403) throw new Error('Bạn đã chơi đủ 3 lượt cho phép.');
      console.warn('[API] start lỗi, chơi offline:', e.message);
      online = false;
    }
  }
  const max = (window.CFG && CFG.maxPlays) || 3;
  return { attemptId: null, sessionToken: null, attemptsLeft: max - localPlays(mssv).length, bonusQuestions: null, online: false };
}

/**
 * Nộp kết quả. BE chấm điểm server-side (idempotent theo attempt_id).
 * @returns {Promise<{server:object|null, online:boolean, error?:string}>}
 */
async function submitGame(payload) {
  const { attemptId, mssv, name, answers, bonusAnswers, durationMs } = payload;

  if (online && attemptId) {
    try {
      const server = await request('/api/game/submit/', {
        method: 'POST',
        token: session && session.token,
        body: {
          attempt_id: attemptId,
          session_token: session && session.token,
          action_logs: buildActionLogs(answers),
          bonus_answers: buildBonusAnswers(bonusAnswers),
          duration_ms: durationMs,
        },
      });
      return { server, online: true };
    } catch (e) {
      console.warn('[API] submit lỗi, chỉ lưu localStorage:', e.message);
      localSubmit({ mssv, name, main: payload.main, bonus: payload.bonus, bonusCount: payload.bonusCount, ts: Date.now() });
      return { server: null, online: false, error: e.message };
    }
  }

  localSubmit({ mssv, name, main: payload.main, bonus: payload.bonus, bonusCount: payload.bonusCount, ts: Date.now() });
  return { server: null, online: false };
}

/** Chi tiết lượt chơi (lấy finished_at để đánh dấu "BẠN" trên BXH). */
async function attemptDetails(attemptId) {
  if (!online || !attemptId) return null;
  try {
    return await request('/api/game/attempts/' + attemptId + '/', { token: session && session.token });
  } catch (e) {
    return null;
  }
}

/** Điều kiện nhận quà của phiên hiện tại. */
async function rewards() {
  if (!session) throw new Error('Chưa có phiên chơi');
  return request('/api/rewards/me/', { token: session.token });
}

/* ---------- bảng xếp hạng ---------- */
/** @returns {Promise<Array<{name,main,bonus,total,ts}>>} */
async function leaderboard(limit = 10) {
  if (online) {
    try {
      const d = await request('/api/leaderboard/?limit=' + limit);
      return d.top_entries.map((e) => ({
        name: e.display_name,
        main: e.main_score,
        bonus: e.bonus_points,
        total: e.total_score,
        ts: e.finished_at ? Date.parse(e.finished_at) : 0,
      }));
    } catch (e) {
      console.warn('[API] leaderboard lỗi, dùng localStorage:', e.message);
    }
  }
  return localLeaderboard();
}

/* ---------- MAP quiz → thẻ BE ---------- */
const DISTRACTOR = { AWS: 'gcp-bigquery', GCP: 'aws-ec2' }; // thẻ provider đối diện = lượt sai
const cardProvider = (cardId) => (cardId && cardId.indexOf('aws-') === 0 ? 'AWS' : 'GCP');

/**
 * answers: [{cardId, correct, timeout, timestamp}] theo đúng thứ tự diễn ra.
 * BE: vòng 1 target AWS, vòng 2 target GCP → gửi round theo provider của thẻ.
 */
function buildActionLogs(answers) {
  const logs = [];
  let n = 0;
  for (const a of answers || []) {
    if (!a.cardId) continue;
    const provider = cardProvider(a.cardId);
    const round = provider === 'AWS' ? 1 : 2;
    const base = { round, client_timestamp_ms: a.timestamp || 0 };

    if (a.correct) {
      logs.push({ instance_id: 'q' + n++, card_id: a.cardId, action: 'clicked', ...base });
    } else if (a.timeout) {
      // Hết giờ: FE trừ 1 tim, BE chỉ ghi 'missed' (không trừ tim) → gửi thêm 1 lượt
      // chạm thẻ đối diện để số tim_left của BE khớp với FE.
      logs.push({ instance_id: 'q' + n++, card_id: a.cardId, action: 'missed', ...base });
      logs.push({ instance_id: 'q' + n++, card_id: DISTRACTOR[provider], action: 'clicked', ...base });
    } else {
      logs.push({ instance_id: 'q' + n++, card_id: DISTRACTOR[provider], action: 'clicked', ...base });
    }
  }
  return logs;
}

function buildBonusAnswers(list) {
  return (list || [])
    .filter((b) => b.questionId)
    .map((b) => ({ question_id: b.questionId, selected_indices: b.selectedIndices || [] }));
}

/** Câu bonus của BE → shape UI của game (options id = index gốc để nộp đúng selected_indices). */
function normalizeBonus(q, key) {
  return {
    id: q.id,
    service: q.service_name,
    text: q.question,
    difficulty: 'basic',
    options: q.options.map((t, i) => ({ id: String(i), name: t, tag: '', icon: '' })),
    correctOptionIds: ((key && key[q.id]) || []).map(String),
  };
}

/* ---------- bảng đáp án bonus (chỉ để hiện phản hồi ngay ở FE) ---------- */
let _bonusKey = null;
async function bonusKey() {
  if (_bonusKey) return _bonusKey;
  try {
    const res = await fetch('js/bonus-key.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();
    _bonusKey = d.answers || {};
  } catch (e) {
    console.warn('[API] không nạp được bonus-key.json — bonus sẽ không hiện đúng/sai ngay:', e.message);
    _bonusKey = {};
  }
  return _bonusKey;
}

/* ---------- fallback offline (localStorage) ---------- */
function loadAll() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; }
}
function saveAll(d) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(d)); } catch (e) {}
}
function localPlays(mssv) {
  const d = loadAll();
  return (d[mssv] && d[mssv].plays) || [];
}
function localSubmit(entry) {
  const d = loadAll();
  const rec = d[entry.mssv] || { name: entry.name, plays: [] };
  rec.name = entry.name;
  rec.plays.push({ ts: entry.ts, main: entry.main, bonus: entry.bonus, total: entry.main + entry.bonus, bonusCount: entry.bonusCount });
  d[entry.mssv] = rec;
  saveAll(d);
}
function localLeaderboard() {
  const best = [];
  for (const rec of Object.values(loadAll())) {
    let b = null;
    for (const p of rec.plays) {
      if (!b || p.total > b.total || (p.total === b.total && (p.main > b.main || (p.main === b.main && p.ts < b.ts)))) b = p;
    }
    if (b) best.push({ name: rec.name, main: b.main, bonus: b.bonus, total: b.total, ts: b.ts });
  }
  best.sort((a, b) => b.total - a.total || b.main - a.main || a.ts - b.ts);
  return best;
}

/* ---------- export ---------- */
window.GameAPI = {
  health,
  playsLeft,
  startGame,
  submitGame,
  attemptDetails,
  rewards,
  leaderboard,
  isOnline: () => online,
  baseURL: () => API_BASE,
  // cho QA/debug
  _buildActionLogs: buildActionLogs,
};