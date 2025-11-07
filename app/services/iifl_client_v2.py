"""
IIFL API Client - EXACT API STRUCTURE IMPLEMENTATION
Matches IIFL's exact JSON format and requirements
"""
import httpx
import asyncio
import time
from typing import Dict, Optional, Any, List
from datetime import datetime, timedelta
import json
import logging
from app.core.config import settings
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.models import IIFLScripCode, User

logger = logging.getLogger(__name__)

class IIFLAPIError(Exception):
    """Custom exception for IIFL API errors"""
    def __init__(self, message: str, status_code: int = None, error_code: str = None):
        self.message = message
        self.status_code = status_code
        self.error_code = error_code
        super().__init__(self.message)

class IIFLClientV2:
    """
    IIFL API Client matching EXACT API structure

    Features:
    - Exact JSON format as per IIFL documentation
    - All required fields collection
    - BO/CO order support
    - Order status and trade information
    - ScripCode mapping
    """

    def __init__(self):
        self.client = httpx.AsyncClient(
            timeout=httpx.Timeout(30.0),
            headers={
                "Content-Type": "application/json",
                "Ocp-Apim-Subscription-Key": settings.IIFL_API_KEY  # Required in header
            }
        )

        # Base URLs
        self.base_url = "https://dataservice.iifl.in/openapi/prod"

        # Order ID counter for uniqueness
        self.order_id_counter = 1

    def _get_current_time_iifl_format(self) -> str:
        """Get current time in IIFL format: /Date(1563857357612)/"""
        timestamp_ms = int(time.time() * 1000)
        return f"/Date({timestamp_ms})/"

    def _get_remote_order_id(self, user_id: str) -> str:
        """Generate unique RemoteOrderID"""
        timestamp = int(time.time())
        return f"{user_id}{timestamp}{self.order_id_counter:03d}"

    async def _get_scrip_code(self, symbol: str, db: AsyncSession) -> int:
        """Get IIFL ScripCode for symbol"""
        query = select(IIFLScripCode).where(
            IIFLScripCode.symbol == symbol.upper(),
            IIFLScripCode.is_active == True
        )
        result = await db.execute(query)
        scrip = result.scalar_one_or_none()

        if not scrip:
            # Default ScripCode for common stocks (should be populated in database)
            default_codes = {
                "RELIANCE": 2885,
                "TCS": 11536,
                "INFY": 408,
                "HDFC": 1333,
                "ICICIBANK": 4963,
                "HDFCBANK": 1363,
                "ITC": 424,
                "SBIN": 3045,
                "BHARTIARTL": 10604,
                "KOTAKBANK": 1922
            }
            return default_codes.get(symbol.upper(), 2885)  # Default to RELIANCE

        return scrip.scrip_code

    async def place_order(
        self,
        user: User,
        symbol: str,
        side: str,  # "BUY" or "SELL"
        quantity: int,
        price: Optional[float] = None,
        order_type: str = "LIMIT",  # "LIMIT" or "MARKET"
        product_type: str = "MIS",  # "MIS", "CNC", "NRML"
        validity: str = "DAY",
        db: AsyncSession = None
    ) -> Dict[str, Any]:
        """
        Place order using EXACT IIFL API structure

        Args:
            user: User object with IIFL credentials
            symbol: Stock symbol (e.g., "RELIANCE")
            side: "BUY" or "SELL"
            quantity: Number of shares
            price: Limit price (None for market orders)
            order_type: "LIMIT" or "MARKET"
            product_type: "MIS", "CNC", "NRML"
            validity: "DAY", "IOC", "GTD"
            db: Database session for ScripCode lookup

        Returns:
            dict: IIFL API response
        """

        try:
            # Validate user has all required IIFL fields
            required_fields = [
                'iifl_account_id', 'iifl_user_id', 'iifl_password',
                'iifl_api_key', 'iifl_app_name', 'iifl_public_ip'
            ]

            missing_fields = [field for field in required_fields if not getattr(user, field, None)]
            if missing_fields:
                raise IIFLAPIError(f"Missing required IIFL fields: {missing_fields}")

            # Get ScripCode
            scrip_code = await self._get_scrip_code(symbol, db) if db else 2885

            # Generate unique RemoteOrderID
            remote_order_id = self._get_remote_order_id(user.iifl_account_id)

            # Get current time in IIFL format
            order_date_time = self._get_current_time_iifl_format()
            valid_till_date = self._get_current_time_iifl_format()

            # Prepare EXACT IIFL JSON structure
            request_data = {
                "_ReqData": {
                    "head": {
                        "requestCode": "IIFLMarRQOrdReq",
                        "key": user.iifl_api_key,
                        "appVer": user.iifl_app_version or "1.0.0",
                        "appName": user.iifl_app_name or "CopyTrade",
                        "osName": "WEB",  # Can be WEB, Android, iOS
                        "userId": user.iifl_user_id,
                        "password": user.iifl_password
                    },
                    "body": {
                        "ClientCode": user.iifl_account_id,
                        "OrderFor": "P",  # P=Place, M=Modify, C=Cancel
                        "Exchange": "N",  # N=NSE, B=BSE, M=MCX
                        "ExchangeType": "C",  # C=Cash, D=Derivative, U=Currency
                        "Price": float(price) if price else 0.0,
                        "OrderID": self.order_id_counter,
                        "OrderType": side.upper(),  # BUY or SELL
                        "Qty": quantity,
                        "OrderDateTime": order_date_time,
                        "ScripCode": scrip_code,
                        "AtMarket": order_type == "MARKET",
                        "RemoteOrderID": remote_order_id,
                        "ExchOrderID": "0",  # 0 for fresh orders
                        "DisQty": 0,  # Disclosed quantity
                        "IsStopLossOrder": False,
                        "StopLossPrice": 0.0,
                        "IsVTD": False,  # Valid Till Date
                        "IOCOrder": validity == "IOC",
                        "IsIntraday": product_type == "MIS",
                        "PublicIP": user.iifl_public_ip,
                        "AHPlaced": "N",  # After Hours placement
                        "ValidTillDate": valid_till_date,
                        "iOrderValidity": 0,  # 0=Day, 1=GTD, 2=GTC, 3=IOC, 4=EOS, 6=FOK
                        "OrderRequesterCode": user.iifl_account_id,
                        "TradedQty": 0  # 0 for fresh orders
                    }
                },
                "AppSource": 58  # App source code
            }

            # Increment order counter
            self.order_id_counter += 1

            logger.info(f"🔥 Placing IIFL order: {side} {quantity} {symbol} @ {price}")
            logger.debug(f"IIFL Request: {json.dumps(request_data, indent=2)}")

            # Make API call to IIFL
            response = await self.client.post(
                f"{self.base_url}/OrderRequest",
                json=request_data
            )

            response.raise_for_status()
            result = response.json()

            logger.debug(f"IIFL Response: {json.dumps(result, indent=2)}")

            # Parse IIFL response
            if result.get("head", {}).get("status") == "0":  # Success
                body = result.get("body", {})

                if body.get("Status") == 0:  # Order accepted
                    return {
                        "success": True,
                        "order_id": str(body.get("BrokerOrderID")),
                        "exchange_order_id": str(body.get("ExchOrderID")),
                        "remote_order_id": remote_order_id,
                        "status": "SUBMITTED",
                        "message": body.get("Message", "Order placed successfully"),
                        "scrip_code": scrip_code,
                        "client_code": body.get("ClientCode"),
                        "exchange": body.get("Exch"),
                        "exchange_type": body.get("ExchType"),
                        "time": body.get("Time")
                    }
                else:
                    # Order rejected
                    error_msg = body.get("Message", "Order rejected")
                    logger.error(f"❌ IIFL Order rejected: {error_msg}")
                    raise IIFLAPIError(error_msg, error_code=body.get("Status"))
            else:
                # API error
                head = result.get("head", {})
                error_msg = head.get("statusDescription", "API error")
                logger.error(f"❌ IIFL API error: {error_msg}")
                raise IIFLAPIError(error_msg, error_code=head.get("status"))

        except httpx.HTTPStatusError as e:
            error_msg = f"HTTP {e.response.status_code}: {e.response.text}"
            logger.error(f"❌ IIFL HTTP error: {error_msg}")
            raise IIFLAPIError(error_msg, e.response.status_code)

        except Exception as e:
            error_msg = f"IIFL order placement error: {str(e)}"
            logger.error(f"❌ {error_msg}")
            raise IIFLAPIError(error_msg)

    async def get_order_status(
        self,
        user: User,
        symbol: str,
        remote_order_id: str,
        scrip_code: int,
        exchange: str = "N",
        exchange_type: str = "C"
    ) -> Dict[str, Any]:
        """
        Get order status using IIFL OrderStatus API
        """
        try:
            request_data = {
                "head": {
                    "appName": user.iifl_app_name or "CopyTrade",
                    "appVer": user.iifl_app_version or "1.0",
                    "key": user.iifl_api_key,
                    "osName": "WEB",
                    "requestCode": "IIFLMarRQOrdStatus",
                    "userId": user.iifl_user_id,
                    "password": user.iifl_password
                },
                "body": {
                    "ClientCode": user.iifl_account_id,
                    "OrdStatusReqList": [
                        {
                            "Exch": exchange,
                            "ExchType": exchange_type,
                            "ScripCode": scrip_code,
                            "RemoteOrderID": remote_order_id
                        }
                    ]
                }
            }

            response = await self.client.post(
                f"{self.base_url}/OrderStatus",
                json=request_data
            )

            response.raise_for_status()
            result = response.json()

            if result.get("head", {}).get("status") == "0":
                body = result.get("body", {})
                if body.get("Status") == 0:
                    order_list = body.get("OrdStatusResLst", [])
                    if order_list:
                        order = order_list[0]
                        return {
                            "success": True,
                            "status": order.get("Status"),
                            "order_qty": order.get("OrderQty"),
                            "order_rate": order.get("OrderRate"),
                            "traded_qty": order.get("TradedQty"),
                            "pending_qty": order.get("PendingQty"),
                            "exchange_order_id": order.get("ExchOrderID"),
                            "exchange_order_time": order.get("ExchOrderTime"),
                            "symbol": order.get("Symbol")
                        }

            return {"success": False, "message": "Order not found"}

        except Exception as e:
            logger.error(f"❌ Error getting order status: {e}")
            raise IIFLAPIError(f"Error getting order status: {str(e)}")

    async def place_bracket_order(
        self,
        user: User,
        symbol: str,
        side: str,
        quantity: int,
        limit_price: float,
        profit_price: float,
        stop_loss_price: float,
        db: AsyncSession = None
    ) -> Dict[str, Any]:
        """
        Place Bracket Order (BO) using IIFL PlaceSMOOrder API
        """
        try:
            scrip_code = await self._get_scrip_code(symbol, db) if db else 2885

            # Generate unique order IDs
            unique_normal = f"{user.iifl_account_id}{int(time.time())}{self.order_id_counter:03d}"
            unique_sl = f"{user.iifl_account_id}{int(time.time())}{self.order_id_counter+1:03d}"
            unique_limit = f"{user.iifl_account_id}{int(time.time())}{self.order_id_counter+2:03d}"

            request_data = {
                "p_data": {
                    "head": {
                        "appName": user.iifl_app_name or "CopyTrade",
                        "appVer": user.iifl_app_version or "1.0",
                        "key": user.iifl_api_key,
                        "osName": "WEB",
                        "requestCode": "IIFLMarRQPSMOOrder",
                        "userId": user.iifl_user_id,
                        "password": user.iifl_password
                    },
                    "body": {
                        "ClientCode": user.iifl_account_id,
                        "OrderRequesterCode": user.iifl_account_id,
                        "RequestType": "P",  # P=Place
                        "BuySell": "B" if side.upper() == "BUY" else "S",
                        "Qty": quantity,
                        "Exch": "N",  # NSE
                        "ExchType": "C",  # Cash
                        "ExchOrderId": 0,
                        "DisQty": 0,
                        "AtMarket": False,
                        "LimitPriceInitialOrder": limit_price,
                        "TriggerPriceInitialOrder": 0,
                        "LimitPriceProfitOrder": profit_price,
                        "LimitPriceForSL": stop_loss_price,
                        "TriggerPriceForSL": 0,
                        "TrailingSL": 0.005,  # 0.5% trailing SL
                        "StopLoss": True,
                        "ScripCode": scrip_code,
                        "OrderFor": "S",  # SMO Order
                        "UniqueOrderIDNormal": unique_normal,
                        "UniqueOrderIDSL": unique_sl,
                        "UniqueOrderIDLimit": unique_limit,
                        "LocalOrderIDNormal": self.order_id_counter,
                        "LocalOrderIDSL": self.order_id_counter + 1,
                        "LocalOrderIDLimit": self.order_id_counter + 2,
                        "PublicIP": user.iifl_public_ip
                    }
                },
                "AppSource": 58
            }

            self.order_id_counter += 3

            response = await self.client.post(
                f"{self.base_url}/PlaceSMOOrder",
                json=request_data
            )

            response.raise_for_status()
            result = response.json()

            if result.get("head", {}).get("status") == "0":
                body = result.get("body", {})
                if body.get("RMSStatus") == 0:
                    return {
                        "success": True,
                        "broker_order_id_normal": body.get("BrokerOrderIDNormal"),
                        "broker_order_id_sl": body.get("BrokerOrderIDSL"),
                        "broker_order_id_profit": body.get("BrokerOrderIDProfit"),
                        "local_order_id_normal": body.get("LocalOrderIDNormal"),
                        "local_order_id_sl": body.get("LocalOrderIDSL"),
                        "local_order_id_profit": body.get("LocalOrderIDProfit"),
                        "message": body.get("Message", "Bracket order placed successfully")
                    }

            return {"success": False, "message": "Bracket order placement failed"}

        except Exception as e:
            logger.error(f"❌ Error placing bracket order: {e}")
            raise IIFLAPIError(f"Error placing bracket order: {str(e)}")

    async def get_trade_information(
        self,
        user: User,
        exchange_order_ids: List[str],
        scrip_codes: List[int],
        exchange: str = "N",
        exchange_type: str = "C"
    ) -> Dict[str, Any]:
        """
        Get trade information using IIFL TradeInformation API
        """
        try:
            trade_info_list = []
            for i, (order_id, scrip_code) in enumerate(zip(exchange_order_ids, scrip_codes)):
                trade_info_list.append({
                    "Exch": exchange,
                    "ExchType": exchange_type,
                    "ScripCode": scrip_code,
                    "ExchOrderID": order_id
                })

            request_data = {
                "head": {
                    "appName": user.iifl_app_name or "CopyTrade",
                    "appVer": user.iifl_app_version or "1.0",
                    "key": user.iifl_api_key,
                    "osName": "WEB",
                    "requestCode": "IIFLMarRQTrdInfo",
                    "userId": user.iifl_user_id,
                    "password": user.iifl_password
                },
                "body": {
                    "ClientCode": user.iifl_account_id,
                    "TradeInformationList": trade_info_list
                }
            }

            response = await self.client.post(
                f"{self.base_url}/TradeInformation",
                json=request_data
            )

            response.raise_for_status()
            result = response.json()

            if result.get("head", {}).get("status") == "0":
                body = result.get("body", {})
                if body.get("Status") == 0:
                    return {
                        "success": True,
                        "trade_details": body.get("TradeDetail", []),
                        "message": body.get("Message", "")
                    }

            return {"success": False, "message": "No trade information found"}

        except Exception as e:
            logger.error(f"❌ Error getting trade information: {e}")
            raise IIFLAPIError(f"Error getting trade information: {str(e)}")

    async def close(self):
        """Close HTTP client"""
        await self.client.aclose()

