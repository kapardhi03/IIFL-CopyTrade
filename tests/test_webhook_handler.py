"""
Unit tests for Blaze webhook handler
Tests webhook normalization and processing
"""
import pytest
from datetime import datetime

from app.schemas.webhook import BlazeOrderWebhook, NormalizedOrderEvent
from app.api.webhooks import normalize_blaze_webhook


class TestWebhookNormalization:
    """Test webhook data normalization"""

    def test_normalize_new_order_webhook(self):
        """Test normalizing a new order webhook"""
        webhook = BlazeOrderWebhook(
            event_type="order_placed",
            order_id="230614000123456",
            broker_order_id="12345678",
            symbol="RELIANCE",
            scrip_code=2885,
            exchange="NSE",
            segment="CASH",
            transaction_type="BUY",
            order_type="LIMIT",
            quantity=10,
            price=2500.50,
            status="PENDING",
            account_id="MASTER001"
        )

        normalized = normalize_blaze_webhook(
            webhook=webhook,
            master_order_id=1,
            master_user_id=1
        )

        assert normalized.event_type == "NEW"
        assert normalized.symbol == "RELIANCE"
        assert normalized.scrip_code == 2885
        assert normalized.exchange == "N"
        assert normalized.exchange_type == "C"
        assert normalized.side == "BUY"
        assert normalized.quantity == 10
        assert normalized.price == 2500.50
        assert normalized.master_order_id == 1

    def test_normalize_market_order(self):
        """Test normalizing market order"""
        webhook = BlazeOrderWebhook(
            event_type="order_placed",
            order_id="123",
            symbol="TCS",
            exchange="NSE",
            segment="CASH",
            transaction_type="SELL",
            order_type="MARKET",
            quantity=5,
            price=0,
            status="PENDING",
            account_id="MASTER001"
        )

        normalized = normalize_blaze_webhook(webhook, 1, 1)

        assert normalized.order_type == "MARKET"
        assert normalized.price == 0
        assert normalized.side == "SELL"

    def test_normalize_stop_loss_order(self):
        """Test normalizing stop loss order"""
        webhook = BlazeOrderWebhook(
            event_type="order_placed",
            order_id="456",
            symbol="INFY",
            exchange="NSE",
            segment="CASH",
            transaction_type="BUY",
            order_type="SL",
            quantity=20,
            price=1500.00,
            trigger_price=1490.00,
            status="PENDING",
            account_id="MASTER001"
        )

        normalized = normalize_blaze_webhook(webhook, 1, 1)

        assert normalized.order_type == "STOP_LOSS"
        assert normalized.trigger_price == 1490.00

    def test_normalize_order_modification(self):
        """Test normalizing order modification"""
        webhook = BlazeOrderWebhook(
            event_type="order_modified",
            order_id="789",
            symbol="HDFC",
            exchange="NSE",
            segment="CASH",
            transaction_type="BUY",
            order_type="LIMIT",
            quantity=15,
            price=1600.00,
            status="PENDING",
            account_id="MASTER001"
        )

        normalized = normalize_blaze_webhook(webhook, 2, 1)

        assert normalized.event_type == "MODIFY"
        assert normalized.master_order_id == 2

    def test_normalize_order_cancellation(self):
        """Test normalizing order cancellation"""
        webhook = BlazeOrderWebhook(
            event_type="order_cancelled",
            order_id="999",
            symbol="SBIN",
            exchange="NSE",
            segment="CASH",
            transaction_type="SELL",
            order_type="LIMIT",
            quantity=50,
            price=500.00,
            status="CANCELLED",
            account_id="MASTER001"
        )

        normalized = normalize_blaze_webhook(webhook, 3, 1)

        assert normalized.event_type == "CANCEL"
        assert normalized.status == "CANCELLED"

    def test_normalize_intraday_order(self):
        """Test normalizing intraday order"""
        webhook = BlazeOrderWebhook(
            event_type="order_placed",
            order_id="111",
            symbol="TATAMOTORS",
            exchange="NSE",
            segment="CASH",
            transaction_type="BUY",
            order_type="LIMIT",
            quantity=100,
            price=450.00,
            product="INTRADAY",
            status="PENDING",
            account_id="MASTER001"
        )

        normalized = normalize_blaze_webhook(webhook, 1, 1)

        assert normalized.is_intraday is True
        assert normalized.product == "INTRADAY"

    def test_normalize_delivery_order(self):
        """Test normalizing delivery order"""
        webhook = BlazeOrderWebhook(
            event_type="order_placed",
            order_id="222",
            symbol="ITC",
            exchange="NSE",
            segment="CASH",
            transaction_type="BUY",
            order_type="LIMIT",
            quantity=50,
            price=400.00,
            product="DELIVERY",
            status="PENDING",
            account_id="MASTER001"
        )

        normalized = normalize_blaze_webhook(webhook, 1, 1)

        assert normalized.is_intraday is False
        assert normalized.product == "DELIVERY"

    def test_normalize_bse_order(self):
        """Test normalizing BSE order"""
        webhook = BlazeOrderWebhook(
            event_type="order_placed",
            order_id="333",
            symbol="RELIANCE",
            exchange="BSE",
            segment="CASH",
            transaction_type="BUY",
            order_type="LIMIT",
            quantity=10,
            price=2500.00,
            status="PENDING",
            account_id="MASTER001"
        )

        normalized = normalize_blaze_webhook(webhook, 1, 1)

        assert normalized.exchange == "B"  # B for BSE

    def test_normalize_order_with_filled_quantity(self):
        """Test normalizing partially filled order"""
        webhook = BlazeOrderWebhook(
            event_type="order_filled",
            order_id="444",
            symbol="WIPRO",
            exchange="NSE",
            segment="CASH",
            transaction_type="BUY",
            order_type="LIMIT",
            quantity=100,
            price=400.00,
            filled_quantity=50,
            average_price=399.50,
            pending_quantity=50,
            status="PARTIALLY_FILLED",
            account_id="MASTER001"
        )

        normalized = normalize_blaze_webhook(webhook, 1, 1)

        assert normalized.filled_quantity == 50
        assert normalized.average_price == 399.50
        assert normalized.pending_quantity == 50
        assert normalized.event_type == "FILL"


