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
  // Branding (0080) — used by Tools (admit card / ID card / marksheet) so
  // a school can stamp its identity on every printed document.
  logoPath: string;
  principalSignaturePath: string;
  accentColor: string; // '' = unset → tools fall back to default theme
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
  logoPath: '',
  principalSignaturePath: '',
  accentColor: '',
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
  logo_path: string | null;
  principal_signature_path: string | null;
  accent_color: string | null;
}

const FIELDS = 'name, tagline, address, city, state, pin, phone, email, principal_name, affiliation_board, code, upi_id, payment_qr_path, logo_path, principal_signature_path, accent_color';

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
    logoPath: r.logo_path ?? '',
    principalSignaturePath: r.principal_signature_path ?? '',
    accentColor: r.accent_color ?? '',
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
    if (input.logoPath !== undefined) patch.logo_path = input.logoPath;
    if (input.principalSignaturePath !== undefined) patch.principal_signature_path = input.principalSignaturePath;
    if (input.accentColor !== undefined) {
      // Empty string clears the column; otherwise enforce #RRGGBB shape so
      // the DB CHECK constraint never trips.
      const v = input.accentColor.trim();
      if (v === '') {
        patch.accent_color = null;
      } else if (/^#[0-9A-Fa-f]{6}$/.test(v)) {
        patch.accent_color = v;
      } else {
        throw new Error('Accent color must be a 6-digit hex (e.g. #4f46e5)');
      }
    }

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
    return uploadAsset(file, 'payment-qr');
  },

  async uploadLogo(file: File): Promise<string> {
    return uploadAsset(file, 'logo');
  },

  async uploadPrincipalSignature(file: File): Promise<string> {
    return uploadAsset(file, 'principal-signature');
  },

  /** Resolve any school-assets path (logo / signature / payment QR) to a
   *  public URL. Returns null on empty input so callers can chain it
   *  through `<img src={url ?? undefined}/>` without extra guards. */
  getAssetUrl(path: string): string | null {
    if (!path) return null;
    const { data } = supabase.storage.from('school-assets').getPublicUrl(path);
    return data?.publicUrl ?? null;
  },

  async getPaymentQrUrl(path: string): Promise<string | null> {
    return this.getAssetUrl(path);
  },
};

async function uploadAsset(file: File, kind: 'logo' | 'principal-signature' | 'payment-qr'): Promise<string> {
  const schoolId = getSchoolId();
  if (!schoolId) throw new Error('No school in session');
  // Validate so a 50 MB phone photo doesn't bomb the bucket.
  if (!/^image\//.test(file.type)) throw new Error('Only image files are allowed');
  if (file.size > 4 * 1024 * 1024) throw new Error('Image must be under 4 MB');
  const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `${schoolId}/${kind}.${ext}`;
  const { error } = await supabase.storage.from('school-assets').upload(path, file, { upsert: true });
  if (error) throw new Error(error.message);
  return path;
}
