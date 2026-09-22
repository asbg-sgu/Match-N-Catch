# File định nghĩa các Pydantic Schemas xác thực dữ liệu đầu vào (Request) và chuẩn hóa đầu ra (Response) cho API.
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from datetime import datetime


# --- Player Schemas ---
class PlayerRegisterRequest(BaseModel):
    student_id: str = Field(..., min_length=1, max_length=50, description="Mã số sinh viên")
    display_name: str = Field(..., min_length=1, max_length=100, description="Họ và tên sinh viên")


class PlayerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    student_id: str
    display_name: str
    attempts_count: int
    can_play: bool


# --- Card & Game Setup Schemas ---
class CardInGame(BaseModel):
    instance_id: str
    id: str
    name: str
    provider: str  # "AWS" or "GCP"
    icon_path: str
    direction: str  # "left-to-right" or "right-to-left"
    speed_seconds: float = 3.0


class BonusQuestionClient(BaseModel):
    id: str
    service_name: str
    question: str
    options: List[str]


class GameStartResponse(BaseModel):
    attempt_id: str
    session_token: str
    round_1_target: str = "AWS"
    round_2_target: str = "GCP"
    round_1_cards: List[CardInGame]
    round_2_cards: List[CardInGame]
    bonus_questions: List[BonusQuestionClient]
    attempts_left: int


# --- Submit & Scoring Schemas ---
class CardActionLog(BaseModel):
    instance_id: str
    card_id: str
    round: int  # 1 or 2
    action: str  # "clicked" or "missed"
    client_timestamp_ms: Optional[int] = None


class BonusAnswer(BaseModel):
    question_id: str
    selected_indices: List[int]


class GameSubmitRequest(BaseModel):
    attempt_id: str
    session_token: Optional[str] = None
    action_logs: List[CardActionLog]
    bonus_answers: List[BonusAnswer] = []
    duration_ms: int = Field(default=0, ge=0)


class GameSubmitResponse(BaseModel):
    attempt_id: str
    status: str
    main_score: int
    bonus_points: int
    total_score: int
    correct: int
    wrong: int
    missed_target: int
    hearts_left: int
    duration_ms: int
    is_eligible_reward: bool
    reward_threshold: int


# --- Leaderboard Schemas ---
class LeaderboardEntry(BaseModel):
    rank: int
    display_name: str
    total_score: int
    hearts_left: int
    duration_ms: int
    finished_at: Optional[datetime] = None


class LeaderboardResponse(BaseModel):
    event_name: str
    total_participants: int
    top_entries: List[LeaderboardEntry]


# --- Rewards Schemas ---
class RewardStatus(BaseModel):
    reward_type: str
    status: str  # eligible, claimed
    claimed_at: Optional[datetime] = None


class RewardMeResponse(BaseModel):
    student_id: str
    display_name: str
    best_score: int
    reward_threshold: int
    rewards: List[RewardStatus]
