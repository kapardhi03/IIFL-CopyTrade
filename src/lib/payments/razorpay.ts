/**
 * Razorpay Payment Integration
 * Subscription management and payment processing for Indian market
 */

import { supabase } from '../supabase';

// =====================================================
// TYPE DEFINITIONS
// =====================================================

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  amount: number; // in paise (1 INR = 100 paise)
  currency: 'INR';
  period: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
}

export interface PaymentOrder {
  orderId: string;
  amount: number;
  currency: string;
  receipt: string;
  status: string;
}

export interface Subscription {
  id: string;
  planId: string;
  customerId: string;
  status: 'created' | 'authenticated' | 'active' | 'paused' | 'cancelled' | 'expired';
  currentStart: Date;
  currentEnd: Date;
  nextBillingDate: Date;
}

export interface Payment {
  id: string;
  orderId: string;
  amount: number;
  currency: string;
  status: 'created' | 'authorized' | 'captured' | 'failed' | 'refunded';
  method: string;
  email: string;
  contact: string;
  createdAt: Date;
}

// =====================================================
// RAZORPAY CLIENT CLASS
// =====================================================

export class RazorpayClient {
  private config: RazorpayConfig;
  private baseURL: string = 'https://api.razorpay.com/v1';

  constructor(config: RazorpayConfig) {
    this.config = config;
  }

  /**
   * Create basic auth header
   */
  private getAuthHeader(): string {
    const credentials = `${this.config.keyId}:${this.config.keySecret}`;
    return `Basic ${btoa(credentials)}`;
  }

