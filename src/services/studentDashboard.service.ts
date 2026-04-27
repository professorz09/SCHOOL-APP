import { TimetableDay, StudentExamResult, FeePaymentUpload, TransportStop, StudentNotice, StudentComplaint } from '../types/student.types';

const TODAY = new Date().toISOString().split('T')[0];

const MOCK_TIMETABLE: TimetableDay[] = [
  {
    day: 'Monday', date: TODAY,
    periods: [
      { id: 'p1', period: 1, subject: 'Mathematics', teacher: 'Aarti Desai', startTime: '08:30', endTime: '09:15', room: 'Room 12', type: 'CLASS' },
      { id: 'p2', period: 2, subject: 'Science', teacher: 'Sanjay Mehta', startTime: '09:15', endTime: '10:00', room: 'Room 8', type: 'CLASS' },
      { id: 'p3', period: 3, subject: 'Mid-Term MATHS', teacher: 'Aarti Desai', startTime: '10:15', endTime: '12:15', room: 'Hall A', type: 'EXAM' },
      { id: 'p4', period: 4, subject: 'Lunch Break', teacher: '', startTime: '12:15', endTime: '13:00', room: '—', type: 'LUNCH' },
      { id: 'p5', period: 5, subject: 'English', teacher: 'Priya Singh', startTime: '13:00', endTime: '13:45', room: 'Room 15', type: 'CLASS' },
      { id: 'p6', period: 6, subject: 'Social Studies', teacher: 'Rao Kumar', startTime: '13:45', endTime: '14:30', room: 'Room 9', type: 'CLASS' },
    ],
  },
  {
    day: 'Tuesday', date: '',
    periods: [
      { id: 'p7', period: 1, subject: 'Hindi', teacher: 'Meera Jha', startTime: '08:30', endTime: '09:15', room: 'Room 6', type: 'CLASS' },
      { id: 'p8', period: 2, subject: 'Unit Test — Science', teacher: 'Sanjay Mehta', startTime: '09:15', endTime: '10:00', room: 'Room 8', type: 'EXAM' },
      { id: 'p9', period: 3, subject: 'Computer Science', teacher: 'Ajay Tiwari', startTime: '10:15', endTime: '11:00', room: 'Lab', type: 'CLASS' },
      { id: 'p10', period: 4, subject: 'Physical Education', teacher: 'Coach Sunil', startTime: '11:00', endTime: '11:45', room: 'Ground', type: 'CLASS' },
      { id: 'p11', period: 5, subject: 'Lunch Break', teacher: '', startTime: '12:15', endTime: '13:00', room: '—', type: 'LUNCH' },
      { id: 'p12', period: 6, subject: 'Free Period', teacher: '', startTime: '13:45', endTime: '14:30', room: '—', type: 'FREE' },
    ],
  },
];

