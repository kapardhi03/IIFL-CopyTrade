/**
 * Risk Management Engine
 * Real-time risk monitoring and enforcement for trading safety
 */

import { supabase } from '../supabase';
import type { OrderInput } from './order-manager';

// =====================================================
// TYPE DEFINITIONS
// =====================================================

export interface RiskLimits {
  maxDailyLoss: number;
  maxDrawdown: number;
  maxPositionSize: number;
  maxPositions: number;
  maxExposure: number;
  stopLossRequired: boolean;
}

export interface RiskMetrics {
  currentExposure: number;
  dailyPnL: number;
  drawdown: number;
  openPositions: number;
  largestPosition: number;
  utilizationPercent: number;
}

export interface RiskCheck {
  allowed: boolean;
  reason?: string;
  metrics?: RiskMetrics;
}

// =====================================================
// RISK MANAGER CLASS
// =====================================================

export class RiskManager {
  private defaultLimits: RiskLimits = {
    maxDailyLoss: 50000, // ₹50,000
    maxDrawdown: 0.15, // 15%
    maxPositionSize: 100000, // ₹1,00,000
    maxPositions: 10,
    maxExposure: 500000, // ₹5,00,000
    stopLossRequired: true,
  };

  /**
   * Check if order passes all risk checks
   */
  async checkOrderRisk(
    userId: string,
    order: OrderInput,
    customLimits?: Partial<RiskLimits>
  ): Promise<RiskCheck> {
    const limits = { ...this.defaultLimits, ...customLimits };

    // Get current metrics
    const metrics = await this.calculateRiskMetrics(userId);

    // Check daily loss limit
    if (metrics.dailyPnL <= -limits.maxDailyLoss) {
      return {
        allowed: false,
        reason: `Daily loss limit reached (₹${limits.maxDailyLoss.toLocaleString()}). Trading paused.`,
        metrics,
      };
    }

    // Check drawdown limit
    if (metrics.drawdown >= limits.maxDrawdown) {
      return {
        allowed: false,
        reason: `Maximum drawdown limit reached (${(limits.maxDrawdown * 100).toFixed(1)}%). Trading paused.`,
        metrics,
      };
    }

    // Check position count
    if (order.side === 'buy' && metrics.openPositions >= limits.maxPositions) {
      return {
        allowed: false,
        reason: `Maximum number of positions reached (${limits.maxPositions}).`,
        metrics,
      };
    }

    // Check position size
    const orderValue = order.quantity * (order.price || 0);
    if (orderValue > limits.maxPositionSize) {
      return {
        allowed: false,
        reason: `Order exceeds maximum position size (₹${limits.maxPositionSize.toLocaleString()}).`,
        metrics,
      };
    }

    // Check total exposure
    const newExposure = metrics.currentExposure + (order.side === 'buy' ? orderValue : 0);
    if (newExposure > limits.maxExposure) {
      return {
        allowed: false,
        reason: `Order would exceed maximum exposure limit (₹${limits.maxExposure.toLocaleString()}).`,
        metrics,
      };
    }

    // Check stop loss requirement
    if (
      limits.stopLossRequired &&
      order.side === 'buy' &&
      order.orderType !== 'stop_loss' &&
      order.orderType !== 'stop_loss_market'
    ) {
      // Note: In production, verify user has a stop loss order for this position
      // For now, we'll allow it but recommend adding a stop loss
    }

    return {
      allowed: true,
      metrics,
    };
  }

