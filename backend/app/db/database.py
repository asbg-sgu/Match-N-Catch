# File thiết lập kết nối cơ sở dữ liệu và quản lý phiên làm việc (Session) của SQLAlchemy.
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import settings

db_url = settings.effective_database_url
connect_args = {"check_same_thread": False} if db_url.startswith("sqlite") else {}

engine = create_engine(
    db_url,
    connect_args=connect_args,
    pool_pre_ping=True
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """Cung cấp session kết nối cơ sở dữ liệu cho mỗi request và tự động đóng sau khi hoàn tất."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
