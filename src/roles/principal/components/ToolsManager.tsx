// Tools Manager — Toolsedu-pattern rewrite.
// Dashboard with 6 tool cards, each opening into its own full-page
// tool view. All tools share the same DataInputSection / ActionButtons
// pattern so PDF + Browser Print behaviour is consistent.
//
// School data flows in via `students` + `schoolInfo` props on each
// tool — every tool has a "Load from Class" button in DataInputSection
// that maps the principal's roster into the tool's expected row shape.

import React from 'react';
import { ArrowLeft, FileBadge, GraduationCap, FileCheck, FileQuestion, ScrollText, Calendar, FileText } from 'lucide-react';
import { studentService } from '@/modules/students/student.service';
import type { Student } from '@/modules/students/student.types';
import { schoolInfoService, type SchoolInfo } from '@/shared/utils/schoolInfo.service';
import { IdCardTool } from '@/modules/tools/IdCardTool';
import { AdmitCardTool } from '@/modules/tools/AdmitCardTool';
import { MarksheetTool } from '@/modules/tools/MarksheetTool';
import { TransferCertificateTool } from '@/modules/tools/TransferCertificateTool';
import { TimetableTool } from '@/modules/tools/TimetableTool';
import { AdmissionFormTool } from '@/modules/tools/AdmissionFormTool';
import { ExamPaperGeneratorView } from '@/modules/exams/components/ExamPaperGenerator';

type ToolType = 'id-card' | 'admit-card' | 'marksheet' | 'question-paper' | 'tc' | 'timetable' | 'admission-form';

interface Props {
  onBack: () => void;
}

interface ToolDef {
  id: ToolType;
  label: string;
  description: string;
  icon: React.ReactNode;
  category: string;
  categoryColor: string;
}

const TOOLS: ToolDef[] = [
  { id: 'id-card',       label: 'ID Cards',          description: 'Design and print student ID cards in bulk.',  icon: <FileBadge size={20} />,   category: 'Academic',     categoryColor: 'bg-green-100 text-green-700' },
  { id: 'admit-card',    label: 'Admit Cards',       description: 'Generate examination admit cards.',           icon: <GraduationCap size={20} />, category: 'Examination', categoryColor: 'bg-blue-100 text-blue-700' },
  { id: 'marksheet',     label: 'Marksheets',        description: 'Report cards from structured data.',          icon: <FileCheck size={20} />,    category: 'Results',     categoryColor: 'bg-purple-100 text-purple-700' },
  { id: 'question-paper',label: 'Question Paper',    description: 'AI-generated exam question papers.',          icon: <FileQuestion size={20} />, category: 'Examination', categoryColor: 'bg-amber-100 text-amber-700' },
  { id: 'tc',            label: 'Transfer Certificate', description: 'School Leaving / TC certificates.',        icon: <ScrollText size={20} />,   category: 'Certificates',categoryColor: 'bg-rose-100 text-rose-700' },
  { id: 'timetable',     label: 'Exam Timetable',    description: 'Examination or class timetables.',            icon: <Calendar size={20} />,     category: 'Management',  categoryColor: 'bg-emerald-100 text-emerald-700' },
  { id: 'admission-form',label: 'Admission Form',    description: 'Printable admission form per student.',       icon: <FileText size={20} />,     category: 'Admissions',  categoryColor: 'bg-sky-100 text-sky-700' },
];

export const ToolsManager: React.FC<Props> = ({ onBack }) => {
  const [activeTool, setActiveTool] = React.useState<ToolType | null>(null);
  const [students, setStudents] = React.useState<Student[]>([]);
  const [schoolInfo, setSchoolInfo] = React.useState<SchoolInfo | null>(null);

  React.useEffect(() => {
    studentService.getAll().then(setStudents).catch(() => setStudents([]));
    schoolInfoService.get().then(setSchoolInfo).catch(() => setSchoolInfo(null));
  }, []);

  const backToDashboard = () => setActiveTool(null);

  if (activeTool === 'id-card')        return <IdCardTool onBack={backToDashboard} students={students} schoolInfo={schoolInfo} />;
  if (activeTool === 'admit-card')     return <AdmitCardTool onBack={backToDashboard} students={students} schoolInfo={schoolInfo} />;
  if (activeTool === 'marksheet')      return <MarksheetTool onBack={backToDashboard} students={students} schoolInfo={schoolInfo} />;
  if (activeTool === 'question-paper') return <ExamPaperGeneratorView onBack={backToDashboard} />;
  if (activeTool === 'tc')             return <TransferCertificateTool onBack={backToDashboard} students={students} schoolInfo={schoolInfo} />;
  if (activeTool === 'timetable')      return <TimetableTool onBack={backToDashboard} schoolInfo={schoolInfo} />;
  if (activeTool === 'admission-form') return <AdmissionFormTool onBack={backToDashboard} students={students} schoolInfo={schoolInfo} />;

  // Dashboard — minimal, professional. No giant marketing text.
  return (
    <div className="w-full flex flex-col bg-white min-h-screen no-print">
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-gray-100 px-3 md:px-6 py-3 flex items-center gap-3">
        <button onClick={onBack}
          className="p-2 -ml-1 rounded-full hover:bg-gray-100 active:scale-95 transition-all">
          <ArrowLeft size={18} className="text-gray-700" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg md:text-2xl font-bold text-gray-900 leading-tight">Tools</h1>
          <p className="text-[11px] md:text-xs font-medium text-gray-500 mt-0.5 truncate">
            Print-ready school documents · class roster auto-loaded
          </p>
        </div>
      </div>

      <div className="px-3 md:px-6 py-5 md:py-8 max-w-5xl mx-auto w-full">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 md:gap-3">
          {TOOLS.map(t => (
            <button key={t.id} onClick={() => setActiveTool(t.id)}
              className="text-left bg-white border border-gray-200 hover:border-gray-900 active:scale-[0.98] p-4 md:p-5 rounded-xl transition-all group">
              <div className="w-10 h-10 md:w-11 md:h-11 rounded-lg bg-gray-100 group-hover:bg-gray-900 group-hover:text-white flex items-center justify-center text-gray-700 transition-colors mb-3 md:mb-4">
                {t.icon}
              </div>
              <h3 className="text-sm md:text-base font-bold text-gray-900 leading-tight">{t.label}</h3>
              <p className="text-[11px] md:text-xs font-medium text-gray-500 mt-1 leading-snug line-clamp-2">{t.description}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
