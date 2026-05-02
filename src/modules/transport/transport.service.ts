// Supabase-backed transport service.
//   transport_vehicles  — buses/vans owned by the school
//   route_stops         — ordered stops per vehicle
//   student_transport_assignments — boarding stop per student per year
//   driver_locations    — latest GPS pings (live tracking)
//
// Driver dropdown filters staff WHERE role='DRIVER' & is_active=true.

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { registerCacheResetter } from '@/lib/cacheBus';
import { apiTransport } from '@/lib/apiClient';
// NOTE: All writes go through /api/transport/* — no direct supabase writes below vehicle/stop CRUD

const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

function getSchoolId(): string {
  const id = useAuthStore.getState().session?.schoolId;
  if (!id) throw new Error('No school in session');
  return id;
}

// ─── Types (unchanged public surface) ────────────────────────────────────────

export type VehicleType = 'BUS' | 'VAN' | 'MINI_BUS';

export interface RouteStop {
  id: string;
  name: string;
  estimatedTime: string;
  lat: number;
  lng: number;
  arrivedAt?: string;
}

export interface VehicleLocation {
  lat: number;
  lng: number;
  timestamp: string;
}

export interface TransportVehicle {
  id: string;
  vehicleNo: string;
  type: VehicleType;
  capacity: number;
  routeName: string;
  stops: RouteStop[];
  driverId: string | null;
  driverName: string;
  driverPhone: string;
  isActive: boolean;
  currentLocation?: VehicleLocation;
  lastStopIndex?: number;
}

export interface StudentTransportAssignment {
  id: string;
  studentId: string;
  studentName: string;
  className: string;
  vehicleId: string;
  boardingStopId: string;
  boardingStopName: string;
  academicYearId: string;
  monthlyAmount: number;
  startDate: string;
  endDate: string | null;
  isActive?: boolean;
  reason?: string | null;
  endReason?: string | null;
  vehicleNo?: string;
}

export type TransportChangeReason =
  | 'VEHICLE_BREAKDOWN'
  | 'STUDENT_RELOCATION'
  | 'CANCEL_SERVICE'
  | 'STOP_CHANGE'
  | 'AMOUNT_CHANGE'
  | 'OTHER';

export const TRANSPORT_CHANGE_REASONS: ReadonlyArray<{ value: TransportChangeReason; label: string }> = [
  { value: 'VEHICLE_BREAKDOWN', label: 'Vehicle breakdown / out of service' },
  { value: 'STUDENT_RELOCATION', label: 'Student relocation / new address' },
  { value: 'CANCEL_SERVICE',    label: 'Cancel transport service' },
  { value: 'STOP_CHANGE',       label: 'Boarding stop change' },
  { value: 'AMOUNT_CHANGE',     label: 'Fare revision' },
  { value: 'OTHER',             label: 'Other' },
];

export interface TransportStudent {
  id: string;
  name: string;
  className: string;
  admissionNo: string;
}

// ─── Cache ────────────────────────────────────────────────────────────────────

let _vehiclesCache: TransportVehicle[] = [];
let _assignmentsCache: StudentTransportAssignment[] = [];

// Wired to the cache bus so AcademicYearContext flushes us on year switch —
// otherwise stale per-year vehicle assignments leak across years.
registerCacheResetter(() => {
  _vehiclesCache = [];
  _assignmentsCache = [];
});

interface VehicleRow {
  id: string; vehicle_no: string; type: string; capacity: number;
  route_name: string | null; driver_id: string | null;
  driver_name: string | null; driver_phone: string | null;
  is_active: boolean;
}

interface StopRow {
  id: string; vehicle_id: string; name: string;
  estimated_time: string | null; lat: number; lng: number; sort_order: number;
}

interface AssignmentRow {
  id: string; student_id: string; academic_year_id: string;
  vehicle_id: string | null; stop_id: string | null;
  monthly_amount: number; start_date: string | null; end_date: string | null;
  is_active: boolean;
  reason: string | null;
  end_reason: string | null;
  students: { name: string } | null;
  student_academic_records: { class_name: string; section: string } | null;
  route_stops: { name: string } | null;
  transport_vehicles: { vehicle_no: string } | null;
}

