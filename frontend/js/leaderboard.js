/* ============================================================
   BẮT MÂY — Leaderboard page (leaderboard.html)
   Tự động fetch /api/leaderboard/ mỗi 30 giây.
   Fallback: dùng localStorage khi offline (giống api.js).
   ============================================================ */
'use strict';

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const rand = (a, b) => a + Math.random() * (b - a);

/* ---------- config ---------- */
const REFRESH_INTERVAL = 30_000;   // auto-refresh mỗi 30s
const DEFAULT_LIMIT    = 50;        // lấy tối đa 50 người

/* ---------- state ---------- */
let _entries    = [];      // mảng entry đã render
let _timer      = null;    // interval auto-refresh
let _loading    = false;

/* ---------- ambient particles (giống game) ---------- */
function initAmbient() {
  const holder = $('#bg-particles');
  if (!holder) return;
  for (let i = 0; i < 14; i++) {
    const p = document.createElement('span');
    p.className = 'p';
    const s = rand(1.5, 3.2);
    p.style.cssText = `left:${rand(2,98)}%;top:${rand(4,96)}%;width:${s}px;height:${s}px;--tw:${rand(3,7).toFixed(1)}s;--twd:${rand(0,5).toFixed(1)}s`;
    holder.appendChild(p);
  }
}

/* ---------- format helpers ---------- */
function fmtDuration(ms) {
  if (!ms) return '';
  const s = Math.round(ms / 1000);
  if (s < 60) return s + 's';
  return Math.floor(s / 60) + 'm' + (s % 60).toString().padStart(2, '0') + 's';
}

function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d)) return '';
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60_000)   return 'vừa xong';
  if (diff < 3600_000) return Math.floor(diff / 60_000) + ' phút trước';
  return fmtTime(ts);
}

/* ---------- status bar ---------- */
function setStatus(type, text) {
  const bar  = $('#lb-status');
  const dot  = $('#lb-status-dot');
  const span = $('#lb-status-text');
  bar.hidden = false;
  bar.className = 'lb-status lb-status--' + type;
  dot.className  = 'lb-dot lb-dot--' + type;
  span.textContent = text;
}

/* ---------- render podium ---------- */
function renderPodium(entries) {
  const pod = $('#lb-podium');
  pod.innerHTML = '';
  // layout: silver (2nd) | gold (1st) | bronze (3rd)
  const order  = [entries[1], entries[0], entries[2]];
  const medals = ['🥈', '🥇', '🥉'];
  const labels = ['Hạng 2', 'Hạng 1', 'Hạng 3'];
  const maxTotal = entries.length ? entries[0].total : 1;

  order.forEach((e, col) => {
    const div = document.createElement('div');
    div.className = 'pod' + (col === 1 ? ' pod--gold' : '');
    if (e) {
      const pct = Math.round(e.total / maxTotal * 100);
      div.innerHTML =
        `<div class="pod-rank" aria-label="${labels[col]}">${medals[col]}</div>` +
        `<div class="pod-body">` +
          `<span class="pod-name" title="${e.name}">${e.name}</span>` +
          `<span class="pod-score">${e.total}</span>` +
          `<span class="pod-base"><i class="pod-bar" style="width:${pct}%"></i></span>` +
          `<span class="pod-sub">${e.main}+${e.bonus}</span>` +
        `</div>` +
        `<div class="pod-mid"></div>`;
    } else {
      div.innerHTML =
        `<div class="pod-rank" aria-label="${labels[col]}">${medals[col]}</div>` +
        `<div class="pod-body">` +
          `<span class="pod-name">—</span>` +
          `<span class="pod-score">—</span>` +
          `<span class="pod-base"><i class="pod-bar" style="width:0%"></i></span>` +
          `<span class="pod-sub">&nbsp;</span>` +
        `</div>` +
        `<div class="pod-mid"></div>`;
    }
    pod.appendChild(div);
  });
}

