import { apiPrincipal } from '@/lib/apiClient';
import type { CreateNoticeInput } from '@/modules/notices/notice.types';

export const apiNotices = {
  list:   ()                         => apiPrincipal.noticeList(),
  create: (body: CreateNoticeInput)  => apiPrincipal.noticeCreate(body),
  delete: (noticeId: string)         => apiPrincipal.noticeDelete(noticeId),
};
