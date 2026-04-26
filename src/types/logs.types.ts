import { LogType } from '../config/constants';

export interface SystemLog {
  id: string;
  action: string;
  entity: string;
  entityType: LogType;
  performedBy: string;
  performedById: string;
  timestamp: string;
  metadata?: Record<string, string>;
}
