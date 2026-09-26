# Báo Cáo Ngữ Cảnh: Giai Đoạn 1 — Core Backend & Dữ Liệu

> **Dự án:** Match & Catch (AWS x Google Cloud Challenge)  
> **Thời điểm hoàn thành:** 22/09/2026  
> **Người thực hiện:** Antigravity AI Assistant  
> **Mục đích:** Tài liệu lưu trữ ngữ cảnh kỹ thuật, kiến trúc và dữ liệu đã xây dựng trong Giai đoạn 1 để phục vụ cho việc tiếp tục phát triển Giai đoạn 2 (Frontend) và Giai đoạn 3 (Admin Portal).

---

## 1. Bối Cảnh & Mục Tiêu Dự Án

* **Loại ứng dụng:** Mobile Web Game (tối ưu màn hình cảm ứng di động, người chơi truy cập trực tiếp qua mã QR tại booth sự kiện).
* **Mục tiêu giáo dục & giải trí:**
  * Giúp sinh viên nhận diện các dịch vụ Cloud của **AWS** và **Google Cloud (GCP)** qua cơ chế thẻ bay tương tác nhanh.
  * Củng cố kiến thức qua các câu hỏi trắc nghiệm ngắn (Bonus Question) về dịch vụ AWS.
* **Luật chơi chính:**
  * **2 Vòng chơi:**
    * Vòng 1: AWS là mục tiêu (14 thẻ AWS mục tiêu + 6 thẻ GCP nhiễu = 20 thẻ).
    * Vòng 2: GCP là mục tiêu (6 thẻ GCP mục tiêu + 14 thẻ AWS nhiễu = 20 thẻ).
  * **Mạng sống & Điểm:** Bắt đầu với 3 tim. Click đúng mục tiêu +1 điểm; click thẻ nhiễu bị trừ 1 tim (hết 3 tim = Game Over); bỏ lỡ thẻ mục tiêu không bị trừ mạng nhưng reset streak.
  * **Bonus Question:** Khi đạt chuỗi 5 đúng liên tiếp (streak bonus), game tạm dừng và mở câu hỏi bonus trắc nghiệm. Trả lời đúng trọn vẹn được +3 điểm (tối đa 2 lần/lượt, streak tính cộng dồn xuyên vòng).
  * **Giới hạn lượt chơi:** Mỗi MSSV được chơi tối đa **3 lượt** (không tính lượt `abandoned`).
  * **Trao quà:** Điểm cao nhất ≥ 12 điểm (`REWARD_THRESHOLD`) sẽ đủ điều kiện nhận quà đạt ngưỡng. Top 3 nhận giải chung cuộc khi đóng sự kiện.

---

## 2. Các Thành Phần Kỹ Thuật Đã Triển Khai Trong Giai Đoạn 1

### 2.1. Dữ liệu tĩnh (Data Layer)
Toàn bộ dữ liệu được quản lý tập trung trong thư mục `backend/data/`:

1. **`backend/data/cards.json` & `card.json`:**
   * Danh mục gồm **28 thẻ dịch vụ** (14 AWS và 14 GCP).
   * Đã kiểm tra thực tế: **Toàn bộ 28 đường dẫn SVG đều tồn tại trên đĩa** trong thư mục `frontend/src/assets`.
   * **14 dịch vụ AWS:** Amazon EC2, AWS Lambda, Amazon S3, Amazon RDS, Amazon DynamoDB, Amazon CloudWatch, Amazon VPC, Amazon CloudFront, Amazon Route 53, Amazon ECS, AWS IAM, Amazon SNS, Amazon SQS, Amazon SageMaker.
   * **14 dịch vụ GCP:** Compute Engine, Cloud Storage, BigQuery, Cloud Functions, Google Kubernetes Engine (GKE), Vertex AI, Cloud Pub/Sub, Cloud Run, Cloud SQL, Cloud Spanner, Firestore, Dataflow, Dataproc, Cloud Build.
2. **`backend/data/bonus_questions.json`:**
   * Ngân hàng **8 câu hỏi trắc nghiệm kiến thức dịch vụ AWS** chọn nhiều đáp án.
   * Chứa danh sách đáp án đúng (`correct_indices`) và lời giải thích (`explanation`). Đáp án đúng được bảo mật hoàn toàn ở backend, client không bao giờ nhận được trường này.

---

### 2.2. Cơ sở dữ liệu & Cấu hình môi trường

1. **`backend/app/config.py`:**
   * Sử dụng `pydantic-settings` v2 để nạp cấu hình từ `backend/.env`.
   * **Chế độ linh hoạt:** Tự động fallback sử dụng **SQLite** (`sqlite:///./match_and_catch.db`) khi chạy local dev, và tự động chuyển sang **MySQL RDS** (`pymysql`) khi triển khai thực tế có cấu hình `DB_HOST` và `DB_USER`.
   * Cấu hình CORS mở (`allow_origins=["*"]`) cho phép kết nối từ Vite dev server hay CloudFront.
