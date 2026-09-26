# Match & Catch - Hướng dẫn Setup và Chạy

## Tổng quan
Game "Bắt Mây" với backend Django REST API và frontend thuần HTML/JS/CSS.

## Cấu trúc dự án
```
Match-N-Catch/
├── backend/           # Django REST API
│   ├── game/         # Game app
│   ├── mysite/       # Django settings
│   └── manage.py
├── frontend/         # Frontend web
│   ├── index.html
│   ├── js/
│   │   ├── backend-api.js         # API client
│   │   ├── game-api-connector.js  # Connector (API + localStorage)
│   │   ├── data.js                # Game data & schema
│   │   └── game.js                # Game engine
│   ├── css/
│   └── assets/
└── SETUP.md
```

## Yêu cầu hệ thống

### Backend
- Python 3.8+
- pip
- virtualenv (khuyến nghị)

### Frontend
- Web browser hiện đại (Chrome, Firefox, Safari, Edge)
- HTTP server để serve static files (hoặc mở trực tiếp file://)

---

## Backend Setup

### 1. Cài đặt dependencies

```bash
cd backend

# Tạo virtual environment (khuyến nghị)
python -m venv venv

# Kích hoạt venv
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# Cài đặt packages
pip install django djangorestframework django-cors-headers
```

### 2. Khởi tạo database

```bash
# Chạy migrations
python manage.py migrate

# Khởi tạo sự kiện mặc định
python manage.py init_event
```

### 3. Chạy development server

```bash
python manage.py runserver
```

Backend sẽ chạy tại: `http://localhost:8000`

### 4. Test API

Kiểm tra health check:
```bash
curl http://localhost:8000/health/
```

Expected response: `{"status": "ok"}`

---

## Frontend Setup

### Cách 1: Dùng Python HTTP Server (Khuyến nghị)

```bash
cd frontend
python -m http.server 8080
```

Mở browser: `http://localhost:8080`

### Cách 2: Dùng Live Server (VS Code)

1. Cài extension "Live Server" trong VS Code
2. Click chuột phải vào `index.html` → "Open with Live Server"

### Cách 3: Mở trực tiếp (File Protocol)

Mở `frontend/index.html` trực tiếp trong browser. 

**Lưu ý:** API sẽ không hoạt động do CORS policy, game sẽ tự động fallback về localStorage mode.

---

## Cấu hình API Endpoint

### Development (mặc định)

Frontend tự động kết nối `http://localhost:8000`

### Custom endpoint

Thêm script tag trước khi load game:

```html
<script>
  window.API_BASE_URL = 'http://your-api-server.com';
</script>
<script src="js/backend-api.js"></script>
```

---

## Modes hoạt động

Frontend hỗ trợ 3 modes:

### 1. Hybrid Mode (mặc định)
- Ưu tiên dùng API
- Tự động fallback localStorage khi API offline
- Tốt nhất cho development

### 2. API-only Mode
- Chỉ dùng API
- Báo lỗi nếu API không khả dụng
- Dùng cho production

### 3. Offline Mode
- Chỉ dùng localStorage
- Không cần backend
- Dùng cho demo hoặc khi backend chưa sẵn sàng

Để đổi mode, mở console và gọi:
```javascript
GameConnector.setMode('api-only');  // hoặc 'hybrid' hoặc 'offline'
```

---

## API Endpoints

### Player
- `POST /api/players/` - Đăng ký/lấy thông tin player

### Game
- `POST /api/game/start/` - Bắt đầu game mới
- `POST /api/game/submit/` - Submit kết quả
- `GET /api/game/attempts/<id>/` - Chi tiết lượt chơi

### Leaderboard
- `GET /api/leaderboard/?limit=10` - Bảng xếp hạng

### Rewards
- `GET /api/rewards/me/` - Thông tin phần thưởng

### Health
- `GET /health/` - Kiểm tra server

---

## Troubleshooting

### Backend không chạy được

**Lỗi:** `django.core.exceptions.ImproperlyConfigured`

Kiểm tra:
1. Đã cài đủ dependencies chưa: `pip list`
2. Virtual environment đã activate chưa
3. Database đã migrate chưa: `python manage.py migrate`

### Frontend không kết nối được API

**Triệu chứng:** Console log `[API] Backend không khả dụng`

Kiểm tra:
1. Backend có đang chạy không: `curl http://localhost:8000/health/`
2. CORS có được cấu hình đúng không (xem settings.py)
3. Firewall/antivirus có block port 8000 không

**Giải pháp tạm thời:** Game vẫn chơi được với localStorage

### Game không lưu được kết quả

**Triệu chứng:** Console log `[Game] Server submit failed`

Kiểm tra:
1. Session token có hợp lệ không
2. Backend logs: `python manage.py runserver` (xem error)
3. Network tab trong DevTools xem request có gửi đi không

### CORS Error

**Lỗi:** `Access to fetch at 'http://localhost:8000' from origin 'http://localhost:8080' has been blocked by CORS`

Kiểm tra `backend/mysite/settings.py`:
```python
INSTALLED_APPS = [
    'corsheaders',  # Phải có
    ...
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',  # Phải có và đặt đầu
    ...
]

CORS_ALLOWED_ORIGINS = [
    'http://localhost:8080',  # Thêm origin frontend
]
```

---

## Production Deployment

### Backend

1. **Cấu hình settings.py:**
```python
DEBUG = False
ALLOWED_HOSTS = ['your-domain.com']
CORS_ALLOWED_ORIGINS = ['https://your-frontend-domain.com']
```

2. **Dùng production server:**
```bash
pip install gunicorn
gunicorn mysite.wsgi:application --bind 0.0.0.0:8000
```

3. **Setup database production** (PostgreSQL khuyến nghị)

### Frontend

1. **Update API endpoint:**
```html
<script>
  window.API_BASE_URL = 'https://api.your-domain.com';
</script>
```

2. **Deploy static files** lên CDN hoặc static hosting (Netlify, Vercel, CloudFront, etc.)

3. **Đổi mode thành api-only** (optional):
```javascript
// Thêm vào game.js hoặc trong <script> tag
GameConnector.setMode('api-only');
```

---

## Testing

### Test API với curl

```bash
# Health check
curl http://localhost:8000/health/

# Đăng ký player
curl -X POST http://localhost:8000/api/players/ \
  -H "Content-Type: application/json" \
  -d '{"student_id":"2212345","display_name":"Test User"}'

# Start game
curl -X POST http://localhost:8000/api/game/start/ \
  -H "Content-Type: application/json" \
  -d '{"student_id":"2212345","display_name":"Test User"}'

# Leaderboard
curl http://localhost:8000/api/leaderboard/?limit=5
```

### Test frontend

Mở browser console (F12) và gõ:

```javascript
// Kiểm tra mode
GameConnector.getMode();

// Test API health
await BackendAPI.healthCheck();

// Test đăng ký player
await BackendAPI.registerPlayer('2212345', 'Test User');

// Xem session hiện tại
BackendAPI.getSessionToken();
```

---

## Database Schema

### Events
- Sự kiện game (TechFest 2026, etc.)

### Players
- Người chơi trong sự kiện (unique per student_id)

### GameAttempts
- Lượt chơi của player (tối đa 3 lượt)
- Lưu điểm số, action logs, session token

### RewardClaims
- Phần thưởng của player (threshold, top3)

---

## Development Tips

### Debug mode

Bật debug log:
```javascript
// Trong console
localStorage.setItem('debug', 'true');
```

### Reset localStorage

```javascript
localStorage.clear();
location.reload();
```

### Force API mode

```javascript
GameConnector.setMode('api-only');
location.reload();
```

---

## Support

- Issues: Tạo issue trong repository
- Docs: Xem `History/01_Core_Backend_and_Data.md` cho chi tiết API
