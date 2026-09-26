# File khai báo các API endpoints (views) của hệ thống, ánh xạ HTTP request đến hàm xử lý tương ứng.
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from django.conf import settings

from .serializers import (
    PlayerRegisterSerializer,
    PlayerResponseSerializer,
    GameStartResponseSerializer,
    GameSubmitSerializer,
    GameSubmitResponseSerializer,
    LeaderboardResponseSerializer,
    RewardMeResponseSerializer
)
from .services import (
    get_or_create_player,
    start_game_attempt,
    validate_and_score_attempt,
    get_leaderboard,
    get_rewards_for_player
)
from .models import GameAttempt


def get_bearer_token(request):
    """Trích xuất Bearer token từ HTTP Authorization header của request."""
    auth_header = request.META.get('HTTP_AUTHORIZATION', '')
    if auth_header.startswith('Bearer '):
        return auth_header.split(' ', 1)[1].strip()
    return None


@api_view(['POST'])
def register_or_get_player(request):
    """Tạo mới hoặc tra cứu người chơi theo MSSV trong sự kiện hiện tại. Trả về số lượt đã chơi và khả năng chơi tiếp."""
    serializer = PlayerRegisterSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    student_id = serializer.validated_data['student_id']
    display_name = serializer.validated_data['display_name']

    player, attempts_count, can_play = get_or_create_player(student_id, display_name)

    response_data = {
        'id': str(player.id),
        'student_id': player.student_id,
        'display_name': player.display_name,
        'attempts_count': attempts_count,
        'can_play': can_play
    }

    return Response(response_data, status=status.HTTP_200_OK)


@api_view(['POST'])
def start_game(request):
    """Khởi tạo lượt chơi mới, cấp session_token và trả về bộ 40 thẻ đã xáo trộn kèm câu hỏi bonus. Trả 403 nếu đã hết 3 lượt."""
    serializer = PlayerRegisterSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    student_id = serializer.validated_data['student_id']
    display_name = serializer.validated_data['display_name']

    try:
        attempt, deck_data = start_game_attempt(student_id, display_name)
    except ValueError as e:
        return Response(
            {'detail': str(e)},
            status=status.HTTP_403_FORBIDDEN
        )

    response_data = {
        'attempt_id': str(attempt.id),
        'session_token': attempt.session_token,
        'round_1_target': 'AWS',
        'round_2_target': 'GCP',
        'round_1_cards': deck_data['round_1_cards'],
        'round_2_cards': deck_data['round_2_cards'],
        'bonus_questions': deck_data['bonus_questions'],
        'attempts_left': deck_data['attempts_left']
    }

    return Response(response_data, status=status.HTTP_200_OK)


@api_view(['POST'])
def submit_game(request):
    """Nhận action_logs từ client, tính điểm server-side và lưu kết quả. An toàn khi gọi nhiều lần (idempotent)."""
    serializer = GameSubmitSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    attempt_id = serializer.validated_data['attempt_id']
    session_token = serializer.validated_data.get('session_token')
    bearer_token = get_bearer_token(request)
    token = bearer_token or session_token

    action_logs = serializer.validated_data['action_logs']
    bonus_answers = serializer.validated_data.get('bonus_answers', [])
    duration_ms = serializer.validated_data.get('duration_ms', 0)

    try:
        attempt, is_eligible = validate_and_score_attempt(
            attempt_id=attempt_id,
            session_token=token,
            action_logs=action_logs,
            bonus_answers=bonus_answers,
            duration_ms=duration_ms
        )
    except ValueError as e:
        return Response({'detail': str(e)}, status=status.HTTP_404_NOT_FOUND)
    except PermissionError as e:
        return Response({'detail': str(e)}, status=status.HTTP_401_UNAUTHORIZED)

    reward_threshold = getattr(settings, 'REWARD_THRESHOLD', 12)

    response_data = {
        'attempt_id': str(attempt.id),
        'status': attempt.status,
        'main_score': attempt.main_score,
        'bonus_points': attempt.bonus_points,
        'total_score': attempt.total_score,
        'correct': attempt.correct,
        'wrong': attempt.wrong,
        'missed_target': attempt.missed_target,
        'hearts_left': attempt.hearts_left,
        'duration_ms': attempt.duration_ms,
        'is_eligible_reward': is_eligible,
        'reward_threshold': reward_threshold
    }

    return Response(response_data, status=status.HTTP_200_OK)


@api_view(['GET'])
def get_attempt_details(request, attempt_id):
    """Trả về chi tiết điểm số và trạng thái của một lượt chơi theo attempt_id. Yêu cầu session_token hợp lệ."""
    bearer_token = get_bearer_token(request)

    try:
        attempt = GameAttempt.objects.get(id=attempt_id)
    except GameAttempt.DoesNotExist:
        return Response(
            {'detail': 'Không tìm thấy lượt chơi.'},
            status=status.HTTP_404_NOT_FOUND
        )

    if bearer_token and attempt.session_token != bearer_token:
        return Response(
            {'detail': 'Không có quyền truy cập.'},
            status=status.HTTP_401_UNAUTHORIZED
        )

    reward_threshold = getattr(settings, 'REWARD_THRESHOLD', 12)

    response_data = {
        'attempt_id': str(attempt.id),
        'status': attempt.status,
        'main_score': attempt.main_score,
        'bonus_points': attempt.bonus_points,
        'total_score': attempt.total_score,
        'correct': attempt.correct,
        'wrong': attempt.wrong,
        'missed_target': attempt.missed_target,
        'hearts_left': attempt.hearts_left,
        'duration_ms': attempt.duration_ms,
        'bonus_1_triggered': attempt.bonus_1_triggered,
        'bonus_2_triggered': attempt.bonus_2_triggered,
        'bonus_1_correct': attempt.bonus_1_correct,
        'bonus_2_correct': attempt.bonus_2_correct,
        'finished_at': attempt.finished_at,
        'is_eligible_reward': attempt.total_score >= reward_threshold
    }

    return Response(response_data, status=status.HTTP_200_OK)


@api_view(['GET'])
def get_leaderboard_endpoint(request):
    """Trả về Top 10 người chơi có điểm cao nhất. Chỉ hiển thị tên, điểm, tim và thời gian — không bao giờ lộ MSSV."""
    limit = int(request.GET.get('limit', 10))
    leaderboard_data = get_leaderboard(limit=limit)
    return Response(leaderboard_data, status=status.HTTP_200_OK)


@api_view(['GET'])
def get_my_rewards(request):
    """Tra cứu điều kiện và trạng thái nhận quà (eligible/claimed) của người chơi hiện tại dựa trên session_token."""
    bearer_token = get_bearer_token(request)
    session_token = request.GET.get('session_token')
    token = bearer_token or session_token

    if not token:
        return Response(
            {'detail': 'Yêu cầu session_token.'},
            status=status.HTTP_401_UNAUTHORIZED
        )

    try:
        rewards_data = get_rewards_for_player(token)
        return Response(rewards_data, status=status.HTTP_200_OK)
    except ValueError as e:
        return Response({'detail': str(e)}, status=status.HTTP_404_NOT_FOUND)


@api_view(['GET'])
def root(request):
    """Trả về thông tin cơ bản của API và đường dẫn tài liệu."""
    return Response({
        'app': 'Match & Catch API',
        'version': '1.0.0',
        'status': 'online',
        'docs_url': '/api/docs/'
    })


@api_view(['GET'])
def health_check(request):
    """Kiểm tra trạng thái hoạt động của server (dùng cho load balancer hoặc monitoring)."""
    return Response({'status': 'ok'})
