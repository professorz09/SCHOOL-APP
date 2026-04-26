import { SystemLog } from '../types/logs.types';
import { LogType } from '../config/constants';

const MOCK_LOGS: SystemLog[] = [
  { id: 'l1', action: 'Marked Billing as Paid', entity: 'Delhi Public School', entityType: LogType.BILLING, performedBy: 'admin@edugrow.in', performedById: 'a1', timestamp: '2025-04-26 09:42 AM' },
  { id: 'l2', action: 'Added New Principal Account', entity: 'principal@sunrisevalley.edu.in', entityType: LogType.ADMIN, performedBy: 'admin@edugrow.in', performedById: 'a1', timestamp: '2025-04-25 04:15 PM' },
  { id: 'l3', action: 'Onboarded New School', entity: 'Oakridge International', entityType: LogType.SCHOOL, performedBy: 'admin@edugrow.in', performedById: 'a1', timestamp: '2025-04-24 11:30 AM' },
  { id: 'l4', action: 'Sent System Broadcast', entity: 'AI Exam Paper Generator — Now Live!', entityType: LogType.BROADCAST, performedBy: 'admin@edugrow.in', performedById: 'a1', timestamp: '2025-04-15 09:30 AM' },
  { id: 'l5', action: 'Updated School Plan', entity: 'Greenwood High — Standard → Premium', entityType: LogType.BILLING, performedBy: 'admin@edugrow.in', performedById: 'a1', timestamp: '2025-04-14 02:00 PM' },
  { id: 'l6', action: 'Suspended Admin Account', entity: 'temp.user@edugrow.in', entityType: LogType.SECURITY, performedBy: 'admin@edugrow.in', performedById: 'a1', timestamp: '2025-04-12 06:45 PM' },
  { id: 'l7', action: 'Generated Platform Report', entity: 'Q1 2025 Analytics', entityType: LogType.SYSTEM, performedBy: 'system', performedById: 'system', timestamp: '2025-04-10 12:00 AM' },
  { id: 'l8', action: 'Updated Billing Schedule', entity: "St. Mary's Convent — Quarterly", entityType: LogType.BILLING, performedBy: 'admin@edugrow.in', performedById: 'a1', timestamp: '2025-04-08 10:20 AM' },
  { id: 'l9', action: 'Disabled School Account', entity: 'Sunrise Valley — Temporarily', entityType: LogType.SCHOOL, performedBy: 'admin@edugrow.in', performedById: 'a1', timestamp: '2025-04-05 03:30 PM' },
  { id: 'l10', action: 'System Backup Completed', entity: 'Full DB Backup', entityType: LogType.SYSTEM, performedBy: 'system', performedById: 'system', timestamp: '2025-04-01 03:00 AM' },
];

let _db: SystemLog[] = [...MOCK_LOGS];

export const logsService = {
  async getAll(): Promise<SystemLog[]> {
    return [..._db];
  },

  async getByType(type: LogType): Promise<SystemLog[]> {
    return _db.filter(l => l.entityType === type);
  },

  async addLog(log: Omit<SystemLog, 'id' | 'timestamp'>): Promise<void> {
    _db = [
      {
        ...log,
        id: `l${Date.now()}`,
        timestamp: new Date().toLocaleString('en-IN'),
      },
      ..._db,
    ];
  },
};
