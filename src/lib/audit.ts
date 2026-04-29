// Thin wrapper around the public.log_audit() RPC. Failures are swallowed —
// audit failures must never break a user-facing operation.

import { supabase } from './supabase';

export async function logAudit(
  action: string,
  entityType: string,
  entityId: string | null,
  details: Record<string, unknown> = {},
): Promise<void> {
  try {
    await supabase.rpc('log_audit', {
      p_action: action,
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_details: details,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[audit] log failed:', e);
  }
}
