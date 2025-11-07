"""
Authentication and authorization utilities
JWT token handling with bcrypt password hashing
"""
from datetime import datetime, timedelta
from typing import Optional, Union
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.db.database import get_db
from app.models.models import User
from app.schemas.schemas import UserResponse

# Password hashing context
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

# JWT Bearer token scheme
security = HTTPBearer()

def verify_password(plain_password: str, hashed_password: str):
    """Verify a password against hash"""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str):
    """Hash a password"""
    # bcrypt has a 72 byte limit, truncate if necessary
    if len(password.encode('utf-8')) > 72:
        password = password[:72]
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """
    Create JWT access token

    Args:
        data: Payload data to encode
        expires_delta: Token expiration time

    Returns:
        str: Encoded JWT token
    """
    to_encode = data.copy()

    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

    return encoded_jwt

def verify_token(token: str):
    """
    Verify and decode JWT token

    Args:
        token: JWT token to verify

    Returns:
        dict: Decoded token payload or None if invalid
    """
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        return None

async def get_user_from_token(token: str, db: AsyncSession):
    """
    Get user from JWT token

    Args:
        token: JWT token
        db: Database session

    Returns:
        User: User object or None if not found
    """
    payload = verify_token(token)
    if not payload:
        return None

    user_id = payload.get("sub")
    if not user_id:
        return None

    try:
        result = await db.execute(select(User).where(User.id == int(user_id)))
        user = result.scalar_one_or_none()
        return user
    except Exception:
        return None

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
):
    """
    Dependency to get current authenticated user

    Args:
        credentials: HTTP Bearer credentials
        db: Database session

    Returns:
        User: Current authenticated user

    Raises:
        HTTPException: If authentication fails
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not credentials:
        raise credentials_exception

    user = await get_user_from_token(credentials.credentials, db)

    if user is None:
        raise credentials_exception

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )

    # Update last login
    user.last_login = datetime.utcnow()
    await db.commit()

    return user

async def get_current_active_user(current_user: User = Depends(get_current_user)):
    """
    Dependency to get current active user

    Args:
        current_user: Current user from token

    Returns:
        User: Current active user

    Raises:
        HTTPException: If user is inactive
    """
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )
    return current_user

async def require_master_role(current_user: User = Depends(get_current_active_user)):
    """
    Dependency to require master role

    Args:
        current_user: Current authenticated user

    Returns:
        User: Current user (if master)

    Raises:
        HTTPException: If user is not a master
    """
    if current_user.role not in ["MASTER", "BOTH"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Master role required"
        )
    return current_user

async def authenticate_user(username: str, password: str, db: AsyncSession):
    """
    Authenticate user with username and password

    Args:
        username: Username or email
        password: Plain text password
        db: Database session

    Returns:
        User: Authenticated user or None if invalid
    """
    # Try to find user by username or email
    result = await db.execute(
        select(User).where(
            (User.username == username) | (User.email == username)
        )
    )
    user = result.scalar_one_or_none()

    if not user:
        return None

    if not verify_password(password, user.hashed_password):
        return None

    return user

class AuthError(Exception):
    """Custom authentication error"""
    def __init__(self, message: str, status_code: int = 401):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)

def create_user_token(user: User):
    """
    Create JWT token for user

    Args:
        user: User object

    Returns:
        dict: Token data with access_token, token_type, expires_in
    """
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id), "username": user.username, "role": user.role.value},
        expires_delta=access_token_expires
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60  # seconds
    }