2. **`backend/app/db/database.py`:**
   * Khởi tạo SQLAlchemy `engine`, `SessionLocal`, `Base` và dependency `get_db()`.
3. **`backend/app/models/model.py` (SQLAlchemy ORM):**
   * **`Event`:** Quản lý sự kiện (`id`, `name`, `status`, `reward_threshold`, `created_at`, `closed_at`).
   * **`Player`:** Thông tin người chơi (`id`, `event_id`, `student_id`, `display_name`, `created_at`). Khóa duy nhất: `(event_id, student_id)`.
   * **`GameAttempt`:** Lưu trữ từng lượt chơi (`id`, `event_id`, `player_id`, `status`, `session_token`, `main_score`, `bonus_points`, `total_score`, `correct`, `wrong`, `missed_target`, `hearts_left`, `duration_ms`, `bonus_question_1_id`, `bonus_question_2_id`, `bonus_1_triggered`, `bonus_2_triggered`, `bonus_1_correct`, `bonus_2_correct`, `started_at`, `finished_at`).
   * **`RewardClaim`:** Trạng thái quà tặng (`id`, `event_id`, `player_id`, `qualifying_attempt_id`, `reward_type`, `status`, `claimed_by`, `claimed_at`, `created_at`). Khóa duy nhất: `(event_id, player_id, reward_type)`.

---

### 2.3. Pydantic Schemas (`backend/app/db/schemas.py`)
* `PlayerRegisterRequest`, `PlayerResponse`: Đăng ký/tra cứu người chơi.
* `CardInGame`: Cấu trúc thẻ bay trả về client (kèm `instance_id`, hướng bay ngẫu nhiên `left-to-right` / `right-to-left`, tốc độ `speed_seconds: 3.0`).
* `BonusQuestionClient`: Câu hỏi bonus gửi về client (chỉ gồm `id`, `service_name`, `question`, `options`, **không gửi** `correct_indices`).
* `GameStartResponse`: Cung cấp `attempt_id`, `session_token`, 20 thẻ Vòng 1, 20 thẻ Vòng 2, 2 câu bonus và số lượt còn lại.
* `GameSubmitRequest`: Nhận `attempt_id`, `action_logs`, `bonus_answers`, `duration_ms`.
* `GameSubmitResponse`: Kết quả tính toán server-side chính thức và trạng thái đủ điều kiện nhận quà (`is_eligible_reward`).
* `LeaderboardResponse`: Top 10 kèm `rank`, `display_name`, `total_score`, `hearts_left`, `duration_ms`, `finished_at` (ẩn MSSV).
* `RewardMeResponse`: Thông tin nhận quà của người chơi hiện tại.

---

### 2.4. Core Business Logic (`backend/app/service/service.py`)

* **`start_game_attempt()`:**
  * Kiểm tra số lượt đã chơi của sinh viên (`attempts_count < 3`). Nếu đã đủ 3 lượt, trả lỗi `403`.
  * Nếu có lượt chơi trước đó chưa hoàn thành (`in_progress` / `created`), tự động chuyển sang `abandoned`.
  * Sinh ngẫu nhiên bộ 40 thẻ:
    * Vòng 1: 14 thẻ AWS mục tiêu + 6 thẻ GCP ngẫu nhiên (nhiễu).
    * Vòng 2: 6 thẻ GCP mục tiêu + 14 thẻ AWS ngẫu nhiên (nhiễu).
  * Mỗi thẻ được gắn một `instance_id` UUID độc nhất và hướng bay ngẫu nhiên.
  * Chọn ngẫu nhiên 2 câu bonus khác nhau từ ngân hàng câu hỏi.
* **`validate_and_score_attempt()`:**
  * **Idempotent:** Nếu `attempt.status == 'submitted'`, trả về ngay kết quả cũ mà không tính lại.
  * Tính điểm dựa trên nhật ký `action_logs` của client:
    * Bấm đúng thẻ mục tiêu: `correct += 1`, `main_score += 1`, `streak_bonus += 1`.
    * Bấm thẻ nhiễu: `wrong += 1`, `streak_bonus = 0`.
    * Bỏ lỡ thẻ mục tiêu: `missed_target += 1`, `streak_bonus = 0` (không trừ mạng).
    * Bỏ lỡ thẻ nhiễu: Bỏ qua an toàn.
  * **Cơ chế Bonus:** Khi `streak_bonus >= 5`, kích hoạt câu hỏi bonus (lần 1 hoặc lần 2). Sau khi kích hoạt, `streak_bonus` reset về 0.
  * **Chấm điểm Bonus:** So khớp tập `selected_indices` của client với `correct_indices` gốc trên server. Phải chọn chính xác và đầy đủ mới được `+3 điểm`.
  * **Tính mạng:** `hearts_left = max(0, 3 - wrong)`. Khi `wrong >= 3`, dừng tính các thao tác tiếp theo.
  * **Xác nhận điều kiện nhận quà:** Nếu `total_score >= 12`, tự động tạo bản ghi `RewardClaim` với `status = 'eligible'`.
