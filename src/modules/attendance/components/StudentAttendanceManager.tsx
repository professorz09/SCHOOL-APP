import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, ChevronLeft, ChevronRight, ShieldCheck,
  Save, Download, RefreshCw, Search, Lock,
  AlertCircle, LayoutGrid, Loader2,
} from 'lucide-react';
import { studentService } from '@/modules/students/student.service';
import { Student } from '@/modules/students/student.types';
import { sharedAttendance, SharedAttendanceRecord, AttendanceStudentRecord, GridDateRecord, GridStudentDetails, AttendanceCellStatus } from '@/modules/attendance/attendance.service';
import { useUIStore } from '@/store/uiStore';
import { useAcademicYear } from '@/shared/context/AcademicYearContext';
import { useEditGuard } from '@/store/correctionStore';
import { useEditorModeStore } from '@/store/editorModeStore';
import { apiAttendance } from '@/lib/apiClient';
import { todayIST, istDateOf } from '@/shared/utils/date';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { exportCsv } from '@/shared/utils/csv';
import { stripClassPrefix } from '@/shared/utils/className';

interface Props { onBack: () => void; }

type View = 'OVERVIEW' | 'GRID' | 'RECORDS' | 'MARK' | 'EDIT_RECORD';

// Half-day was removed from the student attendance flow — schools mark either
// Present, Absent, or Holiday. Existing records still render with their old
// 'half' status (the type stays in AttendanceCellStatus for backward compat),
// but the cell-cycle and bulk-set buttons no longer offer it.
const CELL_CYCLE: AttendanceCellStatus[] = ['present', 'absent', 'holiday'];
const NEXT_STATUS = (s: AttendanceCellStatus): AttendanceCellStatus => {
  const idx = CELL_CYCLE.indexOf(s);
  // Unknown/legacy values (e.g. 'half') reset to 'present' on next click.
  return CELL_CYCLE[(idx === -1 ? 0 : idx + 1) % CELL_CYCLE.length];
};
const CELL_LABEL: Record<AttendanceCellStatus, string> = {
  present: 'P', absent: 'A', holiday: 'H', half: 'HD',
};
const CELL_BG: Record<AttendanceCellStatus, string> = {
  present: 'bg-emerald-500 text-white',
  absent:  'bg-rose-500 text-white',
  holiday: 'bg-slate-200 text-slate-600',
  half:    'bg-amber-400 text-white',
};

const STATUS_HDR: Record<string, string> = {
  APPROVED: 'bg-emerald-50/60',
  PENDING:  'bg-amber-50/60',
  REJECTED: 'bg-rose-50/30',
};

// IST-aware "today" — `toISOString()` returns the UTC date, which flips to
// the next day after 18:30 IST and showed tomorrow's grid late at night.
const todayStr = () => todayIST();
const ATT_COLOR = (pct: number) => pct >= 90 ? 'bg-emerald-500' : pct >= 75 ? 'bg-amber-400' : 'bg-rose-500';
const ATT_TEXT  = (pct: number) => pct >= 90 ? 'text-emerald-600' : pct >= 75 ? 'text-amber-600' : 'text-rose-600';
const avg       = (nums: number[]) => nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : 0;

