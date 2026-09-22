# File định nghĩa các SQLAlchemy ORM models (Event, Player, GameAttempt, RewardClaim) tương ứng với các bảng trong cơ sở dữ liệu.
import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    String,
    Integer,
    Boolean,
    DateTime,
    ForeignKey,
    UniqueConstraint,
    Index
)
from sqlalchemy.orm import relationship
from app.db.database import Base


def generate_uuid():
    """Tạo chuỗi UUID v4 ngẫu nhiên làm khóa chính (Primary Key)."""
    return str(uuid.uuid4())


def utc_now():
    """Lấy thời gian hiện tại theo chuẩn múi giờ UTC."""
    return datetime.now(timezone.utc)


class Event(Base):
    __tablename__ = "events"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False)
    status = Column(String(50), default="active", nullable=False)  # active, closed
    reward_threshold = Column(Integer, default=12, nullable=False)
    created_at = Column(DateTime, default=utc_now, nullable=False)
    closed_at = Column(DateTime, nullable=True)

    # Relationships
    players = relationship("Player", back_populates="event", cascade="all, delete-orphan")
    attempts = relationship("GameAttempt", back_populates="event", cascade="all, delete-orphan")
    reward_claims = relationship("RewardClaim", back_populates="event", cascade="all, delete-orphan")


class Player(Base):
    __tablename__ = "players"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    event_id = Column(String(36), ForeignKey("events.id"), nullable=False)
    student_id = Column(String(50), nullable=False, index=True)
    display_name = Column(String(100), nullable=False)
    created_at = Column(DateTime, default=utc_now, nullable=False)

    __table_args__ = (
        UniqueConstraint("event_id", "student_id", name="uq_event_student"),
    )

    # Relationships
    event = relationship("Event", back_populates="players")
    attempts = relationship("GameAttempt", back_populates="player", cascade="all, delete-orphan")
    reward_claims = relationship("RewardClaim", back_populates="player", cascade="all, delete-orphan")


class GameAttempt(Base):
    __tablename__ = "game_attempts"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    event_id = Column(String(36), ForeignKey("events.id"), nullable=False)
    player_id = Column(String(36), ForeignKey("players.id"), nullable=False)
    status = Column(String(50), default="in_progress", nullable=False)  # created, in_progress, submitted, abandoned
    session_token = Column(String(100), unique=True, index=True, nullable=False)

    # Scores and stats
    main_score = Column(Integer, default=0, nullable=False)
    bonus_points = Column(Integer, default=0, nullable=False)  # 0, 3, 6
    total_score = Column(Integer, default=0, nullable=False)
    correct = Column(Integer, default=0, nullable=False)
    wrong = Column(Integer, default=0, nullable=False)
    missed_target = Column(Integer, default=0, nullable=False)
    hearts_left = Column(Integer, default=3, nullable=False)
    duration_ms = Column(Integer, default=0, nullable=False)

    # Bonus state tracking
    bonus_question_1_id = Column(String(50), nullable=True)
    bonus_question_2_id = Column(String(50), nullable=True)
    bonus_1_triggered = Column(Boolean, default=False, nullable=False)
    bonus_2_triggered = Column(Boolean, default=False, nullable=False)
    bonus_1_correct = Column(Boolean, default=False, nullable=False)
    bonus_2_correct = Column(Boolean, default=False, nullable=False)

    started_at = Column(DateTime, default=utc_now, nullable=False)
    finished_at = Column(DateTime, nullable=True)

    # Relationships
    player = relationship("Player", back_populates="attempts")
    event = relationship("Event", back_populates="attempts")
    reward_claims = relationship("RewardClaim", back_populates="qualifying_attempt")


class RewardClaim(Base):
    __tablename__ = "reward_claims"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    event_id = Column(String(36), ForeignKey("events.id"), nullable=False)
    player_id = Column(String(36), ForeignKey("players.id"), nullable=False)
    qualifying_attempt_id = Column(String(36), ForeignKey("game_attempts.id"), nullable=True)
    reward_type = Column(String(50), nullable=False)  # threshold, top3
    status = Column(String(50), default="eligible", nullable=False)  # eligible, claimed
    claimed_by = Column(String(100), nullable=True)
    claimed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utc_now, nullable=False)

    __table_args__ = (
        UniqueConstraint("event_id", "player_id", "reward_type", name="uq_event_player_reward"),
    )

    # Relationships
    event = relationship("Event", back_populates="reward_claims")
    player = relationship("Player", back_populates="reward_claims")
    qualifying_attempt = relationship("GameAttempt", back_populates="reward_claims")
