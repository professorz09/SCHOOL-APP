import { studentService, MOCK_STUDENTS } from './student.service';
import { feeService } from './fee.service';
import { staffService } from './staff.service';
import type {
  StudentYearStatus,
  StudentStatusType,
  StreamDefinition,
  StreamAssignment,
  StreamName,
  TransferCertificate,
  YearClosingConfig,
  PreClosingChecklist,
  YearClosingPreview,
  YearClosingResult,
  AuditLogEntry,
} from '../types/yearClosing.types';

// ─── In-memory stores ─────────────────────────────────────────────────────────

let _studentStatuses: StudentYearStatus[] = MOCK_STUDENTS.map(s => ({
  id: `status_${s.id}`,
  studentId: s.id,
  academicYearId: s.academicYearId,
  status: 'ACTIVE' as StudentStatusType,
  statusChangeDate: s.admissionDate,
  currentClass: s.className,
  currentSection: s.section,
  tCIssued: false,
}));

let _streamAssignments: StreamAssignment[] = [];
let _transferCertificates: TransferCertificate[] = [];
let _yearClosingConfigs: YearClosingConfig[] = [];
let _auditLogs: AuditLogEntry[] = [];
let _lockedYears: Set<string> = new Set();

// TC counter for numbering
let _tcCounter = 1001;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const generateId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

const isYearLocked = (yearId: string): boolean => _lockedYears.has(yearId);

const addAuditLog = (entry: Omit<AuditLogEntry, 'id' | 'performedAt'>) => {
  _auditLogs = [
    { ...entry, id: generateId(), performedAt: new Date().toISOString() },
    ..._auditLogs,
  ];
};

// ─── Student Status Service ───────────────────────────────────────────────────

export const studentStatusService = {
  getStatus(studentId: string, yearId: string): StudentYearStatus | null {
    return _studentStatuses.find(
      s => s.studentId === studentId && s.academicYearId === yearId
    ) ?? null;
  },

  getByYear(yearId: string): StudentYearStatus[] {
    return _studentStatuses.filter(s => s.academicYearId === yearId);
  },

  changeStatus(
    studentId: string,
    yearId: string,
    update: {
      status: StudentStatusType;
      reason?: string;
      leaveDate?: string;
      notes?: string;
    }
  ): StudentYearStatus {
    if (isYearLocked(yearId)) {
      throw new Error('Cannot change status: academic year is locked');
    }
    if (update.status === 'DROPPED_OUT' && !update.leaveDate) {
      throw new Error('Leave date is required for DROPPED_OUT status');
    }

    const existing = _studentStatuses.find(
      s => s.studentId === studentId && s.academicYearId === yearId
    );

    if (existing) {
      const oldStatus = existing.status;
      const updated: StudentYearStatus = {
        ...existing,
        status: update.status,
        statusChangeDate: new Date().toISOString().split('T')[0],
        reason: update.reason,
        leaveDate: update.leaveDate,
        notes: update.notes,
      };
      _studentStatuses = _studentStatuses.map(s =>
        s.studentId === studentId && s.academicYearId === yearId ? updated : s
      );
      addAuditLog({
        academicYearId: yearId,
        action: 'STATUS_CHANGE',
        entityType: 'Student',
        entityId: studentId,
        details: `Status changed from ${oldStatus} to ${update.status}${update.reason ? `: ${update.reason}` : ''}`,
      });
      return updated;
    }

    const newStatus: StudentYearStatus = {
      id: `status_${generateId()}`,
      studentId,
      academicYearId: yearId,
      status: update.status,
      statusChangeDate: new Date().toISOString().split('T')[0],
      reason: update.reason,
      leaveDate: update.leaveDate,
      notes: update.notes,
      currentClass: '',
      currentSection: '',
      tCIssued: false,
    };
    _studentStatuses = [..._studentStatuses, newStatus];
    return newStatus;
  },
};

// ─── Transfer Certificate Service ────────────────────────────────────────────

