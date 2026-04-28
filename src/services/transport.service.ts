// ─── Utilities ────────────────────────────────────────────────────────────────

const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// ─── Types ────────────────────────────────────────────────────────────────────

export type VehicleType = 'BUS' | 'VAN' | 'MINI_BUS';

export interface RouteStop {
  id: string;
  name: string;
  estimatedTime: string; // "07:45"
  lat: number;
  lng: number;
  arrivedAt?: string; // ISO timestamp of arrival
}

export interface VehicleLocation {
  lat: number;
  lng: number;
  timestamp: string; // ISO timestamp
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
  lastStopIndex?: number; // Index of last reached stop
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
  monthlyAmount: number; // Transport fee per month (determined by route/stop)
  startDate: string; // YYYY-MM-DD (when transport starts)
  endDate: string | null; // YYYY-MM-DD or null if ongoing
}

// ─── Seed Data ────────────────────────────────────────────────────────────────

let _vehicles: TransportVehicle[] = [
  {
    id: 'v1',
    vehicleNo: 'DL-01-CA-1234',
    type: 'BUS',
    capacity: 50,
    routeName: 'Route A — Dwarka',
    stops: [
      { id: 's1a', name: 'School Campus',    estimatedTime: '07:30', lat: 28.6139, lng: 77.2090 },
      { id: 's1b', name: 'Janakpuri West',   estimatedTime: '07:50', lat: 28.6200, lng: 77.0780 },
      { id: 's1c', name: 'Uttam Nagar',      estimatedTime: '08:05', lat: 28.6150, lng: 77.0550 },
      { id: 's1d', name: 'Dwarka Sector 7',  estimatedTime: '08:20', lat: 28.5964, lng: 77.0450 },
      { id: 's1e', name: 'Dwarka Sector 14', estimatedTime: '08:35', lat: 28.5900, lng: 77.0390 },
    ],
    driverId: 'staff6',
    driverName: 'Rajan Kumar',
    driverPhone: '+91 98001 66666',
    isActive: true,
  },
  {
    id: 'v2',
    vehicleNo: 'DL-01-CB-5678',
    type: 'VAN',
    capacity: 12,
    routeName: 'Route B — Rohini',
    stops: [
      { id: 's2a', name: 'School Campus',    estimatedTime: '07:30', lat: 28.6139, lng: 77.2090 },
      { id: 's2b', name: 'Shalimar Bagh',    estimatedTime: '07:55', lat: 28.7041, lng: 77.1620 },
      { id: 's2c', name: 'Pitampura',        estimatedTime: '08:10', lat: 28.7028, lng: 77.1317 },
      { id: 's2d', name: 'Rohini Sector 10', estimatedTime: '08:25', lat: 28.7195, lng: 77.1089 },
    ],
    driverId: null,
    driverName: 'Suresh Yadav',
    driverPhone: '+91 98001 77777',
    isActive: true,
  },
];

let _assignments: StudentTransportAssignment[] = [
  {
    id: 'ta1', studentId: 'student1', studentName: 'Aakash Sharma', className: '10-A',
    vehicleId: 'v1', boardingStopId: 's1d', boardingStopName: 'Dwarka Sector 7', academicYearId: 'ay1',
    monthlyAmount: 500, startDate: '2026-04-01', endDate: null,
  },
  {
    id: 'ta2', studentId: 'student2', studentName: 'Priya Mehta', className: '10-A',
    vehicleId: 'v1', boardingStopId: 's1e', boardingStopName: 'Dwarka Sector 14', academicYearId: 'ay1',
    monthlyAmount: 500, startDate: '2026-04-01', endDate: null,
  },
  {
    id: 'ta3', studentId: 'student3', studentName: 'Rahul Verma', className: '9-A',
    vehicleId: 'v2', boardingStopId: 's2c', boardingStopName: 'Pitampura', academicYearId: 'ay1',
    monthlyAmount: 400, startDate: '2026-04-01', endDate: null,
  },
  {
    id: 'ta4', studentId: 'student4', studentName: 'Ananya Singh', className: '9-B',
    vehicleId: 'v1', boardingStopId: 's1b', boardingStopName: 'Janakpuri West', academicYearId: 'ay1',
    monthlyAmount: 500, startDate: '2026-04-01', endDate: null,
  },
  {
    id: 'ta5', studentId: 'student5', studentName: 'Vikram Rathore', className: '8-A',
    vehicleId: 'v2', boardingStopId: 's2b', boardingStopName: 'Shalimar Bagh', academicYearId: 'ay1',
    monthlyAmount: 400, startDate: '2026-04-01', endDate: null,
  },
  {
    id: 'ta6', studentId: 'student6', studentName: 'Neha Gupta', className: '8-B',
    vehicleId: 'v1', boardingStopId: 's1c', boardingStopName: 'Uttam Nagar', academicYearId: 'ay1',
    monthlyAmount: 500, startDate: '2026-04-01', endDate: null,
  },
  {
    id: 'ta7', studentId: 'student7', studentName: 'Arjun Patel', className: '10-B',
    vehicleId: 'v2', boardingStopId: 's2d', boardingStopName: 'Rohini Sector 10', academicYearId: 'ay1',
    monthlyAmount: 400, startDate: '2026-04-01', endDate: null,
  },
];