async function _loadVehicles(schoolId: string): Promise<void> {
  const { data: vData, error: vErr } = await supabase
    .from('transport_vehicles')
    .select('id, vehicle_no, type, capacity, route_name, driver_id, driver_name, driver_phone, is_active')
    .eq('school_id', schoolId).eq('is_active', true)
    .order('vehicle_no');
  if (vErr) throw new Error(vErr.message);
  const vehicles = (vData ?? []) as VehicleRow[];

  const ids = vehicles.map(v => v.id);
  const { data: sData } = ids.length
    ? await supabase
        .from('route_stops')
        .select('id, vehicle_id, name, estimated_time, lat, lng, sort_order')
        .in('vehicle_id', ids).order('sort_order')
    : { data: [] };
  const stopsMap = new Map<string, RouteStop[]>();
  ((sData ?? []) as StopRow[]).forEach(r => {
    const arr = stopsMap.get(r.vehicle_id) ?? [];
    arr.push({
      id: r.id, name: r.name,
      estimatedTime: r.estimated_time ?? '',
      lat: Number(r.lat), lng: Number(r.lng),
    });
    stopsMap.set(r.vehicle_id, arr);
  });

  // Latest GPS per vehicle.
  const { data: locData } = ids.length
    ? await supabase
        .from('driver_locations')
        .select('vehicle_id, lat, lng, reported_at')
        .in('vehicle_id', ids).order('reported_at', { ascending: false }).limit(ids.length * 5)
    : { data: [] };
  const locMap = new Map<string, VehicleLocation>();
  for (const l of ((locData ?? []) as { vehicle_id: string; lat: number; lng: number; reported_at: string }[])) {
    if (!locMap.has(l.vehicle_id)) {
      locMap.set(l.vehicle_id, { lat: Number(l.lat), lng: Number(l.lng), timestamp: l.reported_at });
    }
  }

  _vehiclesCache = vehicles.map(v => ({
    id: v.id,
    vehicleNo: v.vehicle_no,
    type: (v.type as VehicleType) ?? 'BUS',
    capacity: v.capacity,
    routeName: v.route_name ?? '',
    stops: stopsMap.get(v.id) ?? [],
    driverId: v.driver_id,
    driverName: v.driver_name ?? '—',
    driverPhone: v.driver_phone ?? '—',
    isActive: v.is_active,
    currentLocation: locMap.get(v.id),
  }));
}

async function _loadAssignments(schoolId: string): Promise<void> {
  // Active year only.
  const { data: ay } = await supabase
    .from('academic_years').select('id').eq('school_id', schoolId).eq('is_active', true).maybeSingle();
  const ayId = (ay as { id: string } | null)?.id;
  if (!ayId) { _assignmentsCache = []; return; }

  // Constrain the embedded student_academic_records join to the active
  // year so class/section labels reflect the current year, not whichever
  // record was returned first when a student has multi-year history.
  const { data, error } = await supabase
    .from('student_transport_assignments')
    .select(`
      id, student_id, academic_year_id, vehicle_id, stop_id,
      monthly_amount, start_date, end_date, is_active, reason, end_reason,
      students!inner(name, school_id),
      student_academic_records(class_name, section, academic_year_id),
      route_stops(name),
      transport_vehicles(vehicle_no)
    `)
    .eq('students.school_id', schoolId)
    .eq('academic_year_id', ayId)
    .eq('student_academic_records.academic_year_id', ayId)
    .eq('is_active', true);
  if (error) throw new Error(error.message);
  _assignmentsCache = ((data ?? []) as unknown as AssignmentRow[]).map(a => ({
    id: a.id,
    studentId: a.student_id,
    studentName: a.students?.name ?? '',
    className: a.student_academic_records
      ? `${a.student_academic_records.class_name}-${a.student_academic_records.section}`
      : '',
    vehicleId: a.vehicle_id ?? '',
    boardingStopId: a.stop_id ?? '',
    boardingStopName: a.route_stops?.name ?? '—',
    academicYearId: a.academic_year_id,
    monthlyAmount: Number(a.monthly_amount),
    startDate: a.start_date ?? '',
    endDate: a.end_date,
    isActive: a.is_active,
    reason: a.reason,
    endReason: a.end_reason,
    vehicleNo: a.transport_vehicles?.vehicle_no,
  }));
}

