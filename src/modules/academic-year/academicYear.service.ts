import { supabase } from '@/shared/lib/supabase';

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
    const payloadSections = input.sections.map(s => ({
      class_name: s.className,
      section: s.section,
      stream: s.stream ?? null,
      capacity: s.capacity,
    }));

    const { data, error } = await supabase.rpc('create_academic_year_with_sections', {
      p_label: input.label.trim(),
      p_start: input.startDate,
      p_end: input.endDate,
      p_board: input.board,
      p_medium: input.medium,
      p_streams: input.streams,
      p_sections: payloadSections,
    });
    if (error) throw new Error(error.message);
    return data as string;
  },
};
