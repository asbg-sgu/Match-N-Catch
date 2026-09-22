-- ============================================================
-- Match & Catch — Seed Data
-- Chạy sau schema.sql
-- ============================================================

-- Tạo sự kiện mặc định cho CLB
-- UUID cố định để dễ tham chiếu trong .env (EVENT_ID)
INSERT INTO event (id, name, status, reward_threshold, created_at)
VALUES (
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    'Match & Catch — CLB AWS 2026',
    'active',
    12,
    NOW()
);
