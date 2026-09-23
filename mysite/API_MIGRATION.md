# API Migration Guide: FastAPI → Django

So sánh các endpoints giữa FastAPI (backend cũ) và Django (backend mới)

## Base URL
- **FastAPI**: `http://localhost:8000`
- **Django**: `http://localhost:8000`

## Endpoints Comparison

### 1. Health Check

| FastAPI | Django | Method | Notes |
|---------|--------|--------|-------|
| `GET /` | `GET /` | GET | Giống nhau |
| `GET /health` | `GET /health/` | GET | Django có trailing slash |

### 2. Player Management

| FastAPI | Django | Method | Request Body |
|---------|--------|--------|--------------|
| `POST /api/players` | `POST /api/players/` | POST | `{student_id, display_name}` |

**Response**: Giống nhau
```json
{
  "id": "uuid",
  "student_id": "SV001",
  "display_name": "Nguyen Van A",
  "attempts_count": 0,
  "can_play": true
}
```

### 3. Game Flow

#### Start Game
| FastAPI | Django | Method |
|---------|--------|--------|
| `POST /api/game/start` | `POST /api/game/start/` | POST |

**Request**: `{student_id, display_name}`

**Response**: Giống nhau
```json
{
  "attempt_id": "uuid",
  "session_token": "uuid",
  "round_1_target": "AWS",
  "round_2_target": "GCP",
  "round_1_cards": [...],
  "round_2_cards": [...],
  "bonus_questions": [...],
  "attempts_left": 2
}
```

#### Submit Game
| FastAPI | Django | Method |
|---------|--------|--------|
| `POST /api/game/submit` | `POST /api/game/submit/` | POST |

**Request**: Giống nhau
```json
{
  "attempt_id": "uuid",
  "session_token": "uuid",
  "action_logs": [...],
  "bonus_answers": [...],
  "duration_ms": 45000
}
```

**Response**: Giống nhau
```json
{
  "attempt_id": "uuid",
  "status": "submitted",
  "main_score": 14,
  "bonus_points": 6,
  "total_score": 20,
  "correct": 14,
  "wrong": 1,
  "missed_target": 6,
  "hearts_left": 2,
  "duration_ms": 45000,
  "is_eligible_reward": true,
  "reward_threshold": 12
}
```

#### Get Attempt Details
| FastAPI | Django | Method |
|---------|--------|--------|
| `GET /api/game/attempts/{id}` | `GET /api/game/attempts/{id}/` | GET |

**Response**: Giống nhau

### 4. Leaderboard

| FastAPI | Django | Method | Query Params |
|---------|--------|--------|--------------|
| `GET /api/leaderboard` | `GET /api/leaderboard/` | GET | `?limit=10` |

**Response**: Giống nhau
```json
{
  "event_name": "Match & Catch AWS x Google Cloud Challenge",
  "total_participants": 50,
  "top_entries": [
    {
      "rank": 1,
      "display_name": "Nguyen Van A",
      "total_score": 20,
      "hearts_left": 3,
      "duration_ms": 30000,
      "finished_at": "2026-09-23T13:45:00Z"
    }
  ]
}
```

### 5. Rewards

| FastAPI | Django | Method | Auth |
|---------|--------|--------|------|
| `GET /api/rewards/me` | `GET /api/rewards/me/` | GET | Bearer token hoặc `?session_token=` |

**Response**: Giống nhau

## Authentication

Cả hai đều sử dụng:
- **Bearer Token** trong header: `Authorization: Bearer {session_token}`
- **Query param** (fallback): `?session_token={token}`

## Error Responses

### FastAPI
```json
{
  "detail": "Error message"
}
```

### Django
```json
{
  "detail": "Error message"
}
```

**Giống nhau!** Django REST Framework sử dụng cùng format.

## Status Codes

| Scenario | FastAPI | Django | Code |
|----------|---------|--------|------|
| Success | ✓ | ✓ | 200 |
| Created | ✓ | ✓ | 201 |
| Bad Request | ✓ | ✓ | 400 |
| Unauthorized | ✓ | ✓ | 401 |
| Forbidden | ✓ | ✓ | 403 |
| Not Found | ✓ | ✓ | 404 |

## Migration Checklist

- [x] Models (SQLAlchemy → Django ORM)
- [x] Schemas (Pydantic → DRF Serializers)
- [x] Business Logic (services.py)
- [x] API Routes (FastAPI → Django views)
- [x] CORS Configuration
- [x] Database (SQLite/MySQL support)
- [x] Data files (cards.json, bonus_questions.json)
- [x] Admin interface
- [x] Error handling
- [x] Authentication (Bearer token)

## Frontend Changes Required

**KHÔNG CẦN THAY ĐỔI GÌ!** 

Frontend chỉ cần:
1. Thêm trailing slash `/` vào cuối các API URLs (optional - Django có thể config để tự động redirect)
2. Các request/response format hoàn toàn giống nhau

## Testing Both Versions

### FastAPI
```bash
cd Match-N-Catch/backend
uvicorn app.main:app --reload
```

### Django
```bash
cd mysite
python manage.py runserver
```

Cả hai đều chạy trên `http://localhost:8000`

## Performance Notes

- **FastAPI**: Async, nhanh hơn với concurrent requests
- **Django**: Sync, nhưng đủ nhanh cho game này, có ecosystem lớn hơn

## Additional Features in Django

1. **Admin Interface**: `/admin/` - Quản lý dữ liệu qua GUI
2. **Built-in User Management**: Django auth system
3. **ORM**: Django ORM có nhiều tính năng hơn
4. **Middleware**: Dễ dàng thêm logging, caching, etc.