class TestWebhookValidation:
    """Test webhook data validation"""

    def test_valid_webhook_creation(self):
        """Test creating valid webhook"""
        webhook = BlazeOrderWebhook(
            event_type="order_placed",
            order_id="123",
            symbol="TCS",
            exchange="NSE",
            transaction_type="BUY",
            order_type="LIMIT",
            quantity=10,
            price=3500.00,
            status="PENDING",
            account_id="MASTER001"
        )

        assert webhook.event_type == "order_placed"
        assert webhook.quantity == 10

    def test_webhook_with_optional_fields(self):
        """Test webhook with optional fields"""
        webhook = BlazeOrderWebhook(
            event_type="order_placed",
            order_id="123",
            symbol="TCS",
            exchange="NSE",
            transaction_type="BUY",
            order_type="LIMIT",
            quantity=10,
            status="PENDING",
            account_id="MASTER001",
            disclosed_quantity=5,
            trigger_price=3400.00,
            validity="GTD"
        )

        assert webhook.disclosed_quantity == 5
        assert webhook.trigger_price == 3400.00
        assert webhook.validity == "GTD"


class TestEventTypeMapping:
    """Test event type mapping"""

    def test_all_event_types(self):
        """Test all event types are properly mapped"""
        event_map = {
            "order_placed": "NEW",
            "order_modified": "MODIFY",
            "order_cancelled": "CANCEL",
            "order_filled": "FILL"
        }

        for blaze_event, expected_event in event_map.items():
            webhook = BlazeOrderWebhook(
                event_type=blaze_event,
                order_id="123",
                symbol="TEST",
                exchange="NSE",
                transaction_type="BUY",
                order_type="LIMIT",
                quantity=1,
                status="PENDING",
                account_id="MASTER001"
            )

            normalized = normalize_blaze_webhook(webhook, 1, 1)
            assert normalized.event_type == expected_event


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
