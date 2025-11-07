"""
Pydantic schemas for request/response validation
All API inputs and outputs use these schemas
"""
from pydantic import BaseModel, EmailStr, Field, validator
from typing import Optional, List
from datetime import datetime
from decimal import Decimal
from app.models.models import UserRole, OrderSide, OrderType, OrderStatus, CopyStrategy

# Base schemas
class TimestampMixin(BaseModel):
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

# User schemas
class UserBase(BaseModel):
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=50)
    full_name: Optional[str] = None

class UserCreate(UserBase):
    password: str = Field(..., min_length=8)
    role: UserRole = UserRole.FOLLOWER

    @validator('password')
    def validate_password(cls, v):
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters')
        if not any(c.isupper() for c in v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not any(c.islower() for c in v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not any(c.isdigit() for c in v):
            raise ValueError('Password must contain at least one digit')
        return v

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    iifl_account_id: Optional[str] = None
    iifl_user_id: Optional[str] = None

class UserResponse(TimestampMixin, UserBase):
    id: int
    role: UserRole
    is_active: bool
    is_verified: bool
    balance: Decimal
    last_login: Optional[datetime] = None

    class Config:
        from_attributes = True

class UserLogin(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int

# Order schemas
class OrderBase(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=20)
    side: OrderSide
    order_type: OrderType
    quantity: int = Field(..., gt=0)
    price: Optional[Decimal] = Field(None, gt=0)

class OrderCreate(OrderBase):
    pass

class OrderResponse(TimestampMixin, OrderBase):
    id: int
    user_id: int
    master_order_id: Optional[int] = None
    is_master_order: bool
    status: OrderStatus
    filled_quantity: int = 0
    average_price: Optional[Decimal] = None
    broker_order_id: Optional[str] = None
    error_message: Optional[str] = None
    replication_latency_ms: Optional[int] = None
    filled_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# Follow/Unfollow schemas
class FollowRequest(BaseModel):
    master_id: int
    copy_strategy: CopyStrategy = CopyStrategy.FIXED_RATIO
    ratio: Optional[Decimal] = Field(Decimal('1.00'), gt=0)
    percentage: Optional[Decimal] = Field(Decimal('10.00'), gt=0, le=100)
    fixed_quantity: Optional[int] = Field(1, gt=0)
    max_order_value: Optional[Decimal] = Field(Decimal('50000.00'), gt=0)
    max_daily_loss: Optional[Decimal] = Field(Decimal('10000.00'), gt=0)

class FollowResponse(TimestampMixin, BaseModel):
    id: int
    master_id: int
    follower_id: int
    copy_strategy: CopyStrategy
    ratio: Decimal
    percentage: Decimal
    fixed_quantity: int
    max_order_value: Decimal
    max_daily_loss: Decimal
    is_active: bool
    auto_follow: bool
    followed_at: datetime

    class Config:
        from_attributes = True

class MasterInfo(BaseModel):
    id: int
    username: str
    full_name: Optional[str] = None
    follower_count: int = 0
    total_orders: int = 0
    success_rate: float = 0.0
    avg_return: float = 0.0

    class Config:
        from_attributes = True

# Order statistics
class OrderStats(BaseModel):
    total_orders: int = 0
    successful_orders: int = 0
    failed_orders: int = 0
    pending_orders: int = 0
    total_volume: Decimal = Decimal('0.00')
    success_rate: float = 0.0
    avg_replication_time_ms: float = 0.0

class ReplicationResult(BaseModel):
    success_count: int
    failed_count: int
    total_followers: int
    avg_latency_ms: float
    failed_followers: List[int] = []

# WebSocket message schemas
class WSMessage(BaseModel):
    type: str
    data: dict

class OrderUpdateMessage(WSMessage):
    type: str = "order_update"
    data: dict

class ReplicationUpdateMessage(WSMessage):
    type: str = "replication_update"
    data: dict

# API Response wrappers
class APIResponse(BaseModel):
    success: bool = True
    message: str = "Success"
    data: Optional[dict] = None

class ErrorResponse(BaseModel):
    success: bool = False
    message: str
    error_code: Optional[str] = None
    details: Optional[dict] = None

# Pagination
class PaginationParams(BaseModel):
    page: int = Field(1, ge=1)
    size: int = Field(20, ge=1, le=100)

class PaginatedResponse(BaseModel):
    items: List[dict]
    total: int
    page: int
    size: int
    pages: int