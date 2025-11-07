"""
WebSocket Manager for Real-time Updates
Handles connections and broadcasts to followers/masters
"""
import json
import asyncio
from typing import Dict, List, Set
from fastapi import WebSocket
from app.models.models import OrderStatus
import logging

logger = logging.getLogger(__name__)

class ConnectionManager:
    """
    Manages WebSocket connections for real-time updates

    Features:
    - User-specific connections
    - Broadcast to multiple connections per user
    - Order updates and replication notifications
    - Connection cleanup on disconnect
    """

    def __init__(self):
        # Store active connections: user_id]
        self.active_connections: Dict[int, Set[WebSocket]] = {}
        self.connection_lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, user_id: int):
        """
        Accept new WebSocket connection

        Args:
            websocket: WebSocket instance
            user_id: User ID for this connection
        """
        await websocket.accept()

        async with self.connection_lock:
            if user_id not in self.active_connections:
                self.active_connections[user_id] = set()

            self.active_connections[user_id].add(websocket)

        logger.info(f"📡 WebSocket connected for user {user_id}")

        # Send welcome message
        await self.send_personal_message({
            "type": "connection",
            "message": "Connected to Copy Trading Platform",
            "timestamp": asyncio.get_event_loop().time()
        }, user_id)

    async def disconnect(self, user_id: int, websocket: WebSocket = None):
        """
        Remove WebSocket connection

        Args:
            user_id: User ID
            websocket: Specific websocket to remove (if None, removes all for user)
        """
        async with self.connection_lock:
            if user_id in self.active_connections:
                if websocket:
                    # Remove specific connection
                    self.active_connections[user_id].discard(websocket)
                    if not self.active_connections[user_id]:
                        del self.active_connections[user_id]
                else:
                    # Remove all connections for user
                    del self.active_connections[user_id]

        logger.info(f"📡 WebSocket disconnected for user {user_id}")

    def disconnect(self, user_id: int):
        """
        Synchronous disconnect method for backward compatibility
        """
        if user_id in self.active_connections:
            asyncio.create_task(self._async_disconnect(user_id))

    async def _async_disconnect(self, user_id: int):
        """Internal async disconnect"""
        async with self.connection_lock:
            if user_id in self.active_connections:
                del self.active_connections[user_id]

    async def send_personal_message(self, message: dict, user_id: int):
        """
        Send message to specific user

        Args:
            message: Message data
            user_id: Target user ID
        """
        if user_id not in self.active_connections:
            return

        # Get copy of connections to avoid modification during iteration
        connections = self.active_connections[user_id].copy()
        disconnected_connections = set()

        message_str = json.dumps(message)

        for connection in connections:
            try:
                await connection.send_text(message_str)
            except Exception as e:
                logger.warning(f"Failed to send message to user {user_id}: {e}")
                disconnected_connections.add(connection)

        # Clean up disconnected connections
        if disconnected_connections:
            async with self.connection_lock:
                if user_id in self.active_connections:
                    self.active_connections[user_id] -= disconnected_connections
                    if not self.active_connections[user_id]:
                        del self.active_connections[user_id]

    async def send_to_multiple_users(self, message: dict, user_ids: List[int]):
        """
        Send message to multiple users

        Args:
            message: Message data
            user_ids: List of target user IDs
        """
        tasks = []
        for user_id in user_ids:
            tasks.append(self.send_personal_message(message, user_id))

        await asyncio.gather(*tasks, return_exceptions=True)

    async def broadcast_to_all(self, message: dict):
        """
        Broadcast message to all connected users

        Args:
            message: Message data
        """
        if not self.active_connections:
            return

        user_ids = list(self.active_connections.keys())
        await self.send_to_multiple_users(message, user_ids)

    async def send_order_update(self, user_id: int, order_id: int, status: OrderStatus, extra_data: dict = None):
        """
        Send order status update to user

        Args:
            user_id: User ID to notify
            order_id: Order ID
            status: New order status
            extra_data: Additional data to include
        """
        message = {
            "type": "order_update",
            "data": {
                "order_id": order_id,
                "status": status.value,
                "timestamp": asyncio.get_event_loop().time(),
                **(extra_data or {})
            }
        }

        await self.send_personal_message(message, user_id)

    async def send_replication_update(self, master_id: int, follower_ids: List[int], replication_data: dict):
        """
        Send replication status update

        Args:
            master_id: Master trader ID
            follower_ids: List of follower IDs
            replication_data: Replication results and metrics
        """
        # Send to master
        master_message = {
            "type": "replication_complete",
            "data": {
                "master_order_id": replication_data.get("master_order_id"),
                "success_count": replication_data.get("success_count", 0),
                "failed_count": replication_data.get("failed_count", 0),
                "total_followers": replication_data.get("total_followers", 0),
                "avg_latency_ms": replication_data.get("avg_latency_ms", 0),
                "timestamp": asyncio.get_event_loop().time()
            }
        }

        await self.send_personal_message(master_message, master_id)

        # Send to followers
        follower_message = {
            "type": "order_replicated",
            "data": {
                "master_id": master_id,
                "master_order_id": replication_data.get("master_order_id"),
                "symbol": replication_data.get("symbol"),
                "side": replication_data.get("side"),
                "quantity": replication_data.get("quantity"),
                "status": "SUBMITTED",
                "timestamp": asyncio.get_event_loop().time()
            }
        }

        await self.send_to_multiple_users(follower_message, follower_ids)

    async def send_follow_notification(self, master_id: int, follower_id: int, follower_username: str):
        """
        Notify master when someone follows them

        Args:
            master_id: Master trader ID
            follower_id: New follower ID
            follower_username: Follower's username
        """
        message = {
            "type": "new_follower",
            "data": {
                "follower_id": follower_id,
                "follower_username": follower_username,
                "timestamp": asyncio.get_event_loop().time()
            }
        }

        await self.send_personal_message(message, master_id)

    async def send_unfollow_notification(self, master_id: int, follower_id: int, follower_username: str):
        """
        Notify master when someone unfollows them

        Args:
            master_id: Master trader ID
            follower_id: Unfollower ID
            follower_username: Follower's username
        """
        message = {
            "type": "follower_left",
            "data": {
                "follower_id": follower_id,
                "follower_username": follower_username,
                "timestamp": asyncio.get_event_loop().time()
            }
        }

        await self.send_personal_message(message, master_id)

    async def send_market_update(self, symbol: str, price: float, change_percent: float):
        """
        Send market price update to all users

        Args:
            symbol: Stock symbol
            price: Current price
            change_percent: Percentage change
        """
        message = {
            "type": "market_update",
            "data": {
                "symbol": symbol,
                "price": price,
                "change_percent": change_percent,
                "timestamp": asyncio.get_event_loop().time()
            }
        }

        await self.broadcast_to_all(message)

    def get_connection_count(self):
        """Get total number of active connections"""
        return sum(len(connections) for connections in self.active_connections.values())

    def get_user_count(self):
        """Get number of connected users"""
        return len(self.active_connections)

    def is_user_connected(self, user_id: int):
        """Check if user has active connections"""
        return user_id in self.active_connections and len(self.active_connections[user_id]) > 0

# Global connection manager instance
manager = ConnectionManager()