"""
Configuration settings for Copy Trading Platform
Uses pydantic-settings for environment variable management
"""
from pydantic_settings import BaseSettings
from pydantic import Field
from typing import Literal

class Settings(BaseSettings):
    # App Settings
    APP_NAME: str = "Copy Trading Platform"
    VERSION: str = "0.1.0"
    ENVIRONMENT: Literal["development", "staging", "production"] = "development"
    DEBUG: bool = True

    # Database
    DATABASE_URL: str = Field(
        default="postgresql+asyncpg://trading_user:trading_pass@localhost:5432/copy_trading",
        description="PostgreSQL database URL with asyncpg driver"
    )

    # Redis Cache
    REDIS_URL: str = Field(
        default="redis://localhost:6379/0",
        description="Redis connection URL"
    )

    # NATS Message Queue
    NATS_URL: str = Field(
        default="nats://localhost:4222",
        description="NATS server URL"
    )
    NATS_STREAM_NAME: str = Field(
        default="REPLICON_ORDERS",
        description="NATS JetStream stream name"
    )
    NATS_SUBJECT_PREFIX: str = Field(
        default="replicon.orders",
        description="NATS subject prefix for order events"
    )
    NATS_CONSUMER_NAME: str = Field(
        default="order-worker",
        description="NATS consumer name for order worker"
    )

    # Authentication
    SECRET_KEY: str = Field(
        default="super-secret-key-change-this-in-production-123",
        description="Secret key for JWT token generation"
    )
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    ALGORITHM: str = "HS256"

    # Encryption
    ENCRYPTION_KEY: str = Field(
        default="",
        description="Base64-encoded encryption key for sensitive data (auto-generated if empty)"
    )

    # IIFL API Configuration
    # Blaze (Master) API
    IIFL_BLAZE_API_URL: str = Field(
        default="https://ttblaze.iifl.com",
        description="IIFL Blaze API base URL for master account"
    )

    # Normal REST API (Followers)
    IIFL_API_URL: str = Field(
        default="https://api.iiflsecurities.com",
        description="IIFL Normal REST API base URL for followers"
    )
    IIFL_VENDOR_KEY: str = Field(
        default="",
        description="IIFL Vendor Key for authentication"
    )
    IIFL_VENDOR_CODE: str = Field(
        default="",
        description="IIFL Vendor Code"
    )
    IIFL_API_SECRET: str = Field(
        default="",
        description="IIFL API Secret"
    )

    # Rate limiting
    IIFL_RATE_LIMIT_PER_SECOND: int = Field(
        default=10,
        description="Maximum IIFL API requests per second"
    )

    # Performance Settings
    HTTP_POOL_CONNECTIONS: int = 100
    HTTP_POOL_MAXSIZE: int = 20
    HTTP_KEEPALIVE_EXPIRY: float = 60.0

    # Database Pool Settings
    DB_POOL_SIZE: int = 20
    DB_MAX_OVERFLOW: int = 10

    # Replication Settings
    MAX_CONCURRENT_ORDERS: int = 50
    ORDER_TIMEOUT_SECONDS: int = 30

    # Risk Management
    ENFORCE_RISK_LIMITS: bool = False  # Set to True to enable risk checking
    DEFAULT_MAX_ORDER_VALUE: float = 10000000.0  # ₹1 Crore
    DEFAULT_MAX_DAILY_LOSS: float = 5000000.0    # ₹50 Lakh

    class Config:
        env_file = ".env"
        case_sensitive = True

# Global settings instance
settings = Settings()