export const transferCertificateService = {
  hasTCBeenIssued(studentId: string, yearId: string): boolean {
    const status = studentStatusService.getStatus(studentId, yearId);
    return status?.tCIssued ?? false;
  },

  getTC(studentId: string, yearId: string): TransferCertificate | null {
    return _transferCertificates.find(
      t => t.studentId === studentId && t.academicYearId === yearId
    ) ?? null;
  },

  getAllTCs(): TransferCertificate[] {
    return [..._transferCertificates];
  },

  async generateTC(studentId: string, yearId: string): Promise<TransferCertificate> {
    const status = studentStatusService.getStatus(studentId, yearId);

    if (!status) {
      throw new Error('Student status not found for this year');
    }
    if (!['DROPPED_OUT', 'TRANSFERRED', 'GRADUATED'].includes(status.status)) {
      throw new Error('TC can only be issued for students who left or graduated');
    }
    if (status.tCIssued) {
      throw new Error(`TC already issued on ${status.tCIssuedDate}`);
    }

    // Check fees
    const feeSummary = feeService.getParentDueSummary(studentId);
    if (feeSummary.total > 0) {
      throw new Error(
        `Cannot issue TC — outstanding fees of ₹${feeSummary.total.toLocaleString()} must be cleared first`
      );
    }

    const student = await studentService.getById(studentId);
    if (!student) throw new Error('Student not found');

    const tc: TransferCertificate = {
      id: generateId(),
      tcNumber: `TC-${new Date().getFullYear()}-${String(_tcCounter++).padStart(4, '0')}`,
      studentId,
      studentName: student.name,
      academicYearId: yearId,
      issuedDate: new Date().toISOString().split('T')[0],
      leaveDate: status.leaveDate ?? new Date().toISOString().split('T')[0],
      reason: status.reason ?? 'As requested',
      snapshot: {
        className: student.className,
        section: student.section,
        rollNo: student.rollNo,
        attendance: student.attendancePercent,
        conduct: 'Good',
        feesSettled: feeSummary.total === 0,
        dueAmount: student.totalFee,
        paidAmount: student.paidFee,
      },
      issuerName: 'Principal',
    };

    _transferCertificates = [..._transferCertificates, tc];

    // Mark TC as issued
    _studentStatuses = _studentStatuses.map(s =>
      s.studentId === studentId && s.academicYearId === yearId
        ? { ...s, tCIssued: true, tCIssuedDate: tc.issuedDate }
        : s
    );

    addAuditLog({
      academicYearId: yearId,
      action: 'TC_ISSUED',
      entityType: 'Student',
      entityId: studentId,
      details: `TC issued: ${tc.tcNumber} for ${student.name}`,
    });

    return tc;
  },
};

// ─── Stream Assignment Service ────────────────────────────────────────────────

const STREAM_ELIGIBILITY: Record<StreamName, { minPercent: number; note: string }> = {
  'Science-PCM': { minPercent: 60, note: 'Requires 60%+ in Maths & Science' },
  'Science-PCB': { minPercent: 60, note: 'Requires 60%+ in Science (with Biology)' },
  Commerce:      { minPercent: 40, note: 'Requires 40%+ overall' },
  Arts:          { minPercent: 0,  note: 'Open to all students' },
};

export const streamService = {
  getAssignments(yearId: string): StreamAssignment[] {
    return _streamAssignments.filter(a => a.academicYearId === yearId);
  },

  checkEligibility(
    attendancePercent: number,
    stream: StreamName
  ): { eligible: boolean; reason?: string } {
    const rule = STREAM_ELIGIBILITY[stream];
    if (!rule) return { eligible: false, reason: 'Invalid stream' };
    if (attendancePercent < rule.minPercent) {
      return { eligible: false, reason: `${rule.note} (current: ${attendancePercent.toFixed(1)}%)` };
    }
    return { eligible: true };
  },

  assignStream(
    studentId: string,
    studentName: string,
    yearId: string,
    stream: StreamName,
    section: string,
    method: 'AUTO' | 'MANUAL',
    attendancePercent: number
  ): StreamAssignment {
    const eligibility = this.checkEligibility(attendancePercent, stream);
    if (!eligibility.eligible && method === 'AUTO') {
      throw new Error(`Student not eligible for ${stream}: ${eligibility.reason}`);
    }

    // Remove existing assignment for this student/year if any
    _streamAssignments = _streamAssignments.filter(
      a => !(a.studentId === studentId && a.academicYearId === yearId)
    );

    const assignment: StreamAssignment = {
      id: generateId(),
      studentId,
      studentName,
      academicYearId: yearId,
      stream,
      section,
      preference: 1,
      assignmentDate: new Date().toISOString().split('T')[0],
      assignmentMethod: method,
      eligibilityMet: eligibility.eligible,
      reasonIfNotEligible: eligibility.reason,
    };

    _streamAssignments = [..._streamAssignments, assignment];
    addAuditLog({
      academicYearId: yearId,
      action: 'STREAM_ASSIGNED',
      entityType: 'Student',
      entityId: studentId,
      details: `Assigned to ${stream}-${section} (${method})`,
    });

    return assignment;
  },

  autoAssignStreams(
    students: Array<{ id: string; name: string; attendancePercent: number }>,
    yearId: string,
    streamDefs: StreamDefinition[]
  ): { assigned: number; waitlisted: string[] } {
    const seatMap: Record<string, number> = {};
    streamDefs.forEach(s => { seatMap[s.name] = s.capacity; });

    const sections = ['A', 'B', 'C'];
    const streamSectionCount: Record<string, number> = {};

    let assigned = 0;
    const waitlisted: string[] = [];
    const streamOrder: StreamName[] = ['Science-PCM', 'Science-PCB', 'Commerce', 'Arts'];

    // Sort students by attendance descending (merit)
    const sorted = [...students].sort((a, b) => b.attendancePercent - a.attendancePercent);

    sorted.forEach(student => {
      let assignedStream: StreamName | null = null;

      for (const stream of streamOrder) {
        if ((seatMap[stream] ?? 0) <= 0) continue;
        const eligibility = this.checkEligibility(student.attendancePercent, stream);
        if (eligibility.eligible) {
          assignedStream = stream;
          break;
        }
      }

      if (!assignedStream) {
        waitlisted.push(student.id);
        return;
      }

      // Round-robin section assignment
      const key = assignedStream;
      streamSectionCount[key] = (streamSectionCount[key] ?? 0) + 1;
      const section = sections[(streamSectionCount[key] - 1) % sections.length];

      this.assignStream(student.id, student.name, yearId, assignedStream, section, 'AUTO', student.attendancePercent);
      seatMap[assignedStream]--;
      assigned++;
    });

    return { assigned, waitlisted };
  },
};

