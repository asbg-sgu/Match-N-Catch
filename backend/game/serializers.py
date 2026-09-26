# File định nghĩa các Serializers xác thực dữ liệu đầu vào (Request) và chuẩn hóa đầu ra (Response) cho API.
from rest_framework import serializers
from .models import Player, GameAttempt, RewardClaim


# --- Player Serializers ---
class PlayerRegisterSerializer(serializers.Serializer):
    student_id = serializers.CharField(max_length=50, required=True)
    # Cho phép rỗng: frontend chỉ tra cứu lượt còn lại thì không gửi tên,
    # tránh việc tra cứu vô tình ghi đè tên thật của người chơi.
    display_name = serializers.CharField(max_length=100, required=False, allow_blank=True, default='')


class PlayerResponseSerializer(serializers.ModelSerializer):
    attempts_count = serializers.IntegerField(read_only=True)
    can_play = serializers.BooleanField(read_only=True)

    class Meta:
        model = Player
        fields = ['id', 'student_id', 'display_name', 'attempts_count', 'can_play']


# --- Card & Game Setup Serializers ---
class CardInGameSerializer(serializers.Serializer):
    instance_id = serializers.CharField()
    id = serializers.CharField()
    name = serializers.CharField()
    provider = serializers.CharField()
    icon_path = serializers.CharField()
    direction = serializers.CharField()
    speed_seconds = serializers.FloatField(default=3.0)


class BonusQuestionClientSerializer(serializers.Serializer):
    id = serializers.CharField()
    service_name = serializers.CharField()
    question = serializers.CharField()
    options = serializers.ListField(child=serializers.CharField())


class GameStartResponseSerializer(serializers.Serializer):
    attempt_id = serializers.CharField()
    session_token = serializers.CharField()
    round_1_target = serializers.CharField(default="AWS")
    round_2_target = serializers.CharField(default="GCP")
    round_1_cards = CardInGameSerializer(many=True)
    round_2_cards = CardInGameSerializer(many=True)
    bonus_questions = BonusQuestionClientSerializer(many=True)
    attempts_left = serializers.IntegerField()


# --- Submit & Scoring Serializers ---
class CardActionLogSerializer(serializers.Serializer):
    instance_id = serializers.CharField()
    card_id = serializers.CharField()
    round = serializers.IntegerField()
    action = serializers.CharField()
    client_timestamp_ms = serializers.IntegerField(required=False, allow_null=True)


class BonusAnswerSerializer(serializers.Serializer):
    question_id = serializers.CharField()
    selected_indices = serializers.ListField(child=serializers.IntegerField())


class GameSubmitSerializer(serializers.Serializer):
    attempt_id = serializers.CharField()
    session_token = serializers.CharField(required=False, allow_null=True)
    action_logs = CardActionLogSerializer(many=True)
    bonus_answers = BonusAnswerSerializer(many=True, required=False, default=list)
    duration_ms = serializers.IntegerField(default=0, min_value=0)


class GameSubmitResponseSerializer(serializers.Serializer):
    attempt_id = serializers.CharField()
    status = serializers.CharField()
    main_score = serializers.IntegerField()
    bonus_points = serializers.IntegerField()
    total_score = serializers.IntegerField()
    correct = serializers.IntegerField()
    wrong = serializers.IntegerField()
    missed_target = serializers.IntegerField()
    hearts_left = serializers.IntegerField()
    duration_ms = serializers.IntegerField()
    is_eligible_reward = serializers.BooleanField()
    reward_threshold = serializers.IntegerField()


# --- Leaderboard Serializers ---
class LeaderboardEntrySerializer(serializers.Serializer):
    rank = serializers.IntegerField()
    display_name = serializers.CharField()
    main_score = serializers.IntegerField()
    bonus_points = serializers.IntegerField()
    total_score = serializers.IntegerField()
    hearts_left = serializers.IntegerField()
    duration_ms = serializers.IntegerField()
    finished_at = serializers.DateTimeField(allow_null=True)


class LeaderboardResponseSerializer(serializers.Serializer):
    event_name = serializers.CharField()
    total_participants = serializers.IntegerField()
    top_entries = LeaderboardEntrySerializer(many=True)


# --- Rewards Serializers ---
class RewardStatusSerializer(serializers.Serializer):
    reward_type = serializers.CharField()
    status = serializers.CharField()
    claimed_at = serializers.DateTimeField(allow_null=True)


class RewardMeResponseSerializer(serializers.Serializer):
    student_id = serializers.CharField()
    display_name = serializers.CharField()
    best_score = serializers.IntegerField()
    reward_threshold = serializers.IntegerField()
    rewards = RewardStatusSerializer(many=True)
