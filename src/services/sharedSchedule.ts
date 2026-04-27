import { TestSchedule, FinalExamSchedule } from '../types/teacher.types';

let _tests: TestSchedule[] = [];
let _finalExams: FinalExamSchedule[] = [];

export const sharedSchedule = {
  syncTests(tests: TestSchedule[]) { _tests = [...tests]; },
  addTest(t: TestSchedule) { _tests = [t, ..._tests]; },
  addFinalExam(fe: FinalExamSchedule) { _finalExams = [fe, ..._finalExams]; },
  markTestUploaded(id: string) {
    _tests = _tests.map(t => t.id === id ? { ...t, resultsUploaded: true } : t);
  },
  markFinalExamUploaded(id: string) {
    _finalExams = _finalExams.map(fe => fe.id === id ? { ...fe, resultsUploaded: true } : fe);
  },
  getForClass(className: string, section: string) {
    return {
      tests:      _tests.filter(t => t.className === className && t.section === section),
      finalExams: _finalExams.filter(fe => fe.className === className && fe.section === section),
    };
  },
};
