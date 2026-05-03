import { create } from 'zustand';
import { AdminUser } from '@/roles/super-admin/admin.types';
import { adminService } from '@/roles/super-admin/admin.service';

interface AdminStore {
  admins: AdminUser[];
  isLoading: boolean;
  lastError: string | null;

  fetchAdmins: () => Promise<void>;
  addAdmin: (admin: AdminUser) => void;
  updateStatus: (id: string, status: AdminUser['status']) => Promise<void>;
  deleteAdmin: (id: string) => Promise<void>;
}

export const useAdminStore = create<AdminStore>((set) => ({
  admins: [],
  isLoading: false,
  lastError: null,

  fetchAdmins: async () => {
    set({ isLoading: true, lastError: null });
    try {
      const admins = await adminService.getAll();
      set({ admins });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load admins';
      set({ lastError: msg });
      throw e;
    } finally {
      set({ isLoading: false });
    }
  },

  addAdmin: (admin) => set(s => ({ admins: [...s.admins, admin] })),

  updateStatus: async (id, status) => {
    await adminService.updateStatus(id, status);
    set(s => ({
      admins: s.admins.map(a => a.id === id ? { ...a, status } : a),
    }));
  },

  deleteAdmin: async (id) => {
    await adminService.delete(id);
    // Soft-deactivate, not hard-remove — reflect the new status in the list.
    set(s => ({
      admins: s.admins.map(a => a.id === id ? { ...a, status: 'INACTIVE' } : a),
    }));
  },
}));
