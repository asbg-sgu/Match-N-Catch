/* ============================================================
   API Client - Kết nối Django Backend
   ============================================================ */
'use strict';

const API_BASE = 'http://localhost:8000/api';

// Helper function để gọi API
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

// Đăng ký hoặc lấy thông tin player
async function registerPlayer(name, studentId) {
  return apiCall('/players/', {
    method: 'POST',
    body: JSON.stringify({
      display_name: name,
      student_id: studentId,
    }),
  });
}

// Bắt đầu game mới
async function startGame(displayName, studentId) {
  return apiCall('/game/start/', {
    method: 'POST',
    body: JSON.stringify({
      display_name: displayName,
      student_id: studentId,
    }),
  });
}

// Gửi kết quả game
async function submitGame(attemptId, sessionToken, actionLogs, bonusAnswers, durationMs) {
  return apiCall('/game/submit/', {
    method: 'POST',
    body: JSON.stringify({
      attempt_id: attemptId,
      session_token: sessionToken,
      action_logs: actionLogs,
      bonus_answers: bonusAnswers || [],
      duration_ms: durationMs || 0,
    }),
  });
}

// Lấy leaderboard
async function getLeaderboard(limit = 50) {
  return apiCall(`/leaderboard/?limit=${limit}`, {
    method: 'GET',
  });
}

// Lấy số lượt chơi còn lại
async function getPlaysLeft(playerId) {
  // Tính toán dựa trên rewards API
  try {
    const data = await apiCall(`/rewards/me/?player_id=${playerId}`, {
      method: 'GET',
    });
    return Math.max(0, 3 - data.plays_today);
  } catch (error) {
    return 3; // Default
  }
}
