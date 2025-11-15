-- Business Logic Functions and Advanced Triggers
-- Migration: 003_business_logic_functions
-- Description: Core business logic functions for trade processing and calculations

-- =====================================================
-- PORTFOLIO MANAGEMENT FUNCTIONS
-- =====================================================

-- Update portfolio on trade execution
CREATE OR REPLACE FUNCTION update_portfolio_on_trade()
RETURNS TRIGGER AS $$
DECLARE
  existing_quantity INTEGER;
  existing_avg_price DECIMAL(15, 2);
BEGIN
  -- Get existing position if it exists
  SELECT quantity, average_price INTO existing_quantity, existing_avg_price
  FROM portfolios
  WHERE user_id = NEW.user_id
    AND strategy_id = NEW.strategy_id
    AND symbol = NEW.symbol;

  IF FOUND THEN
    -- Update existing position
    IF NEW.side = 'buy' THEN
      -- Adding to position
      UPDATE portfolios
      SET
        quantity = existing_quantity + NEW.quantity,
        average_price = ((existing_avg_price * existing_quantity) + (NEW.price * NEW.quantity)) / (existing_quantity + NEW.quantity),
        last_updated_at = NOW()
      WHERE user_id = NEW.user_id
        AND strategy_id = NEW.strategy_id
        AND symbol = NEW.symbol;
    ELSE
      -- Reducing position (sell)
      IF existing_quantity >= NEW.quantity THEN
        UPDATE portfolios
        SET
          quantity = existing_quantity - NEW.quantity,
          realized_pnl = realized_pnl + ((NEW.price - average_price) * NEW.quantity),
          last_updated_at = NOW()
        WHERE user_id = NEW.user_id
          AND strategy_id = NEW.strategy_id
          AND symbol = NEW.symbol;

        -- Delete position if quantity becomes zero
        DELETE FROM portfolios
        WHERE user_id = NEW.user_id
          AND strategy_id = NEW.strategy_id
          AND symbol = NEW.symbol
          AND quantity = 0;
      END IF;
    END IF;
  ELSE
    -- Create new position (only for buy orders)
    IF NEW.side = 'buy' THEN
      INSERT INTO portfolios (user_id, strategy_id, symbol, quantity, average_price)
      VALUES (NEW.user_id, NEW.strategy_id, NEW.symbol, NEW.quantity, NEW.price);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_portfolio_after_trade
  AFTER INSERT ON trades
  FOR EACH ROW EXECUTE FUNCTION update_portfolio_on_trade();

-- =====================================================
-- ORDER PROCESSING FUNCTIONS
-- =====================================================

-- Copy master order to followers
CREATE OR REPLACE FUNCTION copy_master_order_to_followers(master_order_id UUID)
RETURNS INTEGER AS $$
DECLARE
  master_order RECORD;
  follower_config RECORD;
  follower_order_id UUID;
  orders_created INTEGER := 0;
BEGIN
  -- Get master order details
  SELECT * INTO master_order FROM orders WHERE id = master_order_id;

  -- Loop through all active followers with copy configurations
  FOR follower_config IN
    SELECT
      cc.scaling_factor,
      mf.follower_id,
      cc.strategy_id
    FROM copy_configurations cc
    JOIN master_followers mf ON mf.id = cc.master_follower_id
    JOIN orders o ON o.user_id = mf.master_id AND o.id = master_order_id
    WHERE cc.is_active = TRUE
      AND mf.status = 'active'
      AND (cc.strategy_id = master_order.strategy_id OR cc.strategy_id IS NULL)
  LOOP
    -- Create follower order with scaled quantity
    INSERT INTO orders (
      user_id,
      strategy_id,
      parent_order_id,
      order_type,
      side,
      symbol,
      quantity,
      price,
      trigger_price,
      status
    ) VALUES (
      follower_config.follower_id,
      master_order.strategy_id,
      master_order_id,
      master_order.order_type,
      master_order.side,
      master_order.symbol,
      GREATEST(1, ROUND(master_order.quantity * follower_config.scaling_factor)),
      master_order.price,
      master_order.trigger_price,
      'pending'
    )
    RETURNING id INTO follower_order_id;

    orders_created := orders_created + 1;
  END LOOP;

  RETURN orders_created;
END;
$$ LANGUAGE plpgsql;

