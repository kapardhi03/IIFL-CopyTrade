"""
Pydantic schemas for Follower account management
"""
from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime
from decimal import Decimal


class FollowerCreate(BaseModel):
    """Schema for creating a follower account"""
    username: str = Field(..., min_length=3, max_length=100, description="Unique username")
    name: str = Field(..., min_length=2, max_length=255, description="Full name")
    email: EmailStr = Field(..., description="Email address")
    phone: Optional[str] = Field(None, max_length=15, description="Phone number")
    password: Optional[str] = Field(None, min_length=8, description="Platform password")

    # IIFL Normal REST API credentials
    iifl_customer_code: str = Field(..., description="IIFL client/customer code")
    iifl_user_id: str = Field(..., description="IIFL user ID for authentication")
    iifl_password: str = Field(..., description="IIFL account password")

    # Trading configuration
    scaling_factor: Optional[float] = Field(1.0, gt=0, le=100, description="Default scaling factor")
    initial_balance: Optional[float] = Field(100000.0, ge=0, description="Initial account balance")

    # Optional IIFL fields
    iifl_public_ip: Optional[str] = Field(None, description="Public IP for IIFL API")
    iifl_app_name: Optional[str] = Field("CopyTrade", description="Application name")

    class Config:
        json_schema_extra = {
            "example": {
                "username": "follower_user1",
                "name": "Jane Smith",
                "email": "jane@example.com",
                "phone": "+91 98765 43210",
                "password": "SecurePass123",
                "iifl_customer_code": "ABC12345",
                "iifl_user_id": "JANE123",
                "iifl_password": "iifl_password",
                "scaling_factor": 1.0,
                "initial_balance": 100000.0,
                "iifl_public_ip": "192.168.1.1"
            }
        }


class FollowerUpdate(BaseModel):
    """Schema for updating follower account"""
    name: Optional[str] = Field(None, min_length=2, max_length=255)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=15)
    is_active: Optional[bool] = None
    iifl_password: Optional[str] = None
    iifl_public_ip: Optional[str] = None

    class Config:
        json_schema_extra = {
            "example": {
                "name": "Updated Name",
                "email": "newemail@example.com",
                "is_active": True
            }
        }


class FollowerResponse(BaseModel):
    """Schema for follower account response"""
    id: int
    username: str
    name: str
    email: str
    phone: Optional[str] = None
    iifl_customer_code: str
    is_active: bool
    balance: float
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class FollowerWithStats(FollowerResponse):
    """Schema for follower account with statistics"""
    masters_following: int = 0
    total_orders: int = 0
    total_replicated_orders: int = 0

    class Config:
        from_attributes = True


class MasterFollowerMappingCreate(BaseModel):
    """Schema for connecting follower to master"""
    follower_id: int = Field(..., description="Follower user ID")
    scaling_factor: Optional[float] = Field(1.0, gt=0, le=100, description="Order scaling factor")
    max_capital_limit: Optional[float] = Field(None, gt=0, description="Maximum capital per order")
    max_daily_loss: Optional[float] = Field(None, gt=0, description="Maximum daily loss limit")
    active: Optional[bool] = Field(True, description="Is mapping active")

    class Config:
        json_schema_extra = {
            "example": {
                "follower_id": 5,
                "scaling_factor": 1.5,
                "max_capital_limit": 50000.0,
                "max_daily_loss": 10000.0,
                "active": True
            }
        }


class MasterFollowerMappingUpdate(BaseModel):
    """Schema for updating master-follower mapping"""
    scaling_factor: Optional[float] = Field(None, gt=0, le=100)
    max_capital_limit: Optional[float] = Field(None, gt=0)
    max_daily_loss: Optional[float] = Field(None, gt=0)
    is_active: Optional[bool] = None
    auto_follow: Optional[bool] = None

    class Config:
        json_schema_extra = {
            "example": {
                "scaling_factor": 2.0,
                "max_capital_limit": 75000.0,
                "is_active": True,
                "auto_follow": True
            }
        }


class MasterFollowerMappingResponse(BaseModel):
    """Schema for master-follower mapping response"""
    id: int
    master_id: int
    follower_id: int
    scaling_factor: float
    max_order_value: float
    max_daily_loss: float
    is_active: bool
    auto_follow: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    # Additional info
    master_username: Optional[str] = None
    follower_username: Optional[str] = None

    class Config:
        from_attributes = True
