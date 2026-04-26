import { Complaint, Expense, Notice, Approval, LibraryBook, LabEquipment, Vehicle, AcademicYearConfig } from '../types/principal.types';

// ─── COMPLAINTS ─────────────────────────────────────────────────────────────

const MOCK_COMPLAINTS: Complaint[] = [
  {
    id: 'c1', from: 'STUDENT', fromName: 'Aakash Sharma', fromClass: 'Class 10-A',
    subject: 'Classroom fan not working', description: 'The ceiling fan in room 12 has been broken for 2 weeks.',
    status: 'OPEN', createdAt: '2024-10-05', resolvedAt: null, response: null,
  },
  {
    id: 'c2', from: 'TEACHER', fromName: 'Priya Singh', fromClass: undefined,
    subject: 'Projector issue in Class 9-B', description: 'The projector is malfunctioning. We cannot show digital content.',
    status: 'IN_PROGRESS', createdAt: '2024-10-08', resolvedAt: null, response: 'Repair team scheduled for Thursday.',
  },
  {
    id: 'c3', from: 'PARENT', fromName: 'Vijay Gupta (Parent of Priya)', fromClass: 'Class 10-A',
    subject: 'Concern about homework load', description: 'Excessive homework is affecting student health.',
    status: 'RESOLVED', createdAt: '2024-09-20', resolvedAt: '2024-09-25', response: 'Discussed with teachers. Homework schedule revised.',
  },
];

// ─── EXPENSES ──────────────────────────────────────────────────────────────

const MOCK_EXPENSES: Expense[] = [
  { id: 'exp1', category: 'MAINTENANCE', description: 'Roof repair — Block B', amount: 85000, date: '2024-10-02', approvedBy: 'Dr. Rajesh Kumar' },
  { id: 'exp2', category: 'UTILITIES', description: 'Electricity bill — October', amount: 22500, date: '2024-10-05', approvedBy: 'Rahul Verma' },
  { id: 'exp3', category: 'SUPPLIES', description: 'Science lab chemicals restocking', amount: 18000, date: '2024-10-10', approvedBy: 'Dr. Rajesh Kumar' },
  { id: 'exp4', category: 'EVENTS', description: 'Annual Sports Day arrangements', amount: 45000, date: '2024-10-15', approvedBy: 'Dr. Rajesh Kumar' },
  { id: 'exp5', category: 'SALARY', description: 'October staff salaries', amount: 425000, date: '2024-10-31', approvedBy: 'Rahul Verma' },
];

// ─── NOTICES ───────────────────────────────────────────────────────────────

const MOCK_NOTICES: Notice[] = [
  {
    id: 'n1', title: 'Mid-Term Exam Schedule Released', body: 'Mid-term exams will be held from 15-25 November 2024. All students must carry their admit cards.',
    audience: 'ALL', sentAt: '2024-10-12', sentBy: 'Dr. Rajesh Kumar', pinned: true,
  },
  {
    id: 'n2', title: 'Parent-Teacher Meeting — 20 Oct', body: 'PTM scheduled for October 20, 2024 (10 AM – 2 PM). Attendance is mandatory.',
    audience: 'PARENTS', sentAt: '2024-10-08', sentBy: 'Dr. Rajesh Kumar', pinned: false,
  },
  {
    id: 'n3', title: 'Staff Meeting — Friday 4 PM', body: 'Monthly staff meeting in the conference hall. Attendance compulsory.',
    audience: 'TEACHERS', sentAt: '2024-10-10', sentBy: 'Dr. Rajesh Kumar', pinned: false,
  },
];

// ─── APPROVALS ─────────────────────────────────────────────────────────────

const MOCK_APPROVALS: Approval[] = [
  {
    id: 'ap1', type: 'LEAVE', fromName: 'Priya Singh', fromRole: 'TEACHER',
    subject: 'Medical leave — 18–20 Oct', description: 'Fever and flu. Attached medical certificate.',
    status: 'PENDING', createdAt: '2024-10-15', attachmentUrl: null,
  },
  {
    id: 'ap2', type: 'FEE_PAYMENT', fromName: 'Priya Gupta', fromRole: 'STUDENT',
    subject: 'Q2 Fee payment screenshot', description: 'UPI transfer ₹15,000 done. Screenshot attached.',
    status: 'PENDING', createdAt: '2024-10-14', attachmentUrl: 'screenshot.png',
  },
  {
    id: 'ap3', type: 'ATTENDANCE_CORRECTION', fromName: 'Mohammed Raza', fromRole: 'STUDENT',
    subject: 'Absent on Oct 10 — medical reason', description: 'Was hospitalised. Doctor certificate attached.',
    status: 'APPROVED', createdAt: '2024-10-12', attachmentUrl: null,
  },
];

// ─── LIBRARY ───────────────────────────────────────────────────────────────

const MOCK_BOOKS: LibraryBook[] = [
  {
    id: 'bk1', title: 'Mathematics Part I — NCERT', author: 'NCERT', isbn: '978-81-7450-XXX',
    subject: 'Mathematics', totalCopies: 30, availableCopies: 24,
    issuedTo: [
      { studentId: 'stu1', studentName: 'Aakash Sharma', issuedAt: '2024-09-01', dueDate: '2024-10-01', returnedAt: null },
    ],
  },
  {
    id: 'bk2', title: 'Science Part II — NCERT', author: 'NCERT', isbn: '978-81-7450-YYY',
    subject: 'Science', totalCopies: 28, availableCopies: 26,
    issuedTo: [],
  },
  {
    id: 'bk3', title: 'English Literature', author: 'CBSE Board', isbn: '978-81-7450-ZZZ',
    subject: 'English', totalCopies: 25, availableCopies: 25,
    issuedTo: [],
  },
];

