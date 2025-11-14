"""
Webhook endpoints for receiving IIFL Blaze order events
Handles incoming webhooks, normalizes data, and publishes to NATS
"""
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import logging
from datetime import datetime

from app.schemas.webhook import (
    BlazeOrderWebhook,
    BlazeWebhookResponse,
    NormalizedOrderEvent
)
from app.models.models import User, Order, AuditLog, AuditActionType, UserRole, OrderSide, OrderType, OrderStatus
from app.services.nats_service import get_nats_service, OrderEvent
from app.services.redis_service import get_redis_service
from app.db.database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["Webhooks"])


def normalize_blaze_webhook(webhook: BlazeOrderWebhook, master_order_id: int, master_user_id: int) -> NormalizedOrderEvent:
    """
    Normalize Blaze webhook to internal order event format

    Args:
        webhook: Blaze webhook data
        master_order_id: Internal master order ID
        master_user_id: Master user ID

    Returns:
        Normalized order event
    """
    # Map event type
    event_type_map = {
        "order_placed": "NEW",
        "order_modified": "MODIFY",
        "order_cancelled": "CANCEL",
        "order_filled": "FILL"
    }

    # Map order type
    order_type = webhook.order_type.upper()
    if order_type in ["MARKET", "MKT"]:
        order_type = "MARKET"
    elif order_type in ["LIMIT", "LMT"]:
        order_type = "LIMIT"
    elif order_type in ["SL", "STOPLOSS"]:
        order_type = "STOP_LOSS"
    elif order_type in ["SLM", "SL-M"]:
        order_type = "STOP_LOSS_MARKET"

    # Map exchange
    exchange_map = {
        "NSE": "N",
        "BSE": "B",
        "NFO": "N",
        "MCX": "M"
    }
    exchange = exchange_map.get(webhook.exchange.upper(), "N")

    # Map exchange type
    exchange_type_map = {
        "CASH": "C",
        "FO": "D",
        "FUTURES": "D",
        "OPTIONS": "D"
    }
    exchange_type = exchange_type_map.get(webhook.segment.upper(), "C")

    # Determine if intraday
    is_intraday = webhook.product.upper() in ["INTRADAY", "MIS", "BO", "CO"]

    return NormalizedOrderEvent(
        source="blaze",
        master_order_id=master_order_id,
        master_user_id=master_user_id,
        master_broker_order_id=webhook.broker_order_id,
        event_type=event_type_map.get(webhook.event_type, "NEW"),
        symbol=webhook.symbol.upper(),
        scrip_code=webhook.scrip_code or 0,
        exchange=exchange,
        exchange_type=exchange_type,
        side=webhook.transaction_type.upper(),
        order_type=order_type,
        quantity=webhook.quantity,
        price=webhook.price or 0,
        trigger_price=webhook.trigger_price or 0,
        disclosed_quantity=webhook.disclosed_quantity or 0,
        filled_quantity=webhook.filled_quantity or 0,
        average_price=webhook.average_price or 0,
        pending_quantity=webhook.pending_quantity or webhook.quantity,
        status=webhook.status.upper(),
        product=webhook.product.upper(),
        validity=webhook.validity.upper(),
        is_intraday=is_intraday,
        timestamp=webhook.timestamp or datetime.utcnow(),
        metadata=webhook.metadata or {}
    )


