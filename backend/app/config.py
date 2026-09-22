# File quản lý cấu hình hệ thống, biến môi trường và kết nối cơ sở dữ liệu.
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Optional


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database configuration
    DB_HOST: Optional[str] = None
    DB_PORT: int = 3306
    DB_NAME: str = "match_and_catch"
    DB_USER: Optional[str] = None
    DB_PASSWORD: Optional[str] = None
    DATABASE_URL: Optional[str] = None

    # Game configuration
    REWARD_THRESHOLD: int = 12
    EVENT_ID: str = "event-techfest-2026"
    EVENT_NAME: str = "Match & Catch AWS x Google Cloud Challenge"

    # Admin configuration
    ADMIN_USERNAME: str = "btc_admin"
    ADMIN_PASSWORD: str = "admin123"

    # App & Security
    SECRET_KEY: str = "match_and_catch_secret_key_2026_asbg"
    CORS_ORIGINS: str = "*"

    @property
    def cors_origins_list(self) -> List[str]:
        """Chuyển đổi cấu hình CORS_ORIGINS thành danh sách domain được phép truy cập."""
        if not self.CORS_ORIGINS or self.CORS_ORIGINS == "*":
            return ["*"]
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]

    @property
    def effective_database_url(self) -> str:
        """Xác định URL kết nối DB: ưu tiên MySQL RDS, tự động fallback về SQLite cục bộ."""
        if self.DATABASE_URL:
            return self.DATABASE_URL
        if self.DB_HOST and self.DB_USER:
            password = f":{self.DB_PASSWORD}" if self.DB_PASSWORD else ""
            return f"mysql+pymysql://{self.DB_USER}{password}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
        # Fallback to local SQLite for development
        return "sqlite:///./match_and_catch.db"


settings = Settings()
