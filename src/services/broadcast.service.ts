import { Broadcast, CreateBroadcastInput } from '../types/broadcast.types';
import { BroadcastAudience } from '../config/constants';

const MOCK_BROADCASTS: Broadcast[] = [
  {
    id: 'bc1', title: 'Scheduled Server Maintenance',
    body: 'EduGrow platform will undergo scheduled maintenance on Sunday, 27th April 2025 from 2 AM to 4 AM IST. All services will be temporarily unavailable.',
    audience: BroadcastAudience.ALL, status: 'SENT',
    sentAt: '2025-04-20 10:00 AM', scheduledAt: null,
    createdBy: 'admin@edugrow.in', createdAt: '2025-04-20', reachCount: 18500,
  },
  {
    id: 'bc2', title: 'AI Exam Paper Generator — Now Live!',
    body: 'We are excited to announce the launch of our AI-powered Exam Paper Generator. Teachers can now create custom question papers in minutes using Gemini AI.',
    audience: BroadcastAudience.PRINCIPALS, status: 'SENT',
    sentAt: '2025-04-15 09:30 AM', scheduledAt: null,
    createdBy: 'admin@edugrow.in', createdAt: '2025-04-15', reachCount: 6,
  },
  {
    id: 'bc3', title: 'Holiday Notice — Summer Break',
    body: 'Kindly inform all students and staff that schools will be closed from 15th May to 15th June 2025 for summer vacation. Online portal will remain active.',
    audience: BroadcastAudience.ALL, status: 'SENT',
    sentAt: '2025-04-12 11:00 AM', scheduledAt: null,
    createdBy: 'admin@edugrow.in', createdAt: '2025-04-12', reachCount: 18500,
  },
  {
    id: 'bc4', title: 'New Transport Module Features',
    body: 'The transport module has been upgraded with live GPS tracking, automatic stop arrival detection, and parent notifications.',
    audience: BroadcastAudience.PRINCIPALS, status: 'SENT',
    sentAt: '2025-04-05 03:00 PM', scheduledAt: null,
    createdBy: 'admin@edugrow.in', createdAt: '2025-04-05', reachCount: 6,
  },
];

let _db: Broadcast[] = [...MOCK_BROADCASTS];

export const broadcastService = {
  async getAll(): Promise<Broadcast[]> {
    return [..._db].sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
  },

  async send(input: CreateBroadcastInput): Promise<Broadcast> {
    const reachMap: Record<BroadcastAudience, number> = {
      [BroadcastAudience.ALL]: 18500,
      [BroadcastAudience.PRINCIPALS]: 6,
      [BroadcastAudience.TEACHERS]: 352,
      [BroadcastAudience.STUDENTS]: 6740,
    };
    const broadcast: Broadcast = {
      id: `bc${Date.now()}`,
      title: input.title,
      body: input.body,
      audience: input.audience,
      status: input.scheduledAt ? 'SCHEDULED' : 'SENT',
      sentAt: input.scheduledAt ? null : new Date().toLocaleString('en-IN'),
      scheduledAt: input.scheduledAt ?? null,
      createdBy: 'admin@edugrow.in',
      createdAt: new Date().toISOString().split('T')[0],
      reachCount: reachMap[input.audience],
    };
    _db = [broadcast, ..._db];
    return broadcast;
  },

  async delete(id: string): Promise<void> {
    _db = _db.filter(b => b.id !== id);
  },
};
