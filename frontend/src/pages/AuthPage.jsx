import React, { useState } from 'react'
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Tab,
  Tabs,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
} from '@mui/material'
import { useAuth } from '../hooks/useAuth'

function TabPanel({ children, value, index }) {
  return (
    <div hidden={value !== index}>
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  )
}

function AuthPage() {
  const [tab, setTab] = useState(0)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const { login, register } = useAuth()

  const [loginForm, setLoginForm] = useState({
    email: '',
    password: '',
  })

  const [registerForm, setRegisterForm] = useState({
    email: '',
    username: '',
    password: '',
    full_name: '',
    role: 'FOLLOWER',
    iifl_account_id: '',
    iifl_user_id: '',
    iifl_password: '',
    iifl_api_key: '',
    iifl_app_name: 'CopyTrade',
    iifl_public_ip: '',
  })

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')

    const result = await login(loginForm)
    if (!result.success) {
      setError(result.error)
    }
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    const result = await register(registerForm)
    if (result.success) {
      setSuccess('Registration successful! Please login.')
      setTab(0)
      setRegisterForm({
        email: '',
        username: '',
        password: '',
        full_name: '',
        role: 'FOLLOWER',
        iifl_account_id: '',
        iifl_user_id: '',
        iifl_password: '',
        iifl_api_key: '',
        iifl_app_name: 'CopyTrade',
        iifl_public_ip: '',
      })
    } else {
      setError(result.error)
    }
  }

  return (
    <Box
      sx={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      }}
    >
      <Card sx={{ width: '100%', maxWidth: 500, mx: 2 }}>
        <CardContent>
          <Typography variant="h4" align="center" gutterBottom>
            IIFL Copy Trading
          </Typography>
          <Typography variant="subtitle1" align="center" color="text.secondary" sx={{ mb: 3 }}>
            Professional Copy Trading Platform
          </Typography>

          <Tabs value={tab} onChange={(e, newValue) => setTab(newValue)} centered>
            <Tab label="Login" />
            <Tab label="Register" />
          </Tabs>

          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
          {success && <Alert severity="success" sx={{ mt: 2 }}>{success}</Alert>}

          <TabPanel value={tab} index={0}>
            <form onSubmit={handleLogin}>
              <TextField
                fullWidth
                label="Email"
                type="email"
                value={loginForm.email}
                onChange={(e) => setLoginForm({...loginForm, email: e.target.value})}
                margin="normal"
                required
              />
              <TextField
                fullWidth
                label="Password"
                type="password"
                value={loginForm.password}
                onChange={(e) => setLoginForm({...loginForm, password: e.target.value})}
                margin="normal"
                required
              />
              <Button
                type="submit"
                fullWidth
                variant="contained"
                sx={{ mt: 3 }}
                size="large"
              >
                Login
              </Button>
            </form>
          </TabPanel>

          <TabPanel value={tab} index={1}>
            <form onSubmit={handleRegister}>
              <TextField
                fullWidth
                label="Email"
                type="email"
                value={registerForm.email}
                onChange={(e) => setRegisterForm({...registerForm, email: e.target.value})}
                margin="normal"
                required
              />
              <TextField
                fullWidth
                label="Username"
                value={registerForm.username}
                onChange={(e) => setRegisterForm({...registerForm, username: e.target.value})}
                margin="normal"
                required
              />
              <TextField
                fullWidth
                label="Full Name"
                value={registerForm.full_name}
                onChange={(e) => setRegisterForm({...registerForm, full_name: e.target.value})}
                margin="normal"
                required
              />
              <TextField
                fullWidth
                label="Password"
                type="password"
                value={registerForm.password}
                onChange={(e) => setRegisterForm({...registerForm, password: e.target.value})}
                margin="normal"
                required
              />
              <FormControl fullWidth margin="normal">
                <InputLabel>Account Type</InputLabel>
                <Select
                  value={registerForm.role}
                  label="Account Type"
                  onChange={(e) => setRegisterForm({...registerForm, role: e.target.value})}
                >
                  <MenuItem value="FOLLOWER">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Chip label="Follower" size="small" color="primary" />
                      <span>Subscribe to master traders</span>
                    </Box>
                  </MenuItem>
                  <MenuItem value="MASTER">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Chip label="Master" size="small" color="secondary" />
                      <span>Share trading signals</span>
                    </Box>
                  </MenuItem>
                  <MenuItem value="BOTH">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Chip label="Both" size="small" color="warning" />
                      <span>Master + Follower</span>
                    </Box>
                  </MenuItem>
                </Select>
              </FormControl>
              <TextField
                fullWidth
                label="IIFL Account ID (ClientCode)"
                value={registerForm.iifl_account_id}
                onChange={(e) => setRegisterForm({...registerForm, iifl_account_id: e.target.value})}
                margin="normal"
                required
                helperText="Your IIFL trading account ID / ClientCode"
              />
              <TextField
                fullWidth
                label="IIFL User ID"
                value={registerForm.iifl_user_id}
                onChange={(e) => setRegisterForm({...registerForm, iifl_user_id: e.target.value})}
                margin="normal"
                required
                helperText="Your IIFL user ID for API authentication"
              />
              <TextField
                fullWidth
                label="IIFL Password"
                type="password"
                value={registerForm.iifl_password}
                onChange={(e) => setRegisterForm({...registerForm, iifl_password: e.target.value})}
                margin="normal"
                required
                helperText="Your IIFL password for API authentication"
              />
              <TextField
                fullWidth
                label="IIFL API Key"
                value={registerForm.iifl_api_key}
                onChange={(e) => setRegisterForm({...registerForm, iifl_api_key: e.target.value})}
                margin="normal"
                required
                helperText="Your IIFL API key from registration"
              />
              <TextField
                fullWidth
                label="IIFL App Name"
                value={registerForm.iifl_app_name}
                onChange={(e) => setRegisterForm({...registerForm, iifl_app_name: e.target.value})}
                margin="normal"
                placeholder="CopyTrade"
                helperText="App name provided during IIFL registration"
              />
              <TextField
                fullWidth
                label="Public IP Address"
                value={registerForm.iifl_public_ip}
                onChange={(e) => setRegisterForm({...registerForm, iifl_public_ip: e.target.value})}
                margin="normal"
                required
                helperText="Your public IP address for order placement"
              />
              <Button
                type="submit"
                fullWidth
                variant="contained"
                sx={{ mt: 3 }}
                size="large"
              >
                Register
              </Button>
            </form>
          </TabPanel>
        </CardContent>
      </Card>
    </Box>
  )
}

export default AuthPage