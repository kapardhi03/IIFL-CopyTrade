import { z } from 'zod';
import type { Database } from './supabase';

// =====================================================
// SHARED VALIDATION SCHEMAS
// =====================================================

export const emailSchema = z.string().email('Please enter a valid email address');
export const phoneSchema = z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Please enter a valid phone number');
export const passwordSchema = z.string().min(8, 'Password must be at least 8 characters');

// =====================================================
// USER VALIDATION SCHEMAS
// =====================================================

export const profileUpdateSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').optional(),
  phone: phoneSchema.optional(),
  bio: z.string().max(500, 'Bio must be less than 500 characters').optional(),
});

export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

// =====================================================
// STRATEGY VALIDATION SCHEMAS
// =====================================================

export const strategyCreateSchema = z.object({
  name: z.string().min(3, 'Strategy name must be at least 3 characters').max(100),
  description: z.string().max(1000, 'Description must be less than 1000 characters').optional(),
  is_public: z.boolean().default(false),
  min_capital_required: z.number().min(0, 'Minimum capital must be positive'),
  max_subscribers: z.number().int().positive().optional(),
});

export type StrategyCreate = z.infer<typeof strategyCreateSchema>;

export const strategyParametersSchema = z.object({
  stop_loss_percentage: z
    .number()
    .min(0.1, 'Stop loss must be at least 0.1%')
    .max(100, 'Stop loss cannot exceed 100%')
    .optional(),
  take_profit_percentage: z
    .number()
    .min(0.1, 'Take profit must be at least 0.1%')
    .max(1000, 'Take profit cannot exceed 1000%')
    .optional(),
  max_drawdown_percentage: z
    .number()
    .min(1, 'Max drawdown must be at least 1%')
    .max(100, 'Max drawdown cannot exceed 100%')
    .optional(),
  max_positions: z
    .number()
    .int()
    .min(1, 'Max positions must be at least 1')
    .max(100, 'Max positions cannot exceed 100')
    .optional(),
  position_size_type: z.enum(['fixed', 'percentage', 'risk_based']).default('fixed'),
  default_position_size: z.number().min(0, 'Position size must be positive').optional(),
  allow_overnight_positions: z.boolean().default(false),
});

export type StrategyParameters = z.infer<typeof strategyParametersSchema>;

// =====================================================
// ORDER VALIDATION SCHEMAS
// =====================================================

export const orderCreateSchema = z.object({
  order_type: z.enum(['market', 'limit', 'stop_loss', 'stop_loss_market']),
  side: z.enum(['buy', 'sell']),
  symbol: z.string().min(1, 'Symbol is required').max(20),
  quantity: z.number().int().positive('Quantity must be positive'),
  price: z.number().positive('Price must be positive').optional(),
  trigger_price: z.number().positive('Trigger price must be positive').optional(),
  strategy_id: z.string().uuid().optional(),
});

export type OrderCreate = z.infer<typeof orderCreateSchema>;

// Validate limit orders have a price
export const limitOrderSchema = orderCreateSchema.extend({
  order_type: z.literal('market'),
  price: z.number().positive('Price is required for limit orders'),
});

// Validate stop loss orders have a trigger price
export const stopLossOrderSchema = orderCreateSchema.extend({
  order_type: z.enum(['stop_loss', 'stop_loss_market']),
  trigger_price: z.number().positive('Trigger price is required for stop loss orders'),
});

// =====================================================
// SUBSCRIPTION VALIDATION SCHEMAS
// =====================================================

export const strategySubscriptionSchema = z.object({
  strategy_id: z.string().uuid('Invalid strategy ID'),
  scaling_factor: z
    .number()
    .min(0.1, 'Scaling factor must be at least 0.1x')
    .max(2.0, 'Scaling factor cannot exceed 2.0x')
    .default(1.0),
});

export type StrategySubscription = z.infer<typeof strategySubscriptionSchema>;

// =====================================================
// COPY CONFIGURATION VALIDATION SCHEMAS
// =====================================================

export const copyConfigurationSchema = z.object({
  scaling_factor: z
    .number()
    .min(0.1, 'Scaling factor must be at least 0.1x')
    .max(2.0, 'Scaling factor cannot exceed 2.0x')
    .default(1.0),
  max_position_size: z.number().positive('Max position size must be positive').optional(),
  copy_stop_loss: z.boolean().default(true),
  copy_take_profit: z.boolean().default(true),
  auto_square_off: z.boolean().default(false),
  square_off_time: z.string().optional(),
});

export type CopyConfiguration = z.infer<typeof copyConfigurationSchema>;

// =====================================================
// KYC VALIDATION SCHEMAS
// =====================================================

