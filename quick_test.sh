#!/bin/bash

API_URL="http://localhost:8000"

echo "🚀 Quick Copy Trading Test"
echo "========================="

# 1. Register master
echo "📝 Registering master..."
MASTER_RESPONSE=$(curl -s -X POST $API_URL/api/users/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "master@demo.com",
    "username": "master_demo",
    "password": "Password123!",
    "role": "MASTER"
  }')

MASTER_ID=$(echo "$MASTER_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['id'])")
echo "✅ Master registered with ID: $MASTER_ID"

# 2. Login master
MASTER_TOKEN=$(curl -s -X POST $API_URL/api/users/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "master_demo",
    "password": "Password123!"
  }' | python3 -c "import sys, json; print(json.load(sys.stdin)['access_token'])")

echo "✅ Master logged in"

# 3. Update master profile with IIFL account
curl -s -X PUT $API_URL/api/users/me \
  -H "Authorization: Bearer $MASTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "iifl_account_id": "MASTER_DEMO_001",
    "iifl_user_id": "DEMO_MASTER"
  }' > /dev/null

echo "✅ Master profile updated with IIFL account"

# 4. Register follower
FOLLOWER_RESPONSE=$(curl -s -X POST $API_URL/api/users/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "follower@demo.com",
    "username": "follower_demo",
    "password": "Password123!",
    "role": "FOLLOWER"
  }')

FOLLOWER_TOKEN=$(curl -s -X POST $API_URL/api/users/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "follower_demo",
    "password": "Password123!"
  }' | python3 -c "import sys, json; print(json.load(sys.stdin)['access_token'])")

echo "✅ Follower registered and logged in"

# 5. Update follower profile
curl -s -X PUT $API_URL/api/users/me \
  -H "Authorization: Bearer $FOLLOWER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "iifl_account_id": "FOLLOWER_DEMO_001",
    "iifl_user_id": "DEMO_FOLLOWER"
  }' > /dev/null

echo "✅ Follower profile updated"

# 6. Follower follows master
curl -s -X POST $API_URL/api/masters/follow \
  -H "Authorization: Bearer $FOLLOWER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"master_id\": $MASTER_ID,
    \"copy_strategy\": \"FIXED_RATIO\",
    \"ratio\": 1.0
  }" > /dev/null

echo "✅ Follower is now following master"

# 7. Master places order
echo ""
echo "📊 Master placing order (should replicate to follower)..."
ORDER_RESPONSE=$(curl -s -X POST $API_URL/api/orders/place \
  -H "Authorization: Bearer $MASTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "RELIANCE",
    "side": "BUY",
    "order_type": "MARKET",
    "quantity": 100
  }')

echo "$ORDER_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(f'✅ Master order placed: {data[\"symbol\"]} {data[\"side\"]} {data[\"quantity\"]}')
    print(f'📊 Order ID: {data[\"id\"]}')
except:
    print('❌ Order placement failed')
    print(data if 'data' in locals() else 'Failed to parse response')
"

echo ""
echo "⏳ Waiting 3 seconds for replication..."
sleep 3

# 8. Check follower orders
echo ""
echo "🔍 Checking follower orders:"
curl -s -X GET $API_URL/api/orders/my-orders \
  -H "Authorization: Bearer $FOLLOWER_TOKEN" | python3 -c "
import sys, json
try:
    orders = json.load(sys.stdin)
    if orders:
        print(f'✅ Follower has {len(orders)} orders')
        for order in orders:
            print(f'   📈 {order[\"symbol\"]} {order[\"side\"]} {order[\"quantity\"]} - {order[\"status\"]}')
    else:
        print('❌ No follower orders found')
except Exception as e:
    print(f'❌ Error checking orders: {e}')
"

echo ""
echo "✅ Copy Trading Test Complete!"