// ─── LAB EQUIPMENT ─────────────────────────────────────────────────────────

const MOCK_EQUIPMENT: LabEquipment[] = [
  { id: 'eq1', name: 'Microscope', labType: 'SCIENCE', quantity: 15, workingCount: 13, lastServiced: '2024-08-01' },
  { id: 'eq2', name: 'Bunsen Burner', labType: 'SCIENCE', quantity: 20, workingCount: 18, lastServiced: '2024-06-15' },
  { id: 'eq3', name: 'Computer Workstation', labType: 'COMPUTER', quantity: 30, workingCount: 28, lastServiced: '2024-09-01' },
  { id: 'eq4', name: 'Digital Projector', labType: 'LANGUAGE', quantity: 2, workingCount: 1, lastServiced: '2024-07-20' },
];

// ─── VEHICLES ──────────────────────────────────────────────────────────────

const MOCK_VEHICLES: Vehicle[] = [
  {
    id: 'v1', vehicleNo: 'DL-01-CA-1234', type: 'BUS', capacity: 50,
    driverName: 'Rajan Kumar', driverPhone: '+91 98001 66666',
    route: 'Route A — Dwarka Sector 7', routeStops: ['Dwarka Sec 7', 'Uttam Nagar', 'Janakpuri', 'School'],
    studentsAssigned: 42,
  },
  {
    id: 'v2', vehicleNo: 'DL-01-CB-5678', type: 'VAN', capacity: 12,
    driverName: 'Suresh Yadav', driverPhone: '+91 98001 77777',
    route: 'Route B — Rohini', routeStops: ['Rohini Sec 10', 'Pitampura', 'Shalimar Bagh', 'School'],
    studentsAssigned: 10,
  },
];

// ─── ACADEMIC YEAR CONFIG ──────────────────────────────────────────────────

const MOCK_AY_CONFIG: AcademicYearConfig[] = [
  {
    id: 'ayc1', label: '2024-2025', startDate: '2024-04-01', endDate: '2025-03-31',
    isActive: true, board: 'CBSE',
    classes: [
      { name: 'Class 1', sections: ['A', 'B'] },
      { name: 'Class 2', sections: ['A', 'B'] },
      { name: 'Class 9', sections: ['A', 'B', 'C'] },
      { name: 'Class 10', sections: ['A', 'B'] },
    ],
  },
];

// ─── Service ───────────────────────────────────────────────────────────────

let _complaints = [...MOCK_COMPLAINTS];
let _expenses = [...MOCK_EXPENSES];
let _notices = [...MOCK_NOTICES];
let _approvals = [...MOCK_APPROVALS];
let _books = [...MOCK_BOOKS];
let _equipment = [...MOCK_EQUIPMENT];
let _vehicles = [...MOCK_VEHICLES];
let _ayConfig = [...MOCK_AY_CONFIG];

export const principalService = {
  // Complaints
  async getComplaints(): Promise<Complaint[]> { return [..._complaints]; },
  async resolveComplaint(id: string, response: string): Promise<Complaint> {
    _complaints = _complaints.map(c => c.id === id ? { ...c, status: 'RESOLVED' as const, resolvedAt: new Date().toISOString().split('T')[0], response } : c);
    return _complaints.find(c => c.id === id)!;
  },

  // Expenses
  async getExpenses(): Promise<Expense[]> { return [..._expenses]; },
  async addExpense(input: Omit<Expense, 'id'>): Promise<Expense> {
    const exp: Expense = { ...input, id: `exp${Date.now()}` };
    _expenses = [..._expenses, exp];
    return exp;
  },

  // Notices
  async getNotices(): Promise<Notice[]> { return [..._notices]; },
  async sendNotice(input: Omit<Notice, 'id' | 'sentAt'>): Promise<Notice> {
    const notice: Notice = { ...input, id: `n${Date.now()}`, sentAt: new Date().toISOString().split('T')[0] };
    _notices = [notice, ..._notices];
    return notice;
  },
  async deleteNotice(id: string): Promise<void> { _notices = _notices.filter(n => n.id !== id); },

  // Approvals
  async getApprovals(): Promise<Approval[]> { return [..._approvals]; },
  async approveRequest(id: string): Promise<Approval> {
    _approvals = _approvals.map(a => a.id === id ? { ...a, status: 'APPROVED' as const } : a);
    return _approvals.find(a => a.id === id)!;
  },
  async rejectRequest(id: string): Promise<Approval> {
    _approvals = _approvals.map(a => a.id === id ? { ...a, status: 'REJECTED' as const } : a);
    return _approvals.find(a => a.id === id)!;
  },

  // Library
  async getBooks(): Promise<LibraryBook[]> { return [..._books]; },
  async issueBook(bookId: string, studentId: string, studentName: string): Promise<LibraryBook> {
    _books = _books.map(b => b.id === bookId ? {
      ...b,
      availableCopies: b.availableCopies - 1,
      issuedTo: [...b.issuedTo, {
        studentId, studentName,
        issuedAt: new Date().toISOString().split('T')[0],
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        returnedAt: null,
      }],
    } : b);
    return _books.find(b => b.id === bookId)!;
  },

  // Equipment
  async getEquipment(): Promise<LabEquipment[]> { return [..._equipment]; },

  // Vehicles
  async getVehicles(): Promise<Vehicle[]> { return [..._vehicles]; },

  // Academic Year Config
  async getAYConfig(): Promise<AcademicYearConfig[]> { return [..._ayConfig]; },
  async updateAYConfig(id: string, input: Partial<AcademicYearConfig>): Promise<AcademicYearConfig> {
    _ayConfig = _ayConfig.map(a => a.id === id ? { ...a, ...input } : a);
    return _ayConfig.find(a => a.id === id)!;
  },
};
