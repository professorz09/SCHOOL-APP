export type NoticeAudience = 'ALL' | 'STUDENTS' | 'TEACHERS' | 'STAFF' | 'PARENTS';

export interface Notice {
  id: string;
  title: string;
  body: string;
  audience: NoticeAudience;
  sentAt: string;
  sentBy: string;
  pinned: boolean;
}

export interface CreateNoticeInput {
  title: string;
  body: string;
  audience: NoticeAudience;
  pinned: boolean;
  sentBy: string;
}
