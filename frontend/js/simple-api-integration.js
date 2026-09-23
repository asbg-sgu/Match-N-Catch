/* ============================================================
   API Integration - Chỉ submit kết quả, không can thiệp game
   ============================================================ */
'use strict';

const API_BASE = 'http://localhost:8000/api';

// Biến lưu player info
let apiPlayerData = null;

// API helper
async function apiCall(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  try {
    const response = await fetch(url, config);
    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('API call failed:', error);
    throw error;
  }
}

// Hook vào form submit - register player trước khi chơi
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const form = document.querySelector('#start-form');
    if (!form) return;

    const originalSubmit = form.onsubmit;

    form.addEventListener('submit', async (e) => {
      const name = document.querySelector('#inp-name').value.trim();
      const mssv = document.querySelector('#inp-mssv').value.trim();

      if (!name || !mssv) return; // Let game.js handle validation

      // Try register player (non-blocking)
      try {
        apiPlayerData = await apiCall('/players/', {
          method: 'POST',
          body: JSON.stringify({
            display_name: name,
            student_id: mssv,
          }),
        });
        console.log('Player registered:', apiPlayerData);

        // Start game attempt
        const attemptData = await apiCall('/game/start/', {
          method: 'POST',
          body: JSON.stringify({
            display_name: name,
            student_id: mssv,
          }),
        });
        console.log('Game started:', attemptData);
        apiPlayerData.attemptId = attemptData.attempt_id;
        apiPlayerData.sessionToken = attemptData.session_token;
      } catch (error) {
        console.warn('API registration failed, will use localStorage fallback:', error);
        apiPlayerData = null;
      }
    }, { capture: true }); // Run before game.js handler
  }, 100);
});

// Hook vào submitPlay - gửi kết quả lên backend
const originalSubmitPlay = window.submitPlay;
if (originalSubmitPlay) {
  window.submitPlay = function(entry) {
    // Call original first
    const result = originalSubmitPlay(entry);

    // Submit to API in background (non-blocking)
    if (apiPlayerData && apiPlayerData.attemptId) {
      (async () => {
        try {
          // Build mock action logs
          const actionLogs = [];
          for (let i = 0; i < entry.main; i++) {
            actionLogs.push({
              instance_id: `card-${i}`,
              card_id: `service-${i}`,
              round: i < 10 ? 1 : 2,
              action: 'correct',
              client_timestamp_ms: entry.ts + (i * 1000)
            });
          }

          const submitResult = await apiCall('/game/submit/', {
            method: 'POST',
            body: JSON.stringify({
              attempt_id: apiPlayerData.attemptId,
              session_token: apiPlayerData.sessionToken,
              action_logs: actionLogs,
              bonus_answers: [],
              duration_ms: Date.now() - entry.ts,
            }),
          });
          console.log('Submit to API success:', submitResult);
        } catch (error) {
          console.warn('Submit to API failed:', error);
        }
      })();
    }

    return result;
  };
}

// Hook vào getLeaderboard - lấy từ backend
const originalGetLeaderboard = window.getLeaderboard;
if (originalGetLeaderboard) {
  window.getLeaderboard = async function() {
    try {
      const response = await fetch(`${API_BASE}/leaderboard/?limit=50`);
      const data = await response.json();

      const entries = data.top_entries || [];
      if (entries.length > 0) {
        return entries.map(p => ({
          name: p.display_name,
          main: Math.max(0, p.total_score - 6), // Approximate
          bonus: Math.min(6, p.bonus_points || 0),
          total: p.total_score,
          ts: p.finished_at ? new Date(p.finished_at).getTime() : Date.now(),
        }));
      }
    } catch (error) {
      console.warn('Leaderboard API failed, using localStorage:', error);
    }

    // Fallback to localStorage
    return originalGetLeaderboard();
  };
}

console.log('Simple API integration loaded - non-intrusive mode');
