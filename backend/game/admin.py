# File đăng ký các models với Django Admin interface
from django.contrib import admin
from .models import Event, Player, GameAttempt, RewardClaim


@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = ['id', 'name', 'status', 'reward_threshold', 'created_at']
    list_filter = ['status', 'created_at']
    search_fields = ['name', 'id']
    readonly_fields = ['created_at']


@admin.register(Player)
class PlayerAdmin(admin.ModelAdmin):
    list_display = ['id', 'student_id', 'display_name', 'event', 'created_at']
    list_filter = ['event', 'created_at']
    search_fields = ['student_id', 'display_name']
    readonly_fields = ['created_at']


@admin.register(GameAttempt)
class GameAttemptAdmin(admin.ModelAdmin):
    list_display = ['id', 'player', 'status', 'total_score', 'hearts_left', 'started_at']
    list_filter = ['status', 'event', 'started_at']
    search_fields = ['id', 'player__student_id', 'player__display_name', 'session_token']
    readonly_fields = ['started_at', 'finished_at']
    fieldsets = (
        ('Basic Info', {
            'fields': ('id', 'event', 'player', 'status', 'session_token')
        }),
        ('Scores', {
            'fields': ('main_score', 'bonus_points', 'total_score', 'correct', 'wrong', 'missed_target', 'hearts_left', 'duration_ms')
        }),
        ('Bonus Questions', {
            'fields': ('bonus_question_1_id', 'bonus_question_2_id', 'bonus_1_triggered', 'bonus_2_triggered', 'bonus_1_correct', 'bonus_2_correct')
        }),
        ('Timestamps', {
            'fields': ('started_at', 'finished_at')
        }),
    )


@admin.register(RewardClaim)
class RewardClaimAdmin(admin.ModelAdmin):
    list_display = ['id', 'player', 'reward_type', 'status', 'claimed_at', 'created_at']
    list_filter = ['reward_type', 'status', 'event', 'created_at']
    search_fields = ['player__student_id', 'player__display_name', 'claimed_by']
    readonly_fields = ['created_at']