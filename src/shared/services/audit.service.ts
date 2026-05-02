// audit.service.ts — read-only access to audit_logs for the principal's
// "Activity Logs" viewer in Settings. Writes are not exposed here; use
// `logAudit` / `logAuditStrict` from src/lib/audit.ts.
//
// RLS: audit_logs has a SELECT policy that lets PRINCIPAL/TEACHER of the
// same school read rows where school_id = current_user_school_id(). The
// viewer additionally filters by school_id for defence-in-depth.
//
// We deliberately surface only the modules the principal cares about for
// compliance review: student edits, class assignment, TC/readmission,
// staff attendance, fee structure, fee payment, year close + correction.

import { supabase } from '@/shared/lib/supabase';
import { useAuthStore } from '@/shared/store/authStore';

function getSchoolId(): string {
  const id = useAuthStore.getState().session?.schoolId;
  if (!id) throw new Error('No school in session');
  return id;
}

/**
 * Friendly module a given audit `action` belongs to. Anything not mapped
 * here is grouped under MODULE_OTHER and excluded from the viewer's
 * default filter set so the principal sees only signal.
 */
export type AuditModule =
  | 'STUDENT_EDIT'
  | 'CLASS_ASSIGNMENT'
  | 'TC'
  | 'READMISSION'
  | 'FEE_PAYMENT'
  | 'FEE_STRUCTURE'
  | 'STAFF_ATTENDANCE'
  | 'ACADEMIC_YEAR'
  | 'OTHER';

const ACTION_MODULE: Record<string, AuditModule> = {
  // Student edits
  student_admitted: 'STUDENT_EDIT',
  student_updated: 'STUDENT_EDIT',
  student_change_requested: 'STUDENT_EDIT',
  student_deactivated: 'STUDENT_EDIT',
  student_marked_failed: 'STUDENT_EDIT',
  student_document_uploaded: 'STUDENT_EDIT',
  student_document_removed: 'STUDENT_EDIT',
  // Class assignment / movement
  student_class_changed: 'CLASS_ASSIGNMENT',
  student_assigned_to_class: 'CLASS_ASSIGNMENT',
  // TC / readmission
  student_tc_issued: 'TC',
  student_readmitted: 'READMISSION',
  // Fee payment / corrections
  fee_payment_recorded: 'FEE_PAYMENT',
  fee_writeoff: 'FEE_PAYMENT',
  fee_payment_upload: 'FEE_PAYMENT',
  fee_payment_upload_approved: 'FEE_PAYMENT',
  fee_payment_upload_rejected: 'FEE_PAYMENT',
  fee_screenshot_submitted_by_parent: 'FEE_PAYMENT',
  fee_screenshot_submitted_by_student: 'FEE_PAYMENT',
  // Fee structure
  fee_structure_saved: 'FEE_STRUCTURE',
  fee_structure_deleted: 'FEE_STRUCTURE',
  fee_structures_seeded: 'FEE_STRUCTURE',
  // Staff attendance
  staff_attendance_saved: 'STAFF_ATTENDANCE',
  // Academic year lifecycle
  close_academic_year: 'ACADEMIC_YEAR',
  year_closing_ui_committed: 'ACADEMIC_YEAR',
  YEAR_CORRECTION: 'ACADEMIC_YEAR',
  ay_set_active: 'ACADEMIC_YEAR',
};

export const MODULE_LABEL: Record<AuditModule, string> = {
  STUDENT_EDIT: 'Student Edit',
  CLASS_ASSIGNMENT: 'Class Assignment',
  TC: 'TC Issued',
  READMISSION: 'Readmission',
  FEE_PAYMENT: 'Fee Payment / Correction',
  FEE_STRUCTURE: 'Fee Structure',
  STAFF_ATTENDANCE: 'Staff Attendance',
  ACADEMIC_YEAR: 'Academic Year',
  OTHER: 'Other',
};

export function getModule(action: string): AuditModule {
  return ACTION_MODULE[action] ?? 'OTHER';
}

/**
 * Default filter set — every module the user explicitly asked to log.
 * "OTHER" is excluded by default; the viewer can opt in.
 */
export const DEFAULT_MODULES: AuditModule[] = [
  'STUDENT_EDIT', 'CLASS_ASSIGNMENT', 'TC', 'READMISSION',
  'FEE_PAYMENT', 'FEE_STRUCTURE', 'STAFF_ATTENDANCE', 'ACADEMIC_YEAR',
];

export interface AuditLogEntry {
  id: string;
  createdAt: string;
  action: string;
  module: AuditModule;
  moduleLabel: string;
  entityType: string | null;
  entityId: string | null;
  /** Raw details JSONB. */
  details: Record<string, unknown>;
  /** Best-effort short description of the change (e.g. "Updated phone, email"). */
  summary: string;
  /**
   * If the writer captured old/new values, surface them here for the
   * viewer's two columns. When the writer didn't, both arrays are empty.
   */
  changes: Array<{ field: string; oldValue: unknown; newValue: unknown }>;
  actor: { id: string | null; name: string; role: string | null };
}

interface RawRow {
  id: string;
  created_at: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  user: { name: string | null; role: string | null } | null;
  user_id: string | null;
}

export interface ListAuditLogsParams {
  modules?: AuditModule[];
  /** ISO date (yyyy-mm-dd) inclusive. */
  dateFrom?: string;
  /** ISO date (yyyy-mm-dd) inclusive. */
  dateTo?: string;
  /** Free-text — matches action string and entity_id. */
  search?: string;
  /** Defaults to 200. Hard-capped at 500 to keep payloads sane. */
  limit?: number;
}

