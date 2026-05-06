// Shared helper that lets any role's UI surface platform-level broadcasts
// (super-admin → schools). Audience field is 'ALL' | 'PRINCIPALS' |
// 'TEACHERS' | 'STUDENTS'. RLS (migration 0055) already scopes broadcasts
// to the caller's school via `target_schools`; this helper layers on top
// to also filter by role-specific audience.

import { supabase } from '@/lib/supabase';

export interface RelevantBroadcast {
  id: string;
  title: string;
  body: string;
  audience: 'ALL' | 'PRINCIPALS' | 'TEACHERS' | 'STUDENTS';
  sentAt: string | null;
  senderName: string | null;
}

const ROLE_TO_AUDIENCE: Record<string, RelevantBroadcast['audience']> = {
  PRINCIPAL: 'PRINCIPALS',
  TEACHER:   'TEACHERS',
  STUDENT:   'STUDENTS',
  PARENT:    'STUDENTS', // parents see student-targeted broadcasts.
};

/**
 * Fetch broadcasts the current user should see, sorted newest-first.
 * Returns ≤ `limit` rows (default 20).
 */
export async function getRelevantBroadcasts(role: string, limit = 20): Promise<RelevantBroadcast[]> {
  const targetAudience = ROLE_TO_AUDIENCE[role];
  // SUPER_ADMIN doesn't normally consume broadcasts (they manage them in
  // the dedicated tab). DRIVER and other roles aren't a broadcast audience.
  if (!targetAudience) return [];

  const { data, error } = await supabase
    .from('broadcasts')
    .select('id, title, message, audience, sent_at, sender:sent_by(name)')
    .in('audience', ['ALL', targetAudience])
    .eq('status', 'SENT')
    .order('sent_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as Array<{
    id: string; title: string; message: string; audience: RelevantBroadcast['audience'];
    sent_at: string | null;
    sender: { name: string | null } | { name: string | null }[] | null;
  }>).map(r => {
    const sender = Array.isArray(r.sender) ? r.sender[0] : r.sender;
    return {
      id: r.id,
      title: r.title,
      body: r.message,
      audience: r.audience,
      sentAt: r.sent_at,
      senderName: sender?.name ?? null,
    };
  });
}
