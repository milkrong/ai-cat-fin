// Currency & number formatting helpers
// Default locale zh-CN, default currency CNY.
// Usage: formatCurrency(1234.56) => '¥1,234.56'
// If you pass a negative number it's preserved.

let defaultLocale = "zh-CN";
let defaultCurrency = "CNY";

export function setFormatDefaults(opts: {
  locale?: string;
  currency?: string;
}) {
  if (opts.locale) defaultLocale = opts.locale;
  if (opts.currency) defaultCurrency = opts.currency;
}

export function formatCurrency(
  value: number,
  options?: { locale?: string; currency?: string }
) {
  const locale = options?.locale || defaultLocale;
  const currency = options?.currency || defaultCurrency;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      currencyDisplay: "symbol",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    // Fallback simple formatting
    const sign = value < 0 ? "-" : "";
    const abs = Math.abs(value).toFixed(2);
    return sign + abs;
  }
}

export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions & { locale?: string }
) {
  const { locale, ...rest } = options || {};
  const loc = locale || defaultLocale;
  try {
    return new Intl.NumberFormat(loc, rest).format(value);
  } catch {
    return value.toString();
  }
}
