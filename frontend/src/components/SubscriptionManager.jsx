import React, { useState, useEffect } from 'react'
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Grid,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
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
  Switch,
  FormControlLabel,
  Avatar,
  Divider,
} from '@mui/material'
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Payment as PaymentIcon,
  Star as StarIcon,
  TrendingUp as TrendingUpIcon,
  AttachMoney as MoneyIcon,
} from '@mui/icons-material'
import { subscriptionsAPI } from '../services/api'

const SUBSCRIPTION_PLANS = {
  BASIC: {
    name: 'Basic',
    price: 999,
    features: ['Follow up to 3 masters', 'Basic analytics', 'Email support'],
    maxMasters: 3,
    color: 'primary'
  },
  PREMIUM: {
    name: 'Premium',
    price: 2999,
    features: ['Follow up to 10 masters', 'Advanced analytics', 'Priority support', 'Risk management tools'],
    maxMasters: 10,
    color: 'secondary'
  },
  PRO: {
    name: 'Professional',
    price: 9999,
    features: ['Unlimited masters', 'AI insights', '24/7 support', 'Custom strategies', 'White-label access'],
    maxMasters: -1,
    color: 'warning'
  }
}

function SubscriptionManager({ userRole = 'ADMIN' }) {
  const [subscriptions, setSubscriptions] = useState([])
  const [openDialog, setOpenDialog] = useState(false)
  const [openPlanDialog, setOpenPlanDialog] = useState(false)
  const [selectedSubscription, setSelectedSubscription] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const [subscriptionForm, setSubscriptionForm] = useState({
    user_id: '',
    plan: 'BASIC',
    billing_cycle: 'MONTHLY',
    auto_renew: true,
    discount_percent: 0,
  })

  const [planStats, setPlanStats] = useState({
    totalRevenue: 0,
    activeSubscriptions: 0,
    churnRate: 0,
    monthlyGrowth: 0,
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const response = await subscriptionsAPI.getSubscriptions()
      setSubscriptions(response.data || [])

      // Calculate stats
      const active = (response.data || []).filter(s => s.status === 'ACTIVE')
      const totalRevenue = active.reduce((sum, s) => {
        const plan = SUBSCRIPTION_PLANS[s.plan]
        const multiplier = s.billing_cycle === 'YEARLY' ? 10 : 1 // 2 months free for yearly
        return sum + (plan?.price || 0) * multiplier
      }, 0)

      setPlanStats({
        totalRevenue,
        activeSubscriptions: active.length,
        churnRate: 5.2, // Mock data
        monthlyGrowth: 23.5, // Mock data
      })

    } catch (error) {
      setError('Failed to load subscriptions')
    }
    setLoading(false)
  }

  const handleCreateSubscription = async () => {
    try {
      await subscriptionsAPI.createSubscription(subscriptionForm)
      setOpenDialog(false)
      setSubscriptionForm({
        user_id: '',
        plan: 'BASIC',
        billing_cycle: 'MONTHLY',
        auto_renew: true,
        discount_percent: 0,
      })
      loadData()
    } catch (error) {
      setError('Failed to create subscription')
    }
  }

  const handleUpdateSubscription = async () => {
    try {
      await subscriptionsAPI.updateSubscription(selectedSubscription.id, subscriptionForm)
      setOpenDialog(false)
      setSelectedSubscription(null)
      loadData()
    } catch (error) {
      setError('Failed to update subscription')
    }
  }

  const handleCancelSubscription = async (subscriptionId) => {
    if (window.confirm('Are you sure you want to cancel this subscription?')) {
      try {
        await subscriptionsAPI.cancelSubscription(subscriptionId)
        loadData()
      } catch (error) {
        setError('Failed to cancel subscription')
      }
    }
  }

  const handleEditSubscription = (subscription) => {
    setSelectedSubscription(subscription)
    setSubscriptionForm({
      user_id: subscription.user_id,
      plan: subscription.plan,
      billing_cycle: subscription.billing_cycle,
      auto_renew: subscription.auto_renew,
      discount_percent: subscription.discount_percent || 0,
    })
    setOpenDialog(true)
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
    }).format(amount)
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'ACTIVE': return 'success'
      case 'CANCELLED': return 'error'
      case 'PENDING': return 'warning'
      case 'EXPIRED': return 'default'
      default: return 'default'
    }
  }

  const calculatePrice = (plan, billingCycle, discountPercent = 0) => {
    const basePrice = SUBSCRIPTION_PLANS[plan]?.price || 0
    const multiplier = billingCycle === 'YEARLY' ? 10 : 1 // 2 months free for yearly
    const price = basePrice * multiplier
    const discount = price * (discountPercent / 100)
    return price - discount
  }

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Revenue Stats */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent sx={{ display: 'flex', alignItems: 'center' }}>
              <Avatar sx={{ bgcolor: 'success.main', mr: 2 }}>
                <MoneyIcon />
              </Avatar>
              <Box>
                <Typography variant="h4">{formatCurrency(planStats.totalRevenue)}</Typography>
                <Typography color="text.secondary">Monthly Revenue</Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent sx={{ display: 'flex', alignItems: 'center' }}>
              <Avatar sx={{ bgcolor: 'primary.main', mr: 2 }}>
                <StarIcon />
              </Avatar>
              <Box>
                <Typography variant="h4">{planStats.activeSubscriptions}</Typography>
                <Typography color="text.secondary">Active Subscribers</Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent sx={{ display: 'flex', alignItems: 'center' }}>
              <Avatar sx={{ bgcolor: 'warning.main', mr: 2 }}>
                <TrendingUpIcon />
              </Avatar>
              <Box>
                <Typography variant="h4">{planStats.monthlyGrowth}%</Typography>
                <Typography color="text.secondary">Monthly Growth</Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent sx={{ display: 'flex', alignItems: 'center' }}>
              <Avatar sx={{ bgcolor: 'error.main', mr: 2 }}>
                <PaymentIcon />
              </Avatar>
              <Box>
                <Typography variant="h4">{planStats.churnRate}%</Typography>
                <Typography color="text.secondary">Churn Rate</Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Subscription Plans */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">Subscription Plans</Typography>
            <Button variant="outlined" onClick={() => setOpenPlanDialog(true)}>
              View Pricing
            </Button>
          </Box>
          <Grid container spacing={2}>
            {Object.entries(SUBSCRIPTION_PLANS).map(([key, plan]) => (
              <Grid item xs={12} sm={4} key={key}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="h6" color={`${plan.color}.main`} gutterBottom>
                      {plan.name}
                    </Typography>
                    <Typography variant="h4" gutterBottom>
                      {formatCurrency(plan.price)}
                      <Typography component="span" variant="body2" color="text.secondary">
                        /month
                      </Typography>
                    </Typography>
                    <Box sx={{ mb: 2 }}>
                      {plan.features.map((feature, index) => (
                        <Typography key={index} variant="body2" color="text.secondary">
                          • {feature}
                        </Typography>
                      ))}
                    </Box>
                    <Chip
                      label={`${subscriptions.filter(s => s.plan === key && s.status === 'ACTIVE').length} subscribers`}
                      size="small"
                      color={plan.color}
                    />
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>

      {/* Subscriptions Table */}
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">Manage Subscriptions</Typography>
            {userRole === 'ADMIN' && (
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setOpenDialog(true)}
              >
                Add Subscription
              </Button>
            )}
          </Box>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>User</TableCell>
                  <TableCell>Plan</TableCell>
                  <TableCell>Billing</TableCell>
                  <TableCell>Price</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Next Billing</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {subscriptions.map((subscription) => (
                  <TableRow key={subscription.id}>
                    <TableCell>
                      <Box>
                        <Typography variant="body2">{subscription.user?.username}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {subscription.user?.email}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={SUBSCRIPTION_PLANS[subscription.plan]?.name || subscription.plan}
                        color={SUBSCRIPTION_PLANS[subscription.plan]?.color || 'default'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>{subscription.billing_cycle}</TableCell>
                    <TableCell>
                      {formatCurrency(calculatePrice(
                        subscription.plan,
                        subscription.billing_cycle,
                        subscription.discount_percent
                      ))}
                      {subscription.discount_percent > 0 && (
                        <Chip
                          label={`${subscription.discount_percent}% off`}
                          size="small"
                          color="success"
                          sx={{ ml: 1 }}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={subscription.status}
                        color={getStatusColor(subscription.status)}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      {subscription.next_billing_date ?
                        new Date(subscription.next_billing_date).toLocaleDateString() :
                        'N/A'
                      }
                    </TableCell>
                    <TableCell>
                      {userRole === 'ADMIN' && (
                        <>
                          <Button
                            size="small"
                            startIcon={<EditIcon />}
                            onClick={() => handleEditSubscription(subscription)}
                          >
                            Edit
                          </Button>
                          <Button
                            size="small"
                            color="error"
                            startIcon={<DeleteIcon />}
                            onClick={() => handleCancelSubscription(subscription.id)}
                          >
                            Cancel
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Subscription Form Dialog */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {selectedSubscription ? 'Edit Subscription' : 'Create Subscription'}
        </DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="User ID"
            value={subscriptionForm.user_id}
            onChange={(e) => setSubscriptionForm({...subscriptionForm, user_id: e.target.value})}
            margin="normal"
            disabled={!!selectedSubscription}
          />
          <FormControl fullWidth margin="normal">
            <InputLabel>Plan</InputLabel>
            <Select
              value={subscriptionForm.plan}
              label="Plan"
              onChange={(e) => setSubscriptionForm({...subscriptionForm, plan: e.target.value})}
            >
              {Object.entries(SUBSCRIPTION_PLANS).map(([key, plan]) => (
                <MenuItem key={key} value={key}>
                  {plan.name} - {formatCurrency(plan.price)}/month
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth margin="normal">
            <InputLabel>Billing Cycle</InputLabel>
            <Select
              value={subscriptionForm.billing_cycle}
              label="Billing Cycle"
              onChange={(e) => setSubscriptionForm({...subscriptionForm, billing_cycle: e.target.value})}
            >
              <MenuItem value="MONTHLY">Monthly</MenuItem>
              <MenuItem value="YEARLY">Yearly (2 months free)</MenuItem>
            </Select>
          </FormControl>
          <TextField
            fullWidth
            label="Discount Percentage"
            type="number"
            value={subscriptionForm.discount_percent}
            onChange={(e) => setSubscriptionForm({...subscriptionForm, discount_percent: parseFloat(e.target.value) || 0})}
            margin="normal"
            inputProps={{ min: 0, max: 100 }}
            helperText="0-100% discount"
          />
          <FormControlLabel
            control={
              <Switch
                checked={subscriptionForm.auto_renew}
                onChange={(e) => setSubscriptionForm({...subscriptionForm, auto_renew: e.target.checked})}
              />
            }
            label="Auto Renew"
            sx={{ mt: 2 }}
          />
          <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
            <Typography variant="body2" gutterBottom>
              <strong>Total Price:</strong> {formatCurrency(calculatePrice(
                subscriptionForm.plan,
                subscriptionForm.billing_cycle,
                subscriptionForm.discount_percent
              ))}
            </Typography>
            {subscriptionForm.billing_cycle === 'YEARLY' && (
              <Typography variant="caption" color="success.main">
                Yearly billing includes 2 months free!
              </Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
          <Button
            onClick={selectedSubscription ? handleUpdateSubscription : handleCreateSubscription}
            variant="contained"
          >
            {selectedSubscription ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Pricing Plans Dialog */}
      <Dialog open={openPlanDialog} onClose={() => setOpenPlanDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>Subscription Plans & Pricing</DialogTitle>
        <DialogContent>
          <Grid container spacing={3}>
            {Object.entries(SUBSCRIPTION_PLANS).map(([key, plan]) => (
              <Grid item xs={12} sm={4} key={key}>
                <Card variant="outlined" sx={{ height: '100%' }}>
                  <CardContent>
                    <Typography variant="h5" color={`${plan.color}.main`} gutterBottom>
                      {plan.name}
                    </Typography>
                    <Typography variant="h3" gutterBottom>
                      {formatCurrency(plan.price)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      per month
                    </Typography>
                    <Typography variant="h6" color="success.main" gutterBottom>
                      {formatCurrency(plan.price * 10)} yearly
                    </Typography>
                    <Typography variant="caption" color="success.main" gutterBottom>
                      (2 months free!)
                    </Typography>
                    <Divider sx={{ my: 2 }} />
                    <Box>
                      {plan.features.map((feature, index) => (
                        <Typography key={index} variant="body2" sx={{ mb: 1 }}>
                          ✓ {feature}
                        </Typography>
                      ))}
                    </Box>
                    <Box sx={{ mt: 2 }}>
                      <Chip
                        label={plan.maxMasters === -1 ? 'Unlimited Masters' : `Up to ${plan.maxMasters} Masters`}
                        color={plan.color}
                        size="small"
                      />
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenPlanDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default SubscriptionManager