const MOCK_RESULTS: StudentExamResult[] = [
  // ── Unit Test 1 ──
  { id: 'r1',  examName: 'Unit Test 1', testType: 'UNIT_TEST', subject: 'Mathematics',    teacherName: 'Aarti Desai',   maxMarks: 25, obtainedMarks: 23, grade: 'A+', date: '2025-04-10', rank: 2,  totalStudents: 42, teacherNote: 'Excellent problem-solving. Keep practicing geometry.' },
  { id: 'r2',  examName: 'Unit Test 1', testType: 'UNIT_TEST', subject: 'Science',         teacherName: 'Sanjay Mehta',  maxMarks: 25, obtainedMarks: 21, grade: 'A',  date: '2025-04-12', rank: 4,  totalStudents: 42, teacherNote: 'Good understanding of concepts. Revise chemical equations.' },
  { id: 'r3',  examName: 'Unit Test 1', testType: 'UNIT_TEST', subject: 'English',         teacherName: 'Priya Singh',   maxMarks: 25, obtainedMarks: 22, grade: 'A+', date: '2025-04-14', rank: 3,  totalStudents: 42 },
  { id: 'r4',  examName: 'Unit Test 1', testType: 'UNIT_TEST', subject: 'Hindi',           teacherName: 'Meera Jha',     maxMarks: 25, obtainedMarks: 19, grade: 'A',  date: '2025-04-15', rank: 6,  totalStudents: 42, teacherNote: 'Handwriting needs improvement. Content is good.' },
  { id: 'r5',  examName: 'Unit Test 1', testType: 'UNIT_TEST', subject: 'Social Studies',  teacherName: 'Rao Kumar',     maxMarks: 25, obtainedMarks: 20, grade: 'A',  date: '2025-04-16', rank: 5,  totalStudents: 42 },
  // ── Unit Test 2 ──
  { id: 'r6',  examName: 'Unit Test 2', testType: 'UNIT_TEST', subject: 'Mathematics',    teacherName: 'Aarti Desai',   maxMarks: 25, obtainedMarks: 24, grade: 'A+', date: '2025-09-08', rank: 1,  totalStudents: 42, teacherNote: 'Outstanding! Best in class. Well done.' },
  { id: 'r7',  examName: 'Unit Test 2', testType: 'UNIT_TEST', subject: 'Science',         teacherName: 'Sanjay Mehta',  maxMarks: 25, obtainedMarks: 22, grade: 'A+', date: '2025-09-10', rank: 2,  totalStudents: 42 },
  { id: 'r8',  examName: 'Unit Test 2', testType: 'UNIT_TEST', subject: 'English',         teacherName: 'Priya Singh',   maxMarks: 25, obtainedMarks: 20, grade: 'A',  date: '2025-09-11', rank: 5,  totalStudents: 42, teacherNote: 'Essay writing is improving. Focus on grammar.' },
  { id: 'r9',  examName: 'Unit Test 2', testType: 'UNIT_TEST', subject: 'Hindi',           teacherName: 'Meera Jha',     maxMarks: 25, obtainedMarks: 21, grade: 'A',  date: '2025-09-12', rank: 4,  totalStudents: 42 },
  // ── Mid Term ──
  { id: 'r10', examName: 'Mid Term Exam', testType: 'MID_TERM', subject: 'Mathematics',   teacherName: 'Aarti Desai',   maxMarks: 100, obtainedMarks: 92, grade: 'A+', date: '2025-10-15', rank: 1, totalStudents: 42, teacherNote: 'Exceptional performance. Top scorer in class!' },
  { id: 'r11', examName: 'Mid Term Exam', testType: 'MID_TERM', subject: 'Science',        teacherName: 'Sanjay Mehta',  maxMarks: 100, obtainedMarks: 88, grade: 'A',  date: '2025-10-16', rank: 3, totalStudents: 42 },
  { id: 'r12', examName: 'Mid Term Exam', testType: 'MID_TERM', subject: 'English',        teacherName: 'Priya Singh',   maxMarks: 100, obtainedMarks: 85, grade: 'A',  date: '2025-10-17', rank: 5, totalStudents: 42, teacherNote: 'Reading comprehension is strong. Work on creative writing.' },
  { id: 'r13', examName: 'Mid Term Exam', testType: 'MID_TERM', subject: 'Hindi',          teacherName: 'Meera Jha',     maxMarks: 100, obtainedMarks: 79, grade: 'B+', date: '2025-10-18', rank: 8, totalStudents: 42 },
  { id: 'r14', examName: 'Mid Term Exam', testType: 'MID_TERM', subject: 'Social Studies', teacherName: 'Rao Kumar',     maxMarks: 100, obtainedMarks: 83, grade: 'A',  date: '2025-10-19', rank: 4, totalStudents: 42 },
  // ── Final Exam ──
  { id: 'r15', examName: 'Final Exam',    testType: 'FINAL',    subject: 'Mathematics',   teacherName: 'Aarti Desai',   maxMarks: 100, obtainedMarks: 96, grade: 'A+', date: '2026-03-10', rank: 1, totalStudents: 42, teacherNote: 'Perfect performance. Proud of your consistency!' },
  { id: 'r16', examName: 'Final Exam',    testType: 'FINAL',    subject: 'Science',        teacherName: 'Sanjay Mehta',  maxMarks: 100, obtainedMarks: 91, grade: 'A+', date: '2026-03-11', rank: 2, totalStudents: 42, teacherNote: 'Excellent across all chapters. Great lab work too.' },
  { id: 'r17', examName: 'Final Exam',    testType: 'FINAL',    subject: 'English',        teacherName: 'Priya Singh',   maxMarks: 100, obtainedMarks: 88, grade: 'A',  date: '2026-03-12', rank: 4, totalStudents: 42 },
  { id: 'r18', examName: 'Final Exam',    testType: 'FINAL',    subject: 'Hindi',          teacherName: 'Meera Jha',     maxMarks: 100, obtainedMarks: 82, grade: 'A',  date: '2026-03-13', rank: 7, totalStudents: 42, teacherNote: 'Consistent improvement throughout the year.' },
  { id: 'r19', examName: 'Final Exam',    testType: 'FINAL',    subject: 'Social Studies', teacherName: 'Rao Kumar',     maxMarks: 100, obtainedMarks: 87, grade: 'A',  date: '2026-03-14', rank: 3, totalStudents: 42 },
];

