# Match N Catch - Full Stack Game

Game đố vui về Cloud Computing (AWS × Google Cloud) với backend Django và frontend vanilla JavaScript.

## 🎮 Tính năng

- 2 vòng chơi × 10 câu hỏi
- 3 mạng cho cả game
- Câu bonus khi đúng 5 câu liên tiếp
- Bảng xếp hạng realtime
- Giới hạn 3 lượt/ngày mỗi MSSV
- Hệ thống rewards tự động

## 🏗️ Architecture

```
┌─────────────────┐         HTTP/JSON         ┌──────────────────┐
│   Frontend      │ ◄────────────────────────► │   Backend        │
│   (Vanilla JS)  │                            │   (Django)       │
│   Port 8080     │                            │   Port 8000      │
└─────────────────┘                            └──────────────────┘
                                                        │
                                                        ▼
                                                ┌──────────────────┐
                                                │   SQLite DB      │
                                                │   - Players      │
                                                │   - Attempts     │
                                                │   - Rewards      │
                                                └──────────────────┘
```

## 📁 Cấu trúc Project

```
Match-N-Catch/
├── frontend/                    # Frontend vanilla JS
│   ├── js/
│   │   ├── data.js             # Cấu hình game
│   │   ├── game.js             # Game engine
│   │   ├── api.js              # API client
│   │   └── game-api-integration.js  # API integration layer
│   ├── css/                    # Styles
│   ├── assets/                 # Images, icons
│   ├── index.html              # Game UI
│   └── test-api.html           # API testing page
│
├── mysite/                     # Django backend
│   ├── game/                   # Game app
│   │   ├── models.py          # Player, GameAttempt, Reward
│   │   ├── views.py           # API endpoints
│   │   └── utils.py           # Business logic
│   ├── mysite/                # Project settings
│   │   ├── settings.py
│   │   └── urls.py
│   ├── manage.py
│   └── db.sqlite3
│
├── SETUP.md                    # Hướng dẫn setup
├── CHECKLIST.md               # Checklist tích hợp
└── test-integration.sh        # Test script
```

## 🚀 Quick Start

### 1. Backend Setup

```bash
cd mysite

# Cài dependencies
pip install django djangorestframework django-cors-headers coreapi

# Migrate database
python manage.py migrate

# Chạy server
python manage.py runserver
```

Backend chạy tại: http://localhost:8000

### 2. Frontend Setup

```bash
cd frontend

# Cài dependencies
npm install

# Chạy dev server
npm run dev
```

Frontend chạy tại: http://localhost:8080

### 3. Test

```bash
# Run test script
bash test-integration.sh

# Hoặc test thủ công
# Open: http://localhost:8080/test-api.html
```

## 🧪 API Endpoints

| Endpoint | Method | Mô tả |
|----------|--------|-------|
| `/api/players/` | POST | Đăng ký player với tên + MSSV |
| `/api/game/start/` | POST | Bắt đầu game mới |
| `/api/game/submit/` | POST | Gửi kết quả game |
| `/api/leaderboard/` | GET | Lấy bảng xếp hạng |
| `/api/rewards/me/` | GET | Kiểm tra lượt chơi còn lại |
| `/health/` | GET | Health check |
| `/docs/` | GET | API documentation |

## 🎯 Game Flow

```
1. User nhập tên + MSSV
        ↓
2. registerPlayer() → Backend trả player_id
        ↓
3. startGame(player_id) → Backend trả attempt_id
        ↓
4. User chơi game (frontend)
        ↓
5. submitGame(attempt_id, score) → Backend lưu kết quả
        ↓
6. getLeaderboard() → Hiển thị bảng xếp hạng
```

## 🔧 Configuration

### Backend (mysite/mysite/settings.py):
```python
# CORS
CORS_ALLOW_ALL_ORIGINS = True  # Development only

# Game config
EVENT_ID = 'event-techfest-2026'
REWARD_THRESHOLD = 12
```

### Frontend (frontend/js/api.js):
```javascript
const API_BASE = 'http://localhost:8000/api';
```

## 📊 Database Models

### Player
- `name`: Tên hiển thị
- `student_id`: MSSV (unique)
- `created_at`: Timestamp

### GameAttempt
- `player`: ForeignKey to Player
- `attempt_id`: UUID unique
- `score`: Điểm số
- `details`: JSON (rounds, bonus, etc)
- `played_at`: Timestamp

### Reward
- `player`: ForeignKey to Player
- `earned_date`: Ngày nhận
- `redeemed`: Đã đổi quà chưa

## 🛠️ Development

### Backend Development:
```bash
cd mysite
python manage.py shell  # Django shell
python manage.py createsuperuser  # Tạo admin
# Admin: http://localhost:8000/admin/
```

### Frontend Development:
- Edit files trong `frontend/js/`
- Refresh browser để xem thay đổi
- Check Console (F12) để debug

## 📝 Logs & Debug

### Backend logs:
- Terminal đang chạy `runserver`
- Django logs mỗi request

### Frontend logs:
- Browser Console (F12)
- Network tab để xem API calls
- Check `currentPlayerId` và `currentAttemptId`

## ⚠️ Troubleshooting

**CORS Error:**
```bash
# Restart Django server
cd mysite && python manage.py runserver
```

**API 404:**
```bash
# Check endpoints
curl http://localhost:8000/api/players/
```

**Frontend không kết nối:**
```bash
# Check API_BASE trong js/api.js
const API_BASE = 'http://localhost:8000/api';
```

## 📦 Dependencies

### Backend:
- Django 5.0
- djangorestframework
- django-cors-headers
- coreapi (cho docs)

### Frontend:
- Vanilla JavaScript (no framework)
- HTML5 Canvas (confetti effect)

## 🚢 Production Deployment

1. Set `DEBUG = False` trong settings.py
2. Configure proper CORS origins
3. Use production database (PostgreSQL)
4. Collect static files: `python manage.py collectstatic`
5. Use gunicorn/uwsgi cho Django
6. Serve frontend qua nginx/apache
7. Update `API_BASE` trong js/api.js

## 📄 Documentation

- [SETUP.md](SETUP.md) - Chi tiết setup
- [CHECKLIST.md](CHECKLIST.md) - Checklist tích hợp
- [frontend/API_INTEGRATION.md](frontend/API_INTEGRATION.md) - API integration
- [frontend/INTEGRATION_SUMMARY.md](frontend/INTEGRATION_SUMMARY.md) - Tổng kết

## 👥 Team

Match N Catch MVP - CLB Cloud SGU

## 📅 Version

Current: v0.4 - Full Stack Integration (2026-09-23)
