# File chứa toàn bộ business logic: tải dữ liệu thẻ/câu hỏi, tạo bộ bài, chấm điểm server-side, xếp hạng và quản lý quà.
import os
import json
import random
import uuid
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.config import settings
from app.models.model import Event, Player, GameAttempt, RewardClaim
from app.db.schemas import (
    CardInGame,
    BonusQuestionClient,
    LeaderboardEntry,
    LeaderboardResponse,
    RewardStatus,
    RewardMeResponse,
    CardActionLog,
    BonusAnswer
)

# Paths to static datasets
DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../data"))
CARDS_FILE = os.path.join(DATA_DIR, "cards.json")
BONUS_QUESTIONS_FILE = os.path.join(DATA_DIR, "bonus_questions.json")

_cards_cache: Optional[List[Dict[str, Any]]] = None
_questions_cache: Optional[List[Dict[str, Any]]] = None


def load_cards() -> List[Dict[str, Any]]:
    """Tải danh sách thẻ dịch vụ từ file JSON, sử dụng bộ nhớ đệm (cache) để tránh đọc đĩa nhiều lần."""
    global _cards_cache
    if _cards_cache is None:
        target_file = CARDS_FILE if os.path.exists(CARDS_FILE) else os.path.join(DATA_DIR, "card.json")
        with open(target_file, "r", encoding="utf-8") as f:
            _cards_cache = json.load(f)
    return _cards_cache


def load_bonus_questions() -> List[Dict[str, Any]]:
    """Tải ngân hàng câu hỏi bonus (gồm cả đáp án đúng) từ file JSON, sử dụng cache để tối ưu hiệu suất."""
    global _questions_cache
    if _questions_cache is None:
        with open(BONUS_QUESTIONS_FILE, "r", encoding="utf-8") as f:
            _questions_cache = json.load(f)
    return _questions_cache


def get_or_create_default_event(db: Session) -> Event:
    """Lấy sự kiện mặc định theo EVENT_ID trong cấu hình. Nếu chưa có, tự động tạo mới và lưu vào cơ sở dữ liệu."""
    event = db.query(Event).filter(Event.id == settings.EVENT_ID).first()
    if not event:
        event = Event(
            id=settings.EVENT_ID,
            name=settings.EVENT_NAME,
            status="active",
            reward_threshold=settings.REWARD_THRESHOLD
        )
        db.add(event)
        db.commit()
        db.refresh(event)
    return event


def get_player_attempts_count(db: Session, player_id: str) -> int:
    """Đếm số lượt chơi hợp lệ (không tính lượt abandoned) của một người chơi."""
    return db.query(GameAttempt).filter(
        GameAttempt.player_id == player_id,
        GameAttempt.status != "abandoned"
    ).count()


def get_or_create_player(db: Session, student_id: str, display_name: str) -> Tuple[Player, int, bool]:
    """
    Tìm hoặc tạo mới người chơi theo MSSV trong sự kiện hiện tại.
    Trả về (player, số_lượt_đã_chơi, có_thể_chơi_tiếp).
    MSSV được chuẩn hóa thành chữ hoa để tránh trùng lặp do khác chữ hoa/thường.
    """
    event = get_or_create_default_event(db)
    clean_student_id = student_id.strip().upper()
    clean_display_name = display_name.strip()

    player = db.query(Player).filter(
        Player.event_id == event.id,
        Player.student_id == clean_student_id
    ).first()

    if player:
        if player.display_name != clean_display_name:
            player.display_name = clean_display_name
            db.commit()
            db.refresh(player)
    else:
        player = Player(
            event_id=event.id,
            student_id=clean_student_id,
            display_name=clean_display_name
        )
        db.add(player)
        db.commit()
        db.refresh(player)

    attempts_count = get_player_attempts_count(db, player.id)
    can_play = attempts_count < 3
    return player, attempts_count, can_play