/* ---------- render list ---------- */
function renderList(entries) {
  const list = $('#lb-list');
  list.innerHTML = '';

  entries.forEach((e, idx) => {
    const rank = idx + 1;
    const li = document.createElement('li');

    // Medal cho top 3
    let rankHtml;
    if      (rank === 1) rankHtml = '<span class="rk rk--gold">🥇</span>';
    else if (rank === 2) rankHtml = '<span class="rk rk--silver">🥈</span>';
    else if (rank === 3) rankHtml = '<span class="rk rk--bronze">🥉</span>';
    else                 rankHtml = '<span class="rk">' + rank + '</span>';

    // Hearts còn lại
    const hearts = e.hearts_left != null
      ? '<span class="lb-hearts">' + '❤️'.repeat(e.hearts_left) + '🖤'.repeat(Math.max(0, 3 - e.hearts_left)) + '</span>'
      : '';

    // Duration
    const dur = e.duration_ms ? '<span class="lb-dur">' + fmtDuration(e.duration_ms) + '</span>' : '';

    li.innerHTML =
      rankHtml +
      `<span class="nm">${e.name}<small>Chính <b>${e.main}</b> · Bonus <b>${e.bonus}</b>${hearts ? ' · ' + hearts : ''}</small></span>` +
      `<span class="sc">${e.total}</span>` +
      `<span class="mm">${dur}</span>`;

    list.appendChild(li);
  });
}

/* ---------- render stats bar ---------- */
function renderStats(data) {
  const participants = data.total_participants ?? _entries.length;
  const top = _entries.length ? _entries[0].total : '—';
  const eventName = data.event_name || 'AWS × GCP';
  // Rút gọn tên event nếu quá dài
  const shortEvent = eventName.length > 20 ? 'AWS × GCP' : eventName;

  $('#stat-participants').textContent = participants;
  $('#stat-top').textContent = top;
  $('#stat-event').textContent = shortEvent;
}

/* ---------- cập nhật timestamp ===  */
function updateTimestamp() {
  const el = $('#lb-updated');
  if (!el) return;
  el.textContent = 'Cập nhật lúc ' + new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/* ---------- main render ---------- */
function render(entries, rawData = {}) {
  _entries = entries;

  const content = $('#lb-content');
  const empty   = $('#lb-empty');
  const loading = $('#lb-loading');

  loading.hidden = true;

  if (!entries || entries.length === 0) {
    content.hidden = true;
    empty.hidden   = false;
    renderStats({ total_participants: 0, ...rawData });
    updateTimestamp();
    return;
  }

  empty.hidden   = true;
  content.hidden = false;

  renderPodium(entries);
  renderList(entries);
  renderStats({ total_participants: entries.length, ...rawData });
  updateTimestamp();
}

/* ---------- refresh icon animation ---------- */
function startRefreshAnim() {
  $('#refresh-icon').classList.add('spinning');
}
function stopRefreshAnim() {
  $('#refresh-icon').classList.remove('spinning');
}

/* ---------- load data ---------- */
async function loadLeaderboard(isManual = false) {
  if (_loading) return;
  _loading = true;

  if (isManual) {
    startRefreshAnim();
  } else if (_entries.length === 0) {
    // First load — hiện spinner
    $('#lb-loading').hidden = false;
    $('#lb-content').hidden = true;
    $('#lb-empty').hidden   = true;
  }

  try {
    // Kiểm tra online trước
    await window.GameAPI.health();
    const online = window.GameAPI.isOnline();

    if (online) {
      // Gọi trực tiếp API để lấy raw data (bao gồm total_participants, event_name)
      const baseURL = window.GameAPI.baseURL();
      const res = await fetch(baseURL + '/api/leaderboard/?limit=' + DEFAULT_LIMIT, {
        signal: timeoutSignal(10_000),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();

      const entries = (data.top_entries || []).map((e, i) => ({
        rank:        e.rank || (i + 1),
        name:        e.display_name,
        main:        e.main_score,
        bonus:       e.bonus_points,
        total:       e.total_score,
        hearts_left: e.hearts_left,
        duration_ms: e.duration_ms,
        ts:          e.finished_at ? Date.parse(e.finished_at) : 0,
      }));

      render(entries, data);
      setStatus('online', 'Trực tuyến');
    } else {
      // Offline fallback
      const entries = await window.GameAPI.leaderboard(DEFAULT_LIMIT);
      render(entries, {});
      setStatus('offline', 'Ngoại tuyến');
    }
  } catch (e) {
    console.warn('[Leaderboard] Lỗi tải:', e.message);
    // Fallback về localStorage nếu mọi thứ lỗi
    try {
      const entries = await window.GameAPI.leaderboard(DEFAULT_LIMIT);
      render(entries, {});
    } catch (_) {
      render([], {});
    }
    setStatus('error', 'Không thể kết nối server · thử lại sau');
  } finally {
    _loading = false;
    stopRefreshAnim();
  }
}

/* ---------- auto-refresh ---------- */
function startAutoRefresh() {
  if (_timer) clearInterval(_timer);
  _timer = setInterval(() => loadLeaderboard(false), REFRESH_INTERVAL);
}

/* ---------- page visibility: tạm dừng khi ẩn, refresh khi hiện lại ---------- */
function initVisibility() {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearInterval(_timer);
      _timer = null;
    } else {
      loadLeaderboard(false);
      startAutoRefresh();
    }
  });
}

