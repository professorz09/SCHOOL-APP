// SPECIFIC_STUDENT pairs with `targetStudentId` to deliver a notice to one
// student only — used for personal messages (discipline, attendance follow-up,
// etc.) without polluting the school-wide broadcast feed.
export type NoticeAudience = 'ALL' | 'STUDENTS' | 'TEACHERS' | 'STAFF' | 'PARENTS' | 'SPECIFIC_STUDENT';

export interface Notice {
  id: string;
  title: string;
  body: string;
  audience: NoticeAudience;
  sentAt: string;
  sentBy: string;
  pinned: boolean;
  targetStudentId?: string | null;
  targetStudentName?: string | null;
}

export interface CreateNoticeInput {
  title: string;
  body: string;
  audience: NoticeAudience;
  pinned: boolean;
  sentBy: string;
  targetStudentId?: string | null;
}
