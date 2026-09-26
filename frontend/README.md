# BẮT MÂY — Flying Cloud Quiz (Match & Catch MVP v0.4)

Minigame web chủ đề **AWS × Google Cloud** cho sự kiện CLB, chơi trên điện thoại bằng cách quét QR.
Tham khảo mechanic *Flying Fruit* của Wordwall, nâng cấp thành **Flying Quiz**: câu hỏi hiện to giữa màn
hình → thu nhỏ ghim lên trên → 3 đáp án bay theo pattern (ngang / dọc / chéo / đối đầu / đa hướng) → chạm
đúng trong 5 giây.

Static web thuần (HTML + CSS + JS, không build step) — deploy được ngay lên **S3 + CloudFront**,
**Amplify** hoặc bất kỳ host tĩnh nào.

## Chạy thử

```bash
cd aws-flying-quiz
python3 -m http.server 8642
# mở http://localhost:8642/ trên trình duyệt (DevTools → iPhone 12 Pro)
```

## Luật chơi (khớp PRD Match & Catch, cập nhật theo concept v3 "Flying Quiz")

| Thành phần | Quy định |
|---|---|
| Vòng chơi | 2 vòng × 10 câu. Vòng 1: *nhận diện nhà cung cấp* — 4 đáp án (Amazon Web Services + Google Cloud + 2 đáp án nhái sai chính tả). Vòng 2: *hiểu dịch vụ AWS* (3 đáp án, bay nhanh hơn) |
| Mỗi câu | Prompt hiện to ~0,95s → dock lên top → đáp án **bơi lượn như cá** theo pattern → timer **5 giây**. Thời gian bay: vòng 1 **5,2s** / vòng 2 **4,5s** hết màn hình (`CFG.flyMsR1/flyMsR2`), tăng dần 6% mỗi block 5 câu (×1.0 → ×1.06 → ×1.12 → ×1.18, hiện ở badge × trên HUD) |
| Đúng | +1 điểm chính, chuỗi +1 |
| Sai / hết giờ | −1 mạng, chuỗi về 0 |
| Bonus | Chuỗi **5 đúng liên tiếp** → mở 1 câu bonus **chọn NHIỀU đáp án** (tích rồi chốt, 15 giây): đúng hết **+3**, sai 1 câu/hết giờ +0, **không mất mạng**. Tối đa **2 bonus/lượt**, không lặp câu trong lượt |
| Mạng | 3 mạng dùng chung 2 vòng, không hồi. Hết mạng = kết thúc lượt ngay |
| Điểm | Chính 0–20 + Bonus 0–6 = **tối đa 26** |
| Quà | **Tổng điểm ≥ 12** (`REWARD_THRESHOLD` của BE) → "Đủ điều kiện nhận quà" |
| Lượt chơi | Tối đa **3 lượt/MSSV**; bảng xếp hạng chỉ lấy lượt tốt nhất, không công khai MSSV |
| Xếp hạng | Tổng điểm ↓ → điểm chính ↓ → nộp sớm hơn |

Luồng: **chào → hướng dẫn → giới thiệu vòng (3-2-1) → chơi ⇄ bonus → kết quả + bảng xếp hạng**.

## Cấu trúc

```
index.html           khung màn hình: cover / howto / round / play / bonus / result
css/style.css        design system "Night Signal" (squid-ink AWS + cam #FF9900)
js/data.js           schema + loader bộ câu hỏi (window.__QUESTION_PACK → js/questions.json → gói cứu hộ)
js/questions.json    NGÂN HÀNG CÂU HỎI — anh tác giả sửa file này (mỗi câu có cardId trỏ tới thẻ BE)
js/api.js            client Django REST + map quiz → thẻ BE (thay backend-api.js/game-api-connector.js cũ)
js/bonus-key.json    bản sao đáp án bonus (chỉ để hiện đúng/sai ngay; BE vẫn chấm chính thức)
js/game.js           engine: state machine, pattern bay, timer pause/resume, bonus, leaderboard
assets/fonts/        Be Vietnam Pro + Space Grotesk (woff2 self-host)
assets/icons/aws/    icon dịch vụ AWS chính thức (AWS Architecture Icons, package 07/2026)
assets/icons/gcp/    glyph GCP vẽ tay đồng bộ design system
assets/icons/brands/ logo AWS (vẽ), Google Cloud (gstatic), Azure & Oracle (Wikimedia)
```

