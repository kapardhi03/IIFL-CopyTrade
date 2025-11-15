import { supabase } from './supabase';
import type { Database } from './supabase';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

// Type helpers for realtime payloads
type Tables = Database['public']['Tables'];
type TableName = keyof Tables;
type Row<T extends TableName> = Tables[T]['Row'];

// =====================================================
// REALTIME SUBSCRIPTION UTILITIES
// =====================================================

/**
 * Subscribe to changes on a specific table
 */
export function subscribeToTable<T extends TableName>(
  table: T,
  callback: (payload: RealtimePostgresChangesPayload<Row<T>>) => void,
  filter?: string
): RealtimeChannel {
  const channel = supabase
    .channel(`${table}_changes`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: table as string,
        filter,
      },
      callback as any
    )
    .subscribe();

  return channel;
}

/**
 * Subscribe to INSERT events only
 */
export function subscribeToInserts<T extends TableName>(
  table: T,
  callback: (payload: RealtimePostgresChangesPayload<Row<T>>) => void,
  filter?: string
): RealtimeChannel {
  const channel = supabase
    .channel(`${table}_inserts`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: table as string,
        filter,
      },
      callback as any
    )
    .subscribe();

  return channel;
}

/**
 * Subscribe to UPDATE events only
 */
export function subscribeToUpdates<T extends TableName>(
  table: T,
  callback: (payload: RealtimePostgresChangesPayload<Row<T>>) => void,
  filter?: string
): RealtimeChannel {
  const channel = supabase
    .channel(`${table}_updates`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: table as string,
        filter,
      },
      callback as any
    )
    .subscribe();

  return channel;
}

/**
 * Subscribe to DELETE events only
 */
export function subscribeToDeletes<T extends TableName>(
  table: T,
  callback: (payload: RealtimePostgresChangesPayload<Row<T>>) => void,
  filter?: string
): RealtimeChannel {
  const channel = supabase
    .channel(`${table}_deletes`)
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: table as string,
        filter,
      },
      callback as any
    )
    .subscribe();

  return channel;
}

/**
 * Unsubscribe from a channel
 */
export async function unsubscribe(channel: RealtimeChannel): Promise<void> {
  await supabase.removeChannel(channel);
}

// =====================================================
// SPECIFIC SUBSCRIPTION HOOKS
// =====================================================

/**
 * Subscribe to user's orders
 */
export function subscribeToUserOrders(
  userId: string,
  callback: (order: Row<'orders'>) => void
): RealtimeChannel {
  return subscribeToTable(
    'orders',
    (payload) => {
      if (payload.new) {
        callback(payload.new as Row<'orders'>);
      }
    },
    `user_id=eq.${userId}`
  );
}

/**
 * Subscribe to user's notifications
 */
export function subscribeToNotifications(
  userId: string,
  callback: (notification: Row<'notifications'>) => void
): RealtimeChannel {
  return subscribeToInserts(
    'notifications',
    (payload) => {
      if (payload.new) {
        callback(payload.new as Row<'notifications'>);
      }
    },
    `user_id=eq.${userId}`
  );
}

/**
 * Subscribe to user's portfolio updates
 */
export function subscribeToPortfolio(
  userId: string,
  callback: (portfolio: Row<'portfolios'>) => void
): RealtimeChannel {
  return subscribeToTable(
    'portfolios',
    (payload) => {
      if (payload.new) {
        callback(payload.new as Row<'portfolios'>);
      }
    },
    `user_id=eq.${userId}`
  );
}

/**
 * Subscribe to account balance updates
 */
export function subscribeToBalance(
  userId: string,
  callback: (balance: Row<'account_balances'>) => void
): RealtimeChannel {
  return subscribeToUpdates(
    'account_balances',
    (payload) => {
      if (payload.new) {
        callback(payload.new as Row<'account_balances'>);
      }
    },
    `user_id=eq.${userId}`
  );
}

/**
 * Subscribe to strategy updates (for strategy owners)
 */
export function subscribeToStrategy(
  strategyId: string,
  callback: (strategy: Row<'strategies'>) => void
): RealtimeChannel {
  return subscribeToUpdates(
    'strategies',
    (payload) => {
      if (payload.new) {
        callback(payload.new as Row<'strategies'>);
      }
    },
    `id=eq.${strategyId}`
  );
}

/**
 * Subscribe to new strategy subscriptions (for master traders)
 */
export function subscribeToStrategySubscriptions(
  strategyId: string,
  callback: (subscription: Row<'strategy_subscriptions'>) => void
): RealtimeChannel {
  return subscribeToInserts(
    'strategy_subscriptions',
    (payload) => {
      if (payload.new) {
        callback(payload.new as Row<'strategy_subscriptions'>);
      }
    },
    `strategy_id=eq.${strategyId}`
  );
}

/**
 * Subscribe to trades for a specific strategy
 */
export function subscribeToStrategyTrades(
  strategyId: string,
  callback: (trade: Row<'trades'>) => void
): RealtimeChannel {
  return subscribeToInserts(
    'trades',
    (payload) => {
      if (payload.new) {
        callback(payload.new as Row<'trades'>);
      }
    },
    `strategy_id=eq.${strategyId}`
  );
}

// =====================================================
// PRESENCE MANAGEMENT
// =====================================================

/**
 * Create a presence channel for online users
 */
export function createPresenceChannel(
  channelName: string,
  userId: string,
  metadata?: Record<string, any>
): RealtimeChannel {
  const channel = supabase.channel(channelName, {
    config: {
      presence: {
        key: userId,
      },
    },
  });

  channel
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      console.log('Presence sync:', state);
    })
    .on('presence', { event: 'join' }, ({ key, newPresences }) => {
      console.log('User joined:', key, newPresences);
    })
    .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
      console.log('User left:', key, leftPresences);
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          user_id: userId,
          online_at: new Date().toISOString(),
          ...metadata,
        });
      }
    });

  return channel;
}

// =====================================================
// BROADCAST UTILITIES
// =====================================================

/**
 * Create a broadcast channel for real-time messages
 */
export function createBroadcastChannel(
  channelName: string,
  onMessage: (payload: any) => void
): RealtimeChannel {
  const channel = supabase.channel(channelName);

  channel
    .on('broadcast', { event: 'message' }, ({ payload }) => {
      onMessage(payload);
    })
    .subscribe();

  return channel;
}

/**
 * Send a broadcast message
 */
export async function broadcastMessage(
  channel: RealtimeChannel,
  message: any
): Promise<void> {
  await channel.send({
    type: 'broadcast',
    event: 'message',
    payload: message,
  });
}

// =====================================================
// CONNECTION MANAGEMENT
// =====================================================

/**
 * Monitor realtime connection status
 */
export function monitorRealtimeStatus(
  onStatusChange: (status: 'SUBSCRIBED' | 'CLOSED' | 'CHANNEL_ERROR') => void
): void {
  supabase.channel('connection-monitor').subscribe((status) => {
    onStatusChange(status as any);
  });
}

/**
 * Clean up all active channels
 */
export async function cleanupAllChannels(): Promise<void> {
  await supabase.removeAllChannels();
}
