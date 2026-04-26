import { Student, StudentAcademicRecord, FeeRecord, CreateStudentInput } from '../types/principal.types';
import { PaymentStatus } from '../config/constants';

export const MOCK_STUDENTS: Student[] = [
  {
    id: 'stu1', name: 'Aakash Sharma', rollNo: '01', admissionNo: 'ADM-2024-001',
    className: 'Class 10', section: 'A', dob: '2008-06-15', gender: 'MALE',
    bloodGroup: 'O+', aadhaarNo: '2345 6789 0123', phone: '+91 98001 10001',
    email: 'aakash@student.edu.in', address: '12, MG Road, New Delhi 110001',
    photo: '', fatherName: 'Ramesh Sharma', fatherPhone: '+91 98001 20001',
    motherName: 'Sunita Sharma', motherPhone: '+91 98001 30001',
    academicYearId: 'ay1', admissionDate: '2021-04-01',
    feeStatus: PaymentStatus.PAID, totalFee: 45000, paidFee: 45000,
    attendancePercent: 94.2, docs: [],
  },
  {
    id: 'stu2', name: 'Priya Gupta', rollNo: '02', admissionNo: 'ADM-2024-002',
    className: 'Class 10', section: 'A', dob: '2008-09-22', gender: 'FEMALE',
    bloodGroup: 'B+', aadhaarNo: '3456 7890 1234', phone: '+91 98001 10002',
    email: 'priya@student.edu.in', address: '45, Lajpat Nagar, New Delhi 110024',
    photo: '', fatherName: 'Vijay Gupta', fatherPhone: '+91 98001 20002',
    motherName: 'Kavita Gupta', motherPhone: '+91 98001 30002',
    academicYearId: 'ay1', admissionDate: '2022-04-01',
    feeStatus: PaymentStatus.PENDING, totalFee: 45000, paidFee: 22500,
    attendancePercent: 87.5, docs: [],
  },
  {
    id: 'stu3', name: 'Mohammed Raza', rollNo: '03', admissionNo: 'ADM-2024-003',
    className: 'Class 10', section: 'B', dob: '2008-03-10', gender: 'MALE',
    bloodGroup: 'A+', aadhaarNo: '4567 8901 2345', phone: '+91 98001 10003',
    email: 'raza@student.edu.in', address: '78, Chandni Chowk, New Delhi 110006',
    photo: '', fatherName: 'Salim Raza', fatherPhone: '+91 98001 20003',
    motherName: 'Nasreen Raza', motherPhone: '+91 98001 30003',
    academicYearId: 'ay1', admissionDate: '2020-04-01',
    feeStatus: PaymentStatus.OVERDUE, totalFee: 45000, paidFee: 0,
    attendancePercent: 72.3, docs: [],
  },
  {
    id: 'stu4', name: 'Ananya Verma', rollNo: '01', admissionNo: 'ADM-2024-004',
    className: 'Class 9', section: 'A', dob: '2009-11-05', gender: 'FEMALE',
    bloodGroup: 'AB+', aadhaarNo: '5678 9012 3456', phone: '+91 98001 10004',
    email: 'ananya@student.edu.in', address: '22, Connaught Place, New Delhi 110001',
    photo: '', fatherName: 'Suresh Verma', fatherPhone: '+91 98001 20004',
    motherName: 'Meera Verma', motherPhone: '+91 98001 30004',
    academicYearId: 'ay1', admissionDate: '2023-04-01',
    feeStatus: PaymentStatus.PAID, totalFee: 40000, paidFee: 40000,
    attendancePercent: 98.1, docs: [],
  },
  {
    id: 'stu5', name: 'Rohit Mishra', rollNo: '04', admissionNo: 'ADM-2024-005',
    className: 'Class 10', section: 'A', dob: '2008-07-18', gender: 'MALE',
    bloodGroup: 'B-', aadhaarNo: '6789 0123 4567', phone: '+91 98001 10005',
    email: 'rohit@student.edu.in', address: '56, Dwarka Sector 7, New Delhi 110075',
    photo: '', fatherName: 'Dinesh Mishra', fatherPhone: '+91 98001 20005',
    motherName: 'Anita Mishra', motherPhone: '+91 98001 30005',
    academicYearId: 'ay1', admissionDate: '2021-06-15',
    feeStatus: PaymentStatus.PAID, totalFee: 45000, paidFee: 45000,
    attendancePercent: 89.0, docs: [],
  },
];

