#!/usr/bin/env python3
"""
Test Script: 10 Followers Copy Trading
Tests the platform with 1 master and 10 followers
"""
import asyncio
import aiohttp
import time
import json
from typing import List, Dict

# Configuration
BASE_URL = "http://localhost:8000"
MASTER_USERNAME = "master1"
MASTER_PASSWORD = "MasterPass123!"
FOLLOWER_COUNT = 10

class TestClient:
    def __init__(self, session: aiohttp.ClientSession):
        self.session = session
        self.base_url = BASE_URL

    async def register_user(self, username: str, password: str, role: str = "FOLLOWER") -> dict:
        """Register a new user"""
        data = {
            "email": f"{username}@test.com",
            "username": username,
            "password": password,
            "role": role
        }

        async with self.session.post(f"{self.base_url}/api/users/register", json=data) as resp:
            if resp.status == 201:
                return await resp.json()
            else:
                print(f"❌ Registration failed for {username}: {await resp.text()}")
                return None

    async def login_user(self, username: str, password: str) -> str:
        """Login user and return JWT token"""
        data = {
            "username": username,
            "password": password
        }

        async with self.session.post(f"{self.base_url}/api/users/login", json=data) as resp:
            if resp.status == 200:
                result = await resp.json()
                return result["access_token"]
            else:
                print(f"❌ Login failed for {username}: {await resp.text()}")
                return None

    async def follow_master(self, follower_token: str, master_id: int) -> bool:
        """Follower follows master"""
        headers = {"Authorization": f"Bearer {follower_token}"}
        data = {
            "master_id": master_id,
            "copy_strategy": "FIXED_RATIO",
            "ratio": 1.0,
            "max_order_value": 10000.0
        }

        async with self.session.post(f"{self.base_url}/api/masters/follow", json=data, headers=headers) as resp:
            if resp.status == 200:
                return True
            else:
                print(f"❌ Follow failed: {await resp.text()}")
                return False

    async def place_order(self, token: str, symbol: str = "RELIANCE", quantity: int = 10) -> dict:
        """Place a market order"""
        headers = {"Authorization": f"Bearer {token}"}
        data = {
            "symbol": symbol,
            "side": "BUY",
            "order_type": "MARKET",
            "quantity": quantity
        }

        async with self.session.post(f"{self.base_url}/api/orders/place", json=data, headers=headers) as resp:
            if resp.status == 200:
                return await resp.json()
            else:
                print(f"❌ Order placement failed: {await resp.text()}")
                return None

    async def get_my_orders(self, token: str) -> List[dict]:
        """Get user's orders"""
        headers = {"Authorization": f"Bearer {token}"}

        async with self.session.get(f"{self.base_url}/api/orders/my-orders", headers=headers) as resp:
            if resp.status == 200:
                return await resp.json()
            else:
                print(f"❌ Failed to get orders: {await resp.text()}")
                return []

    async def get_user_profile(self, token: str) -> dict:
        """Get user profile"""
        headers = {"Authorization": f"Bearer {token}"}

        async with self.session.get(f"{self.base_url}/api/users/me", headers=headers) as resp:
            if resp.status == 200:
                return await resp.json()
            else:
                print(f"❌ Failed to get profile: {await resp.text()}")
                return None

