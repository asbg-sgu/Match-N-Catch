-- ============================================================
-- Match & Catch — MySQL Schema
-- Tương thích: MySQL 8.0+
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS reward_claim;
DROP TABLE IF EXISTS game_attempt;
DROP TABLE IF EXISTS player;
DROP TABLE IF EXISTS event;
SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- 1. EVENT
-- ============================================================
CREATE TABLE event (
    id               CHAR(36)        NOT NULL DEFAULT (UUID()),
    name             VARCHAR(255)    NOT NULL,
    status           ENUM('active', 'closed') NOT NULL DEFAULT 'active',
    reward_threshold INT             NOT NULL DEFAULT 12,
    created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at        DATETIME        NULL,

    PRIMARY KEY (id),
    INDEX idx_event_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 2. PLAYER
-- ============================================================
CREATE TABLE player (
    id           CHAR(36)     NOT NULL DEFAULT (UUID()),
    event_id     CHAR(36)     NOT NULL,
    student_id   VARCHAR(20)  NOT NULL,   -- MSSV
    display_name VARCHAR(100) NOT NULL,
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    -- Một MSSV chỉ đăng ký một lần trong một sự kiện
    UNIQUE KEY uq_player_event_student (event_id, student_id),
    INDEX idx_player_student (student_id),

    CONSTRAINT fk_player_event
        FOREIGN KEY (event_id) REFERENCES event (id)
        ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 3. GAME_ATTEMPT
-- ============================================================
CREATE TABLE game_attempt (
    id                   CHAR(36)    NOT NULL DEFAULT (UUID()),
    event_id             CHAR(36)    NOT NULL,
    player_id            CHAR(36)    NOT NULL,

    -- Trạng thái lượt chơi
    status               ENUM('created', 'in_progress', 'submitted', 'abandoned')
                                     NOT NULL DEFAULT 'created',
    session_token        VARCHAR(255) NOT NULL,

    -- Điểm số
    main_score           TINYINT UNSIGNED NOT NULL DEFAULT 0,   -- 0-20
    bonus_points         TINYINT UNSIGNED NOT NULL DEFAULT 0,   -- 0, 3, hoặc 6
    total_score          TINYINT UNSIGNED NOT NULL DEFAULT 0,   -- 0-26

    -- Thống kê thao tác
    correct              TINYINT UNSIGNED NOT NULL DEFAULT 0,
    wrong                TINYINT UNSIGNED NOT NULL DEFAULT 0,
    missed_target        TINYINT UNSIGNED NOT NULL DEFAULT 0,
    hearts_left          TINYINT UNSIGNED NOT NULL DEFAULT 3,   -- max(0, 3 - wrong)

    -- Thời gian chơi (ms) — dùng để tie-break xếp hạng
    duration_ms          INT UNSIGNED     NULL,

    -- Bonus tracking
    bonus_question_1_id  VARCHAR(50)  NULL,
    bonus_question_2_id  VARCHAR(50)  NULL,
    bonus_1_triggered    TINYINT(1)   NOT NULL DEFAULT 0,
    bonus_2_triggered    TINYINT(1)   NOT NULL DEFAULT 0,
    bonus_1_correct      TINYINT(1)   NOT NULL DEFAULT 0,
    bonus_2_correct      TINYINT(1)   NOT NULL DEFAULT 0,

    -- Thời điểm
    started_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at          DATETIME     NULL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_attempt_session_token (session_token),
    INDEX idx_attempt_player  (player_id),
    INDEX idx_attempt_event   (event_id),
    INDEX idx_attempt_status  (status),
    -- Index phục vụ leaderboard query
    INDEX idx_leaderboard (event_id, status, total_score, hearts_left, duration_ms, finished_at),

    CONSTRAINT fk_attempt_event
        FOREIGN KEY (event_id) REFERENCES event (id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_attempt_player
        FOREIGN KEY (player_id) REFERENCES player (id)
        ON DELETE RESTRICT ON UPDATE CASCADE,

    -- Điểm không âm
    CONSTRAINT chk_main_score    CHECK (main_score    BETWEEN 0 AND 20),
    CONSTRAINT chk_bonus_points  CHECK (bonus_points  IN (0, 3, 6)),
    CONSTRAINT chk_total_score   CHECK (total_score   BETWEEN 0 AND 26),
    CONSTRAINT chk_hearts_left   CHECK (hearts_left   BETWEEN 0 AND 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 4. REWARD_CLAIM
-- ============================================================
CREATE TABLE reward_claim (
    id                    CHAR(36)   NOT NULL DEFAULT (UUID()),
    event_id              CHAR(36)   NOT NULL,
    player_id             CHAR(36)   NOT NULL,
    qualifying_attempt_id CHAR(36)   NOT NULL,

    reward_type           ENUM('threshold', 'top3') NOT NULL,
    status                ENUM('eligible', 'claimed') NOT NULL DEFAULT 'eligible',

    claimed_by            VARCHAR(100) NULL,   -- username admin xác nhận
    claimed_at            DATETIME     NULL,
    created_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    -- Mỗi người chỉ nhận mỗi loại quà một lần trong một sự kiện
    UNIQUE KEY uq_claim_event_player_type (event_id, player_id, reward_type),
    INDEX idx_claim_player (player_id),
    INDEX idx_claim_status (status),

    CONSTRAINT fk_claim_event
        FOREIGN KEY (event_id) REFERENCES event (id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_claim_player
        FOREIGN KEY (player_id) REFERENCES player (id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_claim_attempt
        FOREIGN KEY (qualifying_attempt_id) REFERENCES game_attempt (id)
        ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
