import { StaffMember, SalaryPayment } from '../types/principal.types';

const MOCK_STAFF: StaffMember[] = [
  {
    id: 'staff1', name: 'Aarti Desai', role: 'TEACHER', subject: 'Mathematics',
    phone: '+91 98001 11111', email: 'aarti@school.edu.in', aadhaarNo: '1122 3344 5566',
    salary: 45000, joiningDate: '2020-04-01', status: 'ACTIVE',
    assignedClasses: ['Class 10-A', 'Class 10-B'], address: '34, Saket, Delhi',
    photo: '',
    salaryHistory: [
      { id: 's1a', month: 'October 2024', amount: 45000, paidAt: '2024-10-31', transactionId: 'TXN-OCT-S1', note: '' },
      { id: 's1b', month: 'September 2024', amount: 45000, paidAt: '2024-09-30', transactionId: 'TXN-SEP-S1', note: '' },
      { id: 's1c', month: 'August 2024', amount: 45000, paidAt: '2024-08-31', transactionId: 'TXN-AUG-S1', note: '' },
    ],
  },
  {
    id: 'staff2', name: 'Sanjay Mehta', role: 'TEACHER', subject: 'Science',
    phone: '+91 98001 22222', email: 'sanjay@school.edu.in', aadhaarNo: '2233 4455 6677',
    salary: 42000, joiningDate: '2019-06-01', status: 'ACTIVE',
    assignedClasses: ['Class 9-A', 'Class 10-A'], address: '12, Pitampura, Delhi',
    photo: '',
  },
  {
    id: 'staff3', name: 'Priya Singh', role: 'TEACHER', subject: 'English',
    phone: '+91 98001 33333', email: 'priya@school.edu.in', aadhaarNo: '3344 5566 7788',
    salary: 40000, joiningDate: '2021-04-01', status: 'ON_LEAVE',
    assignedClasses: ['Class 9-B'], address: '67, Rohini, Delhi',
    photo: '',
  },
  {
    id: 'staff4', name: 'Rahul Verma', role: 'ACCOUNTANT', subject: '—',
    phone: '+91 98001 44444', email: 'rahul@school.edu.in', aadhaarNo: '4455 6677 8899',
    salary: 35000, joiningDate: '2018-09-01', status: 'ACTIVE',
    assignedClasses: [], address: '89, Janakpuri, Delhi',
    photo: '',
  },
  {
    id: 'staff5', name: 'Meena Kapoor', role: 'LIBRARIAN', subject: '—',
    phone: '+91 98001 55555', email: 'meena@school.edu.in', aadhaarNo: '5566 7788 9900',
    salary: 28000, joiningDate: '2022-01-15', status: 'ACTIVE',
    assignedClasses: [], address: '11, Karol Bagh, Delhi',
    photo: '',
  },
  {
    id: 'staff6', name: 'Rajan Kumar', role: 'DRIVER', subject: '—',
    phone: '+91 98001 66666', email: 'rajan@school.edu.in', aadhaarNo: '6677 8899 0011',
    salary: 22000, joiningDate: '2020-07-01', status: 'ACTIVE',
    assignedClasses: [], address: '55, Uttam Nagar, Delhi',
    photo: '',
  },
  {
    id: 'staff7', name: 'Ankit Jha', role: 'LAB_INCHARGE', subject: 'Physics',
    phone: '+91 98001 77777', email: 'ankit@school.edu.in', aadhaarNo: '7788 9900 1122',
    salary: 38000, joiningDate: '2021-08-01', status: 'SUSPENDED',
    assignedClasses: [], address: '23, Shahdara, Delhi',
    photo: '',
  },
];

let _staff: StaffMember[] = [...MOCK_STAFF];

export const staffService = {
  async getAll(): Promise<StaffMember[]> {
    return [..._staff];
  },

  async getById(id: string): Promise<StaffMember | null> {
    return _staff.find(s => s.id === id) ?? null;
  },

  async create(input: Omit<StaffMember, 'id'>): Promise<StaffMember> {
    const member: StaffMember = { ...input, id: `staff${Date.now()}` };
    _staff = [..._staff, member];
    return member;
  },

  async update(id: string, input: Partial<StaffMember>): Promise<StaffMember> {
    _staff = _staff.map(s => s.id === id ? { ...s, ...input } : s);
    return _staff.find(s => s.id === id)!;
  },

  async suspend(id: string): Promise<StaffMember> {
    return this.update(id, { status: 'SUSPENDED' });
  },

  async reinstate(id: string): Promise<StaffMember> {
    return this.update(id, { status: 'ACTIVE' });
  },

  async delete(id: string): Promise<void> {
    _staff = _staff.filter(s => s.id !== id);
  },

  async paySalary(id: string, month: string, note: string): Promise<StaffMember> {
    const member = _staff.find(s => s.id === id);
    if (!member) throw new Error('Staff not found');
    const payment: SalaryPayment = {
      id: `sal${Date.now()}`,
      month,
      amount: member.salary,
      paidAt: new Date().toISOString().split('T')[0],
      transactionId: `TXN-${Date.now()}`,
      note,
    };
    const updated = { ...member, salaryHistory: [payment, ...(member.salaryHistory || [])] };
    _staff = _staff.map(s => s.id === id ? updated : s);
    return updated;
  },
};