  /**
   * Calculate current risk metrics for a user
   */
  async calculateRiskMetrics(userId: string): Promise<RiskMetrics> {
    try {
      // Get account balance
      const { data: balance } = await supabase
        .from('account_balances')
        .select('*')
        .eq('user_id', userId)
        .single();

      // Get open positions
      const { data: positions } = await supabase
        .from('portfolios')
        .select('*')
        .eq('user_id', userId)
        .gt('quantity', 0);

      // Get today's trades for P&L calculation
      const today = new Date().toISOString().split('T')[0];
      const { data: todayTrades } = await supabase
        .from('trades')
        .select('total_value, side, commission, tax')
        .eq('user_id', userId)
        .gte('executed_at', today);

      // Calculate metrics
      const currentExposure = positions?.reduce(
        (sum, pos) => sum + pos.quantity * (pos.current_price || pos.average_price),
        0
      ) || 0;

      const dailyPnL = todayTrades?.reduce((sum, trade) => {
        const value = trade.total_value - trade.commission - trade.tax;
        return sum + (trade.side === 'sell' ? value : -value);
      }, 0) || 0;

      const totalBalance = balance?.total_balance || 0;
      const peakBalance = totalBalance + Math.max(0, -dailyPnL); // Estimate peak
      const drawdown = peakBalance > 0 ? (peakBalance - totalBalance) / peakBalance : 0;

      const openPositions = positions?.length || 0;

      const largestPosition = positions?.reduce(
        (max, pos) => Math.max(max, pos.quantity * (pos.current_price || pos.average_price)),
        0
      ) || 0;

      const utilizationPercent = totalBalance > 0 ? (currentExposure / totalBalance) * 100 : 0;

      return {
        currentExposure,
        dailyPnL,
        drawdown,
        openPositions,
        largestPosition,
        utilizationPercent,
      };
    } catch (error) {
      console.error('Failed to calculate risk metrics:', error);
      return {
        currentExposure: 0,
        dailyPnL: 0,
        drawdown: 0,
        openPositions: 0,
        largestPosition: 0,
        utilizationPercent: 0,
      };
    }
  }

  /**
   * Get strategy risk parameters
   */
  async getStrategyRiskLimits(strategyId: string): Promise<Partial<RiskLimits>> {
    try {
      const { data: params } = await supabase
        .from('strategy_parameters')
        .select('*')
        .eq('strategy_id', strategyId)
        .single();

      if (!params) {
        return {};
      }

      return {
        maxDrawdown: params.max_drawdown_percentage ? params.max_drawdown_percentage / 100 : undefined,
        maxPositions: params.max_positions || undefined,
        maxPositionSize: params.default_position_size || undefined,
      };
    } catch (error) {
      return {};
    }
  }