def start_game_attempt(db: Session, student_id: str, display_name: str) -> Tuple[GameAttempt, Dict[str, Any]]:
    """
    Khởi tạo lượt chơi mới cho người chơi:
    - Kiểm tra giới hạn 3 lượt/MSSV (ném ValueError nếu hết lượt).
    - Đánh dấu abandoned cho lượt đang dở dang nếu có.
    - Sinh ngẫu nhiên bộ 40 thẻ (20 Vòng 1, 20 Vòng 2) và chọn 2 câu hỏi bonus không trùng.
    - Trả về đối tượng attempt và dữ liệu bộ bài để gửi về frontend.
    """
    player, attempts_count, can_play = get_or_create_player(db, student_id, display_name)

    if not can_play:
        raise ValueError("Bạn đã chơi đủ tối đa 3 lượt cho phép trong sự kiện này.")

    # Rule: Any existing in-progress/created attempt by this player is marked as abandoned
    active_attempts = db.query(GameAttempt).filter(
        GameAttempt.player_id == player.id,
        GameAttempt.status.in_(["created", "in_progress"])
    ).all()
    for att in active_attempts:
        att.status = "abandoned"
        att.finished_at = datetime.now(timezone.utc)

    # Load questions & select 2 distinct bonus questions
    all_questions = load_bonus_questions()
    selected_questions = random.sample(all_questions, min(2, len(all_questions)))
    q1_id = selected_questions[0]["id"] if len(selected_questions) > 0 else None
    q2_id = selected_questions[1]["id"] if len(selected_questions) > 1 else None

    # Load cards pool
    all_cards = load_cards()
    aws_cards = [c for c in all_cards if c["provider"] == "AWS"]
    gcp_cards = [c for c in all_cards if c["provider"] == "GCP"]

    # Round 1: 14 AWS (target) + 6 GCP (distractor) = 20 cards
    r1_target = random.sample(aws_cards, min(14, len(aws_cards)))
    r1_distractor = random.sample(gcp_cards, min(6, len(gcp_cards)))
    r1_pool = r1_target + r1_distractor
    random.shuffle(r1_pool)

    # Round 2: 6 GCP (target) + 14 AWS (distractor) = 20 cards
    r2_target = random.sample(gcp_cards, min(6, len(gcp_cards)))
    r2_distractor = random.sample(aws_cards, min(14, len(aws_cards)))
    r2_pool = r2_target + r2_distractor
    random.shuffle(r2_pool)

    def prepare_in_game_cards(cards_list: List[Dict[str, Any]]) -> List[CardInGame]:
        """Gán instance_id UUID và hướng bay ngẫu nhiên cho mỗi thẻ trong bộ bài."""
        res = []
        for c in cards_list:
            res.append(CardInGame(
                instance_id=str(uuid.uuid4()),
                id=c["id"],
                name=c["name"],
                provider=c["provider"],
                icon_path=c["icon_path"],
                direction=random.choice(["left-to-right", "right-to-left"]),
                speed_seconds=3.0
            ))
        return res

    round_1_cards = prepare_in_game_cards(r1_pool)
    round_2_cards = prepare_in_game_cards(r2_pool)

    # Prepare client-facing bonus questions (without correct_indices!)
    client_bonus_questions = [
        BonusQuestionClient(
            id=q["id"],
            service_name=q["service_name"],
            question=q["question"],
            options=q["options"]
        )
        for q in selected_questions
    ]

    session_token = str(uuid.uuid4())
    attempt = GameAttempt(
        event_id=player.event_id,
        player_id=player.id,
        status="in_progress",
        session_token=session_token,
        bonus_question_1_id=q1_id,
        bonus_question_2_id=q2_id,
        started_at=datetime.now(timezone.utc)
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)

    deck_data = {
        "round_1_cards": round_1_cards,
        "round_2_cards": round_2_cards,
        "bonus_questions": client_bonus_questions,
        "attempts_left": max(0, 3 - (attempts_count + 1))
    }

    return attempt, deck_data


