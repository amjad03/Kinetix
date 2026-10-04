/**
 * Phone numbers are stored in E.164. Accept what people actually type: "98000 00001",
 * "098000-00001", "919800000001" or "+91 98000 00001" all mean +919800000001.
 */
export function normalizePhone(input: string): string {
  const digits = input.replace(/[\s\-().]/g, '');
  if (/^\+\d{8,15}$/.test(digits)) return digits;
  if (/^0?[6-9]\d{9}$/.test(digits)) return `+91${digits.slice(-10)}`;
  if (/^91[6-9]\d{9}$/.test(digits)) return `+${digits}`;
  return digits;
}
