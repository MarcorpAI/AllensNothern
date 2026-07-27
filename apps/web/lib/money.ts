export function money(kurus: number, locale: string): string {
  return new Intl.NumberFormat(locale === 'tr' ? 'tr-TR' : 'en-TR', {
    style: 'currency', currency: 'TRY'
  }).format(kurus / 100);
}

export function currencyMoney(amountMinor: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale === 'tr' ? 'tr-TR' : 'en', {
    style: 'currency', currency
  }).format(amountMinor / 100);
}
