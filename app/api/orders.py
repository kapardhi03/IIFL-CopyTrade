"""
Order Management API Endpoints
Order placement, history, and replication
"""
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func
from typing import List, Optional
from datetime import datetime, timedelta

from app.db.database import get_db
from app.schemas.schemas import (
    OrderCreate,
    OrderResponse,
    OrderStats,
    PaginationParams
)
from app.models.models import (
    User, Order, FollowerRelationship, OrderStatus, UserRole, ReplicationMetrics
)
from app.core.auth import get_current_active_user, require_master_role
from app.services.websocket_manager import manager

# Import replication service - we'll move this to the services directory
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
from replication_service import replication_service

router = APIRouter()

@router.post("/place", response_model=OrderResponse)
async def place_order(
    order_data: OrderCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Place a new order

    If user is a master, automatically replicates to all followers
    This is the core function that triggers the entire copy trading flow

    Args:
        order_data: Order details
        background_tasks: FastAPI background tasks
        db: Database session
        current_user: Current authenticated user

    Returns:
        OrderResponse: Created order details

    Raises:
        HTTPException: If order validation fails
    """
    # Validate IIFL account is linked
    if not current_user.iifl_account_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="IIFL account not linked. Please update your profile."
        )

    # Create order record
    new_order = Order(
        user_id=current_user.id,
        symbol=order_data.symbol,
        side=order_data.side,
        order_type=order_data.order_type,
        quantity=order_data.quantity,
        price=order_data.price,
        is_master_order=(current_user.role in [UserRole.MASTER, UserRole.BOTH]),
        status=OrderStatus.PENDING
    )

    db.add(new_order)
    await db.flush()  # Get order ID without committing

    try:
        # Place order via IIFL API
        from app.services.iifl_client import get_iifl_client
        iifl_client = get_iifl_client()

        result = await iifl_client.place_order(
            account_id=current_user.iifl_account_id,
            symbol=order_data.symbol,
            side=order_data.side.value,
            quantity=order_data.quantity,
            price=float(order_data.price) if order_data.price else None,
            order_type=order_data.order_type.value
        )

        # Update order with IIFL response
        new_order.status = OrderStatus.SUBMITTED
        new_order.broker_order_id = result.get("order_id")

        await db.commit()
        await db.refresh(new_order)

        # Send WebSocket update
        await manager.send_order_update(
            current_user.id,
            new_order.id,
            OrderStatus.SUBMITTED,
            {"symbol": order_data.symbol, "quantity": order_data.quantity}
        )

        # If this is a master order, trigger replication in background
        if new_order.is_master_order:
            background_tasks.add_task(
                replicate_master_order_task,
                new_order.id
            )

        return new_order

    except Exception as e:
        # Handle order failure
        new_order.status = OrderStatus.FAILED
        new_order.error_message = str(e)
        await db.commit()

        # Send failure notification
        await manager.send_order_update(
            current_user.id,
            new_order.id,
            OrderStatus.FAILED,
            {"error": str(e)}
        )

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to place order: {str(e)}"
        )

async def replicate_master_order_task(order_id: int):
    """
    Background task to replicate master order to followers

    Args:
        order_id: Master order ID
    """
    # Create new database session for background task
    from app.db.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        try:
            # Get the master order
            order_query = select(Order).where(Order.id == order_id)
            result = await db.execute(order_query)
            master_order = result.scalar_one_or_none()

            if not master_order:
                print(f"❌ Master order {order_id} not found")
                return

            print(f"🔄 Starting replication for master order {order_id}")

            # Replicate to all followers
            replication_result = await replication_service.replicate_master_order(
                master_order, db
            )

            # Store replication metrics
            metrics = ReplicationMetrics(
                master_order_id=master_order.id,
                total_followers=replication_result.total_followers,
                successful_replications=replication_result.success_count,
                failed_replications=replication_result.failed_count,
                average_latency_ms=replication_result.avg_latency_ms,
                total_replication_time_ms=0  # Will be calculated by service
            )

            db.add(metrics)
            await db.commit()

            print(f"✅ Replication completed: {replication_result.success_count}/{replication_result.total_followers} successful")

            # Send replication update via WebSocket
            follower_ids = []  # Get from replication result
            await manager.send_replication_update(
                master_order.user_id,
                follower_ids,
                {
                    "master_order_id": master_order.id,
                    "success_count": replication_result.success_count,
                    "failed_count": replication_result.failed_count,
                    "total_followers": replication_result.total_followers,
                    "avg_latency_ms": replication_result.avg_latency_ms,
                    "symbol": master_order.symbol,
                    "side": master_order.side.value,
                    "quantity": master_order.quantity
                }
            )

        except Exception as e:
            print(f"❌ Replication task failed: {e}")

@router.get("/my-orders", response_model=List[OrderResponse])
async def get_my_orders(
    skip: int = 0,
    limit: int = 50,
    status_filter: Optional[str] = None,
    symbol_filter: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get current user's orders

    Args:
        skip: Records to skip (pagination)
        limit: Max records to return
        status_filter: Filter by order status
        symbol_filter: Filter by symbol
        db: Database session
        current_user: Current authenticated user

    Returns:
        List[OrderResponse]: User's orders
    """
    query = select(Order).where(Order.user_id == current_user.id)

    # Apply filters
    if status_filter:
        query = query.where(Order.status == status_filter)

    if symbol_filter:
        query = query.where(Order.symbol == symbol_filter.upper())

    # Order by creation time (newest first)
    query = query.order_by(desc(Order.created_at)).offset(skip).limit(limit)

    result = await db.execute(query)
    orders = result.scalars().all()

    return orders

@router.get("/{order_id}", response_model=OrderResponse)
async def get_order_details(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get specific order details

    Args:
        order_id: Order ID
        db: Database session
        current_user: Current authenticated user

    Returns:
        OrderResponse: Order details

    Raises:
        HTTPException: If order not found or not owned by user
    """
    order_query = select(Order).where(
        Order.id == order_id,
        Order.user_id == current_user.id
    )

    result = await db.execute(order_query)
    order = result.scalar_one_or_none()

    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found"
        )

    return order

@router.get("/master/{master_id}/orders", response_model=List[OrderResponse])
async def get_master_orders(
    master_id: int,
    skip: int = 0,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get master's recent orders (for followers to see trading activity)

    Args:
        master_id: Master trader ID
        skip: Records to skip
        limit: Max records to return
        db: Database session
        current_user: Current authenticated user

    Returns:
        List[OrderResponse]: Master's orders

    Raises:
        HTTPException: If not following this master
    """
    # Check if user follows this master
    follow_query = select(FollowerRelationship).where(
        FollowerRelationship.master_id == master_id,
        FollowerRelationship.follower_id == current_user.id,
        FollowerRelationship.is_active == True
    )

    follow_result = await db.execute(follow_query)
    if not follow_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not following this master"
        )

    # Get master's orders
    orders_query = (
        select(Order)
        .where(
            Order.user_id == master_id,
            Order.is_master_order == True
        )
        .order_by(desc(Order.created_at))
        .offset(skip)
        .limit(limit)
    )

    result = await db.execute(orders_query)
    orders = result.scalars().all()

    return orders

@router.get("/stats/summary", response_model=OrderStats)
async def get_order_statistics(
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get order statistics for current user

    Args:
        days: Number of days to analyze
        db: Database session
        current_user: Current authenticated user

    Returns:
        OrderStats: Order statistics
    """
    # Calculate date range
    start_date = datetime.utcnow() - timedelta(days=days)

    # Get orders in date range
    orders_query = select(Order).where(
        Order.user_id == current_user.id,
        Order.created_at >= start_date
    )

    result = await db.execute(orders_query)
    orders = result.scalars().all()

    # Calculate statistics
    total_orders = len(orders)
    successful_orders = sum(1 for order in orders if order.status in [OrderStatus.FILLED, OrderStatus.PARTIALLY_FILLED])
    failed_orders = sum(1 for order in orders if order.status == OrderStatus.FAILED)
    pending_orders = sum(1 for order in orders if order.status in [OrderStatus.PENDING, OrderStatus.SUBMITTED])

    # Calculate total volume (simplified)
    total_volume = sum(
        float(order.quantity * (order.average_price or order.price or 0))
        for order in orders
        if order.status in [OrderStatus.FILLED, OrderStatus.PARTIALLY_FILLED]
    )

    # Calculate average replication time for master orders
    master_orders = [order for order in orders if order.is_master_order and order.replication_latency_ms]
    avg_replication_time = sum(order.replication_latency_ms for order in master_orders) / len(master_orders) if master_orders else 0

    return OrderStats(
        total_orders=total_orders,
        successful_orders=successful_orders,
        failed_orders=failed_orders,
        pending_orders=pending_orders,
        total_volume=total_volume,
        success_rate=(successful_orders / total_orders * 100) if total_orders > 0 else 0,
        avg_replication_time_ms=avg_replication_time
    )

@router.delete("/{order_id}", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_order(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Cancel an order

    Args:
        order_id: Order ID to cancel
        db: Database session
        current_user: Current authenticated user

    Raises:
        HTTPException: If order not found, not owned, or cannot be cancelled
    """
    # Get order
    order_query = select(Order).where(
        Order.id == order_id,
        Order.user_id == current_user.id
    )

    result = await db.execute(order_query)
    order = result.scalar_one_or_none()

    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found"
        )

    # Check if order can be cancelled
    if order.status not in [OrderStatus.PENDING, OrderStatus.SUBMITTED]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Order cannot be cancelled"
        )

    try:
        # Cancel via IIFL API if it has a broker order ID
        if order.broker_order_id:
            from app.services.iifl_client import get_iifl_client
            iifl_client = get_iifl_client()

            # In a real implementation, you'd call the cancel order API
            # await iifl_client.cancel_order(order.broker_order_id, current_user.iifl_account_id)

        # Update order status
        order.status = OrderStatus.CANCELLED
        await db.commit()

        # Send WebSocket update
        await manager.send_order_update(
            current_user.id,
            order.id,
            OrderStatus.CANCELLED
        )

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to cancel order: {str(e)}"
        )