  /**
   * Make API request to Razorpay
   */
  private async makeRequest(
    endpoint: string,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
    body?: any
  ): Promise<any> {
    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.getAuthHeader(),
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.description || 'Razorpay API error');
      }

      return await response.json();
    } catch (error) {
      console.error('Razorpay API error:', error);
      throw error;
    }
  }

  // =====================================================
  // ORDER MANAGEMENT
  // =====================================================

  /**
   * Create a payment order
   */
  async createOrder(amount: number, currency: string = 'INR', receipt?: string): Promise<PaymentOrder> {
    const data = await this.makeRequest('/orders', 'POST', {
      amount: amount * 100, // Convert to paise
      currency,
      receipt: receipt || `order_${Date.now()}`,
    });

    return {
      orderId: data.id,
      amount: data.amount / 100, // Convert back to rupees
      currency: data.currency,
      receipt: data.receipt,
      status: data.status,
    };
  }

  /**
   * Fetch order details
   */
  async getOrder(orderId: string): Promise<PaymentOrder> {
    const data = await this.makeRequest(`/orders/${orderId}`);

    return {
      orderId: data.id,
      amount: data.amount / 100,
      currency: data.currency,
      receipt: data.receipt,
      status: data.status,
    };
  }

  // =====================================================
  // PAYMENT MANAGEMENT
  // =====================================================

  /**
   * Capture a payment
   */
  async capturePayment(paymentId: string, amount: number, currency: string = 'INR'): Promise<Payment> {
    const data = await this.makeRequest(`/payments/${paymentId}/capture`, 'POST', {
      amount: amount * 100,
      currency,
    });

    return this.formatPayment(data);
  }

  /**
   * Get payment details
   */
  async getPayment(paymentId: string): Promise<Payment> {
    const data = await this.makeRequest(`/payments/${paymentId}`);
    return this.formatPayment(data);
  }

  /**
   * Refund a payment
   */
  async refundPayment(paymentId: string, amount?: number): Promise<any> {
    const body: any = {};
    if (amount) {
      body.amount = amount * 100; // Convert to paise
    }

    return await this.makeRequest(`/payments/${paymentId}/refund`, 'POST', body);
  }

  // =====================================================
  // SUBSCRIPTION MANAGEMENT
  // =====================================================

  /**
   * Create a subscription plan
   */
  async createPlan(plan: Omit<SubscriptionPlan, 'id'>): Promise<SubscriptionPlan> {
    const data = await this.makeRequest('/plans', 'POST', {
      period: plan.period,
      interval: plan.interval,
      item: {
        name: plan.name,
        description: plan.description,
        amount: plan.amount,
        currency: plan.currency,
      },
    });

    return {
      id: data.id,
      name: data.item.name,
      description: data.item.description,
      amount: data.item.amount,
      currency: data.item.currency,
      period: data.period,
      interval: data.interval,
    };
  }

  /**
   * Create a subscription
   */
  async createSubscription(
    planId: string,
    customerId: string,
    quantity: number = 1,
    totalCount?: number
  ): Promise<Subscription> {
    const data = await this.makeRequest('/subscriptions', 'POST', {
      plan_id: planId,
      customer_id: customerId,
      quantity,
      total_count: totalCount,
      customer_notify: 1,
    });

    return this.formatSubscription(data);
  }

  /**
   * Get subscription details
   */
  async getSubscription(subscriptionId: string): Promise<Subscription> {
    const data = await this.makeRequest(`/subscriptions/${subscriptionId}`);
    return this.formatSubscription(data);
  }

  /**
   * Cancel a subscription
   */
  async cancelSubscription(subscriptionId: string, cancelAtCycleEnd: boolean = false): Promise<Subscription> {
    const data = await this.makeRequest(`/subscriptions/${subscriptionId}/cancel`, 'POST', {
      cancel_at_cycle_end: cancelAtCycleEnd ? 1 : 0,
    });

    return this.formatSubscription(data);
  }

  /**
   * Pause a subscription
   */
  async pauseSubscription(subscriptionId: string): Promise<Subscription> {
    const data = await this.makeRequest(`/subscriptions/${subscriptionId}/pause`, 'POST', {
      pause_at: 'now',
    });

    return this.formatSubscription(data);
  }

  /**
   * Resume a subscription
   */
  async resumeSubscription(subscriptionId: string): Promise<Subscription> {
    const data = await this.makeRequest(`/subscriptions/${subscriptionId}/resume`, 'POST', {
      resume_at: 'now',
    });

    return this.formatSubscription(data);
  }

  // =====================================================
  // WEBHOOK HANDLING
  // =====================================================

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(
    webhookBody: string,
    webhookSignature: string,
    webhookSecret: string
  ): boolean {
    // In a real implementation, use crypto to verify signature
    // const expectedSignature = crypto
    //   .createHmac('sha256', webhookSecret)
    //   .update(webhookBody)
    //   .digest('hex');
    // return expectedSignature === webhookSignature;

    // For now, placeholder
    return true;
  }

  /**
   * Process webhook event
   */
  async processWebhook(event: any): Promise<void> {
    switch (event.event) {
      case 'payment.captured':
        await this.handlePaymentCaptured(event.payload.payment.entity);
        break;

      case 'payment.failed':
        await this.handlePaymentFailed(event.payload.payment.entity);
        break;

      case 'subscription.activated':
        await this.handleSubscriptionActivated(event.payload.subscription.entity);
        break;

      case 'subscription.charged':
        await this.handleSubscriptionCharged(event.payload.subscription.entity, event.payload.payment.entity);
        break;

      case 'subscription.cancelled':
        await this.handleSubscriptionCancelled(event.payload.subscription.entity);
        break;

      case 'subscription.paused':
        await this.handleSubscriptionPaused(event.payload.subscription.entity);
        break;

      case 'subscription.resumed':
        await this.handleSubscriptionResumed(event.payload.subscription.entity);
        break;

      default:
        console.log('Unhandled webhook event:', event.event);
    }
  }

  // =====================================================
  // WEBHOOK EVENT HANDLERS
  // =====================================================

  private async handlePaymentCaptured(payment: any): Promise<void> {
    // Update database with successful payment
    console.log('Payment captured:', payment.id);

    // TODO: Update user's subscription status, add credits, etc.
  }

  private async handlePaymentFailed(payment: any): Promise<void> {
    // Handle failed payment
    console.log('Payment failed:', payment.id);

    // TODO: Send notification to user, retry logic, etc.
  }

  private async handleSubscriptionActivated(subscription: any): Promise<void> {
    // Activate user's subscription
    console.log('Subscription activated:', subscription.id);

    // TODO: Grant access to features, update database, etc.
  }

  private async handleSubscriptionCharged(subscription: any, payment: any): Promise<void> {
    // Process recurring subscription charge
    console.log('Subscription charged:', subscription.id, payment.id);

    // TODO: Extend subscription period, update database, etc.
  }

  private async handleSubscriptionCancelled(subscription: any): Promise<void> {
    // Handle subscription cancellation
    console.log('Subscription cancelled:', subscription.id);

    // TODO: Revoke access at end of billing period, update database, etc.
  }

  private async handleSubscriptionPaused(subscription: any): Promise<void> {
    // Handle subscription pause
    console.log('Subscription paused:', subscription.id);

    // TODO: Temporarily revoke access, update database, etc.
  }

  private async handleSubscriptionResumed(subscription: any): Promise<void> {
    // Handle subscription resume
    console.log('Subscription resumed:', subscription.id);

    // TODO: Restore access, update database, etc.
  }

  // =====================================================
  // HELPER METHODS
  // =====================================================

  private formatPayment(data: any): Payment {
    return {
      id: data.id,
      orderId: data.order_id,
      amount: data.amount / 100,
      currency: data.currency,
      status: data.status,
      method: data.method,
      email: data.email,
      contact: data.contact,
      createdAt: new Date(data.created_at * 1000),
    };
  }

  private formatSubscription(data: any): Subscription {
    return {
      id: data.id,
      planId: data.plan_id,
      customerId: data.customer_id,
      status: data.status,
      currentStart: new Date(data.current_start * 1000),
      currentEnd: new Date(data.current_end * 1000),
      nextBillingDate: new Date(data.charge_at * 1000),
    };
  }
}

