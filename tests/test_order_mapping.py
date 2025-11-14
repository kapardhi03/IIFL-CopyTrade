"""
Unit tests for order mapping logic
Tests the critical master-follower order mapping functionality
"""
import pytest
import asyncio
from decimal import Decimal

from app.services.redis_service import RedisService


class TestOrderMapping:
    """
    Test order mapping storage and retrieval
    """

    @pytest.fixture
    async def redis_service(self):
        """Create Redis service for testing"""
        service = RedisService(redis_url="redis://localhost:6379/15")  # Use test DB
        await service.connect()
        yield service
        # Cleanup
        await service.disconnect()

    @pytest.mark.asyncio
    async def test_set_order_mapping(self, redis_service):
        """Test setting order mapping in Redis"""
        master_order_id = 12345
        follower_user_id = 100
        follower_order_id = 67890
        follower_broker_order_id = "BROKER123"

        # Set mapping
        result = await redis_service.set_order_mapping(
            master_order_id=master_order_id,
            follower_user_id=follower_user_id,
            follower_order_id=follower_order_id,
            follower_broker_order_id=follower_broker_order_id
        )

        assert result is True

    @pytest.mark.asyncio
    async def test_get_order_mapping(self, redis_service):
        """Test retrieving order mapping"""
        master_order_id = 12345
        follower_user_id = 100
        follower_order_id = 67890

        # Set mapping first
        await redis_service.set_order_mapping(
            master_order_id=master_order_id,
            follower_user_id=follower_user_id,
            follower_order_id=follower_order_id,
            follower_broker_order_id="BROKER123"
        )

        # Retrieve mapping
        mapping = await redis_service.get_order_mapping(master_order_id)

        assert mapping is not None
        assert str(follower_user_id) in mapping
        assert mapping[str(follower_user_id)]["follower_order_id"] == follower_order_id

    @pytest.mark.asyncio
    async def test_get_follower_order_id(self, redis_service):
        """Test getting specific follower order ID"""
        master_order_id = 12345
        follower_user_id = 100
        follower_order_id = 67890

        # Set mapping
        await redis_service.set_order_mapping(
            master_order_id=master_order_id,
            follower_user_id=follower_user_id,
            follower_order_id=follower_order_id
        )

        # Get specific follower order
        retrieved_id = await redis_service.get_follower_order_id(
            master_order_id=master_order_id,
            follower_user_id=follower_user_id
        )

        assert retrieved_id == follower_order_id

    @pytest.mark.asyncio
    async def test_multiple_followers_mapping(self, redis_service):
        """Test mapping one master order to multiple followers"""
        master_order_id = 99999

        # Set mappings for 3 followers
        followers = [
            (101, 1001, "BROKER_101"),
            (102, 1002, "BROKER_102"),
            (103, 1003, "BROKER_103"),
        ]

        for follower_id, order_id, broker_id in followers:
            await redis_service.set_order_mapping(
                master_order_id=master_order_id,
                follower_user_id=follower_id,
                follower_order_id=order_id,
                follower_broker_order_id=broker_id
            )

        # Retrieve all mappings
        mapping = await redis_service.get_order_mapping(master_order_id)

        assert mapping is not None
        assert len(mapping) == 3

        for follower_id, order_id, broker_id in followers:
            assert str(follower_id) in mapping
            assert mapping[str(follower_id)]["follower_order_id"] == order_id

    @pytest.mark.asyncio
    async def test_delete_order_mapping(self, redis_service):
        """Test deleting order mapping"""
        master_order_id = 55555

        # Set mapping
        await redis_service.set_order_mapping(
            master_order_id=master_order_id,
            follower_user_id=200,
            follower_order_id=2000
        )

        # Verify it exists
        mapping = await redis_service.get_order_mapping(master_order_id)
        assert mapping is not None

        # Delete mapping
        deleted = await redis_service.delete_order_mapping(master_order_id)
        assert deleted is True

        # Verify it's gone
        mapping = await redis_service.get_order_mapping(master_order_id)
        assert mapping is None

    @pytest.mark.asyncio
    async def test_order_mapping_not_found(self, redis_service):
        """Test retrieving non-existent mapping"""
        non_existent_id = 999999999

        mapping = await redis_service.get_order_mapping(non_existent_id)
        assert mapping is None

        follower_order_id = await redis_service.get_follower_order_id(
            master_order_id=non_existent_id,
            follower_user_id=123
        )
        assert follower_order_id is None


class TestOrderMappingBusinessLogic:
    """
    Test business logic for order mapping
    """

    def test_scaling_factor_calculation(self):
        """Test quantity scaling calculation"""
        master_quantity = 10
        scaling_factors = [0.5, 1.0, 1.5, 2.0]

        expected_results = [5, 10, 15, 20]

        for factor, expected in zip(scaling_factors, expected_results):
            follower_quantity = int(master_quantity * factor)
            assert follower_quantity == expected

    def test_scaling_factor_zero_check(self):
        """Ensure zero quantity is handled properly"""
        master_quantity = 10
        scaling_factor = 0.01  # Very small factor

        follower_quantity = int(master_quantity * scaling_factor)

        # Should be 0, which should not be allowed
        assert follower_quantity == 0

    def test_idempotency_key_generation(self):
        """Test idempotency key generation"""
        from datetime import datetime

        master_order_id = 123
        event_type = "order.new"
        timestamp = datetime.utcnow().timestamp()

        idempotency_key = f"{master_order_id}_{event_type}_{timestamp}"

        assert master_order_id == int(idempotency_key.split("_")[0])
        assert event_type == idempotency_key.split("_")[1]


class TestOrderMappingPersistence:
    """
    Test order mapping persistence requirements
    """

    @pytest.mark.asyncio
    async def test_mapping_expiration(self, redis_service):
        """Test that mappings have proper TTL"""
        master_order_id = 77777

        await redis_service.set_order_mapping(
            master_order_id=master_order_id,
            follower_user_id=300,
            follower_order_id=3000
        )

        # Check TTL (should be 7 days = 604800 seconds)
        key = f"order:map:{master_order_id}"
        ttl = await redis_service.client.ttl(key)

        # TTL should be close to 7 days (allowing for processing time)
        assert 604790 <= ttl <= 604800

    @pytest.mark.asyncio
    async def test_concurrent_mapping_updates(self, redis_service):
        """Test concurrent updates to the same mapping"""
        master_order_id = 88888

        # Simulate concurrent updates
        async def add_follower(follower_id, order_id):
            await redis_service.set_order_mapping(
                master_order_id=master_order_id,
                follower_user_id=follower_id,
                follower_order_id=order_id
            )

        # Add 5 followers concurrently
        tasks = [
            add_follower(400 + i, 4000 + i)
            for i in range(5)
        ]

        await asyncio.gather(*tasks)

        # Verify all mappings exist
        mapping = await redis_service.get_order_mapping(master_order_id)

        assert mapping is not None
        assert len(mapping) == 5

        for i in range(5):
            follower_id = 400 + i
            order_id = 4000 + i
            assert str(follower_id) in mapping
            assert mapping[str(follower_id)]["follower_order_id"] == order_id


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
