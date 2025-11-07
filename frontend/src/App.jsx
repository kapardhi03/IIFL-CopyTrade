import React, { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Box } from '@mui/material'
import AuthPage from './pages/AuthPage'
import AdminDashboard from './pages/AdminDashboard'
import MasterDashboard from './pages/MasterDashboard'
import FollowerDashboard from './pages/FollowerDashboard'
import { AuthProvider, useAuth } from './hooks/useAuth'

function AppRouter() {
  const { user, loading } = useAuth()

  if (loading) {
    return <Box>Loading...</Box>
  }

  if (!user) {
    return <AuthPage />
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to={`/${user.role.toLowerCase()}`} />} />
      <Route path="/admin" element={user.role === 'ADMIN' ? <AdminDashboard /> : <Navigate to="/" />} />
      <Route path="/master" element={user.role === 'MASTER' || user.role === 'BOTH' ? <MasterDashboard /> : <Navigate to="/" />} />
      <Route path="/follower" element={user.role === 'FOLLOWER' || user.role === 'BOTH' ? <FollowerDashboard /> : <Navigate to="/" />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  )
}

function App() {
  return (
    <AuthProvider>
      <Box sx={{ height: '100vh', overflow: 'hidden' }}>
        <AppRouter />
      </Box>
    </AuthProvider>
  )
}

export default App