// ─── Year Closing Service ─────────────────────────────────────────────────────

export const yearClosingService = {

  isYearLocked(yearId: string): boolean {
    return isYearLocked(yearId);
  },

  lockYear(yearId: string): void {
    _lockedYears.add(yearId);
    addAuditLog({
      academicYearId: yearId,
      action: 'YEAR_LOCKED',
      entityType: 'AcademicYear',
      entityId: yearId,
      details: `Academic year ${yearId} locked (read-only)`,
    });
  },

  getAuditLogs(yearId?: string): AuditLogEntry[] {
    return yearId
      ? _auditLogs.filter(l => l.academicYearId === yearId)
      : [..._auditLogs];
  },

  // ── PHASE 1: Pre-closing checklist ─────────────────────────────────────────

  async getPreClosingChecklist(yearId: string): Promise<PreClosingChecklist> {
    const students = await studentService.getAll();
    const yearStudents = students.filter(s => s.academicYearId === yearId);
    const staff = await staffService.getAll();

    // Fees pending
    const feeStudents = yearStudents
      .map(s => {
        const summary = feeService.getParentDueSummary(s.id);
        return { id: s.id, name: s.name, dueAmount: summary.total };
      })
      .filter(s => s.dueAmount > 0);

    const feesTotal = feeStudents.reduce((sum, s) => sum + s.dueAmount, 0);

    // Salary pending — staff with salary history less than 10 months this year
    const salaryPendingStaff = staff
      .filter(s => {
        const histCount = (s.salaryHistory ?? []).length;
        return histCount < 10; // Expecting ~10-12 months paid
      })
      .map(s => ({
        id: s.id,
        name: s.name,
        pendingMonths: Math.max(0, 10 - (s.salaryHistory ?? []).length),
      }));

    const salaryTotal = salaryPendingStaff.reduce(
      (sum, s) => {
        const staffMember = staff.find(st => st.id === s.id);
        return sum + s.pendingMonths * (staffMember?.salary ?? 0);
      },
      0
    );

    // Results completion — students with attendance > 0 considered as having data
    const withResults = yearStudents.filter(s => s.attendancePercent > 0).length;
    const resultsPercentage = yearStudents.length > 0 ? (withResults / yearStudents.length) * 100 : 100;

    // Attendance completion
    const withAttendance = yearStudents.filter(s => s.attendancePercent > 0).length;
    const attendancePercentage = yearStudents.length > 0 ? (withAttendance / yearStudents.length) * 100 : 100;

    const blockers: string[] = [];
    const warnings: string[] = [];

    if (feesTotal > 0) {
      blockers.push(`₹${feesTotal.toLocaleString()} outstanding fees from ${feeStudents.length} student(s)`);
    }
    if (salaryTotal > 0) {
      blockers.push(`₹${salaryTotal.toLocaleString()} pending salary for ${salaryPendingStaff.length} staff member(s)`);
    }
    if (resultsPercentage < 95) {
      warnings.push(`${yearStudents.length - withResults} student(s) have no results entered`);
    }
    if (attendancePercentage < 90) {
      warnings.push(`${yearStudents.length - withAttendance} student(s) have no attendance records`);
    }

    return {
      feesPending: { total: feesTotal, count: feeStudents.length, students: feeStudents },
      salaryPending: { total: salaryTotal, count: salaryPendingStaff.length, staff: salaryPendingStaff },
      resultsCompletion: { completed: withResults, total: yearStudents.length, percentage: resultsPercentage },
      attendanceCompletion: { completed: withAttendance, total: yearStudents.length, percentage: attendancePercentage },
      status: blockers.length === 0 ? 'READY' : 'NOT_READY',
      blockers,
      warnings,
    };
  },

  // ── PHASE 2: Save configuration ────────────────────────────────────────────

  saveConfig(config: Omit<YearClosingConfig, 'id' | 'status' | 'createdDate'>): YearClosingConfig {
    const saved: YearClosingConfig = {
      ...config,
      id: generateId(),
      status: 'PENDING_COMMIT',
      createdDate: new Date().toISOString(),
    };
    _yearClosingConfigs = [..._yearClosingConfigs, saved];
    return saved;
  },

  getConfig(configId: string): YearClosingConfig | null {
    return _yearClosingConfigs.find(c => c.id === configId) ?? null;
  },

  // ── PHASE 3: Simulate (preview) ────────────────────────────────────────────

  async simulateYearClosing(configId: string): Promise<YearClosingPreview> {
    const config = this.getConfig(configId);
    if (!config) throw new Error('Config not found');

    const students = await studentService.getAll();
    const yearStudents = students.filter(s => s.academicYearId === config.fromYearId);
    const staff = await staffService.getAll();

    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate next year name
    if (!config.nextYearName || config.nextYearName.trim() === '') {
      errors.push('Next academic year name is required');
    }
    if (!config.nextYearStartDate || !config.nextYearEndDate) {
      errors.push('Start and end dates for next year are required');
    }

    // Check Class 10 students need streams
    const class10Students = yearStudents.filter(s =>
      s.className === 'Class 10' || s.className === '10'
    );
    if (class10Students.length > 0 && config.streams.length === 0) {
      errors.push(`${class10Students.length} Class 10 student(s) need stream assignment but no streams defined`);
    }

    // Check stream capacity vs demand
    const totalStreamCapacity = config.streams.reduce((sum, s) => sum + s.capacity, 0);
    if (class10Students.length > totalStreamCapacity) {
      warnings.push(
        `Stream capacity (${totalStreamCapacity}) is less than Class 10 students (${class10Students.length}) — some will be waitlisted`
      );
    }

    // Check for graduating students (Class 12)
    const class12Students = yearStudents.filter(s =>
      s.className === 'Class 12' || s.className === '12'
    );

    // Dropped out
    const droppedOut = _studentStatuses.filter(
      s => s.academicYearId === config.fromYearId && s.status === 'DROPPED_OUT'
    ).length;

    // Calculate promotion stats
    const toDetain = yearStudents.filter(s => s.attendancePercent < 75).length;
    const toGraduate = class12Students.length;
    const toPromote = yearStudents.length - toDetain - droppedOut - toGraduate;

    if (yearStudents.length === 0) {
      warnings.push('No students found in current academic year');
    }

    return {
      summary: {
        fromYear: config.fromYearId,
        toYear: config.nextYearName,
        studentsTotal: yearStudents.length,
        studentsToPromote: Math.max(0, toPromote),
        studentsToDetain: toDetain,
        studentsDroppedOut: droppedOut,
        studentsGraduating: toGraduate,
        streamsToAssign: class10Students.length,
        staffToCarry: config.carryForward.staff ? staff.length : 0,
      },
      errors,
      warnings,
    };
  },

  // ── PHASE 4: Commit ────────────────────────────────────────────────────────

  async commitYearClosing(
    configId: string,
    onNewYearCreated: (yearData: { name: string; startDate: string; endDate: string; board: string }) => string,
    onOldYearLocked: (yearId: string) => void
  ): Promise<YearClosingResult> {
    const config = this.getConfig(configId);
    if (!config) throw new Error('Config not found');
    if (config.status === 'COMMITTED') throw new Error('Year closing already committed');

    try {
      const students = await studentService.getAll();
      const yearStudents = students.filter(s => s.academicYearId === config.fromYearId);

      // 1. Lock old year
      this.lockYear(config.fromYearId);
      onOldYearLocked(config.fromYearId);

      // 2. Create new year via context callback (returns new year ID)
      const newYearId = onNewYearCreated({
        name: config.nextYearName,
        startDate: config.nextYearStartDate,
        endDate: config.nextYearEndDate,
        board: config.board,
      });

      // 3. Promote students
      let promoted = 0;
      let detained = 0;
      let graduated = 0;

      const promoteClass = (cls: string): string => {
        const num = cls.match(/\d+/)?.[0];
        if (!num) return cls;
        return cls.replace(num, String(parseInt(num) + 1));
      };

      for (const student of yearStudents) {
        const statusRec = studentStatusService.getStatus(student.id, config.fromYearId);

        // Skip already dropped/transferred
        if (statusRec && ['DROPPED_OUT', 'TRANSFERRED'].includes(statusRec.status)) continue;

        const isClass12 = student.className === 'Class 12' || student.className === '12';
        const isClass10 = student.className === 'Class 10' || student.className === '10';
        const isDetained = student.attendancePercent < 75;

        if (isClass12) {
          // Graduate
          studentStatusService.changeStatus(student.id, config.fromYearId, {
            status: 'GRADUATED',
            reason: 'Completed Class 12',
          });
          graduated++;
        } else if (isDetained) {
          // Detain
          detained++;
          // Create status for new year (same class)
          _studentStatuses = [
            ..._studentStatuses,
            {
              id: `status_${generateId()}`,
              studentId: student.id,
              academicYearId: newYearId,
              status: 'ACTIVE',
              statusChangeDate: new Date().toISOString().split('T')[0],
              currentClass: student.className,
              currentSection: student.section,
              tCIssued: false,
            },
          ];
          await studentService.update(student.id, { academicYearId: newYearId });
        } else if (isClass10 && config.streams.length > 0) {
          // Will be stream-assigned below
          promoted++;
          await studentService.update(student.id, {
            academicYearId: newYearId,
            className: promoteClass(student.className),
          });
        } else {
          // Regular promotion
          promoted++;
          const newClass = promoteClass(student.className);
          await studentService.update(student.id, {
            academicYearId: newYearId,
            className: newClass,
          });
          _studentStatuses = [
            ..._studentStatuses,
            {
              id: `status_${generateId()}`,
              studentId: student.id,
              academicYearId: newYearId,
              status: 'ACTIVE',
              statusChangeDate: new Date().toISOString().split('T')[0],
              currentClass: newClass,
              currentSection: student.section,
              tCIssued: false,
            },
          ];
        }
      }

      // 4. Auto-assign streams for Class 10 → 11
      const updatedStudents = await studentService.getAll();
      const class10ForStream = updatedStudents.filter(
        s => s.academicYearId === newYearId && (
          s.className === 'Class 11' || s.className === '11'
        )
      );

      let streamsAssigned = 0;
      if (class10ForStream.length > 0 && config.streams.length > 0) {
        const result = streamService.autoAssignStreams(
          class10ForStream.map(s => ({ id: s.id, name: s.name, attendancePercent: s.attendancePercent })),
          newYearId,
          config.streams
        );
        streamsAssigned = result.assigned;
      }

      // 5. Handle outstanding dues
      let feesAction = 'No action needed';
      if (config.outstandingDuesHandling === 'WRITEOFF') {
        feesAction = 'Outstanding dues written off';
      } else if (config.outstandingDuesHandling === 'ARREARS') {
        feesAction = 'Outstanding dues carried as arrears to new year';
      }

      // 6. Mark config as committed
      _yearClosingConfigs = _yearClosingConfigs.map(c =>
        c.id === configId ? { ...c, status: 'COMMITTED' } : c
      );

      addAuditLog({
        academicYearId: config.fromYearId,
        action: 'YEAR_CLOSING_COMMITTED',
        entityType: 'AcademicYear',
        entityId: config.fromYearId,
        details: `Year closed. New year: ${config.nextYearName}. Promoted: ${promoted}, Detained: ${detained}, Graduated: ${graduated}`,
      });

      return {
        success: true,
        newYearId,
        newYearName: config.nextYearName,
        summary: {
          oldYearLocked: config.fromYearId,
          newYearCreated: config.nextYearName,
          studentsPromoted: promoted,
          studentsDetained: detained,
          studentsGraduated: graduated,
          streamsAssigned,
          feesAction,
        },
      };
    } catch (error) {
      // Mark config as failed
      _yearClosingConfigs = _yearClosingConfigs.map(c =>
        c.id === configId
          ? { ...c, status: 'FAILED', errorMessage: (error as Error).message }
          : c
      );
      throw error;
    }
  },
};
