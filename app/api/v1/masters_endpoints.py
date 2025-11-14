"""
Master Account Management API Endpoints
Handles creation, retrieval, and management of master trading accounts
"""
from fastapi import APIRouter, HTTPException, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List
import logging

from app.db.database import get_db
from app.models.models import User, UserRole, FollowerRelationship, Order, AuditLog, AuditActionType
from app.schemas.master import (
    MasterCreate,
    MasterResponse,
    MasterUpdate,
    MasterWithStats
)
from app.core.security import hash_password, get_encryption_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/masters", tags=["Masters"])


@router.post(
    "",
    response_model=MasterResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create Master Account",
    description="Create a new master trading account with Blaze credentials"
)
async def create_master(
    master_data: MasterCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    Create a new master account

    Required fields:
    - master_name: Display name for the master
    - email: Email address
    - username: Unique username
    - blaze_account_id: IIFL Blaze account ID
    - blaze_api_key: Blaze API key
    - blaze_api_secret: Blaze API secret
    - Optional: password for platform access

    Returns:
        Created master account details
    """
    try:
        # Check if username or email already exists
        stmt = select(User).where(
            (User.username == master_data.username) |
            (User.email == master_data.email)
        )
        result = await db.execute(stmt)
        existing_user = result.scalar_one_or_none()

        if existing_user:
            if existing_user.username == master_data.username:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Username '{master_data.username}' already exists"
                )
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Email '{master_data.email}' already exists"
                )

        # Check if Blaze account ID already registered
        stmt = select(User).where(User.iifl_account_id == master_data.blaze_account_id)
        result = await db.execute(stmt)
        existing_blaze = result.scalar_one_or_none()

        if existing_blaze:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Blaze account ID '{master_data.blaze_account_id}' already registered"
            )

        # Encrypt sensitive credentials
        encryption_service = get_encryption_service()

        # Hash password
        hashed_password = hash_password(master_data.password or "default_password_change_me")

        # Encrypt Blaze credentials
        encrypted_api_key = encryption_service.encrypt(master_data.blaze_api_key)
        encrypted_api_secret = encryption_service.encrypt(master_data.blaze_api_secret)

        # Create master user
        master_user = User(
            username=master_data.username,
            email=master_data.email,
            hashed_password=hashed_password,
            full_name=master_data.master_name,
            role=UserRole.MASTER,
            is_active=True,
            is_verified=True,
            iifl_account_id=master_data.blaze_account_id,
            iifl_api_key=encrypted_api_key,
            iifl_password=encrypted_api_secret,  # Reusing password field for API secret
            balance=master_data.initial_balance or 0
        )

        db.add(master_user)
        await db.commit()
        await db.refresh(master_user)

        # Create audit log
        audit_log = AuditLog(
            action_type=AuditActionType.MASTER_CREATED,
            action_description=f"Master account created: {master_data.master_name}",
            user_id=master_user.id,
            success=True
        )
        db.add(audit_log)
        await db.commit()

        logger.info(f"Master account created: id={master_user.id}, username={master_user.username}")

        return MasterResponse(
            id=master_user.id,
            username=master_user.username,
            email=master_user.email,
            master_name=master_user.full_name,
            blaze_account_id=master_user.iifl_account_id,
            is_active=master_user.is_active,
            balance=float(master_user.balance),
            created_at=master_user.created_at,
            updated_at=master_user.updated_at
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating master account: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create master account: {str(e)}"
        )


@router.get(
    "",
    response_model=List[MasterWithStats],
    summary="List All Masters",
    description="Get list of all master accounts with statistics"
)
async def list_masters(
    skip: int = 0,
    limit: int = 100,
    active_only: bool = False,
    db: AsyncSession = Depends(get_db)
):
    """
    List all master accounts with statistics

    Args:
        skip: Number of records to skip
        limit: Maximum number of records to return
        active_only: Return only active masters

    Returns:
        List of master accounts with stats
    """
    try:
        # Build query
        stmt = select(User).where(User.role == UserRole.MASTER)

        if active_only:
            stmt = stmt.where(User.is_active == True)

        stmt = stmt.offset(skip).limit(limit)

        result = await db.execute(stmt)
        masters = result.scalars().all()

        # Get statistics for each master
        masters_with_stats = []

        for master in masters:
            # Count followers
            follower_stmt = select(func.count(FollowerRelationship.id)).where(
                FollowerRelationship.master_id == master.id,
                FollowerRelationship.is_active == True
            )
            follower_result = await db.execute(follower_stmt)
            follower_count = follower_result.scalar() or 0

            # Count orders
            order_stmt = select(func.count(Order.id)).where(
                Order.user_id == master.id,
                Order.is_master_order == True
            )
            order_result = await db.execute(order_stmt)
            total_orders = order_result.scalar() or 0

            masters_with_stats.append(
                MasterWithStats(
                    id=master.id,
                    username=master.username,
                    email=master.email,
                    master_name=master.full_name or master.username,
                    blaze_account_id=master.iifl_account_id,
                    is_active=master.is_active,
                    balance=float(master.balance),
                    created_at=master.created_at,
                    updated_at=master.updated_at,
                    follower_count=follower_count,
                    total_orders=total_orders
                )
            )

        return masters_with_stats

    except Exception as e:
        logger.error(f"Error listing masters: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list masters: {str(e)}"
        )


@router.get(
    "/{master_id}",
    response_model=MasterWithStats,
    summary="Get Master by ID",
    description="Get detailed information about a specific master"
)
async def get_master(
    master_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Get master account by ID

    Args:
        master_id: Master account ID

    Returns:
        Master account with statistics
    """
    try:
        master = await db.get(User, master_id)

        if not master or master.role != UserRole.MASTER:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Master account not found: {master_id}"
            )

        # Get statistics
        follower_stmt = select(func.count(FollowerRelationship.id)).where(
            FollowerRelationship.master_id == master.id,
            FollowerRelationship.is_active == True
        )
        follower_result = await db.execute(follower_stmt)
        follower_count = follower_result.scalar() or 0

        order_stmt = select(func.count(Order.id)).where(
            Order.user_id == master.id,
            Order.is_master_order == True
        )
        order_result = await db.execute(order_stmt)
        total_orders = order_result.scalar() or 0

        return MasterWithStats(
            id=master.id,
            username=master.username,
            email=master.email,
            master_name=master.full_name or master.username,
            blaze_account_id=master.iifl_account_id,
            is_active=master.is_active,
            balance=float(master.balance),
            created_at=master.created_at,
            updated_at=master.updated_at,
            follower_count=follower_count,
            total_orders=total_orders
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting master: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get master: {str(e)}"
        )