@router.get("/replication/{order_id}/metrics", response_model=dict)
async def get_replication_metrics(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_master_role)
):
    """
    Get replication metrics for a master order

    Args:
        order_id: Master order ID
        db: Database session
        current_user: Current authenticated user (must be master)

    Returns:
        dict: Replication metrics

    Raises:
        HTTPException: If order not found or not a master order
    """
    # Verify order belongs to current user and is a master order
    order_query = select(Order).where(
        Order.id == order_id,
        Order.user_id == current_user.id,
        Order.is_master_order == True
    )

    result = await db.execute(order_query)
    order = result.scalar_one_or_none()

    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Master order not found"
        )

    # Get replication metrics
    metrics_query = select(ReplicationMetrics).where(
        ReplicationMetrics.master_order_id == order_id
    )

    metrics_result = await db.execute(metrics_query)
    metrics = metrics_result.scalar_one_or_none()

    if not metrics:
        return {
            "order_id": order_id,
            "total_followers": 0,
            "successful_replications": 0,
            "failed_replications": 0,
            "average_latency_ms": 0,
            "replication_complete": False
        }

    return {
        "order_id": order_id,
        "total_followers": metrics.total_followers,
        "successful_replications": metrics.successful_replications,
        "failed_replications": metrics.failed_replications,
        "average_latency_ms": float(metrics.average_latency_ms),
        "total_replication_time_ms": float(metrics.total_replication_time_ms),
        "success_rate": (metrics.successful_replications / metrics.total_followers * 100) if metrics.total_followers > 0 else 0,
        "replication_complete": True
    }