// =====================================================
// SUBSCRIPTION PLANS (Predefined)
// =====================================================

export const SUBSCRIPTION_PLANS = {
  FOLLOWER_MONTHLY: {
    name: 'Follower - Monthly',
    description: 'Monthly subscription for followers',
    amount: 29900, // ₹299 in paise
    currency: 'INR' as const,
    period: 'monthly' as const,
    interval: 1,
  },
  FOLLOWER_YEARLY: {
    name: 'Follower - Yearly',
    description: 'Yearly subscription for followers (Save 20%)',
    amount: 287040, // ₹2870.40 in paise (₹299 * 12 * 0.8)
    currency: 'INR' as const,
    period: 'yearly' as const,
    interval: 1,
  },
  MASTER_MONTHLY: {
    name: 'Master Trader - Monthly',
    description: 'Monthly subscription for master traders',
    amount: 99900, // ₹999 in paise
    currency: 'INR' as const,
    period: 'monthly' as const,
    interval: 1,
  },
  MASTER_YEARLY: {
    name: 'Master Trader - Yearly',
    description: 'Yearly subscription for master traders (Save 20%)',
    amount: 959040, // ₹9590.40 in paise (₹999 * 12 * 0.8)
    currency: 'INR' as const,
    period: 'yearly' as const,
    interval: 1,
  },
};

// =====================================================
// FACTORY FUNCTION
// =====================================================

/**
 * Create Razorpay client from environment variables
 */
export function createRazorpayClient(): RazorpayClient {
  const keyId = import.meta.env.VITE_RAZORPAY_KEY_ID;
  const keySecret = import.meta.env.VITE_RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    console.warn('Razorpay credentials not found. Payment processing will not work.');
  }

  return new RazorpayClient({ keyId: keyId || '', keySecret: keySecret || '' });
}

// =====================================================
// SINGLETON INSTANCE
// =====================================================

export const razorpayClient = createRazorpayClient();
