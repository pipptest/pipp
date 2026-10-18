export function dollars(cents) {
  if (cents == null) return 'Not set';
  return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 });
}

// Parses "350", "$350", "350.50" into cents. Returns null if invalid.
export function toCents(input) {
  const n = Number(String(input || '').replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n) || n < 0 || n > 1000000) return null;
  return Math.round(n * 100);
}
