/**
 * Strip the leading "Class" prefix from a class label so UIs render "8" or
 * "Nursery" instead of "Class 8" / "Class Nursery". Single source of truth —
 * use this everywhere a class string is shown to a user.
 *
 * Was previously implemented inconsistently in 4+ files (timetable used a
 * regex that handled "class  8" with extra spaces; others used a literal
 * `replace('Class ', '')` that missed those cases).
 */
export function stripClassPrefix(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/^class\s+/i, '').trim();
}
