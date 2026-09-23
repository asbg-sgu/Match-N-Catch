# Test API Integration - Step by Step

## Architecture

```
game.js (original, không sửa)
    ↓
backend-api.js (API wrapper)
    ↓
game-api-connector.js (hooks vào game events)
```

## Test Plan

### 1. Test Backend Running
```bash
cd mysite
python manage.py runserver
```

Kiểm tra: http://localhost:8000/health/

### 2. Test Frontend
```bash
cd frontend
npm run dev
```

Mở: http://localhost:8080/index.html

### 3. Test Flow

**Bước 1: Mở Console (F12)**

Phải thấy:
```
✓ Backend API wrapper ready
🔌 Initializing API connector...
✓ Hooked submitPlay
✓ Hooked getLeaderboard
✓ API connector ready
```

**Bước 2: Nhập form**

Nhập tên + MSSV → Click "BẮT ĐẦU CHƠI"

Console sẽ log:
```
✓ Player registered & game started: {playerId: "...", attemptId: "...", ...}
```

**Bước 3: Chơi game**

Game chạy bình thường, không bị treo.

**Bước 4: Kết thúc game**

Màn hình kết quả hiển thị ngay lập tức.

Console log:
```
✓ Submitted to backend: {attempt_id: "...", total_score: 15, ...}
```

**Bước 5: Kiểm tra leaderboard**

Bảng xếp hạng hiển thị kết quả.

Console log:
```
✓ Leaderboard from backend: 1 entries
```

### 4. Verify Backend Data

```bash
cd mysite
python manage.py shell
```

```python
from game.models import Player, GameAttempt

# Check players
Player.objects.all()

# Check attempts
GameAttempt.objects.filter(status='submitted')

# Check scores
for attempt in GameAttempt.objects.filter(status='submitted'):
    print(f"{attempt.player.display_name}: {attempt.total_score}")
```

## Troubleshooting

### Game bị treo/đơ
→ Tắt API connector:

Edit `game-api-connector.js` line 8:
```javascript
enabled: false, // Tắt API
```

### API fails
Console sẽ show:
```
⚠ API failed, continuing with localStorage
```
Game vẫn chạy bình thường với localStorage.

### Leaderboard không hiển thị
1. Check console có errors không
2. Kiểm tra backend có data: `GET /api/leaderboard/`
3. Verify `top_entries` có data

## Disable API

Để tắt hoàn toàn API, comment trong `index.html`:
```html
<!-- <script src="js/backend-api.js"></script> -->
<!-- <script src="js/game-api-connector.js"></script> -->
```

Hoặc set `enabled: false` trong connector.

## Current Status

- ✅ Backend API hoạt động
- ✅ Game chạy độc lập với localStorage
- 🔄 API integration: hooks không intrusive
- ⚠️ Cần test để verify không bị treo

## Next: Test ngay!

Refresh trang và test theo flow trên.