@router.post(
    "/blaze/order",
    response_model=BlazeWebhookResponse,
    summary="Receive Blaze Order Webhook",
    description="Endpoint to receive order webhooks from IIFL Blaze (master account)"
)
async def receive_blaze_order_webhook(
    webhook: BlazeOrderWebhook,
    background_tasks: BackgroundTasks,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Receive and process Blaze order webhook

    Flow:
    1. Receive webhook from Blaze
    2. Validate master account exists
    3. Create/update order in database
    4. Normalize webhook data
    5. Publish to NATS for worker processing
    6. Log audit entry
    7. Return acknowledgment

    Args:
        webhook: Blaze webhook payload
        background_tasks: FastAPI background tasks
        request: HTTP request object
        db: Database session

    Returns:
        Webhook acknowledgment response
    """
    start_time = datetime.utcnow()

    try:
        logger.info(
            f"Received Blaze webhook: event={webhook.event_type}, "
            f"order_id={webhook.order_id}, symbol={webhook.symbol}"
        )

        # Find master user by account ID
        stmt = select(User).where(
            User.role == UserRole.MASTER,
            User.iifl_account_id == webhook.account_id
        )
        result = await db.execute(stmt)
        master_user = result.scalar_one_or_none()

        if not master_user:
            logger.error(f"Master account not found: {webhook.account_id}")
            raise HTTPException(
                status_code=404,
                detail=f"Master account not found: {webhook.account_id}"
            )

        # Create or update master order in database
        order_stmt = select(Order).where(
            Order.broker_order_id == webhook.order_id,
            Order.user_id == master_user.id
        )
        order_result = await db.execute(order_stmt)
        master_order = order_result.scalar_one_or_none()

        if not master_order:
            # Create new order
            master_order = Order(
                user_id=master_user.id,
                is_master_order=True,
                symbol=webhook.symbol.upper(),
                side=OrderSide.BUY if webhook.transaction_type.upper() == "BUY" else OrderSide.SELL,
                order_type=OrderType.MARKET if webhook.order_type.upper() in ["MARKET", "MKT"] else OrderType.LIMIT,
                quantity=webhook.quantity,
                price=webhook.price,
                filled_quantity=webhook.filled_quantity or 0,
                average_price=webhook.average_price or 0,
                status=OrderStatus.PENDING,
                broker_order_id=webhook.order_id,
                exchange_order_id=webhook.exchange_order_id,
            )
            db.add(master_order)
            await db.commit()
            await db.refresh(master_order)

            logger.info(f"Created master order: id={master_order.id}")
        else:
            # Update existing order
            master_order.filled_quantity = webhook.filled_quantity or 0
            master_order.average_price = webhook.average_price or 0
            master_order.exchange_order_id = webhook.exchange_order_id

            # Update status based on webhook
            if webhook.status.upper() in ["COMPLETE", "FILLED"]:
                master_order.status = OrderStatus.FILLED
                master_order.filled_at = datetime.utcnow()
            elif webhook.status.upper() in ["CANCELLED", "CANCELED"]:
                master_order.status = OrderStatus.CANCELLED
            elif webhook.status.upper() == "REJECTED":
                master_order.status = OrderStatus.REJECTED

            await db.commit()
            await db.refresh(master_order)

            logger.info(f"Updated master order: id={master_order.id}")

        # Get follower count for response
        from sqlalchemy import func as sql_func
        from app.models.models import FollowerRelationship

        follower_count_stmt = select(sql_func.count(FollowerRelationship.id)).where(
            FollowerRelationship.master_id == master_user.id,
            FollowerRelationship.is_active == True
        )
        follower_count_result = await db.execute(follower_count_stmt)
        follower_count = follower_count_result.scalar() or 0

        # Normalize webhook to internal format
        normalized_event = normalize_blaze_webhook(
            webhook=webhook,
            master_order_id=master_order.id,
            master_user_id=master_user.id
        )

        # Publish to NATS for worker processing
        nats_service = await get_nats_service()

        if webhook.event_type == "order_placed":
            await nats_service.publish_new_order(
                master_order_id=master_order.id,
                order_data=normalized_event.dict()
            )
        elif webhook.event_type == "order_modified":
            await nats_service.publish_modify_order(
                master_order_id=master_order.id,
                order_data=normalized_event.dict()
            )
        elif webhook.event_type == "order_cancelled":
            await nats_service.publish_cancel_order(
                master_order_id=master_order.id,
                order_data=normalized_event.dict()
            )

        # Create audit log
        audit_log = AuditLog(
            action_type=AuditActionType.WEBHOOK_RECEIVED,
            action_description=f"Blaze webhook: {webhook.event_type} for {webhook.symbol}",
            user_id=master_user.id,
            master_order_id=master_order.id,
            request_id=request.headers.get("X-Request-ID"),
            ip_address=request.client.host,
            metadata=webhook.dict(exclude_none=True),
            success=True
        )
        db.add(audit_log)
        await db.commit()

        # Return success response
        processing_time = (datetime.utcnow() - start_time).total_seconds() * 1000

        logger.info(
            f"Webhook processed successfully: "
            f"master_order_id={master_order.id}, "
            f"followers={follower_count}, "
            f"processing_time={processing_time:.2f}ms"
        )

        return BlazeWebhookResponse(
            success=True,
            message="Webhook processed and replication initiated",
            processed_at=datetime.utcnow(),
            replication_initiated=follower_count > 0,
            follower_count=follower_count
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Webhook processing error: {e}", exc_info=True)

        # Log failed audit entry
        try:
            audit_log = AuditLog(
                action_type=AuditActionType.WEBHOOK_RECEIVED,
                action_description=f"Blaze webhook failed: {webhook.event_type}",
                request_id=request.headers.get("X-Request-ID"),
                ip_address=request.client.host,
                metadata=webhook.dict(exclude_none=True),
                success=False,
                error_message=str(e)
            )
            db.add(audit_log)
            await db.commit()
        except:
            pass

        raise HTTPException(
            status_code=500,
            detail=f"Webhook processing failed: {str(e)}"
        )


@router.get(
    "/health",
    summary="Webhook Health Check",
    description="Check if webhook endpoint is healthy"
)
async def webhook_health():
    """Health check for webhook endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "service": "webhook-handler"
    }
