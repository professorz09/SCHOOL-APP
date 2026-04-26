export type TestType = 'UNIT_TEST' | 'MID_TERM' | 'FINAL' | 'QUIZ' | 'PRACTICAL';
export type HomeworkStatus = 'PENDING' | 'SUBMITTED' | 'GRADED';

export interface TeacherClass {
  id: string;
  className: string;
  section: string;
  subject: string;
  studentCount: number;
  students: AttendanceStudent[];
}

export interface AttendanceStudent {
  id: string;
  name: string;
  rollNo: string;
  isPresent: boolean | null;
}

export interface AttendanceRecord {
  id: string;
  classId: string;
  className: string;
  section: string;
  subject: string;
  date: string;
  totalPresent: number;
  totalAbsent: number;
  totalStudents: number;
  markedBy: string;
}

export interface TestSchedule {
  id: string;
  classId: string;
  className: string;
  section: string;
  subject: string;
  testType: TestType;
  title: string;
  scheduledDate: string;
  duration: number;
  maxMarks: number;
  syllabus: string;
  resultsUploaded: boolean;
}

export interface TestResult {
  testId: string;
  studentId: string;
  studentName: string;
  rollNo: string;
  marksObtained: number;
  maxMarks: number;
  grade: string;
  remarks: string;
}

export interface HomeworkItem {
  id: string;
  classId: string;
  className: string;
  section: string;
  subject: string;
  title: string;
  description: string;
  assignedDate: string;
  dueDate: string;
  submittedCount: number;
  totalStudents: number;
}

export interface TeacherComplaint {
  id: string;
  subject: string;
  description: string;
  status: 'OPEN' | 'RESOLVED';
  createdAt: string;
  response: string | null;
}

export interface ExamPaperRequest {
  subject: string;
  className: string;
  testType: TestType;
  totalMarks: number;
  duration: number;
  topics: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
}

export interface GeneratedExamPaper {
  id: string;
  request: ExamPaperRequest;
  sections: ExamSection[];
  generatedAt: string;
}

export interface ExamSection {
  title: string;
  marks: number;
  instructions: string;
  questions: ExamQuestion[];
}

export interface ExamQuestion {
  no: number;
  text: string;
  marks: number;
  type: 'MCQ' | 'SHORT' | 'LONG' | 'DIAGRAM';
}
