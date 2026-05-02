// Thin wrapper around the public.log_audit() RPC. Failures are swallowed —
// audit failures must never break a user-facing operation.
//
// For audits whose presence is itself a compliance requirement (e.g.
// YEAR_CORRECTION rows that prove a closed-year mutation was authorized),
// use logAuditStrict — it surfaces the underlying RPC error so callers can
// abort the mutation when the audit row could not be written.

import { supabase } from '@/shared/lib/supabase';

export async function logAudit(
  action: string,
  entityType: string,
  entityId: string | null,
  details: Record<string, unknown> = {},
): Promise<void> {
  try {
    const { error } = await supabase.rpc('log_audit', {
      p_action: action,
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_details: details,
    });
    if (error) {
      // eslint-disable-next-line no-console
      console.warn('[audit] log failed:', error.message);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[audit] log failed:', e);
  }
}

/**
 * Strict variant — throws on RPC error. Use only when audit-write
 * success is part of the operation's correctness guarantee.
 */
export async function logAuditStrict(
  action: string,
  entityType: string,
  entityId: string | null,
  details: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await supabase.rpc('log_audit', {
    p_action: action,
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_details: details,
  });
  if (error) throw new Error(`audit write failed: ${error.message}`);
}
