# File kiểm thử tự động (pytest) cho toàn bộ luồng nghiệp vụ chính: đăng ký, chơi game, chấm điểm, giới hạn lượt, bảng xếp hạng và nhận quà.
import pytest
import os
import sys

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from app.main import app
from app.db.database import Base, engine


@pytest.fixture(autouse=True)
def setup_database():
    # Setup fresh isolated test database
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


client = TestClient(app)


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_register_and_start_game():
    student_id = "TEST_SV_001"
    name = "Nguyen Van Test"

    # 1. Register player
    reg_res = client.post("/api/players", json={"student_id": student_id, "display_name": name})
    assert reg_res.status_code == 200
    reg_data = reg_res.json()
    assert reg_data["student_id"] == student_id
    assert reg_data["attempts_count"] == 0
    assert reg_data["can_play"] is True

    # 2. Start game attempt
    start_res = client.post("/api/game/start", json={"student_id": student_id, "display_name": name})
    assert start_res.status_code == 200
    start_data = start_res.json()
    assert "session_token" in start_data
    assert "attempt_id" in start_data
    assert len(start_data["round_1_cards"]) == 20
    assert len(start_data["round_2_cards"]) == 20
    assert start_data["round_1_target"] == "AWS"
    assert start_data["round_2_target"] == "GCP"

    # Ensure no correct_indices are leaked in client questions
    for bq in start_data["bonus_questions"]:
        assert "correct_indices" not in bq
        assert "question" in bq
        assert len(bq["options"]) > 0


def test_game_scoring_and_idempotence():
    student_id = "TEST_SV_002"
    name = "Tran Thi Test"

    # Start game
    start_res = client.post("/api/game/start", json={"student_id": student_id, "display_name": name})
    start_data = start_res.json()
    attempt_id = start_data["attempt_id"]
    token = start_data["session_token"]
    round_1_cards = start_data["round_1_cards"]

    # Pick 5 AWS cards from round 1
    aws_cards = [c for c in round_1_cards if c["provider"] == "AWS"]
    action_logs = []

    # Click 5 AWS cards correctly (should trigger Bonus 1)
    for c in aws_cards[:5]:
        action_logs.append({
            "instance_id": c["instance_id"],
            "card_id": c["id"],
            "round": 1,
            "action": "clicked"
        })

    # Submit
    submit_res = client.post(
        "/api/game/submit",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "attempt_id": attempt_id,
            "session_token": token,
            "action_logs": action_logs,
            "bonus_answers": [],
            "duration_ms": 15000
        }
    )
    assert submit_res.status_code == 200
    sub_data = submit_res.json()
    assert sub_data["main_score"] == 5
    assert sub_data["correct"] == 5
    assert sub_data["wrong"] == 0
    assert sub_data["hearts_left"] == 3

    # Test idempotence: submitting again should return identical result
    repeat_res = client.post(
        "/api/game/submit",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "attempt_id": attempt_id,
            "session_token": token,
            "action_logs": action_logs,
            "bonus_answers": [],
            "duration_ms": 15000
        }
    )
    assert repeat_res.status_code == 200
    assert repeat_res.json() == sub_data


def test_three_attempts_limit():
    student_id = "TEST_SV_003"
    name = "Le Van Limit"

    # Play 3 times
    for i in range(3):
        start_res = client.post("/api/game/start", json={"student_id": student_id, "display_name": name})
        assert start_res.status_code == 200
        attempt_id = start_res.json()["attempt_id"]
        token = start_res.json()["session_token"]

        # Submit attempt
        sub_res = client.post(
            "/api/game/submit",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "attempt_id": attempt_id,
                "action_logs": [],
                "bonus_answers": [],
                "duration_ms": 5000
            }
        )
        assert sub_res.status_code == 200

    # 4th attempt should be blocked with 403
    fourth_res = client.post("/api/game/start", json={"student_id": student_id, "display_name": name})
    assert fourth_res.status_code == 403
    assert "tối đa 3 lượt" in fourth_res.json()["detail"]


def test_leaderboard_privacy():
    # Ensure leaderboard returns data and never leaks student_id
    lb_res = client.get("/api/leaderboard")
    assert lb_res.status_code == 200
    lb_data = lb_res.json()
    assert "top_entries" in lb_data
    assert "event_name" in lb_data

    for entry in lb_data["top_entries"]:
        assert "rank" in entry
        assert "display_name" in entry
        assert "total_score" in entry
        assert "student_id" not in entry


def test_bonus_scoring_and_rewards():
    student_id = "TEST_SV_BONUS"
    name = "Bonus Champion"

    start_res = client.post("/api/game/start", json={"student_id": student_id, "display_name": name})
    assert start_res.status_code == 200
    start_data = start_res.json()
    attempt_id = start_data["attempt_id"]
    token = start_data["session_token"]
    round_1_cards = start_data["round_1_cards"]
    bonus_q1 = start_data["bonus_questions"][0]

    # Click 14 AWS cards in Round 1
    aws_cards = [c for c in round_1_cards if c["provider"] == "AWS"]
    action_logs = []
    for c in aws_cards:
        action_logs.append({
            "instance_id": c["instance_id"],
            "card_id": c["id"],
            "round": 1,
            "action": "clicked"
        })

    # Read backend questions to simulate getting the exact correct answer for bonus 1
    from app.service.service import load_bonus_questions
    all_bq = {q["id"]: q for q in load_bonus_questions()}
    correct_indices = all_bq[bonus_q1["id"]]["correct_indices"]

    submit_res = client.post(
        "/api/game/submit",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "attempt_id": attempt_id,
            "session_token": token,
            "action_logs": action_logs,
            "bonus_answers": [
                {"question_id": bonus_q1["id"], "selected_indices": correct_indices}
            ],
            "duration_ms": 12000
        }
    )
    assert submit_res.status_code == 200
    sub_data = submit_res.json()
    assert sub_data["main_score"] == 14
    assert sub_data["bonus_points"] >= 3
    assert sub_data["total_score"] >= 17
    assert sub_data["is_eligible_reward"] is True

    # Check rewards/me endpoint
    reward_res = client.get("/api/rewards/me", headers={"Authorization": f"Bearer {token}"})
    assert reward_res.status_code == 200
    rew_data = reward_res.json()
    assert rew_data["student_id"] == student_id
    assert rew_data["best_score"] >= 17
    assert any(r["reward_type"] == "threshold" and r["status"] == "eligible" for r in rew_data["rewards"])


def test_hearts_depletion():
    student_id = "TEST_SV_DEFEAT"
    name = "Wrong Clicker"

    start_res = client.post("/api/game/start", json={"student_id": student_id, "display_name": name})
    start_data = start_res.json()
    attempt_id = start_data["attempt_id"]
    token = start_data["session_token"]
    round_1_cards = start_data["round_1_cards"]

    # In Round 1, target is AWS, distractor is GCP.
    gcp_cards = [c for c in round_1_cards if c["provider"] == "GCP"]
    action_logs = []
    # Click 3 GCP cards (3 wrong clicks)
    for c in gcp_cards[:3]:
        action_logs.append({
            "instance_id": c["instance_id"],
            "card_id": c["id"],
            "round": 1,
            "action": "clicked"
        })

    submit_res = client.post(
        "/api/game/submit",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "attempt_id": attempt_id,
            "session_token": token,
            "action_logs": action_logs,
            "bonus_answers": [],
            "duration_ms": 8000
        }
    )
    assert submit_res.status_code == 200
    sub_data = submit_res.json()
    assert sub_data["wrong"] == 3
    assert sub_data["hearts_left"] == 0
