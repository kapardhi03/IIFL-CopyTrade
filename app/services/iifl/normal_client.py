"""
IIFL Normal REST API Client for Follower Accounts
Based on official documentation: https://api.iiflsecurities.com/index.html

This client handles:
- Vendor and Client authentication
- Order placement (Normal, BO, CO)
- Order modification
- Order cancellation
- Order status retrieval
"""
import httpx
import logging
from typing import Optional, Dict, Any
from datetime import datetime, timedelta
from app.core.config import settings
from app.core.retry import retry_iifl_api, exponential_backoff_retry
from app.core.exceptions import (
    IIFLAuthenticationError,
    IIFLOrderError,
    IIFLConnectionError,
    IIFLInvalidResponseError,
    IIFLRateLimitError
)

logger = logging.getLogger(__name__)


class IIFLNormalClient:
    """
    IIFL Normal REST API Client for follower order execution
    """

    def __init__(
        self,
        api_url: str = None,
        vendor_key: str = None,
        vendor_code: str = None,
        api_secret: str = None,
        timeout: int = 30
    ):
        """
        Initialize IIFL Normal REST API client

        Args:
            api_url: IIFL API base URL
            vendor_key: Vendor API key
            vendor_code: Vendor code
            api_secret: API secret
            timeout: Request timeout in seconds
        """
        self.api_url = api_url or settings.IIFL_API_URL
        self.vendor_key = vendor_key or settings.IIFL_VENDOR_KEY
        self.vendor_code = vendor_code or settings.IIFL_VENDOR_CODE
        self.api_secret = api_secret or settings.IIFL_API_SECRET
        self.timeout = timeout

        # HTTP client with connection pooling
        self.client = httpx.AsyncClient(
            base_url=self.api_url,
            timeout=timeout,
            limits=httpx.Limits(
                max_connections=settings.HTTP_POOL_CONNECTIONS,
                max_keepalive_connections=settings.HTTP_POOL_MAXSIZE
            )
        )

    async def close(self) -> None:
        """Close HTTP client"""
        await self.client.aclose()

    # ============================================
    # AUTHENTICATION
    # ============================================
    @retry_iifl_api(max_retries=3, base_delay=1.0)
    async def vendor_login(self) -> Dict[str, Any]:
        """
        Perform vendor authentication

        Returns:
            Vendor session data

        Raises:
            IIFLAuthenticationError: If authentication fails
        """
        try:
            endpoint = "/LoginRequestMobileNewbyVendor"

            payload = {
                "head": {
                    "key": self.vendor_key
                },
                "body": {
                    "VendorCode": self.vendor_code,
                    "VendorKey": self.vendor_key,
                    "LocalIP": "127.0.0.1",
                    "PublicIP": "127.0.0.1"
                }
            }

            response = await self.client.post(endpoint, json=payload)
            response.raise_for_status()

            data = response.json()

            if not data.get("body", {}).get("Success"):
                error_msg = data.get("body", {}).get("Message", "Vendor login failed")
                raise IIFLAuthenticationError(f"Vendor login failed: {error_msg}")

            logger.info("Vendor authentication successful")
            return data["body"]

        except httpx.HTTPStatusError as e:
            logger.error(f"Vendor login HTTP error: {e}")
            raise IIFLAuthenticationError(f"Vendor login failed: {e}")
        except Exception as e:
            logger.error(f"Vendor login error: {e}")
            raise IIFLConnectionError(f"Vendor login connection error: {e}")

    @retry_iifl_api(max_retries=3, base_delay=1.0)
    async def client_login(
        self,
        user_id: str,
        password: str,
        encryption_key: str,
        app_name: str = "CopyTrade",
        app_version: str = "1.0.0",
        public_ip: str = "127.0.0.1"
    ) -> Dict[str, Any]:
        """
        Perform client authentication

        Args:
            user_id: Client user ID
            password: Client password
            encryption_key: Encryption key from vendor login
            app_name: Application name
            app_version: Application version
            public_ip: Client public IP

        Returns:
            Client session data with token

        Raises:
            IIFLAuthenticationError: If authentication fails
        """
        try:
            endpoint = "/LoginRequestMobileNew"

            payload = {
                "head": {
                    "key": self.vendor_key
                },
                "body": {
                    "ClientCode": user_id,
                    "Password": password,
                    "HDSerialNumber": "12345",
                    "MACAddress": "00:00:00:00:00:00",
                    "MachineID": "1234",
                    "VersionNo": "1.0",
                    "RequestNo": "1",
                    "My2PIN": password,  # Can be different in production
                    "ConnectionType": "1"
                }
            }

            response = await self.client.post(endpoint, json=payload)
            response.raise_for_status()

            data = response.json()

            if not data.get("body", {}).get("LoginSuccessful"):
                error_msg = data.get("body", {}).get("Message", "Client login failed")
                raise IIFLAuthenticationError(f"Client login failed: {error_msg}")

            logger.info(f"Client authentication successful for user: {user_id}")
            return data["body"]

        except httpx.HTTPStatusError as e:
            logger.error(f"Client login HTTP error: {e}")
            raise IIFLAuthenticationError(f"Client login failed: {e}")
        except Exception as e:
            logger.error(f"Client login error: {e}")
            raise IIFLConnectionError(f"Client login connection error: {e}")

    async def authenticate_user(
        self,
        user_id: str,
        password: str,
        app_name: str = "CopyTrade",
        public_ip: str = "127.0.0.1"
    ) -> Dict[str, Any]:
        """
        Full authentication flow (vendor + client)

        Args:
            user_id: Client user ID
            password: Client password
            app_name: Application name
            public_ip: Client IP address

        Returns:
            Authentication data with session token
        """
        # Step 1: Vendor login
        vendor_data = await self.vendor_login()
        encryption_key = vendor_data.get("EncryptionKey", "")

        # Step 2: Client login
        client_data = await self.client_login(
            user_id=user_id,
            password=password,
            encryption_key=encryption_key,
            app_name=app_name,
            public_ip=public_ip
        )

        return {
            "token": client_data.get("ClientToken"),
            "client_code": client_data.get("ClientCode"),
            "encryption_key": encryption_key,
            "session_data": client_data
        }

    # ============================================
    # ORDER PLACEMENT
    # ============================================
    @retry_iifl_api(max_retries=2, base_delay=0.5)
    async def place_order(
        self,
        token: str,
        exchange: str,
        exchange_type: str,
        scrip_code: int,
        qty: int,
        price: float,
        order_type: str,
        is_intraday: bool,
        client_code: str,
        ahploss: float = 0,
        ahptarget: float = 0,
        iOrderValidity: int = 0,
        public_ip: str = "127.0.0.1"
    ) -> Dict[str, Any]:
        """
        Place a normal order

        Args:
            token: Session token
            exchange: Exchange (N=NSE, B=BSE)
            exchange_type: Exchange type (C=Cash, D=Derivative, etc.)
            scrip_code: IIFL scrip code
            qty: Quantity
            price: Price (0 for market orders)
            order_type: BUY or SELL
            is_intraday: True for intraday, False for delivery
            client_code: Client code
            ahploss: Stop loss (0 if not applicable)
            ahptarget: Target (0 if not applicable)
            iOrderValidity: Order validity (0=DAY)
            public_ip: Client IP

        Returns:
            Order response with BrokerOrderID

        Raises:
            IIFLOrderError: If order placement fails
        """
        try:
            endpoint = "/OrderRequest"

            payload = {
                "head": {
                    "key": self.vendor_key
                },
                "body": {
                    "ClientCode": client_code,
                    "OrderFor": "P",  # P=Place order
                    "Exchange": exchange,
                    "ExchangeType": exchange_type,
                    "ScripCode": scrip_code,
                    "Qty": qty,
                    "Price": price,
                    "OrderType": order_type,
                    "IsIntraday": is_intraday,
                    "ahploss": ahploss,
                    "ahptarget": ahptarget,
                    "iOrderValidity": iOrderValidity,
                    "PublicIP": public_ip,
                    "AppSource": "55026",
                    "DisQty": 0
                }
            }

            # Add authentication header
            headers = {
                "Authorization": f"Bearer {token}"
            }

            response = await self.client.post(
                endpoint,
                json=payload,
                headers=headers
            )
            response.raise_for_status()

            data = response.json()

            if not data.get("body", {}).get("Success"):
                error_msg = data.get("body", {}).get("Message", "Order placement failed")
                raise IIFLOrderError(f"Order failed: {error_msg}")

            logger.info(
                f"Order placed successfully: "
                f"BrokerOrderID={data['body'].get('BrokerOrderID')}"
            )

            return data["body"]

        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429:
                raise IIFLRateLimitError("Rate limit exceeded")
            logger.error(f"Order placement HTTP error: {e}")
            raise IIFLOrderError(f"Order placement failed: {e}")
        except Exception as e:
            logger.error(f"Order placement error: {e}")
            raise IIFLOrderError(f"Order placement error: {e}")

    # ============================================
    # ORDER MODIFICATION
    # ============================================
    @retry_iifl_api(max_retries=2, base_delay=0.5)
    async def modify_order(
        self,
        token: str,
        client_code: str,
        broker_order_id: str,
        exchange_order_id: str,
        traded_qty: int,
        qty: int,
        price: float,
        exchange: str,
        exchange_type: str,
        scrip_code: int,
        public_ip: str = "127.0.0.1"
    ) -> Dict[str, Any]:
        """
        Modify an existing order

        Args:
            token: Session token
            client_code: Client code
            broker_order_id: Broker order ID
            exchange_order_id: Exchange order ID
            traded_qty: Already traded quantity
            qty: New quantity
            price: New price
            exchange: Exchange (N/B)
            exchange_type: Exchange type
            scrip_code: IIFL scrip code
            public_ip: Client IP

        Returns:
            Modification response

        Raises:
            IIFLOrderError: If modification fails
        """
        try:
            endpoint = "/OrderRequest"

            payload = {
                "head": {
                    "key": self.vendor_key
                },
                "body": {
                    "ClientCode": client_code,
                    "OrderFor": "M",  # M=Modify
                    "BrokerOrderID": broker_order_id,
                    "ExchOrderID": exchange_order_id,
                    "TradedQty": traded_qty,
                    "Qty": qty,
                    "Price": price,
                    "Exchange": exchange,
                    "ExchangeType": exchange_type,
                    "ScripCode": scrip_code,
                    "PublicIP": public_ip
                }
            }

            headers = {"Authorization": f"Bearer {token}"}

            response = await self.client.post(
                endpoint,
                json=payload,
                headers=headers
            )
            response.raise_for_status()

            data = response.json()

            if not data.get("body", {}).get("Success"):
                error_msg = data.get("body", {}).get("Message", "Modification failed")
                raise IIFLOrderError(f"Order modification failed: {error_msg}")

            logger.info(f"Order modified: BrokerOrderID={broker_order_id}")
            return data["body"]

        except Exception as e:
            logger.error(f"Order modification error: {e}")
            raise IIFLOrderError(f"Modification error: {e}")

    # ============================================
    # ORDER CANCELLATION
    # ============================================
    @retry_iifl_api(max_retries=2, base_delay=0.5)
    async def cancel_order(
        self,
        token: str,
        client_code: str,
        broker_order_id: str,
        exchange_order_id: str,
        traded_qty: int,
        exchange: str,
        exchange_type: str,
        scrip_code: int,
        public_ip: str = "127.0.0.1"
    ) -> Dict[str, Any]:
        """
        Cancel an existing order

        Args:
            token: Session token
            client_code: Client code
            broker_order_id: Broker order ID
            exchange_order_id: Exchange order ID
            traded_qty: Already traded quantity
            exchange: Exchange
            exchange_type: Exchange type
            scrip_code: IIFL scrip code
            public_ip: Client IP

        Returns:
            Cancellation response

        Raises:
            IIFLOrderError: If cancellation fails
        """
        try:
            endpoint = "/OrderRequest"

            payload = {
                "head": {
                    "key": self.vendor_key
                },
                "body": {
                    "ClientCode": client_code,
                    "OrderFor": "C",  # C=Cancel
                    "BrokerOrderID": broker_order_id,
                    "ExchOrderID": exchange_order_id,
                    "TradedQty": traded_qty,
                    "Exchange": exchange,
                    "ExchangeType": exchange_type,
                    "ScripCode": scrip_code,
                    "PublicIP": public_ip
                }
            }

            headers = {"Authorization": f"Bearer {token}"}

            response = await self.client.post(
                endpoint,
                json=payload,
                headers=headers
            )
            response.raise_for_status()

            data = response.json()

            if not data.get("body", {}).get("Success"):
                error_msg = data.get("body", {}).get("Message", "Cancellation failed")
                raise IIFLOrderError(f"Order cancellation failed: {error_msg}")

            logger.info(f"Order cancelled: BrokerOrderID={broker_order_id}")
            return data["body"]

        except Exception as e:
            logger.error(f"Order cancellation error: {e}")
            raise IIFLOrderError(f"Cancellation error: {e}")

    # ============================================
    # ORDER STATUS
    # ============================================
    @retry_iifl_api(max_retries=3, base_delay=0.5)
    async def get_order_status(
        self,
        token: str,
        client_code: str,
        broker_order_id: str
    ) -> Dict[str, Any]:
        """
        Get order status

        Args:
            token: Session token
            client_code: Client code
            broker_order_id: Broker order ID

        Returns:
            Order status data

        Raises:
            IIFLOrderError: If status retrieval fails
        """
        try:
            endpoint = "/OrderStatus"

            payload = {
                "head": {
                    "key": self.vendor_key
                },
                "body": {
                    "ClientCode": client_code,
                    "BrokerOrderID": broker_order_id
                }
            }

            headers = {"Authorization": f"Bearer {token}"}

            response = await self.client.post(
                endpoint,
                json=payload,
                headers=headers
            )
            response.raise_for_status()

            data = response.json()
            return data.get("body", {})

        except Exception as e:
            logger.error(f"Order status error: {e}")
            raise IIFLOrderError(f"Status retrieval error: {e}")
