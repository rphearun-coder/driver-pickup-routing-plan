// Shared input sanitizers/validators for the driver forms. Fields use
// type="text" + inputmode (not type="number") so the browser can't accept
// "e", "-", "+" or locale commas — these functions keep the value clean instead.

export const MAX_USD = 10000;
export const MAX_KHR = 40_000_000;
export const MAX_PARCELS = 100;

/** Digits plus one ".", at most `decimals` places, no sign, no leading zeros ("007" → "7"). */
export function sanitizeDecimal(raw: string, decimals = 2): string {
  let value = raw.replace(/,/g, '.').replace(/[^\d.]/g, '');
  const firstDot = value.indexOf('.');
  if (firstDot !== -1) {
    value = value.slice(0, firstDot + 1) + value.slice(firstDot + 1).replace(/\./g, '');
    const [whole, fraction] = value.split('.');
    value = `${whole || '0'}.${fraction.slice(0, decimals)}`;
  }
  return value.replace(/^0+(?=\d)/, '');
}

/** Digits only, no leading zeros, capped at `maxDigits` characters. */
export function sanitizeInteger(raw: string, maxDigits = 9): string {
  return raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, maxDigits);
}

export function parseAmount(value: string): number {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

/** Error text for a money field, or '' when valid. Empty is allowed (treated as 0). */
export function amountError(value: string, max: number, label: string): string {
  if (!value) return '';
  const n = parseAmount(value);
  if (n < 0) return `${label} can't be negative.`;
  if (n > max) return `${label} can't be more than ${max.toLocaleString()}.`;
  return '';
}

export function countError(value: string, max = MAX_PARCELS): string {
  if (!value) return 'Enter how many parcels.';
  const n = Number.parseInt(value, 10);
  if (!Number.isInteger(n) || n < 1) return 'Must be at least 1.';
  if (n > max) return `Can't be more than ${max}.`;
  return '';
}

/** Error text for a free-text field, or '' when valid. */
export function textError(value: string, min: number, max: number, label: string): string {
  const length = value.trim().length;
  if (!length) return `${label} is required.`;
  if (length < min) return `${label} must be at least ${min} characters.`;
  if (length > max) return `${label} must be ${max} characters or fewer.`;
  return '';
}

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Pulls a parcel UUID out of anything scanned or pasted (bare id or a link containing it). */
export function extractUuid(raw: string): string {
  return raw.match(UUID_PATTERN)?.[0]?.toLowerCase() ?? '';
}

/** Cambodian phone to its local digits: "+855 12 345 678", "012345678" and "12345678" all → "12345678". */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('855')) return digits.slice(3);
  return digits.replace(/^0+/, '');
}