* **`get_leaderboard()`:**
  * Lấy tất cả lượt chơi đã nộp. Với mỗi sinh viên, chỉ chọn ra **duy nhất 1 lượt chơi tốt nhất**.
  * Thuật toán xếp hạng Tie-Break:
    1. `total_score` giảm dần.
    2. `hearts_left` giảm dần.
    3. `duration_ms` tăng dần (chơi nhanh hơn xếp trên).
    4. `finished_at` tăng dần (hoàn thành trước xếp trên).
  * Lấy Top 10, **tuyệt đối không bao gồm `student_id`** để bảo mật thông tin cá nhân.

---

### 2.5. API Endpoints (`backend/app/routes/routes.py`)

| Method | Endpoint | Mô tả | Xác thực |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/players` | Đăng ký hoặc tra cứu người chơi theo MSSV | Không |
| `POST` | `/api/game/start` | Bắt đầu lượt chơi mới (trả token + bộ thẻ xáo trộn) | Không |
| `POST` | `/api/game/submit` | Nộp nhật ký thao tác và nhận kết quả chấm điểm | `session_token` (Bearer hoặc Body) |
| `GET` | `/api/game/attempts/{id}` | Xem chi tiết kết quả lượt chơi | `session_token` |
| `GET` | `/api/leaderboard` | Lấy danh sách Top 10 công khai (ẩn MSSV) | Không |
| `GET` | `/api/rewards/me` | Lấy thông tin điều kiện nhận quà của người chơi | `session_token` |
| `GET` | `/health` & `/` | Health check hệ thống | Không |

---

## 3. Kết Quả Kiểm Thử (Verification Suite)

Bộ kiểm thử tự động tại [backend/tests/test_game_flow.py](file:///Users/nguyenvominhhieu/Downloads/Match-N-Catch/backend/tests/test_game_flow.py) gồm 7 test cases độc lập:

```text
tests/test_game_flow.py::test_health PASSED                     [ 14%]
tests/test_game_flow.py::test_register_and_start_game PASSED    [ 28%]
tests/test_game_flow.py::test_game_scoring_and_idempotence PASSED [ 42%]
tests/test_game_flow.py::test_three_attempts_limit PASSED       [ 57%]
tests/test_game_flow.py::test_leaderboard_privacy PASSED        [ 71%]
tests/test_game_flow.py::test_bonus_scoring_and_rewards PASSED  [ 85%]
tests/test_game_flow.py::test_hearts_depletion PASSED           [100%]

======================== 7 passed in 0.41s =========================
```

---

## 4. Hướng Dẫn Vận Hành & Lưu Ý Quan Trọng

### 4.1. Cách chạy máy chủ Backend
> [!IMPORTANT]
> **Lưu ý về thư mục làm việc (Working Directory):**
> Module `app` nằm bên trong thư mục `backend/`. Do đó, khi chạy lệnh `uvicorn`, bạn **bắt buộc phải `cd backend`** trước:
>
> ```bash
> cd backend
> source venv/bin/activate
> uvicorn app.main:app --reload --port 8000
> ```
> *(Nếu chạy `uvicorn app.main:app` từ thư mục gốc bên ngoài sẽ gặp lỗi `ModuleNotFoundError: No module named 'app'`)*.

### 4.2. Truy cập tài liệu tương tác Swagger
Khi server đang chạy tại cổng `8000`, truy cập:
* **`http://127.0.0.1:8000/docs`** (Swagger UI tương tác)
* **`http://127.0.0.1:8000/redoc`** (ReDoc tài liệu thay thế)

---

## 5. Định Hướng Các Bước Tiếp Theo

1. **Giai đoạn 2: Xây dựng Frontend Mobile Game (React + Vite)**
   * Dựng khung UI chuẩn kích thước mobile (375px - 430px).
   * Tạo component thẻ bay (CSS Keyframe animation mượt mà ~3s).
   * Quản lý state màn chơi: máu (3 tim), điểm số, combo streak, tiến trình 2 vòng.
   * Modal câu hỏi Bonus khi streak đạt 5.
   * Màn hình Result và bảng xếp hạng Top 10 tích hợp API `/api/leaderboard`.
2. **Giai đoạn 3: Ban Tổ Chức (Admin Portal)**
   * Bổ sung API admin: `/api/admin/login`, `/api/admin/players?student_id=...`, `/api/admin/reward-claims/{id}/claim`, `/api/admin/event/close`.
   * Giao diện tra cứu MSSV và nút bấm xác nhận quà có khóa chống trao trùng lặp.
