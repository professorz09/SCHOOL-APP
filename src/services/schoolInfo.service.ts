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
}

const KEY = 'edugrow_school_info';

const DEFAULTS: SchoolInfo = {
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
};

export const schoolInfoService = {
  get(): SchoolInfo {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch {}
    return { ...DEFAULTS };
  },
  save(info: Partial<SchoolInfo>): void {
    const current = schoolInfoService.get();
    localStorage.setItem(KEY, JSON.stringify({ ...current, ...info }));
  },
};
