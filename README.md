# Match & Catch - Bắt Mây

Game quiz tương tác về AWS và Google Cloud Platform với backend Django REST API.

## Tính năng

✅ **Backend Django REST API**
- Quản lý người chơi và lượt chơi
- Xác thực session token
- Server-side scoring
- Bảng xếp hạng real-time
- Quản lý phần thưởng

✅ **Frontend thuần HTML/JS/CSS**
- Game engine với animation mượt mà
- Hybrid mode: API + localStorage fallback
- Responsive design
- Offline-first architecture

✅ **Game Logic**
- 2 vòng × 10 câu hỏi
- 3 mạng cho cả game
- Câu bonus (chọn nhiều đáp án)
- Tăng tốc độ theo progression
- Streak bonus system

## Quick Start

### 1. Chạy Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate  # Linux/Mac
pip install django djangorestframework django-cors-headers
python manage.py migrate
python manage.py init_event
python manage.py runserver
```

Backend chạy tại: http://localhost:8000

### 2. Chạy Frontend

```bash
cd frontend
python -m http.server 8080
```

Mở browser: http://localhost:8080

## Kiến trúc

```
┌─────────────────┐
│   Frontend      │
│  (HTML/JS/CSS)  │
└────────┬────────┘
         │
    ┌────┴─────┐
    │ Connector│  ← Hybrid: API + localStorage
    │  Layer   │
    └────┬─────┘
         │
         ├─────────────┐
         │             │
    ┌────▼────┐   ┌───▼──────┐
    │   API   │   │localStorage│
    │ Backend │   │  Fallback  │
    └─────────┘   └────────────┘
```

## API Integration

### Mode hoạt động

**Hybrid Mode (mặc định):**
- Ưu tiên backend API
- Auto fallback localStorage khi offline
- Tốt nhất cho development

**API-only Mode:**
```javascript
GameConnector.setMode('api-only');
```

**Offline Mode:**
```javascript
GameConnector.setMode('offline');
```

### Cấu hình API endpoint

```html
<script>
  window.API_BASE_URL = 'https://your-api.com';
</script>
```

## File structure

```
Match-N-Catch/
├── backend/
│   ├── game/                  # Django app
│   │   ├── models.py         # Database models
│   │   ├── serializers.py    # API serializers
│   │   ├── services.py       # Business logic
│   │   ├── views.py          # API endpoints
│   │   └── urls.py           # URL routing
│   ├── mysite/               # Django project
│   │   └── settings.py       # Configuration
│   └── manage.py
│
├── frontend/
│   ├── index.html
│   ├── js/
│   │   ├── backend-api.js         # API client
│   │   ├── game-api-connector.js  # Connector layer
│   │   ├── data.js                # Game schema
│   │   └── game.js                # Game engine
│   ├── css/
│   └── assets/
│
├── SETUP.md              # Chi tiết setup
└── README.md             # File này
```

## API Endpoints

| Endpoint | Method | Mô tả |
|----------|--------|-------|
| `/api/players/` | POST | Đăng ký/lấy thông tin player |
| `/api/game/start/` | POST | Bắt đầu game mới |
| `/api/game/submit/` | POST | Submit kết quả |
| `/api/game/attempts/<id>/` | GET | Chi tiết lượt chơi |
| `/api/leaderboard/` | GET | Bảng xếp hạng |
| `/api/rewards/me/` | GET | Thông tin phần thưởng |
| `/health/` | GET | Health check |

## Luật chơi

- **2 vòng**, mỗi vòng 10 câu hỏi
- **3 mạng** cho cả game
- **5 giây** mỗi câu, tăng tốc độ theo progression
- **Streak bonus**: 5 đúng liên tiếp = 1 câu bonus (tối đa 2)
- **Điểm**: 20 điểm chính + 6 điểm bonus = tối đa 26 điểm
- **Quà**: Cần ≥ 12 điểm chính

## Development

### Test API

```bash
# Health check
curl http://localhost:8000/health/

# Start game
curl -X POST http://localhost:8000/api/game/start/ \
  -H "Content-Type: application/json" \
  -d '{"student_id":"2212345","display_name":"Test User"}'
```

### Debug frontend

```javascript
// Browser console
GameConnector.getMode();              // Kiểm tra mode
BackendAPI.healthCheck();             // Test API
BackendAPI.getSessionToken();         // Xem session
localStorage.clear();                 // Reset data
```

### Database reset

```bash
cd backend
rm db.sqlite3
python manage.py migrate
python manage.py init_event
```

## Production

### Backend

```bash
pip install gunicorn
gunicorn mysite.wsgi:application --bind 0.0.0.0:8000
```

Cập nhật `settings.py`:
```python
DEBUG = False
ALLOWED_HOSTS = ['your-domain.com']
CORS_ALLOWED_ORIGINS = ['https://your-frontend.com']
```

### Frontend

Deploy static files lên CDN/hosting và cập nhật API endpoint:
```javascript
window.API_BASE_URL = 'https://api.your-domain.com';
```

## Tech Stack

**Backend:**
- Django 5.0+
- Django REST Framework
- SQLite (dev) / PostgreSQL (prod)

**Frontend:**
- Vanilla JavaScript (ES6+)
- CSS3 with animations
- No framework dependencies

## License

MIT License - Dự án giáo dục cho sự kiện CLB Cloud

## Credits

- Game design: Match & Catch MVP
- Backend API: Django REST Framework
- Frontend: Vanilla JS
