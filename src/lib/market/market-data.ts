/**
 * Market Data Integration
 * Real-time market data feed and price updates
 */

import { IIFLClient } from '../api/iifl-client';
import { supabase } from '../supabase';

// =====================================================
// TYPE DEFINITIONS
// =====================================================

export interface MarketQuote {
  symbol: string;
  exchange: string;
  ltp: number; // Last Traded Price
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number;
  changePercent: number;
  timestamp: number;
}

export interface MarketDepth {
  symbol: string;
  bids: Array<{ price: number; quantity: number; orders: number }>;
  asks: Array<{ price: number; quantity: number; orders: number }>;
  timestamp: number;
}

export interface TradingSession {
  isOpen: boolean;
  sessionType: 'pre-market' | 'regular' | 'post-market' | 'closed';
  nextSessionStart?: Date;
  nextSessionEnd?: Date;
}

// =====================================================
// MARKET DATA MANAGER
// =====================================================

export class MarketDataManager {
  private iiflClient: IIFLClient | null = null;
  private subscriptions: Map<string, Set<(quote: MarketQuote) => void>> = new Map();
  private priceCache: Map<string, MarketQuote> = new Map();
  private updateInterval: NodeJS.Timeout | null = null;

  constructor(iiflClient?: IIFLClient) {
    this.iiflClient = iiflClient || null;
  }

  /**
   * Set IIFL client for market data
   */
  setIIFLClient(client: IIFLClient): void {
    this.iiflClient = client;
  }

  // =====================================================
  // REAL-TIME QUOTES
  // =====================================================

  /**
   * Get real-time quote for a symbol
   */
  async getQuote(symbol: string, exchange: string = 'NSE'): Promise<MarketQuote | null> {
    try {
      // Check cache first
      const cacheKey = `${exchange}:${symbol}`;
      const cached = this.priceCache.get(cacheKey);

      if (cached && Date.now() - cached.timestamp < 1000) {
        // Return cached if less than 1 second old
        return cached;
      }

      // Fetch from IIFL if available
      if (this.iiflClient) {
        const data = await this.iiflClient.getQuote(symbol, exchange);

        const quote: MarketQuote = {
          symbol,
          exchange,
          ltp: data.ltp,
          open: data.ltp, // Simplified, should get actual data
          high: data.ltp,
          low: data.ltp,
          close: data.ltp,
          volume: data.volume,
          change: data.change,
          changePercent: data.changePercent,
          timestamp: data.timestamp,
        };

        this.priceCache.set(cacheKey, quote);
        return quote;
      }

      // Mock data for development
      return this.getMockQuote(symbol, exchange);
    } catch (error) {
      console.error('Failed to fetch quote:', error);
      return null;
    }
  }

  /**
   * Subscribe to real-time price updates
   */
  subscribe(
    symbol: string,
    exchange: string,
    callback: (quote: MarketQuote) => void
  ): () => void {
    const key = `${exchange}:${symbol}`;

    if (!this.subscriptions.has(key)) {
      this.subscriptions.set(key, new Set());
    }

    this.subscriptions.get(key)!.add(callback);

    // Start update loop if not already running
    if (!this.updateInterval) {
      this.startUpdateLoop();
    }

    // Return unsubscribe function
    return () => {
      const callbacks = this.subscriptions.get(key);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.subscriptions.delete(key);
        }
      }