/**
 * Project the JSONB `details` blob into a uniform "old/new pair" list so
 * the viewer can render a consistent two-column diff. Recognized shapes:
 *
 *   { changes: [{ field, oldValue, newValue }, ...] }
 *   { fields: ['phone','email'], oldValues: { phone:'...' }, newValues: { phone:'...' } }
 *   { field: 'phone', oldValue: '...', newValue: '...' }
 */
function extractChanges(details: Record<string, unknown>): AuditLogEntry['changes'] {
  if (Array.isArray(details.changes)) {
    return (details.changes as Array<Record<string, unknown>>)
      .filter(c => typeof c.field === 'string')
      .map(c => ({
        field: String(c.field),
        oldValue: c.oldValue ?? c.old ?? null,
        newValue: c.newValue ?? c.new ?? null,
      }));
  }
  if (Array.isArray(details.fields)) {
    const oldVals = (details.oldValues ?? {}) as Record<string, unknown>;
    const newVals = (details.newValues ?? {}) as Record<string, unknown>;
    return (details.fields as string[]).map(field => ({
      field,
      oldValue: oldVals[field] ?? null,
      newValue: newVals[field] ?? null,
    }));
  }
  if (typeof details.field === 'string') {
    return [{
      field: details.field,
      oldValue: details.oldValue ?? null,
      newValue: details.newValue ?? null,
    }];
  }
  return [];
}

/**
 * Build a one-line human summary even when the writer didn't supply a
 * structured diff — viewers need *something* searchable in the row.
 */
function buildSummary(action: string, details: Record<string, unknown>): string {
  if (typeof details.summary === 'string') return details.summary;
  const fields = Array.isArray(details.fields) ? (details.fields as string[]) : null;
  if (fields && fields.length > 0) return `Updated ${fields.join(', ')}`;
  if (typeof details.field === 'string') return `Updated ${details.field}`;
  if (typeof details.reason === 'string') return details.reason;
  if (typeof details.title === 'string') return details.title;
  if (typeof details.name === 'string') return details.name;
  if (typeof details.newClass === 'string') {
    return `→ ${details.newClass}${details.newSection ? '-' + details.newSection : ''}`;
  }
  if (typeof details.tcNumber === 'string') return `TC ${details.tcNumber}`;
  return action.replace(/_/g, ' ');
}

export const auditService = {
  async list(params: ListAuditLogsParams = {}): Promise<AuditLogEntry[]> {
    const schoolId = getSchoolId();
    const modules = params.modules ?? DEFAULT_MODULES;
    const limit = Math.min(params.limit ?? 200, 500);

    // Empty module set means the user has cleared every filter — nothing
    // to show. Short-circuit so we don't accidentally return everything.
    if (modules.length === 0) return [];

    // Translate the requested modules back to the underlying action names.
    // The OTHER bucket is "anything not in ACTION_MODULE", which PostgREST
    // can't easily express as NOT IN, so when OTHER is selected we drop
    // the server-side `.in()` and rely on a client-side module match
    // post-filter instead. Otherwise we use a tight allow-list.
    const actionAllowList = Object.entries(ACTION_MODULE)
      .filter(([, mod]) => modules.includes(mod))
      .map(([action]) => action);
    const includeOther = modules.includes('OTHER');

    let q = supabase
      .from('audit_logs')
      .select('id, created_at, action, entity_type, entity_id, details, user_id, user:users(name, role)')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!includeOther && actionAllowList.length > 0) {
      q = q.in('action', actionAllowList);
    }
    if (params.dateFrom) {
      q = q.gte('created_at', `${params.dateFrom}T00:00:00.000Z`);
    }
    if (params.dateTo) {
      q = q.lte('created_at', `${params.dateTo}T23:59:59.999Z`);
    }
    if (params.search) {
      const s = params.search.trim();
      if (s.length > 0) {
        // entity_id is a UUID column, so we can only do a direct equality
        // match against UUID-shaped input. For anything else, scope the
        // search to the action column to avoid a server-side cast error
        // that would fail the whole query.
        const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRe.test(s)) {
          q = q.or(`action.ilike.%${s}%,entity_id.eq.${s}`);
        } else {
          q = q.ilike('action', `%${s}%`);
        }
      }
    }

    const { data, error } = await q;
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as unknown as RawRow[];
    const moduleSet = new Set(modules);
    return rows
      .map(r => {
        const details = (r.details ?? {}) as Record<string, unknown>;
        const mod = getModule(r.action);
        return {
          id: r.id,
          createdAt: r.created_at,
          action: r.action,
          module: mod,
          moduleLabel: MODULE_LABEL[mod],
          entityType: r.entity_type,
          entityId: r.entity_id,
          details,
          summary: buildSummary(r.action, details),
          changes: extractChanges(details),
          actor: {
            id: r.user_id,
            name: r.user?.name ?? 'Unknown',
            role: r.user?.role ?? null,
          },
        } satisfies AuditLogEntry;
      })
      // Final guarantee — only rows whose resolved module is in the
      // user's selection survive. This makes ['OTHER'] return only OTHER
      // rows, ['STUDENT_EDIT','OTHER'] return both, etc.
      .filter(e => moduleSet.has(e.module));
  },
};
