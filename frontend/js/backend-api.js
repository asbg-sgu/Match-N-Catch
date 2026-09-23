/* ============================================================
   Backend API Wrapper - Độc lập, không can thiệp game
   ============================================================ */
'use strict';

const BackendAPI = {
  baseURL: 'http://localhost:8000/api',

  // Current session data
  session: {
    playerId: null,
    attemptId: null,
    sessionToken: null,
    playerName: null,
    studentId: null,
  },

  // Helper function
  async call(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    const response = await fetch(url, config);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  },

  // Register player
  async registerPlayer(name, studentId) {
    const data = await this.call('/players/', {
      method: 'POST',
      body: JSON.stringify({
        display_name: name,
        student_id: studentId,
      }),
    });

    this.session.playerId = data.id;
    this.session.playerName = name;
    this.session.studentId = studentId;

    return data;
  },

  // Start game attempt
  async startGame(name, studentId) {
    const data = await this.call('/game/start/', {
      method: 'POST',
      body: JSON.stringify({
        display_name: name,
        student_id: studentId,
      }),
    });

    this.session.attemptId = data.attempt_id;
    this.session.sessionToken = data.session_token;

    return data;
  },

  // Submit game result
  async submitGame(mainScore, bonusScore, totalScore) {
    if (!this.session.attemptId || !this.session.sessionToken) {
      throw new Error('No active game session');
    }

    // Build action logs from scores
    const actionLogs = [];
    for (let i = 0; i < mainScore; i++) {
      actionLogs.push({
        instance_id: `card-correct-${i}`,
        card_id: `service-${i}`,
        round: i < 10 ? 1 : 2,
        action: 'correct',
        client_timestamp_ms: Date.now() - (20 - i) * 1000,
      });
    }

    const data = await this.call('/game/submit/', {
      method: 'POST',
      body: JSON.stringify({
        attempt_id: this.session.attemptId,
        session_token: this.session.sessionToken,
        action_logs: actionLogs,
        bonus_answers: [],
        duration_ms: 60000,
      }),
    });

    return data;
  },

  // Get leaderboard
  async getLeaderboard(limit = 50) {
    const data = await this.call(`/leaderboard/?limit=${limit}`, {
      method: 'GET',
    });

    return data;
  },

  // Reset session
  reset() {
    this.session = {
      playerId: null,
      attemptId: null,
      sessionToken: null,
      playerName: null,
      studentId: null,
    };
  },
};

window.BackendAPI = BackendAPI;
console.log('✓ Backend API wrapper ready');
