# Trading API Integration Guide

This document explains how to use the Replicon trading APIs for order management, risk control, and performance analytics.

## Table of Contents

1. [IIFL API Integration](#iifl-api-integration)
2. [Order Management](#order-management)
3. [Risk Management](#risk-management)
4. [Performance Analytics](#performance-analytics)
5. [Payment Processing](#payment-processing)
6. [Market Data](#market-data)

---

## IIFL API Integration

### Setting up IIFL Client

```typescript
import { createIIFLClient } from './lib/api/iifl-client';

// Create client with credentials
const client = await createIIFLClient(
  {
    apiKey: 'your-api-key',
    apiSecret: 'your-api-secret',
    vendorCode: 'optional-vendor-code',
  },
  false // Set true for production
);

// Test connection
const result = await client.testConnection();
console.log(result.message); // "Connected successfully. Latency: 45.23ms"
```

### Placing Orders

```typescript
// Place a market order
const order = await client.placeOrder({
  exchange: 'NSE',
  symbol: 'RELIANCE',
  side: 'BUY',
  orderType: 'MARKET',
  quantity: 10,
  productType: 'INTRADAY',
  validity: 'DAY',
});

// Place a limit order
const limitOrder = await client.placeOrder({
  exchange: 'NSE',
  symbol: 'TCS',
  side: 'BUY',
  orderType: 'LIMIT',
  quantity: 5,
  price: 3500.0,
  productType: 'DELIVERY',
  validity: 'DAY',
});

// Place a stop-loss order
const slOrder = await client.placeOrder({
  exchange: 'NSE',
  symbol: 'INFY',
  side: 'SELL',
  orderType: 'SL',
  quantity: 10,
  price: 1450.0,
  triggerPrice: 1460.0,
  productType: 'INTRADAY',
  validity: 'DAY',
});
```

### Managing Orders

```typescript
// Get order status
const status = await client.getOrderStatus('order-id');

// Modify order
const modified = await client.modifyOrder('order-id', {
  quantity: 15,
  price: 3550.0,
});

// Cancel order
const cancelled = await client.cancelOrder('order-id');

// Get all orders
const orders = await client.getOrders();
```

### Position Management

```typescript
// Get current positions
const positions = await client.getPositions();

// Square off a position
await client.squareOffPosition('RELIANCE', 'NSE');

// Square off all positions (Emergency stop)
await client.squareOffAll();
```

---

## Order Management

The Order Manager handles order processing with automatic follower order copying.

### Basic Usage

```typescript
import { orderManager } from './lib/trading/order-manager';
import { createIIFLClient } from './lib/api/iifl-client';

// Set up IIFL client
const client = await createIIFLClient(credentials);
orderManager.setIIFLClient(client);

// Process an order
const result = await orderManager.processOrder({
  userId: 'user-id',
  strategyId: 'strategy-id', // Optional
  orderType: 'market',
  side: 'buy',
  symbol: 'RELIANCE',
  quantity: 10,
});

console.log(`Order ${result.orderId} ${result.status}`);
console.log(`Execution time: ${result.executionTime.toFixed(2)}ms`);
```

### Master Order Copying

When a master trader places an order:

1. Order is validated and executed
2. System automatically fetches all active followers
3. Follower orders are created with scaled quantities
4. Each follower order is executed independently

```typescript
// Master places order - followers automatically receive copied orders
const masterOrder = await orderManager.processOrder({
  userId: 'master-user-id',
  strategyId: 'strategy-id',
  orderType: 'market',
  side: 'buy',
  symbol: 'TCS',
  quantity: 100, // Master quantity
  // If follower has scaling factor 0.5, they get quantity: 50
});
```

### Order Modifications

```typescript
// Modify order
await orderManager.modifyOrder('order-id', {
  quantity: 15,
  price: 3600.0,
});

// Cancel order
await orderManager.cancelOrder('order-id');
```

### Query Orders

```typescript
// Get user's orders
const userOrders = await orderManager.getUserOrders('user-id', 50);

// Get strategy orders
const strategyOrders = await orderManager.getStrategyOrders('strategy-id');
```

---

## Risk Management

The Risk Manager enforces trading limits and monitors risk in real-time.

### Checking Order Risk

```typescript
import { riskManager } from './lib/trading/risk-manager';

// Check if order is allowed
const riskCheck = await riskManager.checkOrderRisk(
  'user-id',
  {
    userId: 'user-id',
    orderType: 'market',
    side: 'buy',
    symbol: 'RELIANCE',
    quantity: 100,
    price: 2500.0,
  }
);

if (!riskCheck.allowed) {
  console.error(`Order rejected: ${riskCheck.reason}`);
  console.log('Current metrics:', riskCheck.metrics);
} else {
  // Process order
  await orderManager.processOrder(order);
}
```

### Risk Metrics

```typescript
// Get current risk metrics
const metrics = await riskManager.calculateRiskMetrics('user-id');

console.log(`Current Exposure: ₹${metrics.currentExposure.toLocaleString()}`);
console.log(`Daily P&L: ₹${metrics.dailyPnL.toLocaleString()}`);
console.log(`Drawdown: ${(metrics.drawdown * 100).toFixed(2)}%`);
console.log(`Open Positions: ${metrics.openPositions}`);
console.log(`Portfolio Utilization: ${metrics.utilizationPercent.toFixed(1)}%`);
```

### Custom Risk Limits

```typescript
// Set custom limits for a strategy
const strategyLimits = {
  maxDailyLoss: 100000, // ₹1,00,000
  maxDrawdown: 0.1, // 10%
  maxPositionSize: 200000, // ₹2,00,000
  maxPositions: 15,
  maxExposure: 1000000, // ₹10,00,000
};

const check = await riskManager.checkOrderRisk('user-id', order, strategyLimits);
```

### Advanced Risk Analytics

```typescript
// Calculate Value at Risk (VaR)
const var95 = await riskManager.calculateVaR('user-id', 0.95);
console.log(`95% VaR: ₹${var95.toLocaleString()}`);

// Calculate Sharpe Ratio
const sharpe = await riskManager.calculateSharpeRatio('user-id');
console.log(`Sharpe Ratio: ${sharpe.toFixed(2)}`);

// Real-time risk monitoring
const { status, alerts } = await riskManager.monitorRealTimeRisk('user-id');
console.log(`Risk Status: ${status}`);
alerts.forEach((alert) => console.log(`- ${alert}`));
```

### Emergency Stop

```typescript
// Emergency stop - square off all positions
await riskManager.emergencyStop('user-id', 'Maximum drawdown reached');
```

---

## Performance Analytics

Calculate and track performance metrics in real-time.

### Real-time P&L

```typescript
import { performanceAnalytics } from './lib/analytics/performance';

// Get current P&L
const pnl = await performanceAnalytics.calculateUserPnL('user-id');

console.log(`Realized P&L: ₹${pnl.realized.toLocaleString()}`);
console.log(`Unrealized P&L: ₹${pnl.unrealized.toLocaleString()}`);
console.log(`Total P&L: ₹${pnl.total.toLocaleString()}`);
```

### Performance Metrics

```typescript
// Get comprehensive metrics
const metrics = await performanceAnalytics.calculatePerformanceMetrics(
  'user-id',
  new Date('2024-01-01'), // Optional start date
  new Date() // Optional end date
);

console.log(`Total Trades: ${metrics.totalTrades}`);
console.log(`Win Rate: ${metrics.winRate.toFixed(2)}%`);
console.log(`Average Win: ₹${metrics.averageWin.toLocaleString()}`);
console.log(`Average Loss: ₹${metrics.averageLoss.toLocaleString()}`);
console.log(`Profit Factor: ${metrics.profitFactor.toFixed(2)}`);
console.log(`Sharpe Ratio: ${metrics.sharpeRatio.toFixed(2)}`);
console.log(`Max Drawdown: ₹${metrics.maxDrawdown.toLocaleString()}`);
console.log(`Return: ${metrics.returnPercent.toFixed(2)}%`);
```

### Daily Performance

```typescript
// Get last 30 days performance
const dailyPerf = await performanceAnalytics.getDailyPerformance('user-id', 30);

dailyPerf.forEach((day) => {
  console.log(`${day.date}: P&L ₹${day.pnl.toLocaleString()}, Win Rate: ${day.winRate.toFixed(1)}%`);
});
```

### Strategy Performance

```typescript
// Get strategy-specific metrics
const strategyPerf = await performanceAnalytics.getStrategyPerformance('strategy-id');

if (strategyPerf) {
  console.log(`Strategy: ${strategyPerf.strategyName}`);
  console.log(`Subscribers: ${strategyPerf.activeSubscribers}/${strategyPerf.totalSubscribers}`);
  console.log(`Total P&L: ₹${strategyPerf.totalPnL.toLocaleString()}`);
  console.log(`Win Rate: ${strategyPerf.winRate.toFixed(2)}%`);
}
```

### Benchmark Comparison

```typescript
// Compare with benchmark (e.g., Nifty 50 returns)
const benchmarkReturns = [0.5, -0.3, 1.2, 0.8, -0.1]; // Daily returns

const comparison = await performanceAnalytics.compareWithBenchmark(
  'user-id',
  benchmarkReturns
);

console.log(`Alpha: ${comparison.alpha.toFixed(4)}`);
console.log(`Beta: ${comparison.beta.toFixed(2)}`);
console.log(`Correlation: ${comparison.correlation.toFixed(2)}`);
```

---

## Payment Processing

Razorpay integration for subscription management.

### Creating Payment Orders

```typescript
import { razorpayClient, SUBSCRIPTION_PLANS } from './lib/payments/razorpay';

// Create one-time payment order
const order = await razorpayClient.createOrder(
  299, // Amount in INR
  'INR',
  'subscription_monthly'
);

console.log(`Order ID: ${order.orderId}`);
```

### Subscription Management

```typescript
// Create subscription plan
const plan = await razorpayClient.createPlan(SUBSCRIPTION_PLANS.FOLLOWER_MONTHLY);

// Create subscription for a user
const subscription = await razorpayClient.createSubscription(
  plan.id,
  'customer-id',
  1 // quantity
);

console.log(`Subscription ID: ${subscription.id}`);
console.log(`Status: ${subscription.status}`);
console.log(`Next billing: ${subscription.nextBillingDate}`);

// Pause subscription
await razorpayClient.pauseSubscription(subscription.id);

// Resume subscription
await razorpayClient.resumeSubscription(subscription.id);

// Cancel subscription
await razorpayClient.cancelSubscription(subscription.id, true); // true = at cycle end
```

### Processing Webhooks

```typescript
// In your webhook endpoint
app.post('/webhooks/razorpay', async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  // Verify signature
  const isValid = razorpayClient.verifyWebhookSignature(
    JSON.stringify(req.body),
    signature,
    webhookSecret
  );

  if (!isValid) {
    return res.status(400).send('Invalid signature');
  }

  // Process webhook
  await razorpayClient.processWebhook(req.body);

  res.status(200).send('OK');
});
```

---

## Market Data

Real-time market data and price updates.

### Getting Quotes

```typescript
import { marketDataManager } from './lib/market/market-data';

// Get single quote
const quote = await marketDataManager.getQuote('RELIANCE', 'NSE');

if (quote) {
  console.log(`${quote.symbol}: ₹${quote.ltp}`);
  console.log(`Change: ${quote.changePercent.toFixed(2)}%`);
  console.log(`Volume: ${quote.volume.toLocaleString()}`);
}

// Get multiple quotes
const quotes = await marketDataManager.getBatchQuotes([
  { symbol: 'RELIANCE', exchange: 'NSE' },
  { symbol: 'TCS', exchange: 'NSE' },
  { symbol: 'INFY', exchange: 'NSE' },
]);
```

### Real-time Subscriptions

```typescript
// Subscribe to real-time updates
const unsubscribe = marketDataManager.subscribe(
  'RELIANCE',
  'NSE',
  (quote) => {
    console.log(`Updated price: ₹${quote.ltp}`);
  }
);

// Later, unsubscribe
unsubscribe();
```

### Trading Session

```typescript
// Check if market is open
const isOpen = marketDataManager.isMarketOpen();

// Get detailed session info
const session = marketDataManager.getTradingSession();

console.log(`Session Type: ${session.sessionType}`);
console.log(`Is Open: ${session.isOpen}`);

if (session.nextSessionStart) {
  console.log(`Next session starts: ${session.nextSessionStart}`);
}
```

### Portfolio Price Updates

```typescript
// Update all portfolio prices for a user
await marketDataManager.updatePortfolioPrices('user-id');
```

---

## Error Handling

All APIs include proper error handling:

```typescript
try {
  const result = await orderManager.processOrder(order);

  if (result.status === 'REJECTED') {
    console.error(`Order rejected: ${result.message}`);
  } else {
    console.log(`Order successful: ${result.orderId}`);
  }
} catch (error) {
  console.error('Error processing order:', error.message);
}
```

## Performance Considerations

- Order processing targets sub-250ms latency
- Market data cached for 1 second to reduce API calls
- Batch operations where possible
- Real-time subscriptions use efficient polling (1s intervals)
- Database queries optimized with proper indexes

## Best Practices

1. **Always check risk before placing orders**
2. **Use proper error handling and logging**
3. **Implement retry logic for network failures**
4. **Monitor latency and performance metrics**
5. **Keep API credentials secure (encrypted in database)**
6. **Use webhooks for payment processing**
7. **Update portfolio prices regularly**
8. **Implement proper session management**
9. **Test in sandbox before production**
10. **Monitor risk metrics in real-time**
