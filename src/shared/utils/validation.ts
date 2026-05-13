// Common form-field validators. Use inline (on each blur / onChange)
// to surface errors as the user types instead of waiting for submit.
// Each returns `null` on valid input and a short error string on invalid.
//
// Validators are domain-bounded so callers can compose just what they
// need; e.g. an admission form will use `validateMobile10` for the
// login phone field but only `validateAadhaar` if the principal's
// school records them.

export function validateMobile10(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) return 'Mobile required';
  const digits = raw.replace(/\D/g, '').slice(-10);
  if (digits.length !== 10) return 'Mobile must be 10 digits';
  // Indian mobile numbers start with 6/7/8/9 — useful sanity check
  // (landlines start with 0XXX-XXXXXXX and won't pass here anyway).
  if (!/^[6-9]/.test(digits)) return 'Looks like a landline — enter a 10-digit mobile';
  return null;
}

export function validateAadhaar(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) return null; // optional in most forms
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 12) return 'Aadhaar must be 12 digits';
  return null;
}

export function validateEmail(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) return null; // optional
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim())) return 'Email format looks wrong';
  return null;
}

export function validateDob(raw: string | null | undefined, minYears = 2, maxYears = 25): string | null {
  if (!raw) return 'Date of birth required';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return 'Invalid date';
  const today = new Date();
  if (d > today) return 'DOB cannot be in the future';
  const yrs = (today.getTime() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (yrs < minYears || yrs > maxYears) return `Age looks wrong (${minYears}-${maxYears} years expected)`;
  return null;
}

export function validateRequired(raw: string | null | undefined, label: string): string | null {
  if (!raw || !raw.trim()) return `${label} required`;
  return null;
}

export function validatePassword(raw: string | null | undefined): string | null {
  if (!raw) return 'Password required';
  if (raw.length < 6) return 'Password must be at least 6 characters';
  return null;
}
