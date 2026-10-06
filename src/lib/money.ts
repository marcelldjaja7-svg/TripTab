import type { Expense, SplitMode, Trip } from '../types'
import { currencyDecimals } from './currencies'

export function roundTo(amount: number, decimals: number): number {
  const f = 10 ** decimals
  return Math.round((amount + Number.EPSILON) * f) / f
}

export function toMinor(amount: number, decimals: number): number {
  const f = 10 ** decimals
  return Math.round(Number((amount * f).toFixed(8)))
}

export function snapAmount(amount: number, currency: string): number {
  const decimals = currencyDecimals(currency)
  return fromMinor(toMinor(amount, decimals), decimals)
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

export function rateToBase(trip: Pick<Trip, 'baseCurrency' | 'rates'>, currency: string): number | null {
  if (currency === trip.baseCurrency) return 1
  const rate = trip.rates[currency]
  if (typeof rate === 'number' && rate > 0) return rate
  return null
}

/** Locked bill rate, then the trip table. Missing or non-positive is not 1:1. */
export function expenseRate(
  expense: Pick<Expense, 'currency' | 'fxRate'>,
  trip: Pick<Trip, 'baseCurrency' | 'rates'>,
): number | null {
  if (expense.currency === trip.baseCurrency) return 1
  if (typeof expense.fxRate === 'number' && expense.fxRate > 0) return expense.fxRate
  return rateToBase(trip, expense.currency)
}

export function toBase(amount: number, currency: string, trip: Trip): number {
  const rate = rateToBase(trip, currency)
  if (rate == null) return Number.NaN
  return amount * rate
}

export function toBaseMinor(amount: number, currency: string, trip: Trip, expense?: Pick<Expense, 'currency' | 'fxRate'>): number {
  const decimals = currencyDecimals(trip.baseCurrency)
  const rate = expense ? expenseRate(expense, trip) : rateToBase(trip, currency)
  if (rate == null) return Number.NaN
  return toMinor(amount * rate, decimals)
}

export function inverseRate(rate: number): number {
  if (!rate) return 0
  return 1 / rate
}

export function participantIdsOf(expense: Expense): string[] {
  const ids = expense.participantIds.filter(Boolean)
  if (ids.length > 0) return [...new Set(ids)]
  return expense.paidBy ? [expense.paidBy] : []
}

/**
 * Split `totalMinor` in proportion to `weights` (Hamilton / largest remainder).
 * Zero-weight people stay at 0. Leftover cents go to the largest fractional parts.
 */
export function allocateProportional(
  ids: string[],
  weights: Record<string, number>,
  totalMinor: number,
): Map<string, number> {
  const out = new Map<string, number>()
  if (ids.length === 0) return out
  if (totalMinor === 0) {
    for (const id of ids) out.set(id, 0)
    return out
  }
  const ordered = [...ids].sort((a, b) => a.localeCompare(b))
  const rows = ordered.map((id, index) => ({
    id,
    index,
    w: Math.max(0, weights[id] ?? 0),
  }))
  const weightSum = rows.reduce((sum, row) => sum + row.w, 0)
  if (weightSum <= 0) {
    const n = ordered.length
    const base = Math.floor(totalMinor / n)
    let rem = totalMinor - base * n
    ordered.forEach((id, i) => out.set(id, base + (i < rem ? 1 : 0)))
    return out
  }
  const parts = rows.map((row) => {
    const raw = (row.w * totalMinor) / weightSum
    const floor = Math.floor(raw)
    return { ...row, floor, frac: raw - floor }
  })
  let leftover = totalMinor - parts.reduce((sum, row) => sum + row.floor, 0)
  const order = [...parts]
    .filter((row) => row.w > 0)
    .sort((a, b) => b.frac - a.frac || a.index - b.index)
  const extra = new Map<string, number>()
  let i = 0
  while (leftover > 0 && order.length > 0) {
    const row = order[i % order.length]!
    extra.set(row.id, (extra.get(row.id) ?? 0) + 1)
    leftover -= 1
    i += 1
  }
  for (const row of parts) out.set(row.id, row.floor + (extra.get(row.id) ?? 0))
  return out
}

/** Custom amounts and percents are weights. Equal splits use even weights. */
export function splitWeights(expense: Expense, ids: string[]): Record<string, number> {
  if ((expense.splitMode === 'percent' || expense.splitMode === 'custom') && expense.shares) {
    const out: Record<string, number> = {}
    for (const id of ids) out[id] = Math.max(0, expense.shares[id] ?? 0)
    if (ids.some((id) => out[id]! > 0)) return out
  }
  const out: Record<string, number> = {}
  for (const id of ids) out[id] = 1
  return out
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
  const parts = allocateProportional(
    participantIds,
    Object.fromEntries(participantIds.map((id) => [id, 1])),
    totalMinor,
  )
  const out: Record<string, number> = {}
  for (const id of participantIds) out[id] = fromMinor(parts.get(id) ?? 0, decimals)
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
  const parts = allocateProportional(participantIds, percents, totalMinor)
  const out: Record<string, number> = {}
  for (const id of participantIds) out[id] = fromMinor(parts.get(id) ?? 0, decimals)
  return out
}

export function expenseShares(expense: Expense): Record<string, number> {
  const ids = participantIdsOf(expense)
  const decimals = currencyDecimals(expense.currency)
  const parts = allocateProportional(ids, splitWeights(expense, ids), toMinor(expense.amount, decimals))
  const out: Record<string, number> = {}
  for (const id of ids) out[id] = fromMinor(parts.get(id) ?? 0, decimals)
  return out
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
    const part = toBaseMinor(expense.amount, expense.currency, trip, expense)
    if (Number.isFinite(part)) minor += part
  }
  return fromMinor(minor, decimals)
}

export function convertedLabel(trip: Trip, amount: number, currency: string): string {
  const converted = toBase(amount, currency, trip)
  if (!Number.isFinite(converted)) return `Need ${currency} rate`
  const decimals = currencyDecimals(trip.baseCurrency)
  return formatMoney(roundTo(converted, decimals), trip.baseCurrency)
}

export function hasNegativeShares(expense: Expense): boolean {
  if (!expense.shares || (expense.splitMode !== 'custom' && expense.splitMode !== 'percent')) return false
  return participantIdsOf(expense).some((id) => (expense.shares?.[id] ?? 0) < 0)
}

export function hasAllZeroShares(expense: Expense): boolean {
  if (expense.splitMode !== 'custom' && expense.splitMode !== 'percent') return false
  if (!expense.shares) return false
  const ids = participantIdsOf(expense)
  if (ids.length === 0) return true
  return ids.every((id) => (expense.shares?.[id] ?? 0) <= 0)
}

export function equalShareCaption(amount: number, participantIds: string[], currency: string): string {
  const shares = equalShares(amount, participantIds, currency)
  const values = participantIds.map((id) => shares[id] ?? 0)
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (min === max) return `${formatMoney(min, currency)} each`
  return `${formatMoney(max, currency)} or ${formatMoney(min, currency)}`
}

export function splitLabel(mode: SplitMode, included: number, totalPeople: number): string {
  const who = included === totalPeople ? `${included} ways` : `${included} of ${totalPeople}`
  if (mode === 'custom') return `unequal · ${who}`
  if (mode === 'percent') return `% split · ${who}`
  return who
}
