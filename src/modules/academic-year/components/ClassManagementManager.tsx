import React, { useEffect, useState, useCallback } from 'react';
import {
  ArrowLeft, Plus, ChevronRight, CheckCircle2, XCircle,
  BookOpen, UserCheck, Loader2,
} from 'lucide-react';
import { staffService } from '@/modules/staff/staff.service';
import { studentService } from '@/modules/students/student.service';
import { principalService } from '@/shared/services/principal.service';
import { StaffMember, ClassPermission, Student } from '@/shared/types/principal.types';
import { useUIStore } from '@/shared/store/uiStore';

interface SectionInfo {
  section: string;
  students: Student[];
  permissions: ClassPermission[];
}

interface ClassInfo {
  className: string;
  sections: SectionInfo[];
  studentCount: number;
}

interface Props { onBack: () => void; }

export const ClassManagementManager: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  const [view, setView] = useState<'LIST' | 'CLASS_DETAIL' | 'SECTION_DETAIL' | 'ADD_PERMISSION'>('LIST');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [selectedClassName, setSelectedClassName] = useState<string | null>(null);
  const [selectedSectionName, setSelectedSectionName] = useState<string | null>(null);
  const [teachers, setTeachers] = useState<StaffMember[]>([]);
  const [form, setForm] = useState<{ teacherId: string; section: string; canAttend: boolean; canResults: boolean; canExam: boolean }>({
    teacherId: '', section: 'A', canAttend: true, canResults: false, canExam: false,
  });

  const buildClasses = useCallback((students: Student[], permissions: ClassPermission[]): ClassInfo[] => {
    const classMap: Record<string, { sections: Record<string, Student[]> }> = {};
    students.forEach(s => {
      if (!classMap[s.className]) classMap[s.className] = { sections: {} };
      if (!classMap[s.className].sections[s.section]) classMap[s.className].sections[s.section] = [];
      classMap[s.className].sections[s.section].push(s);
    });
    return Object.entries(classMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([className, { sections }]) => ({
        className,
        sections: Object.entries(sections).sort(([a], [b]) => a.localeCompare(b)).map(([sec, studs]) => ({
          section: sec,
          students: studs,
          permissions: permissions.filter(p => p.className === className && p.section === sec),
        })),
        studentCount: Object.values(sections).flat().length,
      }));
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [students, staff, perms] = await Promise.all([
        studentService.getAll(),
        staffService.getAll(),
        principalService.getStaffPermissions(),
      ]);
      const teacherStaff = staff.filter(s => s.role === 'TEACHER' || s.role === 'VICE_PRINCIPAL');
      setTeachers(teacherStaff);
      setForm(f => ({ ...f, teacherId: f.teacherId || teacherStaff[0]?.id || '' }));
      setClasses(buildClasses(students, perms));
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to load classes', 'error');
    } finally {
      setLoading(false);
    }
  }, [buildClasses, showToast]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Resolve current selections from canonical `classes` so they always reflect
  // the latest permissions after a save.
  const selectedClass = selectedClassName ? classes.find(c => c.className === selectedClassName) ?? null : null;
  const selectedSection = (selectedClass && selectedSectionName)
    ? selectedClass.sections.find(s => s.section === selectedSectionName) ?? null
    : null;

  const handleAddPermission = async () => {
    if (!selectedClass || !form.teacherId) { showToast('Select a teacher', 'error'); return; }
    const teacher = teachers.find(t => t.id === form.teacherId);
    if (!teacher) return;
    const targetSection = selectedSection?.section ?? form.section;
    setSaving(true);
    try {
      await principalService.setStaffPermission(selectedClass.className, targetSection, form.teacherId, {
        canMarkAttendance: form.canAttend,
        canUploadResults: form.canResults,
        canScheduleExam: form.canExam,
      });
      await loadAll();
      showToast(`${teacher.name} assigned to ${selectedClass.className}-${targetSection}`);
      setView(selectedSection ? 'SECTION_DETAIL' : 'CLASS_DETAIL');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to save permission', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRemovePermission = async (perm: ClassPermission) => {
    setSaving(true);
    try {
      await principalService.removeStaffPermissions(perm.className, perm.section, perm.teacherId);
      await loadAll();
      showToast('Permission removed');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to remove permission', 'error');
    } finally {
      setSaving(false);
    }
  };

  const renderHeader = (title: string, back: () => void, action?: React.ReactNode) => (
    <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
      <div className="flex items-center gap-3">
        <button onClick={back} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600"><ArrowLeft size={20} /></button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">{title}</h2>
      </div>
      {action}
    </div>
  );

  if (loading) {
    return (
      <div className="w-full bg-slate-50 flex items-center justify-center min-h-[60vh]">
        <Loader2 size={28} className="text-slate-400 animate-spin" />
      </div>
    );
  }

  /* ── ADD PERMISSION ── */
  if (view === 'ADD_PERMISSION' && selectedClass) return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('Assign Teacher', () => setView(selectedSection ? 'SECTION_DETAIL' : 'CLASS_DETAIL'))}
      <div className="flex-1 overflow-y-auto p-4  space-y-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Class</label>
            <div className="border border-slate-200 bg-slate-100 rounded-xl px-4 py-3 font-bold text-sm text-slate-600">{selectedClass.className}</div>
          </div>

          {!selectedSection && (
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Section</label>
              <div className="flex gap-2 flex-wrap">
                {selectedClass.sections.map(sec => (
                  <button key={sec.section} onClick={() => setForm(f => ({ ...f, section: sec.section }))}
                    className={`px-4 py-2 rounded-xl text-xs font-black transition-colors ${form.section === sec.section ? 'bg-indigo-600 text-white' : 'bg-slate-50 border border-slate-200 text-slate-600'}`}>
                    Section {sec.section}
                  </button>
                ))}
              </div>
            </div>
          )}
          {selectedSection && (
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Section</label>
              <div className="border border-slate-200 bg-slate-100 rounded-xl px-4 py-3 font-bold text-sm text-slate-600">Section {selectedSection.section}</div>
            </div>
          )}

          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Teacher</label>
            <select value={form.teacherId} onChange={e => setForm(f => ({ ...f, teacherId: e.target.value }))}
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500">
              <option value="">Select teacher…</option>
              {teachers.map(t => <option key={t.id} value={t.id}>{t.name} ({t.subject})</option>)}
            </select>
          </div>

          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Permissions</p>
            {[
              { label: 'Mark Attendance', desc: 'Teacher can mark daily attendance for this section', stateKey: 'canAttend' as const },
              { label: 'Upload Results', desc: 'Teacher can enter exam marks for this section', stateKey: 'canResults' as const },
              { label: 'Schedule Exams', desc: 'Teacher can create and schedule exams for this section', stateKey: 'canExam' as const },
            ].map(({ label, desc, stateKey }) => (
              <label key={stateKey} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer">
                <input type="checkbox" checked={form[stateKey]} onChange={e => setForm(f => ({ ...f, [stateKey]: e.target.checked }))} className="w-4 h-4 accent-indigo-600" />
                <div>
                  <div className="font-bold text-slate-800 text-sm">{label}</div>
                  <div className="text-[10px] text-slate-400">{desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>
        <button onClick={handleAddPermission} disabled={saving}
          className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg disabled:opacity-60">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          {saving ? 'Saving…' : 'Assign & Save'}
        </button>
      </div>
    </div>
  );

  /* ── SECTION DETAIL ── */
  if (view === 'SECTION_DETAIL' && selectedClass && selectedSection) return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader(
        `${selectedClass.className} — Section ${selectedSection.section}`,
        () => setView('CLASS_DETAIL'),
        <button onClick={() => setView('ADD_PERMISSION')} className="p-2 bg-indigo-500 text-white rounded-full shadow-md">
          <Plus size={18} />
        </button>
      )}
      <div className="flex-1 overflow-y-auto p-4  space-y-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-center">
          <div className="text-3xl font-black text-indigo-600">{selectedSection.students.length}</div>
          <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-1">Students</div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-50">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Student List</p>
          </div>
          {selectedSection.students.map((s, idx) => (
            <div key={s.id} className={`flex items-center gap-3 px-4 py-3 ${idx < selectedSection.students.length - 1 ? 'border-b border-slate-50' : ''}`}>
              <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-xs shrink-0">
                {s.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2)}
              </div>
              <div className="flex-1">
                <div className="font-bold text-slate-800 text-sm">{s.name}</div>
                <div className="text-[10px] font-bold text-slate-400">Roll {s.rollNo.padStart(2, '0')}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Teacher Permissions</p>
          {selectedSection.permissions.length === 0 && (
            <div className="flex flex-col items-center py-6 text-slate-400">
              <UserCheck size={24} className="mb-2 opacity-40" />
              <p className="font-bold text-xs">No teachers assigned</p>
              <button onClick={() => setView('ADD_PERMISSION')} className="mt-2 text-xs font-black text-indigo-600">+ Assign Teacher</button>
            </div>
          )}
          <div className="space-y-3">
            {selectedSection.permissions.map((perm, i) => (
              <div key={i} className="p-3 bg-slate-50 rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-bold text-slate-800 text-sm">{perm.teacherName}</div>
                  <button onClick={() => handleRemovePermission(perm)} disabled={saving}
                    className="p-1 text-slate-300 hover:text-rose-500 transition-colors disabled:opacity-50">
                    <XCircle size={16} />
                  </button>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  <PermBadge active={perm.canMarkAttendance} label="Attendance" />
                  <PermBadge active={perm.canUploadResults} label="Results" color="blue" />
                  <PermBadge active={!!perm.canScheduleExam} label="Exams" color="amber" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  /* ── CLASS DETAIL ── */
  if (view === 'CLASS_DETAIL' && selectedClass) return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader(selectedClass.className, () => { setSelectedClassName(null); setView('LIST'); })}
      <div className="flex-1 overflow-y-auto p-4  space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-center">
            <div className="text-2xl font-black text-indigo-600">{selectedClass.studentCount}</div>
            <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-1">Students</div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-center">
            <div className="text-2xl font-black text-emerald-600">{selectedClass.sections.length}</div>
            <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-1">Sections</div>
          </div>
        </div>

        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Sections</p>
        {selectedClass.sections.map(sec => (
          <button key={sec.section}
            onClick={() => { setSelectedSectionName(sec.section); setView('SECTION_DETAIL'); }}
            className="w-full bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-left active:scale-[0.98] transition-transform">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-50 text-indigo-700 rounded-xl flex items-center justify-center font-black text-sm">
                  {sec.section}
                </div>
                <div>
                  <div className="font-extrabold text-slate-900 text-sm">Section {sec.section}</div>
                  <div className="text-[10px] font-bold text-slate-400 mt-0.5">
                    {sec.students.length} students · {sec.permissions.length} teacher{sec.permissions.length !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex gap-1 flex-wrap justify-end">
                  {sec.permissions.slice(0, 2).map((p, i) => (
                    <span key={i} className="text-[8px] font-black bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded">{p.teacherName.split(' ')[0]}</span>
                  ))}
                  {sec.permissions.length > 2 && (
                    <span className="text-[8px] font-black bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">+{sec.permissions.length - 2}</span>
                  )}
                </div>
                <ChevronRight size={16} className="text-slate-300" />
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  /* ── LIST ── */
  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('Class Management', onBack)}
      <div className="flex-1 overflow-y-auto p-4  space-y-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Classes & Teacher Permissions</p>
        {classes.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center text-slate-400">
            <p className="font-bold text-sm">No classes yet.</p>
            <p className="text-[10px] font-bold text-slate-300 mt-1">Add students in the Student Manager to populate classes.</p>
          </div>
        )}
        {classes.map(cls => (
          <button key={cls.className}
            onClick={() => { setSelectedClassName(cls.className); setSelectedSectionName(null); setView('CLASS_DETAIL'); }}
            className="w-full bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-left active:scale-95 transition-transform">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
                  <BookOpen size={18} />
                </div>
                <div>
                  <div className="font-extrabold text-slate-900 text-sm">{cls.className}</div>
                  <div className="text-[10px] font-bold text-slate-400 mt-0.5">
                    {cls.sections.length} section{cls.sections.length !== 1 ? 's' : ''} · {cls.studentCount} students
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <div className="flex gap-1">
                  {cls.sections.map(s => (
                    <span key={s.section} className="text-[8px] font-black bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">{s.section}</span>
                  ))}
                </div>
                <ChevronRight size={16} className="text-slate-300" />
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

const PermBadge: React.FC<{ active: boolean; label: string; color?: 'green' | 'blue' | 'amber' }> = ({ active, label, color = 'green' }) => {
  const activeClass = color === 'blue' ? 'bg-blue-100 text-blue-700' : color === 'amber' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700';
  return (
    <span className={`flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-full ${active ? activeClass : 'bg-slate-100 text-slate-400'}`}>
      {active ? <CheckCircle2 size={9} /> : <XCircle size={9} />} {label}
    </span>
  );
};
