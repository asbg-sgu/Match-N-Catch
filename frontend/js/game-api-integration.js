/* ============================================================
   Tích hợp API Backend - Override localStorage functions
   ============================================================ */
'use strict';

// Store player_id, attempt_id và session_token
let currentPlayerId = null;
let currentAttemptId = null;
let currentSessionToken = null;

// Override submitPlay để gọi API (non-blocking)
function submitPlayAPI(entry) {
  // Chạy async trong background, không block UI
  (async () => {
    if (!currentAttemptId || !currentSessionToken) {
      console.error('No attempt ID or session token');
      // Fallback to localStorage
      const d = loadAll();
      const rec = d[entry.mssv] || { name: entry.name, plays: [] };
      rec.name = entry.name;
      rec.plays.push({ ts: entry.ts, main: entry.main, bonus: entry.bonus, total: entry.total, bonusCount: entry.bonusCount });
      d[entry.mssv] = rec;
      saveAll(d);
      return;
    }

    // Build mock action_logs from score (temporary - need real tracking)
    const actionLogs = [];
    const correctCount = entry.main; // Approximate
    const wrongCount = 20 - correctCount;

    // Mock correct actions
    for (let i = 0; i < correctCount; i++) {
      actionLogs.push({
        instance_id: `card-${i}`,
        card_id: `aws-service-${i}`,
        round: i < 10 ? 1 : 2,
        action: 'correct',
        client_timestamp_ms: entry.ts + (i * 1000)
      });
    }

    // Mock wrong actions
    for (let i = 0; i < wrongCount; i++) {
      actionLogs.push({
        instance_id: `card-wrong-${i}`,
        card_id: `fake-service-${i}`,
        round: i < 10 ? 1 : 2,
        action: 'wrong',
        client_timestamp_ms: entry.ts + ((correctCount + i) * 1000)
      });
    }

    const bonusAnswers = [];
    const durationMs = Date.now() - entry.ts;

    try {
      const result = await submitGame(currentAttemptId, currentSessionToken, actionLogs, bonusAnswers, durationMs);
      console.log('Submit success:', result);
    } catch (error) {
      console.error('Submit failed:', error);
      // Fallback to localStorage
      const d = loadAll();
      const rec = d[entry.mssv] || { name: entry.name, plays: [] };
      rec.name = entry.name;
      rec.plays.push({ ts: entry.ts, main: entry.main, bonus: entry.bonus, total: entry.total, bonusCount: entry.bonusCount });
      d[entry.mssv] = rec;
      saveAll(d);
    }
  })();

  // Return sync để không block game.js
  return true;
}

// Override getLeaderboard để gọi API
async function getLeaderboardAPI() {
  try {
    // Gọi API trực tiếp, không qua getLeaderboard() để tránh loop
    const response = await fetch('http://localhost:8000/api/leaderboard/?limit=50', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }

    const data = await response.json();

    // Backend trả về top_entries, không phải top_players
    const entries = data.top_entries || data.top_players || [];

    if (!entries || entries.length === 0) {
      console.warn('No leaderboard entries, using localStorage fallback');
      throw new Error('Empty leaderboard response');
    }

    return entries.map(p => ({
      name: p.display_name || p.player_name,
      main: p.total_score - (p.bonus_points || 0), // Approximate
      bonus: p.bonus_points || 0,
      total: p.total_score,
      ts: p.finished_at ? new Date(p.finished_at).getTime() : Date.now(),
    }));
  } catch (error) {
    console.error('Leaderboard failed:', error);
    // Fallback to localStorage - gọi function gốc
    if (window.getLeaderboardOriginal) {
      return window.getLeaderboardOriginal();
    }
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

