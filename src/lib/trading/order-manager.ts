/**
 * Order Management System
 * Handles order processing, validation, and execution with sub-250ms latency
 */

import { supabase } from '../supabase';
import { IIFLClient, type IIFLOrderRequest, type IIFLOrderResponse } from '../api/iifl-client';
import { validateOrderQuantity, validateSymbol, calculateScaledQuantity } from '../validation';
import { auditTrade } from '../auditLog';

// =====================================================
// TYPE DEFINITIONS
// =====================================================

export interface OrderInput {
  userId: string;
  strategyId?: string;
  orderType: 'market' | 'limit' | 'stop_loss' | 'stop_loss_market';
  side: 'buy' | 'sell';
  symbol: string;
  quantity: number;
  price?: number;
  triggerPrice?: number;
}

export interface ProcessedOrder {
  orderId: string;
  status: string;
  message: string;
  brokerOrderId?: string;
  executionTime: number;
}

export interface FollowerOrder extends OrderInput {
  followerId: string;
  masterOrderId: string;
  scalingFactor: number;
}

// =====================================================
// ORDER MANAGER CLASS
// =====================================================

export class OrderManager {
  private iiflClient: IIFLClient | null = null;

  constructor(iiflClient?: IIFLClient) {
    this.iiflClient = iiflClient || null;
  }

  /**
   * Set IIFL client for API communication
   */
  setIIFLClient(client: IIFLClient): void {
    this.iiflClient = client;
  }

  // =====================================================
  // ORDER VALIDATION
  // =====================================================

  /**
   * Validate order before processing
   */
  async validateOrder(order: OrderInput): Promise<{ valid: boolean; error?: string }> {
    // Validate symbol format
    const symbolValidation = validateSymbol(order.symbol);
    if (!symbolValidation.valid) {
      return symbolValidation;
    }

    // Validate quantity
    const quantityValidation = validateOrderQuantity(order.quantity);
    if (!quantityValidation.valid) {
      return quantityValidation;
    }

    // Validate price for limit orders
    if (order.orderType === 'limit' && (!order.price || order.price <= 0)) {
      return { valid: false, error: 'Limit orders require a valid price' };
    }

    // Validate trigger price for stop loss orders
    if (
      (order.orderType === 'stop_loss' || order.orderType === 'stop_loss_market') &&
      (!order.triggerPrice || order.triggerPrice <= 0)
    ) {
      return { valid: false, error: 'Stop loss orders require a valid trigger price' };
    }

    // Check user balance
    const balanceCheck = await this.validateUserBalance(order.userId, order);
    if (!balanceCheck.valid) {
      return balanceCheck;
    }

    return { valid: true };
  }

  /**
   * Validate user has sufficient balance
   */
  private async validateUserBalance(
    userId: string,
    order: OrderInput
  ): Promise<{ valid: boolean; error?: string }> {
    if (order.side === 'sell') {
      return { valid: true }; // No balance check for sell orders
    }

    try {
      const { data: balance } = await supabase
        .from('account_balances')
        .select('available_balance')
        .eq('user_id', userId)
        .single();

      if (!balance) {
        return { valid: false, error: 'Unable to fetch account balance' };
      }

      const orderValue = order.quantity * (order.price || 0);

      if (balance.available_balance < orderValue) {
        return {
          valid: false,
          error: `Insufficient balance. Available: ₹${balance.available_balance.toFixed(2)}, Required: ₹${orderValue.toFixed(2)}`,
        };
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, error: 'Error checking balance' };
    }
  }

  // =====================================================
  // ORDER PROCESSING
  // =====================================================

