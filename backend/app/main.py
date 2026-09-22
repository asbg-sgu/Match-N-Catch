# File khởi chạy ứng dụng FastAPI: cấu hình CORS, tự động tạo bảng DB và đăng ký toàn bộ routes.
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db.database import Base, engine, SessionLocal
from app.service.service import get_or_create_default_event
from app.routes.routes import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Quản lý vòng đời ứng dụng: tự động tạo bảng DB và seed sự kiện mặc định khi khởi động."""
    # Startup: Auto-create tables and default event
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        get_or_create_default_event(db)
    finally:
        db.close()
    yield
    # Shutdown logic if any


app = FastAPI(
    title="Match & Catch API",
    description="Backend API cho Mobile Web Game Match & Catch (AWS x Google Cloud Challenge)",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routes
app.include_router(router)


@app.get("/", tags=["Health"])
def root():
    """Trả về thông tin cơ bản của API và đường dẫn tài liệu Swagger."""
    return {
        "app": "Match & Catch API",
        "version": "1.0.0",
        "status": "online",
        "docs_url": "/docs"
    }


@app.get("/health", tags=["Health"])
def health_check():
    """Kiểm tra trạng thái hoạt động của server (dùng cho load balancer hoặc monitoring)."""
    return {"status": "ok"}
