/**
 * Consent version + notice text shown to parents (and students) on
 * first login. When the privacy text changes in a way that affects
 * what data is collected or why, bump CURRENT_CONSENT_VERSION — every
 * PARENT/STUDENT whose stored consent_version is below the new one
 * will be re-prompted on next login.
 *
 * Bump rules:
 *   - New data field collected → bump
 *   - New purpose / sharing rule → bump
 *   - Retention period change → bump
 *   - Cosmetic copy edits → no bump needed
 *
 * Sections drive two surfaces:
 *   - First-login ConsentGate (compact plain text)
 *   - Profile → "Privacy & Data Use" modal (card per section)
 * Both render from the same data so future copy edits touch one place.
 */

export const CURRENT_CONSENT_VERSION = 1;

export interface ConsentSection {
  number: number;
  title: string;
  body: string;
}

export const CONSENT_SECTIONS: ConsentSection[] = [
  {
    number: 1,
    title: 'What data we collect',
    body: `About you and your child:
• Name, mobile, email, address, photo
• Date of birth, gender, blood group
• Class, section, roll number, admission number
• Attendance records (Present / Absent / Half-day / Holiday)
• Exam marks and grades
• Fee payment records, receipts, write-offs
• Parent / guardian details
• Transport assignment (if used)
• Health-related notes (only if provided by the parent)

Aadhaar number is optional. If provided, only the last 4 digits are visible in the app.`,
  },
  {
    number: 2,
    title: 'Purpose of this data',
    body: `Strictly for school operations:
• Daily attendance
• Marks and report cards
• Fee billing and receipts
• Parent-school communication (notices, complaints, leave)
• Transport tracking and safety
• School administrative reports

We do NOT use this data for marketing, advertising, or any third-party purpose.`,
  },
  {
    number: 3,
    title: 'Retention period',
    body: `• Active student data: kept while the child is enrolled.
• After the child leaves school: deactivated within 60 days.
• Financial / audit records: retained for 3 years (GST and compliance).
• If the school self-deletes: 30-day cooling period, then permanent delete.

Backups: the Supabase platform retains backups for 7-30 days for disaster recovery. This is a legitimate purpose under DPDP.`,
  },
  {
    number: 4,
    title: 'Security measures',
    body: `We use technical and organizational measures:
• Encrypted connections (HTTPS / TLS)
• Row-Level Security — every school's data is isolated
• Only the principal and assigned teachers see relevant data
• Audit trail — every change is logged
• Server-side rate limits and authentication

The app is in Beta — we use best-effort security, but no system on the internet can guarantee 100% safety.`,
  },
  {
    number: 5,
    title: 'Your responsibility',
    body: `• Enter accurate data — incorrect marks or fees are your responsibility.
• Do not share your password with anyone.
• Treat your mobile like a password — keep it secure.
• Report suspicious account activity to the school principal immediately.
• Use the platform in compliance with applicable data protection laws.`,
  },
  {
    number: 6,
    title: 'Data sharing',
    body: `We do NOT sell or share your data for commercial purposes. Data is only shared:
• When required by law or legal process.
• With your express consent.
• With service providers (hosting, infrastructure) — strictly for operations, never for marketing.`,
  },
  {
    number: 7,
    title: 'Your rights',
    body: `Under the DPDP Act, 2023, you have the right to:
• View your child's data — available in the Profile screen of this app.
• Request correction of mistakes — tell the principal.
• Request deletion — happens when a Transfer Certificate (TC) is issued.
• Withdraw consent — request the principal to issue a TC.
• Raise a grievance — first contact the principal, then us.

You can withdraw consent at any time. On withdrawal, data is removed except records DPDP requires us to retain.`,
  },
  {
    number: 8,
    title: 'Contact / Grievance',
    body: `For privacy or data-related questions:
• First, contact your school's principal.
• Then, message our support.

The Data Protection Officer (DPO) details are on the Privacy Policy page — the school will share the link.`,
  },
];

/**
 * Plain-text version used by the first-login ConsentGate. Joined from
 * CONSENT_SECTIONS so both views stay in sync.
 */
export const CONSENT_TEXT = CONSENT_SECTIONS
  .map(s => `${s.number}. ${s.title}\n\n${s.body}`)
  .join('\n\n');
