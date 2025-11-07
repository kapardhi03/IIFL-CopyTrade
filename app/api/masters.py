"""
Master/Follower Relationship API Endpoints
Follow/unfollow functionality and master listings
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from typing import List

from app.db.database import get_db
from app.schemas.schemas import (
    FollowRequest,
    FollowResponse,
    MasterInfo,
    UserResponse
)
from app.models.models import User, FollowerRelationship, Order, UserRole
from app.core.auth import get_current_active_user
from app.services.websocket_manager import manager

router = APIRouter()

@router.get("/list", response_model=List[MasterInfo])
async def list_masters(
    skip: int = 0,
    limit: int = 50,
    min_followers: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get list of available master traders

    Args:
        skip: Records to skip (pagination)
        limit: Max records to return
        min_followers: Minimum follower count filter
        db: Database session
        current_user: Current authenticated user

    Returns:
        List[MasterInfo]: List of master traders with stats
    """
    # Get masters with follower counts and order stats
    masters_query = (
        select(
            User,
            func.count(FollowerRelationship.id).label('follower_count'),
            func.count(Order.id).label('total_orders')
        )
        .outerjoin(FollowerRelationship, FollowerRelationship.master_id == User.id)
        .outerjoin(Order, Order.user_id == User.id)
        .where(
            User.is_active == True,
            User.role.in_([UserRole.MASTER, UserRole.BOTH])
        )
        .group_by(User.id)
        .having(func.count(FollowerRelationship.id) >= min_followers)
        .offset(skip)
        .limit(limit)
    )

    result = await db.execute(masters_query)
    masters_data = result.all()

    masters_list = []
    for user, follower_count, total_orders in masters_data:
        # Calculate success rate
        success_rate = 0.0
        if total_orders > 0:
            success_query = select(func.count()).select_from(Order).where(
                Order.user_id == user.id,
                Order.status.in_(["FILLED", "PARTIALLY_FILLED"])
            )
            success_result = await db.execute(success_query)
            successful_orders = success_result.scalar()
            success_rate = (successful_orders / total_orders) * 100

        masters_list.append(MasterInfo(
            id=user.id,
            username=user.username,
            full_name=user.full_name,
            follower_count=follower_count or 0,
            total_orders=total_orders or 0,
            success_rate=success_rate,
            avg_return=0.0  # TODO: Calculate actual returns
        ))

    return masters_list

@router.post("/follow", response_model=FollowResponse)
async def follow_master(
    follow_request: FollowRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Follow a master trader

    Args:
        follow_request: Follow configuration
        db: Database session
        current_user: Current authenticated user

    Returns:
        FollowResponse: Follow relationship details

    Raises:
        HTTPException: If master not found or already following
    """
    # Validate master exists and is actually a master
    master_query = select(User).where(
        User.id == follow_request.master_id,
        User.is_active == True,
        User.role.in_([UserRole.MASTER, UserRole.BOTH])
    )
    master_result = await db.execute(master_query)
    master = master_result.scalar_one_or_none()

    if not master:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Master trader not found"
        )

    # Can't follow yourself
    if master.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot follow yourself"
        )

    # Check if already following
    existing_query = select(FollowerRelationship).where(
        FollowerRelationship.master_id == follow_request.master_id,
        FollowerRelationship.follower_id == current_user.id
    )
    existing_result = await db.execute(existing_query)
    existing_follow = existing_result.scalar_one_or_none()

    if existing_follow:
        if existing_follow.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Already following this master"
            )
        else:
            # Reactivate existing relationship
            existing_follow.is_active = True
            existing_follow.copy_strategy = follow_request.copy_strategy
            existing_follow.ratio = follow_request.ratio
            existing_follow.percentage = follow_request.percentage
            existing_follow.fixed_quantity = follow_request.fixed_quantity
            existing_follow.max_order_value = follow_request.max_order_value
            existing_follow.max_daily_loss = follow_request.max_daily_loss

            await db.commit()
            await db.refresh(existing_follow)

            # Send notification to master
            await manager.send_follow_notification(
                master.id, current_user.id, current_user.username
            )

            return existing_follow

    # Create new follow relationship
    new_follow = FollowerRelationship(
        master_id=follow_request.master_id,
        follower_id=current_user.id,
        copy_strategy=follow_request.copy_strategy,
        ratio=follow_request.ratio or 1.0,
        percentage=follow_request.percentage or 10.0,
        fixed_quantity=follow_request.fixed_quantity or 1,
        max_order_value=follow_request.max_order_value or 50000.0,
        max_daily_loss=follow_request.max_daily_loss or 10000.0,
        is_active=True,
        auto_follow=True
    )

    db.add(new_follow)
    await db.commit()
    await db.refresh(new_follow)

    # Send notification to master
    await manager.send_follow_notification(
        master.id, current_user.id, current_user.username
    )

    return new_follow

@router.delete("/unfollow/{master_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unfollow_master(
    master_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Unfollow a master trader

    Args:
        master_id: Master trader ID to unfollow
        db: Database session
        current_user: Current authenticated user

    Raises:
        HTTPException: If not following this master
    """
    # Find active follow relationship
    follow_query = select(FollowerRelationship).where(
        FollowerRelationship.master_id == master_id,
        FollowerRelationship.follower_id == current_user.id,
        FollowerRelationship.is_active == True
    )
    follow_result = await db.execute(follow_query)
    follow_relationship = follow_result.scalar_one_or_none()

    if not follow_relationship:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Not following this master"
        )

    # Deactivate relationship (don't delete for historical tracking)
    follow_relationship.is_active = False
    await db.commit()

    # Get master info for notification
    master_query = select(User).where(User.id == master_id)
    master_result = await db.execute(master_query)
    master = master_result.scalar_one_or_none()

    if master:
        # Send notification to master
        await manager.send_unfollow_notification(
            master.id, current_user.id, current_user.username
        )