export const kycDocumentSchema = z.object({
  document_type: z.enum(['pan', 'aadhaar', 'passport', 'driving_license']),
  document_number: z.string().min(5, 'Document number is required'),
});

export type KYCDocument = z.infer<typeof kycDocumentSchema>;

// PAN card validation
export const panSchema = z.object({
  document_type: z.literal('pan'),
  document_number: z
    .string()
    .regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Invalid PAN number format'),
});

// Aadhaar validation
export const aadhaarSchema = z.object({
  document_type: z.literal('aadhaar'),
  document_number: z
    .string()
    .regex(/^[0-9]{12}$/, 'Aadhaar number must be 12 digits'),
});

// =====================================================
// API CONFIGURATION VALIDATION SCHEMAS
// =====================================================

export const apiConfigSchema = z.object({
  broker_name: z.string().default('iifl_blaze'),
  api_key: z.string().min(10, 'API key is required'),
  api_secret: z.string().min(10, 'API secret is required'),
  vendor_code: z.string().optional(),
});

export type APIConfig = z.infer<typeof apiConfigSchema>;

// =====================================================
// BUSINESS RULE VALIDATORS
// =====================================================

/**
 * Validate if user has sufficient balance for order
 */
export function validateSufficientBalance(
  availableBalance: number,
  orderValue: number
): { valid: boolean; error?: string } {
  if (orderValue > availableBalance) {
    return {
      valid: false,
      error: `Insufficient balance. Available: ₹${availableBalance.toFixed(2)}, Required: ₹${orderValue.toFixed(2)}`,
    };
  }
  return { valid: true };
}

/**
 * Validate if strategy can accept more subscribers
 */
export function validateStrategyCapacity(
  currentSubscribers: number,
  maxSubscribers: number | null
): { valid: boolean; error?: string } {
  if (maxSubscribers !== null && currentSubscribers >= maxSubscribers) {
    return {
      valid: false,
      error: `Strategy has reached maximum capacity (${maxSubscribers} subscribers)`,
    };
  }
  return { valid: true };
}

/**
 * Validate if user meets minimum capital requirement
 */
export function validateMinimumCapital(
  userBalance: number,
  minRequired: number
): { valid: boolean; error?: string } {
  if (userBalance < minRequired) {
    return {
      valid: false,
      error: `Minimum capital required: ₹${minRequired.toFixed(2)}, Your balance: ₹${userBalance.toFixed(2)}`,
    };
  }
  return { valid: true };
}

/**
 * Validate order quantity constraints
 */
export function validateOrderQuantity(
  quantity: number,
  minQty: number = 1,
  maxQty: number = 10000
): { valid: boolean; error?: string } {
  if (quantity < minQty) {
    return {
      valid: false,
      error: `Minimum order quantity is ${minQty}`,
    };
  }
  if (quantity > maxQty) {
    return {
      valid: false,
      error: `Maximum order quantity is ${maxQty}`,
    };
  }
  return { valid: true };
}

/**
 * Validate scaling factor calculation
 */
export function calculateScaledQuantity(
  masterQuantity: number,
  scalingFactor: number
): number {
  const scaled = Math.round(masterQuantity * scalingFactor);
  return Math.max(1, scaled); // Ensure at least 1 quantity
}

/**
 * Validate trading hours
 */
export function validateTradingHours(
  currentTime: Date = new Date(),
  startTime: string = '09:15',
  endTime: string = '15:30'
): { valid: boolean; error?: string } {
  const current = currentTime.getHours() * 60 + currentTime.getMinutes();
  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);
  const start = startHour * 60 + startMin;
  const end = endHour * 60 + endMin;

  if (current < start || current > end) {
    return {
      valid: false,
      error: `Trading is only allowed between ${startTime} and ${endTime}`,
    };
  }
  return { valid: true };
}

/**
 * Validate symbol format
 */
export function validateSymbol(symbol: string): { valid: boolean; error?: string } {
  // Basic symbol validation for Indian stock market
  const symbolRegex = /^[A-Z0-9&-]+$/;
  if (!symbolRegex.test(symbol)) {
    return {
      valid: false,
      error: 'Invalid symbol format. Only uppercase letters, numbers, and hyphens are allowed.',
    };
  }
  return { valid: true };
}

// =====================================================
// UTILITY VALIDATORS
// =====================================================

/**
 * Validate UUID format
 */
export function validateUUID(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

/**
 * Sanitize string input
 */
export function sanitizeString(input: string, maxLength: number = 255): string {
  return input.trim().slice(0, maxLength);
}

/**
 * Validate percentage value
 */
export function validatePercentage(value: number): { valid: boolean; error?: string } {
  if (value < 0 || value > 100) {
    return {
      valid: false,
      error: 'Percentage must be between 0 and 100',
    };
  }
  return { valid: true };
}