const MOCK_TRANSPORT: TransportStop[] = [
  { name: 'School Campus', lat: 28.6139, lng: 77.2090, estimatedTime: '07:30 AM', status: 'COMPLETED' },
  { name: 'Janakpuri West', lat: 28.6200, lng: 77.0780, estimatedTime: '07:50 AM', status: 'COMPLETED' },
  { name: 'Uttam Nagar', lat: 28.6150, lng: 77.0550, estimatedTime: '08:05 AM', status: 'CURRENT' },
  { name: 'Dwarka Sector 7', lat: 28.5964, lng: 77.0450, estimatedTime: '08:20 AM', status: 'UPCOMING' },
  { name: 'Your Stop', lat: 28.5900, lng: 77.0390, estimatedTime: '08:35 AM', status: 'UPCOMING' },
];

const MOCK_NOTICES: StudentNotice[] = [
  { id: 'sn1', title: 'Mid-Term Exam Schedule', body: 'Mid-term exams will be held from 15-25 November 2024. Carry admit card.', sentAt: '2024-10-12', category: 'EXAM', pinned: true },
  { id: 'sn2', title: 'Q3 Fee Payment Due', body: 'Third quarterly fee (₹15,000) is due by 31 October. Pay at office or UPI.', sentAt: '2024-10-08', category: 'FEE', pinned: false },
  { id: 'sn3', title: 'Annual Sports Day', body: 'Annual Sports Day on 10 November. Register for events by 5 November.', sentAt: '2024-10-06', category: 'EVENT', pinned: false },
  { id: 'sn4', title: 'Parent-Teacher Meeting', body: 'PTM on 20 October, 10 AM–2 PM. Parents must attend.', sentAt: '2024-10-04', category: 'GENERAL', pinned: false },
];

const MOCK_COMPLAINTS: StudentComplaint[] = [
  { id: 'sc1', subject: 'Classroom fan not working', description: 'The ceiling fan in room 12 has been broken for 2 weeks.', status: 'OPEN', createdAt: '2024-10-05', response: null },
];

let _feeUploads: FeePaymentUpload[] = [];
let _complaints = [...MOCK_COMPLAINTS];

export const studentDashboardService = {
  async getTimetable(): Promise<TimetableDay[]> {
    return [...MOCK_TIMETABLE];
  },

  async getResults(): Promise<StudentExamResult[]> {
    return [...MOCK_RESULTS];
  },

  async getTransportStops(): Promise<TransportStop[]> {
    return [...MOCK_TRANSPORT];
  },

  async getNotices(): Promise<StudentNotice[]> {
    return [...MOCK_NOTICES];
  },

  async getComplaints(): Promise<StudentComplaint[]> {
    return [..._complaints];
  },

  async submitComplaint(subject: string, description: string): Promise<StudentComplaint> {
    const c: StudentComplaint = {
      id: `sc${Date.now()}`, subject, description,
      status: 'OPEN', createdAt: new Date().toISOString().split('T')[0], response: null,
    };
    _complaints = [c, ..._complaints];
    return c;
  },

  async getFeeUploads(): Promise<FeePaymentUpload[]> {
    return [..._feeUploads];
  },

  async submitFeeScreenshot(amount: number, description: string, screenshotName: string): Promise<FeePaymentUpload> {
    const upload: FeePaymentUpload = {
      id: `fpu${Date.now()}`, amount, description, screenshotName,
      submittedAt: new Date().toISOString().split('T')[0], status: 'PENDING',
    };
    _feeUploads = [upload, ..._feeUploads];
    return upload;
  },
};
