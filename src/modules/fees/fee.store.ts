import { create } from 'zustand';
import { feeService } from '@/modules/fees/fee.service';

interface FeeStructure {
  id: string;
  classId: string;
  feeType: string;
  amount: number;
  [key: string]: any;
}

interface FeeStore {
  structures: FeeStructure[];
  loading: boolean;
  fetchStructures: (yearId: string) => Promise<void>;
  invalidate: () => void;
}

export const useFeeStore = create<FeeStore>((set, get) => ({
  structures: [],
  loading: false,

  fetchStructures: async (yearId: string) => {
    const current = get();
    if (current.structures.length > 0) return;
    set({ loading: true });
    try {
      const data = await feeService.getFeeStructures(yearId);
      set({ structures: data });
    } catch (e) {
      console.error('Failed to fetch fee structures', e);
      set({ structures: [] });
    } finally {
      set({ loading: false });
    }
  },

  invalidate: () => set({ structures: [], loading: false }),
}));
