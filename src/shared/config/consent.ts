/**
 * Consent version + bilingual notice text shown to parents (and
 * students) on first login. When the privacy text changes in a way
 * that affects what data is collected or why, bump CURRENT_CONSENT_VERSION
 * — every PARENT/STUDENT whose stored consent_version is below the new
 * one will be re-prompted on next login.
 *
 * Bump rules:
 *   1 → 2  : add a new data field (e.g. photo upload)
 *   1 → 2  : change retention period
 *   1 → 2  : add a new disclosure category
 * Cosmetic copy edits do NOT need a bump.
 *
 * Keep the text concise — parents read this on a phone screen.
 */

export const CURRENT_CONSENT_VERSION = 1;

/** Bilingual consent text. Keep both languages short and parallel. */
export const CONSENT_TEXT = {
  hi: `Aapke aur aapke bachhe ke baare me kya data school store karta hai aur kyun:

DATA: Naam, mobile, address, photo, attendance, marks, fees, transport details, parent/guardian details.

PURPOSE (Kis liye): School operations (admission, attendance, marks, fees, communication). Kisi third-party ko bechte ya share nahi karte.

RETENTION (Kab tak): Bachha school me hai tab tak + 60 din. Audit records 3 saal tak (compliance ke liye).

AAPKE RIGHTS:
• Apne bachhe ka data dekhna — app me available
• Galti correct karwana — principal ko bolein
• Data delete karwana — TC ke saath delete ho jata hai, ya principal se request karein
• Consent withdraw karna — principal se TC issue karwa lein

Agree karke aap is data processing ko allow karte hain. Withdraw kabhi bhi kar sakte hain.`,

  en: `What data the school stores about you and your child, and why:

DATA: Name, mobile, address, photo, attendance, marks, fees, transport details, parent/guardian details.

PURPOSE: School operations (admission, attendance, marks, fees, communication). We never sell or share with third parties.

RETENTION: For as long as the child is enrolled + 60 days. Audit records kept for 3 years (compliance).

YOUR RIGHTS:
• View your child's data — available in this app
• Correct mistakes — tell the principal
• Delete data — happens with TC (transfer certificate), or request the principal
• Withdraw consent — request the principal to issue TC

By tapping Agree you allow this data processing. You can withdraw consent at any time.`,
};