function currentYearMonth(): string {
  const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function buildMonthDates(ym: string, yearStart?: string, yearEnd?: string): string[] {
  const [y, m] = ym.split('-').map(Number);
  const today = todayStr();
  const ceiling = yearEnd && yearEnd < today ? yearEnd : today;
  const floor   = yearStart ?? '0000-01-01';
  const out: string[] = [];
  const dim = new Date(y, m, 0).getDate();
  for (let d = 1; d <= dim; d++) {
    const ds = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    if (ds >= floor && ds <= ceiling) out.push(ds);
  }
  return out;
}
function fmtDay(d: string) { return String(new Date(d).getDate()); }
function fmtDayShort(d: string) { return new Date(d).toLocaleDateString('en-IN', { weekday: 'narrow' }); }


export const StudentAttendanceManager: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  const { currentYear } = useAcademicYear();
  const isYearClosed = !!currentYear && currentYear.status === 'LOCKED';
  const editGuard = useEditGuard(currentYear?.id, isYearClosed);
  const editorModeActive = useEditorModeStore(s => s.isActive());

  const [students, setStudents] = useState<Student[]>([]);
  const [records,  setRecords]  = useState<SharedAttendanceRecord[]>([]);
  const [view, setView]         = useState<View>('OVERVIEW');

  // Grid state
  const [gridClass,   setGridClass]   = useState('');
  const [gridSection, setGridSection] = useState('');
  const [gridYM,      setGridYM]      = useState(currentYearMonth());
  const [gridDates,   setGridDates]   = useState<string[]>([]);
  const [gridRecords, setGridRecords] = useState<GridDateRecord[]>([]);
  const [gridDetails, setGridDetails] = useState<GridStudentDetails>({});
  const [gridStudents, setGridStudents] = useState<{ id: string; name: string; rollNo: string; admissionDate: string }[]>([]);
  const [gridLoading, setGridLoading] = useState(false);
  const [gridSearch,  setGridSearch]  = useState('');
  const [editBuffer, setEditBuffer]   = useState<Record<string, Record<string, AttendanceCellStatus>>>({});
  // Mistouch guard for the mobile grid. Cells only react to taps when
  // edit mode is explicitly on. Default OFF so casual scrolling /
  // accidental brushes can't change attendance. The "Edit" toggle in the
  // grid header flips this; it auto-disables after Save to prevent
  // lingering edit mode.
  const [gridEditMode, setGridEditMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sectionId, setSectionId] = useState<string | null>(null);

  // Edit record state
  const [editRecord, setEditRecord]         = useState<SharedAttendanceRecord | null>(null);
  const [editStudents, setEditStudents]     = useState<AttendanceStudentRecord[]>([]);
  const [correctionReason, setCorrectionReason] = useState('');

  // Mark state (principal direct mark)
  const [markClass, setMarkClass]     = useState('');
  const [markSection, setMarkSection] = useState('');
  const [markDate, setMarkDate]       = useState(todayStr());
  const [markStudents, setMarkStudents] = useState<AttendanceStudentRecord[]>([]);
  const [markConflict, setMarkConflict] = useState<SharedAttendanceRecord | null>(null);

  const session = useAuthStore(s => s.session);

  // Clamp markDate into the active-year window. When correction mode
  // shifts currentYear to a closed past year, today's date is outside
  // that window — defaulting to today would let the principal mark
  // attendance for a date that doesn't belong to the year. Snap to
  // the year's endDate (most recent valid day) instead.
  useEffect(() => {
    if (!currentYear) return;
    const today = todayStr();
    const start = currentYear.startDate;
    const end   = currentYear.endDate;
    if (start && end) {
      if (markDate < start || markDate > end) {
        // Prefer today if it's inside the window; else snap to endDate.
        setMarkDate(today >= start && today <= end ? today : end);
      }
    }
  }, [currentYear?.id, currentYear?.startDate, currentYear?.endDate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!currentYear) return;
    const endYM   = currentYear.endDate   ? currentYear.endDate.slice(0, 7)   : currentYearMonth();
    const startYM = currentYear.startDate ? currentYear.startDate.slice(0, 7) : currentYearMonth();
    setGridYM(prev => {
      if (prev > endYM)   return endYM;
      if (prev < startYM) return startYM;
      return prev;
    });
  }, [currentYear?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [studs, recs] = await Promise.all([
          studentService.getAll(),
          sharedAttendance.getAll(),
        ]);
        if (!cancelled) { setStudents(studs); setRecords(recs); }
      } catch (e) {
        if (!cancelled) showToast((e as Error).message || 'Failed to load', 'error');
      }
    })();
    return () => { cancelled = true; };
  }, [showToast]);

  const refreshRecords = async () => {
    try { setRecords(await sharedAttendance.getAll()); }
    catch (e) { showToast((e as Error).message || 'Failed to refresh', 'error'); }
  };

  const classOptions = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const s of students) {
      // Skip students who have no class+section allotment for the
      // active year. Without this guard their empty-string class
      // bucket renders as a phantom blank "Class" option above the
      // real ones.
      const cls = (s.className ?? '').trim();
      const sec = (s.section ?? '').trim();
      if (!cls || !sec) continue;
      if (s.isActive === false) continue;
      if (!map.has(cls)) map.set(cls, new Set());
      map.get(cls)!.add(sec);
    }
    return Array.from(map.entries())
      .map(([name, sections]) => ({ name, sections: [...sections].sort() }))
      .sort((a, b) => parseInt(stripClassPrefix(a.name)) - parseInt(stripClassPrefix(b.name)));
  }, [students]);

  const overallAvg   = avg(students.map(s => s.attendancePercent));
  const lowCount     = students.filter(s => s.attendancePercent < 75).length;

  // ── Resolve section ID for Excel export ────────────────────────────────────
  const resolveSectionId = useCallback(async (className: string, section: string): Promise<string | null> => {
    if (!session?.schoolId || !currentYear?.id) return null;
    const { data } = await supabase
      .from('sections').select('id')
      .eq('school_id', session.schoolId)
      .eq('academic_year_id', currentYear.id)
      .eq('class_name', className)
      .eq('section', section)
      .limit(1);
    const row = (data ?? [])[0] as { id: string } | undefined;
    return row?.id ?? null;
  }, [session, currentYear]);

  // ── Load grid ──────────────────────────────────────────────────────────────
  const loadGrid = useCallback(async (cls: string, sec: string, ym: string) => {
    if (!cls || !sec) return;
    setGridLoading(true);
    setEditBuffer({});
    try {
      const secId = await resolveSectionId(cls, sec);
      setSectionId(secId);
      if (!secId) { setGridLoading(false); return; }

      const dates = buildMonthDates(ym, currentYear?.startDate, currentYear?.endDate);
      setGridDates(dates);
      if (dates.length === 0) {
        setGridRecords([]); setGridDetails({}); setGridStudents([]);
        return;
      }
      const { records: recs, studentDetails } = await sharedAttendance.getGrid(secId, dates[0], dates[dates.length - 1]);
      setGridRecords(recs);
      setGridDetails(studentDetails);

      const sectionStudents = students
        .filter(s => s.className === cls && s.section === sec)
        .sort((a, b) => parseInt(a.rollNo || '0') - parseInt(b.rollNo || '0'))
        .map(s => ({
          id: s.id, name: s.name, rollNo: s.rollNo ?? '',
          // admission_date drives the N/E gate — dates before this for a
          // mid-session admission show as "Not Enrolled" and stay out of
          // both the percentage numerator and denominator.
          admissionDate: s.admissionDate ?? '',
        }));
      setGridStudents(sectionStudents);
    } catch (e) {
      showToast((e as Error).message || 'Failed to load grid', 'error');
    } finally {
      setGridLoading(false);
    }
  }, [students, showToast, resolveSectionId]);

  useEffect(() => {
    if (view === 'GRID' && gridClass && gridSection) loadGrid(gridClass, gridSection, gridYM);
  }, [view, gridClass, gridSection, gridYM, loadGrid]);

  const recordMap = useMemo(() => {
    const m: Record<string, GridDateRecord> = {};
    for (const r of gridRecords) m[r.date] = r;
    return m;
  }, [gridRecords]);

  const cellStatus = (date: string, stuId: string): AttendanceCellStatus | null => {
    if (editBuffer[date]?.[stuId] !== undefined) return editBuffer[date][stuId];
    return gridDetails[date]?.[stuId] ?? null;
  };

  // Cell tap → cycle status. Two prior issues:
  //   1. The "Tap Edit" toast fired on every tap when edit mode was off,
  //      stacking duplicate toasts. Silent no-op now — the blue banner
  //      and the disabled cell styling already convey the state.
  //   2. Locked records bounced the user to a "Records" page that no
  //      longer exists. With Editor Mode on, we now allow the cell to
  //      cycle and the save handler routes through /update-students
  //      with a reason prompt. Without Editor Mode it stays read-only,
  //      again silently — the lock icon in the header already explains.
  // True when this date falls before the student joined the school. Such
  // cells show "N/E" (Not Enrolled), are non-editable, and are excluded
  // from both the % numerator and denominator. Empty admissionDate is
  // treated as "always enrolled" so legacy rows without the column don't
  // accidentally lock out their entire history.
  const isPreEnrollment = (admissionDate: string, date: string): boolean =>
    !!admissionDate && date < admissionDate;

  const toggleCell = (date: string, stuId: string) => {
    if (!gridEditMode) return;
    if (date > todayStr()) return;
    const rec = recordMap[date];
    // Locked (already-saved) records still require Editor Mode — the lock
    // icon + amber banner explain why. Brand-new dates (no record yet) are
    // editable freely, since there's nothing to overwrite.
    if (rec?.isLocked && !editorModeActive) return;
    const stu = gridStudents.find(s => s.id === stuId);
    if (stu && isPreEnrollment(stu.admissionDate, date)) return;
    setEditBuffer(prev => {
      const cur = prev[date]?.[stuId] ?? gridDetails[date]?.[stuId] ?? 'present';
      return { ...prev, [date]: { ...(prev[date] ?? {}), [stuId]: NEXT_STATUS(cur) } };
    });
  };

  const bulkSetDate = (date: string, status: AttendanceCellStatus) => {
    if (!gridEditMode) return;
    if (date > todayStr()) return;
    const rec = recordMap[date];
    if (rec?.isLocked && !editorModeActive) return;
    // Bulk skips students who weren't yet enrolled on this date — a class
    // teacher hitting "All Present" for 1-Apr shouldn't mark a student
    // admitted on 1-May as present.
    const entries: Record<string, AttendanceCellStatus> = {};
    for (const s of gridStudents) {
      if (isPreEnrollment(s.admissionDate, date)) continue;
      entries[s.id] = status;
    }
    setEditBuffer(prev => ({ ...prev, [date]: entries }));
  };

  // Submit edits for a date. Two paths:
  //   • Date has no record yet (or unlocked) → /submit creates+locks it.
  //   • Date already has a locked record → /update-students with a reason
  //     (Editor Mode is required server-side, the toggleCell guard already
  //     enforces it client-side). Earlier this routed everything through
  //     /submit, which the server rejected for locked records — that's why
  //     grid edits silently failed.
  // Returns true on success so the bulk "Save All" loop can count
  // wins/losses without relying on a stale editBuffer closure read.
  const saveDate = async (date: string): Promise<boolean> => {
    if (!editGuard.canEdit) {
      showToast('Year closed — enable Correction Mode first', 'error'); return false;
    }
    if (!sectionId) { showToast('Section not resolved — reload the grid', 'error'); return false; }
    const edits = editBuffer[date];
    if (!edits || Object.keys(edits).length === 0) return false;
    const rec = recordMap[date];
    const isLockedEdit = !!rec?.isLocked;

    // Locked (already-saved) records can only be re-saved when global
    // Editor Mode is active — the same gate we use for cell taps. New
    // dates without a record skip this check entirely.
    if (isLockedEdit && !editorModeActive) {
      showToast('Locked — enable Editor Mode in Settings to edit this date', 'error'); return false;
    }

    // Build the per-student payload, dropping anyone who wasn't enrolled
    // yet on this date. Server also enforces the same filter as
    // defence-in-depth, but pruning client-side keeps the UI roster honest.
    const stuRecords: import('@/modules/attendance/attendance.service').AttendanceStudentRecord[] =
      gridStudents
        .filter(s => !isPreEnrollment(s.admissionDate, date))
        .map(s => ({
          id: s.id,
          name: s.name,
          rollNo: s.rollNo,
          isPresent: (edits[s.id] ?? gridDetails[date]?.[s.id] ?? 'present') !== 'absent',
          status: edits[s.id] ?? gridDetails[date]?.[s.id] ?? 'present' as AttendanceCellStatus,
        }));

    let reason: string | undefined;
    if (isLockedEdit) {
      const r = window.prompt('Reason for editing this locked date:')?.trim();
      if (!r) return false;
      reason = r;
    }

    setIsSubmitting(true);
    try {
      const result = await editGuard.gate(
        // Routing rule:
        //   • Existing record (locked or not) → /update-students. Locked
        //     branches need a reason; unlocked don't, but the route still
        //     handles the upsert cleanly. Going through /submit on an
        //     existing locked row triggers the "locked — contact principal"
        //     403 even when the caller IS the principal, since the route
        //     can't tell us-vs-them apart at that point.
        //   • Brand-new date with no record → /submit. Auto-locks on save.
        // Cast to void so editGuard.gate's union return stays uniform.
        async () => {
          if (rec) {
            await sharedAttendance.updateStudents(rec.id, stuRecords, reason);
          } else {
            await sharedAttendance.submitSection(sectionId, date, stuRecords);
          }
        },
        { entityType: 'student_attendance', entityId: `${gridClass}/${gridSection}/${date}` },
      );
      if (result === undefined) return false;
      showToast(`Attendance saved for ${new Date(date).getDate()}/${new Date(date).getMonth() + 1}`);
      setEditBuffer(prev => {
        const n = { ...prev }; delete n[date];
        if (Object.keys(n).length === 0) setGridEditMode(false);
        return n;
      });
      await loadGrid(gridClass, gridSection, gridYM);
      return true;
    } catch (e) {
      showToast((e as Error).message || 'Failed to save', 'error');
      return false;
    } finally { setIsSubmitting(false); }
  };

  // approveDate / handleApprove / handleReject removed — submission auto-locks
  // and there's no pending state anymore. Corrections go through openEdit() in
  // the Records list (which still requires Editor Mode for locked rows).

  // Excel export — always exports the full academic year for the selected class/section
  const handleExcelExport = async () => {
    if (!sectionId || !gridClass || !gridSection) {
      showToast('Select a class and section first', 'error'); return;
    }
    if (!currentYear) {
      showToast('No active academic year found', 'error'); return;
    }
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) throw new Error('Not authenticated');
      // Export the full academic year, not just the current month viewport.
      const startDate = currentYear.startDate;
      const endDate   = currentYear.endDate;
      const url = apiAttendance.exportExcelUrl(sectionId, startDate, endDate, gridClass, gridSection);
      const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `Attendance_${gridClass}_${gridSection}_${currentYear.name}.xlsx`;
      link.click();
      URL.revokeObjectURL(link.href);
      showToast('Excel file downloaded (full year)');
    } catch (e) {
      showToast((e as Error).message || 'Export failed', 'error');
    }
  };

  // ── Mark / Edit record flows ───────────────────────────────────────────────
  // checkConflict was earlier "if a record exists, hide everything and show
  // a banner". That left the principal stranded — they couldn't see who's
  // marked, couldn't fix a typo without navigating to Records. Now we
  // ALWAYS hydrate the markStudents list:
  //   * No existing record → fresh roster, all-present default.
  //   * Existing record   → load that record's actual rows so they appear
  //                          on screen. Editing them is gated by Editor
  //                          Mode (the locked record has is_locked=true,
  //                          enforced server-side in /update-students).
  const checkConflict = async (className: string, section: string, date: string) => {
    if (!className || !section) { setMarkConflict(null); setMarkStudents([]); return; }
    try {
      const existing = await sharedAttendance.getByClassNameSectionDate(className, section, date);
      setMarkConflict(existing);
      if (existing) {
        const stus = await sharedAttendance.getStudents(existing.id);
        setMarkStudents(stus);
      } else {
        const ss = students.filter(s => s.className === className && s.section === section)
          .sort((a, b) => parseInt(a.rollNo) - parseInt(b.rollNo));
        setMarkStudents(ss.map(s => ({ id: s.id, name: s.name, rollNo: s.rollNo, isPresent: true, status: 'present' as AttendanceCellStatus })));
      }
    } catch (e) { showToast((e as Error).message || 'Failed to check', 'error'); }
  };

  // Locked rows can only be flipped when Editor Mode is on. The banner
  // above the list already explains that, so we silently no-op here
  // instead of stacking a toast on every tap (the earlier behaviour
  // produced 4-5 identical "Locked" toasts when the principal kept
  // probing the rows).
  const toggleMarkStudent = (id: string) => {
    if (markConflict && !editorModeActive) return;
    setMarkStudents(prev => prev.map(s => s.id === id ? { ...s, isPresent: !s.isPresent, status: s.status === 'absent' ? 'present' : 'absent' } : s));
  };

  // Two paths: fresh mark (no existing record) or edit-of-locked
  // (existing record, requires Editor Mode + reason). The save button label
  // and the underlying API call switch based on which path applies.
  const submitMark = async () => {
    if (!markClass || !markSection || !markDate || markStudents.length === 0) return;
    if (!editGuard.canEdit) { showToast('Year closed — enable Correction Mode', 'error'); return; }
    // Future-date block.
    if (markDate > todayStr()) {
      showToast('Future date — not allowed', 'error'); return;
    }
    // Hard year-window guard. In correction mode for a closed year
    // the date strip already filters dates to the year, but a user
    // could in principle hit submit through a stale state — the
    // server-side year scoping would otherwise create an out-of-year
    // record. Validate explicitly.
    if (currentYear?.startDate && markDate < currentYear.startDate) {
      showToast(`Date ${markDate} is before the academic year started (${currentYear.startDate})`, 'error');
      return;
    }
    if (currentYear?.endDate && markDate > currentYear.endDate) {
      showToast(`Date ${markDate} is after the academic year ended (${currentYear.endDate})`, 'error');
      return;
    }
    if (markConflict && !editorModeActive) {
      showToast('Already marked. Enable Editor Mode to edit.', 'error');
      return;
    }
    if (markConflict) {
      const reason = window.prompt('Reason for editing this locked record:')?.trim();
      if (!reason) return;
      setIsSubmitting(true);
      try {
        await editGuard.gate(
          () => sharedAttendance.updateStudents(markConflict.id, markStudents, reason),
          { entityType: 'student_attendance', entityId: markConflict.id },
        );
        await refreshRecords();
        showToast('Attendance updated');
        setView('GRID');
        setGridClass(markClass); setGridSection(markSection);
      } catch (e) {
        showToast((e as Error).message || 'Failed to update', 'error');
      } finally { setIsSubmitting(false); }
      return;
    }
    setIsSubmitting(true);
    try {
      // Re-check immediately before submit to close the TOCTOU window where
      // another user marked this class+date between the form opening and
      // this click. Without this, a concurrent submit silently overwrites
      // the other user's record.
      const reCheck = await sharedAttendance.getByClassNameSectionDate(markClass, markSection, markDate);
      if (reCheck) {
        setMarkConflict(reCheck);
        showToast('This class+date was just marked by someone else — review before saving.', 'error');
        return;
      }
      const result = await editGuard.gate(
        () => sharedAttendance.submitPrincipal(markClass, markSection, markDate, markStudents),
        { entityType: 'student_attendance', entityId: `${markClass}/${markSection}/${markDate}` },
      );
      if (result === undefined) return;
      await refreshRecords();
      showToast('Attendance saved');
      setView('GRID');
      setGridClass(markClass); setGridSection(markSection);
    } catch (e) {
      showToast((e as Error).message || 'Failed to mark', 'error');
    } finally { setIsSubmitting(false); }
  };

  const openEdit = async (rec: SharedAttendanceRecord) => {
    setEditRecord(rec);
    setEditStudents([]);
    setCorrectionReason('');
    setView('EDIT_RECORD');
    try {
      const stus = await sharedAttendance.getStudents(rec.id);
      setEditStudents(stus);
    } catch (e) { showToast((e as Error).message || 'Failed to load', 'error'); }
  };

  const toggleEditStudent = (id: string) =>
    setEditStudents(prev => prev.map(s => {
      if (s.id !== id) return s;
      const next = NEXT_STATUS(s.status);
      return { ...s, status: next, isPresent: next === 'present' || next === 'half' };
    }));

  const saveEdit = async () => {
    if (!editRecord) return;
    if (!editGuard.canEdit) {
      showToast('Year closed — enable Correction Mode', 'error'); return;
    }
    // For locked (approved) records on an active year: require Editor Mode from Settings.
    if (editRecord.isLocked && !isYearClosed && !editorModeActive) {
      showToast('Enable Editor Mode in Settings to correct approved records', 'error'); return;
    }
    if (editRecord.isLocked && !correctionReason.trim()) {
      showToast('A correction reason is required for approved records', 'error'); return;
    }
    setIsSubmitting(true);
    try {
      const reason = editRecord.isLocked ? correctionReason.trim() : undefined;
      const result = await editGuard.gate(
        () => sharedAttendance.updateStudents(editRecord.id, editStudents, reason),
        { entityType: 'student_attendance', entityId: editRecord.id },
      );
      if (result === undefined) return;
      await refreshRecords();
      showToast('Attendance updated');
      setView('RECORDS');
    } catch (e) {
      showToast((e as Error).message || 'Failed to update', 'error');
    } finally { setIsSubmitting(false); }
  };

  const filteredGridStudents = useMemo(() =>
    gridStudents.filter(s =>
      s.name.toLowerCase().includes(gridSearch.toLowerCase()) || s.rollNo.includes(gridSearch),
    ), [gridStudents, gridSearch]);

  const changeMonth = (delta: number) => {
    const [y, m] = gridYM.split('-').map(Number);
    const nd = new Date(y, m - 1 + delta, 1);
    const nm = `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2,'0')}`;
    if (nm > currentYearMonth()) return;
    // Don't navigate before the academic year's start month.
    if (currentYear?.startDate) {
      const yearStartYM = currentYear.startDate.slice(0, 7);
      if (nm < yearStartYM) return;
    }
    setGridYM(nm);
  };

  /* ── EDIT_RECORD ─────────────────────────────────────────────────────────── */
  if (view === 'EDIT_RECORD' && editRecord) {
    const present = editStudents.filter(s => s.status === 'present' || s.status === 'half').length;
    const absent  = editStudents.filter(s => s.status === 'absent').length;
    return (
      <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 sticky top-0 z-10 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <button onClick={() => setView('RECORDS')} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
              <ArrowLeft size={20} />
            </button>
            <div>
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Edit Attendance</h2>
              <p className="text-[10px] font-bold text-slate-400">{editRecord.className}-{editRecord.section} · {editRecord.date}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="text-center bg-emerald-50 rounded-xl py-2">
              <div className="text-lg font-black text-emerald-600">{present}</div>
              <div className="text-[9px] font-black text-emerald-500 uppercase">Present</div>
            </div>
            <div className="text-center bg-rose-50 rounded-xl py-2">
              <div className="text-lg font-black text-rose-500">{absent}</div>
              <div className="text-[9px] font-black text-rose-400 uppercase">Absent</div>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 pb-36 space-y-3">
          {editRecord.isLocked && !isYearClosed && !editorModeActive && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3 flex items-start gap-2">
              <Lock size={14} className="text-rose-500 shrink-0 mt-0.5"/>
              <p className="text-[10px] font-bold text-rose-700">
                Enable <span className="font-black">Editor Mode</span> in Settings to correct approved records.
              </p>
            </div>
          )}
          {editRecord.isLocked && (isYearClosed ? editGuard.canEdit : editorModeActive) && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3">
              <div className="flex items-start gap-2 mb-2">
                <AlertCircle size={14} className="text-amber-600 shrink-0 mt-0.5"/>
                <p className="text-[10px] font-bold text-amber-700">
                  This record is approved &amp; locked. Provide a reason for the correction.
                </p>
              </div>
              <textarea
                value={correctionReason}
                onChange={e => setCorrectionReason(e.target.value)}
                placeholder="Correction reason (required)…"
                rows={2}
                className="w-full border border-amber-300 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-amber-500 bg-white resize-none"
              />
            </div>
          )}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            {editStudents.map((s, idx) => {
              const rowBg = s.status === 'present' ? 'bg-emerald-50'
                : s.status === 'absent'  ? 'bg-rose-50'
                : s.status === 'holiday' ? 'bg-slate-50'
                : 'bg-amber-50';
              return (
                <button key={s.id}
                  onClick={() => toggleEditStudent(s.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors ${idx < editStudents.length - 1 ? 'border-b border-slate-100' : ''} ${rowBg}`}>
                  <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-xs shrink-0">
                    {s.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-slate-900 text-sm">{s.name}</div>
                    <div className="text-[10px] font-bold text-slate-400">Roll {s.rollNo.padStart(2, '0')}</div>
                  </div>
                  <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg ${CELL_BG[s.status]}`}>
                    {CELL_LABEL[s.status]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-100 flex gap-2">
          <button
            onClick={saveEdit}
            disabled={
              isSubmitting || editStudents.length === 0 ||
              (editRecord.isLocked && !isYearClosed && !editorModeActive) ||
              (editRecord.isLocked && !correctionReason.trim())
            }
            className="flex-1 flex items-center justify-center gap-2 bg-slate-700 text-white font-black text-xs uppercase py-3.5 rounded-2xl active:scale-95 transition-transform disabled:opacity-60">
            <Save size={14}/> {isSubmitting ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    );
  }

  /* ── GRID VIEW ───────────────────────────────────────────────────────────── */
  if (view === 'GRID') {
    const hasEdits = Object.keys(editBuffer).some(d => Object.keys(editBuffer[d] ?? {}).length > 0);
    return (
      <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300 h-full">
        {/* Header — compact two-row layout that fits a 360 px viewport.
            Title + Edit toggle on row 1, exports collapsed into a single
            overflow icon if needed. The previous layout wrapped "ATTENDANCE
            GRID" to two lines and pushed CSV/Excel buttons off-screen. */}
        <div className="bg-white border-b border-slate-100 px-3 pt-3 pb-2 sticky top-0 z-10 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <button onClick={() => { setView('OVERVIEW'); setEditBuffer({}); setGridEditMode(false); }}
              className="p-2 -ml-1 bg-slate-100 rounded-full text-slate-600 shrink-0">
              <ArrowLeft size={18} />
            </button>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-black text-slate-900 uppercase tracking-tight truncate">Attendance</h2>
              {gridClass && <p className="text-[10px] font-bold text-slate-400 truncate">{gridClass}-{gridSection}</p>}
            </div>
            {gridLoading && <RefreshCw size={14} className="text-slate-400 animate-spin shrink-0"/>}
            {/* Edit toggle — primary mistouch guard. On = cells respond to
                tap; Off = cells are read-only. Sized like a real button so
                it's the obvious next action when arriving on this screen. */}
            {sectionId && gridDates.length > 0 && (
              <button onClick={() => setGridEditMode(m => !m)}
                className={`shrink-0 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors ${
                  gridEditMode
                    ? 'bg-rose-600 text-white'
                    : 'bg-slate-900 text-white'
                }`}>
                {gridEditMode ? 'Done' : 'Edit'}
              </button>
            )}
            {sectionId && gridDates.length > 0 && (
              <>
                <button
                  onClick={() => {
                    // Wide-grid CSV: rows = students, columns = dates,
                    // cells = P / A / H / HD. Mirrors the on-screen grid so
                    // a principal can paste it straight into a printed
                    // register. Earlier we exported a long list (one row
                    // per student × date) which wasn't usable as a "register".
                    type Row = Record<string, string>;
                    const rows: Row[] = gridStudents.map(s => {
                      const row: Row = {
                        Roll: (s.rollNo ?? '').padStart(2, '0'),
                        Name: s.name,
                      };
                      let p = 0, a = 0, h = 0, hd = 0;
                      for (const d of gridDates) {
                        const cell = gridDetails[d]?.[s.id];
                        const day = String(new Date(d).getDate()).padStart(2, '0');
                        if (cell === 'present') { row[day] = 'P'; p++; }
                        else if (cell === 'absent') { row[day] = 'A'; a++; }
                        else if (cell === 'holiday') { row[day] = 'H'; h++; }
                        else if (cell === 'half') { row[day] = 'HD'; hd++; }
                        else row[day] = '';
                      }
                      const work = p + a + hd;
                      const pct = work > 0 ? Math.round(((p + hd * 0.5) / work) * 100) : 0;
                      row.P = String(p);
                      row.A = String(a);
                      row.H = String(h);
                      row.HD = String(hd);
                      row['%'] = `${pct}`;
                      return row;
                    });
                    exportCsv(`attendance_${gridClass}-${gridSection}_${gridYM}`, rows);
                  }}
                  className="shrink-0 p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl active:scale-95 transition-transform"
                  title="Export this month as CSV">
                  <Download size={14}/>
                </button>
                <button onClick={handleExcelExport}
                  className="shrink-0 p-2 bg-emerald-600 text-white rounded-xl active:scale-95 transition-transform"
                  title="Export full year as Excel">
                  <Download size={14}/>
                </button>
              </>
            )}
          </div>

          {/* Class/Section selectors */}
          <div className="flex gap-2 mb-2">
            <select value={gridClass} onChange={e => { setGridClass(e.target.value); setGridSection(''); }}
              className="flex-1 border border-slate-200 rounded-xl px-2 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-400 bg-white">
              <option value="">Select class…</option>
              {classOptions.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
            <select value={gridSection} onChange={e => setGridSection(e.target.value)}
              disabled={!gridClass}
              className="flex-1 border border-slate-200 rounded-xl px-2 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-400 bg-white disabled:opacity-50">
              <option value="">Section…</option>
              {(classOptions.find(c => c.name === gridClass)?.sections ?? []).map(s => (
                <option key={s} value={s}>Section {s}</option>
              ))}
            </select>
          </div>

          {/* Month navigator */}
          <div className="flex items-center justify-between gap-2">
            <button onClick={() => changeMonth(-1)} className="p-1.5 bg-slate-100 rounded-xl text-slate-600">
              <ChevronLeft size={15} />
            </button>
            <div className="font-black text-slate-900 text-sm">
              {new Date(gridYM + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
            </div>
            <button onClick={() => changeMonth(1)} disabled={gridYM >= currentYearMonth()} className="p-1.5 bg-slate-100 rounded-xl text-slate-600 disabled:opacity-30">
              <ChevronRight size={15} />
            </button>
          </div>
        </div>

        {/* Edit-mode banner — explicit cue so the principal knows whether
            taps will change anything. Without this, the mode toggle was
            invisible feedback. */}
        {gridEditMode && (
          <div className="bg-rose-50 border-b border-rose-200 px-3 py-2 text-[10px] font-black text-rose-700 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"/>
            Edit mode is on — tap a cell to change. Tap "Done" when finished.
          </div>
        )}

        {/* Search */}
        {gridStudents.length > 0 && (
          <div className="bg-white border-b border-slate-100 px-4 py-2">
            <div className="relative">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
              <input value={gridSearch} onChange={e => setGridSearch(e.target.value)}
                placeholder="Search students…"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-1.5 font-bold text-xs outline-none focus:border-indigo-500"/>
            </div>
          </div>
        )}

        {/* Grid */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {!gridClass || !gridSection ? (
            <div className="flex-1 flex items-center justify-center py-16 text-center px-4">
              <div>
                <LayoutGrid size={40} className="mx-auto text-slate-200 mb-3"/>
                <p className="text-sm font-bold text-slate-400">Select a class and section above to view the attendance grid</p>
              </div>
            </div>
          ) : gridLoading ? (
            <div className="flex-1 flex items-center justify-center py-16 text-slate-400 font-bold text-sm">Loading…</div>
          ) : gridDates.length === 0 ? (
            <div className="flex-1 flex items-center justify-center py-16 text-slate-400 font-bold text-sm">No dates in this month</div>
          ) : (
            <div className="flex-1 overflow-auto">
              <table className="min-w-max w-full border-collapse text-xs">
                <thead className="sticky top-0 z-20">
                  {/* Row 1: date labels + status badges */}
                  <tr className="bg-white">
                    <th className="sticky left-0 z-30 bg-white border-r border-slate-100 px-3 py-2 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest min-w-[120px]">
                      Student
                    </th>
                    {gridDates.map(d => {
                      const rec = recordMap[d];
                      const dow = new Date(d).getDay();
                      const isSun = dow === 0;
                      // Records are always APPROVED+locked at save time now,
                      // so we collapse the old per-status colour matrix to:
                      //   marked → emerald tint, unmarked → blank, sundays → slate.
                      let colBg = 'bg-white';
                      if (rec) colBg = 'bg-emerald-50/60';
                      else if (isSun) colBg = 'bg-slate-50';
                      return (
                        <th key={d}
                          // Header tooltip carries "marked by" so the principal
                          // can audit who locked this column at a glance.
                          title={rec?.markedByName ? `Marked by ${rec.markedByName}` : undefined}
                          className={`border-r border-slate-100 px-0.5 py-1 text-center min-w-[36px] ${colBg}`}>
                          <div className={`text-[8px] font-bold ${isSun ? 'text-rose-400' : 'text-slate-400'}`}>{fmtDayShort(d)}</div>
                          <div className={`font-black text-[10px] tabular-nums ${isSun ? 'text-rose-400' : 'text-slate-700'}`}>{fmtDay(d)}</div>
                          <div className="flex items-center justify-center gap-0.5 mt-0.5">
                            {rec
                              ? <ShieldCheck size={7} className="text-emerald-500"/>
                              : <div className="w-1.5 h-1.5 rounded-full bg-slate-200"/>}
                          </div>
                        </th>
                      );
                    })}
                    <th className="sticky right-0 bg-white border-l border-slate-100 px-2 py-2 text-center text-[10px] font-black text-slate-500 min-w-[40px]">%</th>
                  </tr>
                  {/* Row 2: per-date bulk action buttons */}
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="sticky left-0 z-30 bg-slate-50 border-b border-r border-slate-100 px-2 py-1 text-left text-[8px] font-black text-slate-400 uppercase tracking-widest">
                      Bulk →
                    </th>
                    {gridDates.map(d => {
                      const rec = recordMap[d];
                      const isLocked = !!rec?.isLocked;
                      const isFuture = d > todayStr();
                      // Locked columns need global Editor Mode to edit (the
                      // amber banner + lock icon explain why). Brand-new
                      // dates with no record yet are always editable.
                      const showBulk = !isFuture && (!isLocked || editorModeActive);
                      return (
                        <th key={d} className="border-b border-r border-slate-100 px-0.5 py-1 text-center">
                          {isFuture ? (
                            <span className="text-[8px] font-black text-slate-300">·</span>
                          ) : !showBulk ? (
                            <Lock size={8} className="mx-auto text-emerald-400" title="Locked · enable Editor Mode to edit"/>
                          ) : (
                            <div className="flex flex-col gap-0.5 items-center">
                              {(['present','absent','holiday'] as AttendanceCellStatus[]).map(s => (
                                <button key={s}
                                  onClick={() => bulkSetDate(d, s)}
                                  title={`All ${CELL_LABEL[s]}`}
                                  className={`w-5 h-3.5 rounded text-[7px] font-black leading-none transition-opacity hover:opacity-90 active:scale-95 ${CELL_BG[s]}`}>
                                  {CELL_LABEL[s]}
                                </button>
                              ))}
                            </div>
                          )}
                        </th>
                      );
                    })}
                    <th className="sticky right-0 bg-slate-50 border-b border-l border-slate-100"/>
                  </tr>
                </thead>
                <tbody>
                  {filteredGridStudents.map((stu, sidx) => {
                    let totalP = 0, totalA = 0, totalHalf = 0;
                    for (const d of gridDates) {
                      // Pre-enrollment days are out of scope for this
                      // student's percentage — they weren't on the roster.
                      if (isPreEnrollment(stu.admissionDate, d)) continue;
                      const st = cellStatus(d, stu.id);
                      if (!st) continue;
                      if (st === 'present') totalP++;
                      else if (st === 'absent') totalA++;
                      else if (st === 'half') totalHalf++;
                    }
                    const workDays = totalP + totalA + totalHalf;
                    const pct = workDays > 0 ? Math.round(((totalP + totalHalf * 0.5) / workDays) * 100) : null;
                    return (
                      <tr key={stu.id} className={`${sidx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                        <td className={`sticky left-0 z-10 border-b border-r border-slate-100 px-3 py-2 ${sidx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                          <div className="font-bold text-slate-900 text-xs truncate max-w-[110px]">{stu.name}</div>
                          <div className="text-[9px] font-bold text-slate-400">Roll {stu.rollNo.padStart(2,'0')}</div>
                        </td>
                        {gridDates.map(d => {
                          const rec = recordMap[d];
                          const st = cellStatus(d, stu.id);
                          const locked = !!rec?.isLocked;
                          const isFuture = d > todayStr();
                          const preEnroll = isPreEnrollment(stu.admissionDate, d);
                          // Pre-enrollment cells render as a slate "N/E"
                          // pill — non-clickable, neither absent nor a
                          // pending tick. They short-circuit before the
                          // locked/editable logic so an N/E cell never
                          // tries to claim a tap-to-cycle.
                          if (preEnroll) {
                            return (
                              <td key={d}
                                className="border-b border-r border-slate-100 text-center px-0.5 py-1 cursor-not-allowed bg-slate-50/40"
                                title={`Not enrolled until ${stu.admissionDate}`}>
                                <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-[8px] font-black text-slate-400 bg-slate-100/70 border border-dashed border-slate-200">
                                  N/E
                                </span>
                              </td>
                            );
                          }
                          const editable = !isFuture && (!locked || editorModeActive);
                          const bg = st ? CELL_BG[st] : 'bg-slate-100 text-slate-300';
                          return (
                            <td key={d}
                              className={`border-b border-r border-slate-100 text-center px-0.5 py-1 ${
                                isFuture ? 'cursor-not-allowed bg-slate-50/60' :
                                !editable ? 'cursor-not-allowed bg-slate-50/40' :
                                            'cursor-pointer active:scale-90'
                              }`}
                              onClick={() => toggleCell(d, stu.id)}
                              title={
                                isFuture ? 'Future date — not editable' :
                                locked
                                  ? `Locked${rec?.markedByName ? ` · marked by ${rec.markedByName}` : ''}${editorModeActive ? ' · tap to edit' : ' · enable Editor Mode to edit'}`
                                  : rec?.markedByName ? `Marked by ${rec.markedByName}` : undefined
                              }>
                              <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-[9px] font-black transition-colors ${bg} ${(!editable || isFuture) ? 'opacity-30' : ''}`}>
                                {st ? CELL_LABEL[st] : isFuture ? '·' : '—'}
                              </span>
                            </td>
                          );
                        })}
                        <td className="sticky right-0 bg-white border-b border-l border-slate-100 text-center px-1 py-1">
                          {pct !== null
                            ? <span className={`text-[10px] font-black tabular-nums ${pct >= 75 ? 'text-emerald-600' : 'text-rose-500'}`}>{pct}%</span>
                            : <span className="text-[10px] text-slate-300">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Sticky save bar — shows when ANY date in the grid has
            pending edits. One primary "Save All" button commits every
            edited date sequentially with a clear progress chip; a
            secondary row of per-date chips lets the principal save
            just one date if they want to.
            Earlier the panel only had per-date buttons and no all-at-
            once action — saving 5 dates meant 5 taps and 5 toast
            confirmations, which made it unclear whether anything had
            actually been saved (the user complaint). */}
        {gridClass && gridSection && !gridLoading && gridDates.length > 0 && hasEdits && (() => {
          const editedDates = gridDates.filter(d => editBuffer[d] && Object.keys(editBuffer[d]).length > 0);
          const totalEdits  = editedDates.reduce((sum, d) => sum + Object.keys(editBuffer[d]).length, 0);
          return (
          <div className="sticky bottom-0 bg-white border-t border-slate-200 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] px-4 py-3 space-y-2 z-20">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Pending changes</p>
                <p className="text-xs font-black text-slate-700 mt-0.5">
                  {totalEdits} edit{totalEdits === 1 ? '' : 's'} across {editedDates.length} date{editedDates.length === 1 ? '' : 's'}
                </p>
              </div>
              <button
                onClick={async () => {
                  // Sequential save so a failure on date #3 doesn't
                  // leave dates #4-5 silently unsaved. saveDate now
                  // returns Promise<boolean>; earlier we tried to
                  // detect success by reading editBuffer in the closure
                  // but React state inside the same handler stays
                  // pinned to the snapshot at handler-call time, so
                  // every iteration saw the original buffer.
                  const failedDates: string[] = [];
                  for (const d of editedDates) {
                    const success = await saveDate(d);
                    if (!success) failedDates.push(d);
                  }
                  // Force-clear the edit buffer for every successfully
                  // saved date in a single setState, then exit edit
                  // mode if nothing's left. saveDate already does this
                  // per-call, but a defensive bulk-clear here ensures
                  // the sticky bar disappears immediately even if a
                  // race put a stale entry back.
                  if (failedDates.length === 0) {
                    setEditBuffer({});
                    setGridEditMode(false);
                  } else {
                    setEditBuffer(prev => {
                      const n: typeof prev = {};
                      for (const d of failedDates) {
                        if (prev[d]) n[d] = prev[d];
                      }
                      return n;
                    });
                  }
                  // Single summary toast — replaces the per-date toasts
                  // that fired inside saveDate (still useful in single-
                  // tap mode, but in Save All they pile up).
                  const okCount = editedDates.length - failedDates.length;
                  if (failedDates.length === 0) {
                    showToast(`✓ Saved ${okCount} date${okCount === 1 ? '' : 's'}`);
                  } else if (okCount > 0) {
                    showToast(`Saved ${okCount} of ${editedDates.length} dates — ${failedDates.length} failed`, 'error');
                  }
                }}
                disabled={isSubmitting || editedDates.length === 0}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wide active:scale-95 transition-transform disabled:opacity-50 shrink-0">
                {isSubmitting ? (
                  <>
                    <Loader2 size={14} className="animate-spin"/> Saving…
                  </>
                ) : (
                  <>
                    <Save size={14}/> Save All ({editedDates.length})
                  </>
                )}
              </button>
            </div>
            {/* Per-date shortcut chips — collapsed, scrollable on mobile */}
            <div className="flex gap-1.5 overflow-x-auto hide-scrollbar -mx-1 px-1">
              {editedDates.map(d => (
                <button key={d} onClick={() => saveDate(d)} disabled={isSubmitting}
                  className="shrink-0 flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-black active:scale-95 transition-transform disabled:opacity-50">
                  <Save size={10}/> {new Date(d).getDate()}/{new Date(d).getMonth() + 1}
                  <span className="text-[9px] text-slate-400 ml-0.5">({Object.keys(editBuffer[d]).length})</span>
                </button>
              ))}
            </div>
          </div>
          );
        })()}
      </div>
    );
  }

  /* ── MARK ATTENDANCE ─────────────────────────────────────────────────────── */
  if (view === 'MARK') {
    const markPresent = markStudents.filter(s => s.isPresent).length;
    // Two states: fresh-mark (no conflict) → always submittable.
    // Edit-locked (conflict) → submittable only when Editor Mode is on.
    const canSubmit = !!(markClass && markSection && markDate && markStudents.length > 0
                        && (!markConflict || editorModeActive));
    // Date strip: 14-day window clamped to the current academic year.
    // Anchor:
    //   • If today is INSIDE the year → anchor on today (last 14 days)
    //   • If today is AFTER year end (e.g. correction mode on a
    //     closed year) → anchor on year endDate so the strip shows
    //     the last 14 days of THAT year, not phantom dates after it
    //   • If today is BEFORE year start → strip empty (year hasn't
    //     begun for this user).
    // Then drop any dates outside [startDate, endDate] so the
    // principal can never tap a date that doesn't belong to the
    // year in correction mode.
    const yearStart = currentYear?.startDate ?? null;
    const yearEnd   = currentYear?.endDate   ?? null;
    const dateStrip = (() => {
      const todayIso = todayStr();
      let anchor = todayIso;
      if (yearEnd && todayIso > yearEnd) anchor = yearEnd;
      if (yearStart && todayIso < yearStart) return [];
      const out: string[] = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date(anchor); d.setDate(d.getDate() - i);
        const iso = istDateOf(d) ?? d.toISOString().split('T')[0];
        if (yearStart && iso < yearStart) continue;
        if (yearEnd && iso > yearEnd) continue;
        out.push(iso);
      }
      return out;
    })();
    return (
      <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 sticky top-0 z-10 shadow-sm">
          <div className="flex items-center gap-3">
            <button onClick={() => setView('OVERVIEW')} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
              <ArrowLeft size={20} />
            </button>
            <div>
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Mark Attendance</h2>
              <p className="text-[10px] font-bold text-slate-400">Select class, section &amp; date</p>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 pb-36 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Class</label>
              <select value={markClass} onChange={e => { setMarkClass(e.target.value); setMarkSection(''); setMarkConflict(null); setMarkStudents([]); }}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-800 focus:outline-none focus:border-blue-400 bg-white">
                <option value="">Select class...</option>
                {classOptions.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Section</label>
              <select value={markSection} onChange={e => { setMarkSection(e.target.value); if (markClass && e.target.value && markDate) checkConflict(markClass, e.target.value, markDate); }}
                disabled={!markClass}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-800 focus:outline-none focus:border-blue-400 bg-white disabled:opacity-50">
                <option value="">Select section...</option>
                {(classOptions.find(c => c.name === markClass)?.sections ?? []).map(sec => (
                  <option key={sec} value={sec}>Section {sec}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Date</label>
              <div className="flex overflow-x-auto hide-scrollbar border border-slate-100 rounded-xl p-1">
                {dateStrip.map(d => {
                  const sel = markDate === d;
                  const t   = d === todayStr();
                  return (
                    <button key={d}
                      onClick={() => {
                        setMarkDate(d);
                        if (markClass && markSection) checkConflict(markClass, markSection, d);
                      }}
                      className={`shrink-0 flex flex-col items-center mx-0.5 px-2.5 py-1.5 rounded-xl border-2 transition-colors ${
                        sel
                          ? t ? 'bg-blue-600 border-blue-600 text-white' : 'bg-slate-800 border-slate-800 text-white'
                          : t ? 'border-blue-200 text-blue-600 bg-blue-50' : 'border-transparent text-slate-400'
                      }`}>
                      <span className="text-[9px] font-black uppercase tracking-widest">{new Date(d).toLocaleDateString('en-IN', { weekday: 'narrow' })}</span>
                      <span className="text-base font-black leading-none my-0.5">{new Date(d).getDate()}</span>
                      <span className="text-[8px] font-bold uppercase tracking-wide opacity-75">{new Date(d).toLocaleDateString('en-IN', { month: 'short' })}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          {markConflict && (
            <div className={`rounded-2xl p-4 border ${
              editorModeActive ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-start gap-2">
                {editorModeActive
                  ? <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5"/>
                  : <Lock size={14} className="text-slate-500 shrink-0 mt-0.5"/>}
                <div>
                  <div className={`font-black text-sm ${editorModeActive ? 'text-amber-800' : 'text-slate-700'}`}>
                    Already marked · {markConflict.totalPresent}P / {markConflict.totalAbsent}A
                  </div>
                  {/* Audit line — who locked this date and when. The
                      timestamp is the most recent server write, so an
                      edited record reads "by Suresh · 12:04 today" rather
                      than the stale original time. */}
                  {(markConflict.markedBy || markConflict.markedAt) && (
                    <div className={`text-[10px] font-bold mt-1 ${editorModeActive ? 'text-amber-700' : 'text-slate-600'}`}>
                      Locked by {markConflict.markedBy || 'Unknown'}
                      {markConflict.markedAt && ` · ${new Date(markConflict.markedAt).toLocaleString('en-IN', {
                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}`}
                    </div>
                  )}
                  <div className={`text-[10px] font-bold mt-1 ${editorModeActive ? 'text-amber-600' : 'text-slate-500'}`}>
                    {editorModeActive
                      ? 'Editor Mode on — tap a row to flip status. Saving will ask for a reason.'
                      : 'Enable Editor Mode in Settings to make corrections.'}
                  </div>
                </div>
              </div>
            </div>
          )}
          {markStudents.length > 0 && (() => {
            // Three-way bulk: Present / Absent / Holiday. Holiday is a
            // whole-day mode — when active every student row is forced to
            // 'holiday' and per-row tapping is disabled (the day is
            // closed). The user's flow: tap Holiday → save, no per-row
            // marking needed. Toggling back to All Present/Absent restores
            // normal interaction.
            const isAllHoliday = markStudents.every(s => s.status === 'holiday');
            const interactive  = !markConflict || editorModeActive;
            return (
              <>
                {interactive && (
                  <div className="grid grid-cols-3 gap-2">
                    <button onClick={() => setMarkStudents(prev => prev.map(s => ({ ...s, isPresent: true, status: 'present' as AttendanceCellStatus })))}
                      className="py-2 bg-emerald-500 text-white text-[10px] font-black rounded-xl">All Present</button>
                    <button onClick={() => setMarkStudents(prev => prev.map(s => ({ ...s, isPresent: false, status: 'absent' as AttendanceCellStatus })))}
                      className="py-2 bg-rose-500 text-white text-[10px] font-black rounded-xl">All Absent</button>
                    <button onClick={() => setMarkStudents(prev => prev.map(s => ({ ...s, isPresent: false, status: 'holiday' as AttendanceCellStatus })))}
                      className={`py-2 text-[10px] font-black rounded-xl border-2 transition-colors ${
                        isAllHoliday
                          ? 'bg-slate-700 text-white border-slate-700'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}>
                      Holiday
                    </button>
                  </div>
                )}
                {isAllHoliday && (
                  <div className="bg-slate-100 border border-slate-200 rounded-2xl p-3 text-center">
                    <p className="text-[11px] font-black text-slate-700">Holiday for all students</p>
                    <p className="text-[10px] font-bold text-slate-500 mt-0.5">Tap All Present or All Absent to switch back to per-student marking.</p>
                  </div>
                )}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  {markStudents.map((s, idx) => {
                    const rowBg =
                      s.status === 'holiday' ? 'bg-slate-50' :
                      s.status === 'absent'  ? 'bg-rose-50/50' :
                                               'bg-emerald-50/50';
                    const chip =
                      s.status === 'holiday'
                        ? <span className="text-[10px] font-black text-slate-700 bg-slate-200 px-2.5 py-1 rounded-lg">HOLIDAY</span>
                        : s.status === 'absent'
                          ? <span className="text-[10px] font-black text-rose-700 bg-rose-100 px-2.5 py-1 rounded-lg">ABSENT</span>
                          : <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-lg">PRESENT</span>;
                    // In holiday mode, per-row tap is a no-op (the day is
                    // collectively closed). To split a holiday day apart,
                    // hit All Present / All Absent first.
                    return (
                      <button key={s.id}
                        onClick={() => { if (s.status !== 'holiday') toggleMarkStudent(s.id); }}
                        disabled={s.status === 'holiday'}
                        className={`w-full flex items-center gap-3 px-4 py-3.5 text-left ${idx < markStudents.length - 1 ? 'border-b border-slate-100' : ''} ${rowBg} ${s.status === 'holiday' ? 'cursor-default' : ''}`}>
                        <div className="flex-1">
                          <div className="font-bold text-slate-900 text-sm">{s.name}</div>
                          <div className="text-[10px] font-bold text-slate-400">Roll {s.rollNo.padStart(2,'0')}</div>
                        </div>
                        {chip}
                      </button>
                    );
                  })}
                </div>
              </>
            );
          })()}
        </div>
        <div className="fixed bottom-16 left-0 right-0 lg:sticky lg:left-auto lg:right-auto lg:bottom-0 p-4 lg:p-6 bg-white border-t border-slate-100 z-30 lg:rounded-t-2xl lg:shadow-lg">
          <button onClick={submitMark} disabled={!canSubmit || isSubmitting}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white font-black text-sm uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg disabled:opacity-50">
            {isSubmitting
              ? 'Saving…'
              : markConflict
                ? <><Save size={16}/> Save Changes</>
                : <><Save size={16}/> Save Attendance</>}
          </button>
        </div>
      </div>
    );
  }

  /* RECORDS view removed — corrections happen in Mark or Grid directly. */

  /* ── OVERVIEW ────────────────────────────────────────────────────────────── */
  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 sticky top-0 z-10 shadow-sm flex items-center gap-3">
        <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Student Attendance</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Overall Avg', val: `${overallAvg}%`, color: ATT_TEXT(overallAvg), bg: 'bg-white' },
            { label: 'Records',     val: String(records.length), color: 'text-slate-700', bg: 'bg-white' },
            { label: 'Low Attend.', val: String(lowCount), color: 'text-rose-600', bg: 'bg-white' },
          ].map(s => (
            <div key={s.label} className={`${s.bg} border border-slate-100 rounded-2xl p-3 shadow-sm text-center`}>
              <div className={`text-xl font-black ${s.color}`}>{s.val}</div>
              <div className="text-[9px] font-black text-slate-400 uppercase tracking-wide mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Two primary actions — Mark and Grid. The Approve workflow was
            removed; teacher submissions auto-lock at save time, same as
            principal-marked records. Records list (still reachable for
            history/corrections) sits in the Grid view's "Records" link. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button onClick={() => setView('MARK')}
            className="flex items-center gap-4 bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-2xl p-4 shadow-md hover:shadow-lg active:scale-[0.98] transition-all text-left">
            <div className="w-11 h-11 rounded-xl bg-white/15 border border-white/25 flex items-center justify-center shrink-0">
              <Save size={20}/>
            </div>
            <div className="min-w-0">
              <div className="font-black text-sm">Mark Attendance</div>
              <div className="text-[10px] font-bold text-blue-100 mt-0.5">Pick date · mark P/A/H · save</div>
            </div>
          </button>
          <button onClick={() => setView('GRID')}
            className="flex items-center gap-4 bg-white border border-slate-100 rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-indigo-200 active:scale-[0.98] transition-all text-left">
            <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <LayoutGrid size={20}/>
            </div>
            <div className="min-w-0">
              <div className="font-black text-sm text-slate-900">Grid View</div>
              <div className="text-[10px] font-bold text-slate-400 mt-0.5">Monthly grid · edit · export</div>
            </div>
          </button>
        </div>

        {/* Recent Records section + Records page were both removed.
            Mark + Grid is the entire surface — corrections happen inline
            in the Mark flow (locked records load with Editor Mode reason
            prompt) or in the Grid (cell tap with reason). "Kisne mark
            kiya" is surfaced as the marker name in cell tooltips on the
            grid. */}
      </div>
    </div>
  );
};
