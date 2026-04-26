import { create } from 'zustand';
import { Broadcast, CreateBroadcastInput } from '../types/broadcast.types';
import { broadcastService } from '../services/broadcast.service';

interface BroadcastStore {
  broadcasts: Broadcast[];
  isLoading: boolean;
  isSending: boolean;

  fetchBroadcasts: () => Promise<void>;
  send: (input: CreateBroadcastInput) => Promise<void>;
  delete: (id: string) => Promise<void>;
}

export const useBroadcastStore = create<BroadcastStore>((set) => ({
  broadcasts: [],
  isLoading: false,
  isSending: false,

  fetchBroadcasts: async () => {
    set({ isLoading: true });
    const broadcasts = await broadcastService.getAll();
    set({ broadcasts, isLoading: false });
  },

  send: async (input) => {
    set({ isSending: true });
    const broadcast = await broadcastService.send(input);
    set(s => ({ broadcasts: [broadcast, ...s.broadcasts], isSending: false }));
  },

  delete: async (id) => {
    await broadcastService.delete(id);
    set(s => ({ broadcasts: s.broadcasts.filter(b => b.id !== id) }));
  },
}));