@router.get("/following", response_model=List[FollowResponse])
async def get_following_masters(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get list of masters current user is following

    Args:
        db: Database session
        current_user: Current authenticated user

    Returns:
        List[FollowResponse]: List of follow relationships
    """
    following_query = select(FollowerRelationship).where(
        FollowerRelationship.follower_id == current_user.id,
        FollowerRelationship.is_active == True
    )

    result = await db.execute(following_query)
    following_relationships = result.scalars().all()

    return following_relationships

@router.get("/followers", response_model=List[UserResponse])
async def get_followers(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get list of current user's followers (only if user is a master)

    Args:
        db: Database session
        current_user: Current authenticated user

    Returns:
        List[UserResponse]: List of followers

    Raises:
        HTTPException: If user is not a master
    """
    if current_user.role not in [UserRole.MASTER, UserRole.BOTH]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only masters can view their followers"
        )

    followers_query = (
        select(User)
        .join(FollowerRelationship, FollowerRelationship.follower_id == User.id)
        .where(
            FollowerRelationship.master_id == current_user.id,
            FollowerRelationship.is_active == True,
            User.is_active == True
        )
    )

    result = await db.execute(followers_query)
    followers = result.scalars().all()

    return followers

@router.get("/relationship/{master_id}", response_model=FollowResponse)
async def get_follow_relationship(
    master_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get specific follow relationship details

    Args:
        master_id: Master trader ID
        db: Database session
        current_user: Current authenticated user

    Returns:
        FollowResponse: Follow relationship details

    Raises:
        HTTPException: If relationship not found
    """
    relationship_query = select(FollowerRelationship).where(
        FollowerRelationship.master_id == master_id,
        FollowerRelationship.follower_id == current_user.id,
        FollowerRelationship.is_active == True
    )

    result = await db.execute(relationship_query)
    relationship = result.scalar_one_or_none()

    if not relationship:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Follow relationship not found"
        )

    return relationship

@router.put("/relationship/{master_id}", response_model=FollowResponse)
async def update_follow_settings(
    master_id: int,
    follow_request: FollowRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Update follow relationship settings

    Args:
        master_id: Master trader ID
        follow_request: Updated follow settings
        db: Database session
        current_user: Current authenticated user

    Returns:
        FollowResponse: Updated follow relationship

    Raises:
        HTTPException: If relationship not found
    """
    relationship_query = select(FollowerRelationship).where(
        FollowerRelationship.master_id == master_id,
        FollowerRelationship.follower_id == current_user.id,
        FollowerRelationship.is_active == True
    )

    result = await db.execute(relationship_query)
    relationship = result.scalar_one_or_none()

    if not relationship:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Follow relationship not found"
        )

    # Update settings
    relationship.copy_strategy = follow_request.copy_strategy
    relationship.ratio = follow_request.ratio or relationship.ratio
    relationship.percentage = follow_request.percentage or relationship.percentage
    relationship.fixed_quantity = follow_request.fixed_quantity or relationship.fixed_quantity
    relationship.max_order_value = follow_request.max_order_value or relationship.max_order_value
    relationship.max_daily_loss = follow_request.max_daily_loss or relationship.max_daily_loss

    await db.commit()
    await db.refresh(relationship)

    return relationship