"""
Database configuration and session management
SQLAlchemy 2.0 async setup with connection pooling
"""
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import NullPool
from app.core.config import settings
from app.models.models import Base
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create async engine with connection pooling
engine = create_async_engine(
    settings.DATABASE_URL,
    # Use NullPool for async engines (SQLAlchemy manages connections)
    poolclass=NullPool,
    echo=settings.DEBUG, # Log SQL queries in debug mode
)

# Create async session maker
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False
)

async def get_db() -> AsyncSession:
    """
    Dependency to get database session
    Use this in FastAPI endpoints: db: AsyncSession = Depends(get_db)
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

async def init_db():
    """
    Initialize database tables
    Call this on app startup
    """
    try:
        logger.info("🗄️ Initializing database...")

        async with engine.begin() as conn:
            # Create all tables
            await conn.run_sync(Base.metadata.create_all)

        logger.info("✅ Database tables created successfully")

        # Test connection
        async with AsyncSessionLocal() as session:
            from sqlalchemy import text
            result = await session.execute(text("SELECT 1"))
            result.scalar()

        logger.info("✅ Database connection test successful")

    except Exception as e:
        logger.error(f"❌ Database initialization failed: {e}")
        raise

async def close_db():
    """
    Close database connections
    Call this on app shutdown
    """
    await engine.dispose()
    logger.info("🗄️ Database connections closed")