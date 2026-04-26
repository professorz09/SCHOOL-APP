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
  { id: 'r1', examName: 'Unit Test 1', testType: 'UNIT_TEST', subject: 'Mathematics', maxMarks: 25, obtainedMarks: 23, grade: 'A+', date: '2024-05-10', rank: 2 },
  { id: 'r2', examName: 'Unit Test 1', testType: 'UNIT_TEST', subject: 'Science', maxMarks: 25, obtainedMarks: 21, grade: 'A', date: '2024-05-12', rank: 4 },
  { id: 'r3', examName: 'Unit Test 1', testType: 'UNIT_TEST', subject: 'English', maxMarks: 25, obtainedMarks: 22, grade: 'A+', date: '2024-05-14', rank: 3 },
  { id: 'r4', examName: 'Mid Term', testType: 'MID_TERM', subject: 'Mathematics', maxMarks: 100, obtainedMarks: 92, grade: 'A+', date: '2024-08-15', rank: 1 },
  { id: 'r5', examName: 'Mid Term', testType: 'MID_TERM', subject: 'Science', maxMarks: 100, obtainedMarks: 88, grade: 'A', date: '2024-08-16', rank: 3 },
  { id: 'r6', examName: 'Mid Term', testType: 'MID_TERM', subject: 'English', maxMarks: 100, obtainedMarks: 85, grade: 'A', date: '2024-08-18', rank: 5 },
  { id: 'r7', examName: 'Quiz 1', testType: 'QUIZ', subject: 'Mathematics', maxMarks: 10, obtainedMarks: 9, grade: 'A+', date: '2024-09-05', rank: null },
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
