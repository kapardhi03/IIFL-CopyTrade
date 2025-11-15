-- Row Level Security (RLS) Policies
-- Migration: 002_row_level_security
-- Description: Enable RLS and create security policies for all tables

-- =====================================================
-- ENABLE ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_kyc ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_api_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategy_parameters ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategy_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategy_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_followers ENABLE ROW LEVEL SECURITY;
ALTER TABLE copy_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- PROFILES POLICIES
-- =====================================================

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Public profiles can be viewed by authenticated users
CREATE POLICY "Authenticated users can view public master profiles"
  ON profiles FOR SELECT
  USING (
    auth.role() = 'authenticated' AND
    role = 'master'
  );

-- =====================================================
-- USER KYC POLICIES
-- =====================================================

-- Users can view their own KYC documents
CREATE POLICY "Users can view own KYC"
  ON user_kyc FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own KYC documents
CREATE POLICY "Users can insert own KYC"
  ON user_kyc FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own pending KYC documents
CREATE POLICY "Users can update own pending KYC"
  ON user_kyc FOR UPDATE
  USING (auth.uid() = user_id AND verification_status = 'pending');

-- =====================================================
-- API CONFIGS POLICIES
-- =====================================================

-- Users can manage their own API configurations
CREATE POLICY "Users can view own API configs"
  ON user_api_configs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own API configs"
  ON user_api_configs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own API configs"
  ON user_api_configs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own API configs"
  ON user_api_configs FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================
-- AUDIT LOGS POLICIES
-- =====================================================

-- Users can view their own audit logs
CREATE POLICY "Users can view own audit logs"
  ON audit_logs FOR SELECT
  USING (auth.uid() = user_id);

-- System can insert audit logs
CREATE POLICY "System can insert audit logs"
  ON audit_logs FOR INSERT
  WITH CHECK (true);

-- =====================================================
-- STRATEGIES POLICIES
-- =====================================================

-- Master traders can manage their own strategies
CREATE POLICY "Masters can view own strategies"
  ON strategies FOR SELECT
  USING (auth.uid() = master_id);

CREATE POLICY "Masters can insert strategies"
  ON strategies FOR INSERT
  WITH CHECK (
    auth.uid() = master_id AND
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'master'
  );

CREATE POLICY "Masters can update own strategies"
  ON strategies FOR UPDATE
  USING (auth.uid() = master_id);

CREATE POLICY "Masters can delete own strategies"
  ON strategies FOR DELETE
  USING (auth.uid() = master_id);

-- All authenticated users can view public strategies
CREATE POLICY "Users can view public strategies"
  ON strategies FOR SELECT
  USING (is_public = true AND auth.role() = 'authenticated');

-- =====================================================
-- STRATEGY PARAMETERS POLICIES
-- =====================================================

-- Master traders can manage their strategy parameters
CREATE POLICY "Masters can manage strategy parameters"
  ON strategy_parameters FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM strategies
      WHERE strategies.id = strategy_parameters.strategy_id
      AND strategies.master_id = auth.uid()
    )
  );

-- Followers can view parameters of subscribed strategies
CREATE POLICY "Followers can view subscribed strategy parameters"
  ON strategy_parameters FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM strategy_subscriptions
      WHERE strategy_subscriptions.strategy_id = strategy_parameters.strategy_id
      AND strategy_subscriptions.follower_id = auth.uid()
      AND strategy_subscriptions.is_active = true
    )
  );

-- =====================================================
-- STRATEGY PERFORMANCE POLICIES
-- =====================================================

-- Masters can view their strategy performance
CREATE POLICY "Masters can view own strategy performance"
  ON strategy_performance FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM strategies
      WHERE strategies.id = strategy_performance.strategy_id
      AND strategies.master_id = auth.uid()
    )
  );

-- Followers can view subscribed strategy performance
CREATE POLICY "Followers can view subscribed strategy performance"
  ON strategy_performance FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM strategy_subscriptions
      WHERE strategy_subscriptions.strategy_id = strategy_performance.strategy_id
      AND strategy_subscriptions.follower_id = auth.uid()
      AND strategy_subscriptions.is_active = true
    )
  );

