import React, { useState, useEffect } from 'react'
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  Button,
  Grid,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Tab,
  Tabs,
  Avatar,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Divider,
} from '@mui/material'
import {
  TrendingUp as TrendingUpIcon,
  People as PeopleIcon,
  Assessment as AssessmentIcon,
  AccountBalance as MoneyIcon,
  Add as AddIcon,
  Person as PersonIcon,
} from '@mui/icons-material'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useAuth } from '../hooks/useAuth'
import { ordersAPI, relationshipsAPI, usersAPI } from '../services/api'

function TabPanel({ children, value, index }) {
  return (
    <div hidden={value !== index}>
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  )
}

function MasterDashboard() {
  const { user, logout } = useAuth()
  const [tab, setTab] = useState(0)
  const [orders, setOrders] = useState([])
  const [followers, setFollowers] = useState([])
  const [stats, setStats] = useState({})
  const [performance, setPerformance] = useState([])
  const [openOrderDialog, setOpenOrderDialog] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const [orderForm, setOrderForm] = useState({
    symbol: '',
    side: 'BUY',
    order_type: 'LIMIT',
    quantity: '',
    price: '',
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [ordersRes, followersRes] = await Promise.all([
        ordersAPI.getOrders({ user_id: user.id, is_master: true }),
        relationshipsAPI.getFollowerRelationships(user.id),
      ])

      setOrders(ordersRes.data || [])
      setFollowers(followersRes.data || [])

      // Calculate stats
      const totalOrders = ordersRes.data?.length || 0
      const totalVolume = (ordersRes.data || []).reduce((sum, order) =>
        sum + (order.quantity * (order.price || 0)), 0
      )
      const activeFollowers = (followersRes.data || []).filter(f => f.is_active).length

      setStats({
        totalOrders,
        totalVolume,
        activeFollowers,
        successRate: totalOrders > 0 ?
          ((ordersRes.data || []).filter(o => o.status === 'FILLED').length / totalOrders * 100).toFixed(1) : 0
      })

      // Generate mock performance data
      setPerformance([
        { date: '2024-01', pnl: 15000, trades: 12 },
        { date: '2024-02', pnl: 22000, trades: 18 },
        { date: '2024-03', pnl: 18000, trades: 15 },
        { date: '2024-04', pnl: 35000, trades: 25 },
        { date: '2024-05', pnl: 28000, trades: 20 },
        { date: '2024-06', pnl: 42000, trades: 30 },
      ])

    } catch (error) {
      setError('Failed to load data')
    }
    setLoading(false)
  }

  const handlePlaceOrder = async () => {
    try {
      await ordersAPI.placeOrder({
        ...orderForm,
        quantity: parseInt(orderForm.quantity),
        price: orderForm.price ? parseFloat(orderForm.price) : null,
        is_master_order: true,
      })
      setOpenOrderDialog(false)
      setOrderForm({
        symbol: '',
        side: 'BUY',
        order_type: 'LIMIT',
        quantity: '',
        price: '',
      })
      loadData()
    } catch (error) {
      setError('Failed to place order')
    }
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
    }).format(amount)
  }

  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Master Trader Dashboard - {user?.username}
          </Typography>
          <Button color="inherit" onClick={logout}>
            Logout
          </Button>
        </Toolbar>
      </AppBar>

      <Box sx={{ p: 3 }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {/* Stats Cards */}
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent sx={{ display: 'flex', alignItems: 'center' }}>
                <Avatar sx={{ bgcolor: 'primary.main', mr: 2 }}>
                  <PeopleIcon />
                </Avatar>
                <Box>
                  <Typography variant="h4">{stats.activeFollowers}</Typography>
                  <Typography color="text.secondary">Active Followers</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent sx={{ display: 'flex', alignItems: 'center' }}>
                <Avatar sx={{ bgcolor: 'secondary.main', mr: 2 }}>
                  <TrendingUpIcon />
                </Avatar>
                <Box>
                  <Typography variant="h4">{stats.totalOrders}</Typography>
                  <Typography color="text.secondary">Total Orders</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent sx={{ display: 'flex', alignItems: 'center' }}>
                <Avatar sx={{ bgcolor: 'success.main', mr: 2 }}>
                  <MoneyIcon />
                </Avatar>
                <Box>
                  <Typography variant="h4">{formatCurrency(stats.totalVolume)}</Typography>
                  <Typography color="text.secondary">Total Volume</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent sx={{ display: 'flex', alignItems: 'center' }}>
                <Avatar sx={{ bgcolor: 'warning.main', mr: 2 }}>
                  <AssessmentIcon />
                </Avatar>
                <Box>
                  <Typography variant="h4">{stats.successRate}%</Typography>
                  <Typography color="text.secondary">Success Rate</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Tabs */}
        <Paper sx={{ width: '100%' }}>
          <Tabs value={tab} onChange={(e, newValue) => setTab(newValue)}>
            <Tab label="Trading" />
            <Tab label="My Followers" />
            <Tab label="Performance" />
            <Tab label="Order History" />
          </Tabs>

          <TabPanel value={tab} index={0}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
              <Typography variant="h6">Place New Order</Typography>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setOpenOrderDialog(true)}
              >
                Place Order
              </Button>
            </Box>

            <Grid container spacing={3}>
              <Grid item xs={12} md={8}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>Quick Order Entry</Typography>
                    <Grid container spacing={2}>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          fullWidth
                          label="Symbol"
                          value={orderForm.symbol}
                          onChange={(e) => setOrderForm({...orderForm, symbol: e.target.value.toUpperCase()})}
                          placeholder="e.g., RELIANCE, TCS"
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <FormControl fullWidth>
                          <InputLabel>Side</InputLabel>
                          <Select
                            value={orderForm.side}
                            label="Side"
                            onChange={(e) => setOrderForm({...orderForm, side: e.target.value})}
                          >
                            <MenuItem value="BUY">BUY</MenuItem>
                            <MenuItem value="SELL">SELL</MenuItem>
                          </Select>
                        </FormControl>
                      </Grid>
                      <Grid item xs={12} sm={4}>
                        <FormControl fullWidth>
                          <InputLabel>Order Type</InputLabel>
                          <Select
                            value={orderForm.order_type}
                            label="Order Type"
                            onChange={(e) => setOrderForm({...orderForm, order_type: e.target.value})}
                          >
                            <MenuItem value="MARKET">Market</MenuItem>
                            <MenuItem value="LIMIT">Limit</MenuItem>
                          </Select>
                        </FormControl>
                      </Grid>
                      <Grid item xs={12} sm={4}>
                        <TextField
                          fullWidth
                          label="Quantity"
                          type="number"
                          value={orderForm.quantity}
                          onChange={(e) => setOrderForm({...orderForm, quantity: e.target.value})}
                        />
                      </Grid>
                      <Grid item xs={12} sm={4}>
                        <TextField
                          fullWidth
                          label="Price (₹)"
                          type="number"
                          value={orderForm.price}
                          onChange={(e) => setOrderForm({...orderForm, price: e.target.value})}
                          disabled={orderForm.order_type === 'MARKET'}
                          helperText={orderForm.order_type === 'MARKET' ? 'Market orders execute at best price' : ''}
                        />
                      </Grid>
                      <Grid item xs={12}>
                        <Button
                          variant="contained"
                          fullWidth
                          onClick={handlePlaceOrder}
                          size="large"
                          color={orderForm.side === 'BUY' ? 'success' : 'error'}
                        >
                          Place {orderForm.side} Order
                        </Button>
                      </Grid>
                    </Grid>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} md={4}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>Order Impact</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      This order will be automatically replicated to your {stats.activeFollowers} active followers.
                    </Typography>
                    <Box sx={{ p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
                      <Typography variant="body2">
                        <strong>Estimated copies:</strong> {stats.activeFollowers}
                      </Typography>
                      <Typography variant="body2">
                        <strong>Expected latency:</strong> ~200ms
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </TabPanel>

          <TabPanel value={tab} index={1}>
            <Typography variant="h6" sx={{ mb: 2 }}>My Followers ({followers.length})</Typography>
            <Grid container spacing={3}>
              {followers.map((relationship) => (
                <Grid item xs={12} sm={6} md={4} key={relationship.id}>
                  <Card>
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                        <Avatar sx={{ mr: 2 }}>
                          <PersonIcon />
                        </Avatar>
                        <Box>
                          <Typography variant="h6">{relationship.follower?.username}</Typography>
                          <Typography variant="body2" color="text.secondary">
                            {relationship.follower?.email}
                          </Typography>
                        </Box>
                      </Box>
                      <Box sx={{ mb: 2 }}>
                        <Typography variant="body2">
                          <strong>Strategy:</strong> {relationship.copy_strategy}
                        </Typography>
                        {relationship.copy_strategy === 'FIXED_RATIO' && (
                          <Typography variant="body2">
                            <strong>Ratio:</strong> {relationship.ratio}x
                          </Typography>
                        )}
                        {relationship.copy_strategy === 'PERCENTAGE' && (
                          <Typography variant="body2">
                            <strong>Percentage:</strong> {relationship.percentage}%
                          </Typography>
                        )}
                        <Typography variant="body2">
                          <strong>Max Order:</strong> {formatCurrency(relationship.max_order_value)}
                        </Typography>
                      </Box>
                      <Chip
                        label={relationship.is_active ? 'Active' : 'Inactive'}
                        color={relationship.is_active ? 'success' : 'error'}
                        size="small"
                      />
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </TabPanel>

          <TabPanel value={tab} index={2}>
            <Typography variant="h6" sx={{ mb: 2 }}>Performance Analytics</Typography>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>Monthly P&L</Typography>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={performance}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip formatter={(value) => formatCurrency(value)} />
                        <Line type="monotone" dataKey="pnl" stroke="#8884d8" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </TabPanel>

          <TabPanel value={tab} index={3}>
            <Typography variant="h6" sx={{ mb: 2 }}>Order History</Typography>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Order ID</TableCell>
                    <TableCell>Symbol</TableCell>
                    <TableCell>Side</TableCell>
                    <TableCell>Quantity</TableCell>
                    <TableCell>Price</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Replicated</TableCell>
                    <TableCell>Created</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>#{order.id}</TableCell>
                      <TableCell>{order.symbol}</TableCell>
                      <TableCell>
                        <Chip
                          label={order.side}
                          color={order.side === 'BUY' ? 'success' : 'error'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>{order.quantity}</TableCell>
                      <TableCell>{order.price ? formatCurrency(order.price) : 'Market'}</TableCell>
                      <TableCell>
                        <Chip label={order.status} size="small" />
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={`${order.follower_orders?.length || 0} copies`}
                          color="primary"
                          size="small"
                        />
                      </TableCell>
                      <TableCell>{new Date(order.created_at).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </TabPanel>
        </Paper>
      </Box>

      {/* Order Dialog */}
      <Dialog open={openOrderDialog} onClose={() => setOpenOrderDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Place New Order</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            This order will be automatically replicated to all your active followers.
          </Alert>
          <TextField
            fullWidth
            label="Symbol"
            value={orderForm.symbol}
            onChange={(e) => setOrderForm({...orderForm, symbol: e.target.value.toUpperCase()})}
            margin="normal"
            placeholder="e.g., RELIANCE, TCS, INFY"
          />
          <FormControl fullWidth margin="normal">
            <InputLabel>Side</InputLabel>
            <Select
              value={orderForm.side}
              label="Side"
              onChange={(e) => setOrderForm({...orderForm, side: e.target.value})}
            >
              <MenuItem value="BUY">BUY</MenuItem>
              <MenuItem value="SELL">SELL</MenuItem>
            </Select>
          </FormControl>
          <FormControl fullWidth margin="normal">
            <InputLabel>Order Type</InputLabel>
            <Select
              value={orderForm.order_type}
              label="Order Type"
              onChange={(e) => setOrderForm({...orderForm, order_type: e.target.value})}
            >
              <MenuItem value="MARKET">Market Order</MenuItem>
              <MenuItem value="LIMIT">Limit Order</MenuItem>
            </Select>
          </FormControl>
          <TextField
            fullWidth
            label="Quantity"
            type="number"
            value={orderForm.quantity}
            onChange={(e) => setOrderForm({...orderForm, quantity: e.target.value})}
            margin="normal"
          />
          {orderForm.order_type === 'LIMIT' && (
            <TextField
              fullWidth
              label="Price (₹)"
              type="number"
              value={orderForm.price}
              onChange={(e) => setOrderForm({...orderForm, price: e.target.value})}
              margin="normal"
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenOrderDialog(false)}>Cancel</Button>
          <Button
            onClick={handlePlaceOrder}
            variant="contained"
            color={orderForm.side === 'BUY' ? 'success' : 'error'}
          >
            Place {orderForm.side} Order
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default MasterDashboard