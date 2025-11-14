"""
Copy Trading Platform - Main Application
FastAPI backend for order replication system
"""
from fastapi import FastAPI, HTTPException, Depends, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import uvicorn
import logging

from app.api import orders, users, masters
from app.api.webhooks import router as webhooks_router
from app.api.v1.masters_endpoints import router as masters_v1_router
from app.api.v1.followers_endpoints import router as followers_v1_router
from app.core.config import settings
from app.core.logging_config import setup_logging
from app.db.database import init_db
from app.services.websocket_manager import manager
from app.services.redis_service import get_redis_service, close_redis_service
from app.services.nats_service import get_nats_service, close_nats_service

# Setup logging
setup_logging(log_level="INFO", json_format=False)
logger = logging.getLogger(__name__)

# Lifespan context manager for startup/shutdown events
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("🚀 Starting Replicon Copy Trading Platform...")

    # Initialize database
    await init_db()
    logger.info("✅ Database initialized")

    # Initialize Redis
    try:
        await get_redis_service()
        logger.info("✅ Redis connected")
    except Exception as e:
        logger.error(f"⚠️  Redis connection failed: {e}")

    # Initialize NATS
    try:
        await get_nats_service()
        logger.info("✅ NATS JetStream connected")
    except Exception as e:
        logger.error(f"⚠️  NATS connection failed: {e}")

    logger.info("✅ All services initialized successfully")
    logger.info(f"📚 API Documentation: http://localhost:8000/docs")

    yield

    # Shutdown
    logger.info("🛑 Shutting down Replicon...")

    # Close Redis
    try:
        await close_redis_service()
        logger.info("✅ Redis closed")
    except Exception as e:
        logger.error(f"Error closing Redis: {e}")

    # Close NATS
    try:
        await close_nats_service()
        logger.info("✅ NATS closed")
    except Exception as e:
        logger.error(f"Error closing NATS: {e}")

    logger.info("✅ Shutdown complete")

# Create FastAPI app
app = FastAPI(
    title="Copy Trading Platform",
    description="Real-time order replication for Indian stock market",
    version="0.1.0",
    lifespan=lifespan
)

# CORS middleware for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],  # React dev servers
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
# Legacy routers (existing)
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(masters.router, prefix="/api/masters-legacy", tags=["masters-legacy"])
app.include_router(orders.router, prefix="/api/orders", tags=["orders"])

# New V1 API routers (Replicon backend)
app.include_router(webhooks_router, prefix="/api", tags=["Webhooks"])
app.include_router(masters_v1_router, prefix="/api", tags=["Masters"])
app.include_router(followers_v1_router, prefix="/api", tags=["Followers"])

# Health check endpoint
@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "version": "0.1.0",
        "environment": settings.ENVIRONMENT
    }

# WebSocket endpoint for real-time updates
@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: int):
    await manager.connect(websocket, user_id)
    try:
        while True:
            # Keep connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(user_id)

# Root endpoint
@app.get("/")
async def root():
    return {
        "message": "Copy Trading Platform API",
        "docs": "/docs",
        "health": "/health"
    }

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,  # Auto-reload on code changes
        log_level="info"
    )