/* ---------- button refresh ---------- */
function initRefreshBtn() {
  $('#btn-refresh').addEventListener('click', () => loadLeaderboard(true));
}

/* ---------- countdown bar (hiện 30s đếm ngược đến lần refresh kế) ---------- */
function initCountdown() {
  const bar = document.createElement('div');
  bar.className = 'lb-countdown';
  bar.id = 'lb-countdown';
  // Chèn vào sau stats
  const stats = $('#lb-stats');
  if (stats) stats.after(bar);

  // Reset animation mỗi lần refresh
  const resetCountdown = () => {
    bar.style.animation = 'none';
    // Force reflow
    void bar.offsetWidth;
    bar.style.animation = '';
  };

  // Khi bấm refresh hoặc auto-refresh thì reset
  $('#btn-refresh').addEventListener('click', resetCountdown);
  setInterval(resetCountdown, REFRESH_INTERVAL);
}

/* ---------- tra cứu MSSV ---------- */
function lookupMSSV(mssv) {
  const input = mssv.trim().toUpperCase();
  const result = $('#lb-search-result');

  if (!input) {
    result.hidden = true;
    return;
  }

  // Tìm trong _entries đã load (so sánh không phân biệt hoa thường)
  // _entries không có student_id (BE không trả), nên tra theo tên nếu offline,
  // hoặc gọi /api/players/ để lấy thông tin, rồi match với rank trong _entries.
  // Chiến lược: tìm entry có rank từ server bằng cách gọi /api/players/ (nếu online).
  lookupFromServer(input, result);
}

async function lookupFromServer(mssv, resultEl) {
  resultEl.hidden = false;
  resultEl.className = 'lb-search-result';
  resultEl.innerHTML = '<span style="color:var(--text-low);font-size:13px">Đang tra cứu…</span>';

  try {
    const baseURL = window.GameAPI.baseURL();
    const online  = window.GameAPI.isOnline();

    if (!online) {
      // Offline: tra localStorage
      lookupFromLocal(mssv, resultEl);
      return;
    }

    // Dùng POST /api/players/ để lấy thông tin người chơi (không lộ MSSV ra ngoài)
    const res = await fetch(baseURL + '/api/players/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: mssv, display_name: '' }),
      signal: timeoutSignal(8_000),
    });

    if (res.status === 404) {
      showNotFound(resultEl, mssv);
      return;
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);

    const player = await res.json();

    // Nếu chưa có lượt nào
    if (!player.attempts_count || player.attempts_count === 0) {
      showNotFound(resultEl, mssv);
      return;
    }

    // Tìm rank trong _entries theo tên hiển thị (khớp tên chính xác)
    // Vì BE không trả MSSV trong BXH nên match theo display_name
    const displayName = player.display_name || '';
    const idx = _entries.findIndex(
      (e) => e.name.trim().toLowerCase() === displayName.trim().toLowerCase()
    );

    if (idx >= 0) {
      const e = _entries[idx];
      showFound(resultEl, {
        name:    displayName,
        rank:    idx + 1,
        total:   e.total,
        main:    e.main,
        bonus:   e.bonus,
        hearts:  e.hearts_left,
        dur:     e.duration_ms,
        plays:   player.attempts_count,
      });
    } else {
      // Người này có chơi nhưng không trong top hiện tại (> limit)
      showFoundNoRank(resultEl, {
        name:  displayName,
        plays: player.attempts_count,
      });
    }
  } catch (e) {
    console.warn('[Leaderboard] Tra cứu lỗi:', e.message);
    lookupFromLocal(mssv, resultEl);
  }
}

