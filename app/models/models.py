"""
Database models for Copy Trading Platform
SQLAlchemy 2.0 async models with proper relationships
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Enum, Text
from sqlalchemy.types import DECIMAL
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime
from enum import Enum as PyEnum
from decimal import Decimal as PyDecimal

Base = declarative_base()

# Enums
class UserRole(PyEnum):
    MASTER = "MASTER"
    FOLLOWER = "FOLLOWER"
    BOTH = "BOTH"

class OrderSide(PyEnum):
    BUY = "BUY"
    SELL = "SELL"

class OrderType(PyEnum):
    MARKET = "MARKET"
    LIMIT = "LIMIT"
    STOP_LOSS = "STOP_LOSS"
    STOP_LOSS_MARKET = "STOP_LOSS_MARKET"

class OrderStatus(PyEnum):
    PENDING = "PENDING"
    SUBMITTED = "SUBMITTED"
    FILLED = "FILLED"
    PARTIALLY_FILLED = "PARTIALLY_FILLED"
    CANCELLED = "CANCELLED"
    REJECTED = "REJECTED"
    FAILED = "FAILED"

class CopyStrategy(PyEnum):
    FIXED_RATIO = "FIXED_RATIO"      # e.g., 1:2 ratio
    PERCENTAGE = "PERCENTAGE"        # % of capital
    FIXED_QUANTITY = "FIXED_QUANTITY" # Always same quantity

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    username = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)

    # Profile
    full_name = Column(String(255))
    role = Column(Enum(UserRole), default=UserRole.FOLLOWER, nullable=False)

    # Account status
    is_active = Column(Boolean, default=True, nullable=False)
    is_verified = Column(Boolean, default=False, nullable=False)

    # IIFL Integration - Complete fields matching API requirements
    iifl_account_id = Column(String(100), unique=True, index=True)  # ClientCode
    iifl_user_id = Column(String(100))  # userId for authentication
    iifl_password = Column(String(255))  # password for authentication
    iifl_api_key = Column(String(255))  # key from IIFL API
    iifl_app_name = Column(String(100), default="CopyTrade")  # appName
    iifl_app_version = Column(String(20), default="1.0.0")  # appVer
    iifl_public_ip = Column(String(45))  # PublicIP for order requests

    # Trading
    balance = Column(DECIMAL(15, 2), default=PyDecimal('100000.00'))  # Default 1 lakh

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    last_login = Column(DateTime(timezone=True))

    # Relationships
    master_orders = relationship("Order", foreign_keys="Order.user_id", back_populates="user")
    master_relationships = relationship("FollowerRelationship", foreign_keys="FollowerRelationship.master_id")
    follower_relationships = relationship("FollowerRelationship", foreign_keys="FollowerRelationship.follower_id")

class FollowerRelationship(Base):
    __tablename__ = "follower_relationships"

    id = Column(Integer, primary_key=True, index=True)

    # Core relationship
    master_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    follower_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # Copy strategy configuration
    copy_strategy = Column(Enum(CopyStrategy), default=CopyStrategy.FIXED_RATIO, nullable=False)
    ratio = Column(DECIMAL(5, 2), default=PyDecimal('1.00'))  # For FIXED_RATIO
    percentage = Column(DECIMAL(5, 2), default=PyDecimal('10.00'))  # For PERCENTAGE
    fixed_quantity = Column(Integer, default=1)  # For FIXED_QUANTITY

    # Risk management
    max_order_value = Column(DECIMAL(15, 2), default=PyDecimal('10000000.00'))  # ₹1 Crore default
    max_daily_loss = Column(DECIMAL(15, 2), default=PyDecimal('5000000.00'))    # ₹50 Lakh daily

    # Status
    is_active = Column(Boolean, default=True, nullable=False)
    auto_follow = Column(Boolean, default=True, nullable=False)  # Auto-copy all orders

    # Timestamps
    followed_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    master = relationship("User", foreign_keys=[master_id])
    follower = relationship("User", foreign_keys=[follower_id])

class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)

    # User and master order relationship
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    master_order_id = Column(Integer, ForeignKey("orders.id"), nullable=True)  # NULL for master orders
    is_master_order = Column(Boolean, default=False, nullable=False)

    # Order details
    symbol = Column(String(20), nullable=False, index=True)  # e.g., "RELIANCE", "TCS"
    side = Column(Enum(OrderSide), nullable=False)
    order_type = Column(Enum(OrderType), nullable=False)

    # Quantities and prices
    quantity = Column(Integer, nullable=False)
    price = Column(DECIMAL(10, 2), nullable=True)  # NULL for market orders
    filled_quantity = Column(Integer, default=0)
    average_price = Column(DECIMAL(10, 2), nullable=True)

    # Status and tracking
    status = Column(Enum(OrderStatus), default=OrderStatus.PENDING, nullable=False)
    broker_order_id = Column(String(100), unique=True, index=True)  # IIFL BrokerOrderID
    exchange_order_id = Column(String(100), index=True)  # IIFL ExchOrderID
    remote_order_id = Column(String(100), index=True)  # IIFL RemoteOrderID

    # Error handling
    error_message = Column(Text, nullable=True)
    retry_count = Column(Integer, default=0)

    # Performance metrics
    replication_latency_ms = Column(Integer, nullable=True)  # How long replication took

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    filled_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    user = relationship("User", foreign_keys=[user_id], back_populates="master_orders")
    master_order = relationship("Order", remote_side=[id])
    follower_orders = relationship("Order", remote_side=[master_order_id])

class TradingSession(Base):
    __tablename__ = "trading_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # Session details
    iifl_session_token = Column(String(500), nullable=True)
    session_expires_at = Column(DateTime(timezone=True), nullable=True)

    # Status
    is_active = Column(Boolean, default=True, nullable=False)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User")

class OrderHistory(Base):
    __tablename__ = "order_history"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)

    # Status change tracking
    old_status = Column(Enum(OrderStatus), nullable=True)
    new_status = Column(Enum(OrderStatus), nullable=False)

    # Additional data
    message = Column(String(500), nullable=True)

    # Timestamp
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    order = relationship("Order")

class ReplicationMetrics(Base):
    __tablename__ = "replication_metrics"

    id = Column(Integer, primary_key=True, index=True)
    master_order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)

    # Metrics
    total_followers = Column(Integer, nullable=False)
    successful_replications = Column(Integer, nullable=False)
    failed_replications = Column(Integer, nullable=False)
    average_latency_ms = Column(DECIMAL(8, 2), nullable=False)
    total_replication_time_ms = Column(DECIMAL(10, 2), nullable=False)

    # Timestamp
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    master_order = relationship("Order")

class IIFLScripCode(Base):
    __tablename__ = "iifl_scrip_codes"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String(20), unique=True, index=True, nullable=False)  # e.g., "RELIANCE"
    scrip_code = Column(Integer, nullable=False)  # IIFL ScripCode e.g., 2885
    exchange = Column(String(10), default="N", nullable=False)  # N=NSE, B=BSE
    exchange_type = Column(String(10), default="C", nullable=False)  # C=Cash, F=Future, O=Option

    # Additional IIFL fields
    isin = Column(String(20))  # ISIN code
    company_name = Column(String(255))  # Full company name
    lot_size = Column(Integer, default=1)  # Minimum lot size
    tick_size = Column(DECIMAL(10, 4), default=PyDecimal('0.05'))  # Minimum price movement

    # Status
    is_active = Column(Boolean, default=True, nullable=False)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


# ============================================
# AUDIT LOG - Track all system operations
# ============================================
class AuditActionType(PyEnum):
    # Order actions
    ORDER_CREATED = "ORDER_CREATED"
    ORDER_MODIFIED = "ORDER_MODIFIED"
    ORDER_CANCELLED = "ORDER_CANCELLED"
    ORDER_FILLED = "ORDER_FILLED"
    ORDER_REJECTED = "ORDER_REJECTED"
    ORDER_FAILED = "ORDER_FAILED"

    # User actions
    USER_LOGIN = "USER_LOGIN"
    USER_LOGOUT = "USER_LOGOUT"
    USER_CREATED = "USER_CREATED"
    USER_UPDATED = "USER_UPDATED"
    USER_DELETED = "USER_DELETED"

    # Master/Follower actions
    MASTER_CREATED = "MASTER_CREATED"
    FOLLOWER_CREATED = "FOLLOWER_CREATED"
    MAPPING_CREATED = "MAPPING_CREATED"
    MAPPING_DELETED = "MAPPING_DELETED"

    # System actions
    WEBHOOK_RECEIVED = "WEBHOOK_RECEIVED"
    REPLICATION_STARTED = "REPLICATION_STARTED"
    REPLICATION_COMPLETED = "REPLICATION_COMPLETED"
    REPLICATION_FAILED = "REPLICATION_FAILED"

    # API actions
    IIFL_AUTH_SUCCESS = "IIFL_AUTH_SUCCESS"
    IIFL_AUTH_FAILED = "IIFL_AUTH_FAILED"
    IIFL_API_ERROR = "IIFL_API_ERROR"


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)

    # Action details
    action_type = Column(Enum(AuditActionType), nullable=False, index=True)
    action_description = Column(Text, nullable=True)

    # User/Entity tracking
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    master_order_id = Column(Integer, ForeignKey("orders.id"), nullable=True, index=True)
    follower_order_id = Column(Integer, nullable=True)

    # Request tracking
    request_id = Column(String(100), index=True)
    ip_address = Column(String(45))
    user_agent = Column(String(500))

    # Additional metadata (JSON)
    metadata = Column(Text, nullable=True)  # Store JSON string

    # Status
    success = Column(Boolean, default=True, nullable=False)
    error_message = Column(Text, nullable=True)

    # Timestamp
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    # Relationships
    user = relationship("User", foreign_keys=[user_id])
    master_order = relationship("Order", foreign_keys=[master_order_id])


# ============================================
# ORDER MAP - Track master to follower order mapping
# ============================================
class OrderMap(Base):
    __tablename__ = "order_maps"

    id = Column(Integer, primary_key=True, index=True)

    # Master order reference
    master_order_id = Column(Integer, ForeignKey("orders.id"), nullable=False, index=True)
    master_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    master_broker_order_id = Column(String(100), index=True)  # IIFL BrokerOrderID from master

    # Follower order reference
    follower_order_id = Column(Integer, ForeignKey("orders.id"), nullable=False, index=True)
    follower_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    follower_broker_order_id = Column(String(100), index=True)  # IIFL BrokerOrderID from follower

    # Mapping metadata
    scaling_factor = Column(DECIMAL(10, 4), default=PyDecimal('1.0000'))
    original_quantity = Column(Integer, nullable=False)  # Master order quantity
    follower_quantity = Column(Integer, nullable=False)  # Follower order quantity (after scaling)

    # Status tracking
    replication_status = Column(String(50), default="PENDING")  # PENDING, SUCCESS, FAILED
    replication_latency_ms = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    master_order = relationship("Order", foreign_keys=[master_order_id])
    follower_order = relationship("Order", foreign_keys=[follower_order_id])
    master_user = relationship("User", foreign_keys=[master_user_id])
    follower_user = relationship("User", foreign_keys=[follower_user_id])