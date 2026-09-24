# File khai báo các URL patterns cho game app
from django.urls import path
from . import views

app_name = 'game'

urlpatterns = [
    # Health check endpoints
    path('', views.root, name='root'),
    path('health/', views.health_check, name='health'),

    # Player endpoints
    path('api/players/', views.register_or_get_player, name='register_player'),

    # Game endpoints
    path('api/game/start/', views.start_game, name='start_game'),
    path('api/game/submit/', views.submit_game, name='submit_game'),
    path('api/game/attempts/<str:attempt_id>/', views.get_attempt_details, name='attempt_details'),

    # Leaderboard endpoint
    path('api/leaderboard/', views.get_leaderboard_endpoint, name='leaderboard'),

    # Rewards endpoint
    path('api/rewards/me/', views.get_my_rewards, name='my_rewards'),
]