async def test_10_followers():
    """Main test function"""
    print("🚀 Starting 10 Followers Copy Trading Test")
    print("=" * 50)

    async with aiohttp.ClientSession() as session:
        client = TestClient(session)

        # Step 1: Register Master
        print("\n📋 Step 1: Registering Master Trader")
        master_user = await client.register_user(MASTER_USERNAME, MASTER_PASSWORD, "MASTER")

        if not master_user:
            print("❌ Failed to register master. Exiting.")
            return

        print(f"✅ Master registered: {master_user['username']} (ID: {master_user['id']})")

        # Step 2: Login Master
        print("\n🔐 Step 2: Master Login")
        master_token = await client.login_user(MASTER_USERNAME, MASTER_PASSWORD)

        if not master_token:
            print("❌ Failed to login master. Exiting.")
            return

        print("✅ Master logged in successfully")

        # Step 3: Register and Login Followers
        print(f"\n👥 Step 3: Registering {FOLLOWER_COUNT} Followers")
        followers = []

        for i in range(1, FOLLOWER_COUNT + 1):
            username = f"follower{i}"
            password = f"Follower{i}Pass123!"

            # Register follower
            follower_user = await client.register_user(username, password, "FOLLOWER")
            if not follower_user:
                continue

            # Login follower
            follower_token = await client.login_user(username, password)
            if not follower_token:
                continue

            followers.append({
                "id": follower_user["id"],
                "username": username,
                "token": follower_token
            })

            print(f"✅ Follower {i} registered and logged in: {username}")

        print(f"✅ Successfully registered {len(followers)} followers")

        # Step 4: Followers Follow Master
        print(f"\n🔗 Step 4: Followers Following Master")
        successful_follows = 0

        for follower in followers:
            success = await client.follow_master(follower["token"], master_user["id"])
            if success:
                successful_follows += 1
                print(f"✅ {follower['username']} is now following master")
            else:
                print(f"❌ {follower['username']} failed to follow master")

        print(f"✅ {successful_follows}/{len(followers)} followers successfully following master")

        # Step 5: Master Places Order (This triggers replication)
        print(f"\n📈 Step 5: Master Places Order (Triggers Replication)")

        start_time = time.time()
        order = await client.place_order(master_token, "RELIANCE", 100)

        if not order:
            print("❌ Failed to place master order. Exiting.")
            return

        print(f"✅ Master order placed: {order['symbol']} {order['side']} {order['quantity']}")
        print(f"📊 Order ID: {order['id']}")

        # Step 6: Wait for Replication and Check Results
        print(f"\n⏳ Step 6: Waiting for Replication to Complete...")
        await asyncio.sleep(5)  # Wait 5 seconds for replication

        total_time = time.time() - start_time

        # Check follower orders
        print(f"\n🔍 Step 7: Checking Follower Orders")
        replicated_orders = 0

        for follower in followers:
            orders = await client.get_my_orders(follower["token"])
            follower_order_count = len(orders)

            if follower_order_count > 0:
                replicated_orders += 1
                latest_order = orders[0]  # Most recent order
                print(f"✅ {follower['username']}: {follower_order_count} orders, latest: {latest_order['symbol']} {latest_order['quantity']}")
            else:
                print(f"❌ {follower['username']}: No orders found")

        # Step 8: Results Summary
        print(f"\n📊 Test Results Summary")
        print("=" * 50)
        print(f"👑 Master: {MASTER_USERNAME}")
        print(f"👥 Total Followers: {len(followers)}")
        print(f"🔗 Successful Follows: {successful_follows}")
        print(f"📈 Orders Replicated: {replicated_orders}/{len(followers)}")
        print(f"⏱️  Total Time: {total_time:.2f} seconds")
        print(f"🎯 Success Rate: {(replicated_orders/len(followers)*100):.1f}%")

        # Performance Metrics
        if replicated_orders > 0:
            avg_latency = (total_time / replicated_orders) * 1000  # ms per order
            print(f"⚡ Average Latency: {avg_latency:.2f}ms per follower")

        # Step 9: Cleanup Test (Optional)
        print(f"\n🧹 Test Complete!")

        if replicated_orders == len(followers):
            print("🎉 ALL FOLLOWERS RECEIVED ORDERS! Test PASSED! ✅")
        else:
            print(f"⚠️  Only {replicated_orders}/{len(followers)} followers received orders. Check logs.")

async def health_check():
    """Check if the platform is running"""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{BASE_URL}/health") as resp:
                if resp.status == 200:
                    data = await resp.json()
                    print(f"✅ Platform is healthy: {data}")
                    return True
                else:
                    print(f"❌ Health check failed: {resp.status}")
                    return False
    except Exception as e:
        print(f"❌ Cannot connect to platform: {e}")
        print(f"💡 Make sure to run: docker-compose up -d")
        return False

if __name__ == "__main__":
    print("🔍 Checking platform health...")

    async def main():
        if await health_check():
            await test_10_followers()
        else:
            print("\n❌ Platform is not running. Please start it first:")
            print("   docker-compose up -d")
            print("   Then run this test again.")

    asyncio.run(main())