def validate_and_score_attempt(
    db: Session,
    attempt_id: str,
    session_token: Optional[str],
    action_logs: List[CardActionLog],
    bonus_answers: List[BonusAnswer],
    duration_ms: int
) -> Tuple[GameAttempt, bool]:
    """
    Chấm điểm lượt chơi dựa trên nhật ký thao tác (action_logs) từ client:
    - Idempotent: nếu lượt đã submitted, trả kết quả cũ không tính lại.
    - Tính main_score từ số thẻ mục tiêu click đúng.
    - Tính bonus_points từ đáp án câu hỏi bonus (so khớp với correct_indices trên server).
    - Mỗi instance_id chỉ được tính duy nhất một lần (chống click liên tiếp một thẻ).
    - Tự động tạo RewardClaim eligible nếu total_score >= REWARD_THRESHOLD.
    """
    attempt = db.query(GameAttempt).filter(GameAttempt.id == attempt_id).first()
    if not attempt:
        raise ValueError("Lượt chơi không tồn tại.")

    # Check token if provided
    if session_token and attempt.session_token != session_token:
        raise PermissionError("Phiên chơi không hợp lệ.")

    # Idempotent return if already submitted
    if attempt.status == "submitted":
        is_eligible = (attempt.total_score >= settings.REWARD_THRESHOLD)
        return attempt, is_eligible

    # Load catalog lookups
    all_cards = {c["id"]: c for c in load_cards()}
    all_questions = {q["id"]: q for q in load_bonus_questions()}

    main_score = 0
    correct = 0
    wrong = 0
    missed_target = 0
    streak_bonus = 0
    bonus_1_triggered = False
    bonus_2_triggered = False
    bonus_1_correct = False
    bonus_2_correct = False

    processed_instances = set()

    for log in action_logs:
        if log.instance_id in processed_instances:
            continue
        processed_instances.add(log.instance_id)

        card = all_cards.get(log.card_id)
        if not card:
            continue

        # If hearts depleted (3 wrongs), game has ended
        if wrong >= 3:
            break

        # Determine target provider
        target_provider = "AWS" if log.round == 1 else "GCP"
        is_target = (card["provider"] == target_provider)

        if log.action == "clicked":
            if is_target:
                correct += 1
                main_score += 1
                streak_bonus += 1

                # Check bonus trigger (every 5 consecutive correct target cards)
                if streak_bonus >= 5:
                    if not bonus_1_triggered:
                        bonus_1_triggered = True
                        streak_bonus = 0  # reset bonus streak after trigger
                    elif not bonus_2_triggered:
                        bonus_2_triggered = True
                        streak_bonus = 0
            else:
                # Clicked distractor
                wrong += 1
                streak_bonus = 0
        elif log.action == "missed":
            if is_target:
                missed_target += 1
                streak_bonus = 0
            else:
                # Distractor missed is safe
                pass

    hearts_left = max(0, 3 - wrong)

    # Validate bonus answers
    bonus_answer_map = {ans.question_id: set(ans.selected_indices) for ans in bonus_answers}
    bonus_points = 0

    if bonus_1_triggered and attempt.bonus_question_1_id:
        q1 = all_questions.get(attempt.bonus_question_1_id)
        if q1:
            correct_set = set(q1["correct_indices"])
            if bonus_answer_map.get(attempt.bonus_question_1_id) == correct_set:
                bonus_1_correct = True
                bonus_points += 3

    if bonus_2_triggered and attempt.bonus_question_2_id:
        q2 = all_questions.get(attempt.bonus_question_2_id)
        if q2:
            correct_set = set(q2["correct_indices"])
            if bonus_answer_map.get(attempt.bonus_question_2_id) == correct_set:
                bonus_2_correct = True
                bonus_points += 3

    total_score = main_score + bonus_points

    # Update attempt record
    attempt.status = "submitted"
    attempt.main_score = main_score
    attempt.bonus_points = bonus_points
    attempt.total_score = total_score
    attempt.correct = correct
    attempt.wrong = wrong
    attempt.missed_target = missed_target
    attempt.hearts_left = hearts_left
    attempt.duration_ms = max(0, duration_ms)
    attempt.bonus_1_triggered = bonus_1_triggered
    attempt.bonus_2_triggered = bonus_2_triggered
    attempt.bonus_1_correct = bonus_1_correct
    attempt.bonus_2_correct = bonus_2_correct
    attempt.finished_at = datetime.now(timezone.utc)

    # Check threshold reward eligibility
    is_eligible = total_score >= settings.REWARD_THRESHOLD
    if is_eligible:
        existing_claim = db.query(RewardClaim).filter(
            RewardClaim.event_id == attempt.event_id,
            RewardClaim.player_id == attempt.player_id,
            RewardClaim.reward_type == "threshold"
        ).first()

        if not existing_claim:
            claim = RewardClaim(
                event_id=attempt.event_id,
                player_id=attempt.player_id,
                qualifying_attempt_id=attempt.id,
                reward_type="threshold",
                status="eligible"
            )
            db.add(claim)
        elif existing_claim.status == "eligible":
            # Update qualifying attempt if current is higher score
            existing_claim.qualifying_attempt_id = attempt.id

    db.commit()
    db.refresh(attempt)

    return attempt, is_eligible


