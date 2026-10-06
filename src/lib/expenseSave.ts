import type { Expense, Trip } from '../types'

/**
 * Add or update a bill. Re-saving never writes trip.rates or bumps a rate clock —
 * a locked dinner at 105 must not snap the trip JPY rate back from 110.
 */
export function applyExpenseSave(
  trip: Trip,
  expense: Expense,
  publishedRate?: { currency: string; rate: number },
): Trip {
  const exists = trip.expenses.find((row) => row.id === expense.id)
  const sameCurrencyLock =
    exists && exists.currency === expense.currency && typeof exists.fxRate === 'number' && exists.fxRate > 0
      ? exists.fxRate
      : undefined
  const incoming = expense.fxRate
  const published = publishedRate && publishedRate.rate > 0 ? publishedRate.rate : undefined
  const table = expense.currency === trip.baseCurrency ? 1 : trip.rates[expense.currency]
  const fxRate = sameCurrencyLock ?? (typeof incoming === 'number' && incoming > 0 ? incoming : published ?? table)
  const stamped: Expense = {
    ...expense,
    updatedAt: Date.now(),
    rev: (exists?.rev ?? 0) + 1,
    fxRate: typeof fxRate === 'number' && fxRate > 0 ? fxRate : undefined,
  }

  const writeTripRate = !exists && publishedRate && publishedRate.rate > 0 && publishedRate.currency !== trip.baseCurrency
  return {
    ...trip,
    rates: writeTripRate ? { ...trip.rates, [publishedRate.currency]: publishedRate.rate } : trip.rates,
    rateTouchedAt: writeTripRate
      ? { ...trip.rateTouchedAt, [publishedRate.currency]: Date.now() }
      : trip.rateTouchedAt,
    expenses: exists ? trip.expenses.map((row) => (row.id === expense.id ? stamped : row)) : [stamped, ...trip.expenses],
  }
}