-- Automatically copy master orders
CREATE OR REPLACE FUNCTION auto_copy_master_orders()
RETURNS TRIGGER AS $$
DECLARE
  user_role TEXT;
BEGIN
  -- Check if user is a master trader
  SELECT role INTO user_role FROM profiles WHERE id = NEW.user_id;

  IF user_role = 'master' AND NEW.status = 'submitted' THEN
    -- Copy order to followers asynchronously
    PERFORM copy_master_order_to_followers(NEW.id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER copy_orders_to_followers
  AFTER INSERT OR UPDATE ON orders
  FOR EACH ROW
  WHEN (NEW.status = 'submitted' AND NEW.parent_order_id IS NULL)
  EXECUTE FUNCTION auto_copy_master_orders();

-- =====================================================
-- PERFORMANCE CALCULATION FUNCTIONS
-- =====================================================

-- Calculate daily strategy performance
CREATE OR REPLACE FUNCTION calculate_strategy_performance(
  p_strategy_id UUID,
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS void AS $$
DECLARE
  total_trades_count INTEGER;
  winning_count INTEGER;
  losing_count INTEGER;
  total_profit DECIMAL(15, 2);
  total_loss DECIMAL(15, 2);
  net_pnl DECIMAL(15, 2);
  total_vol DECIMAL(15, 2);
  win_percentage DECIMAL(5, 2);
BEGIN
  -- Count total trades for the day
  SELECT COUNT(*) INTO total_trades_count
  FROM trades
  WHERE strategy_id = p_strategy_id
    AND DATE(executed_at) = p_date;

  -- Calculate winning and losing trades
  SELECT
    COUNT(CASE WHEN (t2.price - t1.price) * t1.quantity > 0 THEN 1 END),
    COUNT(CASE WHEN (t2.price - t1.price) * t1.quantity < 0 THEN 1 END)
  INTO winning_count, losing_count
  FROM trades t1
  JOIN trades t2 ON t1.symbol = t2.symbol AND t1.side = 'buy' AND t2.side = 'sell'
  WHERE t1.strategy_id = p_strategy_id
    AND DATE(t1.executed_at) = p_date;

  -- Calculate total P&L
  SELECT COALESCE(SUM(realized_pnl), 0) INTO net_pnl
  FROM portfolios
  WHERE strategy_id = p_strategy_id;

  -- Calculate total volume
  SELECT COALESCE(SUM(total_value), 0) INTO total_vol
  FROM trades
  WHERE strategy_id = p_strategy_id
    AND DATE(executed_at) = p_date;

  -- Calculate win rate
  IF total_trades_count > 0 THEN
    win_percentage := (winning_count::DECIMAL / total_trades_count::DECIMAL) * 100;
  ELSE
    win_percentage := 0;
  END IF;

  -- Insert or update performance record
  INSERT INTO strategy_performance (
    strategy_id,
    date,
    total_trades,
    winning_trades,
    losing_trades,
    total_pnl,
    total_volume,
    win_rate
  ) VALUES (
    p_strategy_id,
    p_date,
    total_trades_count,
    winning_count,
    losing_count,
    net_pnl,
    total_vol,
    win_percentage
  )
  ON CONFLICT (strategy_id, date)
  DO UPDATE SET
    total_trades = EXCLUDED.total_trades,
    winning_trades = EXCLUDED.winning_trades,
    losing_trades = EXCLUDED.losing_trades,
    total_pnl = EXCLUDED.total_pnl,
    total_volume = EXCLUDED.total_volume,
    win_rate = EXCLUDED.win_rate;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- ACCOUNT BALANCE FUNCTIONS
-- =====================================================

-- Update account balance on trade
CREATE OR REPLACE FUNCTION update_account_balance_on_trade()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE account_balances
  SET
    total_balance = total_balance + NEW.total_value * (CASE WHEN NEW.side = 'sell' THEN 1 ELSE -1 END),
    available_balance = available_balance + NEW.total_value * (CASE WHEN NEW.side = 'sell' THEN 1 ELSE -1 END),
    last_synced_at = NOW()
  WHERE user_id = NEW.user_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_balance_after_trade
  AFTER INSERT ON trades
  FOR EACH ROW EXECUTE FUNCTION update_account_balance_on_trade();

-- =====================================================
-- NOTIFICATION FUNCTIONS
-- =====================================================

-- Create notification on order fill
CREATE OR REPLACE FUNCTION notify_on_order_fill()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'filled' AND OLD.status != 'filled' THEN
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (
      NEW.user_id,
      'order_filled',
      'Order Filled',
      format('Your %s order for %s %s has been filled at %s',
        NEW.side, NEW.quantity, NEW.symbol, NEW.average_price),
      jsonb_build_object(
        'order_id', NEW.id,
        'symbol', NEW.symbol,
        'side', NEW.side,
        'quantity', NEW.quantity,
        'price', NEW.average_price
      )
    );
  ELSIF NEW.status = 'rejected' AND OLD.status != 'rejected' THEN
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (
      NEW.user_id,
      'order_rejected',
      'Order Rejected',
      format('Your %s order for %s %s was rejected: %s',
        NEW.side, NEW.quantity, NEW.symbol, NEW.rejection_reason),
      jsonb_build_object(
        'order_id', NEW.id,
        'symbol', NEW.symbol,
        'reason', NEW.rejection_reason
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notify_order_status
  AFTER UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION notify_on_order_fill();

-- Notify master when new follower subscribes
CREATE OR REPLACE FUNCTION notify_master_on_new_follower()
RETURNS TRIGGER AS $$
DECLARE
  follower_name TEXT;
  strategy_name TEXT;
BEGIN
  SELECT name INTO follower_name FROM profiles WHERE id = NEW.follower_id;
  SELECT name INTO strategy_name FROM strategies WHERE id = NEW.strategy_id;

  INSERT INTO notifications (user_id, type, title, message, data)
  SELECT
    s.master_id,
    'follower_added',
    'New Follower',
    format('%s has subscribed to your strategy "%s"', follower_name, strategy_name),
    jsonb_build_object(
      'follower_id', NEW.follower_id,
      'follower_name', follower_name,
      'strategy_id', NEW.strategy_id,
      'strategy_name', strategy_name
    )
  FROM strategies s
  WHERE s.id = NEW.strategy_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notify_new_follower
  AFTER INSERT ON strategy_subscriptions
  FOR EACH ROW
  WHEN (NEW.is_active = true)
  EXECUTE FUNCTION notify_master_on_new_follower();

-- =====================================================
-- UTILITY FUNCTIONS
-- =====================================================

-- Get user's total P&L
CREATE OR REPLACE FUNCTION get_user_total_pnl(p_user_id UUID)
RETURNS TABLE (
  realized_pnl DECIMAL(15, 2),
  unrealized_pnl DECIMAL(15, 2),
  total_pnl DECIMAL(15, 2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(p.realized_pnl), 0) as realized_pnl,
    COALESCE(SUM(p.unrealized_pnl), 0) as unrealized_pnl,
    COALESCE(SUM(p.realized_pnl + p.unrealized_pnl), 0) as total_pnl
  FROM portfolios p
  WHERE p.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- Get strategy subscribers count
CREATE OR REPLACE FUNCTION get_strategy_active_subscribers(p_strategy_id UUID)
RETURNS INTEGER AS $$
DECLARE
  subscriber_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO subscriber_count
  FROM strategy_subscriptions
  WHERE strategy_id = p_strategy_id
    AND is_active = true;

  RETURN subscriber_count;
END;
$$ LANGUAGE plpgsql;

-- Validate order before submission
CREATE OR REPLACE FUNCTION validate_order_submission()
RETURNS TRIGGER AS $$
DECLARE
  available_balance DECIMAL(15, 2);
  order_value DECIMAL(15, 2);
BEGIN
  -- Calculate order value
  order_value := NEW.quantity * COALESCE(NEW.price, 0);

  -- Check if user has sufficient balance for buy orders
  IF NEW.side = 'buy' THEN
    SELECT ab.available_balance INTO available_balance
    FROM account_balances ab
    WHERE ab.user_id = NEW.user_id;

    IF available_balance < order_value THEN
      RAISE EXCEPTION 'Insufficient balance. Available: %, Required: %', available_balance, order_value;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_order_before_submit
  BEFORE INSERT OR UPDATE ON orders
  FOR EACH ROW
  WHEN (NEW.status = 'submitted')
  EXECUTE FUNCTION validate_order_submission();
