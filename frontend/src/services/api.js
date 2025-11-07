import axios from 'axios'

const API_BASE_URL = 'http://localhost:8000'

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('access_token')
      window.location.href = '/'
    }
    return Promise.reject(error)
  }
)

export const authAPI = {
  login: (credentials) => api.post('/auth/login', credentials),
  register: (userData) => api.post('/auth/register', userData),
  getCurrentUser: () => api.get('/auth/me'),
}

export const usersAPI = {
  getUsers: (role) => api.get(`/users?role=${role}`),
  createUser: (userData) => api.post('/users', userData),
  updateUser: (userId, userData) => api.put(`/users/${userId}`, userData),
  deleteUser: (userId) => api.delete(`/users/${userId}`),
  getUserStats: (userId) => api.get(`/users/${userId}/stats`),
}

export const ordersAPI = {
  getOrders: (params) => api.get('/orders', { params }),
  placeOrder: (orderData) => api.post('/orders', orderData),
  getOrderHistory: (userId) => api.get(`/orders/history/${userId}`),
  getReplicationMetrics: () => api.get('/orders/replication-metrics'),
}

export const relationshipsAPI = {
  getFollowerRelationships: (masterId) => api.get(`/relationships/master/${masterId}`),
  getMasterRelationships: (followerId) => api.get(`/relationships/follower/${followerId}`),
  createRelationship: (relationshipData) => api.post('/relationships', relationshipData),
  updateRelationship: (relationshipId, data) => api.put(`/relationships/${relationshipId}`, data),
  deleteRelationship: (relationshipId) => api.delete(`/relationships/${relationshipId}`),
}

export const subscriptionsAPI = {
  getSubscriptions: () => api.get('/subscriptions'),
  createSubscription: (subscriptionData) => api.post('/subscriptions', subscriptionData),
  updateSubscription: (subscriptionId, data) => api.put(`/subscriptions/${subscriptionId}`, data),
  cancelSubscription: (subscriptionId) => api.delete(`/subscriptions/${subscriptionId}`),
}

export default api