@router.put(
    "/{master_id}",
    response_model=MasterResponse,
    summary="Update Master Account",
    description="Update master account details"
)
async def update_master(
    master_id: int,
    update_data: MasterUpdate,
    db: AsyncSession = Depends(get_db)
):
    """
    Update master account

    Args:
        master_id: Master account ID
        update_data: Fields to update

    Returns:
        Updated master account
    """
    try:
        master = await db.get(User, master_id)

        if not master or master.role != UserRole.MASTER:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Master account not found: {master_id}"
            )

        # Update fields
        if update_data.master_name is not None:
            master.full_name = update_data.master_name

        if update_data.email is not None:
            master.email = update_data.email

        if update_data.is_active is not None:
            master.is_active = update_data.is_active

        await db.commit()
        await db.refresh(master)

        logger.info(f"Master account updated: id={master_id}")

        return MasterResponse(
            id=master.id,
            username=master.username,
            email=master.email,
            master_name=master.full_name,
            blaze_account_id=master.iifl_account_id,
            is_active=master.is_active,
            balance=float(master.balance),
            created_at=master.created_at,
            updated_at=master.updated_at
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating master: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update master: {str(e)}"
        )


@router.delete(
    "/{master_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete Master Account",
    description="Delete a master account (soft delete - marks as inactive)"
)
async def delete_master(
    master_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Delete (deactivate) master account

    Args:
        master_id: Master account ID
    """
    try:
        master = await db.get(User, master_id)

        if not master or master.role != UserRole.MASTER:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Master account not found: {master_id}"
            )

        # Soft delete - just mark as inactive
        master.is_active = False

        # Deactivate all follower relationships
        stmt = select(FollowerRelationship).where(
            FollowerRelationship.master_id == master_id
        )
        result = await db.execute(stmt)
        relationships = result.scalars().all()

        for rel in relationships:
            rel.is_active = False

        await db.commit()

        logger.info(f"Master account deleted (deactivated): id={master_id}")

        return None

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting master: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete master: {str(e)}"
        )
