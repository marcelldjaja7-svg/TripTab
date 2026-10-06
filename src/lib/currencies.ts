export type CurrencyInfo = {
  code: string
  name: string
  symbol: string
  decimals: number
}

export const CURRENCIES: CurrencyInfo[] = [
  { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp', decimals: 0 },
  { code: 'USD', name: 'US Dollar', symbol: '$', decimals: 2 },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', decimals: 2 },
  { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM', decimals: 2 },
  { code: 'THB', name: 'Thai Baht', symbol: '฿', decimals: 2 },
  { code: 'EUR', name: 'Euro', symbol: '€', decimals: 2 },
  { code: 'GBP', name: 'British Pound', symbol: '£', decimals: 2 },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', decimals: 0 },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', decimals: 2 },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', decimals: 2 },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF', decimals: 2 },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', decimals: 2 },
  { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$', decimals: 2 },
  { code: 'TWD', name: 'New Taiwan Dollar', symbol: 'NT$', decimals: 2 },
  { code: 'MOP', name: 'Macanese Pataca', symbol: 'MOP$', decimals: 2 },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', decimals: 2 },
  { code: 'KRW', name: 'South Korean Won', symbol: '₩', decimals: 0 },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$', decimals: 2 },
  { code: 'PHP', name: 'Philippine Peso', symbol: '₱', decimals: 2 },
  { code: 'VND', name: 'Vietnamese Dong', symbol: '₫', decimals: 0 },
  { code: 'KHR', name: 'Cambodian Riel', symbol: '៛', decimals: 0 },
  { code: 'LAK', name: 'Lao Kip', symbol: '₭', decimals: 0 },
  { code: 'MMK', name: 'Myanmar Kyat', symbol: 'K', decimals: 0 },
  { code: 'BND', name: 'Brunei Dollar', symbol: 'B$', decimals: 2 },
  { code: 'LKR', name: 'Sri Lankan Rupee', symbol: 'Rs', decimals: 2 },
  { code: 'NPR', name: 'Nepalese Rupee', symbol: 'Rs', decimals: 2 },
  { code: 'PKR', name: 'Pakistani Rupee', symbol: 'Rs', decimals: 2 },
  { code: 'BDT', name: 'Bangladeshi Taka', symbol: '৳', decimals: 2 },
  { code: 'AED', name: 'UAE Dirham', symbol: 'AED', decimals: 2 },
  { code: 'SAR', name: 'Saudi Riyal', symbol: 'SAR', decimals: 2 },
  { code: 'QAR', name: 'Qatari Riyal', symbol: 'QAR', decimals: 2 },
  { code: 'KWD', name: 'Kuwaiti Dinar', symbol: 'KD', decimals: 3 },
  { code: 'BHD', name: 'Bahraini Dinar', symbol: 'BD', decimals: 3 },
  { code: 'OMR', name: 'Omani Rial', symbol: 'OMR', decimals: 3 },
  { code: 'JOD', name: 'Jordanian Dinar', symbol: 'JD', decimals: 3 },
  { code: 'ILS', name: 'Israeli Shekel', symbol: '₪', decimals: 2 },
  { code: 'TRY', name: 'Turkish Lira', symbol: '₺', decimals: 2 },
  { code: 'EGP', name: 'Egyptian Pound', symbol: 'E£', decimals: 2 },
  { code: 'MAD', name: 'Moroccan Dirham', symbol: 'MAD', decimals: 2 },
  { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh', decimals: 2 },
  { code: 'NGN', name: 'Nigerian Naira', symbol: '₦', decimals: 2 },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R', decimals: 2 },
  { code: 'MXN', name: 'Mexican Peso', symbol: 'MX$', decimals: 2 },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$', decimals: 2 },
  { code: 'ARS', name: 'Argentine Peso', symbol: 'AR$', decimals: 2 },
  { code: 'CLP', name: 'Chilean Peso', symbol: 'CLP$', decimals: 0 },
  { code: 'COP', name: 'Colombian Peso', symbol: 'COL$', decimals: 0 },
  { code: 'PEN', name: 'Peruvian Sol', symbol: 'S/', decimals: 2 },
  { code: 'SEK', name: 'Swedish Krona', symbol: 'kr', decimals: 2 },
  { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr', decimals: 2 },
  { code: 'DKK', name: 'Danish Krone', symbol: 'kr', decimals: 2 },
  { code: 'ISK', name: 'Icelandic Krona', symbol: 'kr', decimals: 0 },
  { code: 'PLN', name: 'Polish Zloty', symbol: 'zł', decimals: 2 },
  { code: 'CZK', name: 'Czech Koruna', symbol: 'Kč', decimals: 2 },
  { code: 'HUF', name: 'Hungarian Forint', symbol: 'Ft', decimals: 0 },
  { code: 'RON', name: 'Romanian Leu', symbol: 'lei', decimals: 2 },
  { code: 'BGN', name: 'Bulgarian Lev', symbol: 'лв', decimals: 2 },
  { code: 'FJD', name: 'Fijian Dollar', symbol: 'FJ$', decimals: 2 },
]

export const DEFAULT_BASE_CURRENCY = 'IDR'

export const CURRENCY_CODES = CURRENCIES.map((c) => c.code)

const BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]))

