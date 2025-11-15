import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase credentials not found. Using mock authentication. ' +
    'Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

// Database types - Complete schema
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          name: string;
          role: 'master' | 'follower';
          phone: string | null;
          is_email_verified: boolean;
          is_kyc_verified: boolean;
          has_2fa_enabled: boolean;
          onboarding_completed: boolean;
          avatar_url: string | null;
          bio: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
      };
      user_kyc: {
        Row: {
          id: string;
          user_id: string;
          document_type: 'pan' | 'aadhaar' | 'passport' | 'driving_license';
          document_number: string;
          document_url: string;
          verification_status: 'pending' | 'approved' | 'rejected';
          rejection_reason: string | null;
          verified_at: string | null;
          verified_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['user_kyc']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['user_kyc']['Insert']>;
      };
      user_api_configs: {
        Row: {
          id: string;
          user_id: string;
          broker_name: string;
          api_key_encrypted: string;
          api_secret_encrypted: string;
          vendor_code: string | null;
          is_active: boolean;
          last_connected_at: string | null;
          connection_status: 'connected' | 'disconnected' | 'error';
          error_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['user_api_configs']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['user_api_configs']['Insert']>;
      };
      audit_logs: {
        Row: {
          id: string;
          user_id: string;
          action: string;
          details: Json;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['audit_logs']['Row'], 'id' | 'created_at'>;
        Update: never;
      };
      strategies: {
        Row: {
          id: string;
          master_id: string;
          name: string;
          description: string | null;
          is_active: boolean;
          is_public: boolean;
          total_subscribers: number;
          min_capital_required: number;
          max_subscribers: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['strategies']['Row'], 'id' | 'total_subscribers' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['strategies']['Insert']>;
      };
      strategy_parameters: {
        Row: {
          id: string;
          strategy_id: string;
          stop_loss_percentage: number | null;
          take_profit_percentage: number | null;
          max_drawdown_percentage: number | null;
          max_positions: number | null;
          position_size_type: 'fixed' | 'percentage' | 'risk_based';
          default_position_size: number | null;
          allow_overnight_positions: boolean;
          trading_hours_start: string | null;
          trading_hours_end: string | null;
          allowed_instruments: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['strategy_parameters']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['strategy_parameters']['Insert']>;
      };
      strategy_performance: {
        Row: {
          id: string;
          strategy_id: string;
          date: string;
          total_trades: number;
          winning_trades: number;
          losing_trades: number;
          total_pnl: number;
          total_volume: number;
          max_drawdown: number;
          sharpe_ratio: number | null;
          win_rate: number | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['strategy_performance']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['strategy_performance']['Insert']>;
      };
      strategy_subscriptions: {
        Row: {
          id: string;
          strategy_id: string;
          follower_id: string;
          scaling_factor: number;
          is_active: boolean;
          subscribed_at: string;
          unsubscribed_at: string | null;
          total_pnl: number;
          total_trades: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['strategy_subscriptions']['Row'], 'id' | 'total_pnl' | 'total_trades' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['strategy_subscriptions']['Insert']>;
      };
      orders: {
        Row: {
          id: string;
          user_id: string;
          strategy_id: string | null;
          parent_order_id: string | null;
          order_type: 'market' | 'limit' | 'stop_loss' | 'stop_loss_market';
          side: 'buy' | 'sell';
          symbol: string;
          quantity: number;
          price: number | null;
          trigger_price: number | null;
          status: 'pending' | 'submitted' | 'filled' | 'partially_filled' | 'cancelled' | 'rejected' | 'expired';
          filled_quantity: number;
          average_price: number | null;
          broker_order_id: string | null;
          rejection_reason: string | null;
          submitted_at: string | null;
          filled_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['orders']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['orders']['Insert']>;
      };
      trades: {
        Row: {
          id: string;
          order_id: string;
          user_id: string;
          strategy_id: string | null;
          symbol: string;
          side: 'buy' | 'sell';
          quantity: number;
          price: number;
          total_value: number;
          commission: number;
          tax: number;
          broker_trade_id: string | null;
          executed_at: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['trades']['Row'], 'id' | 'created_at'>;
        Update: never;
      };
      portfolios: {
        Row: {
          id: string;
          user_id: string;
          strategy_id: string | null;
          symbol: string;
          quantity: number;
          average_price: number;
          current_price: number | null;
          unrealized_pnl: number;
          realized_pnl: number;
          last_updated_at: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['portfolios']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['portfolios']['Insert']>;
      };
      account_balances: {
        Row: {
          id: string;
          user_id: string;
          total_balance: number;
          available_balance: number;
          used_margin: number;
          unrealized_pnl: number;
          realized_pnl: number;
          total_pnl: number;
          last_synced_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['account_balances']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['account_balances']['Insert']>;
      };
      master_followers: {
        Row: {
          id: string;
          master_id: string;
          follower_id: string;
          status: 'active' | 'paused' | 'terminated';
          followed_at: string;
          unfollowed_at: string | null;
          total_pnl: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['master_followers']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['master_followers']['Insert']>;
      };
      copy_configurations: {
        Row: {
          id: string;
          master_follower_id: string;
          strategy_id: string | null;
          scaling_factor: number;
          max_position_size: number | null;
          copy_stop_loss: boolean;
          copy_take_profit: boolean;
          auto_square_off: boolean;
          square_off_time: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['copy_configurations']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['copy_configurations']['Insert']>;
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          type: 'order_filled' | 'order_rejected' | 'strategy_update' | 'follower_added' | 'system' | 'alert';
          title: string;
          message: string;
          data: Json;
          is_read: boolean;
          read_at: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['notifications']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['notifications']['Insert']>;
      };
    };
    Functions: {
      copy_master_order_to_followers: {
        Args: { master_order_id: string };
        Returns: number;
      };
      calculate_strategy_performance: {
        Args: { p_strategy_id: string; p_date?: string };
        Returns: void;
      };
      get_user_total_pnl: {
        Args: { p_user_id: string };
        Returns: { realized_pnl: number; unrealized_pnl: number; total_pnl: number }[];
      };
      get_strategy_active_subscribers: {
        Args: { p_strategy_id: string };
        Returns: number;
      };
    };
  };
}
