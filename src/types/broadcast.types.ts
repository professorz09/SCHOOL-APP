import { BroadcastAudience } from '../config/constants';

export type BroadcastStatus = 'DRAFT' | 'SENT' | 'SCHEDULED';

export interface Broadcast {
  id: string;
  title: string;
  body: string;
  audience: BroadcastAudience;
  status: BroadcastStatus;
  sentAt: string | null;
  scheduledAt: string | null;
  createdBy: string;
  createdAt: string;
  reachCount: number;
}

export type CreateBroadcastInput = {
  title: string;
  body: string;
  audience: BroadcastAudience;
  scheduledAt?: string;
};
