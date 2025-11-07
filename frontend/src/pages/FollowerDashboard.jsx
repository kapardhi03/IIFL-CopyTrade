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
  Switch,
  FormControlLabel,
  IconButton,
} from '@mui/material'
import {
  TrendingUp as TrendingUpIcon,
  People as PeopleIcon,
  Assessment as AssessmentIcon,
  AccountBalance as MoneyIcon,
  Add as AddIcon,
  Person as PersonIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Star as StarIcon,
} from '@mui/icons-material'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { useAuth } from '../hooks/useAuth'
import { ordersAPI, relationshipsAPI, usersAPI } from '../services/api'

function TabPanel({ children, value, index }) {
  return (
    <div hidden={value !== index}>
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  )
}

function FollowerDashboard() {
  const { user, logout } = useAuth()
  const [tab, setTab] = useState(0)
  const [orders, setOrders] = useState([])
  const [masters, setMasters] = useState([])
  const [availableMasters, setAvailableMasters] = useState([])
  const [stats, setStats] = useState({})
  const [portfolio, setPortfolio] = useState([])
  const [openFollowDialog, setOpenFollowDialog] = useState(false)
  const [openEditDialog, setOpenEditDialog] = useState(false)
  const [selectedMaster, setSelectedMaster] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const [followForm, setFollowForm] = useState({
    master_id: '',
    copy_strategy: 'FIXED_RATIO',
    ratio: '1.00',
    percentage: '10.00',
    fixed_quantity: 1,
    max_order_value: '1000000',
    max_daily_loss: '500000',
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [ordersRes, mastersRes, availableMastersRes] = await Promise.all([
        ordersAPI.getOrders({ user_id: user.id, is_master: false }),
        relationshipsAPI.getMasterRelationships(user.id),
        usersAPI.getUsers('MASTER'),
      ])

      setOrders(ordersRes.data || [])
      setMasters(mastersRes.data || [])
      setAvailableMasters(availableMastersRes.data || [])

      // Calculate stats
      const totalOrders = ordersRes.data?.length || 0
      const totalPnL = (ordersRes.data || []).reduce((sum, order) => {
        if (order.status === 'FILLED') {
          const pnl = (order.average_price - order.price) * order.quantity * (order.side === 'BUY' ? 1 : -1)
          return sum + (pnl || 0)
        }
        return sum
      }, 0)

      setStats({
        totalOrders,
        followingMasters: (mastersRes.data || []).filter(m => m.is_active).length,
        totalPnL,
        winRate: totalOrders > 0 ?
          ((ordersRes.data || []).filter(o => o.status === 'FILLED').length / totalOrders * 100).toFixed(1) : 0
      })

      // Mock portfolio data
      setPortfolio([
        { name: 'RELIANCE', value: 35, pnl: 12500 },
        { name: 'TCS', value: 25, pnl: 8200 },
        { name: 'INFY', value: 20, pnl: -3200 },
        { name: 'HDFC', value: 15, pnl: 5600 },
        { name: 'Others', value: 5, pnl: 1200 },
      ])

    } catch (error) {
      setError('Failed to load data')
    }
    setLoading(false)
  }

  const handleFollowMaster = async () => {
    try {
      await relationshipsAPI.createRelationship({
        ...followForm,
        follower_id: user.id,
        ratio: parseFloat(followForm.ratio),
        percentage: parseFloat(followForm.percentage),
        fixed_quantity: parseInt(followForm.fixed_quantity),
        max_order_value: parseFloat(followForm.max_order_value),
        max_daily_loss: parseFloat(followForm.max_daily_loss),
      })
      setOpenFollowDialog(false)
      setFollowForm({
        master_id: '',
        copy_strategy: 'FIXED_RATIO',
        ratio: '1.00',
        percentage: '10.00',
        fixed_quantity: 1,
        max_order_value: '1000000',
        max_daily_loss: '500000',
      })
      loadData()
    } catch (error) {
      setError('Failed to follow master')
    }
  }

  const handleEditRelationship = (relationship) => {
    setSelectedMaster(relationship)
    setFollowForm({
      master_id: relationship.master_id,
      copy_strategy: relationship.copy_strategy,
      ratio: relationship.ratio?.toString() || '1.00',
      percentage: relationship.percentage?.toString() || '10.00',
      fixed_quantity: relationship.fixed_quantity || 1,
      max_order_value: relationship.max_order_value?.toString() || '1000000',
      max_daily_loss: relationship.max_daily_loss?.toString() || '500000',
    })
    setOpenEditDialog(true)
  }

  const handleUpdateRelationship = async () => {
    try {
      await relationshipsAPI.updateRelationship(selectedMaster.id, {
        copy_strategy: followForm.copy_strategy,
        ratio: parseFloat(followForm.ratio),
        percentage: parseFloat(followForm.percentage),
        fixed_quantity: parseInt(followForm.fixed_quantity),
        max_order_value: parseFloat(followForm.max_order_value),
        max_daily_loss: parseFloat(followForm.max_daily_loss),
      })
      setOpenEditDialog(false)
      setSelectedMaster(null)
      loadData()
    } catch (error) {
      setError('Failed to update relationship')
    }
  }

  const handleUnfollowMaster = async (relationshipId) => {
    if (window.confirm('Are you sure you want to unfollow this master?')) {
      try {
        await relationshipsAPI.deleteRelationship(relationshipId)
        loadData()
      } catch (error) {
        setError('Failed to unfollow master')
      }
    }
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
    }).format(amount)
  }

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8']

  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Follower Dashboard - {user?.username}
          </Typography>
          <Typography variant="body2" sx={{ mr: 2 }}>
            Balance: {formatCurrency(user?.balance || 0)}
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
                  <Typography variant="h4">{stats.followingMasters}</Typography>
                  <Typography color="text.secondary">Following Masters</Typography>
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
                <Avatar sx={{ bgcolor: stats.totalPnL >= 0 ? 'success.main' : 'error.main', mr: 2 }}>
                  <MoneyIcon />
                </Avatar>
                <Box>
                  <Typography variant="h4" color={stats.totalPnL >= 0 ? 'success.main' : 'error.main'}>
                    {formatCurrency(stats.totalPnL)}
                  </Typography>
                  <Typography color="text.secondary">Total P&L</Typography>
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
                  <Typography variant="h4">{stats.winRate}%</Typography>
                  <Typography color="text.secondary">Win Rate</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Tabs */}
        <Paper sx={{ width: '100%' }}>
          <Tabs value={tab} onChange={(e, newValue) => setTab(newValue)}>
            <Tab label="My Masters" />
            <Tab label="Portfolio" />
            <Tab label="Copy Orders" />
            <Tab label="Browse Masters" />
          </Tabs>

          <TabPanel value={tab} index={0}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="h6">Following Masters ({masters.length})</Typography>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setOpenFollowDialog(true)}
              >
                Follow New Master
              </Button>
            </Box>
            <Grid container spacing={3}>
              {masters.map((relationship) => (
                <Grid item xs={12} sm={6} md={4} key={relationship.id}>
                  <Card>
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          <Avatar sx={{ mr: 2 }}>
                            <PersonIcon />
                          </Avatar>
                          <Box>
                            <Typography variant="h6">{relationship.master?.username}</Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                              <StarIcon sx={{ fontSize: 16, color: 'gold', mr: 0.5 }} />
                              <Typography variant="body2" color="text.secondary">
                                4.8 (124 reviews)
                              </Typography>
                            </Box>
                          </Box>
                        </Box>
                        <Box>
                          <IconButton onClick={() => handleEditRelationship(relationship)} size="small">
                            <EditIcon />
                          </IconButton>
                          <IconButton
                            onClick={() => handleUnfollowMaster(relationship.id)}
                            size="small"
                            color="error"
                          >
                            <DeleteIcon />
                          </IconButton>
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
                        <Typography variant="body2">
                          <strong>Daily Loss Limit:</strong> {formatCurrency(relationship.max_daily_loss)}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Chip
                          label={relationship.is_active ? 'Active' : 'Inactive'}
                          color={relationship.is_active ? 'success' : 'error'}
                          size="small"
                        />
                        <Typography variant="body2" color="success.main">
                          +15.2% this month
                        </Typography>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </TabPanel>

          <TabPanel value={tab} index={1}>
            <Typography variant="h6" sx={{ mb: 2 }}>Portfolio Overview</Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>Holdings Distribution</Typography>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={portfolio}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {portfolio.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} md={6}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>Position P&L</Typography>
                    <List>
                      {portfolio.map((position, index) => (
                        <ListItem key={position.name}>
                          <ListItemText
                            primary={position.name}
                            secondary={`${position.value}% of portfolio`}
                          />
                          <Typography
                            variant="body2"
                            color={position.pnl >= 0 ? 'success.main' : 'error.main'}
                          >
                            {formatCurrency(position.pnl)}
                          </Typography>
                        </ListItem>
                      ))}
                    </List>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </TabPanel>

          <TabPanel value={tab} index={2}>
            <Typography variant="h6" sx={{ mb: 2 }}>Copy Trading Orders</Typography>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Order ID</TableCell>
                    <TableCell>Master</TableCell>
                    <TableCell>Symbol</TableCell>
                    <TableCell>Side</TableCell>
                    <TableCell>Quantity</TableCell>
                    <TableCell>Price</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Latency</TableCell>
                    <TableCell>Created</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>#{order.id}</TableCell>
                      <TableCell>{order.master_order?.user?.username || 'N/A'}</TableCell>
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
                        {order.replication_latency_ms ? `${order.replication_latency_ms}ms` : 'N/A'}
                      </TableCell>
                      <TableCell>{new Date(order.created_at).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </TabPanel>

          <TabPanel value={tab} index={3}>
            <Typography variant="h6" sx={{ mb: 2 }}>Browse Master Traders</Typography>
            <Grid container spacing={3}>
              {availableMasters.map((master) => (
                <Grid item xs={12} sm={6} md={4} key={master.id}>
                  <Card>
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                        <Avatar sx={{ mr: 2 }}>
                          <PersonIcon />
                        </Avatar>
                        <Box>
                          <Typography variant="h6">{master.username}</Typography>
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <StarIcon sx={{ fontSize: 16, color: 'gold', mr: 0.5 }} />
                            <Typography variant="body2" color="text.secondary">
                              4.{Math.floor(Math.random() * 9) + 1} ({Math.floor(Math.random() * 200) + 50} reviews)
                            </Typography>
                          </Box>
                        </Box>
                      </Box>
                      <Box sx={{ mb: 2 }}>
                        <Typography variant="body2" color="text.secondary">
                          Experience: {Math.floor(Math.random() * 10) + 2} years
                        </Typography>
                        <Typography variant="body2" color="success.main">
                          Monthly Return: +{(Math.random() * 30 + 5).toFixed(1)}%
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Followers: {Math.floor(Math.random() * 500) + 100}
                        </Typography>
                      </Box>
                      <Button
                        variant="contained"
                        fullWidth
                        onClick={() => {
                          setFollowForm({...followForm, master_id: master.id})
                          setOpenFollowDialog(true)
                        }}
                        disabled={masters.some(m => m.master_id === master.id)}
                      >
                        {masters.some(m => m.master_id === master.id) ? 'Already Following' : 'Follow'}
                      </Button>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </TabPanel>
        </Paper>
      </Box>

      {/* Follow Master Dialog */}
      <Dialog open={openFollowDialog} onClose={() => setOpenFollowDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Follow Master Trader</DialogTitle>
        <DialogContent>
          <FormControl fullWidth margin="normal">
            <InputLabel>Master Trader</InputLabel>
            <Select
              value={followForm.master_id}
              label="Master Trader"
              onChange={(e) => setFollowForm({...followForm, master_id: e.target.value})}
            >
              {availableMasters.map((master) => (
                <MenuItem key={master.id} value={master.id}>
                  {master.username} - {master.email}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth margin="normal">
            <InputLabel>Copy Strategy</InputLabel>
            <Select
              value={followForm.copy_strategy}
              label="Copy Strategy"
              onChange={(e) => setFollowForm({...followForm, copy_strategy: e.target.value})}
            >
              <MenuItem value="FIXED_RATIO">Fixed Ratio</MenuItem>
              <MenuItem value="PERCENTAGE">Percentage of Capital</MenuItem>
              <MenuItem value="FIXED_QUANTITY">Fixed Quantity</MenuItem>
            </Select>
          </FormControl>
          {followForm.copy_strategy === 'FIXED_RATIO' && (
            <TextField
              fullWidth
              label="Ratio (e.g., 1.5 for 1.5x master's quantity)"
              type="number"
              value={followForm.ratio}
              onChange={(e) => setFollowForm({...followForm, ratio: e.target.value})}
              margin="normal"
              step="0.1"
            />
          )}
          {followForm.copy_strategy === 'PERCENTAGE' && (
            <TextField
              fullWidth
              label="Percentage of Available Capital"
              type="number"
              value={followForm.percentage}
              onChange={(e) => setFollowForm({...followForm, percentage: e.target.value})}
              margin="normal"
              inputProps={{ min: 1, max: 100 }}
              helperText="1-100% of your available capital per trade"
            />
          )}
          {followForm.copy_strategy === 'FIXED_QUANTITY' && (
            <TextField
              fullWidth
              label="Fixed Quantity"
              type="number"
              value={followForm.fixed_quantity}
              onChange={(e) => setFollowForm({...followForm, fixed_quantity: e.target.value})}
              margin="normal"
              inputProps={{ min: 1 }}
            />
          )}
          <TextField
            fullWidth
            label="Max Order Value (₹)"
            type="number"
            value={followForm.max_order_value}
            onChange={(e) => setFollowForm({...followForm, max_order_value: e.target.value})}
            margin="normal"
            helperText="Maximum value per order"
          />
          <TextField
            fullWidth
            label="Daily Loss Limit (₹)"
            type="number"
            value={followForm.max_daily_loss}
            onChange={(e) => setFollowForm({...followForm, max_daily_loss: e.target.value})}
            margin="normal"
            helperText="Stop copying if daily loss exceeds this amount"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenFollowDialog(false)}>Cancel</Button>
          <Button onClick={handleFollowMaster} variant="contained">
            Follow Master
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Relationship Dialog */}
      <Dialog open={openEditDialog} onClose={() => setOpenEditDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Copy Settings</DialogTitle>
        <DialogContent>
          <FormControl fullWidth margin="normal">
            <InputLabel>Copy Strategy</InputLabel>
            <Select
              value={followForm.copy_strategy}
              label="Copy Strategy"
              onChange={(e) => setFollowForm({...followForm, copy_strategy: e.target.value})}
            >
              <MenuItem value="FIXED_RATIO">Fixed Ratio</MenuItem>
              <MenuItem value="PERCENTAGE">Percentage of Capital</MenuItem>
              <MenuItem value="FIXED_QUANTITY">Fixed Quantity</MenuItem>
            </Select>
          </FormControl>
          {followForm.copy_strategy === 'FIXED_RATIO' && (
            <TextField
              fullWidth
              label="Ratio"
              type="number"
              value={followForm.ratio}
              onChange={(e) => setFollowForm({...followForm, ratio: e.target.value})}
              margin="normal"
              step="0.1"
            />
          )}
          {followForm.copy_strategy === 'PERCENTAGE' && (
            <TextField
              fullWidth
              label="Percentage"
              type="number"
              value={followForm.percentage}
              onChange={(e) => setFollowForm({...followForm, percentage: e.target.value})}
              margin="normal"
            />
          )}
          {followForm.copy_strategy === 'FIXED_QUANTITY' && (
            <TextField
              fullWidth
              label="Fixed Quantity"
              type="number"
              value={followForm.fixed_quantity}
              onChange={(e) => setFollowForm({...followForm, fixed_quantity: e.target.value})}
              margin="normal"
            />
          )}
          <TextField
            fullWidth
            label="Max Order Value (₹)"
            type="number"
            value={followForm.max_order_value}
            onChange={(e) => setFollowForm({...followForm, max_order_value: e.target.value})}
            margin="normal"
          />
          <TextField
            fullWidth
            label="Daily Loss Limit (₹)"
            type="number"
            value={followForm.max_daily_loss}
            onChange={(e) => setFollowForm({...followForm, max_daily_loss: e.target.value})}
            margin="normal"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenEditDialog(false)}>Cancel</Button>
          <Button onClick={handleUpdateRelationship} variant="contained">
            Update Settings
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default FollowerDashboard