      // Stop update loop if no more subscriptions
      if (this.subscriptions.size === 0 && this.updateInterval) {
        clearInterval(this.updateInterval);
        this.updateInterval = null;
      }
    };
  }

  /**
   * Start real-time update loop
   */
  private startUpdateLoop(): void {
    this.updateInterval = setInterval(async () => {
      for (const [key, callbacks] of this.subscriptions.entries()) {
        const [exchange, symbol] = key.split(':');
        const quote = await this.getQuote(symbol, exchange);

        if (quote) {
          callbacks.forEach((callback) => {
            try {
              callback(quote);
            } catch (error) {
              console.error('Error in quote callback:', error);
            }
          });
        }
      }
    }, 1000); // Update every second
  }

  /**
   * Batch fetch quotes for multiple symbols
   */
  async getBatchQuotes(
    symbols: Array<{ symbol: string; exchange: string }>
  ): Promise<MarketQuote[]> {
    const promises = symbols.map((s) => this.getQuote(s.symbol, s.exchange));
    const results = await Promise.allSettled(promises);

    return results
      .filter((r) => r.status === 'fulfilled' && r.value !== null)
      .map((r) => (r as PromiseFulfilledResult<MarketQuote>).value);
  }

  // =====================================================
  // TRADING SESSION
  // =====================================================

  /**
   * Get current trading session status
   */
  getTradingSession(): TradingSession {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const currentTime = hours * 60 + minutes;

    // NSE timings (IST)
    const preMarketStart = 9 * 60; // 09:00
    const preMarketEnd = 9 * 60 + 15; // 09:15
    const regularStart = 9 * 60 + 15; // 09:15
    const regularEnd = 15 * 60 + 30; // 15:30
    const postMarketStart = 15 * 60 + 40; // 15:40
    const postMarketEnd = 16 * 60; // 16:00

    if (currentTime >= preMarketStart && currentTime < preMarketEnd) {
      return {
        isOpen: true,
        sessionType: 'pre-market',
        nextSessionStart: this.getNextSessionTime(regularStart),
        nextSessionEnd: this.getNextSessionTime(regularEnd),
      };
    } else if (currentTime >= regularStart && currentTime < regularEnd) {
      return {
        isOpen: true,
        sessionType: 'regular',
        nextSessionStart: this.getNextSessionTime(postMarketStart),
        nextSessionEnd: this.getNextSessionTime(regularEnd),
      };
    } else if (currentTime >= postMarketStart && currentTime < postMarketEnd) {
      return {
        isOpen: true,
        sessionType: 'post-market',
        nextSessionStart: this.getTomorrowSessionTime(preMarketStart),
        nextSessionEnd: this.getNextSessionTime(postMarketEnd),
      };
    } else {
      return {
        isOpen: false,
        sessionType: 'closed',
        nextSessionStart: currentTime < preMarketStart
          ? this.getNextSessionTime(preMarketStart)
          : this.getTomorrowSessionTime(preMarketStart),
      };
    }
  }

  /**
   * Check if market is open for trading
   */
  isMarketOpen(): boolean {
    const session = this.getTradingSession();
    return session.isOpen && session.sessionType === 'regular';
  }

  // =====================================================
  // PORTFOLIO PRICE UPDATES
  // =====================================================

  /**
   * Update portfolio prices for a user
   */
  async updatePortfolioPrices(userId: string): Promise<void> {
    try {
      // Get user's positions
      const { data: positions } = await supabase
        .from('portfolios')
        .select('*')
        .eq('user_id', userId)
        .gt('quantity', 0);

      if (!positions || positions.length === 0) {
        return;
      }

      // Fetch current prices
      const symbols = positions.map((p) => ({ symbol: p.symbol, exchange: 'NSE' }));
      const quotes = await this.getBatchQuotes(symbols);

      // Update each position
      const updates = positions.map(async (position) => {
        const quote = quotes.find((q) => q.symbol === position.symbol);

        if (!quote) return;

        const currentPrice = quote.ltp;
        const unrealizedPnL = (currentPrice - position.average_price) * position.quantity;

        await supabase
          .from('portfolios')
          .update({
            current_price: currentPrice,
            unrealized_pnl: unrealizedPnL,
            last_updated_at: new Date().toISOString(),
          })
          .eq('id', position.id);
      });

      await Promise.all(updates);

      // Update account balance
      const totalUnrealizedPnL = positions.reduce((sum, p) => {
        const quote = quotes.find((q) => q.symbol === p.symbol);
        if (!quote) return sum;
        return sum + (quote.ltp - p.average_price) * p.quantity;
      }, 0);

      await supabase
        .from('account_balances')
        .update({
          unrealized_pnl: totalUnrealizedPnL,
          total_pnl: totalUnrealizedPnL, // Will be updated with realized P&L separately
          last_synced_at: new Date().toISOString(),
        })
        .eq('user_id', userId);
    } catch (error) {
      console.error('Failed to update portfolio prices:', error);
    }
  }

  // =====================================================
  // HELPER METHODS
  // =====================================================

  private getNextSessionTime(minutesFromMidnight: number): Date {
    const date = new Date();
    date.setHours(Math.floor(minutesFromMidnight / 60));
    date.setMinutes(minutesFromMidnight % 60);
    date.setSeconds(0);
    date.setMilliseconds(0);
    return date;
  }

  private getTomorrowSessionTime(minutesFromMidnight: number): Date {
    const date = this.getNextSessionTime(minutesFromMidnight);
    date.setDate(date.getDate() + 1);
    return date;
  }

  private getMockQuote(symbol: string, exchange: string): MarketQuote {
    // Generate mock data for development
    const basePrice = 1000 + Math.random() * 1000;
    const change = (Math.random() - 0.5) * 50;

    return {
      symbol,
      exchange,
      ltp: basePrice,
      open: basePrice - change,
      high: basePrice + Math.abs(change),
      low: basePrice - Math.abs(change),
      close: basePrice - change,
      volume: Math.floor(Math.random() * 1000000),
      change,
      changePercent: (change / basePrice) * 100,
      timestamp: Date.now(),
    };
  }

  // =====================================================
  // CLEANUP
  // =====================================================

  /**
   * Stop all subscriptions and cleanup
   */
  cleanup(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    this.subscriptions.clear();
    this.priceCache.clear();
  }
}

// =====================================================
// SINGLETON INSTANCE
// =====================================================

export const marketDataManager = new MarketDataManager();
