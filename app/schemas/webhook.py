"""
Pydantic schemas for IIFL Blaze webhook events
Based on IIFL Blaze documentation: https://ttblaze.iifl.com/doc/interactive/#tag/Getting-Started
"""
from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime


class BlazeOrderWebhook(BaseModel):
    """
    IIFL Blaze Order Webhook Schema
    Received when master places/modifies/cancels an order
    """
    # Event metadata
    event_type: Literal["order_placed", "order_modified", "order_cancelled", "order_filled"]
    timestamp: Optional[datetime] = None

    # Order identification
    order_id: str = Field(..., description="Blaze order ID")
    broker_order_id: Optional[str] = Field(None, description="Broker order ID")
    exchange_order_id: Optional[str] = Field(None, description="Exchange order ID")

    # Order details
    symbol: str = Field(..., description="Trading symbol")
    scrip_code: Optional[int] = Field(None, description="IIFL scrip code")
    exchange: str = Field(..., description="Exchange (NSE/BSE)")
    segment: str = Field(default="CASH", description="Segment (CASH/FO/etc)")

    # Trade details
    transaction_type: Literal["BUY", "SELL"] = Field(..., description="Buy or Sell")
    order_type: str = Field(..., description="MARKET/LIMIT/SL/SLM")
    quantity: int = Field(..., gt=0, description="Order quantity")
    price: Optional[float] = Field(0, ge=0, description="Order price (0 for market)")
    trigger_price: Optional[float] = Field(0, ge=0, description="Trigger price for SL orders")
    disclosed_quantity: Optional[int] = Field(0, ge=0, description="Disclosed quantity")

    # Execution details
    filled_quantity: Optional[int] = Field(0, ge=0, description="Filled quantity")
    average_price: Optional[float] = Field(0, ge=0, description="Average execution price")
    pending_quantity: Optional[int] = Field(0, ge=0, description="Pending quantity")

    # Status
    status: str = Field(..., description="Order status")
    status_message: Optional[str] = Field(None, description="Status message")

    # Product and validity
    product: Optional[str] = Field("DELIVERY", description="INTRADAY/DELIVERY/CO/BO")
    validity: Optional[str] = Field("DAY", description="DAY/IOC/GTD")

    # Account details
    account_id: str = Field(..., description="Blaze account ID")
    client_code: Optional[str] = Field(None, description="Client code")

    # Additional metadata
    user_id: Optional[str] = Field(None, description="User ID")
    metadata: Optional[dict] = Field(default_factory=dict, description="Additional metadata")

    class Config:
        json_schema_extra = {
            "example": {
                "event_type": "order_placed",
                "order_id": "230614000123456",
                "broker_order_id": "12345678",
                "exchange_order_id": "1100000012345678",
                "symbol": "RELIANCE",
                "scrip_code": 2885,
                "exchange": "NSE",
                "segment": "CASH",
                "transaction_type": "BUY",
                "order_type": "LIMIT",
                "quantity": 10,
                "price": 2500.50,
                "filled_quantity": 0,
                "average_price": 0,
                "pending_quantity": 10,
                "status": "PENDING",
                "product": "DELIVERY",
                "validity": "DAY",
                "account_id": "MASTER001"
            }
        }


class BlazeWebhookResponse(BaseModel):
    """
    Response sent back to Blaze after processing webhook
    """
    success: bool = True
    message: str = "Webhook received successfully"
    processed_at: datetime = Field(default_factory=datetime.utcnow)
    replication_initiated: bool = False
    follower_count: int = 0


class NormalizedOrderEvent(BaseModel):
    """
    Normalized order event for internal processing
    Converts Blaze webhook to standard format for NATS
    """
    # Source information
    source: Literal["blaze", "normal"] = "blaze"
    master_order_id: int
    master_user_id: int
    master_broker_order_id: Optional[str] = None

    # Event type
    event_type: Literal["NEW", "MODIFY", "CANCEL", "FILL"]

    # Order details (normalized)
    symbol: str
    scrip_code: int
    exchange: str
    exchange_type: str

    # Trade details
    side: Literal["BUY", "SELL"]
    order_type: str
    quantity: int
    price: float
    trigger_price: Optional[float] = 0
    disclosed_quantity: Optional[int] = 0

    # Execution
    filled_quantity: int = 0
    average_price: float = 0
    pending_quantity: int = 0

    # Status
    status: str
    product: str = "DELIVERY"
    validity: str = "DAY"
    is_intraday: bool = False

    # Metadata
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    metadata: Optional[dict] = Field(default_factory=dict)

    class Config:
        json_schema_extra = {
            "example": {
                "source": "blaze",
                "master_order_id": 12345,
                "master_user_id": 1,
                "event_type": "NEW",
                "symbol": "RELIANCE",
                "scrip_code": 2885,
                "exchange": "N",
                "exchange_type": "C",
                "side": "BUY",
                "order_type": "LIMIT",
                "quantity": 10,
                "price": 2500.50,
                "filled_quantity": 0,
                "status": "PENDING",
                "is_intraday": False
            }
        }
