import { create } from 'zustand';
import { SystemLog } from '@/shared/types/logs.types';
import { logsService } from '@/roles/super-admin/logs.service';
import { LogType } from '@/shared/config/constants';

interface LogsStore {
  logs: SystemLog[];
  isLoading: boolean;
  activeFilter: LogType | 'ALL';
  lastError: string | null;

  fetchLogs: () => Promise<void>;
  setFilter: (filter: LogType | 'ALL') => void;
  addLog: (log: Omit<SystemLog, 'id' | 'timestamp'>) => Promise<void>;
}

export const useLogsStore = create<LogsStore>((set) => ({
  logs: [],
  isLoading: false,
  activeFilter: 'ALL',
  lastError: null,

  fetchLogs: async () => {
    set({ isLoading: true, lastError: null });
    try {
      const logs = await logsService.getAll();
      set({ logs });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load logs';
      set({ lastError: msg });
      throw e;
    } finally {
      set({ isLoading: false });
    }
  },

  setFilter: (filter) => set({ activeFilter: filter }),

  addLog: async (log) => {
    await logsService.addLog(log);
    const logs = await logsService.getAll();
    set({ logs });
  },
}));
