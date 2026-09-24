/* ============================================================
   BẮT MÂY — Game API Connector
   Tầng trung gian giữa game logic và backend API.
   Xử lý chuyển đổi dữ liệu, fallback localStorage khi offline.
   ============================================================ */
'use strict';

// Mode: 'hybrid' = ưu tiên API, fallback localStorage | 'api-only' | 'offline'
let mode = 'hybrid';
let backendOnline = false;

// Kiểm tra backend health khi load
async function initConnector() {
  if (window.BackendAPI) {
    backendOnline = await window.BackendAPI.checkBackendHealth();
    console.info('[Connector] Backend ' + (backendOnline ? 'online ✓' : 'offline - dùng localStorage'));
  } else {
    console.warn('[Connector] BackendAPI không tìm thấy - dùng localStorage only');
    mode = 'offline';
  }
}

// ========== PLAYER & ATTEMPTS ==========

/**
 * Kiểm tra số lượt chơi còn lại
 * @param {string} mssv
 * @returns {Promise<{left: number, total: number, canPlay: boolean}>}
 */
async function checkPlaysLeft(mssv) {
  if (mode === 'api-only' || (mode === 'hybrid' && backendOnline)) {
    try {
      const data = await window.BackendAPI.registerPlayer(mssv, 'temp');
      return {
        left: CFG.maxPlays - data.attempts_count,
        total: CFG.maxPlays,
        canPlay: data.can_play,
      };
    } catch (e) {
      if (mode === 'api-only') throw e;
      // Fallback localStorage
      console.warn('[Connector] API failed, fallback localStorage');
    }
  }

  // Offline mode or fallback
  const plays = getPlays(mssv);
  const left = Math.max(0, CFG.maxPlays - plays.length);
  return { left, total: CFG.maxPlays, canPlay: left > 0 };
}

/**
 * Bắt đầu game mới
 * @param {string} mssv
 * @param {string} name
 * @returns {Promise<{attemptId: string, sessionToken: string, questionsData: object}>}
 */
async function startGameSession(mssv, name) {
  if (mode === 'api-only' || (mode === 'hybrid' && backendOnline)) {
    try {
      const data = await window.BackendAPI.startGame(mssv, name);

      // Lưu attemptId và questions data để game sử dụng
      return {
        attemptId: data.attempt_id,
        sessionToken: data.session_token,
        questionsData: null, // Backend hiện chưa trả questions, dùng local pack
        attemptsLeft: data.attempts_left,
      };
    } catch (e) {
      if (e instanceof window.BackendAPI.APIError && e.status === 403) {
        throw new Error('Đã hết ' + CFG.maxPlays + ' lượt chơi');
      }
      if (mode === 'api-only') throw e;
      console.warn('[Connector] Start game API failed, fallback offline mode');
    }
  }

  // Offline mode: không có attemptId từ server
  return {
    attemptId: 'offline_' + Date.now(),
    sessionToken: null,
    questionsData: null,
    attemptsLeft: CFG.maxPlays - getPlays(mssv).length,
  };
}

/**
 * Submit kết quả game
 * @param {object} result - {attemptId, mssv, name, main, bonus, bonusCount, lives, answers, bonusAnswers, durationMs}
 * @returns {Promise<{serverScore: object, saved: boolean}>}
 */
async function submitGameResult(result) {
  const localEntry = {
    mssv: result.mssv,
    name: result.name,
    main: result.main,
    bonus: result.bonus,
    total: result.main + result.bonus,
    bonusCount: result.bonusCount,
    ts: Date.now(),
  };

  // Lưu localStorage trước (backup)
  submitPlay(localEntry);

  // Submit lên server nếu có API
  if (mode === 'api-only' || (mode === 'hybrid' && backendOnline)) {
    try {
      // Chuyển đổi answers sang action_logs format
      const actionLogs = buildActionLogs(result.answers);
      const bonusAnswers = buildBonusAnswers(result.bonusAnswers);

      const serverData = await window.BackendAPI.submitGame(
        result.attemptId,
        actionLogs,
        bonusAnswers,
        result.durationMs || 0
      );

      console.info('[Connector] Game submitted to server:', serverData);

      return {
        serverScore: serverData,
        saved: true,
      };
    } catch (e) {
      console.error('[Connector] Submit failed:', e);
      if (mode === 'api-only') throw e;
      // Hybrid mode: đã lưu localStorage, báo user
      return {
        serverScore: null,
        saved: true, // saved to localStorage
        error: e.message,
      };
    }
  }

  // Offline mode
  return { serverScore: null, saved: true };
}

