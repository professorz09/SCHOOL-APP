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
  studentResults: { studentId: string; obtainedMarks: number; note: string; }[];
  allStudents: { id: string; name: string; rollNo: string }[];
}

export interface FinalExamPublishInput {
  finalExamId: string;
  examName: string;
  description: string;
  date: string;
  subjects: { subject: string; maxMarks: number; teacherName: string; }[];
  studentResults: {
    studentId: string;
    subjectMarks: Record<string, number>;
    note: string;
  }[];
}

// studentId → results
const _store = new Map<string, StudentExamResult[]>();

const calcGrade = (obtained: number, max: number): string => {
  const pct = max > 0 ? (obtained / max) * 100 : 0;
  if (pct >= 90) return 'A+';
  if (pct >= 80) return 'A';
  if (pct >= 70) return 'B+';
  if (pct >= 60) return 'B';
  if (pct >= 50) return 'C';
  return 'D';
};

const upsert = (studentId: string, results: StudentExamResult[]) => {
  const existing = _store.get(studentId) ?? [];
  const newKeys = new Set(results.map(r => `${r.examName}__${r.subject}`));
  const kept = existing.filter(r => !newKeys.has(`${r.examName}__${r.subject}`));
  _store.set(studentId, [...kept, ...results]);
};

export const sharedExamResults = {
  publish(input: PublishResultsInput): void {
    const sorted = [...input.studentResults].sort((a, b) => b.obtainedMarks - a.obtainedMarks);
    const rankMap: Record<string, number> = {};
    sorted.forEach((r, i) => { rankMap[r.studentId] = i + 1; });

    input.studentResults.forEach(sr => {
      const result: StudentExamResult = {
        id: `reg_${input.testId}_${sr.studentId}`,
        examName:     input.examName,
        testType:     input.testType,
        subject:      input.subject,
        teacherName:  input.teacherName,
        maxMarks:     input.maxMarks,
        obtainedMarks: sr.obtainedMarks,
        grade:        calcGrade(sr.obtainedMarks, input.maxMarks),
        date:         input.date,
        rank:         rankMap[sr.studentId] ?? null,
        totalStudents: input.studentResults.length,
        teacherNote:  sr.note || undefined,
      };
      upsert(sr.studentId, [result]);
    });
  },

  publishFinalExam(input: FinalExamPublishInput): void {
    input.subjects.forEach(subj => {
      const subjectResults = input.studentResults.map(sr => ({
        studentId: sr.studentId,
        marks: sr.subjectMarks[subj.subject] ?? 0,
      }));
      const sorted = [...subjectResults].sort((a, b) => b.marks - a.marks);
      const rankMap: Record<string, number> = {};
      sorted.forEach((r, i) => { rankMap[r.studentId] = i + 1; });

      input.studentResults.forEach(sr => {
        const marks = sr.subjectMarks[subj.subject] ?? 0;
        const result: StudentExamResult = {
          id: `fe_${input.finalExamId}_${subj.subject.replace(/\s+/g, '_')}_${sr.studentId}`,
          examName:      input.examName,
          testType:      'FINAL',
          subject:       subj.subject,
          teacherName:   subj.teacherName,
          maxMarks:      subj.maxMarks,
          obtainedMarks: marks,
          grade:         calcGrade(marks, subj.maxMarks),
          date:          input.date,
          rank:          rankMap[sr.studentId] ?? null,
          totalStudents: input.studentResults.length,
          teacherNote:   sr.note || undefined,
        };
        upsert(sr.studentId, [result]);
      });
    });
  },

  getForStudent(studentId: string): StudentExamResult[] {
    return _store.get(studentId) ?? [];
  },
};
