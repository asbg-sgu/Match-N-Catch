# Match & Catch - Django Backend

Backend API cho Mobile Web Game Match & Catch (AWS x Google Cloud Challenge) được chuyển đổi từ FastAPI sang Django.

## Cấu trúc dự án

```
mysite/
├── game/                   # App chính cho game
│   ├── models.py          # Database models (Event, Player, GameAttempt, RewardClaim)
│   ├── views.py           # API endpoints
│   ├── serializers.py     # Request/Response serializers
│   ├── services.py        # Business logic
│   ├── urls.py            # URL routing
│   └── admin.py           # Django Admin configuration
├── data/                  # Static data files
│   ├── cards.json         # AWS & GCP service cards
│   └── bonus_questions.json  # Bonus questions with answers
├── mysite/                # Django project settings
│   ├── settings.py
│   └── urls.py
├── manage.py
└── requirements.txt
```

## Cài đặt

### 1. Tạo virtual environment

```bash
cd mysite
python -m venv .venv
.venv\Scripts\activate  # Windows
# source .venv/bin/activate  # Linux/Mac
```

### 2. Cài đặt dependencies

```bash
pip install -r requirements.txt
```

### 3. Cấu hình môi trường

Copy `.env.example` thành `.env` và chỉnh sửa nếu cần:

```bash
cp .env.example .env
```

### 4. Chạy migrations

```bash
python manage.py makemigrations
python manage.py migrate
```

### 5. Tạo superuser (optional)

```bash
python manage.py createsuperuser
```

### 6. Khởi động server

```bash
python manage.py runserver
```

Server sẽ chạy tại: http://127.0.0.1:8000/

## API Endpoints

### Health Check
- `GET /` - Root endpoint, trả về thông tin API
- `GET /health/` - Health check endpoint

### Player Management
- `POST /api/players/` - Đăng ký hoặc lấy thông tin người chơi

### Game Flow
- `POST /api/game/start/` - Bắt đầu lượt chơi mới
- `POST /api/game/submit/` - Nộp kết quả lượt chơi
- `GET /api/game/attempts/{attempt_id}/` - Lấy chi tiết lượt chơi

### Leaderboard & Rewards
- `GET /api/leaderboard/` - Lấy bảng xếp hạng Top 10
- `GET /api/rewards/me/` - Lấy trạng thái quà của người chơi

## Admin Interface

Truy cập Django Admin tại: http://127.0.0.1:8000/admin/

Quản lý:
- Events (Sự kiện)
- Players (Người chơi)
- Game Attempts (Lượt chơi)
- Reward Claims (Phần quà)

## Cấu hình Database

### SQLite (Development - Mặc định)
Tự động sử dụng SQLite, không cần cấu hình gì thêm.

### MySQL (Production)
Thêm vào `.env`:

```env
DB_HOST=your-rds-endpoint.rds.amazonaws.com
DB_PORT=3306
DB_NAME=match_and_catch
DB_USER=admin
DB_PASSWORD=your-password
```

Hoặc dùng DATABASE_URL:

```env
DATABASE_URL=mysql://user:password@host:port/dbname
```

Cài PyMySQL:
```bash
pip install pymysql
```

## Khác biệt với FastAPI version

1. **Framework**: Django REST Framework thay vì FastAPI
2. **ORM**: Django ORM thay vì SQLAlchemy
3. **Validation**: DRF Serializers thay vì Pydantic
4. **Async**: Django views (sync) thay vì async FastAPI
5. **Admin**: Django Admin có sẵn để quản lý dữ liệu

## Game Rules

- Mỗi người chơi có tối đa 3 lượt chơi
- Mỗi lượt có 2 vòng: 20 thẻ/vòng
  - Vòng 1: Click vào thẻ AWS (14 target + 6 distractor GCP)
  - Vòng 2: Click vào thẻ GCP (6 target + 14 distractor AWS)
- Click sai distractor mất 1 tim (tối đa 3 tim)
- Bonus trigger sau mỗi 5 thẻ đúng liên tiếp
- Điểm ngưỡng nhận quà: 12 điểm

## Testing

```bash
# Run tests (nếu có)
python manage.py test

# Check code
python manage.py check
```

## Deployment

### Heroku
```bash
heroku create your-app-name
git push heroku main
heroku run python manage.py migrate
```

### AWS Elastic Beanstalk
```bash
eb init
eb create match-and-catch-env
eb deploy
```

## License

MIT License
