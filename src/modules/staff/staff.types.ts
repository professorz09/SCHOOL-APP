export type StaffRole = 'TEACHER' | 'VICE_PRINCIPAL' | 'ACCOUNTANT' | 'LIBRARIAN' | 'LAB_INCHARGE' | 'DRIVER' | 'PEON' | 'SECURITY';
export type StaffStatus = 'ACTIVE' | 'ON_LEAVE' | 'SUSPENDED' | 'RELIEVED';
export type SalaryPaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'UPI' | 'CHEQUE' | 'OTHER';

export interface SalaryPayment {
  id: string;
  month: string;
  amount: number;
  paidAt: string;
  /** ISO timestamp when the row was inserted; used by the UI to compute
   *  the 24-hour reversal window. */
  createdAt: string;
  transactionId: string;
  note: string;
  method?: SalaryPaymentMethod | null;
  /** Reversal metadata. When `reversedAt` is set the row stays in the
   *  payment log but renders struck-through with the reason underneath. */
  reversedAt: string | null;
  reversedByName: string | null;
  reversalReason: string | null;
}

export interface StaffSalaryHistoryEntry {
  id: string;
  amount: number;
  effectiveFrom: string;
  reason: string | null;
  createdAt: string;
}

export interface StaffStatusHistoryEntry {
  id: string;
  oldStatus: StaffStatus | null;
  newStatus: StaffStatus;
  reason: string | null;
  changedAt: string;
}

export interface StaffDocument {
  id: string;
  staffId: string;
  docType: string;
  docName: string;
  storagePath: string;
  uploadedAt: string;
}

export interface SalaryReminderRow {
  staffId: string;
  name: string;
  role: StaffRole;
  salary: number;
  paid: number;
  pending: number;
}

export interface StaffMember {
  id: string;
  name: string;
  role: StaffRole;
  subject: string;
  phone: string;
  email: string;
  aadhaarNo: string;
  salary: number;
  joiningDate: string;
  status: StaffStatus;
  assignedClasses: string[];
  address: string;
  photo: string;
  salaryHistory?: SalaryPayment[];
  relievingDate?: string | null;
  relievingReason?: string | null;
}
