/**
 * IIFL Blaze API Client
 * Ultra-low latency trading client for IIFL broker integration
 */

import axios, { AxiosInstance, AxiosError } from 'axios';

// =====================================================
// TYPE DEFINITIONS
// =====================================================

export interface IIFLCredentials {
  apiKey: string;
  apiSecret: string;
  vendorCode?: string;
}

export interface IIFLAuthResponse {
  token: string;
  userId: string;
  expiresAt: number;
}

export interface IIFLOrderRequest {
  exchange: 'NSE' | 'BSE' | 'NFO' | 'MCX';
  symbol: string;
  side: 'BUY' | 'SELL';
  orderType: 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';
  quantity: number;
  price?: number;
  triggerPrice?: number;
  productType: 'INTRADAY' | 'DELIVERY' | 'MARGIN';
  validity: 'DAY' | 'IOC';
  disclosedQuantity?: number;
}

export interface IIFLOrderResponse {
  orderId: string;
  status: 'PENDING' | 'SUBMITTED' | 'FILLED' | 'REJECTED' | 'CANCELLED';
  message: string;
  exchangeOrderId?: string;
  timestamp: number;
}

export interface IIFLPosition {
  symbol: string;
  exchange: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  pnl: number;
  unrealizedPnl: number;
}

export interface IIFLBalance {
  availableBalance: number;
  usedMargin: number;
  totalBalance: number;
  collateral: number;
}

// =====================================================
// IIFL API CLIENT
// =====================================================

export class IIFLClient {
  private apiClient: AxiosInstance;
  private credentials: IIFLCredentials;
  private authToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private baseURL: string;

