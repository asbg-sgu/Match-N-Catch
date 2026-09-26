# Giai đoạn 2: Xây dựng Frontend Mobile Game (Match & Catch)

## 1. Mục tiêu và phạm vi giai đoạn 2
Triển khai toàn diện giao diện và trải nghiệm người dùng cho Mobile Web Game **Match & Catch** (thử thách phản xạ đám mây AWS x GCP) với phong cách **Modern Casual Mobile Game**, tối ưu 60 FPS trên thiết bị di động, tích hợp trơn tru với Backend FastAPI đã xây dựng ở Giai đoạn 1.

---

## 2. Các thành phần đã triển khai

### 2.1. Cấu trúc thư mục mới
```text
frontend/src/
├── components/
│   ├── Header.jsx           # HUD: Điểm, ❤️ Tim, 🔥 Combo, Vòng đấu & Mục tiêu, Âm thanh
│   ├── FloatingCard.jsx     # Thẻ dịch vụ bay đạt chuẩn 60 FPS (translate3d, xử lý touch/click)
│   ├── BonusModal.jsx       # Modal Quiz xuất hiện khi đạt chuỗi 5 câu đúng (+3 điểm thưởng)
│   └── LeaderboardModal.jsx # Modal xem bảng xếp hạng Top 10 với huy hiệu rank 1, 2, 3
├── screens/
│   ├── HomeScreen.jsx       # Màn hình chính: Nhập Tên, MSSV, xem luật, nút Bắt đầu
│   ├── GameScreen.jsx       # Màn hình gameplay: 4 làn bay, chuyển vòng AWS sang GCP, feedback rung & chữ nổi
│   └── ResultScreen.jsx     # Màn hình kết quả: Điểm tổng, thống kê đúng/sai, nhận quà, nút chơi lại
├── services/
│   ├── api.js               # Gọi các API FastAPI (/players, /game/start, /game/submit, /leaderboard, /rewards/me)
│   ├── assetResolver.js     # Tự động ánh xạ icon_path từ backend sang assets được bundle bởi Vite
│   └── sound.js             # Web Audio API sfx (đúng, sai, combo, bonus, gameover) & trình phát BGM
├── App.jsx                  # State machine điều hướng: HOME -> GAME -> RESULT
├── App.css                  # Toàn bộ styling casual game, glassmorphism, keyframes GPU
├── index.css                # Design tokens và Google Font Outfit
└── main.jsx
```

---

## 3. Các tính năng & Tối ưu kỹ thuật nổi bật

1. **Hiệu năng 60 FPS**:
   - Sử dụng CSS keyframes `transform: translate3d(...)` và `will-change: transform, opacity`.
   - Phân chia 4 làn bay (`LANES = [14, 32, 50, 68]%`) với thời gian xuất hiện thẻ giãn cách ~1.3s, thẻ bay trong 3.0s.
   - Giải phóng DOM ngay lập tức khi người chơi bấm hoặc khi thẻ trôi hết màn hình, ngăn ngừa tràn bộ nhớ.
2. **Âm thanh & Phản hồi tương tác (Zero Latency)**:
   - Sử dụng Web Audio API để phát sinh tần số âm thanh tức thì (oscillator) cho các sự kiện: đúng mục tiêu, sai mục tiêu, combo tăng dần, bonus fanfare, game over.
   - Hỗ trợ nhạc nền BGM có sẵn từ `src/assets/sound/` kèm nút bật/tắt âm thanh tiện lợi.
   - Rung phản hồi cảm ứng (`navigator.vibrate`) và hiệu ứng rung màn hình khi bấm nhầm.
   - Chữ nổi động (`+1`, `-1 ❤️`, `Chuỗi x5!`) bay lên mượt mà tại điểm chạm.
3. **Độ tin cậy & Chấm điểm Server-side**:
   - Client chỉ gửi nhật ký thao tác `action_logs` và danh sách `bonus_answers`. Toàn bộ điểm số được tính toán bảo mật và trả về từ máy chủ.
   - Cơ chế Idempotent submit bảo đảm không bao giờ tính trùng điểm nếu gửi lại request.
4. **Bảo mật dữ liệu**:
   - Bảng xếp hạng Top 10 không bao giờ để lộ Mã số sinh viên (MSSV).

---

## 4. Kiểm thử chất lượng
- `npm run lint`: **0 errors, 0 warnings**.
- `npm run build`: **Thành công 100%**.
- `pytest tests/`: **7/7 tests passed**.
- Kiểm thử end-to-end API: Thành công đăng ký, lấy 40 thẻ xáo trộn, kích hoạt câu hỏi bonus, chấm điểm và hiển thị trên Leaderboard.
