import { create } from 'zustand';
import { studentService } from '@/modules/students/student.service';

interface Student {
  id: string;
  name: string;
  admissionNo?: string;
  className?: string;
  section?: string;
  [key: string]: any;
}

interface StudentStore {
  list: Student[];
  loading: boolean;
  fetchList: (yearId: string) => Promise<void>;
  invalidate: () => void;
}

export const useStudentStore = create<StudentStore>((set, get) => ({
  list: [],
  loading: false,

  fetchList: async (yearId: string) => {
    const current = get();
    if (current.list.length > 0) return;
    set({ loading: true });
    try {
      const data = await studentService.getAll();
      set({ list: data });
    } catch (e) {
      console.error('Failed to fetch students', e);
      set({ list: [] });
    } finally {
      set({ loading: false });
    }
  },

  invalidate: () => set({ list: [], loading: false }),
}));
