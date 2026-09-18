import type { Expense, SplitMode, Trip } from '../types'
import { currencyDecimals } from './currencies'

export function roundTo(amount: number, decimals: number): number {
  const f = 10 ** decimals
  return Math.round((amount + Number.EPSILON) * f) / f
}

export function toMinor(amount: number, decimals: number): number {
  return Math.round(amount * 10 ** decimals)
}

export function fromMinor(minor: number, decimals: number): number {
  return minor / 10 ** decimals
}

export function formatMoney(amount: number, currency: string): string {
  const decimals = currencyDecimals(currency)
  const locale = currency === 'IDR' ? 'id-ID' : 'en-US'
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount)
  } catch {
    const abs = roundTo(amount, decimals).toFixed(decimals)
    return `${currency} ${abs}`
  }
}

export function formatCompact(amount: number, currency: string): string {
  const decimals = currencyDecimals(currency)
  const n = roundTo(amount, decimals)
  try {
    const nf = new Intl.NumberFormat(currency === 'IDR' ? 'id-ID' : 'en-US', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
    return nf.format(n)
  } catch {
    return `${n.toFixed(decimals)} ${currency}`
  }
}

export function rateToBase(trip: Trip, currency: string): number {
  if (currency === trip.baseCurrency) return 1
  const rate = trip.rates[currency]
  if (typeof rate === 'number' && rate > 0) return rate
  return 1
}

export function toBase(amount: number, currency: string, trip: Trip): number {
  return amount * rateToBase(trip, currency)
}

export function toBaseMinor(amount: number, currency: string, trip: Trip): number {
  const decimals = currencyDecimals(trip.baseCurrency)
  return toMinor(toBase(amount, currency, trip), decimals)
}

export function inverseRate(rate: number): number {
  if (!rate) return 0
  return 1 / rate
}

export function equalShares(
  amount: number,
  participantIds: string[],
  currency: string,
): Record<string, number> {
  const n = participantIds.length
  if (n === 0) return {}
  const decimals = currencyDecimals(currency)
  const totalMinor = toMinor(amount, decimals)
  const base = Math.floor(totalMinor / n)
  let rem = totalMinor - base * n
  const out: Record<string, number> = {}
  participantIds.forEach((id, i) => {
    const minor = base + (i < rem ? 1 : 0)
    out[id] = fromMinor(minor, decimals)
  })
  return out
}

/** Percentages that sum to 100.00, remainder in hundredths. */
export function equalPercents(participantIds: string[]): Record<string, number> {
  const n = participantIds.length
  if (n === 0) return {}
  const totalMinor = 10_000
  const base = Math.floor(totalMinor / n)
  let rem = totalMinor - base * n
  const out: Record<string, number> = {}
  participantIds.forEach((id, i) => {
    out[id] = fromMinor(base + (i < rem ? 1 : 0), 2)
  })
  return out
}

export function percentsMatch100(percents: Record<string, number>, participantIds: string[]): boolean {
  const sum = participantIds.reduce((s, id) => s + toMinor(percents[id] ?? 0, 2), 0)
  return sum === 10_000
}

export function percentToAmounts(
  amount: number,
  percents: Record<string, number>,
  participantIds: string[],
  currency: string,
): Record<string, number> {
  const decimals = currencyDecimals(currency)
  const totalMinor = toMinor(amount, decimals)
  let allocated = 0
  const out: Record<string, number> = {}
  participantIds.forEach((id, index) => {
    const last = index === participantIds.length - 1
    const pct = percents[id] ?? 0
    let minor: number
    if (last) {
      minor = totalMinor - allocated
    } else {
      minor = Math.round((pct / 100) * totalMinor)
      allocated += minor
    }
    out[id] = fromMinor(minor, decimals)
  })
  return out
}

export function expenseShares(expense: Expense): Record<string, number> {
  if (expense.splitMode === 'custom' && expense.shares) {
    const out: Record<string, number> = {}
    for (const id of expense.participantIds) {
      out[id] = expense.shares[id] ?? 0
    }
    return out
  }
  if (expense.splitMode === 'percent' && expense.shares) {
    return percentToAmounts(expense.amount, expense.shares, expense.participantIds, expense.currency)
  }
  return equalShares(expense.amount, expense.participantIds, expense.currency)
}

export function sharesSum(shares: Record<string, number>): number {
  return Object.values(shares).reduce((s, n) => s + n, 0)
}

export function sharesMatchTotal(
  shares: Record<string, number>,
  total: number,
  currency: string,
): boolean {
  const decimals = currencyDecimals(currency)
  return toMinor(sharesSum(shares), decimals) === toMinor(total, decimals)
}

export function isSettlement(trip: Trip, expense: Expense): boolean {
  const cat = trip.categories.find((c) => c.id === expense.categoryId)
  return cat?.id === 'settlement' || cat?.name.toLowerCase() === 'settle up'
}

/** Trip purchases only — settle-up payments are transfers, not spend. */
export function tripBillExpenses(trip: Trip, expenses: Expense[] = trip.expenses): Expense[] {
  return expenses.filter((expense) => !isSettlement(trip, expense))
}

export function tripPaymentExpenses(trip: Trip, expenses: Expense[] = trip.expenses): Expense[] {
  return expenses.filter((expense) => isSettlement(trip, expense))
}

export function tripBillCount(trip: Trip, expenses: Expense[] = trip.expenses): number {
  return tripBillExpenses(trip, expenses).length
}

export function tripTotalBase(trip: Trip, expenses: Expense[] = trip.expenses): number {
  const decimals = currencyDecimals(trip.baseCurrency)
  let minor = 0
  for (const expense of tripBillExpenses(trip, expenses)) {
    minor += toBaseMinor(expense.amount, expense.currency, trip)
  }
  return fromMinor(minor, decimals)
}

export function convertedLabel(trip: Trip, amount: number, currency: string): string {
  const decimals = currencyDecimals(trip.baseCurrency)
  return formatMoney(roundTo(toBase(amount, currency, trip), decimals), trip.baseCurrency)
}

export function splitLabel(mode: SplitMode, included: number, totalPeople: number): string {
  const who = included === totalPeople ? `${included} ways` : `${included} of ${totalPeople}`
  if (mode === 'custom') return `unequal · ${who}`
  if (mode === 'percent') return `% split · ${who}`
  return who
}
