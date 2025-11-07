import React, { useEffect, useState } from 'react'
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Badge,
  Divider,
  Alert,
  LinearProgress,
} from '@mui/material'
import {
  Speed as SpeedIcon,
  TrendingUp as TrendingUpIcon,
  Error as ErrorIcon,
  CheckCircle as CheckCircleIcon,
  AccessTime as AccessTimeIcon,
} from '@mui/icons-material'
import { useWebSocket } from '../hooks/useWebSocket'
import { useAuth } from '../hooks/useAuth'

function RealTimeMonitor() {
  const { user } = useAuth()
  const { connected, orders, metrics, subscribeToUserUpdates } = useWebSocket()
  const [recentOrders, setRecentOrders] = useState([])
  const [systemStatus, setSystemStatus] = useState({
    avgLatency: 0,
    successRate: 100,
    activeConnections: 0,
    ordersPerSecond: 0,
  })

  useEffect(() => {
    if (user && connected) {
      subscribeToUserUpdates(user.id)
    }
  }, [user, connected, subscribeToUserUpdates])

  useEffect(() => {
    // Update recent orders (keep only last 10)
    if (orders.length > 0) {
      setRecentOrders(orders.slice(0, 10))
    }
  }, [orders])

  useEffect(() => {
    // Update system status from metrics
    if (metrics) {
      setSystemStatus({
        avgLatency: metrics.average_latency_ms || 0,
        successRate: metrics.success_rate || 100,
        activeConnections: metrics.active_connections || 0,
        ordersPerSecond: metrics.orders_per_second || 0,
      })
    }
  }, [metrics])

  const formatLatency = (latency) => {
    if (latency < 100) return { color: 'success', text: `${latency}ms - Excellent` }
    if (latency < 250) return { color: 'warning', text: `${latency}ms - Good` }
    return { color: 'error', text: `${latency}ms - Slow` }
  }

  const getOrderStatusColor = (status) => {
    switch (status) {
      case 'FILLED': return 'success'
      case 'SUBMITTED': return 'info'
      case 'PENDING': return 'warning'
      case 'FAILED': return 'error'
      case 'CANCELLED': return 'default'
      default: return 'default'
    }
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
    }).format(amount)
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Connection Status */}
      <Alert
        severity={connected ? 'success' : 'error'}
        sx={{ mb: 3 }}
        icon={connected ? <CheckCircleIcon /> : <ErrorIcon />}
      >
        {connected ? 'Real-time monitoring active' : 'Connection lost - attempting to reconnect...'}
      </Alert>

      {/* System Metrics */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            System Performance
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            <Box sx={{ minWidth: 200 }}>
              <Typography variant="body2" color="text.secondary">
                Average Latency
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <SpeedIcon color={formatLatency(systemStatus.avgLatency).color} />
                <Typography variant="h6" color={`${formatLatency(systemStatus.avgLatency).color}.main`}>
                  {formatLatency(systemStatus.avgLatency).text}
                </Typography>
              </Box>
            </Box>

            <Box sx={{ minWidth: 150 }}>
              <Typography variant="body2" color="text.secondary">
                Success Rate
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <TrendingUpIcon color="success" />
                <Typography variant="h6" color="success.main">
                  {systemStatus.successRate.toFixed(1)}%
                </Typography>
              </Box>
            </Box>

            <Box sx={{ minWidth: 150 }}>
              <Typography variant="body2" color="text.secondary">
                Active Users
              </Typography>
              <Badge badgeContent={systemStatus.activeConnections} color="primary">
                <Avatar sx={{ bgcolor: 'primary.main' }}>
                  <Typography variant="body2">{systemStatus.activeConnections}</Typography>
                </Avatar>
              </Badge>
            </Box>

            <Box sx={{ minWidth: 150 }}>
              <Typography variant="body2" color="text.secondary">
                Orders/Second
              </Typography>
              <Typography variant="h6" color="info.main">
                {systemStatus.ordersPerSecond.toFixed(1)}
              </Typography>
            </Box>
          </Box>

          {/* Latency Progress Bar */}
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Target Latency: &lt; 250ms
            </Typography>
            <LinearProgress
              variant="determinate"
              value={Math.min((250 - systemStatus.avgLatency) / 250 * 100, 100)}
              color={systemStatus.avgLatency < 250 ? 'success' : 'error'}
              sx={{ height: 8, borderRadius: 4 }}
            />
          </Box>
        </CardContent>
      </Card>

      {/* Recent Orders */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Real-Time Order Feed
          </Typography>

          {recentOrders.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <AccessTimeIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
              <Typography color="text.secondary">
                Waiting for order updates...
              </Typography>
            </Box>
          ) : (
            <List>
              {recentOrders.map((order, index) => (
                <React.Fragment key={order.id || index}>
                  <ListItem>
                    <ListItemAvatar>
                      <Avatar sx={{
                        bgcolor: order.side === 'BUY' ? 'success.main' : 'error.main',
                        fontSize: '0.75rem'
                      }}>
                        {order.side === 'BUY' ? 'B' : 'S'}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="body1">
                            {order.symbol} - {order.quantity} shares
                          </Typography>
                          <Chip
                            label={order.status}
                            size="small"
                            color={getOrderStatusColor(order.status)}
                          />
                          {order.is_master_order && (
                            <Chip label="Master" size="small" color="secondary" />
                          )}
                        </Box>
                      }
                      secondary={
                        <Box>
                          <Typography variant="body2" color="text.secondary">
                            {order.price ? formatCurrency(order.price) : 'Market Price'} •
                            User: {order.user?.username || 'Unknown'}
                            {order.replication_latency_ms && (
                              <> • Latency: {order.replication_latency_ms}ms</>
                            )}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {new Date(order.created_at || Date.now()).toLocaleTimeString()}
                          </Typography>
                        </Box>
                      }
                    />
                  </ListItem>
                  {index < recentOrders.length - 1 && <Divider variant="inset" component="li" />}
                </React.Fragment>
              ))}
            </List>
          )}
        </CardContent>
      </Card>
    </Box>
  )
}

export default RealTimeMonitor