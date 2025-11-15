-- Replicon Database Schema
-- Migration: 001_initial_schema
-- Description: Complete database schema for Replicon copy-trading platform

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- USER MANAGEMENT TABLES
-- =====================================================

-- Profiles table (already defined in Phase 4, this is the complete version)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('master', 'follower')),
  phone TEXT,
  is_email_verified BOOLEAN DEFAULT FALSE,
  is_kyc_verified BOOLEAN DEFAULT FALSE,
  has_2fa_enabled BOOLEAN DEFAULT FALSE,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  avatar_url TEXT,
  bio TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User KYC documents
CREATE TABLE user_kyc (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('pan', 'aadhaar', 'passport', 'driving_license')),
  document_number TEXT NOT NULL,
  document_url TEXT NOT NULL,
  verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, document_type)
);

-- User API configurations (encrypted)
CREATE TABLE user_api_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  broker_name TEXT NOT NULL DEFAULT 'iifl_blaze',
  api_key_encrypted TEXT NOT NULL,
  api_secret_encrypted TEXT NOT NULL,
  vendor_code TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  last_connected_at TIMESTAMPTZ,
  connection_status TEXT DEFAULT 'disconnected' CHECK (connection_status IN ('connected', 'disconnected', 'error')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, broker_name)
);

-- Audit logs (already defined in Phase 4, enhanced version)
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- TRADING STRATEGY TABLES
-- =====================================================

-- Strategies
CREATE TABLE strategies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  master_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  is_public BOOLEAN DEFAULT FALSE,
  total_subscribers INTEGER DEFAULT 0,
  min_capital_required DECIMAL(15, 2) DEFAULT 0,
  max_subscribers INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_master_role CHECK (
    (SELECT role FROM profiles WHERE id = master_id) = 'master'
  )
);

-- Strategy parameters and risk settings
CREATE TABLE strategy_parameters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  stop_loss_percentage DECIMAL(5, 2),
  take_profit_percentage DECIMAL(5, 2),
  max_drawdown_percentage DECIMAL(5, 2),
  max_positions INTEGER,
  position_size_type TEXT DEFAULT 'fixed' CHECK (position_size_type IN ('fixed', 'percentage', 'risk_based')),
  default_position_size DECIMAL(15, 2),
  allow_overnight_positions BOOLEAN DEFAULT FALSE,
  trading_hours_start TIME,
  trading_hours_end TIME,
  allowed_instruments JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(strategy_id)
);

-- Strategy performance metrics
CREATE TABLE strategy_performance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  total_trades INTEGER DEFAULT 0,
  winning_trades INTEGER DEFAULT 0,
  losing_trades INTEGER DEFAULT 0,
  total_pnl DECIMAL(15, 2) DEFAULT 0,
  total_volume DECIMAL(15, 2) DEFAULT 0,
  max_drawdown DECIMAL(15, 2) DEFAULT 0,
  sharpe_ratio DECIMAL(10, 4),
  win_rate DECIMAL(5, 2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(strategy_id, date)
);

-- Strategy subscriptions (follower subscriptions)
CREATE TABLE strategy_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  follower_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  scaling_factor DECIMAL(5, 2) DEFAULT 1.0 CHECK (scaling_factor > 0),
  is_active BOOLEAN DEFAULT TRUE,
  subscribed_at TIMESTAMPTZ DEFAULT NOW(),
  unsubscribed_at TIMESTAMPTZ,
  total_pnl DECIMAL(15, 2) DEFAULT 0,
  total_trades INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(strategy_id, follower_id),
  CONSTRAINT valid_follower_role CHECK (
    (SELECT role FROM profiles WHERE id = follower_id) = 'follower'
  )
);

-- =====================================================
-- TRADING DATA TABLES
-- =====================================================

-- Orders
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  strategy_id UUID REFERENCES strategies(id) ON DELETE SET NULL,
  parent_order_id UUID REFERENCES orders(id), -- For copied orders
  order_type TEXT NOT NULL CHECK (order_type IN ('market', 'limit', 'stop_loss', 'stop_loss_market')),
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  symbol TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  price DECIMAL(15, 2),
  trigger_price DECIMAL(15, 2),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'filled', 'partially_filled', 'cancelled', 'rejected', 'expired')),
  filled_quantity INTEGER DEFAULT 0,
  average_price DECIMAL(15, 2),
  broker_order_id TEXT,
  rejection_reason TEXT,
  submitted_at TIMESTAMPTZ,
  filled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trades (executed positions)
CREATE TABLE trades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  strategy_id UUID REFERENCES strategies(id) ON DELETE SET NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  quantity INTEGER NOT NULL,
  price DECIMAL(15, 2) NOT NULL,
  total_value DECIMAL(15, 2) NOT NULL,
  commission DECIMAL(15, 2) DEFAULT 0,
  tax DECIMAL(15, 2) DEFAULT 0,
  broker_trade_id TEXT,
  executed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Portfolios (current positions)
CREATE TABLE portfolios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  strategy_id UUID REFERENCES strategies(id) ON DELETE SET NULL,
  symbol TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  average_price DECIMAL(15, 2) NOT NULL,
  current_price DECIMAL(15, 2),
  unrealized_pnl DECIMAL(15, 2) DEFAULT 0,
  realized_pnl DECIMAL(15, 2) DEFAULT 0,
  last_updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, strategy_id, symbol)
);

