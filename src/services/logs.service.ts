// Supabase-backed audit-log reader. Maps DB entity_type strings to the
// frontend LogType enum and hydrates entity names from details JSONB / joins.

import { supabase } from '../lib/supabase';
import { logAudit } from '../lib/audit';
import { SystemLog } from '../types/logs.types';
import { LogType } from '../config/constants';

interface AuditRow {
  id: string;
  user_id: string | null;
  school_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
  actor: { name: string | null; email: string | null; mobile_number: string | null } | null;
}

const ACTION_LABELS: Record<string, string> = {
  onboard_school:           'Onboarded New School',
  update_school:            'Updated School Details',
  delete_school:            'Disabled School Account',
  update_plan:              'Updated School Plan',
  setup_billing:            'Setup School Billing',
  record_school_payment:    'Recorded School Payment',
  create_next_billing_year: 'Started New Billing Year',
  create_admin:             'Created Admin Account',
  reset_password:           'Reset User Password',
  activate_user:            'Activated User Account',
  deactivate_user:          'Suspended User Account',
  send_broadcast:           'Sent System Broadcast',
  delete_broadcast:         'Removed Broadcast',
};

const ENTITY_TYPE_TO_LOGTYPE: Record<string, LogType> = {
  school:                LogType.SCHOOL,
  school_payment:        LogType.BILLING,
  school_billing_year:   LogType.BILLING,
  user:                  LogType.ADMIN,
  broadcast:             LogType.BROADCAST,
};

const SECURITY_ACTIONS = new Set([
  'reset_password', 'activate_user', 'deactivate_user',
]);

function classify(row: AuditRow): LogType {
  if (SECURITY_ACTIONS.has(row.action)) return LogType.SECURITY;
  if (row.entity_type && ENTITY_TYPE_TO_LOGTYPE[row.entity_type]) {
    return ENTITY_TYPE_TO_LOGTYPE[row.entity_type];
  }
  return LogType.SYSTEM;
}

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function entityName(row: AuditRow): string {
  const d = row.details ?? {};
  return (
    (d.name as string | undefined) ??
    (d.title as string | undefined) ??
    (d.school_id as string | undefined) ??
    (row.entity_id ?? '—')
  );
}

function performedBy(row: AuditRow): string {
  if (!row.actor) return row.user_id ? row.user_id.slice(0, 8) : 'system';
  return row.actor.email ?? row.actor.name ?? row.actor.mobile_number ?? 'unknown';
}

function fmtTimestamp(ts: string): string {
  return new Date(ts).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function rowToLog(r: AuditRow): SystemLog {
  return {
    id: r.id,
    action: actionLabel(r.action),
    entity: entityName(r),
    entityType: classify(r),
    performedBy: performedBy(r),
    performedById: r.user_id ?? 'system',
    timestamp: fmtTimestamp(r.created_at),
    metadata: (r.details ?? {}) as Record<string, string>,
  };
}

const SELECT_COLS =
  'id, user_id, school_id, action, entity_type, entity_id, details, created_at, actor:user_id(name, email, mobile_number)';

export const logsService = {
  async getAll(): Promise<SystemLog[]> {
    const { data, error } = await supabase
      .from('audit_logs')
      .select(SELECT_COLS)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => rowToLog(r as unknown as AuditRow));
  },

  async getByType(type: LogType): Promise<SystemLog[]> {
    const all = await logsService.getAll();
    return all.filter((l) => l.entityType === type);
  },

  async addLog(log: Omit<SystemLog, 'id' | 'timestamp'>): Promise<void> {
    // Frontend-side wrapper. Use logAudit() directly for typed calls.
    await logAudit(log.action, log.entityType, null, {
      entity: log.entity,
      performedBy: log.performedBy,
      ...(log.metadata ?? {}),
    });
  },
};
