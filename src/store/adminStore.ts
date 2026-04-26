import { create } from 'zustand';
import { AdminUser } from '../types/admin.types';
import { adminService } from '../services/admin.service';

interface AdminStore {
  admins: AdminUser[];
  isLoading: boolean;

  fetchAdmins: () => Promise<void>;
  addAdmin: (admin: AdminUser) => void;
  updateStatus: (id: string, status: AdminUser['status']) => Promise<void>;
  deleteAdmin: (id: string) => Promise<void>;
}

export const useAdminStore = create<AdminStore>((set) => ({
  admins: [],
  isLoading: false,

  fetchAdmins: async () => {
    set({ isLoading: true });
    const admins = await adminService.getAll();
    set({ admins, isLoading: false });
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
    set(s => ({ admins: s.admins.filter(a => a.id !== id) }));
  },
}));
