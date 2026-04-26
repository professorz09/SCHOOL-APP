import { School, CreateSchoolInput, UpdateSchoolInput } from '../types/school.types';
import { SchoolStatus, BillingPlan, PaymentStatus } from '../config/constants';

// ---------------------------------------------------------------------------
// Mock seed data — swap each function body for supabase.from('schools') calls
// ---------------------------------------------------------------------------
export const MOCK_SCHOOLS: School[] = [
  {
    id: 's1',
    name: 'Delhi Public School',
    code: 'DPS-01',
    location: 'New Delhi',
    address: 'Sector 3, Dwarka, New Delhi 110078',
    phone: '+91 98765 43210',
    principalName: 'Dr. Rajesh Kumar',
    principalEmail: 'principal@dps.edu.in',
    principalPhone: '+91 91234 56780',
    status: SchoolStatus.ACTIVE,
    plan: BillingPlan.PREMIUM,
    studentCount: 2400,
    teacherCount: 120,
    paymentStatus: PaymentStatus.PAID,
    paymentStartDate: '2024-04-01',
    createdAt: '2023-04-01',
    academicYears: [
      {
        id: 'ay1',
        label: '2024-2025',
        startDate: '2024-04-01',
        endDate: '2025-03-31',
        isActive: true,
        totalStudents: 2400,
        totalRevenue: 12000000,
        totalExpense: 4500000,
        sections: [
          { id: 'sec1', className: 'Class 10', section: 'A', studentCount: 40, classTeacher: 'Aarti Desai', students: [] },
          { id: 'sec2', className: 'Class 10', section: 'B', studentCount: 38, classTeacher: 'Sanjay Mehta', students: [] },
          { id: 'sec3', className: 'Class 9', section: 'A', studentCount: 42, classTeacher: 'Priya Singh', students: [] },
        ],
      },
      {
        id: 'ay2',
        label: '2023-2024',
        startDate: '2023-04-01',
        endDate: '2024-03-31',
        isActive: false,
        totalStudents: 2200,
        totalRevenue: 10500000,
        totalExpense: 4000000,
        sections: [],
      },
    ],
  },
  {
    id: 's2',
    name: 'Greenwood High School',
    code: 'GWH-02',
    location: 'Bangalore',
    address: 'Koramangala 5th Block, Bangalore 560095',
    phone: '+91 80 4567 8901',
    principalName: 'Vikram Singh',
    principalEmail: 'principal@greenwood.edu.in',
    principalPhone: '+91 98765 11223',
    status: SchoolStatus.ACTIVE,
    plan: BillingPlan.STANDARD,
    studentCount: 850,
    teacherCount: 45,
    paymentStatus: PaymentStatus.PAID,
    paymentStartDate: '2024-04-01',
    createdAt: '2023-06-15',
    academicYears: [
      {
        id: 'ay3',
        label: '2024-2025',
        startDate: '2024-04-01',
        endDate: '2025-03-31',
        isActive: true,
        totalStudents: 850,
        totalRevenue: 4250000,
        totalExpense: 1800000,
        sections: [
          { id: 'sec4', className: 'Class 8', section: 'A', studentCount: 36, classTeacher: 'Meera Reddy', students: [] },
        ],
      },
    ],
  },
  {
    id: 's3',
    name: 'Sunrise Valley Academy',
    code: 'SVA-03',
    location: 'Pune',
    address: 'Baner Road, Pune 411045',
    phone: '+91 20 6789 0123',
    principalName: 'Anjali Sharma',
    principalEmail: 'principal@sunrisevalley.edu.in',
    principalPhone: '+91 94567 89012',
    status: SchoolStatus.ACTIVE,
    plan: BillingPlan.BASIC,
    studentCount: 420,
    teacherCount: 22,
    paymentStatus: PaymentStatus.PENDING,
    paymentStartDate: '2024-04-01',
    createdAt: '2023-08-01',
    academicYears: [
      {
        id: 'ay4',
        label: '2024-2025',
        startDate: '2024-04-01',
        endDate: '2025-03-31',
        isActive: true,
        totalStudents: 420,
        totalRevenue: 1890000,
        totalExpense: 820000,
        sections: [],
      },
    ],
  },
  {
    id: 's4',
    name: "St. Mary's Convent",
    code: 'SMC-04',
    location: 'Mumbai',
    address: 'Bandra West, Mumbai 400050',
    phone: '+91 22 2640 1234',
    principalName: 'Sr. Catherine D\'Souza',
    principalEmail: 'principal@stmarys.edu.in',
    principalPhone: '+91 99876 54321',
    status: SchoolStatus.ACTIVE,
    plan: BillingPlan.PREMIUM,
    studentCount: 1800,
    teacherCount: 95,
    paymentStatus: PaymentStatus.PAID,
    paymentStartDate: '2024-04-01',
    createdAt: '2022-11-10',
    academicYears: [
      {
        id: 'ay5',
        label: '2024-2025',
        startDate: '2024-04-01',
        endDate: '2025-03-31',
        isActive: true,
        totalStudents: 1800,
        totalRevenue: 9000000,
        totalExpense: 3200000,
        sections: [],
      },
    ],
  },
  {
    id: 's5',
    name: 'Heritage International School',
    code: 'HIS-05',
    location: 'Hyderabad',
    address: 'Jubilee Hills, Hyderabad 500033',
    phone: '+91 40 2355 6789',
    principalName: 'Ravi Teja Naidu',
    principalEmail: 'principal@heritage.edu.in',
    principalPhone: '+91 98765 22334',
    status: SchoolStatus.ACTIVE,
    plan: BillingPlan.STANDARD,
    studentCount: 960,
    teacherCount: 52,
    paymentStatus: PaymentStatus.OVERDUE,
    paymentStartDate: '2024-04-01',
    createdAt: '2023-03-20',
    academicYears: [
      {
        id: 'ay6',
        label: '2024-2025',
        startDate: '2024-04-01',
        endDate: '2025-03-31',
        isActive: true,
        totalStudents: 960,
        totalRevenue: 4800000,
        totalExpense: 2100000,
        sections: [],
      },
    ],
  },
  {
    id: 's6',
    name: 'Oakridge International',
    code: 'ORI-06',
    location: 'Chennai',
    address: 'Anna Nagar, Chennai 600040',
    phone: '+91 44 2626 7890',
    principalName: 'Dr. Lakshmi Iyer',
    principalEmail: 'principal@oakridge.edu.in',
    principalPhone: '+91 97654 32109',
    status: SchoolStatus.TRIAL,
    plan: BillingPlan.PREMIUM,
    studentCount: 310,
    teacherCount: 18,
    paymentStatus: PaymentStatus.PENDING,
    paymentStartDate: '2025-02-01',
    createdAt: '2025-02-01',
    academicYears: [
      {
        id: 'ay7',
        label: '2024-2025',
        startDate: '2024-04-01',
        endDate: '2025-03-31',
        isActive: true,
        totalStudents: 310,
        totalRevenue: 0,
        totalExpense: 0,
        sections: [],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Service functions (async — ready for Supabase replacement)
// ---------------------------------------------------------------------------
let _db: School[] = [...MOCK_SCHOOLS];

export const schoolService = {
  async getAll(): Promise<School[]> {
    return [..._db];
  },

  async getById(id: string): Promise<School | null> {
    return _db.find(s => s.id === id) ?? null;
  },

  async create(input: CreateSchoolInput): Promise<School> {
    const school: School = {
      ...input,
      id: `s${Date.now()}`,
      studentCount: 0,
      teacherCount: 0,
      paymentStatus: PaymentStatus.PENDING,
      paymentStartDate: input.paymentStartDate ?? new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString().split('T')[0],
      academicYears: [
        {
          id: `ay${Date.now()}`,
          label: '2024-2025',
          startDate: '2024-04-01',
          endDate: '2025-03-31',
          isActive: true,
          totalStudents: 0,
          totalRevenue: 0,
          totalExpense: 0,
          sections: [],
        },
      ],
    };
    _db = [..._db, school];
    return school;
  },

  async update(id: string, input: UpdateSchoolInput): Promise<School> {
    _db = _db.map(s => s.id === id ? { ...s, ...input } : s);
    return _db.find(s => s.id === id)!;
  },

  async delete(id: string): Promise<void> {
    _db = _db.filter(s => s.id !== id);
  },
};