// ─── Service API ──────────────────────────────────────────────────────────────

export const transportService = {
  async refreshAll(): Promise<void> {
    const schoolId = getSchoolId();
    await Promise.all([_loadVehicles(schoolId), _loadAssignments(schoolId)]);
  },

  // ── Vehicles ────────────────────────────────────────────────────────────
  getVehicles(): TransportVehicle[] {
    return [..._vehiclesCache];
  },

  getVehicleById(id: string): TransportVehicle | null {
    return _vehiclesCache.find(v => v.id === id) ?? null;
  },

  async addVehicle(data: { vehicleNo: string; type: VehicleType; capacity: number; routeName: string }): Promise<TransportVehicle> {
    const row = await apiTransport.addVehicle({
      vehicleNo: data.vehicleNo, type: data.type, capacity: data.capacity, routeName: data.routeName,
    });
    await this.refreshAll();
    await logAudit('vehicle_added', 'transport_vehicle', row.id, { vehicleNo: data.vehicleNo });
    return this.getVehicleById(row.id)!;
  },

  async updateVehicle(id: string, data: Partial<TransportVehicle>): Promise<TransportVehicle> {
    const patch: Record<string, unknown> = {};
    if (data.vehicleNo !== undefined) patch.vehicle_no = data.vehicleNo;
    if (data.type !== undefined) patch.type = data.type;
    if (data.capacity !== undefined) patch.capacity = data.capacity;
    if (data.routeName !== undefined) patch.route_name = data.routeName;
    if (data.driverId !== undefined) patch.driver_id = data.driverId;
    if (data.driverName !== undefined) patch.driver_name = data.driverName;
    if (data.driverPhone !== undefined) patch.driver_phone = data.driverPhone;
    await apiTransport.updateVehicle(id, patch);
    await this.refreshAll();
    return this.getVehicleById(id)!;
  },

  async deleteVehicle(id: string): Promise<void> {
    await apiTransport.deactivateVehicle(id);
    await this.refreshAll();
  },

  // ── Driver assignment ───────────────────────────────────────────────────
  async assignDriver(vehicleId: string, driverId: string, driverName: string, driverPhone: string): Promise<void> {
    await this.updateVehicle(vehicleId, { driverId, driverName, driverPhone });
  },

  async removeDriver(vehicleId: string): Promise<void> {
    await this.updateVehicle(vehicleId, { driverId: null, driverName: '—', driverPhone: '—' });
  },

  // ── Routes / stops ──────────────────────────────────────────────────────
  async setRouteName(vehicleId: string, routeName: string): Promise<void> {
    await this.updateVehicle(vehicleId, { routeName });
  },

  async addStop(vehicleId: string, stop: Omit<RouteStop, 'id'>): Promise<RouteStop> {
    const v = this.getVehicleById(vehicleId);
    const sortOrder = (v?.stops.length ?? 0);
    const r = await apiTransport.addStop({
      vehicleId, name: stop.name, estimatedTime: stop.estimatedTime,
      lat: stop.lat, lng: stop.lng, sortOrder,
    });
    await this.refreshAll();
    return { id: r.id, name: r.name, estimatedTime: r.estimated_time, lat: Number(r.lat), lng: Number(r.lng) };
  },

  async updateStop(_vehicleId: string, stopId: string, data: Partial<RouteStop>): Promise<void> {
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined)          patch.name           = data.name;
    if (data.estimatedTime !== undefined) patch.estimatedTime  = data.estimatedTime;
    if (data.lat !== undefined)           patch.lat            = data.lat;
    if (data.lng !== undefined)           patch.lng            = data.lng;
    await apiTransport.updateStop(stopId, patch);
    await this.refreshAll();
  },

  async removeStop(_vehicleId: string, stopId: string): Promise<void> {
    await apiTransport.removeStop(stopId);
    await this.refreshAll();
  },

  // ── Student assignments ─────────────────────────────────────────────────
  getAssignments(): StudentTransportAssignment[] {
    return [..._assignmentsCache];
  },

  getAssignmentsByVehicle(vehicleId: string): StudentTransportAssignment[] {
    return _assignmentsCache.filter(a => a.vehicleId === vehicleId);
  },

  getAssignmentForStudent(studentId: string): StudentTransportAssignment | null {
    return _assignmentsCache.find(a => a.studentId === studentId) ?? null;
  },

  async assignStudent(
    studentId: string, _studentName: string, _className: string,
    vehicleId: string, stopId: string, _stopName: string,
    monthlyAmount = 500, startDate?: string,
    academicYearId?: string,
    endDate?: string | null,
    reason?: string | null,
    /**
     * Optional VEHICLE-type fee structure id to drive bill generation.
     * When provided, the RPC generates a structure-aware schedule.
     * When absent (legacy bulk paths), server falls back to flat monthly.
     */
    feeStructureId?: string,
  ): Promise<StudentTransportAssignment> {
    const schoolId = getSchoolId();
    let ayId = academicYearId;
    if (!ayId) {
      const { data: ay } = await supabase
        .from('academic_years').select('id').eq('school_id', schoolId).eq('is_active', true).maybeSingle();
      ayId = (ay as { id: string } | null)?.id;
    }
    if (!ayId) throw new Error('No active academic year');

    const startIso = startDate ?? new Date().toISOString().slice(0, 10);

    await apiTransport.assign({
      studentId,
      vehicleId,
      stopId,
      monthlyAmount,
      startDate: startIso,
      academicYearId: ayId,
      endDate:         endDate ?? undefined,
      reason:          reason ?? undefined,
      feeStructureId:  feeStructureId ?? undefined,
    });

    await logAudit('transport_assigned', 'student_transport_assignment', studentId, {
      studentId, vehicleId, stopId, monthlyAmount, startDate: startIso, endDate, reason,
    });
    await this.refreshAll();
    return this.getAssignmentForStudent(studentId)!;
  },

  async removeStudentAssignment(studentId: string, reason?: string): Promise<void> {
    const todayIso = new Date().toISOString().slice(0, 10);
    await apiTransport.remove({ studentId, endDate: todayIso, reason });
    await logAudit('transport_removed', 'student_transport_assignment', studentId, { studentId, reason });
    await this.refreshAll();
  },

  /**
   * Mid-year change: closes the student's current active assignment with
   * `end_date = effectiveDate - 1`, cancels its future TRANSPORT
   * installments, inserts a new active row starting on `effectiveDate`,
   * and generates fresh installments for the new (vehicle, stop, amount).
   * Audit log + reason are required.
   */
  async changeStudentTransport(input: {
    studentId: string;
    effectiveDate: string;          // YYYY-MM-DD
    newVehicleId: string;
    newStopId: string;
    newMonthlyAmount: number;
    reason: string;                 // human readable
    endDate?: string | null;        // optional new end date (default null)
  }): Promise<StudentTransportAssignment> {
    if (!input.reason?.trim()) throw new Error('Change reason is required');
    if (!input.effectiveDate) throw new Error('Effective date is required');
    if (input.newMonthlyAmount < 0) throw new Error('Monthly amount must be ≥ 0');

    // Capture the prior assignment for the audit payload before assignStudent
    // closes it — gives us the before/after delta in one log entry.
    const before = await this.getAssignmentForStudent(input.studentId);

    const result = await this.assignStudent(
      input.studentId, '', '',
      input.newVehicleId, input.newStopId, '',
      input.newMonthlyAmount, input.effectiveDate,
      undefined, input.endDate ?? null, input.reason,
    );

    // Distinct audit event so the timeline can render "changed" rows
    // differently from initial "assigned" rows.
    await logAudit('transport_changed', 'student_transport_assignment', result.id, {
      studentId: input.studentId,
      effectiveDate: input.effectiveDate,
      reason: input.reason,
      from: before ? {
        assignmentId: before.id,
        vehicleId: before.vehicleId,
        stopId: before.boardingStopId,
        monthlyAmount: before.monthlyAmount,
      } : null,
      to: {
        assignmentId: result.id,
        vehicleId: input.newVehicleId,
        stopId: input.newStopId,
        monthlyAmount: input.newMonthlyAmount,
      },
    });
    return result;
  },

  /**
   * Returns ALL assignments for a student (active + historical), ordered
   * newest start_date first. Optionally constrained to a single academic
   * year.
   */
  async getTransportHistory(
    studentId: string, academicYearId?: string,
  ): Promise<StudentTransportAssignment[]> {
    let q = supabase
      .from('student_transport_assignments')
      .select(`
        id, student_id, academic_year_id, vehicle_id, stop_id,
        monthly_amount, start_date, end_date, is_active, reason, end_reason,
        students!inner(name, school_id),
        student_academic_records(class_name, section, academic_year_id),
        route_stops(name),
        transport_vehicles(vehicle_no)
      `)
      .eq('student_id', studentId)
      .order('start_date', { ascending: false, nullsFirst: false });
    if (academicYearId) q = q.eq('academic_year_id', academicYearId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as AssignmentRow[]).map(a => ({
      id: a.id,
      studentId: a.student_id,
      studentName: a.students?.name ?? '',
      className: a.student_academic_records
        ? `${a.student_academic_records.class_name}-${a.student_academic_records.section}`
        : '',
      vehicleId: a.vehicle_id ?? '',
      boardingStopId: a.stop_id ?? '',
      boardingStopName: a.route_stops?.name ?? '—',
      academicYearId: a.academic_year_id,
      monthlyAmount: Number(a.monthly_amount),
      startDate: a.start_date ?? '',
      endDate: a.end_date,
      isActive: a.is_active,
      reason: a.reason,
      endReason: a.end_reason,
      vehicleNo: a.transport_vehicles?.vehicle_no,
    }));
  },

  /**
   * Bulk move every student off `fromVehicleId` onto `toVehicleId`/`toStopId`
   * starting from `effectiveDate`, with `reason` recorded on every new row.
   * Uses the bulk_close_transport_assignments RPC for the close-half so the
   * old rows + their future-installment cleanup happen atomically.
   * Returns the count of students moved.
   */
  async bulkReassignVehicle(input: {
    fromVehicleId: string;
    toVehicleId: string;
    toStopId: string;
    effectiveDate: string;          // YYYY-MM-DD
    reason: string;
  }): Promise<{ moved: number }> {
    if (!input.reason?.trim()) throw new Error('Reason is required');
    if (!input.effectiveDate) throw new Error('Effective date is required');
    if (input.fromVehicleId === input.toVehicleId) throw new Error('Pick a different target vehicle');

    const { data, error } = await supabase.rpc('bulk_close_transport_assignments', {
      p_from_vehicle: input.fromVehicleId,
      p_effective_date: input.effectiveDate,
      p_end_reason: input.reason,
    });
    if (error) throw new Error(error.message);

    type Closed = {
      assignment_id: string; student_id: string;
      stop_id: string | null; monthly_amount: number; academic_year_id: string;
    };
    const closed = (data ?? []) as Closed[];

    // Re-create on the new vehicle for each closed student.
    let moved = 0;
    for (const c of closed) {
      try {
        await this.assignStudent(
          c.student_id, '', '',
          input.toVehicleId, input.toStopId, '',
          Number(c.monthly_amount), input.effectiveDate,
          c.academic_year_id, null, input.reason,
        );
        moved += 1;
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[transport] bulk reassign — skipping student:', c.student_id, e);
      }
    }

    await logAudit('transport_bulk_reassign', 'transport_vehicle', input.fromVehicleId, {
      toVehicleId: input.toVehicleId, toStopId: input.toStopId,
      effectiveDate: input.effectiveDate, reason: input.reason,
      closed: closed.length, moved,
    });
    await this.refreshAll();
    return { moved };
  },

  async getStudents(): Promise<TransportStudent[]> {
    const schoolId = getSchoolId();
    const { data: ay } = await supabase
      .from('academic_years').select('id').eq('school_id', schoolId).eq('is_active', true).maybeSingle();
    const ayId = (ay as { id: string } | null)?.id;
    if (!ayId) return [];
    // Constrain the embedded academic-record join to the active year so
    // class/section reflects the current year, not whichever record was
    // ordered first when a student has multiple yearly rows.
    const { data, error } = await supabase
      .from('students')
      .select('id, name, admission_no, student_academic_records!inner(class_name, section, academic_year_id)')
      .eq('school_id', schoolId).eq('is_active', true)
      .eq('student_academic_records.academic_year_id', ayId);
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<{
      id: string; name: string; admission_no: string;
      student_academic_records: { class_name: string; section: string }[];
    }>).map(s => {
      const ar = s.student_academic_records?.[0];
      return {
        id: s.id, name: s.name, admissionNo: s.admission_no,
        className: ar ? `${ar.class_name}-${ar.section}` : '',
      };
    });
  },

  async getUnassignedStudents(): Promise<TransportStudent[]> {
    const all = await this.getStudents();
    const assigned = new Set(_assignmentsCache.map(a => a.studentId));
    return all.filter(s => !assigned.has(s.id));
  },

  // ── Drivers (filter staff WHERE role=DRIVER) ────────────────────────────
  async getDrivers(): Promise<{ id: string; name: string; phone: string }[]> {
    const schoolId = getSchoolId();
    const { data, error } = await supabase
      .from('staff').select('id, name, phone')
      .eq('school_id', schoolId).eq('role', 'DRIVER').eq('is_active', true)
      .order('name');
    if (error) throw new Error(error.message);
    return ((data ?? []) as { id: string; name: string; phone: string | null }[])
      .map(d => ({ id: d.id, name: d.name, phone: d.phone ?? '' }));
  },

  // ── Student-side: full transport info ───────────────────────────────────
  getStudentTransportInfo(studentId: string): {
    vehicle: TransportVehicle;
    assignment: StudentTransportAssignment;
    stops: (RouteStop & { status: 'COMPLETED' | 'CURRENT' | 'UPCOMING' })[];
  } | null {
    const assignment = this.getAssignmentForStudent(studentId);
    if (!assignment) return null;
    const vehicle = this.getVehicleById(assignment.vehicleId);
    if (!vehicle) return null;
    const lastIdx = vehicle.lastStopIndex ?? -1;
    const stops = vehicle.stops.map((stop, i) => ({
      ...stop,
      status: i <= lastIdx ? 'COMPLETED' as const :
              i === lastIdx + 1 ? 'CURRENT' as const : 'UPCOMING' as const,
    }));
    return { vehicle, assignment, stops };
  },

  // ── GPS / live location ─────────────────────────────────────────────────
  async updateVehicleLocation(vehicleId: string, lat: number, lng: number): Promise<void> {
    await supabase.from('driver_locations').insert({ vehicle_id: vehicleId, lat, lng });
  },

  detectArrival(vehicleId: string, lat: number, lng: number, radiusMeters = 500): void {
    const v = this.getVehicleById(vehicleId);
    if (!v) return;
    const lastIdx = v.lastStopIndex ?? -1;
    const next = v.stops[lastIdx + 1];
    if (!next) return;
    const dist = calculateDistance(lat, lng, next.lat, next.lng);
    if (dist <= radiusMeters) {
      v.lastStopIndex = lastIdx + 1;
      next.arrivedAt = new Date().toISOString();
    }
  },

  async addWaypoint(vehicleId: string, name: string, lat: number, lng: number, estimatedTime: string): Promise<RouteStop> {
    return this.addStop(vehicleId, { name, lat, lng, estimatedTime });
  },

  async editWaypoint(vehicleId: string, stopId: string, data: Partial<RouteStop>): Promise<void> {
    return this.updateStop(vehicleId, stopId, data);
  },
};
