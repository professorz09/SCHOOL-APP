// Shared helpers for tel: + wa.me: links. Indian school parents reach
// teachers / principal almost entirely through WhatsApp, so every
// phone-number surface should expose both a Call AND a WhatsApp link.
//
// Phone normalisation:
//   - strip every non-digit
//   - take last 10 digits (drops +91, leading 0, spaces)
//   - prepend 91 for the wa.me URL (international format required)
// Returns null when the source string can't yield a valid 10-digit
// number so the caller can hide the button entirely.

export interface ContactLinks {
  tel: string;     // tel:+91XXXXXXXXXX
  whatsapp: string; // https://wa.me/91XXXXXXXXXX
  display: string; // human display — XXXXX XXXXX
  e164: string;    // +91XXXXXXXXXX
}

export function buildContactLinks(raw: string | null | undefined, prefilledMessage?: string): ContactLinks | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '').slice(-10);
  if (digits.length !== 10) return null;
  const e164 = `+91${digits}`;
  const display = `${digits.slice(0, 5)} ${digits.slice(5)}`;
  const tel = `tel:${e164}`;
  const waBase = `https://wa.me/91${digits}`;
  const whatsapp = prefilledMessage
    ? `${waBase}?text=${encodeURIComponent(prefilledMessage)}`
    : waBase;
  return { tel, whatsapp, display, e164 };
}