export const MOCK_FEE_RECORDS: FeeRecord[] = [
  {
    id: 'fee1', studentId: 'stu1', studentName: 'Aakash Sharma', amount: 15000,
    dueDate: '2024-04-01', paidAt: '2024-04-02', status: PaymentStatus.PAID,
    transactionId: 'TXN-APR-2024-001', screenshotUrl: null, description: 'Q1 Fee',
  },
  {
    id: 'fee2', studentId: 'stu1', studentName: 'Aakash Sharma', amount: 15000,
    dueDate: '2024-07-01', paidAt: '2024-07-03', status: PaymentStatus.PAID,
    transactionId: 'TXN-JUL-2024-001', screenshotUrl: null, description: 'Q2 Fee',
  },
  {
    id: 'fee3', studentId: 'stu1', studentName: 'Aakash Sharma', amount: 15000,
    dueDate: '2024-10-01', paidAt: '2024-10-05', status: PaymentStatus.PAID,
    transactionId: 'TXN-OCT-2024-001', screenshotUrl: null, description: 'Q3 Fee',
  },
  {
    id: 'fee4', studentId: 'stu2', studentName: 'Priya Gupta', amount: 15000,
    dueDate: '2024-04-01', paidAt: '2024-04-04', status: PaymentStatus.PAID,
    transactionId: 'TXN-APR-2024-002', screenshotUrl: null, description: 'Q1 Fee',
  },
  {
    id: 'fee5', studentId: 'stu2', studentName: 'Priya Gupta', amount: 15000,
    dueDate: '2024-07-01', paidAt: null, status: PaymentStatus.PENDING,
    transactionId: null, screenshotUrl: null, description: 'Q2 Fee',
  },
  {
    id: 'fee6', studentId: 'stu3', studentName: 'Mohammed Raza', amount: 15000,
    dueDate: '2024-04-01', paidAt: null, status: PaymentStatus.OVERDUE,
    transactionId: null, screenshotUrl: null, description: 'Q1 Fee',
  },
];

export const MOCK_ACADEMIC_RECORDS: StudentAcademicRecord[] = [
  {
    studentId: 'stu1', academicYearId: 'ay1',
    exams: [
      { id: 'ex1', examName: 'Unit Test 1', subject: 'Mathematics', maxMarks: 25, obtainedMarks: 23, grade: 'A+', date: '2024-05-10' },
      { id: 'ex2', examName: 'Unit Test 1', subject: 'Science', maxMarks: 25, obtainedMarks: 21, grade: 'A', date: '2024-05-12' },
      { id: 'ex3', examName: 'Mid Term', subject: 'Mathematics', maxMarks: 100, obtainedMarks: 92, grade: 'A+', date: '2024-08-15' },
      { id: 'ex4', examName: 'Mid Term', subject: 'Science', maxMarks: 100, obtainedMarks: 88, grade: 'A', date: '2024-08-16' },
    ],
    feeRecords: MOCK_FEE_RECORDS.filter(f => f.studentId === 'stu1'),
    attendanceRecords: [
      { month: 'April 2024', present: 24, absent: 2, total: 26 },
      { month: 'May 2024', present: 23, absent: 1, total: 24 },
      { month: 'June 2024', present: 20, absent: 0, total: 20 },
    ],
    complaints: [],
  },
  {
    studentId: 'stu2', academicYearId: 'ay1',
    exams: [
      { id: 'ex5', examName: 'Unit Test 1', subject: 'Mathematics', maxMarks: 25, obtainedMarks: 18, grade: 'B', date: '2024-05-10' },
    ],
    feeRecords: MOCK_FEE_RECORDS.filter(f => f.studentId === 'stu2'),
    attendanceRecords: [
      { month: 'April 2024', present: 20, absent: 6, total: 26 },
    ],
    complaints: [],
  },
];

let _students: Student[] = [...MOCK_STUDENTS];
let _feeRecords: FeeRecord[] = [...MOCK_FEE_RECORDS];
let _academicRecords: StudentAcademicRecord[] = [...MOCK_ACADEMIC_RECORDS];

export const studentService = {
  async getAll(): Promise<Student[]> {
    return [..._students];
  },

  async getById(id: string): Promise<Student | null> {
    return _students.find(s => s.id === id) ?? null;
  },

  async create(input: CreateStudentInput): Promise<Student> {
    const student: Student = {
      ...input,
      id: `stu${Date.now()}`,
      feeStatus: PaymentStatus.PENDING,
      paidFee: 0,
      attendancePercent: 0,
      docs: [],
    };
    _students = [..._students, student];
    _academicRecords = [..._academicRecords, {
      studentId: student.id, academicYearId: student.academicYearId,
      exams: [], feeRecords: [], attendanceRecords: [], complaints: [],
    }];
    return student;
  },

  async update(id: string, input: Partial<Student>): Promise<Student> {
    _students = _students.map(s => s.id === id ? { ...s, ...input } : s);
    return _students.find(s => s.id === id)!;
  },

  async delete(id: string): Promise<void> {
    _students = _students.filter(s => s.id !== id);
    _academicRecords = _academicRecords.filter(r => r.studentId !== id);
  },

  async getAcademicRecord(studentId: string, academicYearId: string): Promise<StudentAcademicRecord | null> {
    return _academicRecords.find(r => r.studentId === studentId && r.academicYearId === academicYearId) ?? null;
  },

  async getFeeRecords(studentId: string): Promise<FeeRecord[]> {
    return _feeRecords.filter(f => f.studentId === studentId);
  },

  async markFeePaid(feeId: string, transactionId: string): Promise<FeeRecord> {
    const record = _feeRecords.find(f => f.id === feeId);
    if (!record) throw new Error('Fee record not found');
    const updated = { ...record, status: PaymentStatus.PAID, paidAt: new Date().toISOString().split('T')[0], transactionId };
    _feeRecords = _feeRecords.map(f => f.id === feeId ? updated : f);
    _students = _students.map(s => s.id === record.studentId ? { ...s, paidFee: s.paidFee + record.amount, feeStatus: PaymentStatus.PAID } : s);
    return updated;
  },

  async sendFeeReminder(studentId: string): Promise<void> {
    // no-op for now
  },
};
