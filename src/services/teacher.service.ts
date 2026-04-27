import { TeacherClass, AttendanceRecord, TestSchedule, TestResult, HomeworkItem, TeacherComplaint, ExamPaperRequest, GeneratedExamPaper } from '../types/teacher.types';
import { sharedExamResults, PublishResultsInput } from './sharedExamResults';

const MOCK_CLASSES: TeacherClass[] = [
  {
    id: 'tc1', className: 'Class 10', section: 'A', subject: 'Mathematics', studentCount: 40,
    students: [
      { id: 'stu1', name: 'Aakash Sharma', rollNo: '01', isPresent: null },
      { id: 'stu2', name: 'Priya Gupta', rollNo: '02', isPresent: null },
      { id: 'stu3', name: 'Rohit Mishra', rollNo: '03', isPresent: null },
      { id: 'stu4', name: 'Sneha Patel', rollNo: '04', isPresent: null },
      { id: 'stu5', name: 'Arjun Nair', rollNo: '05', isPresent: null },
      { id: 'stu6', name: 'Pooja Sharma', rollNo: '06', isPresent: null },
      { id: 'stu7', name: 'Kunal Verma', rollNo: '07', isPresent: null },
      { id: 'stu8', name: 'Neha Gupta', rollNo: '08', isPresent: null },
    ],
  },
  {
    id: 'tc2', className: 'Class 10', section: 'B', subject: 'Mathematics', studentCount: 38,
    students: [
      { id: 'stu9', name: 'Mohammed Raza', rollNo: '01', isPresent: null },
      { id: 'stu10', name: 'Ananya Verma', rollNo: '02', isPresent: null },
      { id: 'stu11', name: 'Vikram Singh', rollNo: '03', isPresent: null },
      { id: 'stu12', name: 'Riya Joshi', rollNo: '04', isPresent: null },
    ],
  },
  {
    id: 'tc3', className: 'Class 9', section: 'A', subject: 'Mathematics', studentCount: 42,
    students: [
      { id: 'stu13', name: 'Deepak Kumar', rollNo: '01', isPresent: null },
      { id: 'stu14', name: 'Anjali Mehta', rollNo: '02', isPresent: null },
      { id: 'stu15', name: 'Siddharth Roy', rollNo: '03', isPresent: null },
    ],
  },
];

const MOCK_ATTENDANCE: AttendanceRecord[] = [
  { id: 'att1', classId: 'tc1', className: 'Class 10', section: 'A', subject: 'Mathematics', date: '2024-10-24', totalPresent: 37, totalAbsent: 3, totalStudents: 40, markedBy: 'Aarti Desai' },
  { id: 'att2', classId: 'tc1', className: 'Class 10', section: 'A', subject: 'Mathematics', date: '2024-10-23', totalPresent: 39, totalAbsent: 1, totalStudents: 40, markedBy: 'Aarti Desai' },
  { id: 'att3', classId: 'tc2', className: 'Class 10', section: 'B', subject: 'Mathematics', date: '2024-10-24', totalPresent: 35, totalAbsent: 3, totalStudents: 38, markedBy: 'Aarti Desai' },
];

const MOCK_TESTS: TestSchedule[] = [
  { id: 'test1', classId: 'tc1', className: 'Class 10', section: 'A', subject: 'Mathematics', testType: 'UNIT_TEST', title: 'Algebra & Trigonometry', scheduledDate: '2024-11-05', duration: 60, maxMarks: 25, syllabus: 'Ch. 3-5 Algebra, Ch. 8 Trigonometry', resultsUploaded: false },
  { id: 'test2', classId: 'tc1', className: 'Class 10', section: 'A', subject: 'Mathematics', testType: 'MID_TERM', title: 'Mid-Term Examination', scheduledDate: '2024-11-20', duration: 180, maxMarks: 100, syllabus: 'Full syllabus Unit 1-4', resultsUploaded: false },
  { id: 'test3', classId: 'tc2', className: 'Class 10', section: 'B', subject: 'Mathematics', testType: 'QUIZ', title: 'Quick Quiz — Geometry', scheduledDate: '2024-10-28', duration: 20, maxMarks: 10, syllabus: 'Ch. 6 Geometry basics', resultsUploaded: true },
];

const MOCK_HOMEWORK: HomeworkItem[] = [
  { id: 'hw1', classId: 'tc1', className: 'Class 10', section: 'A', subject: 'Mathematics', title: 'Exercise 5.3 — Quadratic Equations', description: 'Solve Q1-Q15 from exercise 5.3. Show all working.', assignedDate: '2024-10-24', dueDate: '2024-10-26', submittedCount: 32, totalStudents: 40 },
  { id: 'hw2', classId: 'tc2', className: 'Class 10', section: 'B', subject: 'Mathematics', title: 'Practice Set — Coordinate Geometry', description: 'Complete practice set from page 112-113.', assignedDate: '2024-10-23', dueDate: '2024-10-25', submittedCount: 28, totalStudents: 38 },
  { id: 'hw3', classId: 'tc3', className: 'Class 9', section: 'A', subject: 'Mathematics', title: 'Statistics MCQ Worksheet', description: 'Worksheet given in class. Attach to homework register.', assignedDate: '2024-10-22', dueDate: '2024-10-24', submittedCount: 38, totalStudents: 42 },
];