// ─── Mock students (for assignment picker) ────────────────────────────────────
export interface TransportStudent {
  id: string;
  name: string;
  className: string;
  admissionNo: string;
}

const _mockStudents: TransportStudent[] = [
  { id: 'student1', name: 'Aakash Sharma', className: '10-A', admissionNo: 'ADM-001' },
  { id: 'student2', name: 'Priya Mehta', className: '10-A', admissionNo: 'ADM-002' },
  { id: 'student3', name: 'Rahul Verma', className: '9-A', admissionNo: 'ADM-003' },
  { id: 'student4', name: 'Ananya Singh', className: '9-B', admissionNo: 'ADM-004' },
  { id: 'student5', name: 'Vikram Rathore', className: '8-A', admissionNo: 'ADM-005' },
  { id: 'student6', name: 'Neha Gupta', className: '8-B', admissionNo: 'ADM-006' },
  { id: 'student7', name: 'Arjun Patel', className: '10-B', admissionNo: 'ADM-007' },
];

// ─── Service API ──────────────────────────────────────────────────────────────
export const transportService = {

  // ── Vehicles ────────────────────────────────────────────────────────────
  getVehicles(): TransportVehicle[] {
    return [..._vehicles];
  },

  getVehicleById(id: string): TransportVehicle | null {
    return _vehicles.find(v => v.id === id) ?? null;
  },

  addVehicle(data: Omit<TransportVehicle, 'id' | 'stops' | 'driverId' | 'driverName' | 'driverPhone' | 'isActive'>): TransportVehicle {
    const v: TransportVehicle = {
      ...data,
      id: `v${Date.now()}`,
      stops: [],
      driverId: null,
      driverName: '—',
      driverPhone: '—',
      isActive: true,
    };
    _vehicles = [..._vehicles, v];
    return v;
  },

  updateVehicle(id: string, data: Partial<TransportVehicle>): TransportVehicle {
    _vehicles = _vehicles.map(v => v.id === id ? { ...v, ...data } : v);
    return _vehicles.find(v => v.id === id)!;
  },

  deleteVehicle(id: string): void {
    _vehicles = _vehicles.filter(v => v.id !== id);
    _assignments = _assignments.filter(a => a.vehicleId !== id);
  },

  // ── Driver assignment ───────────────────────────────────────────────────
  assignDriver(vehicleId: string, driverId: string, driverName: string, driverPhone: string): void {
    _vehicles = _vehicles.map(v =>
      v.id === vehicleId ? { ...v, driverId, driverName, driverPhone } : v
    );
  },

  removeDriver(vehicleId: string): void {
    _vehicles = _vehicles.map(v =>
      v.id === vehicleId ? { ...v, driverId: null, driverName: '—', driverPhone: '—' } : v
    );
  },

  // ── Route / stops ───────────────────────────────────────────────────────
  setRouteName(vehicleId: string, routeName: string): void {
    _vehicles = _vehicles.map(v => v.id === vehicleId ? { ...v, routeName } : v);
  },

  addStop(vehicleId: string, stop: Omit<RouteStop, 'id'>): RouteStop {
    const newStop: RouteStop = { ...stop, id: `s${Date.now()}` };
    _vehicles = _vehicles.map(v =>
      v.id === vehicleId ? { ...v, stops: [...v.stops, newStop] } : v
    );
    return newStop;
  },

  updateStop(vehicleId: string, stopId: string, data: Partial<RouteStop>): void {
    _vehicles = _vehicles.map(v =>
      v.id === vehicleId
        ? { ...v, stops: v.stops.map(s => s.id === stopId ? { ...s, ...data } : s) }
        : v
    );
  },

  removeStop(vehicleId: string, stopId: string): void {
    _vehicles = _vehicles.map(v =>
      v.id === vehicleId ? { ...v, stops: v.stops.filter(s => s.id !== stopId) } : v
    );
    // Clear assignments using this stop
    _assignments = _assignments.map(a =>
      a.vehicleId === vehicleId && a.boardingStopId === stopId
        ? { ...a, boardingStopId: '', boardingStopName: '—' }
        : a
    );
  },

  // ── Student assignments ─────────────────────────────────────────────────
  getAssignments(): StudentTransportAssignment[] {
    return [..._assignments];
  },

  getAssignmentsByVehicle(vehicleId: string): StudentTransportAssignment[] {
    return _assignments.filter(a => a.vehicleId === vehicleId);
  },

  getAssignmentForStudent(studentId: string): StudentTransportAssignment | null {
    return _assignments.find(a => a.studentId === studentId) ?? null;
  },

  assignStudent(
    studentId: string, studentName: string, className: string,
    vehicleId: string, stopId: string, stopName: string,
    monthlyAmount = 500, startDate = '2026-04-01',
    academicYearId = 'ay1',
  ): StudentTransportAssignment {
    // Remove existing assignment if any
    _assignments = _assignments.filter(a => a.studentId !== studentId);
    const assignment: StudentTransportAssignment = {
      id: `ta${Date.now()}`,
      studentId, studentName, className,
      vehicleId, boardingStopId: stopId, boardingStopName: stopName,
      academicYearId,
      monthlyAmount,
      startDate,
      endDate: null,
    };
    _assignments = [..._assignments, assignment];
    return assignment;
  },

  removeStudentAssignment(studentId: string): void {
    _assignments = _assignments.filter(a => a.studentId !== studentId);
  },

  // ── Students list (for assignment picker) ───────────────────────────────
  getStudents(): TransportStudent[] {
    return [..._mockStudents];
  },

  getUnassignedStudents(): TransportStudent[] {
    const assignedIds = new Set(_assignments.map(a => a.studentId));
    return _mockStudents.filter(s => !assignedIds.has(s.id));
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

  // ── GPS & Real-time Location ────────────────────────────────────────────
  updateVehicleLocation(vehicleId: string, lat: number, lng: number): void {
    _vehicles = _vehicles.map(v =>
      v.id === vehicleId
        ? { ...v, currentLocation: { lat, lng, timestamp: new Date().toISOString() } }
        : v
    );
  },

  detectArrival(vehicleId: string, lat: number, lng: number, radiusMeters = 500): void {
    const vehicle = _vehicles.find(v => v.id === vehicleId);
    if (!vehicle) return;

    const lastIdx = vehicle.lastStopIndex ?? -1;
    const nextStop = vehicle.stops[lastIdx + 1];
    if (!nextStop) return;

    // Calculate distance between current GPS and next stop
    const distance = calculateDistance(lat, lng, nextStop.lat, nextStop.lng);
    if (distance <= radiusMeters) {
      // Mark as arrived
      _vehicles = _vehicles.map(v =>
        v.id === vehicleId
          ? {
              ...v,
              stops: v.stops.map((s, i) =>
                i === lastIdx + 1 ? { ...s, arrivedAt: new Date().toISOString() } : s
              ),
              lastStopIndex: lastIdx + 1,
            }
          : v
      );
    }
  },

  addWaypoint(vehicleId: string, name: string, lat: number, lng: number, estimatedTime: string): RouteStop {
    const stop: RouteStop = { id: `s${Date.now()}`, name, lat, lng, estimatedTime };
    _vehicles = _vehicles.map(v =>
      v.id === vehicleId ? { ...v, stops: [...v.stops, stop] } : v
    );
    return stop;
  },

  editWaypoint(vehicleId: string, stopId: string, data: Partial<RouteStop>): void {
    _vehicles = _vehicles.map(v =>
      v.id === vehicleId
        ? { ...v, stops: v.stops.map(s => s.id === stopId ? { ...s, ...data } : s) }
        : v
    );
  },
};
