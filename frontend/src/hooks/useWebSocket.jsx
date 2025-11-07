import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'

export const useWebSocket = (url = 'ws://localhost:8000') => {
  const [socket, setSocket] = useState(null)
  const [connected, setConnected] = useState(false)
  const [orders, setOrders] = useState([])
  const [metrics, setMetrics] = useState(null)
  const reconnectTimeoutRef = useRef(null)

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (!token) return

    const newSocket = io(url, {
      auth: {
        token: token
      },
      transports: ['websocket'],
      upgrade: true,
    })

    newSocket.on('connect', () => {
      console.log('WebSocket connected')
      setConnected(true)
      setSocket(newSocket)
    })

    newSocket.on('disconnect', () => {
      console.log('WebSocket disconnected')
      setConnected(false)

      // Auto-reconnect after 3 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        newSocket.connect()
      }, 3000)
    })

    // Order updates
    newSocket.on('order_update', (data) => {
      console.log('Order update received:', data)
      setOrders(prevOrders => {
        const existingIndex = prevOrders.findIndex(order => order.id === data.order_id)
        if (existingIndex >= 0) {
          // Update existing order
          const updated = [...prevOrders]
          updated[existingIndex] = { ...updated[existingIndex], status: data.status, ...data }
          return updated
        } else {
          // Add new order
          return [data, ...prevOrders]
        }
      })
    })

    // Replication metrics
    newSocket.on('replication_metrics', (data) => {
      console.log('Replication metrics received:', data)
      setMetrics(data)
    })

    // Master order notifications
    newSocket.on('master_order_placed', (data) => {
      console.log('Master order placed:', data)
      // You can show notifications here
    })

    // Error handling
    newSocket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error)
      setConnected(false)
    })

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      newSocket.close()
    }
  }, [url])

  const sendMessage = (event, data) => {
    if (socket && connected) {
      socket.emit(event, data)
    }
  }

  const subscribeToUserUpdates = (userId) => {
    if (socket && connected) {
      socket.emit('subscribe_user', { user_id: userId })
    }
  }

  const subscribeToMasterUpdates = (masterId) => {
    if (socket && connected) {
      socket.emit('subscribe_master', { master_id: masterId })
    }
  }

  return {
    socket,
    connected,
    orders,
    metrics,
    sendMessage,
    subscribeToUserUpdates,
    subscribeToMasterUpdates,
  }
}