  /**
   * Process and execute an order
   */
  async processOrder(order: OrderInput): Promise<ProcessedOrder> {
    const startTime = performance.now();

    try {
      // Validate order
      const validation = await this.validateOrder(order);
      if (!validation.valid) {
        throw new Error(validation.error || 'Order validation failed');
      }

      // Create order record in database
      const { data: dbOrder, error: dbError } = await supabase
        .from('orders')
        .insert({
          user_id: order.userId,
          strategy_id: order.strategyId,
          order_type: order.orderType,
          side: order.side,
          symbol: order.symbol,
          quantity: order.quantity,
          price: order.price,
          trigger_price: order.triggerPrice,
          status: 'pending',
        })
        .select()
        .single();

      if (dbError || !dbOrder) {
        throw new Error('Failed to create order record');
      }

      // Execute order via IIFL if client is available
      let brokerResponse: IIFLOrderResponse | null = null;

      if (this.iiflClient) {
        const iiflOrder: IIFLOrderRequest = this.convertToIIFLOrder(order);
        brokerResponse = await this.iiflClient.placeOrder(iiflOrder);

        // Update order with broker details
        await supabase
          .from('orders')
          .update({
            status: brokerResponse.status.toLowerCase(),
            broker_order_id: brokerResponse.orderId,
            submitted_at: new Date().toISOString(),
          })
          .eq('id', dbOrder.id);
      } else {
        // Mock execution for development
        await supabase
          .from('orders')
          .update({
            status: 'submitted',
            submitted_at: new Date().toISOString(),
          })
          .eq('id', dbOrder.id);
      }

      const executionTime = performance.now() - startTime;

      // Copy order to followers if this is a master order
      if (order.strategyId) {
        await this.copyOrderToFollowers(dbOrder.id, order);
      }

      return {
        orderId: dbOrder.id,
        status: brokerResponse?.status || 'SUBMITTED',
        message: brokerResponse?.message || 'Order placed successfully',
        brokerOrderId: brokerResponse?.orderId,
        executionTime,
      };
    } catch (error) {
      const executionTime = performance.now() - startTime;

      return {
        orderId: '',
        status: 'REJECTED',
        message: error instanceof Error ? error.message : 'Order processing failed',
        executionTime,
      };
    }
  }

  /**
   * Convert order to IIFL format
   */
  private convertToIIFLOrder(order: OrderInput): IIFLOrderRequest {
    return {
      exchange: 'NSE', // Default to NSE, can be enhanced
      symbol: order.symbol,
      side: order.side.toUpperCase() as 'BUY' | 'SELL',
      orderType: this.mapOrderType(order.orderType),
      quantity: order.quantity,
      price: order.price,
      triggerPrice: order.triggerPrice,
      productType: 'INTRADAY',
      validity: 'DAY',
    };
  }

  /**
   * Map order type to IIFL format
   */
  private mapOrderType(type: string): 'MARKET' | 'LIMIT' | 'SL' | 'SL-M' {
    switch (type) {
      case 'market':
        return 'MARKET';
      case 'limit':
        return 'LIMIT';
      case 'stop_loss':
        return 'SL';
      case 'stop_loss_market':
        return 'SL-M';
      default:
        return 'MARKET';
    }
  }

  // =====================================================
  // FOLLOWER ORDER PROCESSING
  // =====================================================

  /**
   * Copy master order to all active followers
   */
  private async copyOrderToFollowers(masterOrderId: string, masterOrder: OrderInput): Promise<void> {
    try {
      // Get user role
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', masterOrder.userId)
        .single();

      if (!profile || profile.role !== 'master') {
        return; // Not a master order
      }

      // Get all active followers for this strategy
      const { data: subscriptions } = await supabase
        .from('strategy_subscriptions')
        .select('follower_id, scaling_factor')
        .eq('strategy_id', masterOrder.strategyId!)
        .eq('is_active', true);

      if (!subscriptions || subscriptions.length === 0) {
        return;
      }

      // Process each follower order concurrently
      const followerOrders = subscriptions.map((subscription) => {
        const scaledQuantity = calculateScaledQuantity(
          masterOrder.quantity,
          subscription.scaling_factor
        );

        const followerOrder: OrderInput = {
          ...masterOrder,
          userId: subscription.follower_id,
          quantity: scaledQuantity,
        };

        return this.processFollowerOrder(followerOrder, masterOrderId);
      });

      await Promise.allSettled(followerOrders);
    } catch (error) {
      console.error('Failed to copy orders to followers:', error);
    }
  }

