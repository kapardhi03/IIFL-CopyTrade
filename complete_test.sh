#!/bin/bash

API_URL="http://localhost:8000"

echo "🚀 COMPLETE COPY TRADING TEST"
echo "============================="

# 1. Register Master
echo "📝 1. Registering Master..."
MASTER_RESPONSE=$(curl -s -X POST $API_URL/api/users/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "master@final.com",
    "username": "master_final",
    "password": "Password123!",
    "role": "MASTER"
  }')

MASTER_ID=$(echo "$MASTER_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['id'])")
echo "✅ Master registered: ID $MASTER_ID"

# 2. Register Follower
echo "📝 2. Registering Follower..."
FOLLOWER_RESPONSE=$(curl -s -X POST $API_URL/api/users/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "follower@final.com",
    "username": "follower_final",
    "password": "Password123!",
    "role": "FOLLOWER"
  }')

FOLLOWER_ID=$(echo "$FOLLOWER_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['id'])")
echo "✅ Follower registered: ID $FOLLOWER_ID"

# 3. Login both users
echo "🔐 3. Logging in users..."
MASTER_TOKEN=$(curl -s -X POST $API_URL/api/users/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "master_final",
    "password": "Password123!"
  }' | python3 -c "import sys, json; print(json.load(sys.stdin)['access_token'])")

FOLLOWER_TOKEN=$(curl -s -X POST $API_URL/api/users/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "follower_final",
    "password": "Password123!"
  }' | python3 -c "import sys, json; print(json.load(sys.stdin)['access_token'])")

echo "✅ Both users logged in"

# 4. Update profiles with IIFL accounts
echo "⚙️ 4. Updating profiles..."
curl -s -X PUT $API_URL/api/users/me \
  -H "Authorization: Bearer $MASTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "iifl_account_id": "MASTER_FINAL_001",
    "iifl_user_id": "FINAL_MASTER"
  }' > /dev/null

curl -s -X PUT $API_URL/api/users/me \
  -H "Authorization: Bearer $FOLLOWER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "iifl_account_id": "FOLLOWER_FINAL_001",
    "iifl_user_id": "FINAL_FOLLOWER"
  }' > /dev/null

echo "✅ Profiles updated with IIFL accounts"

# 5. Follower follows master
echo "🔗 5. Creating follow relationship..."
curl -s -X POST $API_URL/api/masters/follow \
  -H "Authorization: Bearer $FOLLOWER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"master_id\": $MASTER_ID,
    \"copy_strategy\": \"FIXED_RATIO\",
    \"ratio\": 1.0,
    \"max_order_value\": 50000.0
  }" > /dev/null

echo "✅ Follower is now following master"

# 6. Master places order (triggers replication)
echo ""
echo "🔥 6. MASTER PLACES ORDER (REPLICATION TRIGGERS)"
echo "================================================="
ORDER_RESPONSE=$(curl -s -X POST $API_URL/api/orders/place \
  -H "Authorization: Bearer $MASTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "RELIANCE",
    "side": "BUY",
    "order_type": "MARKET",
    "quantity": 100
  }')

ORDER_ID=$(echo "$ORDER_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(f'✅ Master order placed successfully!')
    print(f'   📊 Order ID: {data[\"id\"]}')
    print(f'   📈 Symbol: {data[\"symbol\"]} {data[\"side\"]} {data[\"quantity\"]}')
    print(f'   🔢 Broker ID: {data[\"broker_order_id\"]}')
    print(f'   ✅ Status: {data[\"status\"]}')
    print(data['id'])
except Exception as e:
    print(f'❌ Order placement failed: {e}')
    print('Raw response:', sys.stdin.read())
")

echo ""
echo "⏳ 7. Waiting 3 seconds for replication..."
sleep 3

# 8. Check replication results
echo ""
echo "🔍 8. CHECKING REPLICATION RESULTS"
echo "=================================="

echo "📊 Master orders:"
curl -s -X GET $API_URL/api/orders/my-orders \
  -H "Authorization: Bearer $MASTER_TOKEN" | python3 -c "
import sys, json
try:
    orders = json.load(sys.stdin)
    for order in orders:
        print(f'   🏛️ {order[\"symbol\"]} {order[\"side\"]} {order[\"quantity\"]} - {order[\"status\"]} (Master: {order[\"is_master_order\"]})')
except:
    print('   ❌ Failed to parse master orders')
"

echo ""
echo "📊 Follower orders:"
curl -s -X GET $API_URL/api/orders/my-orders \
  -H "Authorization: Bearer $FOLLOWER_TOKEN" | python3 -c "
import sys, json
try:
    orders = json.load(sys.stdin)
    if orders:
        print(f'   🎉 SUCCESS! Follower has {len(orders)} replicated orders:')
        for order in orders:
            print(f'   👥 {order[\"symbol\"]} {order[\"side\"]} {order[\"quantity\"]} - {order[\"status\"]} (Master: {order[\"is_master_order\"]})')
            if order['master_order_id']:
                print(f'       🔗 Replicated from Master Order ID: {order[\"master_order_id\"]}')
    else:
        print('   ❌ No replicated orders found')
except Exception as e:
    print(f'   ❌ Error checking follower orders: {e}')
"

echo ""
echo "🎉 COPY TRADING TEST COMPLETE!"
echo "=============================="
