"""
Redis service for caching, order mapping, and rate limiting
Critical component for maintaining master-follower order relationships
"""
import redis.asyncio as aioredis
import json
import logging
from typing import Optional, Dict, List, Any
from datetime import timedelta
from app.core.config import settings
from app.core.exceptions import RedisConnectionError, CacheWriteError

logger = logging.getLogger(__name__)


class RedisService:
    """
    Redis service for managing cache, order mapping, and rate limiting
    """

    def __init__(self, redis_url: str = None):
        """
        Initialize Redis service

        Args:
            redis_url: Redis connection URL (uses config default if None)
        """
        self.redis_url = redis_url or settings.REDIS_URL
        self.client: Optional[aioredis.Redis] = None

    async def connect(self) -> None:
        """Connect to Redis"""
        try:
            self.client = await aioredis.from_url(
                self.redis_url,
                encoding="utf-8",
                decode_responses=True,
                max_connections=50
            )
            # Test connection
            await self.client.ping()
            logger.info(f"Successfully connected to Redis at {self.redis_url}")
        except Exception as e:
            logger.error(f"Failed to connect to Redis: {e}")
            raise RedisConnectionError(f"Redis connection failed: {e}")

    async def disconnect(self) -> None:
        """Disconnect from Redis"""
        if self.client:
            await self.client.close()
            logger.info("Disconnected from Redis")

    async def get(self, key: str) -> Optional[str]:
        """
        Get value by key

        Args:
            key: Cache key

        Returns:
            Value or None if not found
        """
        try:
            return await self.client.get(key)
        except Exception as e:
            logger.error(f"Redis GET error for key {key}: {e}")
            return None

    async def set(
        self,
        key: str,
        value: str,
        expire: Optional[int] = None
    ) -> bool:
        """
        Set key-value pair

        Args:
            key: Cache key
            value: Value to store
            expire: Expiration time in seconds

        Returns:
            True if successful, False otherwise
        """
        try:
            await self.client.set(key, value, ex=expire)
            return True
        except Exception as e:
            logger.error(f"Redis SET error for key {key}: {e}")
            raise CacheWriteError(f"Failed to write to cache: {e}")

    async def delete(self, key: str) -> bool:
        """
        Delete key

        Args:
            key: Cache key to delete

        Returns:
            True if deleted, False otherwise
        """
        try:
            result = await self.client.delete(key)
            return result > 0
        except Exception as e:
            logger.error(f"Redis DELETE error for key {key}: {e}")
            return False

    async def exists(self, key: str) -> bool:
        """
        Check if key exists

        Args:
            key: Cache key

        Returns:
            True if exists, False otherwise
        """
        try:
            return await self.client.exists(key) > 0
        except Exception as e:
            logger.error(f"Redis EXISTS error for key {key}: {e}")
            return False

    # ============================================
    # JSON OPERATIONS
    # ============================================
    async def get_json(self, key: str) -> Optional[Dict]:
        """
        Get JSON value by key

        Args:
            key: Cache key

        Returns:
            Parsed JSON dict or None
        """
        value = await self.get(key)
        if value:
            try:
                return json.loads(value)
            except json.JSONDecodeError as e:
                logger.error(f"JSON decode error for key {key}: {e}")
                return None
        return None

    async def set_json(
        self,
        key: str,
        value: Dict,
        expire: Optional[int] = None
    ) -> bool:
        """
        Set JSON value

        Args:
            key: Cache key
            value: Dictionary to store
            expire: Expiration time in seconds

        Returns:
            True if successful
        """
        try:
            json_str = json.dumps(value)
            return await self.set(key, json_str, expire)
        except Exception as e:
            logger.error(f"JSON encode error for key {key}: {e}")
            raise CacheWriteError(f"Failed to set JSON: {e}")

    # ============================================
    # ORDER MAPPING - CRITICAL FUNCTIONALITY
    # ============================================
    async def set_order_mapping(
        self,
        master_order_id: int,
        follower_user_id: int,
        follower_order_id: int,
        follower_broker_order_id: Optional[str] = None
    ) -> bool:
        """
        Store master-to-follower order mapping

        Format: order:map:{master_order_id} -> {follower_user_id: follower_order_id, ...}

        Args:
            master_order_id: Master order ID
            follower_user_id: Follower user ID
            follower_order_id: Follower order ID
            follower_broker_order_id: IIFL broker order ID (optional)

        Returns:
            True if successful
        """
        key = f"order:map:{master_order_id}"

        try:
            # Get existing mapping
            mapping = await self.get_json(key) or {}

            # Add follower mapping
            mapping[str(follower_user_id)] = {
                "follower_order_id": follower_order_id,
                "follower_broker_order_id": follower_broker_order_id
            }

            # Store with 7-day expiration (configurable)
            await self.set_json(key, mapping, expire=7 * 24 * 3600)

            logger.info(
                f"Order mapping stored: master_order_id={master_order_id}, "
                f"follower_user_id={follower_user_id}, "
                f"follower_order_id={follower_order_id}"
            )

            return True

        except Exception as e:
            logger.error(f"Failed to set order mapping: {e}")
            raise CacheWriteError(f"Order mapping failed: {e}")

    async def get_order_mapping(
        self,
        master_order_id: int
    ) -> Optional[Dict[str, Dict]]:
        """
        Get follower order mappings for a master order

        Args:
            master_order_id: Master order ID

        Returns:
            Dictionary mapping follower_user_id to order details
        """
        key = f"order:map:{master_order_id}"
        return await self.get_json(key)

    async def get_follower_order_id(
        self,
        master_order_id: int,
        follower_user_id: int
    ) -> Optional[int]:
        """
        Get specific follower order ID for a master order

        Args:
            master_order_id: Master order ID
            follower_user_id: Follower user ID

        Returns:
            Follower order ID or None
        """
        mapping = await self.get_order_mapping(master_order_id)

        if mapping and str(follower_user_id) in mapping:
            return mapping[str(follower_user_id)].get("follower_order_id")

        return None

    async def delete_order_mapping(self, master_order_id: int) -> bool:
        """
        Delete order mapping

        Args:
            master_order_id: Master order ID

        Returns:
            True if deleted
        """
        key = f"order:map:{master_order_id}"
        return await self.delete(key)

    # ============================================
    # TOKEN CACHING (IIFL Authentication)
    # ============================================
    async def cache_iifl_token(
        self,
        user_id: int,
        token: str,
        expire_seconds: int = 3600
    ) -> bool:
        """
        Cache IIFL authentication token

        Args:
            user_id: User ID
            token: IIFL session token
            expire_seconds: Token expiration in seconds

        Returns:
            True if cached successfully
        """
        key = f"iifl:token:{user_id}"
        return await self.set(key, token, expire=expire_seconds)

    async def get_iifl_token(self, user_id: int) -> Optional[str]:
        """
        Get cached IIFL token

        Args:
            user_id: User ID

        Returns:
            Cached token or None
        """
        key = f"iifl:token:{user_id}"
        return await self.get(key)

    async def delete_iifl_token(self, user_id: int) -> bool:
        """
        Delete cached IIFL token

        Args:
            user_id: User ID

        Returns:
            True if deleted
        """
        key = f"iifl:token:{user_id}"
        return await self.delete(key)

    # ============================================
    # RATE LIMITING
    # ============================================
    async def check_rate_limit(
        self,
        key: str,
        limit: int,
        window_seconds: int = 1
    ) -> bool:
        """
        Check if rate limit is exceeded using sliding window

        Args:
            key: Rate limit key (e.g., "iifl:ratelimit:user_123")
            limit: Maximum requests allowed in window
            window_seconds: Time window in seconds

        Returns:
            True if within limit, False if exceeded
        """
        try:
            current = await self.client.incr(key)

            # Set expiration on first request
            if current == 1:
                await self.client.expire(key, window_seconds)

            return current <= limit

        except Exception as e:
            logger.error(f"Rate limit check error: {e}")
            # Fail open - allow request on error
            return True

    async def increment_counter(
        self,
        key: str,
        expire: Optional[int] = None
    ) -> int:
        """
        Increment a counter

        Args:
            key: Counter key
            expire: Expiration time in seconds

        Returns:
            New counter value
        """
        value = await self.client.incr(key)

        if expire and value == 1:
            await self.client.expire(key, expire)

        return value

    # ============================================
    # HASH OPERATIONS (for complex data)
    # ============================================
    async def hset(self, key: str, field: str, value: str) -> bool:
        """Set hash field"""
        try:
            await self.client.hset(key, field, value)
            return True
        except Exception as e:
            logger.error(f"Redis HSET error: {e}")
            return False

    async def hget(self, key: str, field: str) -> Optional[str]:
        """Get hash field"""
        try:
            return await self.client.hget(key, field)
        except Exception as e:
            logger.error(f"Redis HGET error: {e}")
            return None

    async def hgetall(self, key: str) -> Dict:
        """Get all hash fields"""
        try:
            return await self.client.hgetall(key)
        except Exception as e:
            logger.error(f"Redis HGETALL error: {e}")
            return {}

    # ============================================
    # LIST OPERATIONS
    # ============================================
    async def lpush(self, key: str, *values: str) -> int:
        """Push values to list (left)"""
        return await self.client.lpush(key, *values)

    async def rpush(self, key: str, *values: str) -> int:
        """Push values to list (right)"""
        return await self.client.rpush(key, *values)

    async def lpop(self, key: str) -> Optional[str]:
        """Pop value from list (left)"""
        return await self.client.lpop(key)

    async def rpop(self, key: str) -> Optional[str]:
        """Pop value from list (right)"""
        return await self.client.rpop(key)

    async def lrange(self, key: str, start: int, stop: int) -> List[str]:
        """Get range of list elements"""
        return await self.client.lrange(key, start, stop)


# Global Redis service instance
_redis_service: Optional[RedisService] = None


async def get_redis_service() -> RedisService:
    """
    Get or create global Redis service instance

    Returns:
        RedisService instance
    """
    global _redis_service

    if _redis_service is None:
        _redis_service = RedisService()
        await _redis_service.connect()

    return _redis_service


async def close_redis_service() -> None:
    """Close global Redis service"""
    global _redis_service

    if _redis_service:
        await _redis_service.disconnect()
        _redis_service = None
