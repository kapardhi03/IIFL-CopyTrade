"""
Order Worker - Processes order events from NATS and replicates to followers
This is the CORE component that executes trades for follower accounts

CRITICAL BUSINESS LOGIC:
- NEW order → Create follower orders
- MODIFY order → Modify existing follower orders ONLY
- CANCEL order → Cancel existing follower orders
- NO double trades, NO orphan orders, STRICT idempotency
"""
import asyncio
import logging
import json
from typing import Dict, List, Optional
from datetime import datetime
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select
from nats.aio.msg import Msg

from app.core.config import settings
from app.core.exceptions import (
    OrderError,
    OrderMappingError,
    IIFLOrderError,
    FollowerNotFoundError
)
from app.models.models import (
    User,
    Order,
    FollowerRelationship,
    OrderMap,
    AuditLog,
    AuditActionType,
    OrderSide,
    OrderType,
    OrderStatus
)
from app.services.nats_service import get_nats_service, NATSService
from app.services.redis_service import get_redis_service, RedisService
from app.services.iifl.normal_client import IIFLNormalClient
from app.schemas.webhook import NormalizedOrderEvent

logger = logging.getLogger(__name__)


class OrderWorker:
    """
    Order Worker - Consumes NATS events and replicates to followers
    """

    def __init__(self):
        """Initialize Order Worker"""
        self.nats_service: Optional[NATSService] = None
        self.redis_service: Optional[RedisService] = None
        self.iifl_client: Optional[IIFLNormalClient] = None
        self.db_engine = None
        self.async_session = None
        self.running = False

    async def initialize(self):
        """Initialize services"""
        logger.info("Initializing Order Worker...")

        # Initialize NATS
        self.nats_service = await get_nats_service()

        # Initialize Redis
        self.redis_service = await get_redis_service()

        # Initialize IIFL client
        self.iifl_client = IIFLNormalClient()

        # Initialize database
        self.db_engine = create_async_engine(
            settings.DATABASE_URL,
            echo=False,
            pool_size=settings.DB_POOL_SIZE,
            max_overflow=settings.DB_MAX_OVERFLOW
        )
        self.async_session = sessionmaker(
            self.db_engine,
            class_=AsyncSession,
            expire_on_commit=False
        )

        logger.info("Order Worker initialized successfully")

    async def start(self):
        """Start the worker"""
        logger.info("Starting Order Worker...")
        self.running = True

        # Subscribe to order events
        await self.nats_service.subscribe_order_events(
            callback=self.process_order_event
        )

        logger.info("Order Worker started and listening for events")

        # Keep running
        while self.running:
            await asyncio.sleep(1)

    async def stop(self):
        """Stop the worker"""
        logger.info("Stopping Order Worker...")
        self.running = False

        if self.iifl_client:
            await self.iifl_client.close()

        logger.info("Order Worker stopped")

    async def process_order_event(self, msg: Msg):
        """
        Process order event from NATS

        Args:
            msg: NATS message containing order event
        """
        start_time = datetime.utcnow()

        try:
            # Parse event data
            event_data = NATSService.parse_order_event(msg)

            if not event_data:
                logger.error("Failed to parse order event")
                await msg.nak()
                return

            # Extract event details
            event_type = event_data.get("event_type")
            master_order_id = event_data.get("master_order_id")
            order_data = event_data.get("order_data", {})

            logger.info(
                f"Processing order event: type={event_type}, "
                f"master_order_id={master_order_id}"
            )

            # Process based on event type
            if "order.new" in event_type:
                await self.handle_new_order(master_order_id, order_data)
            elif "order.modified" in event_type:
                await self.handle_modify_order(master_order_id, order_data)
            elif "order.cancelled" in event_type:
                await self.handle_cancel_order(master_order_id, order_data)
            else:
                logger.warning(f"Unknown event type: {event_type}")

            # Acknowledge message
            await msg.ack()

            processing_time = (datetime.utcnow() - start_time).total_seconds() * 1000
            logger.info(
                f"Order event processed: master_order_id={master_order_id}, "
                f"processing_time={processing_time:.2f}ms"
            )

        except Exception as e:
            logger.error(f"Error processing order event: {e}", exc_info=True)
            # Negative acknowledge with delay for retry
            await msg.nak(delay=5)

    async def handle_new_order(
        self,
        master_order_id: int,
        order_data: Dict
    ):
        """
        Handle new order event - create follower orders

        Args:
            master_order_id: Master order ID
            order_data: Order data from event
        """
        async with self.async_session() as db:
            try:
                # Get master order and user
                master_order = await db.get(Order, master_order_id)
                if not master_order:
                    logger.error(f"Master order not found: {master_order_id}")
                    return

                master_user = await db.get(User, master_order.user_id)

                # Get active followers
                stmt = select(FollowerRelationship).where(
                    FollowerRelationship.master_id == master_user.id,
                    FollowerRelationship.is_active == True,
                    FollowerRelationship.auto_follow == True
                )
                result = await db.execute(stmt)
                follower_relationships = result.scalars().all()

                if not follower_relationships:
                    logger.info(f"No active followers for master: {master_user.id}")
                    return

                logger.info(
                    f"Replicating to {len(follower_relationships)} followers"
                )

                # Create audit log for replication start
                audit_log = AuditLog(
                    action_type=AuditActionType.REPLICATION_STARTED,
                    action_description=f"Starting replication for order {master_order_id}",
                    user_id=master_user.id,
                    master_order_id=master_order_id,
                    success=True,
                    metadata=json.dumps({"follower_count": len(follower_relationships)})
                )
                db.add(audit_log)
                await db.commit()

                # Execute orders for all followers in parallel
                tasks = []
                for relationship in follower_relationships:
                    task = self.execute_follower_order(
                        db=db,
                        master_order=master_order,
                        follower_relationship=relationship,
                        order_data=order_data
                    )
                    tasks.append(task)

                # Wait for all follower orders
                results = await asyncio.gather(*tasks, return_exceptions=True)

                # Count successes and failures
                success_count = sum(1 for r in results if r and not isinstance(r, Exception))
                failed_count = len(results) - success_count

                # Create completion audit log
                audit_log = AuditLog(
                    action_type=AuditActionType.REPLICATION_COMPLETED,
                    action_description=f"Replication completed: {success_count} success, {failed_count} failed",
                    user_id=master_user.id,
                    master_order_id=master_order_id,
                    success=failed_count == 0,
                    metadata=json.dumps({
                        "total": len(results),
                        "success": success_count,
                        "failed": failed_count
                    })
                )
                db.add(audit_log)
                await db.commit()

                logger.info(
                    f"Replication completed: master_order_id={master_order_id}, "
                    f"success={success_count}, failed={failed_count}"
                )

            except Exception as e:
                logger.error(f"Error handling new order: {e}", exc_info=True)
                raise

    async def execute_follower_order(
        self,
        db: AsyncSession,
        master_order: Order,
        follower_relationship: FollowerRelationship,
        order_data: Dict
    ) -> Optional[int]:
        """
        Execute order for a single follower

        Args:
            db: Database session
            master_order: Master order
            follower_relationship: Follower relationship
            order_data: Order data

        Returns:
            Follower order ID if successful, None otherwise
        """
        try:
            # Get follower user
            follower_user = await db.get(User, follower_relationship.follower_id)

            if not follower_user or not follower_user.is_active:
                logger.warning(f"Follower user inactive: {follower_relationship.follower_id}")
                return None

            # Calculate follower quantity based on scaling factor
            follower_quantity = int(master_order.quantity * follower_relationship.ratio)

            if follower_quantity <= 0:
                logger.warning(
                    f"Calculated quantity is 0 for follower {follower_user.id}"
                )
                return None

            logger.info(
                f"Executing order for follower: user_id={follower_user.id}, "
                f"quantity={follower_quantity} (scaled from {master_order.quantity})"
            )

            # Get or create IIFL session token
            token = await self.get_iifl_token(follower_user)

            # Place order via IIFL API
            iifl_response = await self.iifl_client.place_order(
                token=token,
                exchange=order_data.get("exchange", "N"),
                exchange_type=order_data.get("exchange_type", "C"),
                scrip_code=order_data.get("scrip_code"),
                qty=follower_quantity,
                price=master_order.price or 0,
                order_type=master_order.side.value,
                is_intraday=order_data.get("is_intraday", False),
                client_code=follower_user.iifl_account_id,
                public_ip=follower_user.iifl_public_ip or "127.0.0.1"
            )

            # Create follower order in database
            follower_order = Order(
                user_id=follower_user.id,
                master_order_id=master_order.id,
                is_master_order=False,
                symbol=master_order.symbol,
                side=master_order.side,
                order_type=master_order.order_type,
                quantity=follower_quantity,
                price=master_order.price,
                status=OrderStatus.SUBMITTED,
                broker_order_id=iifl_response.get("BrokerOrderID"),
                exchange_order_id=iifl_response.get("ExchOrderID")
            )
            db.add(follower_order)
            await db.flush()

            # Store order mapping in Redis
            await self.redis_service.set_order_mapping(
                master_order_id=master_order.id,
                follower_user_id=follower_user.id,
                follower_order_id=follower_order.id,
                follower_broker_order_id=follower_order.broker_order_id
            )

            # Store order mapping in PostgreSQL
            order_map = OrderMap(
                master_order_id=master_order.id,
                master_user_id=master_order.user_id,
                master_broker_order_id=master_order.broker_order_id,
                follower_order_id=follower_order.id,
                follower_user_id=follower_user.id,
                follower_broker_order_id=follower_order.broker_order_id,
                scaling_factor=follower_relationship.ratio,
                original_quantity=master_order.quantity,
                follower_quantity=follower_quantity,
                replication_status="SUCCESS"
            )
            db.add(order_map)
            await db.commit()

            logger.info(
                f"Follower order created: follower_order_id={follower_order.id}, "
                f"broker_order_id={follower_order.broker_order_id}"
            )

            return follower_order.id

        except IIFLOrderError as e:
            logger.error(f"IIFL order error for follower {follower_user.id}: {e}")
            # Store failed mapping
            await self.store_failed_order_map(
                db, master_order, follower_user, str(e)
            )
            return None
        except Exception as e:
            logger.error(f"Error executing follower order: {e}", exc_info=True)
            return None

    async def handle_modify_order(
        self,
        master_order_id: int,
        order_data: Dict
    ):
        """
        Handle order modification - modify existing follower orders ONLY

        CRITICAL: Never create new orders on modify, only update existing ones

        Args:
            master_order_id: Master order ID
            order_data: Modified order data
        """
        async with self.async_session() as db:
            try:
                # Get order mapping from Redis
                order_mapping = await self.redis_service.get_order_mapping(master_order_id)

                if not order_mapping:
                    logger.warning(f"No order mapping found for master order: {master_order_id}")
                    return

                logger.info(
                    f"Modifying {len(order_mapping)} follower orders for master: {master_order_id}"
                )

                # Modify each follower order
                for follower_user_id, mapping_data in order_mapping.items():
                    follower_order_id = mapping_data.get("follower_order_id")

                    if not follower_order_id:
                        continue

                    await self.modify_follower_order(
                        db=db,
                        follower_order_id=follower_order_id,
                        order_data=order_data
                    )

                await db.commit()

                logger.info(f"Order modification completed for master: {master_order_id}")

            except Exception as e:
                logger.error(f"Error handling modify order: {e}", exc_info=True)
                raise

    async def modify_follower_order(
        self,
        db: AsyncSession,
        follower_order_id: int,
        order_data: Dict
    ):
        """
        Modify a single follower order

        Args:
            db: Database session
            follower_order_id: Follower order ID
            order_data: Modified order data
        """
        try:
            follower_order = await db.get(Order, follower_order_id)

            if not follower_order:
                logger.error(f"Follower order not found: {follower_order_id}")
                return

            follower_user = await db.get(User, follower_order.user_id)
            token = await self.get_iifl_token(follower_user)

            # Call IIFL modify API
            await self.iifl_client.modify_order(
                token=token,
                client_code=follower_user.iifl_account_id,
                broker_order_id=follower_order.broker_order_id,
                exchange_order_id=follower_order.exchange_order_id or "",
                traded_qty=follower_order.filled_quantity,
                qty=follower_order.quantity,
                price=order_data.get("price", follower_order.price),
                exchange=order_data.get("exchange", "N"),
                exchange_type=order_data.get("exchange_type", "C"),
                scrip_code=order_data.get("scrip_code"),
                public_ip=follower_user.iifl_public_ip or "127.0.0.1"
            )

            # Update follower order in database
            follower_order.price = order_data.get("price", follower_order.price)
            await db.commit()

            logger.info(f"Follower order modified: {follower_order_id}")

        except Exception as e:
            logger.error(f"Error modifying follower order: {e}", exc_info=True)

    async def handle_cancel_order(
        self,
        master_order_id: int,
        order_data: Dict
    ):
        """
        Handle order cancellation - cancel all follower orders

        Args:
            master_order_id: Master order ID
            order_data: Order data
        """
        async with self.async_session() as db:
            try:
                # Get order mapping
                order_mapping = await self.redis_service.get_order_mapping(master_order_id)

                if not order_mapping:
                    logger.warning(f"No order mapping found for cancellation: {master_order_id}")
                    return

                logger.info(
                    f"Cancelling {len(order_mapping)} follower orders for master: {master_order_id}"
                )

                # Cancel each follower order
                for follower_user_id, mapping_data in order_mapping.items():
                    follower_order_id = mapping_data.get("follower_order_id")

                    if not follower_order_id:
                        continue

                    await self.cancel_follower_order(
                        db=db,
                        follower_order_id=follower_order_id,
                        order_data=order_data
                    )

                await db.commit()

                logger.info(f"Order cancellation completed for master: {master_order_id}")

            except Exception as e:
                logger.error(f"Error handling cancel order: {e}", exc_info=True)
                raise

    async def cancel_follower_order(
        self,
        db: AsyncSession,
        follower_order_id: int,
        order_data: Dict
    ):
        """
        Cancel a single follower order

        Args:
            db: Database session
            follower_order_id: Follower order ID
            order_data: Order data
        """
        try:
            follower_order = await db.get(Order, follower_order_id)

            if not follower_order:
                logger.error(f"Follower order not found: {follower_order_id}")
                return

            follower_user = await db.get(User, follower_order.user_id)
            token = await self.get_iifl_token(follower_user)

            # Call IIFL cancel API
            await self.iifl_client.cancel_order(
                token=token,
                client_code=follower_user.iifl_account_id,
                broker_order_id=follower_order.broker_order_id,
                exchange_order_id=follower_order.exchange_order_id or "",
                traded_qty=follower_order.filled_quantity,
                exchange=order_data.get("exchange", "N"),
                exchange_type=order_data.get("exchange_type", "C"),
                scrip_code=order_data.get("scrip_code"),
                public_ip=follower_user.iifl_public_ip or "127.0.0.1"
            )

            # Update follower order status
            follower_order.status = OrderStatus.CANCELLED
            await db.commit()

            logger.info(f"Follower order cancelled: {follower_order_id}")

        except Exception as e:
            logger.error(f"Error cancelling follower order: {e}", exc_info=True)

    async def get_iifl_token(self, user: User) -> str:
        """
        Get IIFL authentication token for user (cached or new)

        Args:
            user: User object

        Returns:
            Authentication token
        """
        # Check Redis cache first
        cached_token = await self.redis_service.get_iifl_token(user.id)

        if cached_token:
            return cached_token

        # Authenticate and cache token
        auth_data = await self.iifl_client.authenticate_user(
            user_id=user.iifl_user_id or user.iifl_account_id,
            password=user.iifl_password,
            public_ip=user.iifl_public_ip or "127.0.0.1"
        )

        token = auth_data.get("token")

        # Cache for 50 minutes (tokens usually valid for 1 hour)
        await self.redis_service.cache_iifl_token(
            user_id=user.id,
            token=token,
            expire_seconds=3000
        )

        return token

    async def store_failed_order_map(
        self,
        db: AsyncSession,
        master_order: Order,
        follower_user: User,
        error_message: str
    ):
        """Store failed order mapping for audit"""
        try:
            order_map = OrderMap(
                master_order_id=master_order.id,
                master_user_id=master_order.user_id,
                master_broker_order_id=master_order.broker_order_id,
                follower_order_id=0,  # No order created
                follower_user_id=follower_user.id,
                follower_broker_order_id="",
                scaling_factor=Decimal("1.0"),
                original_quantity=master_order.quantity,
                follower_quantity=0,
                replication_status="FAILED",
                error_message=error_message
            )
            db.add(order_map)
            await db.commit()
        except Exception as e:
            logger.error(f"Error storing failed order map: {e}")


# Entry point for running the worker
async def main():
    """Main entry point for order worker"""
    worker = OrderWorker()

    try:
        await worker.initialize()
        await worker.start()
    except KeyboardInterrupt:
        logger.info("Received shutdown signal")
    finally:
        await worker.stop()


if __name__ == "__main__":
    import sys
    from app.core.logging_config import setup_logging

    # Setup logging
    setup_logging(log_level="INFO")

    # Run worker
    asyncio.run(main())
