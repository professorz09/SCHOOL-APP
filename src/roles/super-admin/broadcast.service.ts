// Supabase-backed broadcast service. Reach count is derived from the
// active-user counts at send time and cached on the broadcast row.

import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { Broadcast, CreateBroadcastInput, BroadcastStatus } from '@/shared/types/broadcast.types';
import { BroadcastAudience } from '@/shared/config/constants';

interface BroadcastRow {
  id: string;
  title: string;
  message: string;
  audience: string;
  status: string;
  reach_count: number;
  sent_at: string | null;
  scheduled_at: string | null;
  sent_by: string | null;
  sender: { name: string | null; email: string | null } | null;
}

const SELECT_COLS =
  'id, title, message, audience, status, reach_count, sent_at, scheduled_at, sent_by, sender:sent_by(name, email)';

function fmtDateTime(ts: string | null): string | null {
  if (!ts) return null;
  return new Date(ts).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function rowToBroadcast(r: BroadcastRow): Broadcast {
  return {
    id: r.id,
    title: r.title,
    body: r.message,
    audience: (r.audience as BroadcastAudience) ?? BroadcastAudience.ALL,
    status: ((r.status as BroadcastStatus) ?? 'SENT'),
    sentAt: fmtDateTime(r.sent_at),
    scheduledAt: fmtDateTime(r.scheduled_at),
    createdBy: r.sender?.email ?? r.sender?.name ?? 'system',
    createdAt: (r.sent_at ?? r.scheduled_at ?? new Date().toISOString()).slice(0, 10),
    reachCount: r.reach_count ?? 0,
  };
}

async function computeReach(audience: BroadcastAudience): Promise<number> {
  let q = supabase.from('users').select('*', { count: 'exact', head: true }).eq('is_active', true);
  switch (audience) {
    case BroadcastAudience.PRINCIPALS: q = q.eq('role', 'PRINCIPAL'); break;
    case BroadcastAudience.TEACHERS:   q = q.eq('role', 'TEACHER');   break;
    case BroadcastAudience.STUDENTS:   q = q.eq('role', 'STUDENT');   break;
    case BroadcastAudience.ALL:        /* no filter */                break;
  }
  const { count, error } = await q;
  if (error) return 0;
  return count ?? 0;
}

export const broadcastService = {
  async getAll(): Promise<Broadcast[]> {
    const { data, error } = await supabase
      .from('broadcasts')
      .select(SELECT_COLS)
      .order('sent_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => rowToBroadcast(r as unknown as BroadcastRow));
  },

  async send(input: CreateBroadcastInput): Promise<Broadcast> {
    const reach = await computeReach(input.audience);
    const status: BroadcastStatus = input.scheduledAt ? 'SCHEDULED' : 'SENT';
    const now = new Date().toISOString();

    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('broadcasts')
      .insert({
        sent_by: user?.id ?? null,
        title: input.title,
        message: input.body,
        audience: input.audience,
        status,
        reach_count: reach,
        sent_at: status === 'SENT' ? now : null,
        scheduled_at: input.scheduledAt ?? null,
        target_schools: null,
      })
      .select(SELECT_COLS)
      .single();
    if (error) throw new Error(error.message);

    const row = data as unknown as BroadcastRow;
    await logAudit('send_broadcast', 'broadcast', row.id, {
      title: input.title, audience: input.audience, reach_count: reach,
    });
    return rowToBroadcast(row);
  },

  async delete(id: string): Promise<void> {
    const { data: row } = await supabase
      .from('broadcasts').select('title').eq('id', id).maybeSingle();
    const { error } = await supabase.from('broadcasts').delete().eq('id', id);
    if (error) throw new Error(error.message);
    await logAudit('delete_broadcast', 'broadcast', id, { title: row?.title ?? '' });
  },
};
