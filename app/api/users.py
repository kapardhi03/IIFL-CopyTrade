"""
User Management API Endpoints
Registration, login, profile management
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.db.database import get_db
from app.schemas.schemas import UserCreate, UserResponse, UserLogin, Token, UserUpdate
from app.models.models import User
from app.core.auth import (
    get_password_hash,
    authenticate_user,
    create_user_token,
    get_current_active_user
)

router = APIRouter()

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register_user(
    user_data: UserCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    Register new user

    Args:
        user_data: User registration data
        db: Database session

    Returns:
        UserResponse: Created user data

    Raises:
        HTTPException: If username/email already exists
    """
    # Check if user already exists
    existing_user = await db.execute(
        select(User).where(
            (User.username == user_data.username) |
            (User.email == user_data.email)
        )
    )

    if existing_user.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username or email already registered"
        )

    # Create new user
    hashed_password = get_password_hash(user_data.password)

    new_user = User(
        email=user_data.email,
        username=user_data.username,
        full_name=user_data.full_name,
        hashed_password=hashed_password,
        role=user_data.role,
        is_active=True,
        is_verified=False  # In production, you'd send verification email
    )

    try:
        db.add(new_user)
        await db.commit()
        await db.refresh(new_user)

        return new_user

    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username or email already registered"
        )

@router.post("/login", response_model=Token)
async def login_user(
    login_data: UserLogin,
    db: AsyncSession = Depends(get_db)
):
    """
    User login

    Args:
        login_data: Login credentials
        db: Database session

    Returns:
        Token: JWT access token

    Raises:
        HTTPException: If credentials are invalid
    """
    user = await authenticate_user(login_data.username, login_data.password, db)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Account is deactivated"
        )

    # Create and return token
    token_data = create_user_token(user)
    return token_data

@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(
    current_user: User = Depends(get_current_active_user)
):
    """
    Get current user profile

    Args:
        current_user: Current authenticated user

    Returns:
        UserResponse: User profile data
    """
    return current_user

@router.put("/me", response_model=UserResponse)
async def update_user_profile(
    user_update: UserUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Update current user profile

    Args:
        user_update: Profile update data
        current_user: Current authenticated user
        db: Database session

    Returns:
        UserResponse: Updated user profile
    """
    # Update fields if provided
    if user_update.full_name is not None:
        current_user.full_name = user_update.full_name

    if user_update.iifl_account_id is not None:
        # Check if IIFL account ID is already taken
        existing = await db.execute(
            select(User).where(
                User.iifl_account_id == user_update.iifl_account_id,
                User.id != current_user.id
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="IIFL account ID already linked to another user"
            )
        current_user.iifl_account_id = user_update.iifl_account_id

    if user_update.iifl_user_id is not None:
        current_user.iifl_user_id = user_update.iifl_user_id

    try:
        await db.commit()
        await db.refresh(current_user)
        return current_user

    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to update profile"
        )

@router.get("/list", response_model=list[UserResponse])
async def list_users(
    skip: int = 0,
    limit: int = 100,
    role: str = None,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    List all users (for admin or finding masters)

    Args:
        skip: Number of records to skip
        limit: Maximum records to return
        role: Filter by user role
        current_user: Current authenticated user
        db: Database session

    Returns:
        List[UserResponse]: List of users
    """
    query = select(User).where(User.is_active == True)

    # Filter by role if specified
    if role:
        query = query.where(User.role == role)

    # Apply pagination
    query = query.offset(skip).limit(limit)

    result = await db.execute(query)
    users = result.scalars().all()

    return users

@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_account(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Deactivate current user account

    Args:
        current_user: Current authenticated user
        db: Database session
    """
    current_user.is_active = False
    await db.commit()

@router.get("/stats", response_model=dict)
async def get_user_stats(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get user statistics

    Args:
        current_user: Current authenticated user
        db: Database session

    Returns:
        dict: User statistics
    """
    from app.models.models import Order, FollowerRelationship

    # Get order stats
    orders_query = select(Order).where(Order.user_id == current_user.id)
    orders_result = await db.execute(orders_query)
    orders = orders_result.scalars().all()

    total_orders = len(orders)
    successful_orders = sum(1 for order in orders if order.status in ["FILLED", "PARTIALLY_FILLED"])

    # Get follower/following stats
    followers_query = select(FollowerRelationship).where(
        FollowerRelationship.master_id == current_user.id,
        FollowerRelationship.is_active == True
    )
    followers_result = await db.execute(followers_query)
    follower_count = len(followers_result.scalars().all())

    following_query = select(FollowerRelationship).where(
        FollowerRelationship.follower_id == current_user.id,
        FollowerRelationship.is_active == True
    )
    following_result = await db.execute(following_query)
    following_count = len(following_result.scalars().all())

    return {
        "total_orders": total_orders,
        "successful_orders": successful_orders,
        "success_rate": (successful_orders / total_orders * 100) if total_orders > 0 else 0,
        "follower_count": follower_count,
        "following_count": following_count,
        "account_balance": float(current_user.balance)
    }