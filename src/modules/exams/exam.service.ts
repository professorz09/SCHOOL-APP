import { apiExams } from '@/lib/apiClient';

export type ExamGrade = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | 'D' | 'E';

export function calculateGrade(pct: number): ExamGrade {
  if (pct >= 91) return 'A1';
  if (pct >= 81) return 'A2';
  if (pct >= 71) return 'B1';
  if (pct >= 61) return 'B2';
  if (pct >= 51) return 'C1';
  if (pct >= 41) return 'C2';
  if (pct >= 33) return 'D';
  return 'E';
}

export function gradeColor(grade: ExamGrade): string {
  if (grade === 'E') return 'text-rose-600';
  if (grade === 'D') return 'text-amber-600';
  return 'text-emerald-700';
}

export interface ExamResult {
  studentId: string;
  marks: number;
  grade?: string;
  remarks?: string;
}

export interface MarksheetExam {
  id: string;
  subject: string;
  max_marks: number;
  pass_marks?: number;
  exam_type?: string;
}

export interface MarksheetStudent {
  studentId: string;
  name: string;
  admissionNo?: string;
  rollNo?: string;
  className?: string;
  section?: string;
  results: Record<string, { obtainedMarks: number; grade: string }>;
}

export function isStudentPassed(
  student: MarksheetStudent,
  exams: MarksheetExam[],
): boolean {
  const totalObt = exams.reduce(
    (s, e) => s + (student.results[e.id]?.obtainedMarks ?? 0), 0,
  );
  const passMark = exams.reduce(
    (s, e) => s + (e.pass_marks ?? Math.ceil((e.max_marks ?? 0) * 0.33)), 0,
  );
  return totalObt >= passMark;
}

export const examService = {
  async getExams(yearId: string, className?: string) {
    return apiExams.list({ yearId, ...(className ? { className } : {}) }) as Promise<any[]>;
  },

  async createExam(data: {
    title: string; className: string; subject: string; scheduledDate: string;
    testType: string; maxMarks: number; academicYearId: string;
    syllabus?: string; examType?: string; passMarks?: number;
    passMarksConfig?: Record<string, number>; sectionId?: string; duration?: number;
  }) {
    return apiExams.create(data);
  },

  async uploadResults(body: {
    testId: string; academicYearId: string;
    results: ExamResult[];
  }) {
    return apiExams.uploadResults(body);
  },

  async lockResults(testId: string) {
    return apiExams.lockResults(testId);
  },

  async unlockResults(testId: string) {
    return apiExams.unlockResults(testId);
  },

  async getMarksheet(className: string, yearId: string) {
    return apiExams.getMarksheet(className, yearId);
  },

  async getResults(testId: string) {
    return apiExams.getResults(testId) as Promise<any[]>;
  },

  async configurePassMarks(
    testId: string,
    passMarks?: number,
    passMarksConfig?: Record<string, number>,
  ) {
    return apiExams.configurePassMarks(testId, { passMarks, passMarksConfig });
  },

  calculateGrade,
  gradeColor,
  isStudentPassed,
};
