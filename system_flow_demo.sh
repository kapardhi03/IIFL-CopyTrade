#!/bin/bash

echo "🎯 COPY TRADING SYSTEM FLOW DEMONSTRATION"
echo "========================================"

echo ""
echo "Let me show you exactly what happens when a master trades..."

# Show the current state
echo "📊 CURRENT STATE:"
echo "================"

docker-compose exec db psql -U trading_user -d copy_trading -c "
SELECT 
    'MASTERS' as type,
    u.username,
    u.role,
    COUNT(o.id) as orders_placed
FROM users u
LEFT JOIN orders o ON u.id = o.user_id AND o.is_master_order = true
WHERE u.role = 'MASTER'
GROUP BY u.username, u.role
UNION ALL
SELECT 
    'FOLLOWERS' as type,
    u.username,
    u.role,
    COUNT(o.id) as orders_received
FROM users u
LEFT JOIN orders o ON u.id = o.user_id AND o.is_master_order = false
WHERE u.role = 'FOLLOWER'
GROUP BY u.username, u.role
ORDER BY type, username;
"

echo ""
echo "🔗 FOLLOW RELATIONSHIPS:"
echo "========================"

docker-compose exec db psql -U trading_user -d copy_trading -c "
SELECT 
    master.username as master,
    follower.username as follower,
    fr.copy_strategy,
    CASE 
        WHEN fr.is_active THEN '✅ ACTIVE'
        ELSE '❌ INACTIVE'
    END as status
FROM follower_relationships fr
JOIN users master ON fr.master_id = master.id
JOIN users follower ON fr.follower_id = follower.id
ORDER BY master.username, follower.username;
"

echo ""
echo "📈 ORDER REPLICATION HISTORY:"
echo "============================"

docker-compose exec db psql -U trading_user -d copy_trading -c "
SELECT 
    CASE 
        WHEN o.is_master_order THEN '👑 MASTER'
        ELSE '👥 FOLLOWER'
    END as order_type,
    u.username,
    o.symbol || ' ' || o.side || ' ' || o.quantity as trade,
    o.status,
    CASE 
        WHEN o.is_master_order THEN 'Original Order'
        ELSE 'Replicated from Order #' || o.master_order_id
    END as source,
    o.created_at::timestamp(0)
FROM orders o
JOIN users u ON o.user_id = u.id
ORDER BY o.created_at;
"

echo ""
echo "⚡ REPLICATION METRICS:"
echo "====================="

docker-compose exec db psql -U trading_user -d copy_trading -c "
SELECT 
    'Order #' || rm.master_order_id as master_order,
    rm.total_followers || ' followers' as followers,
    rm.successful_replications || '/' || rm.total_followers || ' successful' as success_rate,
    rm.average_latency_ms || 'ms avg latency' as performance
FROM replication_metrics rm
ORDER BY rm.created_at DESC;
"

