// ─── Types ────────────────────────────────────────────────────────────────────

export type VehicleType = 'BUS' | 'VAN' | 'MINI_BUS';

export interface RouteStop {
  id: string;
  name: string;
  estimatedTime: string; // "07:45"
  lat: number;
  lng: number;
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
  },
  {
    id: 'ta2', studentId: 'student2', studentName: 'Priya Mehta', className: '10-A',
    vehicleId: 'v1', boardingStopId: 's1e', boardingStopName: 'Dwarka Sector 14', academicYearId: 'ay1',
  },
  {
    id: 'ta3', studentId: 'student3', studentName: 'Rahul Verma', className: '9-A',
    vehicleId: 'v2', boardingStopId: 's2c', boardingStopName: 'Pitampura', academicYearId: 'ay1',
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
    academicYearId = 'ay1',
  ): StudentTransportAssignment {
    // Remove existing assignment if any
    _assignments = _assignments.filter(a => a.studentId !== studentId);
    const assignment: StudentTransportAssignment = {
      id: `ta${Date.now()}`,
      studentId, studentName, className,
      vehicleId, boardingStopId: stopId, boardingStopName: stopName,
      academicYearId,
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

    // Simulate live status: first stop completed, second current, rest upcoming
    const stops = vehicle.stops.map((stop, i) => ({
      ...stop,
      status: i === 0 ? 'COMPLETED' as const :
              i === 1 ? 'CURRENT' as const : 'UPCOMING' as const,
    }));

    return { vehicle, assignment, stops };
  },
};
