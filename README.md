# Match & Catch

Game nhận diện dịch vụ AWS & Google Cloud chạy trên web mobile, dành cho sự kiện CLB.

---

## Mục lục

- [Tổng quan](#tổng-quan)
- [Cấu trúc dự án](#cấu-trúc-dự-án)
- [Yêu cầu môi trường](#yêu-cầu-môi-trường)
- [Cài đặt & Chạy local](#cài-đặt--chạy-local)
- [Biến môi trường](#biến-môi-trường)
- [Database](#database)
- [Deploy lên AWS](#deploy-lên-aws)
- [CI/CD](#cicd)
- [Kiểm thử](#kiểm-thử)

---

## Tổng quan

<!-- TODO: mô tả ngắn về game, luật chơi cơ bản, link QR sự kiện -->

---

## Cấu trúc dự án

```
Match-N-Catch-1/
├── backend/
│   ├── app/
│   │   ├── db/
│   │   │   ├── database.py        # Kết nối MySQL
│   │   │   ├── schema.sql         # Tạo bảng
│   │   │   └── seed.sql           # Dữ liệu event mẫu
│   │   ├── models/
│   │   │   └── model.py           # ORM models
│   │   ├── routes/
│   │   │   └── routes.py          # API endpoints
│   │   ├── service/
│   │   │   └── service.py         # Business logic
│   │   └── main.py                # Entry point FastAPI/Flask
│   ├── data/
│   │   ├── cards.json             # Danh sách thẻ AWS + Google Cloud
│   │   └── bonus_questions.json   # Ngân hàng câu hỏi bonus
│   ├── .env                       # Biến môi trường (không commit)
│   ├── .env.example               # Mẫu biến môi trường
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── public/
│   └── src/
│       ├── pages/                 # Home, Game, Bonus, Result, Admin...
│       ├── components/            # Card, HeartBar, Leaderboard...
│       ├── game/                  # Logic thẻ bay, vòng chơi, streak
│       └── api/                   # Wrapper gọi backend
├── .github/
│   └── workflows/
│       └── deploy.yml             # CI/CD GitHub Actions
├── images_document/               # Hình kiến trúc, tài liệu
└── README.md
```

---

## Yêu cầu môi trường

| Công cụ | Phiên bản tối thiểu |
|---|---|
| Python | 3.11+ |
| Node.js | 18+ |
| MySQL | 8.0+ |
| Docker | 24+ |

---

## Cài đặt & Chạy local

### Backend

```bash
cd backend

# Tạo virtualenv và cài dependencies
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt

# Copy và điền biến môi trường
cp .env.example .env

# Khởi tạo database (chạy lần đầu)
mysql -u <user> -p <db_name> < app/db/schema.sql
mysql -u <user> -p <db_name> < app/db/seed.sql

# Chạy server
# TODO: thêm lệnh chạy (uvicorn app.main:app --reload hoặc flask run)
```

### Frontend

```bash
cd frontend

# Cài dependencies
npm install

# Chạy dev server
npm run dev
```

---

## Biến môi trường

Xem file [`backend/.env.example`](backend/.env.example) để biết danh sách đầy đủ.

| Biến | Mô tả | Ví dụ |
|---|---|---|
| `DB_HOST` | Endpoint RDS | `xxx.rds.amazonaws.com` |
| `DB_PORT` | Cổng MySQL | `3306` |
| `DB_NAME` | Tên database | `match_and_catch` |
| `DB_USER` | Username DB | `admin` |
| `DB_PASSWORD` | Password DB — lưu trong Secrets Manager | — |
| `REWARD_THRESHOLD` | Ngưỡng điểm nhận quà | `12` |
| `EVENT_ID` | UUID sự kiện hiện tại | `a1b2c3d4-...` |
| `ADMIN_USERNAME` | Tài khoản BTC | `btc_admin` |
| `ADMIN_PASSWORD` | Mật khẩu BTC — lưu trong Secrets Manager | — |
| `SECRET_KEY` | Ký session token | random string |
| `CORS_ORIGINS` | Domain frontend | `https://...` |

> **Lưu ý:** `DB_PASSWORD` và `ADMIN_PASSWORD` được lưu trong **AWS Secrets Manager**, không hardcode trong `.env` khi deploy.

---

## Database

Schema gồm 4 bảng: `event`, `player`, `game_attempt`, `reward_claim`.

```bash
# Tạo bảng
mysql -u <user> -p <db_name> < backend/app/db/schema.sql

# Seed event mẫu
mysql -u <user> -p <db_name> < backend/app/db/seed.sql
```

UUID của event mẫu: `a1b2c3d4-e5f6-7890-abcd-ef1234567890` — copy vào `EVENT_ID` trong `.env`.

---

## Deploy lên AWS

Kiến trúc: **S3 StaticWeb** (Frontend) + **ECS Fargate + ALB** trong VPC (Backend) + **RDS MySQL**.

<!-- TODO: điền các bước cụ thể sau khi setup xong infrastructure -->

### Các bước tổng quát

1. **RDS** — Tạo MySQL instance trong private subnet, lưu credentials vào Secrets Manager
2. **ECR** — Tạo repository, build và push Docker image backend
3. **ECS** — Tạo cluster, task definition (lấy image từ ECR), service gắn với ALB
4. **ALB** — Tạo Application Load Balancer trong VPC, target group trỏ vào ECS service
5. **S3** — Enable Static Website Hosting, upload build frontend
6. **IAM** — Tạo role cho ECS task: quyền đọc Secrets Manager, pull ECR, ghi CloudWatch

---

## CI/CD

GitHub Actions tại `.github/workflows/deploy.yml`:

```
Push to main
  └─► Build Docker image
        └─► Push lên Amazon ECR
              └─► Deploy lên Amazon ECS (force new deployment)
```

<!-- TODO: điền ARN ECR repository, ECS cluster name, service name vào workflow -->

**Secrets cần thêm vào GitHub repository:**

| Secret | Mô tả |
|---|---|
| `AWS_ACCESS_KEY_ID` | IAM access key |
| `AWS_SECRET_ACCESS_KEY` | IAM secret key |
| `AWS_REGION` | Region deploy |
| `ECR_REPOSITORY` | Tên ECR repository |
| `ECS_CLUSTER` | Tên ECS cluster |
| `ECS_SERVICE` | Tên ECS service |

---

## Kiểm thử

<!-- TODO: điền lệnh chạy test sau khi setup pytest/postman collection -->

```bash
# Chạy unit test backend
cd backend
pytest tests/

# Chạy integration test (Postman)
# TODO: link collection Postman
```

Bảng kiểm thử đầy đủ (T01–T19) xem tại [PRD](Match_and_Catch_MVP_Revised%20(2).md#9-kiểm-thử-nghiệm-thu).

---

## Thành viên

<!-- TODO: điền tên thành viên và phụ trách -->

| Tên | Phụ trách |
|---|---|
| ... | Database & Migration |
| ... | Player & Auth Service |
| ... | Game Engine & Scoring |
| ... | Leaderboard & Rewards |
| ... | Admin & Reward Management |
| ... | DevOps & Testing |
