export type FeeUploadStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface FeePaymentUploadRecord {
  id: string;
  studentId: string;
  studentName: string;
  admissionNo: string | null;
  submittedBy: string;
  amount: number;
  description: string;
  screenshotName: string;
  screenshotUrl: string | null;
  status: FeeUploadStatus;
  submittedAt: string;
  reviewedAt: string | null;
  reviewerNote: string | null;
  recordedPaymentId: string | null;
}

export type BillingCycle = 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'ANNUALLY' | 'CUSTOM';

export type FeeStructureType = 'CLASS' | 'VEHICLE';

export interface FeeStructureRecord {
  id: string;
  name: string;
  className: string;
  structureType: FeeStructureType;
  billingCycle: BillingCycle;
  feeHeads: Array<{
    id: string;
    name: string;
    amount: number;
    frequency: 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'ANNUAL' | 'ONE_TIME';
    description: string;
    transactionFee?: number;
  }>;
  monthlyDueDates: Array<{ month: string; date: string }>;
  lateFee: {
    enabled: boolean;
    gracePeriodDays: number;
    type: 'FIXED' | 'PERCENTAGE';
    amount: number;
    maxCap: number;
  };
}
