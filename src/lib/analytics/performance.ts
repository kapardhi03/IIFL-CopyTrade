/**
 * Performance Analytics Engine
 * Real-time P&L calculation and performance metrics
 */

import { supabase } from '../supabase';

// =====================================================
// TYPE DEFINITIONS
// =====================================================

export interface PerformanceMetrics {
  totalPnL: number;
  realizedPnL: number;
  unrealizedPnL: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  averageWin: number;
  averageLoss: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: number;
  returnPercent: number;
}

export interface DailyPerformance {
  date: string;
  pnl: number;
  trades: number;
  volume: number;
  winRate: number;
}

export interface StrategyPerformance extends PerformanceMetrics {
  strategyId: string;
  strategyName: string;
  totalSubscribers: number;
  activeSubscribers: number;
}

// =====================================================
// PERFORMANCE ANALYTICS CLASS
// =====================================================

export class PerformanceAnalytics {
  /**
   * Calculate real-time P&L for a user
   */
  async calculateUserPnL(userId: string): Promise<{
    realized: number;
    unrealized: number;
    total: number;
  }> {
    try {
      // Get from database function
      const { data, error } = await supabase.rpc('get_user_total_pnl', {
        p_user_id: userId,
      });

      if (error || !data || data.length === 0) {
        return { realized: 0, unrealized: 0, total: 0 };
      }

      const pnl = data[0];
      return {
        realized: pnl.realized_pnl || 0,
        unrealized: pnl.unrealized_pnl || 0,
        total: pnl.total_pnl || 0,
      };
    } catch (error) {
      console.error('Failed to calculate user P&L:', error);
      return { realized: 0, unrealized: 0, total: 0 };
    }
  }

  /**
   * Calculate comprehensive performance metrics
   */
  async calculatePerformanceMetrics(
    userId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<PerformanceMetrics> {
    try {
      const start = startDate || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days ago
      const end = endDate || new Date();

      // Get trades in date range
      const { data: trades } = await supabase
        .from('trades')
        .select('*')
        .eq('user_id', userId)
        .gte('executed_at', start.toISOString())
        .lte('executed_at', end.toISOString())
        .order('executed_at', { ascending: true });

      if (!trades || trades.length === 0) {
        return this.getEmptyMetrics();
      }

      // Calculate P&L per trade
      const tradePnLs = this.calculateTradePnLs(trades);

      // Get current P&L
      const pnl = await this.calculateUserPnL(userId);

      // Calculate metrics
      const totalTrades = tradePnLs.length;
      const winningTrades = tradePnLs.filter((p) => p > 0).length;
      const losingTrades = tradePnLs.filter((p) => p < 0).length;
      const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

      const totalWins = tradePnLs.filter((p) => p > 0).reduce((sum, p) => sum + p, 0);
      const totalLosses = Math.abs(tradePnLs.filter((p) => p < 0).reduce((sum, p) => sum + p, 0));

      const averageWin = winningTrades > 0 ? totalWins / winningTrades : 0;
      const averageLoss = losingTrades > 0 ? totalLosses / losingTrades : 0;

      const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0;

      // Calculate max drawdown
      const maxDrawdown = this.calculateMaxDrawdown(tradePnLs);

      // Calculate Sharpe ratio
      const sharpeRatio = this.calculateSharpe(tradePnLs);

      // Calculate return percentage
      const { data: balance } = await supabase
        .from('account_balances')
        .select('total_balance')
        .eq('user_id', userId)
        .single();

      const initialBalance = (balance?.total_balance || 0) - pnl.total;
      const returnPercent = initialBalance > 0 ? (pnl.total / initialBalance) * 100 : 0;

      return {
        totalPnL: pnl.total,
        realizedPnL: pnl.realized,
        unrealizedPnL: pnl.unrealized,
        totalTrades,
        winningTrades,
        losingTrades,
        winRate,
        averageWin,
        averageLoss,
        profitFactor,
        sharpeRatio,
        maxDrawdown,
        returnPercent,
      };
    } catch (error) {
      console.error('Failed to calculate performance metrics:', error);
      return this.getEmptyMetrics();
    }
  }

  /**
   * Get daily performance data
   */
  async getDailyPerformance(
    userId: string,
    days: number = 30
  ): Promise<DailyPerformance[]> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data: trades } = await supabase
        .from('trades')
        .select('executed_at, total_value, side, commission, tax')
        .eq('user_id', userId)
        .gte('executed_at', startDate.toISOString())
        .order('executed_at', { ascending: true });