  constructor(credentials: IIFLCredentials, isProduction: boolean = false) {
    this.credentials = credentials;
    this.baseURL = isProduction
      ? 'https://api.iiflblaze.com/v1'
      : 'https://api-sandbox.iiflblaze.com/v1';

    this.apiClient = axios.create({
      baseURL: this.baseURL,
      timeout: 5000, // 5 second timeout for ultra-low latency
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    // Request interceptor to add auth token
    this.apiClient.interceptors.request.use(
      async (config) => {
        await this.ensureAuthenticated();
        if (this.authToken) {
          config.headers.Authorization = `Bearer ${this.authToken}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor for error handling
    this.apiClient.interceptors.response.use(
      (response) => response,
      this.handleError.bind(this)
    );
  }

  // =====================================================
  // AUTHENTICATION
  // =====================================================

  /**
   * Authenticate with IIFL API
   */
  async authenticate(): Promise<IIFLAuthResponse> {
    try {
      const response = await axios.post(`${this.baseURL}/auth/login`, {
        apiKey: this.credentials.apiKey,
        apiSecret: this.credentials.apiSecret,
        vendorCode: this.credentials.vendorCode,
      });

      this.authToken = response.data.token;
      this.tokenExpiresAt = Date.now() + (response.data.expiresIn * 1000);

      return {
        token: response.data.token,
        userId: response.data.userId,
        expiresAt: this.tokenExpiresAt,
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Ensure valid authentication before API calls
   */
  private async ensureAuthenticated(): Promise<void> {
    const now = Date.now();
    const bufferTime = 5 * 60 * 1000; // 5 minutes buffer

    if (!this.authToken || now >= this.tokenExpiresAt - bufferTime) {
      await this.authenticate();
    }
  }

  /**
   * Logout and clear auth token
   */
  async logout(): Promise<void> {
    try {
      await this.apiClient.post('/auth/logout');
      this.authToken = null;
      this.tokenExpiresAt = 0;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // =====================================================
  // ORDER MANAGEMENT
  // =====================================================

  /**
   * Place a new order
   */
  async placeOrder(orderRequest: IIFLOrderRequest): Promise<IIFLOrderResponse> {
    try {
      const startTime = performance.now();

      const response = await this.apiClient.post('/orders', orderRequest);

      const latency = performance.now() - startTime;
      console.log(`Order placement latency: ${latency.toFixed(2)}ms`);

      return {
        orderId: response.data.orderId,
        status: response.data.status,
        message: response.data.message,
        exchangeOrderId: response.data.exchangeOrderId,
        timestamp: Date.now(),
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Modify an existing order
   */
  async modifyOrder(
    orderId: string,
    modifications: Partial<IIFLOrderRequest>
  ): Promise<IIFLOrderResponse> {
    try {
      const response = await this.apiClient.put(`/orders/${orderId}`, modifications);

      return {
        orderId: response.data.orderId,
        status: response.data.status,
        message: response.data.message,
        timestamp: Date.now(),
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Cancel an order
   */
  async cancelOrder(orderId: string): Promise<IIFLOrderResponse> {
    try {
      const response = await this.apiClient.delete(`/orders/${orderId}`);

      return {
        orderId: response.data.orderId,
        status: 'CANCELLED',
        message: response.data.message,
        timestamp: Date.now(),
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get order status
   */
  async getOrderStatus(orderId: string): Promise<IIFLOrderResponse> {
    try {
      const response = await this.apiClient.get(`/orders/${orderId}`);

      return {
        orderId: response.data.orderId,
        status: response.data.status,
        message: response.data.message,
        exchangeOrderId: response.data.exchangeOrderId,
        timestamp: Date.now(),
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get all orders for the day
   */
  async getOrders(): Promise<IIFLOrderResponse[]> {
    try {
      const response = await this.apiClient.get('/orders');
      return response.data.orders || [];
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // =====================================================
  // POSITION MANAGEMENT
  // =====================================================

  /**
   * Get current positions
   */
  async getPositions(): Promise<IIFLPosition[]> {
    try {
      const response = await this.apiClient.get('/positions');
      return response.data.positions || [];
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Square off a position
   */
  async squareOffPosition(symbol: string, exchange: string): Promise<IIFLOrderResponse> {
    try {
      const response = await this.apiClient.post('/positions/square-off', {
        symbol,
        exchange,
      });

      return {
        orderId: response.data.orderId,
        status: response.data.status,
        message: 'Position squared off successfully',
        timestamp: Date.now(),
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Square off all positions
   */
  async squareOffAll(): Promise<void> {
    try {
      await this.apiClient.post('/positions/square-off-all');
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // =====================================================
  // ACCOUNT INFORMATION
  // =====================================================

  /**
   * Get account balance
   */
  async getBalance(): Promise<IIFLBalance> {
    try {
      const response = await this.apiClient.get('/account/balance');

      return {
        availableBalance: response.data.availableBalance,
        usedMargin: response.data.usedMargin,
        totalBalance: response.data.totalBalance,
        collateral: response.data.collateral,
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // =====================================================
  // MARKET DATA
  // =====================================================

  /**
   * Get live market quote
   */
  async getQuote(symbol: string, exchange: string): Promise<{
    symbol: string;
    ltp: number;
    change: number;
    changePercent: number;
    volume: number;
    timestamp: number;
  }> {
    try {
      const response = await this.apiClient.get('/market/quote', {
        params: { symbol, exchange },
      });

      return {
        symbol: response.data.symbol,
        ltp: response.data.lastTradedPrice,
        change: response.data.change,
        changePercent: response.data.changePercent,
        volume: response.data.volume,
        timestamp: Date.now(),
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // =====================================================
  // CONNECTION TESTING
  // =====================================================

  /**
   * Test API connection
   */
  async testConnection(): Promise<{ success: boolean; latency: number; message: string }> {
    try {
      const startTime = performance.now();
      await this.apiClient.get('/ping');
      const latency = performance.now() - startTime;

      return {
        success: true,
        latency,
        message: `Connected successfully. Latency: ${latency.toFixed(2)}ms`,
      };
    } catch (error) {
      return {
        success: false,
        latency: -1,
        message: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  // =====================================================
  // ERROR HANDLING
  // =====================================================

  private handleError(error: any): Error {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;

      if (axiosError.response) {
        // Server responded with error
        const status = axiosError.response.status;
        const data = axiosError.response.data as any;

        switch (status) {
          case 401:
            this.authToken = null;
            return new Error('Authentication failed. Please check your API credentials.');
          case 403:
            return new Error('Access forbidden. Insufficient permissions.');
          case 429:
            return new Error('Rate limit exceeded. Please try again later.');
          case 500:
            return new Error('IIFL server error. Please try again later.');
          default:
            return new Error(data?.message || `API error: ${status}`);
        }
      } else if (axiosError.request) {
        // Request made but no response
        return new Error('No response from IIFL server. Please check your connection.');
      }
    }

    return error instanceof Error ? error : new Error('Unknown error occurred');
  }
}

// =====================================================
// FACTORY FUNCTIONS
// =====================================================

/**
 * Create IIFL client from encrypted credentials
 */
export async function createIIFLClient(
  encryptedCredentials: { apiKey: string; apiSecret: string; vendorCode?: string },
  isProduction: boolean = false
): Promise<IIFLClient> {
  // In production, decrypt the credentials
  // For now, we'll use them as-is
  const credentials: IIFLCredentials = {
    apiKey: encryptedCredentials.apiKey,
    apiSecret: encryptedCredentials.apiSecret,
    vendorCode: encryptedCredentials.vendorCode,
  };

  const client = new IIFLClient(credentials, isProduction);
  await client.authenticate();

  return client;
}

/**
 * Create mock IIFL client for testing
 */
export function createMockIIFLClient(): IIFLClient {
  return new IIFLClient(
    {
      apiKey: 'mock-api-key',
      apiSecret: 'mock-api-secret',
    },
    false
  );
}
