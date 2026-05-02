import { create } from 'zustand';
import { School, UpdateSchoolInput } from '@/shared/types/school.types';
import { schoolService } from '@/shared/services/school.service';

interface SchoolStore {
  schools: School[];
  isLoading: boolean;
  error: string | null;

  fetchSchools: () => Promise<void>;
  addSchool: (school: School) => void;
  updateSchool: (id: string, updates: UpdateSchoolInput) => Promise<void>;
  deleteSchool: (id: string) => Promise<void>;
}

export const useSchoolStore = create<SchoolStore>((set, get) => ({
  schools: [],
  isLoading: false,
  error: null,

  fetchSchools: async () => {
    set({ isLoading: true, error: null });
    try {
      const schools = await schoolService.getAll();
      set({ schools, isLoading: false });
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  addSchool: (school) => set(s => ({ schools: [...s.schools, school] })),

  updateSchool: async (id, updates) => {
    await schoolService.update(id, updates);
    set(s => ({
      schools: s.schools.map(sc => sc.id === id ? { ...sc, ...updates } : sc),
    }));
  },

  deleteSchool: async (id) => {
    await schoolService.delete(id);
    set(s => ({ schools: s.schools.filter(sc => sc.id !== id) }));
  },
}));
