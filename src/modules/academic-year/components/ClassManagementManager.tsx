import React, { useEffect, useState, useCallback } from 'react';
import {
  ArrowLeft, Plus, ChevronRight, CheckCircle2, XCircle,
  BookOpen, UserCheck, Loader2,
} from 'lucide-react';
import { staffService } from '@/modules/staff/staff.service';
import { studentService } from '@/modules/students/student.service';
import { principalService } from '@/roles/principal/principal.service';
import { StaffMember } from '@/modules/staff/staff.types';
import { ClassPermission } from '@/roles/principal/principal.types';
import { Student } from '@/modules/students/student.types';
import { useUIStore } from '@/store/uiStore';

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
  // ADD_PERMISSION view dropped — assignment is inline inside the
  // class detail page now (one fewer nav level for principals).
  const [view, setView] = useState<'LIST' | 'CLASS_DETAIL' | 'SECTION_DETAIL'>('LIST');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [selectedClassName, setSelectedClassName] = useState<string | null>(null);
  const [selectedSectionName, setSelectedSectionName] = useState<string | null>(null);
  const [teachers, setTeachers] = useState<StaffMember[]>([]);
  // Which section card is currently expanded for inline assignment.
  // Only one open at a time so the page stays scannable.
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  // Per-section inline form state. Keyed by section so switching
  // between sections in the same class doesn't blow away in-progress
  // edits. Reset to defaults whenever a section is opened.
  const [inlineForm, setInlineForm] = useState<{
    teacherId: string; canAttend: boolean; canResults: boolean; canExam: boolean;
    applyToAllSections: boolean;
  }>({ teacherId: '', canAttend: true, canResults: false, canExam: false, applyToAllSections: false });

  const buildClasses = useCallback((students: Student[], permissions: ClassPermission[]): ClassInfo[] => {
    const classMap: Record<string, { sections: Record<string, Student[]> }> = {};
    students.forEach(s => {
      // Skip students who don't have a class+section allotment for the
      // active year. Without this guard, students whose AR row is empty
      // (last year's leavers, freshly admitted but unassigned) bucket
      // under '' / '' and surface as a phantom blank class card above
      // the real ones.
      const cls = (s.className ?? '').trim();
      const sec = (s.section ?? '').trim();
      if (!cls || !sec) return;
      // Active students only — inactive / TC-issued students linger in
      // the roster for audit purposes but shouldn't count toward the
      // teacher-permissions panel.
      if (s.isActive === false) return;
      if (!classMap[cls]) classMap[cls] = { sections: {} };
      if (!classMap[cls].sections[sec]) classMap[cls].sections[sec] = [];
      classMap[cls].sections[sec].push(s);
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

  // Inline save — supports single-section (current expanded card) and
  // bulk apply-to-all-sections via the toggle on the inline form.
  const handleInlineSave = async (className: string, section: string) => {
    if (!inlineForm.teacherId) { showToast('Select a teacher', 'error'); return; }
    const cls = classes.find(c => c.className === className);
    if (!cls) return;
    const teacher = teachers.find(t => t.id === inlineForm.teacherId);
    if (!teacher) return;
    const targets = inlineForm.applyToAllSections
      ? cls.sections.map(s => s.section)
      : [section];
    setSaving(true);
    try {
      // Sequential rather than Promise.all so a failure on section 2
      // doesn't leave partial state without surfacing it.
      for (const sec of targets) {
        await principalService.setStaffPermission(className, sec, inlineForm.teacherId, {
          canMarkAttendance: inlineForm.canAttend,
          canUploadResults: inlineForm.canResults,
          canScheduleExam: inlineForm.canExam,
        });
      }
      await loadAll();
      showToast(targets.length === 1
        ? `${teacher.name} assigned to ${className}-${section}`
        : `${teacher.name} assigned to ${targets.length} sections of ${className}`);
      setInlineForm(f => ({ ...f, teacherId: '' }));
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


  /* ── SECTION DETAIL — student list only.
       Teacher assignment lives inline on the CLASS_DETAIL screen now,
       so this view is just a roster reference. ── */
  if (view === 'SECTION_DETAIL' && selectedClass && selectedSection) return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader(
        `${selectedClass.className} — Section ${selectedSection.section}`,
        () => setView('CLASS_DETAIL'),
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
          {selectedSection.permissions.length === 0 ? (
            <div className="flex flex-col items-center py-6 text-slate-400">
              <UserCheck size={24} className="mb-2 opacity-40" />
              <p className="font-bold text-xs">No teachers assigned</p>
              <p className="text-[10px] font-bold text-slate-300 mt-1">Assign from the class screen</p>
            </div>
          ) : (
          <div className="space-y-3">
            {selectedSection.permissions.map((perm, i) => (
              <div key={i} className="p-3 bg-slate-50 rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-bold text-slate-800 text-sm">{perm.teacherName}</div>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  <PermBadge active={perm.canMarkAttendance} label="Attendance" />
                  <PermBadge active={perm.canUploadResults} label="Results" color="blue" />
                  <PermBadge active={!!perm.canScheduleExam} label="Exams" color="amber" />
                </div>
              </div>
            ))}
          </div>
          )}
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
        {selectedClass.sections.map(sec => {
          const isExpanded = expandedSection === sec.section;
          return (
          <div key={sec.section}
            className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            {/* Section header — tap to expand inline assignment. */}
            <button
              onClick={() => {
                if (isExpanded) {
                  setExpandedSection(null);
                } else {
                  setExpandedSection(sec.section);
                  // Reset inline form fresh each time a section opens.
                  setInlineForm({
                    teacherId: '',
                    canAttend: true, canResults: false, canExam: false,
                    applyToAllSections: false,
                  });
                }
              }}
              className="w-full p-4 text-left active:scale-[0.99] transition-transform">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 bg-indigo-50 text-indigo-700 rounded-xl flex items-center justify-center font-black text-sm shrink-0">
                    {sec.section}
                  </div>
                  <div className="min-w-0">
                    <div className="font-extrabold text-slate-900 text-sm">Section {sec.section}</div>
                    <div className="text-[10px] font-bold text-slate-400 mt-0.5 truncate">
                      {sec.students.length} students · {sec.permissions.length} teacher{sec.permissions.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
                <ChevronRight
                  size={18}
                  className={`text-slate-300 shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
              </div>
            </button>

            {/* Inline assignment panel — replaces the old separate
                ADD_PERMISSION view. Currently-assigned teachers as
                chips with remove (×), then a compact "add new" row
                with teacher dropdown + permission toggles + optional
                "apply to all sections" for bulk assignment. */}
            {isExpanded && (
              <div className="px-4 pb-4 pt-2 space-y-3 border-t border-slate-50 bg-slate-50/40">
                {/* Existing assignments */}
                {sec.permissions.length === 0 ? (
                  <p className="text-[11px] font-bold text-slate-400 italic">No teachers assigned yet</p>
                ) : (
                  <div className="space-y-2">
                    {sec.permissions.map((perm, i) => (
                      <div key={i} className="bg-white border border-slate-100 rounded-xl p-3 flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-extrabold text-slate-900 text-sm truncate">{perm.teacherName}</div>
                          <div className="flex gap-1 flex-wrap mt-1.5">
                            <PermBadge active={perm.canMarkAttendance} label="Attendance" />
                            <PermBadge active={perm.canUploadResults} label="Results" color="blue" />
                            <PermBadge active={!!perm.canScheduleExam} label="Exams" color="amber" />
                          </div>
                        </div>
                        <button onClick={() => handleRemovePermission(perm)} disabled={saving}
                          title="Remove teacher"
                          className="p-1.5 text-slate-300 hover:text-rose-500 transition-colors disabled:opacity-50 shrink-0">
                          <XCircle size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add a new teacher inline */}
                <div className="bg-white border border-slate-100 rounded-xl p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <UserCheck size={14} className="text-indigo-600 shrink-0" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Add Teacher</span>
                  </div>
                  <select value={inlineForm.teacherId}
                    onChange={e => setInlineForm(f => ({ ...f, teacherId: e.target.value }))}
                    className="w-full border border-slate-200 bg-slate-50 rounded-lg px-3 py-2.5 font-bold text-sm outline-none focus:border-indigo-500">
                    <option value="">Select teacher…</option>
                    {teachers.map(t => <option key={t.id} value={t.id}>{t.name}{t.subject ? ` · ${t.subject}` : ''}</option>)}
                  </select>
                  {/* Permission chips — tap to toggle, no separate
                      checkboxes. Visually obvious which ones are on. */}
                  <div className="flex gap-1.5 flex-wrap">
                    {([
                      { key: 'canAttend' as const,  label: 'Attendance', tone: 'emerald' },
                      { key: 'canResults' as const, label: 'Results',    tone: 'blue' },
                      { key: 'canExam' as const,    label: 'Exams',      tone: 'amber' },
                    ]).map(({ key, label, tone }) => {
                      const active = inlineForm[key];
                      const styles = active
                        ? `bg-${tone}-100 border-${tone}-300 text-${tone}-700`
                        : 'bg-slate-100 border-slate-200 text-slate-500';
                      return (
                        <button key={key}
                          onClick={() => setInlineForm(f => ({ ...f, [key]: !active }))}
                          className={`px-3 py-1.5 rounded-full border text-[11px] font-black transition-colors ${styles}`}>
                          {active ? '✓ ' : ''}{label}
                        </button>
                      );
                    })}
                  </div>
                  {/* Bulk apply — visible only when this class has
                      more than one section. */}
                  {selectedClass.sections.length > 1 && (
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input type="checkbox" checked={inlineForm.applyToAllSections}
                        onChange={e => setInlineForm(f => ({ ...f, applyToAllSections: e.target.checked }))}
                        className="w-4 h-4 accent-indigo-600" />
                      <span className="text-[11px] font-bold text-slate-700">
                        Apply to all {selectedClass.sections.length} sections of {selectedClass.className}
                      </span>
                    </label>
                  )}
                  <button
                    onClick={() => handleInlineSave(selectedClass.className, sec.section)}
                    disabled={saving || !inlineForm.teacherId}
                    className="w-full py-2.5 bg-indigo-600 text-white font-black text-xs uppercase tracking-widest rounded-lg active:scale-95 disabled:opacity-50 transition-transform">
                    {saving ? 'Saving…' : (inlineForm.applyToAllSections ? 'Assign to all sections' : 'Assign to this section')}
                  </button>
                </div>

                {/* View student list (only navigates if user wants the
                    full roster — kept as a small secondary action so
                    the principal isn't forced through it). */}
                <button onClick={() => { setSelectedSectionName(sec.section); setView('SECTION_DETAIL'); }}
                  className="w-full text-center text-[11px] font-black text-indigo-600 py-1.5 hover:bg-indigo-50 rounded-lg">
                  View {sec.students.length} student{sec.students.length !== 1 ? 's' : ''} →
                </button>
              </div>
            )}
          </div>
          );
        })}
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
