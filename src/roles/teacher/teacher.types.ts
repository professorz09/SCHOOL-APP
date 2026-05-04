// 'NORMAL' and 'FINAL' are the two user-facing types.
// Older values (UNIT_TEST, MID_TERM, QUIZ, PRACTICAL) are kept in the union so
// historical rows still render with their original label.
export type TestType = 'NORMAL' | 'FINAL' | 'UNIT_TEST' | 'MID_TERM' | 'QUIZ' | 'PRACTICAL';

export interface FinalExamSubject {
  subject: string;
  maxMarks: number;
  teacherName: string;
}

export interface FinalExamSchedule {
  id: string;
  classId: string;
  className: string;
  section: string;
  title: string;
  description: string;
  scheduledDate: string;
  duration: number;
  subjects: FinalExamSubject[];
  resultsUploaded: boolean;
}

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

export type TestResultStatus = 'DRAFT' | 'SUBMITTED' | 'LOCKED';

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
  // DRAFT — created, not yet submitted.
  // SUBMITTED — teacher uploaded results, awaiting principal publish/lock.
  // LOCKED — principal published, locked from teacher edits.
  resultStatus: TestResultStatus;
  results?: TestResult[];
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

export interface TeacherComplaint {
  id: string;
  subject: string;
  description: string;
  status: 'PENDING' | 'IN_REVIEW' | 'RESOLVED' | 'REJECTED';
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

export interface PublishResultsInput {
  testId: string;
  examName: string;
  description: string;
  testType: string;
  subject: string;
  teacherName: string;
  date: string;
  maxMarks: number;
  studentResults: { studentId: string; obtainedMarks: number; note: string }[];
  allStudents: { id: string; name: string; rollNo: string }[];
}

export interface FinalExamPublishInput {
  finalExamId: string;
  examName: string;
  description: string;
  date: string;
  subjects: { subject: string; maxMarks: number; teacherName: string }[];
  studentResults: {
    studentId: string;
    subjectMarks: Record<string, number>;
    note: string;
  }[];
}
