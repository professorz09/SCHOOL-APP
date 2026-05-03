import { create } from 'zustand';
import { noticeService } from '@/modules/notices/notice.service';

interface Notice {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  [key: string]: any;
}

interface NoticeStore {
  notices: Notice[];
  loading: boolean;
  fetchAll: () => Promise<void>;
  invalidate: () => void;
}

export const useNoticeStore = create<NoticeStore>((set, get) => ({
  notices: [],
  loading: false,

  fetchAll: async () => {
    const current = get();
    if (current.notices.length > 0) return;
    set({ loading: true });
    try {
      const data = await noticeService.getAll();
      set({ notices: data });
    } catch (e) {
      console.error('Failed to fetch notices', e);
      set({ notices: [] });
    } finally {
      set({ loading: false });
    }
  },

  invalidate: () => set({ notices: [], loading: false }),
}));
