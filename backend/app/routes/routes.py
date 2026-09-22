# File khai báo các API endpoints (routes) của hệ thống, ánh xạ HTTP request đến hàm xử lý tương ứng.
from fastapi import APIRouter, Depends, HTTPException, Header, status
from sqlalchemy.orm import Session
from typing import Optional

from app.db.database import get_db
from app.db.schemas import (
    PlayerRegisterRequest,
    PlayerResponse,
    GameStartResponse,
    GameSubmitRequest,
    GameSubmitResponse,
    LeaderboardResponse,
    RewardMeResponse
)
from app.service.service import (
    get_or_create_player,
    start_game_attempt,
    validate_and_score_attempt,
    get_leaderboard,
    get_rewards_for_player
)
from app.models.model import GameAttempt

router = APIRouter(prefix="/api", tags=["Match & Catch Game"])


def get_bearer_token(authorization: Optional[str] = Header(None)) -> Optional[str]:
    """Trích xuất Bearer token từ HTTP Authorization header của request."""
    if authorization and authorization.startswith("Bearer "):
        return authorization.split(" ", 1)[1].strip()
    return None


@router.post("/players", response_model=PlayerResponse, summary="Đăng ký hoặc tìm kiếm người chơi theo MSSV")
def register_or_get_player(
    req: PlayerRegisterRequest,
    db: Session = Depends(get_db)
):
    """Tạo mới hoặc tra cứu người chơi theo MSSV trong sự kiện hiện tại. Trả về số lượt đã chơi và khả năng chơi tiếp."""
    player, attempts_count, can_play = get_or_create_player(
        db=db,
        student_id=req.student_id,
        display_name=req.display_name
    )
    return PlayerResponse(
        id=player.id,
        student_id=player.student_id,
        display_name=player.display_name,
        attempts_count=attempts_count,
        can_play=can_play
    )


@router.post("/game/start", response_model=GameStartResponse, summary="Bắt đầu lượt chơi mới")
def start_game(
    req: PlayerRegisterRequest,
    db: Session = Depends(get_db)
):
    """Khởi tạo lượt chơi mới, cấp session_token và trả về bộ 40 thẻ đã xáo trộn kèm câu hỏi bonus. Trả 403 nếu đã hết 3 lượt."""
    try:
        attempt, deck_data = start_game_attempt(
            db=db,
            student_id=req.student_id,
            display_name=req.display_name
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(e)
        )

    return GameStartResponse(
        attempt_id=attempt.id,
        session_token=attempt.session_token,
        round_1_target="AWS",
        round_2_target="GCP",
        round_1_cards=deck_data["round_1_cards"],
        round_2_cards=deck_data["round_2_cards"],
        bonus_questions=deck_data["bonus_questions"],
        attempts_left=deck_data["attempts_left"]
    )


@router.post("/game/submit", response_model=GameSubmitResponse, summary="Nộp nhật ký lượt chơi và chấm điểm (Idempotent)")
def submit_game(
    req: GameSubmitRequest,
    bearer_token: Optional[str] = Depends(get_bearer_token),
    db: Session = Depends(get_db)
):
    """Nhận action_logs từ client, tính điểm server-side và lưu kết quả. An toàn khi gọi nhiều lần (idempotent)."""
    token = bearer_token or req.session_token
    try:
        attempt, is_eligible = validate_and_score_attempt(
            db=db,
            attempt_id=req.attempt_id,
            session_token=token,
            action_logs=req.action_logs,
            bonus_answers=req.bonus_answers,
            duration_ms=req.duration_ms
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))

    from app.config import settings
    return GameSubmitResponse(
        attempt_id=attempt.id,
        status=attempt.status,
        main_score=attempt.main_score,
        bonus_points=attempt.bonus_points,
        total_score=attempt.total_score,
        correct=attempt.correct,
        wrong=attempt.wrong,
        missed_target=attempt.missed_target,
        hearts_left=attempt.hearts_left,
        duration_ms=attempt.duration_ms,
        is_eligible_reward=is_eligible,
        reward_threshold=settings.REWARD_THRESHOLD
    )


@router.get("/game/attempts/{attempt_id}", summary="Lấy kết quả lượt chơi")
def get_attempt_details(
    attempt_id: str,
    bearer_token: Optional[str] = Depends(get_bearer_token),
    db: Session = Depends(get_db)
):
    """Trả về chi tiết điểm số và trạng thái của một lượt chơi theo attempt_id. Yêu cầu session_token hợp lệ."""
    attempt = db.query(GameAttempt).filter(GameAttempt.id == attempt_id).first()
    if not attempt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy lượt chơi.")

    if bearer_token and attempt.session_token != bearer_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Không có quyền truy cập.")

    from app.config import settings
    return {
        "attempt_id": attempt.id,
        "status": attempt.status,
        "main_score": attempt.main_score,
        "bonus_points": attempt.bonus_points,
        "total_score": attempt.total_score,
        "correct": attempt.correct,
        "wrong": attempt.wrong,
        "missed_target": attempt.missed_target,
        "hearts_left": attempt.hearts_left,
        "duration_ms": attempt.duration_ms,
        "bonus_1_triggered": attempt.bonus_1_triggered,
        "bonus_2_triggered": attempt.bonus_2_triggered,
        "bonus_1_correct": attempt.bonus_1_correct,
        "bonus_2_correct": attempt.bonus_2_correct,
        "finished_at": attempt.finished_at,
        "is_eligible_reward": attempt.total_score >= settings.REWARD_THRESHOLD
    }


@router.get("/leaderboard", response_model=LeaderboardResponse, summary="Lấy bảng xếp hạng Top 10 (Không trả MSSV)")
def get_leaderboard_endpoint(
    limit: int = 10,
    db: Session = Depends(get_db)
):
    """Trả về Top 10 người chơi có điểm cao nhất. Chỉ hiển thị tên, điểm, tim và thời gian — không bao giờ lộ MSSV."""
    return get_leaderboard(db=db, limit=limit)


@router.get("/rewards/me", response_model=RewardMeResponse, summary="Lấy trạng thái quà của người chơi")
def get_my_rewards(
    bearer_token: Optional[str] = Depends(get_bearer_token),
    session_token: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Tra cứu điều kiện và trạng thái nhận quà (eligible/claimed) của người chơi hiện tại dựa trên session_token."""
    token = bearer_token or session_token
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Yêu cầu session_token.")

    try:
        return get_rewards_for_player(db=db, session_token=token)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