// Chuyển đổi answers (game internal format) sang action_logs (API format)
function buildActionLogs(answers) {
  if (!answers || !Array.isArray(answers)) return [];

  return answers.map((ans, idx) => ({
    instance_id: 'card_' + idx + '_' + (ans.cardId || 'unknown'),
    card_id: ans.cardId || ans.id || 'unknown',
    round: ans.round || 1,
    action: ans.action || (ans.correct ? 'tap_correct' : 'tap_wrong'),
    client_timestamp_ms: ans.timestamp || null,
  }));
}

// Chuyển đổi bonusAnswers sang API format
function buildBonusAnswers(bonusAnswers) {
  if (!bonusAnswers || !Array.isArray(bonusAnswers)) return [];

  return bonusAnswers.map(b => ({
    question_id: b.questionId,
    selected_indices: b.selectedIndices || [],
  }));
}

// ========== LEADERBOARD ==========

/**
 * Lấy bảng xếp hạng
 * @param {number} limit
 * @returns {Promise<Array<{name, main, bonus, total, ts}>>}
 */
async function fetchLeaderboard(limit = 10) {
  if (mode === 'api-only' || (mode === 'hybrid' && backendOnline)) {
    try {
      const data = await window.BackendAPI.getLeaderboard(limit);

      // Chuyển đổi format server về format frontend
      return data.top_entries.map(entry => ({
        name: entry.display_name,
        main: 0, // API không trả main/bonus riêng, chỉ total
        bonus: 0,
        total: entry.total_score,
        ts: entry.finished_at ? new Date(entry.finished_at).getTime() : Date.now(),
      }));
    } catch (e) {
      console.warn('[Connector] Leaderboard API failed:', e);
      if (mode === 'api-only') throw e;
    }
  }

  // Fallback: localStorage
  return getLeaderboard();
}

// ========== LOCALSTORAGE FALLBACK (giữ nguyên logic cũ) ==========

const LS_KEY = 'batmay_plays_v1';

function loadAll() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY)) || {};
  } catch (e) {
    return {};
  }
}

function saveAll(d) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(d));
  } catch (e) {
    console.error('[Storage] Save failed:', e);
  }
}

function getPlays(mssv) {
  const d = loadAll();
  return (d[mssv] && d[mssv].plays) || [];
}

function submitPlay(entry) {
  const d = loadAll();
  const rec = d[entry.mssv] || { name: entry.name, plays: [] };
  rec.name = entry.name;
  rec.plays.push({
    ts: entry.ts,
    main: entry.main,
    bonus: entry.bonus,
    total: entry.total,
    bonusCount: entry.bonusCount,
  });
  d[entry.mssv] = rec;
  saveAll(d);
  return true;
}

function getLeaderboard() {
  const best = [];
  for (const [mssv, rec] of Object.entries(loadAll())) {
    let b = null;
    for (const p of rec.plays) {
      if (!b || p.total > b.total || (p.total === b.total && (p.main > b.main || (p.main === b.main && p.ts < b.ts)))) {
        b = p;
      }
    }
    if (b) best.push({ name: rec.name, main: b.main, bonus: b.bonus, total: b.total, ts: b.ts });
  }
  best.sort((a, b) => b.total - a.total || b.main - a.main || a.ts - b.ts);
  return best;
}

// ========== MODE CONTROL ==========

function setMode(newMode) {
  if (['hybrid', 'api-only', 'offline'].includes(newMode)) {
    mode = newMode;
    console.info('[Connector] Mode switched to:', mode);
  }
}

function getMode() {
  return { mode, backendOnline };
}

// Export connector API
window.GameConnector = {
  init: initConnector,
  checkPlaysLeft,
  startGameSession,
  submitGameResult,
  fetchLeaderboard,
  setMode,
  getMode,

  // Direct localStorage access (cho migration)
  getPlays,
  submitPlay,
  getLeaderboard,
};

// Auto init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initConnector);
} else {
  initConnector();
}
