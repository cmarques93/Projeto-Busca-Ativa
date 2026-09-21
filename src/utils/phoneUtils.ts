/**
 * Utility functions for detecting, parsing, formatting, and handling
 * single or multiple phone numbers in student and guardian records.
 * 
 * Supports formats such as:
 * "19 99999-0000 / +55 19 90000-9999"
 * "(19) 99999-0000 / (19) 98888-7777"
 * "19999990000 / 19988887777"
 */

export interface ParsedPhone {
  original: string;
  digits: string;
  formatted: string;
  whatsAppUrl: string;
  isValid: boolean;
  isMobile: boolean;
  label: string; // e.g. "Tel Principal", "Tel 2", etc.
}

/**
 * Splits a phone string by '/' (or '\', ';', '|', ' e ', ' ou ')
 * and returns the list of individual trimmed phone numbers.
 */
export function parsePhoneNumbers(phoneInput?: string | null): string[] {
  if (!phoneInput) return [];
  const raw = String(phoneInput).trim();
  if (!raw) return [];

  // Primary separator: '/' (as in "19 99999-0000 / +55 19 90000-9999")
  // Secondary separators: '\', '|', ';', or ' e '
  const parts = raw.split(/[\/\\|;]|\s+e\s+/i);
  return parts
    .map(p => p.trim())
    .filter(p => p.length > 0 && /\d/.test(p));
}

/**
 * Sanitizes phone digits for WhatsApp URL (wa.me/55...).
 * Handles:
 * - "+55 19 90000-9999" -> "5519900009999"
 * - "19 99999-0000" -> "5519999990000" (prepends BR code 55)
 * - "(19) 99999-0000" -> "5519999990000"
 */
export function cleanPhoneForWhatsApp(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';

  // If already starts with 55 and has 12 or 13 digits (DDD + 8 or 9 digits with 55)
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }

  // If 10 digits (DDD + 8 digits) or 11 digits (DDD + 9 digits)
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }

  // If 8 or 9 digits without DDD, default DDD 19 or return as-is with 55
  if (digits.length === 8 || digits.length === 9) {
    return `5519${digits}`;
  }

  return digits.startsWith('55') ? digits : `55${digits}`;
}

/**
 * Nicely formats a single phone string for display (e.g., "(19) 99999-0000").
 */
export function formatSinglePhone(phone: string): string {
  const clean = phone.trim();
  const digits = clean.replace(/\D/g, '');

  let localDigits = digits;
  // If starts with 55 and has 12 or 13 digits, extract local DDD + number
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    localDigits = digits.slice(2);
  }

  if (localDigits.length === 11) {
    // DDD + 9 digits: (19) 99999-0000
    const ddd = localDigits.slice(0, 2);
    const p1 = localDigits.slice(2, 7);
    const p2 = localDigits.slice(7);
    return `(${ddd}) ${p1}-${p2}`;
  } else if (localDigits.length === 10) {
    // DDD + 8 digits: (19) 3333-0000
    const ddd = localDigits.slice(0, 2);
    const p1 = localDigits.slice(2, 6);
    const p2 = localDigits.slice(6);
    return `(${ddd}) ${p1}-${p2}`;
  }

  // If already has formatting like "+55 19 90000-9999", keep a readable version
  return clean;
}

/**
 * Returns structured metadata for each phone number identified in the string.
 */
export function getStudentPhones(phoneInput?: string | null, message?: string): ParsedPhone[] {
  const rawList = parsePhoneNumbers(phoneInput);

  if (rawList.length === 0) {
    if (phoneInput && phoneInput.trim()) {
      const clean = phoneInput.trim();
      const digits = cleanPhoneForWhatsApp(clean);
      return [{
        original: clean,
        digits,
        formatted: formatSinglePhone(clean),
        whatsAppUrl: `https://wa.me/${digits}${message ? `?text=${encodeURIComponent(message)}` : ''}`,
        isValid: digits.length >= 8,
        isMobile: digits.length >= 12,
        label: 'Contato',
      }];
    }
    return [];
  }

  return rawList.map((item, index) => {
    const digits = cleanPhoneForWhatsApp(item);
    const formatted = formatSinglePhone(item);
    const pureDigits = item.replace(/\D/g, '');
    const isMobile = pureDigits.length === 11 || (pureDigits.length === 13 && pureDigits.startsWith('55'));
    const isValid = pureDigits.length >= 8;

    return {
      original: item,
      digits,
      formatted,
      whatsAppUrl: `https://wa.me/${digits}${message ? `?text=${encodeURIComponent(message)}` : ''}`,
      isValid,
      isMobile,
      label: rawList.length === 1 ? 'WhatsApp' : `Contato ${index + 1}`,
    };
  });
}
