"""
NATS JetStream service for event-driven order replication
Handles publishing and subscribing to order events
"""
import nats
from nats.js import JetStreamContext
from nats.js.api import StreamConfig, ConsumerConfig, DeliverPolicy
import json
import logging
from typing import Optional, Callable, Dict, Any
from datetime import datetime
from app.core.config import settings
from app.core.exceptions import NATSConnectionError, EventPublishError

logger = logging.getLogger(__name__)


class OrderEvent:
    """
    Order event structure for NATS messages
    """
    NEW = "order.new"
    MODIFIED = "order.modified"
    CANCELLED = "order.cancelled"
    FILLED = "order.filled"


class NATSService:
    """
    NATS JetStream service for event-driven architecture
    """

    def __init__(self, nats_url: str = None):
        """
        Initialize NATS service

        Args:
            nats_url: NATS server URL (uses config default if None)
        """
        self.nats_url = nats_url or settings.NATS_URL
        self.nc: Optional[nats.Client] = None
        self.js: Optional[JetStreamContext] = None
        self.stream_name = settings.NATS_STREAM_NAME
        self.subject_prefix = settings.NATS_SUBJECT_PREFIX

    async def connect(self) -> None:
        """
        Connect to NATS and initialize JetStream
        """
        try:
            # Connect to NATS
            self.nc = await nats.connect(
                servers=[self.nats_url],
                max_reconnect_attempts=-1,  # Infinite reconnects
                reconnect_time_wait=2,      # Wait 2 seconds between reconnects
            )

            # Get JetStream context
            self.js = self.nc.jetstream()

            # Create or update stream
            await self._ensure_stream()

            logger.info(f"Successfully connected to NATS at {self.nats_url}")

        except Exception as e:
            logger.error(f"Failed to connect to NATS: {e}")
            raise NATSConnectionError(f"NATS connection failed: {e}")

    async def _ensure_stream(self) -> None:
        """
        Ensure JetStream stream exists with proper configuration
        """
        try:
            # Stream configuration
            stream_config = StreamConfig(
                name=self.stream_name,
                subjects=[f"{self.subject_prefix}.>"],
                max_age=7 * 24 * 3600,  # Retain for 7 days
                storage="file",         # Persistent storage
                max_msgs=1000000,       # Max 1M messages
                max_bytes=10 * 1024 * 1024 * 1024,  # 10GB max
                duplicate_window=120,   # 2-minute duplicate detection
            )

            try:
                # Try to get existing stream
                await self.js.stream_info(self.stream_name)
                logger.info(f"Stream {self.stream_name} already exists")

                # Update stream configuration
                await self.js.update_stream(stream_config)
                logger.info(f"Updated stream {self.stream_name}")

            except nats.js.errors.NotFoundError:
                # Create new stream
                await self.js.add_stream(stream_config)
                logger.info(f"Created stream {self.stream_name}")

        except Exception as e:
            logger.error(f"Failed to ensure stream: {e}")
            raise

    async def disconnect(self) -> None:
        """
        Disconnect from NATS
        """
        if self.nc:
            await self.nc.close()
            logger.info("Disconnected from NATS")

    # ============================================
    # PUBLISHING ORDER EVENTS
    # ============================================
    async def publish_order_event(
        self,
        event_type: str,
        order_data: Dict[str, Any],
        master_order_id: int,
        idempotency_key: Optional[str] = None
    ) -> bool:
        """
        Publish order event to NATS JetStream

        Args:
            event_type: Event type (OrderEvent.NEW, OrderEvent.MODIFIED, etc.)
            order_data: Order data dictionary
            master_order_id: Master order ID
            idempotency_key: Optional idempotency key for duplicate prevention

        Returns:
            True if published successfully

        Raises:
            EventPublishError: If publishing fails
        """
        try:
            # Build subject
            subject = f"{self.subject_prefix}.{event_type}"

            # Build message payload
            payload = {
                "event_type": event_type,
                "master_order_id": master_order_id,
                "order_data": order_data,
                "timestamp": datetime.utcnow().isoformat(),
                "idempotency_key": idempotency_key or f"{master_order_id}_{event_type}_{datetime.utcnow().timestamp()}"
            }

            # Convert to JSON
            message = json.dumps(payload).encode()

            # Publish with acknowledgment
            ack = await self.js.publish(
                subject=subject,
                payload=message,
                headers={
                    "Nats-Msg-Id": payload["idempotency_key"]  # Duplicate detection
                }
            )

            logger.info(
                f"Published order event: {event_type}, "
                f"master_order_id={master_order_id}, "
                f"seq={ack.seq}"
            )

            return True

        except Exception as e:
            logger.error(f"Failed to publish order event: {e}", exc_info=True)
            raise EventPublishError(f"Event publishing failed: {e}")

    async def publish_new_order(
        self,
        master_order_id: int,
        order_data: Dict[str, Any]
    ) -> bool:
        """
        Publish new order event

        Args:
            master_order_id: Master order ID
            order_data: Order details

        Returns:
            True if successful
        """
        return await self.publish_order_event(
            event_type=OrderEvent.NEW,
            order_data=order_data,
            master_order_id=master_order_id
        )

    async def publish_modify_order(
        self,
        master_order_id: int,
        order_data: Dict[str, Any]
    ) -> bool:
        """
        Publish order modification event

        Args:
            master_order_id: Master order ID
            order_data: Modified order details

        Returns:
            True if successful
        """
        return await self.publish_order_event(
            event_type=OrderEvent.MODIFIED,
            order_data=order_data,
            master_order_id=master_order_id
        )

    async def publish_cancel_order(
        self,
        master_order_id: int,
        order_data: Dict[str, Any]
    ) -> bool:
        """
        Publish order cancellation event

        Args:
            master_order_id: Master order ID
            order_data: Order details

        Returns:
            True if successful
        """
        return await self.publish_order_event(
            event_type=OrderEvent.CANCELLED,
            order_data=order_data,
            master_order_id=master_order_id
        )

    # ============================================
    # SUBSCRIBING TO ORDER EVENTS
    # ============================================
    async def subscribe_order_events(
        self,
        callback: Callable,
        consumer_name: str = None
    ) -> None:
        """
        Subscribe to all order events

        Args:
            callback: Async callback function to handle messages
            consumer_name: Consumer name (defaults to config)
        """
        consumer_name = consumer_name or settings.NATS_CONSUMER_NAME

        try:
            # Create durable consumer
            await self.js.subscribe(
                subject=f"{self.subject_prefix}.>",
                durable=consumer_name,
                cb=callback,
                manual_ack=True,  # Manual acknowledgment for reliability
                config=ConsumerConfig(
                    deliver_policy=DeliverPolicy.ALL,
                    ack_wait=30,  # 30 seconds to acknowledge
                    max_deliver=3,  # Retry up to 3 times
                )
            )

            logger.info(
                f"Subscribed to order events with consumer '{consumer_name}'"
            )

        except Exception as e:
            logger.error(f"Failed to subscribe to order events: {e}")
            raise

    async def subscribe_new_orders(
        self,
        callback: Callable,
        consumer_name: str = None
    ) -> None:
        """
        Subscribe to new order events only

        Args:
            callback: Async callback function
            consumer_name: Consumer name
        """
        consumer_name = consumer_name or f"{settings.NATS_CONSUMER_NAME}-new"

        try:
            await self.js.subscribe(
                subject=f"{self.subject_prefix}.{OrderEvent.NEW}",
                durable=consumer_name,
                cb=callback,
                manual_ack=True,
            )

            logger.info(f"Subscribed to new order events: {consumer_name}")

        except Exception as e:
            logger.error(f"Failed to subscribe to new orders: {e}")
            raise

    # ============================================
    # HELPER METHODS
    # ============================================
    @staticmethod
    def parse_order_event(message: nats.aio.msg.Msg) -> Optional[Dict]:
        """
        Parse order event message

        Args:
            message: NATS message

        Returns:
            Parsed event data or None
        """
        try:
            data = json.loads(message.data.decode())
            return data
        except Exception as e:
            logger.error(f"Failed to parse order event: {e}")
            return None

    async def acknowledge_message(self, message: nats.aio.msg.Msg) -> None:
        """
        Acknowledge NATS message

        Args:
            message: NATS message
        """
        try:
            await message.ack()
        except Exception as e:
            logger.error(f"Failed to acknowledge message: {e}")

    async def nack_message(
        self,
        message: nats.aio.msg.Msg,
        delay: int = 0
    ) -> None:
        """
        Negatively acknowledge message (for retry)

        Args:
            message: NATS message
            delay: Delay before retry in seconds
        """
        try:
            await message.nak(delay=delay)
        except Exception as e:
            logger.error(f"Failed to nack message: {e}")

    # ============================================
    # STREAM MANAGEMENT
    # ============================================
    async def purge_stream(self) -> bool:
        """
        Purge all messages from stream (USE WITH CAUTION)

        Returns:
            True if successful
        """
        try:
            await self.js.purge_stream(self.stream_name)
            logger.warning(f"Purged stream {self.stream_name}")
            return True
        except Exception as e:
            logger.error(f"Failed to purge stream: {e}")
            return False

    async def get_stream_info(self) -> Optional[Dict]:
        """
        Get stream information

        Returns:
            Stream info dictionary
        """
        try:
            info = await self.js.stream_info(self.stream_name)
            return {
                "name": info.config.name,
                "messages": info.state.messages,
                "bytes": info.state.bytes,
                "first_seq": info.state.first_seq,
                "last_seq": info.state.last_seq,
            }
        except Exception as e:
            logger.error(f"Failed to get stream info: {e}")
            return None


# Global NATS service instance
_nats_service: Optional[NATSService] = None


async def get_nats_service() -> NATSService:
    """
    Get or create global NATS service instance

    Returns:
        NATSService instance
    """
    global _nats_service

    if _nats_service is None:
        _nats_service = NATSService()
        await _nats_service.connect()

    return _nats_service


async def close_nats_service() -> None:
    """Close global NATS service"""
    global _nats_service

    if _nats_service:
        await _nats_service.disconnect()
        _nats_service = None