-- Public strategy performance is viewable by all
CREATE POLICY "Users can view public strategy performance"
  ON strategy_performance FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM strategies
      WHERE strategies.id = strategy_performance.strategy_id
      AND strategies.is_public = true
    )
  );

-- =====================================================
-- STRATEGY SUBSCRIPTIONS POLICIES
-- =====================================================

-- Followers can manage their own subscriptions
CREATE POLICY "Followers can view own subscriptions"
  ON strategy_subscriptions FOR SELECT
  USING (auth.uid() = follower_id);

CREATE POLICY "Followers can insert subscriptions"
  ON strategy_subscriptions FOR INSERT
  WITH CHECK (
    auth.uid() = follower_id AND
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'follower'
  );

CREATE POLICY "Followers can update own subscriptions"
  ON strategy_subscriptions FOR UPDATE
  USING (auth.uid() = follower_id);

-- Masters can view subscriptions to their strategies
CREATE POLICY "Masters can view strategy subscriptions"
  ON strategy_subscriptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM strategies
      WHERE strategies.id = strategy_subscriptions.strategy_id
      AND strategies.master_id = auth.uid()
    )
  );

-- =====================================================
-- ORDERS POLICIES
-- =====================================================

-- Users can view their own orders
CREATE POLICY "Users can view own orders"
  ON orders FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own orders
CREATE POLICY "Users can insert own orders"
  ON orders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own pending orders
CREATE POLICY "Users can update own pending orders"
  ON orders FOR UPDATE
  USING (auth.uid() = user_id AND status IN ('pending', 'submitted'));

-- =====================================================
-- TRADES POLICIES
-- =====================================================

-- Users can view their own trades
CREATE POLICY "Users can view own trades"
  ON trades FOR SELECT
  USING (auth.uid() = user_id);

-- System can insert trades
CREATE POLICY "System can insert trades"
  ON trades FOR INSERT
  WITH CHECK (true);

-- =====================================================
-- PORTFOLIOS POLICIES
-- =====================================================

-- Users can view their own portfolios
CREATE POLICY "Users can view own portfolio"
  ON portfolios FOR SELECT
  USING (auth.uid() = user_id);

-- System can manage portfolios
CREATE POLICY "System can manage portfolios"
  ON portfolios FOR ALL
  USING (true);

-- =====================================================
-- ACCOUNT BALANCES POLICIES
-- =====================================================

-- Users can view their own account balance
CREATE POLICY "Users can view own account balance"
  ON account_balances FOR SELECT
  USING (auth.uid() = user_id);

-- System can update account balances
CREATE POLICY "System can update account balances"
  ON account_balances FOR UPDATE
  USING (true);

-- =====================================================
-- MASTER FOLLOWERS POLICIES
-- =====================================================

-- Users can view relationships where they are involved
CREATE POLICY "Users can view own follower relationships"
  ON master_followers FOR SELECT
  USING (auth.uid() = master_id OR auth.uid() = follower_id);

-- Followers can create relationships
CREATE POLICY "Followers can create relationships"
  ON master_followers FOR INSERT
  WITH CHECK (
    auth.uid() = follower_id AND
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'follower'
  );

-- Users can update their own relationships
CREATE POLICY "Users can update own relationships"
  ON master_followers FOR UPDATE
  USING (auth.uid() = follower_id OR auth.uid() = master_id);

-- =====================================================
-- COPY CONFIGURATIONS POLICIES
-- =====================================================

-- Followers can manage their copy configurations
CREATE POLICY "Followers can manage copy configs"
  ON copy_configurations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM master_followers
      WHERE master_followers.id = copy_configurations.master_follower_id
      AND master_followers.follower_id = auth.uid()
    )
  );

-- Masters can view copy configurations for their followers
CREATE POLICY "Masters can view follower copy configs"
  ON copy_configurations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM master_followers
      WHERE master_followers.id = copy_configurations.master_follower_id
      AND master_followers.master_id = auth.uid()
    )
  );

-- =====================================================
-- NOTIFICATIONS POLICIES
-- =====================================================

-- Users can view their own notifications
CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- System can insert notifications
CREATE POLICY "System can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);

-- Users can delete their own notifications
CREATE POLICY "Users can delete own notifications"
  ON notifications FOR DELETE
  USING (auth.uid() = user_id);
