# ============================================================
# Match & Catch — Dockerfile (Django)
# Base: Python 3.11 slim
# ============================================================

# ---- Stage 1: Builder ----
FROM python:3.11-slim AS builder

WORKDIR /app

# Cài dependencies vào thư mục riêng để cache layer
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ---- Stage 2: Runtime ----
FROM python:3.11-slim

WORKDIR /app

# Copy dependencies từ builder
COPY --from=builder /install /usr/local

# Copy source code
COPY . .

# Tạo user non-root để chạy app (bảo mật)
RUN adduser --disabled-password --gecos "" appuser
USER appuser

# Port Django chạy
EXPOSE 8000

# Chạy app bằng gunicorn (production) hoặc runserver (dev)
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