## Backend Django (đã tích hợp)

FE gọi BE Django trong `backend/` — chấm điểm hoàn toàn server-side:

| Method | Endpoint | Dùng cho |
|---|---|---|
| POST | `/api/players/` | tra cứu số lượt còn lại (gửi `display_name` rỗng thì BE giữ nguyên tên cũ) |
| POST | `/api/game/start/` | mở lượt, trả `session_token` + 2 câu bonus thật của lượt |
| POST | `/api/game/submit/` | nộp `action_logs` + `bonus_answers`, BE chấm điểm (idempotent) |
| GET | `/api/game/attempts/<id>/` | chi tiết lượt (lấy `finished_at` để đánh dấu "BẠN" trên BXH) |
| GET | `/api/leaderboard/?limit=10` | Top 10 (có `main_score`/`bonus_points`, không lộ MSSV) |
| GET | `/api/rewards/me/` | điều kiện nhận quà của phiên hiện tại |
| GET | `/health/` | health check (FE tự phát hiện online/offline) |

**Map quiz → thẻ BE** (vì BE chấm theo mô hình thẻ, xem `backend/data/cards.json`):

- Mỗi câu hỏi có `cardId` (VD `r1-s3` → `aws-s3`). Chạm đúng → gửi `clicked` thẻ của câu.
- Chạm sai / hết giờ → gửi `clicked` thẻ provider đối diện để BE ghi 1 lượt sai (khớp số tim FE hiển thị).
- `round` gửi theo provider của thẻ (AWS → 1, GCP → 2) vì BE quy định vòng 1 target AWS, vòng 2 target GCP.
- Bonus hiện **đúng thứ tự** câu 1 → câu 2 của lượt (BE gắn `bonus_1`/`bonus_2` theo thứ tự), nộp `selected_indices` là index gốc.
- Đổi câu hỏi bonus bên BE thì chạy lại `python3 tools/sync-bonus-key.py` để đồng bộ `js/bonus-key.json`.

Chạy full stack:

```bash
# BE
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python manage.py migrate && .venv/bin/python manage.py runserver 8000

# FE
cd frontend && python3 -m http.server 8642   # mở http://localhost:8642
```

Đổi địa chỉ BE: `window.API_BASE_URL = '...'` hoặc thêm `?api=https://be-cua-ban` vào URL.
Khi BE tắt, FE tự chuyển offline (localStorage key `batmay_plays_v1`) — điểm chỉ mang tính local.

## QA hook

- `?debug=cover|howto|round|play|bonus|result` — nhảy thẳng tới màn hình để chụp ảnh QA.
  (`?debug=result` có ghi 1 lượt demo MSSV 2212345 vào localStorage của trình duyệt hiện tại.)
- `qa/qa-check.mjs` — 37 assertion (màn hình, bơi, overlap, respawn, đúng/sai/timeout, bonus, kết quả).
- `qa/e2e-be-integration.mjs` — chơi tự động với BE thật, so điểm server/client (10 check). Chạy:
  `node qa/e2e-be-integration.mjs` (nhanh) hoặc `MODE=full node qa/e2e-be-integration.mjs` (hết vòng 1 + sang vòng 2).
  Cần BE đang chạy ở `localhost:8000` và FE ở `127.0.0.1:8642`.
- `qa/qa-check2.mjs` — chơi trọn 20 câu tự động (max 26 điểm, AC-08, 3 lượt, tie-break leaderboard).
  Chạy: `cd ../.qa-tools && node ../aws-flying-quiz/qa/qa-check.mjs` (cần `npm i playwright-core` tại `.qa-tools/`).
  Kết quả QA: **37/37 và 16/16 PASS, 0 lỗi console**. Ảnh màn hình mẫu trong `qa/final-*.png`.

## Ghi chú tín dụng

- Icon dịch vụ AWS: [AWS Architecture Icons](https://aws.amazon.com/architecture/icons/) (dùng cho mục đích sơ đồ/giới thiệu dịch vụ).
- Logo Google Cloud: gstatic chính thức; Azure/Oracle: Wikimedia Commons.
- Glyph GCP + logo AWS smile + favicon: vẽ tay trong repo này.
- Tham khảo motion: teardown của repo `site-clone` (plinthai) — reveal `cubic-bezier(.16,1,.3,1)`, grain overlay.
