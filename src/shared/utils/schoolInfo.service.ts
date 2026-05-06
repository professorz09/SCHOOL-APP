import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';

export interface SchoolInfo {
  name: string;
  tagline: string;
  address: string;
  city: string;
  state: string;
  pin: string;
  phone: string;
  email: string;
  principalName: string;
  affiliationBoard: string;
  schoolCode: string;
  upiId: string;
  paymentQrPath: string;
}

const EMPTY: SchoolInfo = {
  name: '',
  tagline: '',
  address: '',
  city: '',
  state: '',
  pin: '',
  phone: '',
  email: '',
  principalName: '',
  affiliationBoard: 'CBSE',
  schoolCode: '',
  upiId: '',
  paymentQrPath: '',
};

interface SchoolRow {
  name: string;
  tagline: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pin: string | null;
  phone: string | null;
  email: string | null;
  principal_name: string | null;
  affiliation_board: string | null;
  code: string;
  upi_id: string | null;
  payment_qr_path: string | null;
}

const FIELDS = 'name, tagline, address, city, state, pin, phone, email, principal_name, affiliation_board, code, upi_id, payment_qr_path';

function rowToInfo(r: SchoolRow): SchoolInfo {
  return {
    name: r.name ?? '',
    tagline: r.tagline ?? '',
    address: r.address ?? '',
    city: r.city ?? '',
    state: r.state ?? '',
    pin: r.pin ?? '',
    phone: r.phone ?? '',
    email: r.email ?? '',
    principalName: r.principal_name ?? '',
    affiliationBoard: r.affiliation_board ?? 'CBSE',
    schoolCode: r.code ?? '',
    upiId: r.upi_id ?? '',
    paymentQrPath: r.payment_qr_path ?? '',
  };
}

function getSchoolId(): string | null {
  return useAuthStore.getState().session?.schoolId ?? null;
}

export const schoolInfoService = {
  async get(): Promise<SchoolInfo> {
    const schoolId = getSchoolId();
    if (!schoolId) return { ...EMPTY };
    const { data, error } = await supabase
      .from('schools')
      .select(FIELDS)
      .eq('id', schoolId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { ...EMPTY };
    return rowToInfo(data as SchoolRow);
  },

  async save(input: Partial<SchoolInfo>): Promise<SchoolInfo> {
    const schoolId = getSchoolId();
    if (!schoolId) throw new Error('No school in session');
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (input.name !== undefined) patch.name = input.name;
    if (input.tagline !== undefined) patch.tagline = input.tagline;
    if (input.address !== undefined) patch.address = input.address;
    if (input.city !== undefined) patch.city = input.city;
    if (input.state !== undefined) patch.state = input.state;
    if (input.pin !== undefined) patch.pin = input.pin;
    if (input.phone !== undefined) patch.phone = input.phone;
    if (input.email !== undefined) patch.email = input.email;
    if (input.principalName !== undefined) patch.principal_name = input.principalName;
    if (input.affiliationBoard !== undefined) patch.affiliation_board = input.affiliationBoard;
    if (input.upiId !== undefined) patch.upi_id = input.upiId;
    if (input.paymentQrPath !== undefined) patch.payment_qr_path = input.paymentQrPath;

    const { data, error } = await supabase
      .from('schools')
      .update(patch)
      .eq('id', schoolId)
      .select(FIELDS)
      .single();
    if (error) throw new Error(error.message);
    await logAudit('update_school_info', 'school', schoolId, patch);
    return rowToInfo(data as SchoolRow);
  },

  async uploadPaymentQr(file: File): Promise<string> {
    const schoolId = getSchoolId();
    if (!schoolId) throw new Error('No school in session');
    const ext = file.name.split('.').pop() || 'png';
    const path = `${schoolId}/payment-qr.${ext}`;
    const { error } = await supabase.storage.from('school-assets').upload(path, file, { upsert: true });
    if (error) throw new Error(error.message);
    return path;
  },

  async getPaymentQrUrl(path: string): Promise<string | null> {
    if (!path) return null;
    const { data } = supabase.storage.from('school-assets').getPublicUrl(path);
    return data?.publicUrl ?? null;
  },
};
