export function normalizeTurkishMobile(value: string): string | null {
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('0090')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = `90${digits.slice(1)}`;
  else if (digits.length === 10) digits = `90${digits}`;
  return digits.length === 12 && digits.startsWith('905') ? `+${digits}` : null;
}