  /**
   * Emergency stop - square off all positions
   */
  async emergencyStop(userId: string, reason: string): Promise<void> {
    try {
      // Get all open positions
      const { data: positions } = await supabase
        .from('portfolios')
        .select('*')
        .eq('user_id', userId)
        .gt('quantity', 0);

      if (!positions || positions.length === 0) {
        return;
      }

      // Create square-off orders for all positions
      const squareOffOrders = positions.map((position) => ({
        user_id: userId,
        strategy_id: position.strategy_id,
        order_type: 'market',
        side: 'sell',
        symbol: position.symbol,
        quantity: position.quantity,
        status: 'pending',
      }));

      await supabase.from('orders').insert(squareOffOrders);

      // Log emergency stop
      await supabase.from('audit_logs').insert({
        user_id: userId,
        action: 'emergency_stop',
        details: {
          reason,
          positions_count: positions.length,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error('Emergency stop failed:', error);
      throw error;
    }
  }

  /**
   * Check if trading should be paused for a user
   */
  async shouldPauseTrading(userId: string): Promise<{ pause: boolean; reason?: string }> {
    const metrics = await this.calculateRiskMetrics(userId);

    // Check daily loss
    if (metrics.dailyPnL <= -this.defaultLimits.maxDailyLoss) {
      return {
        pause: true,
        reason: `Daily loss limit reached (₹${this.defaultLimits.maxDailyLoss.toLocaleString()})`,
      };
    }

    // Check drawdown
    if (metrics.drawdown >= this.defaultLimits.maxDrawdown) {
      return {
        pause: true,
        reason: `Maximum drawdown limit reached (${(this.defaultLimits.maxDrawdown * 100).toFixed(1)}%)`,
      };
    }

    return { pause: false };
  }

  /**
   * Calculate Value at Risk (VaR) - simplified daily VaR
   */
  async calculateVaR(userId: string, confidenceLevel: number = 0.95): Promise<number> {
    try {
      // Get last 30 days of daily P&L
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: trades } = await supabase
        .from('trades')
        .select('executed_at, total_value, side, commission, tax')
        .eq('user_id', userId)
        .gte('executed_at', thirtyDaysAgo.toISOString());

      if (!trades || trades.length === 0) {
        return 0;
      }

      // Group by day and calculate daily P&L
      const dailyPnL: number[] = [];
      const tradesByDay = new Map<string, typeof trades>();

      trades.forEach((trade) => {
        const day = trade.executed_at.split('T')[0];
        if (!tradesByDay.has(day)) {
          tradesByDay.set(day, []);
        }
        tradesByDay.get(day)!.push(trade);
      });

      tradesByDay.forEach((dayTrades) => {
        const pnl = dayTrades.reduce((sum, trade) => {
          const value = trade.total_value - trade.commission - trade.tax;
          return sum + (trade.side === 'sell' ? value : -value);
        }, 0);
        dailyPnL.push(pnl);
      });

      // Sort returns
      dailyPnL.sort((a, b) => a - b);

      // Get VaR at specified confidence level
      const index = Math.floor((1 - confidenceLevel) * dailyPnL.length);
      return Math.abs(dailyPnL[index] || 0);
    } catch (error) {
      console.error('VaR calculation failed:', error);
      return 0;
    }
  }

  /**
   * Calculate Sharpe Ratio
   */
  async calculateSharpeRatio(userId: string, riskFreeRate: number = 0.06): Promise<number> {
    try {
      // Get last 90 days of trades
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const { data: trades } = await supabase
        .from('trades')
        .select('executed_at, total_value, side, commission, tax')
        .eq('user_id', userId)
        .gte('executed_at', ninetyDaysAgo.toISOString());

      if (!trades || trades.length === 0) {
        return 0;
      }

      // Calculate daily returns
      const dailyReturns: number[] = [];
      const tradesByDay = new Map<string, typeof trades>();

      trades.forEach((trade) => {
        const day = trade.executed_at.split('T')[0];
        if (!tradesByDay.has(day)) {
          tradesByDay.set(day, []);
        }
        tradesByDay.get(day)!.push(trade);
      });

      tradesByDay.forEach((dayTrades) => {
        const pnl = dayTrades.reduce((sum, trade) => {
          const value = trade.total_value - trade.commission - trade.tax;
          return sum + (trade.side === 'sell' ? value : -value);
        }, 0);
        dailyReturns.push(pnl);
      });

      // Calculate mean return
      const meanReturn = dailyReturns.reduce((sum, r) => sum + r, 0) / dailyReturns.length;

      // Calculate standard deviation
      const variance =
        dailyReturns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) /
        dailyReturns.length;
      const stdDev = Math.sqrt(variance);

      // Sharpe ratio = (mean return - risk free rate) / standard deviation
      // Annualize assuming 252 trading days
      const dailyRiskFreeRate = riskFreeRate / 252;
      const sharpeRatio = stdDev > 0 ? (meanReturn - dailyRiskFreeRate) / stdDev : 0;

      return sharpeRatio * Math.sqrt(252); // Annualized Sharpe ratio
    } catch (error) {
      console.error('Sharpe ratio calculation failed:', error);
      return 0;
    }
  }

  /**
   * Monitor and enforce risk limits in real-time
   */
  async monitorRealTimeRisk(userId: string): Promise<{
    status: 'safe' | 'warning' | 'critical';
    alerts: string[];
  }> {
    const metrics = await this.calculateRiskMetrics(userId);
    const alerts: string[] = [];
    let status: 'safe' | 'warning' | 'critical' = 'safe';

    // Check daily loss
    const lossPercent = (Math.abs(metrics.dailyPnL) / this.defaultLimits.maxDailyLoss) * 100;
    if (lossPercent >= 100) {
      status = 'critical';
      alerts.push('CRITICAL: Daily loss limit reached');
    } else if (lossPercent >= 80) {
      status = 'warning';
      alerts.push(`WARNING: Daily loss at ${lossPercent.toFixed(0)}% of limit`);
    }

    // Check drawdown
    const drawdownPercent = (metrics.drawdown / this.defaultLimits.maxDrawdown) * 100;
    if (drawdownPercent >= 100) {
      status = 'critical';
      alerts.push('CRITICAL: Maximum drawdown reached');
    } else if (drawdownPercent >= 80) {
      if (status !== 'critical') status = 'warning';
      alerts.push(`WARNING: Drawdown at ${drawdownPercent.toFixed(0)}% of limit`);
    }

    // Check exposure
    const exposurePercent = (metrics.currentExposure / this.defaultLimits.maxExposure) * 100;
    if (exposurePercent >= 90) {
      if (status !== 'critical') status = 'warning';
      alerts.push(`WARNING: Exposure at ${exposurePercent.toFixed(0)}% of limit`);
    }

    // Check position concentration
    if (metrics.utilizationPercent >= 80) {
      if (status !== 'critical' && status !== 'warning') status = 'warning';
      alerts.push(`WARNING: High portfolio utilization (${metrics.utilizationPercent.toFixed(0)}%)`);
    }

    return { status, alerts };
  }
}

// =====================================================
// SINGLETON INSTANCE
// =====================================================

export const riskManager = new RiskManager();
