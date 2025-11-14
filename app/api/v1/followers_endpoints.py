"""
Follower Account Management and Master-Follower Mapping API Endpoints
"""
from fastapi import APIRouter, HTTPException, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List
from decimal import Decimal
import logging

from app.db.database import get_db
from app.models.models import (
    User,
    UserRole,
    FollowerRelationship,
    Order,
    AuditLog,
    AuditActionType
)
from app.schemas.follower import (
    FollowerCreate,
    FollowerResponse,
    FollowerUpdate,
    FollowerWithStats,
    MasterFollowerMappingCreate,
    MasterFollowerMappingUpdate,
    MasterFollowerMappingResponse
)
from app.core.security import hash_password, get_encryption_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Followers"])


# ============================================
# FOLLOWER ACCOUNT MANAGEMENT
# ============================================
@router.post(
    "/followers",
    response_model=FollowerResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create Follower Account",
    description="Create a new follower trading account with IIFL Normal REST API credentials"
)
async def create_follower(
    follower_data: FollowerCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    Create a new follower account

    Required fields:
    - username: Unique username
    - name: Full name
    - email: Email address
    - iifl_customer_code: IIFL client code
    - iifl_user_id: IIFL user ID
    - iifl_password: IIFL password
    - Optional: scaling_factor (default 1.0)
    """
    try:
        # Check if username or email already exists
        stmt = select(User).where(
            (User.username == follower_data.username) |
            (User.email == follower_data.email)
        )
        result = await db.execute(stmt)
        existing_user = result.scalar_one_or_none()

        if existing_user:
            if existing_user.username == follower_data.username:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Username '{follower_data.username}' already exists"
                )
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Email '{follower_data.email}' already exists"
                )

        # Check if IIFL customer code already registered
        stmt = select(User).where(User.iifl_account_id == follower_data.iifl_customer_code)
        result = await db.execute(stmt)
        existing_iifl = result.scalar_one_or_none()

        if existing_iifl:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"IIFL customer code '{follower_data.iifl_customer_code}' already registered"
            )

        # Encrypt sensitive credentials
        encryption_service = get_encryption_service()

        # Hash platform password
        hashed_password = hash_password(
            follower_data.password or "default_password_change_me"
        )

        # Encrypt IIFL password
        encrypted_iifl_password = encryption_service.encrypt(follower_data.iifl_password)

        # Create follower user
        follower_user = User(
            username=follower_data.username,
            email=follower_data.email,
            hashed_password=hashed_password,
            full_name=follower_data.name,
            role=UserRole.FOLLOWER,
            is_active=True,
            is_verified=True,
            iifl_account_id=follower_data.iifl_customer_code,
            iifl_user_id=follower_data.iifl_user_id,
            iifl_password=encrypted_iifl_password,
            iifl_public_ip=follower_data.iifl_public_ip or "127.0.0.1",
            iifl_app_name=follower_data.iifl_app_name or "CopyTrade",
            balance=Decimal(str(follower_data.initial_balance or 100000.0))
        )

        db.add(follower_user)
        await db.commit()
        await db.refresh(follower_user)

        # Create audit log
        audit_log = AuditLog(
            action_type=AuditActionType.FOLLOWER_CREATED,
            action_description=f"Follower account created: {follower_data.name}",
            user_id=follower_user.id,
            success=True
        )
        db.add(audit_log)
        await db.commit()

        logger.info(f"Follower account created: id={follower_user.id}, username={follower_user.username}")

        return FollowerResponse(
            id=follower_user.id,
            username=follower_user.username,
            name=follower_user.full_name,
            email=follower_user.email,
            iifl_customer_code=follower_user.iifl_account_id,
            is_active=follower_user.is_active,
            balance=float(follower_user.balance),
            created_at=follower_user.created_at,
            updated_at=follower_user.updated_at
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating follower account: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create follower account: {str(e)}"
        )


@router.get(
    "/followers",
    response_model=List[FollowerWithStats],
    summary="List All Followers",
    description="Get list of all follower accounts with statistics"
)
async def list_followers(
    skip: int = 0,
    limit: int = 100,
    active_only: bool = False,
    db: AsyncSession = Depends(get_db)
):
    """List all follower accounts with statistics"""
    try:
        # Build query
        stmt = select(User).where(User.role == UserRole.FOLLOWER)

        if active_only:
            stmt = stmt.where(User.is_active == True)

        stmt = stmt.offset(skip).limit(limit)

        result = await db.execute(stmt)
        followers = result.scalars().all()

        # Get statistics for each follower
        followers_with_stats = []

        for follower in followers:
            # Count masters following
            masters_stmt = select(func.count(FollowerRelationship.id)).where(
                FollowerRelationship.follower_id == follower.id,
                FollowerRelationship.is_active == True
            )
            masters_result = await db.execute(masters_stmt)
            masters_count = masters_result.scalar() or 0

            # Count total orders
            orders_stmt = select(func.count(Order.id)).where(
                Order.user_id == follower.id
            )
            orders_result = await db.execute(orders_stmt)
            total_orders = orders_result.scalar() or 0

            # Count replicated orders (orders with master_order_id)
            replicated_stmt = select(func.count(Order.id)).where(
                Order.user_id == follower.id,
                Order.master_order_id.isnot(None)
            )
            replicated_result = await db.execute(replicated_stmt)
            replicated_orders = replicated_result.scalar() or 0

            followers_with_stats.append(
                FollowerWithStats(
                    id=follower.id,
                    username=follower.username,
                    name=follower.full_name or follower.username,
                    email=follower.email,
                    iifl_customer_code=follower.iifl_account_id,
                    is_active=follower.is_active,
                    balance=float(follower.balance),
                    created_at=follower.created_at,
                    updated_at=follower.updated_at,
                    masters_following=masters_count,
                    total_orders=total_orders,
                    total_replicated_orders=replicated_orders
                )
            )

        return followers_with_stats

    except Exception as e:
        logger.error(f"Error listing followers: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list followers: {str(e)}"
        )


@router.get(
    "/followers/{follower_id}",
    response_model=FollowerWithStats,
    summary="Get Follower by ID"
)
async def get_follower(
    follower_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Get follower account by ID with statistics"""
    try:
        follower = await db.get(User, follower_id)

        if not follower or follower.role != UserRole.FOLLOWER:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Follower account not found: {follower_id}"
            )

        # Get statistics (same as list_followers)
        masters_stmt = select(func.count(FollowerRelationship.id)).where(
            FollowerRelationship.follower_id == follower.id,
            FollowerRelationship.is_active == True
        )
        masters_result = await db.execute(masters_stmt)
        masters_count = masters_result.scalar() or 0

        orders_stmt = select(func.count(Order.id)).where(Order.user_id == follower.id)
        orders_result = await db.execute(orders_stmt)
        total_orders = orders_result.scalar() or 0

        replicated_stmt = select(func.count(Order.id)).where(
            Order.user_id == follower.id,
            Order.master_order_id.isnot(None)
        )
        replicated_result = await db.execute(replicated_stmt)
        replicated_orders = replicated_result.scalar() or 0

        return FollowerWithStats(
            id=follower.id,
            username=follower.username,
            name=follower.full_name or follower.username,
            email=follower.email,
            iifl_customer_code=follower.iifl_account_id,
            is_active=follower.is_active,
            balance=float(follower.balance),
            created_at=follower.created_at,
            updated_at=follower.updated_at,
            masters_following=masters_count,
            total_orders=total_orders,
            total_replicated_orders=replicated_orders
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting follower: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get follower: {str(e)}"
        )


