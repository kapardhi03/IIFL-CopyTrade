import { supabase } from './supabase';

export type AuditAction =
  | 'user.login'
  | 'user.logout'
  | 'user.register'
  | 'user.password_reset'
  | 'user.email_verified'
  | 'user.2fa_enabled'
  | 'user.2fa_disabled'
  | 'user.profile_updated'
  | 'api.credentials_added'
  | 'api.credentials_updated'
  | 'api.credentials_removed'
  | 'strategy.created'
  | 'strategy.updated'
  | 'strategy.deleted'
  | 'follower.added'
  | 'follower.removed'
  | 'follower.settings_updated'
  | 'trade.executed'
  | 'trade.failed';

interface AuditLogEntry {
  user_id: string;
  action: AuditAction;
  details: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
}

/**
 * Logs an audit event to the database
 * @param entry The audit log entry to record
 */
export async function logAuditEvent(entry: AuditLogEntry): Promise<void> {
  try {
    const { error } = await supabase.from('audit_logs').insert({
      user_id: entry.user_id,
      action: entry.action,
      details: entry.details,
      ip_address: entry.ip_address || null,
      user_agent: entry.user_agent || null,
    });

    if (error) {
      console.error('Failed to log audit event:', error);
      // Don't throw - we don't want audit logging failures to break the app
    }
  } catch (error) {
    console.error('Audit logging error:', error);
    // Silent fail - audit logs should not disrupt user experience
  }
}

/**
 * Gets the user's IP address (client-side approximation)
 */
function getClientIP(): string | undefined {
  // In a production app, this would be better handled server-side
  // This is a placeholder for client-side implementation
  return undefined;
}

/**
 * Gets the user agent string
 */
function getUserAgent(): string {
  return navigator.userAgent;
}

/**
 * Helper to create audit log entries with automatic IP and user agent
 */
export function createAuditLog(
  userId: string,
  action: AuditAction,
  details: Record<string, any> = {}
): void {
  logAuditEvent({
    user_id: userId,
    action,
    details,
    ip_address: getClientIP(),
    user_agent: getUserAgent(),
  });
}

/**
 * Retrieves audit logs for a specific user
 * @param userId The user ID to fetch logs for
 * @param limit Maximum number of logs to retrieve
 */
export async function getUserAuditLogs(
  userId: string,
  limit: number = 50
): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('Failed to fetch audit logs:', error);
    return [];
  }
}

/**
 * Retrieves recent audit logs (admin function)
 * @param limit Maximum number of logs to retrieve
 */
export async function getRecentAuditLogs(limit: number = 100): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('Failed to fetch recent audit logs:', error);
    return [];
  }
}

/**
 * Filters audit logs by action type
 * @param action The action type to filter by
 * @param limit Maximum number of logs to retrieve
 */
export async function getAuditLogsByAction(
  action: AuditAction,
  limit: number = 50
): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('action', action)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('Failed to fetch audit logs by action:', error);
    return [];
  }
}

/**
 * Hook to automatically log authentication events
 */
export const auditAuth = {
  login: (userId: string, email: string) =>
    createAuditLog(userId, 'user.login', { email }),

  logout: (userId: string) => createAuditLog(userId, 'user.logout', {}),

  register: (userId: string, email: string, role: string) =>
    createAuditLog(userId, 'user.register', { email, role }),

  passwordReset: (userId: string, email: string) =>
    createAuditLog(userId, 'user.password_reset', { email }),

  emailVerified: (userId: string) =>
    createAuditLog(userId, 'user.email_verified', {}),

  enable2FA: (userId: string) =>
    createAuditLog(userId, 'user.2fa_enabled', {}),

  disable2FA: (userId: string) =>
    createAuditLog(userId, 'user.2fa_disabled', {}),

  profileUpdated: (userId: string, changes: Record<string, any>) =>
    createAuditLog(userId, 'user.profile_updated', { changes }),
};

/**
 * Hook to log API-related events
 */
export const auditAPI = {
  credentialsAdded: (userId: string, vendor: string) =>
    createAuditLog(userId, 'api.credentials_added', { vendor }),

  credentialsUpdated: (userId: string, vendor: string) =>
    createAuditLog(userId, 'api.credentials_updated', { vendor }),

  credentialsRemoved: (userId: string, vendor: string) =>
    createAuditLog(userId, 'api.credentials_removed', { vendor }),
};

/**
 * Hook to log strategy-related events
 */
export const auditStrategy = {
  created: (userId: string, strategyId: string, strategyName: string) =>
    createAuditLog(userId, 'strategy.created', { strategyId, strategyName }),

  updated: (userId: string, strategyId: string, changes: Record<string, any>) =>
    createAuditLog(userId, 'strategy.updated', { strategyId, changes }),

  deleted: (userId: string, strategyId: string) =>
    createAuditLog(userId, 'strategy.deleted', { strategyId }),
};

/**
 * Hook to log follower-related events
 */
export const auditFollower = {
  added: (userId: string, followerId: string, followerName: string) =>
    createAuditLog(userId, 'follower.added', { followerId, followerName }),

  removed: (userId: string, followerId: string) =>
    createAuditLog(userId, 'follower.removed', { followerId }),

  settingsUpdated: (
    userId: string,
    followerId: string,
    changes: Record<string, any>
  ) =>
    createAuditLog(userId, 'follower.settings_updated', {
      followerId,
      changes,
    }),
};

/**
 * Hook to log trade-related events
 */
export const auditTrade = {
  executed: (
    userId: string,
    tradeId: string,
    symbol: string,
    action: string,
    quantity: number
  ) =>
    createAuditLog(userId, 'trade.executed', {
      tradeId,
      symbol,
      action,
      quantity,
    }),

  failed: (userId: string, reason: string, details: Record<string, any>) =>
    createAuditLog(userId, 'trade.failed', { reason, ...details }),
};