const MOCK_COMPLAINTS: TeacherComplaint[] = [
  { id: 'tc_c1', subject: 'Projector not working in Class 10-A', description: 'For the past week the projector in room 12 is not functioning. Cannot show digital content.', status: 'OPEN', createdAt: '2024-10-20', response: null },
];

let _attendance = [...MOCK_ATTENDANCE];
let _tests = [...MOCK_TESTS];
let _homework = [...MOCK_HOMEWORK];
let _complaints = [...MOCK_COMPLAINTS];
let _generatedPapers: GeneratedExamPaper[] = [];

export const teacherService = {
  async getClasses(): Promise<TeacherClass[]> {
    return MOCK_CLASSES.map(c => ({ ...c, students: c.students.map(s => ({ ...s, isPresent: null })) }));
  },

  async getAttendanceHistory(): Promise<AttendanceRecord[]> {
    return [..._attendance];
  },

  async submitAttendance(classId: string, presentIds: string[], absentIds: string[]): Promise<AttendanceRecord> {
    const cls = MOCK_CLASSES.find(c => c.id === classId)!;
    const record: AttendanceRecord = {
      id: `att${Date.now()}`,
      classId,
      className: cls.className,
      section: cls.section,
      subject: cls.subject,
      date: new Date().toISOString().split('T')[0],
      totalPresent: presentIds.length,
      totalAbsent: absentIds.length,
      totalStudents: cls.students.length,
      markedBy: 'Aarti Desai',
    };
    _attendance = [record, ..._attendance];
    return record;
  },

  async getTests(): Promise<TestSchedule[]> {
    return [..._tests];
  },

  async createTest(input: Omit<TestSchedule, 'id' | 'resultsUploaded'>): Promise<TestSchedule> {
    const test: TestSchedule = { ...input, id: `test${Date.now()}`, resultsUploaded: false };
    _tests = [test, ..._tests];
    return test;
  },

  async publishResults(payload: PublishResultsInput): Promise<void> {
    sharedExamResults.publish(payload);
    _tests = _tests.map(t => t.id === payload.testId ? { ...t, resultsUploaded: true } : t);
  },

  async getHomework(): Promise<HomeworkItem[]> {
    return [..._homework];
  },

  async createHomework(input: Omit<HomeworkItem, 'id' | 'submittedCount'>): Promise<HomeworkItem> {
    const hw: HomeworkItem = { ...input, id: `hw${Date.now()}`, submittedCount: 0 };
    _homework = [hw, ..._homework];
    return hw;
  },

  async getComplaints(): Promise<TeacherComplaint[]> {
    return [..._complaints];
  },

  async submitComplaint(subject: string, description: string): Promise<TeacherComplaint> {
    const c: TeacherComplaint = { id: `tc_c${Date.now()}`, subject, description, status: 'OPEN', createdAt: new Date().toISOString().split('T')[0], response: null };
    _complaints = [c, ..._complaints];
    return c;
  },

  async generateExamPaper(request: ExamPaperRequest): Promise<GeneratedExamPaper> {
    // Gemini-style generated paper — mock for now, ready for API swap
    const paper: GeneratedExamPaper = {
      id: `paper${Date.now()}`,
      request,
      generatedAt: new Date().toISOString(),
      sections: [
        {
          title: 'Section A — Objective Questions',
          marks: Math.round(request.totalMarks * 0.3),
          instructions: 'Choose the correct option. Each question carries 1 mark.',
          questions: Array.from({ length: Math.round(request.totalMarks * 0.3) }, (_, i) => ({
            no: i + 1,
            text: `MCQ ${i + 1}: Based on ${request.topics} — which of the following is correct?`,
            marks: 1,
            type: 'MCQ' as const,
          })),
        },
        {
          title: 'Section B — Short Answer Questions',
          marks: Math.round(request.totalMarks * 0.4),
          instructions: `Answer any ${Math.round(request.totalMarks * 0.4 / 3)} questions. Each carries 3 marks.`,
          questions: Array.from({ length: 6 }, (_, i) => ({
            no: Math.round(request.totalMarks * 0.3) + i + 1,
            text: `Short answer ${i + 1}: Explain the concept of ${request.topics} with an example.`,
            marks: 3,
            type: 'SHORT' as const,
          })),
        },
        {
          title: 'Section C — Long Answer Questions',
          marks: Math.round(request.totalMarks * 0.3),
          instructions: `Answer any ${Math.round(request.totalMarks * 0.3 / 5)} questions. Each carries 5 marks.`,
          questions: Array.from({ length: 3 }, (_, i) => ({
            no: Math.round(request.totalMarks * 0.7) + i + 1,
            text: `Long answer ${i + 1}: Describe in detail the application of ${request.topics}. Use diagrams where applicable.`,
            marks: 5,
            type: 'LONG' as const,
          })),
        },
      ],
    };
    _generatedPapers = [paper, ..._generatedPapers];
    return paper;
  },

  async getGeneratedPapers(): Promise<GeneratedExamPaper[]> {
    return [..._generatedPapers];
  },
};
