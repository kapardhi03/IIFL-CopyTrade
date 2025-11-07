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
  IconButton,
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
} from '@mui/material'
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  People as PeopleIcon,
  TrendingUp as TrendingUpIcon,
  AccountBalance as MoneyIcon,
  Assessment as MetricsIcon,
} from '@mui/icons-material'
import { useAuth } from '../hooks/useAuth'
import { usersAPI, ordersAPI, relationshipsAPI } from '../services/api'
import SubscriptionManager from '../components/SubscriptionManager'
import RealTimeMonitor from '../components/RealTimeMonitor'

function TabPanel({ children, value, index }) {
  return (
    <div hidden={value !== index}>
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  )
}

function AdminDashboard() {
  const { logout } = useAuth()
  const [tab, setTab] = useState(0)
  const [users, setUsers] = useState([])
  const [orders, setOrders] = useState([])
  const [relationships, setRelationships] = useState([])
  const [metrics, setMetrics] = useState({})
  const [loading, setLoading] = useState(true)
  const [openDialog, setOpenDialog] = useState(false)
  const [dialogType, setDialogType] = useState('') // 'user', 'relationship'
  const [selectedItem, setSelectedItem] = useState(null)
  const [error, setError] = useState('')

  const [userForm, setUserForm] = useState({
    email: '',
    username: '',
    full_name: '',
    role: 'FOLLOWER',
    iifl_account_id: '',
    iifl_user_id: '',
    balance: '100000',
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [usersRes, ordersRes, metricsRes] = await Promise.all([
        usersAPI.getUsers(''),
        ordersAPI.getOrders({ limit: 100 }),
        ordersAPI.getReplicationMetrics(),
      ])

      setUsers(usersRes.data)
      setOrders(ordersRes.data)
      setMetrics(metricsRes.data)
    } catch (error) {
      setError('Failed to load data')
    }
    setLoading(false)
  }

  const handleCreateUser = () => {
    setDialogType('user')
    setSelectedItem(null)
    setUserForm({
      email: '',
      username: '',
      full_name: '',
      role: 'FOLLOWER',
      iifl_account_id: '',
      iifl_user_id: '',
      balance: '100000',
    })
    setOpenDialog(true)
  }

  const handleEditUser = (user) => {
    setDialogType('user')
    setSelectedItem(user)
    setUserForm({
      email: user.email,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
      iifl_account_id: user.iifl_account_id || '',
      iifl_user_id: user.iifl_user_id || '',
      balance: user.balance?.toString() || '100000',
    })
    setOpenDialog(true)
  }

  const handleSaveUser = async () => {
    try {
      if (selectedItem) {
        await usersAPI.updateUser(selectedItem.id, userForm)
      } else {
        await usersAPI.createUser(userForm)
      }
      setOpenDialog(false)
      loadData()
    } catch (error) {
      setError('Failed to save user')
    }
  }

  const handleDeleteUser = async (userId) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      try {
        await usersAPI.deleteUser(userId)
        loadData()
      } catch (error) {
        setError('Failed to delete user')
      }
    }
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
    }).format(amount)
  }

  const stats = {
    totalUsers: users.length,
    masters: users.filter(u => u.role === 'MASTER' || u.role === 'BOTH').length,
    followers: users.filter(u => u.role === 'FOLLOWER' || u.role === 'BOTH').length,
    totalOrders: orders.length,
    totalVolume: orders.reduce((sum, order) => sum + (order.quantity * (order.price || 0)), 0),
  }

  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            IIFL Copy Trading - Admin Panel
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
                  <Typography variant="h4">{stats.totalUsers}</Typography>
                  <Typography color="text.secondary">Total Users</Typography>
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
                  <Typography variant="h4">{stats.masters}</Typography>
                  <Typography color="text.secondary">Master Traders</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent sx={{ display: 'flex', alignItems: 'center' }}>
                <Avatar sx={{ bgcolor: 'success.main', mr: 2 }}>
                  <MetricsIcon />
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
                <Avatar sx={{ bgcolor: 'warning.main', mr: 2 }}>
                  <MoneyIcon />
                </Avatar>
                <Box>
                  <Typography variant="h4">{formatCurrency(stats.totalVolume)}</Typography>
                  <Typography color="text.secondary">Total Volume</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Tabs */}
        <Paper sx={{ width: '100%' }}>
          <Tabs value={tab} onChange={(e, newValue) => setTab(newValue)}>
            <Tab label="Users Management" />
            <Tab label="Orders & Trading" />
            <Tab label="Relationships" />
            <Tab label="Subscriptions" />
            <Tab label="Real-Time Monitor" />
            <Tab label="System Metrics" />
          </Tabs>

          <TabPanel value={tab} index={0}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="h6">User Management</Typography>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleCreateUser}
              >
                Add User
              </Button>
            </Box>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Username</TableCell>
                    <TableCell>Email</TableCell>
                    <TableCell>Role</TableCell>
                    <TableCell>Balance</TableCell>
                    <TableCell>IIFL Account</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>{user.username}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        <Chip
                          label={user.role}
                          color={user.role === 'MASTER' ? 'secondary' : user.role === 'BOTH' ? 'warning' : 'primary'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>{formatCurrency(user.balance || 0)}</TableCell>
                      <TableCell>{user.iifl_account_id || 'Not set'}</TableCell>
                      <TableCell>
                        <Chip
                          label={user.is_active ? 'Active' : 'Inactive'}
                          color={user.is_active ? 'success' : 'error'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <IconButton onClick={() => handleEditUser(user)} size="small">
                          <EditIcon />
                        </IconButton>
                        <IconButton onClick={() => handleDeleteUser(user.id)} size="small" color="error">
                          <DeleteIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </TabPanel>

          <TabPanel value={tab} index={1}>
            <Typography variant="h6" sx={{ mb: 2 }}>Recent Orders</Typography>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Order ID</TableCell>
                    <TableCell>User</TableCell>
                    <TableCell>Symbol</TableCell>
                    <TableCell>Side</TableCell>
                    <TableCell>Quantity</TableCell>
                    <TableCell>Price</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Created</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {orders.slice(0, 20).map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>#{order.id}</TableCell>
                      <TableCell>{order.user?.username}</TableCell>
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
                        {order.is_master_order ? (
                          <Chip label="Master" color="secondary" size="small" />
                        ) : (
                          <Chip label="Follower" color="primary" size="small" />
                        )}
                      </TableCell>
                      <TableCell>{new Date(order.created_at).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </TabPanel>

          <TabPanel value={tab} index={2}>
            <Typography variant="h6" sx={{ mb: 2 }}>Master-Follower Relationships</Typography>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Master</TableCell>
                    <TableCell>Follower</TableCell>
                    <TableCell>Strategy</TableCell>
                    <TableCell>Ratio/Percentage</TableCell>
                    <TableCell>Max Order Value</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {relationships.map((rel) => (
                    <TableRow key={rel.id}>
                      <TableCell>{rel.master?.username}</TableCell>
                      <TableCell>{rel.follower?.username}</TableCell>
                      <TableCell>{rel.copy_strategy}</TableCell>
                      <TableCell>
                        {rel.copy_strategy === 'FIXED_RATIO' && `${rel.ratio}x`}
                        {rel.copy_strategy === 'PERCENTAGE' && `${rel.percentage}%`}
                        {rel.copy_strategy === 'FIXED_QUANTITY' && rel.fixed_quantity}
                      </TableCell>
                      <TableCell>{formatCurrency(rel.max_order_value)}</TableCell>
                      <TableCell>
                        <Chip
                          label={rel.is_active ? 'Active' : 'Inactive'}
                          color={rel.is_active ? 'success' : 'error'}
                          size="small"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </TabPanel>

          <TabPanel value={tab} index={3}>
            <SubscriptionManager userRole="ADMIN" />
          </TabPanel>

          <TabPanel value={tab} index={4}>
            <RealTimeMonitor />
          </TabPanel>

          <TabPanel value={tab} index={5}>
            <Typography variant="h6" sx={{ mb: 2 }}>System Performance</Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>Replication Metrics</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Average latency: {metrics.average_latency || 'N/A'}ms
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Success rate: {metrics.success_rate || 'N/A'}%
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} md={6}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>Platform Stats</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Uptime: 99.9%
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      API Calls: {orders.length * 2}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </TabPanel>
        </Paper>
      </Box>

      {/* User Dialog */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {selectedItem ? 'Edit User' : 'Create New User'}
        </DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Email"
            value={userForm.email}
            onChange={(e) => setUserForm({...userForm, email: e.target.value})}
            margin="normal"
            type="email"
          />
          <TextField
            fullWidth
            label="Username"
            value={userForm.username}
            onChange={(e) => setUserForm({...userForm, username: e.target.value})}
            margin="normal"
          />
          <TextField
            fullWidth
            label="Full Name"
            value={userForm.full_name}
            onChange={(e) => setUserForm({...userForm, full_name: e.target.value})}
            margin="normal"
          />
          <FormControl fullWidth margin="normal">
            <InputLabel>Role</InputLabel>
            <Select
              value={userForm.role}
              label="Role"
              onChange={(e) => setUserForm({...userForm, role: e.target.value})}
            >
              <MenuItem value="FOLLOWER">Follower</MenuItem>
              <MenuItem value="MASTER">Master</MenuItem>
              <MenuItem value="BOTH">Both</MenuItem>
            </Select>
          </FormControl>
          <TextField
            fullWidth
            label="IIFL Account ID"
            value={userForm.iifl_account_id}
            onChange={(e) => setUserForm({...userForm, iifl_account_id: e.target.value})}
            margin="normal"
          />
          <TextField
            fullWidth
            label="IIFL User ID"
            value={userForm.iifl_user_id}
            onChange={(e) => setUserForm({...userForm, iifl_user_id: e.target.value})}
            margin="normal"
          />
          <TextField
            fullWidth
            label="Balance"
            value={userForm.balance}
            onChange={(e) => setUserForm({...userForm, balance: e.target.value})}
            margin="normal"
            type="number"
            InputProps={{
              startAdornment: '₹',
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
          <Button onClick={handleSaveUser} variant="contained">
            {selectedItem ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default AdminDashboard