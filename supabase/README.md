# Replicon Database Setup Guide

This guide explains how to set up the Supabase database for the Replicon copy-trading platform.

## Prerequisites

- Supabase account (sign up at [https://supabase.com](https://supabase.com))
- Supabase CLI installed (optional but recommended)

## Quick Setup

### 1. Create a New Supabase Project

1. Go to [https://app.supabase.com](https://app.supabase.com)
2. Click "New Project"
3. Choose your organization
4. Enter project details:
   - Name: `replicon` (or your preferred name)
   - Database Password: Save this securely
   - Region: Choose closest to your target users
5. Click "Create new project"

### 2. Get Your Project Credentials

Once your project is created:

1. Go to Project Settings > API
2. Copy these values to your `.env` file:
   ```
   VITE_SUPABASE_URL=your_project_url
   VITE_SUPABASE_ANON_KEY=your_anon_key
   ```

### 3. Run Database Migrations

You have two options to run the migrations:

#### Option A: Using Supabase Dashboard (Easiest)

1. Go to the SQL Editor in your Supabase dashboard
2. Run each migration file in order:
   - `001_initial_schema.sql`
   - `002_row_level_security.sql`
   - `003_business_logic_functions.sql`
   - `004_storage_buckets.sql`

3. Copy the content of each file and click "Run"

#### Option B: Using Supabase CLI

```bash
# Login to Supabase
supabase login

# Link your project
supabase link --project-ref your-project-ref

# Run migrations
supabase db push
```

## Database Schema Overview

### User Management Tables

- **profiles**: User profile information (extends auth.users)
- **user_kyc**: KYC document storage and verification status
- **user_api_configs**: Encrypted API credentials for brokers
- **audit_logs**: Comprehensive audit trail for compliance

### Trading Strategy Tables

- **strategies**: Master trader strategies
- **strategy_parameters**: Risk settings and parameters per strategy
- **strategy_performance**: Daily performance metrics
- **strategy_subscriptions**: Follower subscriptions to strategies

### Trading Data Tables

- **orders**: All order records (master and follower)
- **trades**: Executed trade information
- **portfolios**: Current position tracking
- **account_balances**: Real-time balance tracking

### Relationship Tables

- **master_followers**: Master-follower relationships
- **copy_configurations**: Follower-specific copy settings
- **notifications**: User notifications

## Security Features

### Row Level Security (RLS)

All tables have RLS enabled with policies ensuring:
- Users can only access their own data
- Masters can view their followers' subscriptions
- Followers can view subscribed strategy performance
- Public strategies are viewable by all authenticated users

### Storage Security

Three storage buckets with proper access controls:
- **avatars**: Public bucket for user profile pictures (2MB limit)
- **kyc-documents**: Private bucket for KYC documents (10MB limit)
- **strategy-documents**: Private bucket for strategy reports (5MB limit)

## Real-time Features

Enable real-time for the following tables in your Supabase dashboard:

1. Go to Database > Replication
2. Enable replication for:
   - `orders` - For live order updates
   - `trades` - For live trade execution
   - `portfolios` - For live portfolio updates
   - `notifications` - For real-time notifications
   - `account_balances` - For live balance updates

## Database Functions

### Core Functions

1. **copy_master_order_to_followers(master_order_id)**
   - Automatically copies master orders to all active followers
   - Applies scaling factors from copy configurations

2. **calculate_strategy_performance(strategy_id, date)**
   - Calculates daily performance metrics for a strategy
   - Updates win rate, P&L, and other metrics

3. **get_user_total_pnl(user_id)**
   - Returns realized, unrealized, and total P&L for a user

4. **get_strategy_active_subscribers(strategy_id)**
   - Returns count of active subscribers

### Automatic Triggers

- **Updated_at timestamps**: Automatically updated on row changes
- **Portfolio updates**: Triggered on trade execution
- **Balance updates**: Triggered on trade execution
- **Subscriber count**: Auto-incremented on subscriptions
- **Order notifications**: Sent on order fill/rejection
- **Order copying**: Master orders auto-copied to followers

## Performance Optimization

### Indexes

All high-frequency query columns are indexed:
- User IDs on all user-related tables
- Strategy IDs on all strategy-related tables
- Symbol, status, and timestamp columns on orders/trades
- Created_at timestamps for efficient time-based queries

### Recommended Settings

For production, adjust these Supabase settings:

1. **Database Settings**:
   - Enable connection pooling
   - Set appropriate timeout values
   - Configure autovacuum for optimal performance

2. **API Settings**:
   - Enable RLS for all tables
   - Set appropriate rate limits
   - Configure JWT expiration

## Testing Your Setup

### 1. Verify Tables

Run this query in SQL Editor:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

You should see all 15 tables listed.

### 2. Test RLS Policies

Create a test user and verify:
- User can only see their own profile
- User cannot access other users' data
- Public strategies are visible

### 3. Test Functions

```sql
-- Test P&L calculation
SELECT * FROM get_user_total_pnl('user-uuid-here');

-- Test subscriber count
SELECT * FROM get_strategy_active_subscribers('strategy-uuid-here');
```

## Backup and Recovery

### Automatic Backups

Supabase provides automatic daily backups for paid plans.

### Manual Backup

```bash
# Using Supabase CLI
supabase db dump -f backup.sql

# Restore from backup
psql -h db.your-project.supabase.co -U postgres -d postgres -f backup.sql
```

## Monitoring

### Key Metrics to Monitor

1. **Database Performance**:
   - Query response times
   - Connection pool usage
   - Table sizes and growth

2. **Real-time Performance**:
   - Active subscriptions
   - Message delivery latency
   - Connection drops

3. **Storage Usage**:
   - Bucket sizes
   - Upload/download rates
   - Failed uploads

### Recommended Tools

- Supabase Dashboard (built-in analytics)
- Sentry for error tracking
- Custom application logging

## Troubleshooting

### Common Issues

1. **Migration Errors**
   - Ensure migrations run in order
   - Check for conflicting table names
   - Verify extension availability

2. **RLS Policy Issues**
   - Verify user is authenticated
   - Check policy conditions
   - Test with service role key for debugging

3. **Real-time Connection Issues**
   - Check browser console for errors
   - Verify table replication is enabled
   - Ensure RLS policies allow SELECT

### Getting Help

- Supabase Docs: https://supabase.com/docs
- Supabase Discord: https://discord.supabase.com
- GitHub Issues: https://github.com/supabase/supabase/issues

## Next Steps

After setting up the database:

1. ✅ Configure environment variables in `.env`
2. ✅ Test authentication flow
3. ✅ Verify real-time subscriptions work
4. ✅ Test file upload to storage buckets
5. ✅ Deploy backend functions (if using Supabase Edge Functions)

## Database Maintenance

### Regular Tasks

- Monitor slow queries and optimize
- Review and clean up audit logs periodically
- Archive old strategy performance data
- Update statistics for query optimization

### Recommended Schedule

- **Daily**: Monitor error logs and performance
- **Weekly**: Review and optimize slow queries
- **Monthly**: Archive old audit logs, analyze growth trends
- **Quarterly**: Database performance review, capacity planning