export function getCurrency(code: string): CurrencyInfo {
  return BY_CODE.get(code) ?? { code, name: code, symbol: code, decimals: 2 }
}

export function currencyDecimals(code: string): number {
  return getCurrency(code).decimals
}

/**
 * Starter rates: units of USD per 1 unit of the currency.
 * Manual and editable — these are only convenient defaults.
 */
export const USD_RATES: Record<string, number> = {
  USD: 1,
  EUR: 1.08,
  GBP: 1.27,
  IDR: 1 / 16200,
  SGD: 0.74,
  MYR: 0.225,
  THB: 0.029,
  JPY: 0.0067,
  AUD: 0.65,
  CAD: 0.73,
  CHF: 1.12,
  CNY: 0.14,
  HKD: 0.128,
  TWD: 0.031,
  MOP: 0.124,
  INR: 0.012,
  KRW: 0.00072,
  NZD: 0.6,
  PHP: 0.0175,
  VND: 1 / 25500,
  KHR: 1 / 4100,
  LAK: 1 / 21600,
  MMK: 1 / 2100,
  BND: 0.74,
  LKR: 0.0033,
  NPR: 0.0074,
  PKR: 0.0036,
  BDT: 0.0083,
  AED: 0.272,
  SAR: 0.267,
  QAR: 0.275,
  KWD: 3.26,
  BHD: 2.65,
  OMR: 2.6,
  JOD: 1.41,
  ILS: 0.27,
  TRY: 0.029,
  EGP: 0.02,
  MAD: 0.1,
  KES: 0.0077,
  NGN: 0.00062,
  ZAR: 0.055,
  MXN: 0.058,
  BRL: 0.18,
  ARS: 0.0011,
  CLP: 0.00105,
  COP: 0.00024,
  PEN: 0.27,
  SEK: 0.095,
  NOK: 0.092,
  DKK: 0.145,
  ISK: 0.0072,
  PLN: 0.25,
  CZK: 0.043,
  HUF: 0.0027,
  RON: 0.22,
  BGN: 0.55,
  FJD: 0.44,
}

export function ratesForBase(base: string): Record<string, number> {
  const usdPerBase = USD_RATES[base] ?? 1
  const rates: Record<string, number> = {}
  for (const code of Object.keys(USD_RATES)) {
    const usdPerCode = USD_RATES[code] ?? 1
    rates[code] = usdPerCode / usdPerBase
  }
  rates[base] = 1
  return roundRates(rates)
}

export function convertRatesToNewBase(
  rates: Record<string, number>,
  newBase: string,
): Record<string, number> {
  const factor = rates[newBase]
  if (!factor || factor <= 0) {
    return { ...ratesForBase(newBase), ...rates, [newBase]: 1 }
  }
  const next: Record<string, number> = {}
  for (const [code, value] of Object.entries(rates)) {
    next[code] = value / factor
  }
  next[newBase] = 1
  return roundRates(next)
}

function roundRates(rates: Record<string, number>): Record<string, number> {
  const next: Record<string, number> = {}
  for (const [code, value] of Object.entries(rates)) {
    if (!Number.isFinite(value) || value <= 0) continue
    next[code] = Number(value.toPrecision(8))
  }
  return next
}

export async function fetchLiveRates(base: string): Promise<Record<string, number> | null> {
  try {
    const url = `https://api.frankfurter.app/latest?from=${encodeURIComponent(base)}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) return null
    const data = (await res.json()) as { rates?: Record<string, number> }
    if (!data.rates) return null
    const rates: Record<string, number> = { [base]: 1 }
    for (const [code, value] of Object.entries(data.rates)) {
      if (typeof value === 'number' && value > 0) {
        rates[code] = Number((1 / value).toPrecision(8))
      }
    }
    return rates
  } catch {
    return null
  }
}
