/* ============================================================
   Game-API Connector - CHỈ GỌI API KHI GAME KẾT THÚC
   ============================================================ */
'use strict';

const GameAPIConnector = {
  enabled: true,

  init() {
    if (!this.enabled) {
      console.log('⚠ API disabled');
      return;
    }

    console.log('🔌 API Connector: Submit on game end only');
    this.hookGameEnd();
  },

  hookGameEnd() {
    const originalSubmitPlay = window.submitPlay;

    if (!originalSubmitPlay) {
      console.warn('⚠ submitPlay not found');
      return;
    }

    window.submitPlay = (entry) => {
      // 1. Gọi original trước (render UI ngay)
      const result = originalSubmitPlay.call(window, entry);

      // 2. Submit backend (background, không block)
      this.submitToBackend(entry);

      return result;
    };

    console.log('✓ Ready - will call API when game ends');
  },

  async submitToBackend(entry) {
    console.log('📤 Game ended, submitting to backend...', entry);

    try {
      // 1. Register player (backend tự handle duplicate)
      await BackendAPI.registerPlayer(entry.name, entry.mssv);
      console.log('✓ Player ready');

      // 2. Start NEW game attempt (mỗi lần chơi là 1 attempt mới)
      await BackendAPI.startGame(entry.name, entry.mssv);
      console.log('✓ New game attempt created');

      // 3. Submit score
      const result = await BackendAPI.submitGame(entry.main, entry.bonus, entry.total);
      console.log('✓ Score submitted:', result.total_score);

      // 4. Refresh leaderboard
      if (typeof renderLeaderboard === 'function') {
        setTimeout(() => {
          renderLeaderboard();
          console.log('✓ Leaderboard refreshed');
        }, 1000);
      }

    } catch (error) {
      console.error('✗ API failed:', error.message);
      console.log('ℹ Game saved to localStorage only');
    }
  },
};

if (window.BackendAPI) {
  GameAPIConnector.init();
} else {
  console.error('✗ Load backend-api.js first!');
}