function lookupFromLocal(mssv, resultEl) {
  // Tìm trong localStorage (fallback offline)
  try {
    const all = JSON.parse(localStorage.getItem('batmay_plays_v1')) || {};
    const rec = all[mssv.toUpperCase()] || all[mssv];
    if (!rec || !rec.plays || rec.plays.length === 0) {
      showNotFound(resultEl, mssv);
      return;
    }
    // Lấy lượt tốt nhất
    const best = rec.plays.reduce((a, b) => (b.total > a.total ? b : a));
    const idx = _entries.findIndex(
      (e) => e.name.trim().toLowerCase() === rec.name.trim().toLowerCase()
    );
    showFound(resultEl, {
      name:  rec.name,
      rank:  idx >= 0 ? idx + 1 : null,
      total: best.total,
      main:  best.main,
      bonus: best.bonus,
      plays: rec.plays.length,
    });
  } catch {
    showNotFound(resultEl, mssv);
  }
}

function showFound(el, info) {
  el.className = 'lb-search-result found';
  const rankBadge = info.rank
    ? `<div class="lb-sr-rank">#${info.rank} <span>/ ${_entries.length}</span></div>`
    : `<div class="lb-sr-rank" style="font-size:16px;color:var(--text-mid)">Ngoài top</div>`;
  const hearts = info.hearts != null
    ? ' · ' + '❤️'.repeat(info.hearts) + '🖤'.repeat(Math.max(0, 3 - info.hearts))
    : '';
  const dur = info.dur ? ' · ' + fmtDuration(info.dur) : '';
  el.innerHTML =
    `<div class="lb-sr-name">${info.name}</div>` +
    rankBadge +
    `<div class="lb-sr-row">` +
      `<span class="lb-sr-score">${info.total} điểm</span>` +
      `<span class="lb-sr-detail">Chính ${info.main} · Bonus ${info.bonus}${hearts}${dur}</span>` +
    `</div>` +
    `<div style="margin-top:6px;font-size:11px;color:var(--text-low)">${info.plays} lượt đã chơi</div>`;
}

function showFoundNoRank(el, info) {
  el.className = 'lb-search-result found';
  el.innerHTML =
    `<div class="lb-sr-name">${info.name}</div>` +
    `<div style="font-size:13px;color:var(--text-mid);margin:4px 0">Đã tham gia · chưa nằm trong top ${DEFAULT_LIMIT} hiện tại</div>` +
    `<div style="margin-top:4px;font-size:11px;color:var(--text-low)">${info.plays} lượt đã chơi</div>`;
}

function showNotFound(el, mssv) {
  el.className = 'lb-search-result not-found';
  el.innerHTML = `<p>Không tìm thấy mã sinh viên <b>${mssv}</b>.</p><p style="font-size:12px;margin-top:4px">Kiểm tra lại MSSV hoặc chưa có lượt chơi nào.</p>`;
}

function initSearch() {
  const form  = $('#lb-search-form');
  const input = $('#lb-search-input');
  const result = $('#lb-search-result');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    lookupMSSV(input.value);
  });

  // Xoá kết quả khi input trống
  input.addEventListener('input', () => {
    if (!input.value.trim()) result.hidden = true;
  });
}

/* ---------- init ---------- */
function init() {
  initAmbient();
  initRefreshBtn();
  initCountdown();
  initVisibility();
  initSearch();
  loadLeaderboard(false);
  startAutoRefresh();
}

document.addEventListener('DOMContentLoaded', init);