      if (!trades || trades.length === 0) {
        return [];
      }

      // Group by date
      const byDate = new Map<string, typeof trades>();
      trades.forEach((trade) => {
        const date = trade.executed_at.split('T')[0];
        if (!byDate.has(date)) {
          byDate.set(date, []);
        }
        byDate.get(date)!.push(trade);
      });

      // Calculate daily metrics
      const dailyPerf: DailyPerformance[] = [];

      byDate.forEach((dayTrades, date) => {
        const pnl = dayTrades.reduce((sum, trade) => {
          const value = trade.total_value - trade.commission - trade.tax;
          return sum + (trade.side === 'sell' ? value : -value);
        }, 0);

        const volume = dayTrades.reduce((sum, trade) => sum + trade.total_value, 0);

        // Calculate day's P&L per trade
        const tradePairs = this.pairBuySellTrades(dayTrades);
        const winningTrades = tradePairs.filter((p) => p > 0).length;
        const winRate = tradePairs.length > 0 ? (winningTrades / tradePairs.length) * 100 : 0;

        dailyPerf.push({
          date,
          pnl,
          trades: dayTrades.length,
          volume,
          winRate,
        });
      });

      return dailyPerf;
    } catch (error) {
      console.error('Failed to get daily performance:', error);
      return [];
    }
  }

  /**
   * Get strategy performance metrics
   */
  async getStrategyPerformance(strategyId: string): Promise<StrategyPerformance | null> {
    try {
      // Get strategy details
      const { data: strategy } = await supabase
        .from('strategies')
        .select('*, strategy_subscriptions(count)')
        .eq('id', strategyId)
        .single();

      if (!strategy) {
        return null;
      }

      // Get strategy owner's trades for this strategy
      const { data: trades } = await supabase
        .from('trades')
        .select('*')
        .eq('strategy_id', strategyId)
        .eq('user_id', strategy.master_id);

      if (!trades || trades.length === 0) {
        return {
          ...this.getEmptyMetrics(),
          strategyId,
          strategyName: strategy.name,
          totalSubscribers: strategy.total_subscribers,
          activeSubscribers: 0,
        };
      }

      // Calculate metrics
      const tradePnLs = this.calculateTradePnLs(trades);
      const metrics = await this.calculatePerformanceMetrics(strategy.master_id);

      // Get active subscribers
      const { count: activeSubscribers } = await supabase
        .from('strategy_subscriptions')
        .select('*', { count: 'exact', head: true })
        .eq('strategy_id', strategyId)
        .eq('is_active', true);

      return {
        ...metrics,
        strategyId,
        strategyName: strategy.name,
        totalSubscribers: strategy.total_subscribers,
        activeSubscribers: activeSubscribers || 0,
      };
    } catch (error) {
      console.error('Failed to get strategy performance:', error);
      return null;
    }
  }

  /**
   * Compare performance against benchmark
   */
  async compareWithBenchmark(
    userId: string,
    benchmarkReturns: number[] // Daily benchmark returns
  ): Promise<{
    alpha: number;
    beta: number;
    correlation: number;
  }> {
    try {
      // Get user's daily returns
      const dailyPerf = await this.getDailyPerformance(userId, benchmarkReturns.length);

      if (dailyPerf.length === 0) {
        return { alpha: 0, beta: 0, correlation: 0 };
      }

      const userReturns = dailyPerf.map((d) => d.pnl);

      // Ensure same length
      const minLength = Math.min(userReturns.length, benchmarkReturns.length);
      const userRet = userReturns.slice(-minLength);
      const benchRet = benchmarkReturns.slice(-minLength);

      // Calculate means
      const userMean = userRet.reduce((sum, r) => sum + r, 0) / userRet.length;
      const benchMean = benchRet.reduce((sum, r) => sum + r, 0) / benchRet.length;

      // Calculate covariance and variances
      let covariance = 0;
      let userVariance = 0;
      let benchVariance = 0;

      for (let i = 0; i < userRet.length; i++) {
        const userDiff = userRet[i] - userMean;
        const benchDiff = benchRet[i] - benchMean;

        covariance += userDiff * benchDiff;
        userVariance += userDiff * userDiff;
        benchVariance += benchDiff * benchDiff;
      }

      covariance /= userRet.length;
      userVariance /= userRet.length;
      benchVariance /= userRet.length;

      // Calculate beta
      const beta = benchVariance > 0 ? covariance / benchVariance : 0;

      // Calculate alpha
      const alpha = userMean - beta * benchMean;

      // Calculate correlation
      const correlation =
        Math.sqrt(userVariance) * Math.sqrt(benchVariance) > 0
          ? covariance / (Math.sqrt(userVariance) * Math.sqrt(benchVariance))
          : 0;

      return { alpha, beta, correlation };
    } catch (error) {
      console.error('Failed to compare with benchmark:', error);
      return { alpha: 0, beta: 0, correlation: 0 };
    }
  }

  // =====================================================
  // HELPER METHODS
  // =====================================================

  private calculateTradePnLs(trades: any[]): number[] {
    // Pair buy and sell trades to calculate P&L
    const positions = new Map<string, { buyPrice: number; quantity: number }>();
    const pnls: number[] = [];

    trades.forEach((trade) => {
      const key = trade.symbol;

      if (trade.side === 'buy') {
        if (positions.has(key)) {
          const pos = positions.get(key)!;
          positions.set(key, {
            buyPrice:
              (pos.buyPrice * pos.quantity + trade.price * trade.quantity) /
              (pos.quantity + trade.quantity),
            quantity: pos.quantity + trade.quantity,
          });
        } else {
          positions.set(key, { buyPrice: trade.price, quantity: trade.quantity });
        }
      } else {
        // sell
        if (positions.has(key)) {
          const pos = positions.get(key)!;
          const pnl = (trade.price - pos.buyPrice) * trade.quantity - trade.commission - trade.tax;
          pnls.push(pnl);

          if (pos.quantity > trade.quantity) {
            positions.set(key, { ...pos, quantity: pos.quantity - trade.quantity });
          } else {
            positions.delete(key);
          }
        }
      }
    });

    return pnls;
  }

  private pairBuySellTrades(trades: any[]): number[] {
    return this.calculateTradePnLs(trades);
  }

  private calculateMaxDrawdown(pnls: number[]): number {
    if (pnls.length === 0) return 0;

    let peak = 0;
    let maxDD = 0;
    let cumulative = 0;

    pnls.forEach((pnl) => {
      cumulative += pnl;
      peak = Math.max(peak, cumulative);
      const drawdown = peak - cumulative;
      maxDD = Math.max(maxDD, drawdown);
    });

    return maxDD;
  }

  private calculateSharpe(returns: number[], riskFreeRate: number = 0.06): number {
    if (returns.length === 0) return 0;

    const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance =
      returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    const dailyRiskFreeRate = riskFreeRate / 252;
    return stdDev > 0 ? ((meanReturn - dailyRiskFreeRate) / stdDev) * Math.sqrt(252) : 0;
  }

  private getEmptyMetrics(): PerformanceMetrics {
    return {
      totalPnL: 0,
      realizedPnL: 0,
      unrealizedPnL: 0,
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      averageWin: 0,
      averageLoss: 0,
      profitFactor: 0,
      sharpeRatio: 0,
      maxDrawdown: 0,
      returnPercent: 0,
    };
  }
}

// =====================================================
// SINGLETON INSTANCE
// =====================================================

export const performanceAnalytics = new PerformanceAnalytics();
