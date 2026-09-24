/* ============================================================
   BẮT MÂY — Backend API Connector
   Module kết nối với Django REST API backend.
   Xử lý authentication, retry logic, và error handling.
   ============================================================ */
'use strict';

// Cấu hình API endpoint (sửa URL này khi deploy production)
const API_CONFIG = {
  baseURL: window.API_BASE_URL || 'http://localhost:8000',
  timeout: 15000,
  retryAttempts: 2,
  retryDelay: 1000,
};

// Lưu trữ session token trong memory và localStorage
let sessionToken = null;
let currentAttemptId = null;

// Helper: HTTP request với retry logic
async function apiRequest(endpoint, options = {}) {
  const url = API_CONFIG.baseURL + endpoint;
  const defaultHeaders = {
    'Content-Type': 'application/json',
  };

  if (sessionToken) {
    defaultHeaders['Authorization'] = `Bearer ${sessionToken}`;
  }

  const config = {
    method: options.method || 'GET',
    headers: { ...defaultHeaders, ...options.headers },
    signal: AbortSignal.timeout(API_CONFIG.timeout),
  };

  if (options.body) {
    config.body = JSON.stringify(options.body);
  }

  let lastError = null;
  for (let attempt = 0; attempt <= API_CONFIG.retryAttempts; attempt++) {
    try {
      const response = await fetch(url, config);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new APIError(
          errorData.detail || `HTTP ${response.status}`,
          response.status,
          errorData
        );
      }

      return await response.json();
    } catch (error) {
      lastError = error;

      if (error.name === 'AbortError' || error.name === 'TimeoutError') {
        console.warn(`[API] Timeout ${endpoint} (attempt ${attempt + 1})`);
      } else if (error instanceof APIError && error.status >= 400 && error.status < 500) {
        throw error; // Client errors không retry
      } else {
        console.warn(`[API] Request failed ${endpoint} (attempt ${attempt + 1}):`, error.message);
      }

      if (attempt < API_CONFIG.retryAttempts) {
        await sleep(API_CONFIG.retryDelay * (attempt + 1));
      }
    }
  }

  throw lastError;
}

class APIError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.data = data;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// API Methods

/**
 * Đăng ký hoặc lấy thông tin người chơi
 * @param {string} studentId - MSSV
 * @param {string} displayName - Tên hiển thị
 * @returns {Promise<{id, student_id, display_name, attempts_count, can_play}>}
 */
async function registerPlayer(studentId, displayName) {
  const data = await apiRequest('/api/players/', {
    method: 'POST',
    body: {
      student_id: studentId,
      display_name: displayName,
    },
  });
  return data;
}

/**
 * Bắt đầu lượt chơi mới
 * @param {string} studentId - MSSV
 * @param {string} displayName - Tên hiển thị
 * @returns {Promise<{attempt_id, session_token, round_1_cards, round_2_cards, bonus_questions, attempts_left}>}
 */
async function startGame(studentId, displayName) {
  const data = await apiRequest('/api/game/start/', {
    method: 'POST',
    body: {
      student_id: studentId,
      display_name: displayName,
    },
  });

  // Lưu session token và attempt_id
  sessionToken = data.session_token;
  currentAttemptId = data.attempt_id;

  // Backup vào localStorage để phục hồi nếu reload trang
  try {
    localStorage.setItem('batmay_session_v1', JSON.stringify({
      token: sessionToken,
      attemptId: currentAttemptId,
      timestamp: Date.now(),
    }));
  } catch (e) {
    console.warn('[API] Không lưu được session vào localStorage:', e);
  }

  return data;
}

/**
 * Submit kết quả game
 * @param {string} attemptId - ID lượt chơi
 * @param {Array} actionLogs - Danh sách hành động [{instance_id, card_id, round, action, client_timestamp_ms}]
 * @param {Array} bonusAnswers - Câu trả lời bonus [{question_id, selected_indices}]
 * @param {number} durationMs - Thời gian chơi (ms)
 * @returns {Promise<{attempt_id, status, main_score, bonus_points, total_score, correct, wrong, missed_target, hearts_left, is_eligible_reward}>}
 */
async function submitGame(attemptId, actionLogs, bonusAnswers = [], durationMs = 0) {
  const data = await apiRequest('/api/game/submit/', {
    method: 'POST',
    body: {
      attempt_id: attemptId,
      session_token: sessionToken,
      action_logs: actionLogs,
      bonus_answers: bonusAnswers,
      duration_ms: durationMs,
    },
  });

  // Clear session sau khi submit thành công
  clearSession();

  return data;
}

/**
 * Lấy bảng xếp hạng
 * @param {number} limit - Số lượng top players (mặc định 10)
 * @returns {Promise<{event_name, total_participants, top_entries}>}
 */
async function getLeaderboard(limit = 10) {
  const data = await apiRequest(`/api/leaderboard/?limit=${limit}`);
  return data;
}

/**
 * Lấy chi tiết lượt chơi
 * @param {string} attemptId - ID lượt chơi
 * @returns {Promise<{attempt_id, status, main_score, bonus_points, total_score, ...}>}
 */
async function getAttemptDetails(attemptId) {
  const data = await apiRequest(`/api/game/attempts/${attemptId}/`);
  return data;
}

/**
 * Lấy thông tin phần thưởng của người chơi
 * @returns {Promise<{student_id, display_name, best_score, reward_threshold, rewards}>}
 */
async function getMyRewards() {
  if (!sessionToken) {
    throw new Error('Chưa có session token');
  }
  const data = await apiRequest('/api/rewards/me/');
  return data;
}

/**
 * Health check
 * @returns {Promise<{status}>}
 */
async function healthCheck() {
  const data = await apiRequest('/health/');
  return data;
}

/**
 * Clear session token
 */
function clearSession() {
  sessionToken = null;
  currentAttemptId = null;
  try {
    localStorage.removeItem('batmay_session_v1');
  } catch (e) {}
}

/**
 * Khôi phục session từ localStorage (dùng khi reload trang giữa chừng)
 * @returns {{token: string, attemptId: string} | null}
 */
function restoreSession() {
  try {
    const stored = localStorage.getItem('batmay_session_v1');
    if (!stored) return null;

    const data = JSON.parse(stored);
    const age = Date.now() - (data.timestamp || 0);

    // Session hết hạn sau 30 phút
    if (age > 30 * 60 * 1000) {
      clearSession();
      return null;
    }

    sessionToken = data.token;
    currentAttemptId = data.attemptId;
    return { token: sessionToken, attemptId: currentAttemptId };
  } catch (e) {
    return null;
  }
}

// Kiểm tra backend có online không
async function checkBackendHealth() {
  try {
    await healthCheck();
    return true;
  } catch (e) {
    console.warn('[API] Backend không khả dụng:', e.message);
    return false;
  }
}

// Export API
window.BackendAPI = {
  registerPlayer,
  startGame,
  submitGame,
  getLeaderboard,
  getAttemptDetails,
  getMyRewards,
  healthCheck,
  clearSession,
  restoreSession,
  checkBackendHealth,
  APIError,

  // Getters
  getSessionToken: () => sessionToken,
  getCurrentAttemptId: () => currentAttemptId,
  getConfig: () => ({ ...API_CONFIG }),
};
