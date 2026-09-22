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
| Vòng chơi | 2 vòng × 10 câu. Vòng 1: *nhận diện nhà cung cấp* (dễ). Vòng 2: *hiểu dịch vụ AWS* (khó hơn, bay nhanh hơn) |
| Mỗi câu | Prompt hiện to ~0,95s → dock lên top → 3 đáp án **bơi lượn như cá** (lắc đuôi, uốn sóng, quay đầu bơi ngược, đổi làn/đổi hướng mỗi lần quay lại) theo pattern → timer **5 giây** |
| Đúng | +1 điểm chính, chuỗi +1 |
| Sai / hết giờ | −1 mạng, chuỗi về 0 |
| Bonus | Chuỗi **5 đúng liên tiếp** → mở 1 câu bonus scenario đứng yên, **10 giây**, đúng **+3**, sai/hết giờ +0, **không mất mạng**. Tối đa **2 bonus/lượt**, không lặp câu trong lượt |
| Mạng | 3 mạng dùng chung 2 vòng, không hồi. Hết mạng = kết thúc lượt ngay |
| Điểm | Chính 0–20 + Bonus 0–6 = **tối đa 26** |
| Quà | Điểm **chính ≥ 10** → "Đủ điều kiện nhận quà" (bonus không tính vào ngưỡng) |
| Lượt chơi | Tối đa **3 lượt/MSSV**; bảng xếp hạng chỉ lấy lượt tốt nhất, không công khai MSSV |
| Xếp hạng | Tổng điểm ↓ → điểm chính ↓ → nộp sớm hơn |

Luồng: **chào → hướng dẫn → giới thiệu vòng (3-2-1) → chơi ⇄ bonus → kết quả + bảng xếp hạng**.

## Cấu trúc

```
index.html           khung màn hình: cover / howto / round / play / bonus / result
css/style.css        design system "Night Signal" (squid-ink AWS + cam #FF9900)
js/data.js           ngân hàng câu hỏi tĩnh (PRD mục 6) — sửa nội dung ở đây
js/game.js           engine: state machine, pattern bay, timer pause/resume, bonus, leaderboard
assets/fonts/        Be Vietnam Pro + Space Grotesk (woff2 self-host)
assets/icons/aws/    icon dịch vụ AWS chính thức (AWS Architecture Icons, package 07/2026)
assets/icons/gcp/    glyph GCP vẽ tay đồng bộ design system
assets/icons/brands/ logo AWS (vẽ), Google Cloud (gstatic), Azure & Oracle (Wikimedia)
```

## Lưu trữ hiện tại (mock) và kế hoạch backend

MVP preview lưu localStorage key `batmay_plays_v1`: `{ [mssv]: { name, plays: [{ts, main, bonus, total, bonusCount}] } }`.
Các hàm đã tách riêng để swap sang API thật (PRD mục 7): `submitPlay()` / `getLeaderboard()` / `playsLeft()`
trong `js/game.js` — thay bằng `fetch` tới backend (API Gateway + Lambda + DynamoDB) mà không đổi phần còn lại.
Backend cần chặn server-side: 3 lượt/MSSV, `0 ≤ main ≤ 20`, `bonus ∈ {0,3,6}`, `total = main + bonus ≤ 26`, `bonusScore ≤ 3 × bonusCount`.

## QA hook

- `?debug=cover|howto|round|play|bonus|result` — nhảy thẳng tới màn hình để chụp ảnh QA.
  (`?debug=result` có ghi 1 lượt demo MSSV 2212345 vào localStorage của trình duyệt hiện tại.)
- `qa/qa-check.mjs` — 37 assertion (màn hình, bơi, overlap, respawn, đúng/sai/timeout, bonus, kết quả).
- `qa/qa-check2.mjs` — chơi trọn 20 câu tự động (max 26 điểm, AC-08, 3 lượt, tie-break leaderboard).
  Chạy: `cd ../.qa-tools && node ../aws-flying-quiz/qa/qa-check.mjs` (cần `npm i playwright-core` tại `.qa-tools/`).
  Kết quả QA: **37/37 và 16/16 PASS, 0 lỗi console**. Ảnh màn hình mẫu trong `qa/final-*.png`.

## Ghi chú tín dụng

- Icon dịch vụ AWS: [AWS Architecture Icons](https://aws.amazon.com/architecture/icons/) (dùng cho mục đích sơ đồ/giới thiệu dịch vụ).
- Logo Google Cloud: gstatic chính thức; Azure/Oracle: Wikimedia Commons.
- Glyph GCP + logo AWS smile + favicon: vẽ tay trong repo này.
- Tham khảo motion: teardown của repo `site-clone` (plinthai) — reveal `cubic-bezier(.16,1,.3,1)`, grain overlay.
