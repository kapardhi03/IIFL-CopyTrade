"""
Pydantic schemas for Master account management
"""
from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime
from decimal import Decimal


class MasterCreate(BaseModel):
    """Schema for creating a master account"""
    master_name: str = Field(..., min_length=2, max_length=255, description="Display name for master")
    email: EmailStr = Field(..., description="Email address")
    username: str = Field(..., min_length=3, max_length=100, description="Unique username")
    password: Optional[str] = Field(None, min_length=8, description="Platform password (optional)")

    # Blaze credentials
    blaze_account_id: str = Field(..., description="IIFL Blaze account ID")
    blaze_api_key: str = Field(..., description="Blaze API key")
    blaze_api_secret: str = Field(..., description="Blaze API secret")

    # Optional fields
    initial_balance: Optional[float] = Field(0, ge=0, description="Initial account balance")

    class Config:
        json_schema_extra = {
            "example": {
                "master_name": "John Doe Trading",
                "email": "john@example.com",
                "username": "john_master",
                "password": "SecurePass123",
                "blaze_account_id": "MASTER001",
                "blaze_api_key": "your_blaze_api_key",
                "blaze_api_secret": "your_blaze_api_secret",
                "initial_balance": 1000000.00
            }
        }


class MasterUpdate(BaseModel):
    """Schema for updating master account"""
    master_name: Optional[str] = Field(None, min_length=2, max_length=255)
    email: Optional[EmailStr] = None
    is_active: Optional[bool] = None

    class Config:
        json_schema_extra = {
            "example": {
                "master_name": "Updated Master Name",
                "email": "newemail@example.com",
                "is_active": True
            }
        }


class MasterResponse(BaseModel):
    """Schema for master account response"""
    id: int
    username: str
    email: str
    master_name: str
    blaze_account_id: str
    is_active: bool
    balance: float
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class MasterWithStats(MasterResponse):
    """Schema for master account with statistics"""
    follower_count: int = 0
    total_orders: int = 0
    active_orders: int = 0

    class Config:
        from_attributes = True