  /**
   * Process a single follower order
   */
  private async processFollowerOrder(
    order: OrderInput,
    parentOrderId: string
  ): Promise<void> {
    try {
      // Create follower order with reference to parent
      const { data: dbOrder } = await supabase
        .from('orders')
        .insert({
          user_id: order.userId,
          strategy_id: order.strategyId,
          parent_order_id: parentOrderId,
          order_type: order.orderType,
          side: order.side,
          symbol: order.symbol,
          quantity: order.quantity,
          price: order.price,
          trigger_price: order.triggerPrice,
          status: 'pending',
        })
        .select()
        .single();

      if (dbOrder) {
        // Execute follower order asynchronously
        // In production, this would use the follower's IIFL client
        await supabase
          .from('orders')
          .update({ status: 'submitted', submitted_at: new Date().toISOString() })
          .eq('id', dbOrder.id);
      }
    } catch (error) {
      console.error('Failed to process follower order:', error);
    }
  }

  // =====================================================
  // ORDER MODIFICATIONS
  // =====================================================

  /**
   * Modify an existing order
   */
  async modifyOrder(
    orderId: string,
    modifications: Partial<OrderInput>
  ): Promise<ProcessedOrder> {
    const startTime = performance.now();

    try {
      // Get existing order
      const { data: existingOrder } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single();

      if (!existingOrder) {
        throw new Error('Order not found');
      }

      if (existingOrder.status !== 'pending' && existingOrder.status !== 'submitted') {
        throw new Error('Cannot modify order in current status');
      }

      // Update database
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          quantity: modifications.quantity,
          price: modifications.price,
          trigger_price: modifications.triggerPrice,
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderId);

      if (updateError) {
        throw new Error('Failed to update order');
      }

      // Modify via broker if available
      if (this.iiflClient && existingOrder.broker_order_id) {
        await this.iiflClient.modifyOrder(existingOrder.broker_order_id, modifications as any);
      }

      const executionTime = performance.now() - startTime;

      return {
        orderId,
        status: 'MODIFIED',
        message: 'Order modified successfully',
        executionTime,
      };
    } catch (error) {
      const executionTime = performance.now() - startTime;

      return {
        orderId,
        status: 'ERROR',
        message: error instanceof Error ? error.message : 'Modification failed',
        executionTime,
      };
    }
  }

  /**
   * Cancel an order
   */
  async cancelOrder(orderId: string): Promise<ProcessedOrder> {
    const startTime = performance.now();

    try {
      // Get existing order
      const { data: existingOrder } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single();

      if (!existingOrder) {
        throw new Error('Order not found');
      }

      // Cancel via broker if available
      if (this.iiflClient && existingOrder.broker_order_id) {
        await this.iiflClient.cancelOrder(existingOrder.broker_order_id);
      }

      // Update database
      await supabase
        .from('orders')
        .update({ status: 'cancelled' })
        .eq('id', orderId);

      const executionTime = performance.now() - startTime;

      return {
        orderId,
        status: 'CANCELLED',
        message: 'Order cancelled successfully',
        executionTime,
      };
    } catch (error) {
      const executionTime = performance.now() - startTime;

      return {
        orderId,
        status: 'ERROR',
        message: error instanceof Error ? error.message : 'Cancellation failed',
        executionTime,
      };
    }
  }

  // =====================================================
  // ORDER QUERIES
  // =====================================================

  /**
   * Get order by ID
   */
  async getOrder(orderId: string) {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (error) {
      throw new Error('Failed to fetch order');
    }

    return data;
  }

  /**
   * Get user's orders
   */
  async getUserOrders(userId: string, limit: number = 50) {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error('Failed to fetch orders');
    }

    return data || [];
  }

  /**
   * Get strategy orders
   */
  async getStrategyOrders(strategyId: string, limit: number = 50) {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('strategy_id', strategyId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error('Failed to fetch strategy orders');
    }

    return data || [];
  }
}

// =====================================================
// SINGLETON INSTANCE
// =====================================================

export const orderManager = new OrderManager();