def get_leaderboard(db: Session, limit: int = 10) -> LeaderboardResponse:
    """
    Tạo bảng xếp hạng Top N người chơi:
    - Mỗi người chỉ tính 1 lượt chơi tốt nhất.
    - Tie-break theo thứ tự: điểm cao → tim nhiều → thời gian ngắn → hoàn thành sớm hơn.
    - Tuyệt đối không đưa MSSV vào kết quả trả về.
    """
    event = get_or_create_default_event(db)

    # Fetch all submitted attempts for this event
    submitted_attempts = db.query(GameAttempt).join(Player).filter(
        GameAttempt.event_id == event.id,
        GameAttempt.status == "submitted"
    ).all()

    # Tie-break key rule:
    # 1. total_score DESC (-total_score)
    # 2. hearts_left DESC (-hearts_left)
    # 3. duration_ms ASC (duration_ms)
    # 4. finished_at ASC (finished_at or datetime.max)
    def tie_break_key(att: GameAttempt):
        """Hàm tạo khóa sắp xếp theo quy tắc tie-break của cuộc thi."""
        fin_ts = att.finished_at.timestamp() if att.finished_at else float("inf")
        return (-att.total_score, -att.hearts_left, att.duration_ms, fin_ts)

    # For each player, find their single best attempt
    player_best: Dict[str, GameAttempt] = {}
    for att in submitted_attempts:
        p_id = att.player_id
        if p_id not in player_best:
            player_best[p_id] = att
        else:
            if tie_break_key(att) < tie_break_key(player_best[p_id]):
                player_best[p_id] = att

    # Sort all players' best attempts
    ranked_attempts = sorted(player_best.values(), key=tie_break_key)

    # Build leaderboard entries (Strictly NO student_id exposed!)
    top_entries = []
    for rank, att in enumerate(ranked_attempts[:limit], start=1):
        top_entries.append(LeaderboardEntry(
            rank=rank,
            display_name=att.player.display_name,
            total_score=att.total_score,
            hearts_left=att.hearts_left,
            duration_ms=att.duration_ms,
            finished_at=att.finished_at
        ))

    return LeaderboardResponse(
        event_name=event.name,
        total_participants=len(player_best),
        top_entries=top_entries
    )


def get_rewards_for_player(db: Session, session_token: str) -> RewardMeResponse:
    """
    Lấy thông tin điều kiện và trạng thái nhận quà của người chơi dựa trên session_token.
    Trả về điểm cao nhất và danh sách các loại quà (threshold/top3) cùng trạng thái (eligible/claimed).
    """
    attempt = db.query(GameAttempt).filter(GameAttempt.session_token == session_token).first()
    if not attempt:
        raise ValueError("Phiên chơi không hợp lệ.")

    player = attempt.player
    claims = db.query(RewardClaim).filter(
        RewardClaim.player_id == player.id,
        RewardClaim.event_id == attempt.event_id
    ).all()

    # Get player's highest score
    best_score_res = db.query(func.max(GameAttempt.total_score)).filter(
        GameAttempt.player_id == player.id,
        GameAttempt.status == "submitted"
    ).scalar() or 0

    reward_statuses = [
        RewardStatus(
            reward_type=c.reward_type,
            status=c.status,
            claimed_at=c.claimed_at
        )
        for c in claims
    ]

    return RewardMeResponse(
        student_id=player.student_id,
        display_name=player.display_name,
        best_score=best_score_res,
        reward_threshold=settings.REWARD_THRESHOLD,
        rewards=reward_statuses
    )
