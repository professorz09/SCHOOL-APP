import { create } from 'zustand';
import { SystemLog } from '../types/logs.types';
import { logsService } from '../services/logs.service';
import { LogType } from '../config/constants';

interface LogsStore {
  logs: SystemLog[];
  isLoading: boolean;
  activeFilter: LogType | 'ALL';

  fetchLogs: () => Promise<void>;
  setFilter: (filter: LogType | 'ALL') => void;
  addLog: (log: Omit<SystemLog, 'id' | 'timestamp'>) => Promise<void>;
}

export const useLogsStore = create<LogsStore>((set) => ({
  logs: [],
  isLoading: false,
  activeFilter: 'ALL',

  fetchLogs: async () => {
    set({ isLoading: true });
    const logs = await logsService.getAll();
    set({ logs, isLoading: false });
  },

  setFilter: (filter) => set({ activeFilter: filter }),

  addLog: async (log) => {
    await logsService.addLog(log);
    const logs = await logsService.getAll();
    set({ logs });
  },
}));
