import { StudentExamResult } from '../types/student.types';

export interface PublishResultsInput {
  testId: string;
  examName: string;
  description: string;
  testType: string;
  subject: string;
  teacherName: string;
  date: string;
  maxMarks: number;
  studentResults: {
    studentId: string;
    obtainedMarks: number;
    note: string;
  }[];
  allStudents: { id: string; name: string; rollNo: string }[];
}

let _publishedResults: StudentExamResult[] = [];

export const sharedExamResults = {
  publish(input: PublishResultsInput): void {
    const sorted = [...input.studentResults].sort((a, b) => b.obtainedMarks - a.obtainedMarks);
    const rankMap: Record<string, number> = {};
    sorted.forEach((r, i) => { rankMap[r.studentId] = i + 1; });

    const newResults: StudentExamResult[] = input.studentResults.map(sr => ({
      id: `pub_${input.testId}_${sr.studentId}`,
      examName: input.examName,
      testType: input.testType,
      subject: input.subject,
      teacherName: input.teacherName,
      maxMarks: input.maxMarks,
      obtainedMarks: sr.obtainedMarks,
      grade: calcGrade(sr.obtainedMarks, input.maxMarks),
      date: input.date,
      rank: rankMap[sr.studentId] ?? null,
      totalStudents: input.studentResults.length,
      teacherNote: sr.note || undefined,
    }));

    _publishedResults = [
      ..._publishedResults.filter(r =>
        !(r.examName === input.examName && r.subject === input.subject)
      ),
      ...newResults,
    ];
  },

  getForStudent(studentId: string): StudentExamResult[] {
    return _publishedResults.filter(r =>
      r.id.includes(`_${studentId}`)
    );
  },

  getAll(): StudentExamResult[] {
    return [..._publishedResults];
  },
};

function calcGrade(obtained: number, max: number): string {
  const pct = max > 0 ? (obtained / max) * 100 : 0;
  if (pct >= 90) return 'A+';
  if (pct >= 80) return 'A';
  if (pct >= 70) return 'B+';
  if (pct >= 60) return 'B';
  if (pct >= 50) return 'C';
  return 'D';
}
