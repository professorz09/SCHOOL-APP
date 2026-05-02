import { apiAcademicYear } from '@/shared/lib/apiClient';

export interface WizardSection {
  className: string;
  section: string;
  stream?: string | null;
  capacity: number;
}

export interface CreateAcademicYearWithSectionsInput {
  label: string;
  startDate: string;
  endDate: string;
  board: string;
  medium: string;
  streams: string[];
  sections: WizardSection[];
}

export const academicYearService = {
  async createWithSections(input: CreateAcademicYearWithSectionsInput): Promise<string> {
    const { yearId } = await apiAcademicYear.createWithSections({
      label:     input.label,
      startDate: input.startDate,
      endDate:   input.endDate,
      board:     input.board,
      medium:    input.medium,
      streams:   input.streams,
      sections:  input.sections.map(s => ({
        className: s.className,
        section:   s.section,
        stream:    s.stream ?? null,
        capacity:  s.capacity,
      })),
    });
    return yearId;
  },
};
