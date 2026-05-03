import { logAudit } from '@/lib/audit';
import { useAuthStore } from '@/store/authStore';
import { apiNotices } from '@/modules/notices/notice.api';
import type { Notice, NoticeAudience, CreateNoticeInput } from '@/modules/notices/notice.types';

interface NoticeRow {
  id: string;
  title: string;
  body: string;
  audience: string;
  created_at: string;
  sent_by_name: string | null;
  pinned: boolean;
}

function rowToNotice(r: NoticeRow): Notice {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    audience: (r.audience as NoticeAudience) ?? 'ALL',
    sentAt: (r.created_at ?? '').slice(0, 10),
    sentBy: r.sent_by_name ?? '',
    pinned: r.pinned,
  };
}

let cache: Notice[] | null = null;

export const noticeService = {
  async getAll(): Promise<Notice[]> {
    if (cache) return cache;
    const rows = await apiNotices.list();
    cache = (rows as NoticeRow[]).map(rowToNotice);
    return cache;
  },

  async create(input: CreateNoticeInput): Promise<Notice> {
    const session = useAuthStore.getState().session;
    const raw = await apiNotices.create({
      title: input.title, body: input.body, audience: input.audience,
      pinned: input.pinned, sentBy: input.sentBy || session?.name || '',
    });
    const notice = rowToNotice(raw as NoticeRow);
    if (cache) cache = [notice, ...cache];
    await logAudit('notice_sent', 'notice', notice.id, { audience: input.audience, title: input.title });
    return notice;
  },

  async delete(id: string): Promise<void> {
    await apiNotices.delete(id);
    if (cache) cache = cache.filter(n => n.id !== id);
    await logAudit('notice_deleted', 'notice', id);
  },

  invalidate(): void {
    cache = null;
  },
};
