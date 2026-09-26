# File định nghĩa các Django ORM models (Event, Player, GameAttempt, RewardClaim) tương ứng với các bảng trong cơ sở dữ liệu.
import uuid
from django.db import models
from django.utils import timezone


class Event(models.Model):
    """Sự kiện game (ví dụ: TechFest 2026)"""
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('closed', 'Closed'),
    ]

    id = models.CharField(max_length=36, primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='active')
    reward_threshold = models.IntegerField(default=12)
    created_at = models.DateTimeField(default=timezone.now)
    closed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'events'
        verbose_name = 'Event'
        verbose_name_plural = 'Events'

    def __str__(self):
        return self.name


class Player(models.Model):
    """Người chơi trong sự kiện"""
    id = models.CharField(max_length=36, primary_key=True, default=uuid.uuid4, editable=False)
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name='players')
    student_id = models.CharField(max_length=50, db_index=True)
    display_name = models.CharField(max_length=100)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'players'
        unique_together = [['event', 'student_id']]
        verbose_name = 'Player'
        verbose_name_plural = 'Players'
        indexes = [
            models.Index(fields=['student_id']),
        ]

    def __str__(self):
        return f"{self.display_name} ({self.student_id})"


class GameAttempt(models.Model):
    """Lượt chơi của người chơi"""
    STATUS_CHOICES = [
        ('created', 'Created'),
        ('in_progress', 'In Progress'),
        ('submitted', 'Submitted'),
        ('abandoned', 'Abandoned'),
    ]

    id = models.CharField(max_length=36, primary_key=True, default=uuid.uuid4, editable=False)
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name='attempts')
    player = models.ForeignKey(Player, on_delete=models.CASCADE, related_name='attempts')
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='in_progress')
    session_token = models.CharField(max_length=100, unique=True, db_index=True)

    # Scores and stats
    main_score = models.IntegerField(default=0)
    bonus_points = models.IntegerField(default=0)
    total_score = models.IntegerField(default=0)
    correct = models.IntegerField(default=0)
    wrong = models.IntegerField(default=0)
    missed_target = models.IntegerField(default=0)
    hearts_left = models.IntegerField(default=3)
    duration_ms = models.IntegerField(default=0)

    # Bonus state tracking
    bonus_question_1_id = models.CharField(max_length=50, null=True, blank=True)
    bonus_question_2_id = models.CharField(max_length=50, null=True, blank=True)
    bonus_1_triggered = models.BooleanField(default=False)
    bonus_2_triggered = models.BooleanField(default=False)
    bonus_1_correct = models.BooleanField(default=False)
    bonus_2_correct = models.BooleanField(default=False)

    started_at = models.DateTimeField(default=timezone.now)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'game_attempts'
        verbose_name = 'Game Attempt'
        verbose_name_plural = 'Game Attempts'
        indexes = [
            models.Index(fields=['session_token']),
            models.Index(fields=['status']),
        ]

    def __str__(self):
        return f"Attempt {self.id[:8]} - {self.player.display_name}"


class RewardClaim(models.Model):
    """Phần quà của người chơi"""
    REWARD_TYPE_CHOICES = [
        ('threshold', 'Threshold'),
        ('top3', 'Top 3'),
    ]

    STATUS_CHOICES = [
        ('eligible', 'Eligible'),
        ('claimed', 'Claimed'),
    ]

    id = models.CharField(max_length=36, primary_key=True, default=uuid.uuid4, editable=False)
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name='reward_claims')
    player = models.ForeignKey(Player, on_delete=models.CASCADE, related_name='reward_claims')
    qualifying_attempt = models.ForeignKey(GameAttempt, on_delete=models.SET_NULL, null=True, blank=True, related_name='reward_claims')
    reward_type = models.CharField(max_length=50, choices=REWARD_TYPE_CHOICES)
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='eligible')
    claimed_by = models.CharField(max_length=100, null=True, blank=True)
    claimed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'reward_claims'
        unique_together = [['event', 'player', 'reward_type']]
        verbose_name = 'Reward Claim'
        verbose_name_plural = 'Reward Claims'

    def __str__(self):
        return f"{self.reward_type} - {self.player.display_name}"
