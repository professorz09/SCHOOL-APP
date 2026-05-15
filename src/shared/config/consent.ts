/**
 * Consent version + bilingual notice text shown to parents (and
 * students) on first login. When the privacy text changes in a way
 * that affects what data is collected or why, bump CURRENT_CONSENT_VERSION
 * — every PARENT/STUDENT whose stored consent_version is below the new
 * one will be re-prompted on next login.
 *
 * Bump rules:
 *   - New data field collected → bump
 *   - New purpose / sharing rule → bump
 *   - Retention period change → bump
 *   - Cosmetic copy edits → no bump needed
 *
 * Layout: SECTIONS array so the modal can render each section as its
 * own card. First-login gate renders a condensed inline view; the
 * profile "Privacy & Data Use" card renders the full structured view.
 */

export const CURRENT_CONSENT_VERSION = 1;

export interface ConsentSection {
  number: number;
  title_hi: string;
  title_en: string;
  body_hi: string;
  body_en: string;
}

export const CONSENT_SECTIONS: ConsentSection[] = [
  {
    number: 1,
    title_hi: 'Data jo store hota hai',
    title_en: 'What data we collect',
    body_hi: `Aapke aur aapke bachhe ka:
• Naam, mobile, email, address, photo
• Date of birth, gender, blood group
• Class, section, roll number, admission number
• Attendance records (P/A/H/HD)
• Exam marks aur grades
• Fee payment records, receipts, write-offs
• Parent/guardian details
• Transport assignment (agar use karte hain)
• Health-related notes (agar parent ne provide kiye)

Aadhaar number optional hai. Agar provide karte hain to UI me sirf last 4 digits dikhte hain.`,
    body_en: `About you and your child:
• Name, mobile, email, address, photo
• Date of birth, gender, blood group
• Class, section, roll number, admission number
• Attendance records (P/A/H/HD)
• Exam marks and grades
• Fee payment records, receipts, write-offs
• Parent/guardian details
• Transport assignment (if used)
• Health-related notes (if provided by parent)

Aadhaar number is optional. If provided, only the last 4 digits are visible in the UI.`,
  },
  {
    number: 2,
    title_hi: 'Iska purpose kya hai',
    title_en: 'Purpose of this data',
    body_hi: `Sirf school operations ke liye:
• Daily attendance lena
• Marks aur report cards
• Fee billing aur receipts
• Parent-school communication (notices, complaints, leave)
• Transport tracking aur safety
• School administrative reports

Marketing, advertising, ya kisi third-party purpose ke liye NAHI use hota.`,
    body_en: `Strictly for school operations:
• Daily attendance
• Marks and report cards
• Fee billing and receipts
• Parent-school communication (notices, complaints, leave)
• Transport tracking and safety
• School administrative reports

NOT used for marketing, advertising, or any third-party purpose.`,
  },
  {
    number: 3,
    title_hi: 'Data kab tak rakha jata hai',
    title_en: 'Retention period',
    body_hi: `• Active student data: jab tak bachha school me hai
• Bachhe ke school chhodne ke baad: 60 din me deactivate
• Financial/audit records: 3 saal tak (GST aur compliance ke liye)
• School khud delete kare to: 30-din cooling period + permanent delete

Backups: Supabase platform 7-30 din rakhta hai (disaster recovery ke liye, legitimate purpose hai).`,
    body_en: `• Active student data: as long as the child is enrolled
• After child leaves school: deactivated within 60 days
• Financial/audit records: kept for 3 years (GST and compliance)
• If school self-deletes: 30-day cooling period + permanent delete

Backups: Supabase platform retains for 7-30 days (disaster recovery, legitimate purpose).`,
  },
  {
    number: 4,
    title_hi: 'Security measures',
    title_en: 'Security measures',
    body_hi: `Hum technical aur organizational measures use karte hain:
• Encrypted connection (HTTPS/TLS)
• Row-Level Security — har school ka data alag-alag isolated
• Sirf school principal aur teachers ko relevant data dikhta hai
• Audit trail — kisne kya badla, sab log hota hai
• Server-side rate limits aur authentication

Beta phase me hain — surakshit rakhne ki best koshish hai par 100% guarantee internet pe possible nahi.`,
    body_en: `We use technical and organizational measures:
• Encrypted connections (HTTPS/TLS)
• Row-Level Security — each school's data isolated
• Only the principal and teachers see relevant data
• Audit trail — every change is logged
• Server-side rate limits and authentication

We are in Beta phase — best effort security, but 100% guarantee is not possible on any internet system.`,
  },
  {
    number: 5,
    title_hi: 'Aapki responsibility',
    title_en: 'Your responsibility',
    body_hi: `• Sahi data enter karein (galat marks/fees aapki responsibility par hain)
• Apna password kisi ke saath share na karein
• Mobile bhi password jaisa secure rakhein
• Account suspicious activity dekhein to principal ko turant batayein
• Applicable data protection laws ka palan karein`,
    body_en: `• Enter accurate data (incorrect marks/fees are your responsibility)
• Do not share your password with anyone
• Treat your mobile like a password — secure it
• Report suspicious account activity to the principal immediately
• Comply with applicable data protection laws`,
  },
  {
    number: 6,
    title_hi: 'Data sharing',
    title_en: 'Data sharing',
    body_hi: `Hum aapka data sell ya share NAHI karte commercial purposes ke liye. Data sirf tab share hota hai:
• Law ya legal process ki demand par
• Aapki express consent ke saath
• Service providers ke saath (hosting, infrastructure) — sirf operate karne ke liye, marketing ke liye nahi`,
    body_en: `We do NOT sell or share your data for commercial purposes. Data is only shared:
• When required by law or legal process
• With your express consent
• With service providers (hosting, infrastructure) — strictly for operations, not marketing`,
  },
  {
    number: 7,
    title_hi: 'Aapke rights',
    title_en: 'Your rights',
    body_hi: `Aapko ye rights hain (DPDP Act 2023):
• Apne bachhe ka data app me dekhna — Profile screen me available
• Galti correct karwana — principal ko bolein
• Data delete karwana — TC issue karwane se delete ho jata hai
• Consent withdraw karna — principal se TC issue karwa lein
• Grievance — pehle principal ko, fir hum tak (contact below)

Consent kabhi bhi withdraw kar sakte hain. Withdraw karne par data DPDP ke under retain karne wale records ke alawa hata diya jata hai.`,
    body_en: `You have these rights (DPDP Act 2023):
• View your child's data — available in the Profile screen of this app
• Request correction of mistakes — tell the principal
• Request deletion — happens when TC is issued
• Withdraw consent — request the principal to issue TC
• Grievance — first contact the principal, then us (contact below)

You can withdraw consent at any time. On withdrawal, data is removed except records DPDP requires us to retain.`,
  },
  {
    number: 8,
    title_hi: 'Contact / Grievance',
    title_en: 'Contact / Grievance',
    body_hi: `Privacy ya data se related koi sawaal ho to:
• Pehle apne school ke principal se sampark karein
• Phir support ko message karein

Data Protection Officer (DPO) ki details Privacy Policy page pe hain (school se link milegi).`,
    body_en: `For privacy or data-related questions:
• First contact your school's principal
• Then message our support

Data Protection Officer (DPO) details are on the Privacy Policy page (school will share the link).`,
  },
];

/**
 * Plain-text version used by the first-login ConsentGate (compact, no
 * card layout). Joined from CONSENT_SECTIONS so both views stay in sync.
 */
export const CONSENT_TEXT = {
  hi: CONSENT_SECTIONS.map(s => `${s.number}. ${s.title_hi}\n\n${s.body_hi}`).join('\n\n'),
  en: CONSENT_SECTIONS.map(s => `${s.number}. ${s.title_en}\n\n${s.body_en}`).join('\n\n'),
};
