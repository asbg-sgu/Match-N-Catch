/* ============================================================
   Tích hợp API Backend - Override localStorage functions
   ============================================================ */
'use strict';

// Store player_id, attempt_id và session_token
let currentPlayerId = null;
let currentAttemptId = null;
let currentSessionToken = null;

// Override submitPlay để gọi API
async function submitPlayAPI(entry) {
  if (!currentAttemptId || !currentSessionToken) {
    console.error('No attempt ID or session token');
    // Fallback to localStorage
    const d = loadAll();
    const rec = d[entry.mssv] || { name: entry.name, plays: [] };
    rec.name = entry.name;
    rec.plays.push({ ts: entry.ts, main: entry.main, bonus: entry.bonus, total: entry.total, bonusCount: entry.bonusCount });
    d[entry.mssv] = rec;
    saveAll(d);
    return true;
  }

  // Build action_logs from game state (cần game.js expose data này)
  // Tạm thời gửi empty array - cần tích hợp sâu hơn với game.js
  const actionLogs = [];
  const bonusAnswers = [];
  const durationMs = Date.now() - entry.ts;

  try {
    await submitGame(currentAttemptId, currentSessionToken, actionLogs, bonusAnswers, durationMs);
    return true;
  } catch (error) {
    console.error('Submit failed:', error);
    // Fallback to localStorage
    const d = loadAll();
    const rec = d[entry.mssv] || { name: entry.name, plays: [] };
    rec.name = entry.name;
    rec.plays.push({ ts: entry.ts, main: entry.main, bonus: entry.bonus, total: entry.total, bonusCount: entry.bonusCount });
    d[entry.mssv] = rec;
    saveAll(d);
    return true;
  }
}

// Override getLeaderboard để gọi API
async function getLeaderboardAPI() {
  try {
    const data = await getLeaderboard(50);
    return data.top_players.map(p => ({
      name: p.player_name,
      main: p.best_score - (p.bonus_score || 0), // Approximate
      bonus: p.bonus_score || 0,
      total: p.best_score,
      ts: new Date(p.played_at).getTime(),
    }));
  } catch (error) {
    console.error('Leaderboard failed:', error);
    // Fallback to localStorage
    const best = [];
    for (const [mssv, rec] of Object.entries(loadAll())) {
      let b = null;
      for (const p of rec.plays) {
        if (!b || p.total > b.total || (p.total === b.total && (p.main > b.main || (p.main === b.main && p.ts < b.ts)))) b = p;
      }
      if (b) best.push({ name: rec.name, main: b.main, bonus: b.bonus, total: b.total, ts: b.ts });
    }
    best.sort((a, b) => b.total - a.total || b.main - a.main || a.ts - b.ts);
    return best;
  }
}

// Override playsLeft để gọi API
async function playsLeftAPI(mssv) {
  if (!currentPlayerId) {
    // Fallback to localStorage
    return Math.max(0, CFG.maxPlays - getPlays(mssv).length);
  }

  try {
    return await getPlaysLeft(currentPlayerId);
  } catch (error) {
    console.error('PlaysLeft failed:', error);
    return Math.max(0, CFG.maxPlays - getPlays(mssv).length);
  }
}

// Override form submit handler
async function handleStartFormAPI(e) {
  e.preventDefault();
  const name = $('#inp-name').value.trim();
  const mssv = $('#inp-mssv').value.trim();

  if (!name) { shakeInput($('#inp-name')); return; }
  if (!mssv) { shakeInput($('#inp-mssv')); return; }

  // Disable button
  const btn = $('#btn-start');
  btn.disabled = true;
  btn.textContent = 'ĐANG KẾT NỐI...';

  try {
    // Register player
    const playerData = await registerPlayer(name, mssv);
    currentPlayerId = playerData.id;

    // Start game (truyền name và mssv, không phải player_id)
    const attemptData = await startGame(name, mssv);
    currentAttemptId = attemptData.attempt_id;
    currentSessionToken = attemptData.session_token;

    // Continue with game
    resetPlay(name, mssv);
    showScreen('howto');
  } catch (error) {
    console.error('Start failed:', error);
    alert('Không thể kết nối server. Vui lòng thử lại.');
    btn.disabled = false;
    btn.textContent = 'BẮT ĐẦU CHƠI';
  }
}

// Patch submitPlay in game.js
if (typeof submitPlay !== 'undefined') {
  window.submitPlayOriginal = submitPlay;
  window.submitPlay = submitPlayAPI;
}

// Patch getLeaderboard
if (typeof getLeaderboard !== 'undefined') {
  window.getLeaderboardOriginal = getLeaderboard;
  window.getLeaderboard = getLeaderboardAPI;
}

// Patch playsLeft
if (typeof playsLeft !== 'undefined') {
  window.playsLeftOriginal = playsLeft;
  window.playsLeft = playsLeftAPI;
}

// Override form submit handler - hook vào sau khi game.js load
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const form = document.querySelector('#start-form');
    if (!form) return;

    // Clone form để xóa event listeners cũ
    const newForm = form.cloneNode(true);
    form.parentNode.replaceChild(newForm, form);

    // Attach handler mới dùng API
    newForm.addEventListener('submit', handleStartFormAPI);

    // Re-attach input handler
    const mssvInput = document.querySelector('#inp-mssv');
    if (mssvInput && typeof refreshPlayLeft !== 'undefined') {
      mssvInput.addEventListener('input', refreshPlayLeft);
    }
  }, 100);
});

