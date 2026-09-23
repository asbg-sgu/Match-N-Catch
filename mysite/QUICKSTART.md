# Hướng dẫn Chạy Backend Django

## Bước 1: Cài đặt Dependencies

```bash
cd mysite
python -m venv .venv

# Windows
.venv\Scripts\activate

# Linux/Mac
source .venv/bin/activate

pip install -r requirements.txt
```

## Bước 2: Chạy Database Migrations

```bash
python manage.py makemigrations
python manage.py migrate
```

Kết quả mong đợi:
```
Operations to perform:
  Apply all migrations: admin, auth, contenttypes, game, sessions
Running migrations:
  Applying contenttypes.0001_initial... OK
  Applying auth.0001_initial... OK
  Applying admin.0001_initial... OK
  Applying game.0001_initial... OK
  ...
```

## Bước 3: Khởi tạo Sự kiện Mặc định

```bash
python manage.py init_event
```

Kết quả:
```
Successfully initialized event: Match & Catch AWS x Google Cloud Challenge (ID: event-techfest-2026)
```

## Bước 4: (Optional) Tạo Admin User

```bash
python manage.py createsuperuser
```

Nhập thông tin:
- Username: admin
- Email: admin@example.com
- Password: ******** (nhập 2 lần)

## Bước 5: Chạy Development Server

```bash
python manage.py runserver
```

Server sẽ chạy tại: **http://127.0.0.1:8000/**

## Test API Endpoints

### 1. Health Check
```bash
curl http://127.0.0.1:8000/health/
```

Response:
```json
{"status": "ok"}
```

### 2. Root Endpoint
```bash
curl http://127.0.0.1:8000/
```

Response:
```json
{
  "app": "Match & Catch API",
  "version": "1.0.0",
  "status": "online",
  "docs_url": "/api/docs/"
}
```

### 3. Register Player
```bash
curl -X POST http://127.0.0.1:8000/api/players/ \
  -H "Content-Type: application/json" \
  -d "{\"student_id\":\"SV001\",\"display_name\":\"Nguyen Van A\"}"
```

Response:
```json
{
  "id": "uuid-here",
  "student_id": "SV001",
  "display_name": "Nguyen Van A",
  "attempts_count": 0,
  "can_play": true
}
```

### 4. Start Game
```bash
curl -X POST http://127.0.0.1:8000/api/game/start/ \
  -H "Content-Type: application/json" \
  -d "{\"student_id\":\"SV001\",\"display_name\":\"Nguyen Van A\"}"
```

Response sẽ chứa:
- `attempt_id`
- `session_token`
- `round_1_cards` (20 thẻ)
- `round_2_cards` (20 thẻ)
- `bonus_questions` (2 câu)

### 5. Get Leaderboard
```bash
curl http://127.0.0.1:8000/api/leaderboard/
```

## Truy cập Django Admin

URL: **http://127.0.0.1:8000/admin/**

Đăng nhập bằng superuser đã tạo ở Bước 4.

Quản lý:
- Events
- Players
- Game Attempts
- Reward Claims

## Cấu hình Database (Production)

### Sử dụng MySQL

1. Cài PyMySQL:
```bash
pip install pymysql
```

2. Tạo file `.env`:
```env
DB_HOST=your-database-host
DB_PORT=3306
DB_NAME=match_and_catch
DB_USER=your-username
DB_PASSWORD=your-password
```

3. Chạy migrations:
```bash
python manage.py migrate
```

## Troubleshooting

### Lỗi: "No module named 'rest_framework'"
```bash
pip install djangorestframework
```

### Lỗi: "No module named 'corsheaders'"
```bash
pip install django-cors-headers
```

### Lỗi: "Table doesn't exist"
```bash
python manage.py makemigrations
python manage.py migrate
```

### Lỗi: "cards.json not found"
Đảm bảo thư mục `data/` tồn tại và chứa:
- `cards.json`
- `bonus_questions.json`

## Production Deployment

### Heroku
```bash
# Install Heroku CLI
heroku login
heroku create match-and-catch-api
heroku addons:create heroku-postgresql:hobby-dev

# Deploy
git push heroku main
heroku run python manage.py migrate
heroku run python manage.py init_event
heroku run python manage.py createsuperuser
```

### AWS Elastic Beanstalk
```bash
# Install EB CLI
pip install awsebcli

# Initialize
eb init -p python-3.11 match-and-catch-api
eb create match-and-catch-env

# Deploy
eb deploy
```

### Railway
```bash
# Install Railway CLI
npm i -g @railway/cli

# Initialize
railway init
railway up
```

## Testing

```bash
# Run all tests
python manage.py test

# Run specific test
python manage.py test game.tests.PlayerTestCase

# With coverage
pip install coverage
coverage run --source='.' manage.py test
coverage report
```

## Useful Commands

```bash
# Make migrations
python manage.py makemigrations

# Apply migrations
python manage.py migrate

# Create superuser
python manage.py createsuperuser

# Collect static files
python manage.py collectstatic

# Run tests
python manage.py test

# Shell
python manage.py shell

# Database shell
python manage.py dbshell

# Check for issues
python manage.py check

# Initialize event
python manage.py init_event
```

## Performance Tips

### 1. Enable caching
```python
# settings.py
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.redis.RedisCache',
        'LOCATION': 'redis://127.0.0.1:6379/1',
    }
}
```

### 2. Database optimization
```python
# Use select_related for ForeignKey
GameAttempt.objects.select_related('player', 'event')

# Use prefetch_related for reverse ForeignKey
Player.objects.prefetch_related('attempts')
```

### 3. Use Gunicorn (Production)
```bash
pip install gunicorn
gunicorn mysite.wsgi:application --bind 0.0.0.0:8000
```

## Environment Variables

```env
# Django
SECRET_KEY=your-secret-key
DEBUG=False
ALLOWED_HOSTS=yourdomain.com,www.yourdomain.com

# Database
DATABASE_URL=mysql://user:pass@host:port/dbname

# Game
EVENT_ID=event-techfest-2026
EVENT_NAME=Match & Catch AWS x Google Cloud Challenge
REWARD_THRESHOLD=12

# CORS
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

## Next Steps

1. ✅ Chạy migrations
2. ✅ Test tất cả API endpoints
3. ✅ Tạo superuser và test Admin
4. ✅ Cấu hình database production
5. ✅ Deploy lên server
6. ✅ Update frontend để trỏ đến Django backend
7. ✅ Monitor và optimize performance

---

**Backend Django đã sẵn sàng hoạt động!** 🚀
