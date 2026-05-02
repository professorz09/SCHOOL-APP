import { create } from 'zustand';
import { Broadcast, CreateBroadcastInput } from '@/shared/types/broadcast.types';
import { broadcastService } from '@/roles/super-admin/broadcast.service';

interface BroadcastStore {
  broadcasts: Broadcast[];
  isLoading: boolean;
  isSending: boolean;
  lastError: string | null;

  fetchBroadcasts: () => Promise<void>;
  send: (input: CreateBroadcastInput) => Promise<void>;
  delete: (id: string) => Promise<void>;
}

export const useBroadcastStore = create<BroadcastStore>((set) => ({
  broadcasts: [],
  isLoading: false,
  isSending: false,
  lastError: null,

  fetchBroadcasts: async () => {
    set({ isLoading: true, lastError: null });
    try {
      const broadcasts = await broadcastService.getAll();
      set({ broadcasts });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load broadcasts';
      set({ lastError: msg });
      throw e;
    } finally {
      set({ isLoading: false });
    }
  },

  send: async (input) => {
    set({ isSending: true });
    try {
      const broadcast = await broadcastService.send(input);
      set(s => ({ broadcasts: [broadcast, ...s.broadcasts] }));
    } finally {
      set({ isSending: false });
    }
  },

  delete: async (id) => {
    await broadcastService.delete(id);
    set(s => ({ broadcasts: s.broadcasts.filter(b => b.id !== id) }));
  },
}));