-- Account balances
CREATE TABLE account_balances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  total_balance DECIMAL(15, 2) DEFAULT 0,
  available_balance DECIMAL(15, 2) DEFAULT 0,
  used_margin DECIMAL(15, 2) DEFAULT 0,
  unrealized_pnl DECIMAL(15, 2) DEFAULT 0,
  realized_pnl DECIMAL(15, 2) DEFAULT 0,
  total_pnl DECIMAL(15, 2) DEFAULT 0,
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- =====================================================
-- RELATIONSHIP TABLES
-- =====================================================

-- Master-Follower relationships
CREATE TABLE master_followers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  master_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  follower_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'terminated')),
  followed_at TIMESTAMPTZ DEFAULT NOW(),
  unfollowed_at TIMESTAMPTZ,
  total_pnl DECIMAL(15, 2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(master_id, follower_id),
  CONSTRAINT different_users CHECK (master_id != follower_id),
  CONSTRAINT valid_roles CHECK (
    (SELECT role FROM profiles WHERE id = master_id) = 'master' AND
    (SELECT role FROM profiles WHERE id = follower_id) = 'follower'
  )
);

-- Copy configurations (follower-specific settings)
CREATE TABLE copy_configurations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  master_follower_id UUID NOT NULL REFERENCES master_followers(id) ON DELETE CASCADE,
  strategy_id UUID REFERENCES strategies(id) ON DELETE SET NULL,
  scaling_factor DECIMAL(5, 2) DEFAULT 1.0 CHECK (scaling_factor > 0 AND scaling_factor <= 2.0),
  max_position_size DECIMAL(15, 2),
  copy_stop_loss BOOLEAN DEFAULT TRUE,
  copy_take_profit BOOLEAN DEFAULT TRUE,
  auto_square_off BOOLEAN DEFAULT FALSE,
  square_off_time TIME,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(master_follower_id, strategy_id)
);

-- Notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('order_filled', 'order_rejected', 'strategy_update', 'follower_added', 'system', 'alert')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSONB DEFAULT '{}'::jsonb,
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- INDEXES FOR OPTIMIZATION
-- =====================================================

-- Profiles indexes
CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_email ON profiles(email);

-- Audit logs indexes
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- Strategies indexes
CREATE INDEX idx_strategies_master_id ON strategies(master_id);
CREATE INDEX idx_strategies_is_active ON strategies(is_active);
CREATE INDEX idx_strategies_is_public ON strategies(is_public);

-- Strategy subscriptions indexes
CREATE INDEX idx_strategy_subscriptions_strategy_id ON strategy_subscriptions(strategy_id);
CREATE INDEX idx_strategy_subscriptions_follower_id ON strategy_subscriptions(follower_id);
CREATE INDEX idx_strategy_subscriptions_active ON strategy_subscriptions(is_active);

-- Orders indexes
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_strategy_id ON orders(strategy_id);
CREATE INDEX idx_orders_parent_order_id ON orders(parent_order_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX idx_orders_symbol ON orders(symbol);

-- Trades indexes
CREATE INDEX idx_trades_user_id ON trades(user_id);
CREATE INDEX idx_trades_order_id ON trades(order_id);
CREATE INDEX idx_trades_strategy_id ON trades(strategy_id);
CREATE INDEX idx_trades_executed_at ON trades(executed_at DESC);

-- Portfolios indexes
CREATE INDEX idx_portfolios_user_id ON portfolios(user_id);
CREATE INDEX idx_portfolios_strategy_id ON portfolios(strategy_id);
CREATE INDEX idx_portfolios_symbol ON portfolios(symbol);

-- Notifications indexes
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Update updated_at timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to relevant tables
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_kyc_updated_at BEFORE UPDATE ON user_kyc
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_api_configs_updated_at BEFORE UPDATE ON user_api_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_strategies_updated_at BEFORE UPDATE ON strategies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_strategy_parameters_updated_at BEFORE UPDATE ON strategy_parameters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_strategy_subscriptions_updated_at BEFORE UPDATE ON strategy_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_account_balances_updated_at BEFORE UPDATE ON account_balances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_master_followers_updated_at BEFORE UPDATE ON master_followers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_copy_configurations_updated_at BEFORE UPDATE ON copy_configurations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Update strategy subscriber count trigger
CREATE OR REPLACE FUNCTION update_strategy_subscriber_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.is_active = TRUE THEN
    UPDATE strategies
    SET total_subscribers = total_subscribers + 1
    WHERE id = NEW.strategy_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.is_active = FALSE AND NEW.is_active = TRUE THEN
    UPDATE strategies
    SET total_subscribers = total_subscribers + 1
    WHERE id = NEW.strategy_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.is_active = TRUE AND NEW.is_active = FALSE THEN
    UPDATE strategies
    SET total_subscribers = total_subscribers - 1
    WHERE id = NEW.strategy_id;
  ELSIF TG_OP = 'DELETE' AND OLD.is_active = TRUE THEN
    UPDATE strategies
    SET total_subscribers = total_subscribers - 1
    WHERE id = OLD.strategy_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_strategy_subscribers_on_subscription
  AFTER INSERT OR UPDATE OR DELETE ON strategy_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_strategy_subscriber_count();

-- Initialize account balance on user creation
CREATE OR REPLACE FUNCTION initialize_account_balance()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO account_balances (user_id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER create_account_balance_on_profile
  AFTER INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION initialize_account_balance();