# Mock client for testing
class MockIIFLClientV2(IIFLClientV2):
    """Mock client that simulates IIFL responses"""

    def __init__(self):
        # Don't initialize HTTP client
        self.order_id_counter = 1000

    async def place_order(self, user, symbol, side, quantity, price=None, **kwargs):
        """Mock order placement"""
        await asyncio.sleep(0.1)  # Simulate API latency

        order_id = self.order_id_counter
        self.order_id_counter += 1

        return {
            "success": True,
            "order_id": str(order_id),
            "exchange_order_id": f"110000000000{order_id}",
            "remote_order_id": f"MOCK{int(time.time())}{order_id}",
            "status": "SUBMITTED",
            "message": "Mock order placed successfully",
            "scrip_code": 2885,
            "client_code": user.iifl_account_id,
            "exchange": "N",
            "exchange_type": "C",
            "time": f"/Date({int(time.time() * 1000)}+0530)/"
        }

    async def get_order_status(self, user, symbol, remote_order_id, scrip_code, **kwargs):
        """Mock order status"""
        await asyncio.sleep(0.05)

        return {
            "success": True,
            "status": "FILLED",
            "order_qty": 10,
            "order_rate": 2500.50,
            "traded_qty": 10,
            "pending_qty": 0,
            "exchange_order_id": "1100000000031379",
            "exchange_order_time": f"/Date({int(time.time() * 1000)}+0530)/",
            "symbol": symbol
        }

    async def close(self):
        """No cleanup needed"""
        pass

# Global client factory
def get_iifl_client_v2():
    """Get IIFL client instance with exact API structure"""
    if settings.IIFL_API_KEY and settings.IIFL_API_SECRET:
        return IIFLClientV2()
    else:
        logger.warning("⚠️  Using mock IIFL client - configure real credentials for production")
        return MockIIFLClientV2()