# ============================================
# MASTER-FOLLOWER MAPPING MANAGEMENT
# ============================================
@router.post(
    "/masters/{master_id}/followers",
    response_model=MasterFollowerMappingResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Connect Follower to Master",
    description="Create mapping between master and follower accounts"
)
async def connect_follower_to_master(
    master_id: int,
    mapping_data: MasterFollowerMappingCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    Connect a follower to a master

    Creates a relationship that allows follower to replicate master's trades

    Args:
        master_id: Master user ID
        mapping_data: Mapping configuration

    Returns:
        Created mapping details
    """
    try:
        # Validate master exists
        master = await db.get(User, master_id)
        if not master or master.role != UserRole.MASTER:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Master account not found: {master_id}"
            )

        # Validate follower exists
        follower = await db.get(User, mapping_data.follower_id)
        if not follower or follower.role != UserRole.FOLLOWER:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Follower account not found: {mapping_data.follower_id}"
            )

        # Check if mapping already exists
        stmt = select(FollowerRelationship).where(
            FollowerRelationship.master_id == master_id,
            FollowerRelationship.follower_id == mapping_data.follower_id
        )
        result = await db.execute(stmt)
        existing_mapping = result.scalar_one_or_none()

        if existing_mapping:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Mapping already exists between this master and follower"
            )

        # Create mapping
        mapping = FollowerRelationship(
            master_id=master_id,
            follower_id=mapping_data.follower_id,
            ratio=Decimal(str(mapping_data.scaling_factor or 1.0)),
            max_order_value=Decimal(str(mapping_data.max_capital_limit or 10000000.0)),
            max_daily_loss=Decimal(str(mapping_data.max_daily_loss or 5000000.0)),
            is_active=mapping_data.active if mapping_data.active is not None else True,
            auto_follow=True
        )

        db.add(mapping)
        await db.commit()
        await db.refresh(mapping)

        # Create audit log
        audit_log = AuditLog(
            action_type=AuditActionType.MAPPING_CREATED,
            action_description=f"Follower {follower.username} connected to master {master.username}",
            user_id=follower.id,
            success=True
        )
        db.add(audit_log)
        await db.commit()

        logger.info(
            f"Mapping created: master_id={master_id}, "
            f"follower_id={mapping_data.follower_id}"
        )

        return MasterFollowerMappingResponse(
            id=mapping.id,
            master_id=mapping.master_id,
            follower_id=mapping.follower_id,
            scaling_factor=float(mapping.ratio),
            max_order_value=float(mapping.max_order_value),
            max_daily_loss=float(mapping.max_daily_loss),
            is_active=mapping.is_active,
            auto_follow=mapping.auto_follow,
            created_at=mapping.followed_at,
            updated_at=mapping.updated_at,
            master_username=master.username,
            follower_username=follower.username
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating mapping: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create mapping: {str(e)}"
        )


@router.get(
    "/masters/{master_id}/followers",
    response_model=List[MasterFollowerMappingResponse],
    summary="List Followers of Master",
    description="Get all followers connected to a master"
)
async def list_master_followers(
    master_id: int,
    active_only: bool = True,
    db: AsyncSession = Depends(get_db)
):
    """List all followers of a master"""
    try:
        # Validate master exists
        master = await db.get(User, master_id)
        if not master or master.role != UserRole.MASTER:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Master account not found: {master_id}"
            )

        # Get mappings
        stmt = select(FollowerRelationship).where(
            FollowerRelationship.master_id == master_id
        )

        if active_only:
            stmt = stmt.where(FollowerRelationship.is_active == True)

        result = await db.execute(stmt)
        mappings = result.scalars().all()

        # Build response
        response_list = []
        for mapping in mappings:
            follower = await db.get(User, mapping.follower_id)

            response_list.append(
                MasterFollowerMappingResponse(
                    id=mapping.id,
                    master_id=mapping.master_id,
                    follower_id=mapping.follower_id,
                    scaling_factor=float(mapping.ratio),
                    max_order_value=float(mapping.max_order_value),
                    max_daily_loss=float(mapping.max_daily_loss),
                    is_active=mapping.is_active,
                    auto_follow=mapping.auto_follow,
                    created_at=mapping.followed_at,
                    updated_at=mapping.updated_at,
                    master_username=master.username,
                    follower_username=follower.username if follower else None
                )
            )

        return response_list

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing master followers: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list followers: {str(e)}"
        )


@router.get(
    "/followers/{follower_id}/masters",
    response_model=List[MasterFollowerMappingResponse],
    summary="List Masters of Follower",
    description="Get all masters that a follower is connected to"
)
async def list_follower_masters(
    follower_id: int,
    active_only: bool = True,
    db: AsyncSession = Depends(get_db)
):
    """List all masters that a follower follows"""
    try:
        # Validate follower exists
        follower = await db.get(User, follower_id)
        if not follower or follower.role != UserRole.FOLLOWER:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Follower account not found: {follower_id}"
            )

        # Get mappings
        stmt = select(FollowerRelationship).where(
            FollowerRelationship.follower_id == follower_id
        )

        if active_only:
            stmt = stmt.where(FollowerRelationship.is_active == True)

        result = await db.execute(stmt)
        mappings = result.scalars().all()

        # Build response
        response_list = []
        for mapping in mappings:
            master = await db.get(User, mapping.master_id)

            response_list.append(
                MasterFollowerMappingResponse(
                    id=mapping.id,
                    master_id=mapping.master_id,
                    follower_id=mapping.follower_id,
                    scaling_factor=float(mapping.ratio),
                    max_order_value=float(mapping.max_order_value),
                    max_daily_loss=float(mapping.max_daily_loss),
                    is_active=mapping.is_active,
                    auto_follow=mapping.auto_follow,
                    created_at=mapping.followed_at,
                    updated_at=mapping.updated_at,
                    master_username=master.username if master else None,
                    follower_username=follower.username
                )
            )

        return response_list

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing follower masters: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list masters: {str(e)}"
        )


@router.delete(
    "/masters/{master_id}/followers/{follower_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Disconnect Follower from Master",
    description="Remove mapping between master and follower (does not delete accounts)"
)
async def disconnect_follower_from_master(
    master_id: int,
    follower_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Disconnect follower from master

    Only removes the mapping, does not delete user accounts

    Args:
        master_id: Master user ID
        follower_id: Follower user ID
    """
    try:
        # Find mapping
        stmt = select(FollowerRelationship).where(
            FollowerRelationship.master_id == master_id,
            FollowerRelationship.follower_id == follower_id
        )
        result = await db.execute(stmt)
        mapping = result.scalar_one_or_none()

        if not mapping:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Mapping not found between this master and follower"
            )

        # Soft delete - mark as inactive
        mapping.is_active = False
        await db.commit()

        # Create audit log
        audit_log = AuditLog(
            action_type=AuditActionType.MAPPING_DELETED,
            action_description=f"Follower {follower_id} disconnected from master {master_id}",
            success=True
        )
        db.add(audit_log)
        await db.commit()

        logger.info(f"Mapping disconnected: master_id={master_id}, follower_id={follower_id}")

        return None

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error disconnecting mapping: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to disconnect mapping: {str(e)}"
        )
