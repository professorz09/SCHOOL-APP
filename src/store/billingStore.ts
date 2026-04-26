import { create } from 'zustand';
import { BillingRecord, PaymentHistoryEntry } from '../types/billing.types';
import { billingService } from '../services/billing.service';

interface BillingStore {
  records: BillingRecord[];
  history: PaymentHistoryEntry[];
  isLoading: boolean;

  fetchAll: () => Promise<void>;
  markPaid: (id: string, txnId: string) => Promise<void>;
  addRecord: (record: BillingRecord) => void;
  deleteRecord: (id: string) => Promise<void>;
}

export const useBillingStore = create<BillingStore>((set) => ({
  records: [],
  history: [],
  isLoading: false,

  fetchAll: async () => {
    set({ isLoading: true });
    const [records, history] = await Promise.all([
      billingService.getAll(),
      billingService.getPaymentHistory(),
    ]);
    set({ records, history, isLoading: false });
  },

  markPaid: async (id, txnId) => {
    const updated = await billingService.markPaid(id, txnId);
    set(s => ({
      records: s.records.map(r => r.id === id ? updated : r),
    }));
  },

  addRecord: (record) => set(s => ({ records: [...s.records, record] })),

  deleteRecord: async (id) => {
    await billingService.delete(id);
    set(s => ({ records: s.records.filter(r => r.id !== id) }));
  },
}));
