"""
Order Replication Service - CORE BUSINESS LOGIC
This is the heart of your copy trading platform
"""
import asyncio
from typing import List, Dict
from datetime import datetime
from decimal import Decimal
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Order, User, FollowerRelationship, OrderStatus, CopyStrategy
from app.schemas.schemas import OrderCreate, ReplicationResult
from app.services.iifl_client_v2 import get_iifl_client_v2
from app.services.websocket_manager import manager

class OrderReplicationService:
    """
    Handles replication of master orders to all followers
    This is the critical 100-250ms latency path
    """
    
    def __init__(self):
        self.iifl_client = get_iifl_client_v2()
        self.semaphore = asyncio.Semaphore(50)  # Limit concurrent API calls
    
    async def replicate_master_order(
        self,
        master_order: Order,
        db: AsyncSession
    ) -> ReplicationResult:
        """
        Main replication function
        
        Flow:
        1. Get all active followers
        2. Calculate order quantities for each follower
        3. Execute all follower orders in parallel
        4. Track results and latency
        
        Target: <250ms for first follower, <30s for all 500
        """
        start_time = datetime.utcnow()
        
        # Get all active followers for this master
        followers = await self._get_active_followers(master_order.user_id, db)
        
        if not followers:
            return ReplicationResult(
                success_count=0,
                failed_count=0,
                total_followers=0,
                avg_latency_ms=0,
                failed_followers=[]
            )
        
        # Calculate follower orders
        follower_orders = await self._calculate_follower_orders(
            master_order,
            followers,
            db
        )
        
        # Execute all follower orders in parallel
        results = await self._execute_parallel_orders(follower_orders, db)
        
        # Calculate metrics
        total_time = (datetime.utcnow() - start_time).total_seconds() * 1000
        success_count = sum(1 for r in results if r["success"])
        failed_count = len(results) - success_count
        failed_followers = [r["follower_id"] for r in results if not r["success"]]
        
        # Calculate average latency for successful orders
        successful_latencies = [r["latency_ms"] for r in results if r["success"]]
        avg_latency = sum(successful_latencies) / len(successful_latencies) if successful_latencies else 0
        
        print(f"✅ Replication complete: {success_count}/{len(followers)} successful in {total_time:.2f}ms")
        print(f"📊 Average latency: {avg_latency:.2f}ms")
        
        return ReplicationResult(
            success_count=success_count,
            failed_count=failed_count,
            total_followers=len(followers),
            avg_latency_ms=avg_latency,
            failed_followers=failed_followers
        )
    
    async def _get_active_followers(
        self,
        master_id: int,
        db: AsyncSession
    ) -> List[tuple[User, FollowerRelationship]]:
        """Get all active followers for a master"""
        query = (
            select(User, FollowerRelationship)
            .join(FollowerRelationship, FollowerRelationship.follower_id == User.id)
            .where(
                FollowerRelationship.master_id == master_id,
                FollowerRelationship.is_active == True,
                User.is_active == True
            )
        )
        
        result = await db.execute(query)
        return result.all()
    
    async def _calculate_follower_orders(
        self,
        master_order: Order,
        followers: List[tuple[User, FollowerRelationship]],
        db: AsyncSession
    ) -> List[Dict]:
        """
        Calculate order quantity for each follower based on their copy strategy
        
        Strategies:
        - FIXED_RATIO: quantity * ratio (e.g., 1:2 means 2x master's quantity)
        - PERCENTAGE: % of follower's available capital
        - FIXED_QUANTITY: Always same quantity regardless of master
        """
        follower_orders = []
        
        for user, relationship in followers:
            if relationship.copy_strategy == CopyStrategy.FIXED_RATIO:
                quantity = int(master_order.quantity * relationship.ratio)
            
            elif relationship.copy_strategy == CopyStrategy.PERCENTAGE:
                # Calculate based on % of follower's balance
                # Simplified: (balance * percentage / 100) / price
                if master_order.price:
                    affordable = (user.balance * relationship.percentage / 100) / master_order.price
                    quantity = int(affordable)
                else:
                    quantity = master_order.quantity  # Fallback for market orders
            
            elif relationship.copy_strategy == CopyStrategy.FIXED_QUANTITY:
                quantity = relationship.fixed_quantity
            
            else:
                quantity = master_order.quantity  # Default
            
            # Skip if quantity is 0
            if quantity <= 0:
                continue

            # OPTIONAL: Risk Management Enforcement
            # Uncomment these lines to enforce risk limits:

            # order_value = quantity * (master_order.price or 2500)  # Estimate if market order
            # if order_value > relationship.max_order_value:
            #     print(f"⚠️ Order value ₹{order_value:,.2f} exceeds limit ₹{relationship.max_order_value:,.2f} for {user.username}")
            #     continue  # Skip this follower

            # TODO: Add daily loss checking here if needed
            
            follower_orders.append({
                "user_id": user.id,
                "follower_id": user.id,
                "iifl_account_id": user.iifl_account_id,
                "symbol": master_order.symbol,
                "side": master_order.side,
                "order_type": master_order.order_type,
                "quantity": quantity,
                "price": master_order.price,
                "master_order_id": master_order.id
            })
        
        return follower_orders
    
    async def _execute_parallel_orders(
        self,
        follower_orders: List[Dict],
        db: AsyncSession
    ) -> List[Dict]:
        """
        Execute all follower orders in parallel
        THIS IS THE CRITICAL PERFORMANCE PATH
        
        Uses asyncio.gather() with semaphore to limit concurrency
        Target: 50 concurrent IIFL API calls
        """
        
        async def execute_single_order(order_data: Dict) -> Dict:
            """Execute one follower order"""
            start_time = datetime.utcnow()
            
            # Create order record in database
            follower_order = Order(
                user_id=order_data["user_id"],
                symbol=order_data["symbol"],
                side=order_data["side"],
                order_type=order_data["order_type"],
                quantity=order_data["quantity"],
                price=order_data["price"],
                master_order_id=order_data["master_order_id"],
                is_master_order=False,
                status=OrderStatus.PENDING
            )
            
            db.add(follower_order)
            await db.flush()  # Get order ID
            
            # Use semaphore to limit concurrent API calls
            async with self.semaphore:
                try:
                    # Get user object for IIFL credentials
                    user_query = select(User).where(User.id == order_data["user_id"])
                    user_result = await db.execute(user_query)
                    user = user_result.scalar_one_or_none()

                    if not user:
                        raise Exception(f"User {order_data['user_id']} not found")

                    # Place order via IIFL API V2 with exact structure
                    result = await self.iifl_client.place_order(
                        user=user,
                        symbol=order_data["symbol"],
                        side=order_data["side"].value,
                        quantity=order_data["quantity"],
                        price=float(order_data["price"]) if order_data["price"] else None,
                        order_type="LIMIT" if order_data["price"] else "MARKET",
                        db=db
                    )
                    
                    # Update order status with IIFL response data
                    if result.get("success"):
                        follower_order.status = OrderStatus.SUBMITTED
                        follower_order.broker_order_id = result.get("order_id")
                        # Store additional IIFL data
                        follower_order.exchange_order_id = result.get("exchange_order_id")
                        follower_order.remote_order_id = result.get("remote_order_id")
                    
                    # Calculate latency
                    latency_ms = (datetime.utcnow() - start_time).total_seconds() * 1000
                    follower_order.replication_latency_ms = int(latency_ms)
                    
                    # Send WebSocket update
                    await manager.send_order_update(
                        order_data["user_id"],
                        follower_order.id,
                        OrderStatus.SUBMITTED
                    )
                    
                    return {
                        "success": True,
                        "follower_id": order_data["follower_id"],
                        "order_id": follower_order.id,
                        "latency_ms": latency_ms
                    }
                
                except Exception as e:
                    # Handle failure
                    follower_order.status = OrderStatus.FAILED
                    follower_order.error_message = str(e)
                    
                    print(f"❌ Order failed for follower {order_data['follower_id']}: {e}")
                    
                    return {
                        "success": False,
                        "follower_id": order_data["follower_id"],
                        "error": str(e),
                        "latency_ms": 0
                    }
        
        # Execute all orders in parallel
        results = await asyncio.gather(
            *[execute_single_order(order) for order in follower_orders],
            return_exceptions=True
        )
        
        # Commit all database changes
        await db.commit()
        
        # Handle any exceptions that occurred
        processed_results = []
        for result in results:
            if isinstance(result, Exception):
                processed_results.append({
                    "success": False,
                    "follower_id": -1,
                    "error": str(result),
                    "latency_ms": 0
                })
            else:
                processed_results.append(result)
        
        return processed_results

# Global instance
replication_service = OrderReplicationService()
