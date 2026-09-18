import type { Expense, PersonBalance, Transfer, Trip } from '../types'
import { currencyDecimals } from './currencies'
import {
  equalShares,
  formatMoney,
  fromMinor,
  isSettlement,
  toBaseMinor,
} from './money'
import { uid } from './utils'
import { todayISO } from './dates'

const EPS = 1

type MinorBalance = {
  personId: string
  paid: number
  share: number
  settled: number
  funded: number
  net: number
}

function participantIdsOf(expense: Expense): string[] {
  const ids = expense.participantIds.filter(Boolean)
  if (ids.length > 0) return [...new Set(ids)]
  return expense.paidBy ? [expense.paidBy] : []
}

/** Split `totalMinor` in proportion to `weights`. Last positive-weight person gets the remainder. */
function allocateProportional(ids: string[], weights: Record<string, number>, totalMinor: number): Map<string, number> {
  const out = new Map<string, number>()
  if (ids.length === 0) return out
  const positive = ids.map((id) => ({ id, w: Math.max(0, weights[id] ?? 0) }))
  const weightSum = positive.reduce((sum, row) => sum + row.w, 0)
  if (weightSum <= 0) {
    const n = ids.length
    const base = Math.floor(totalMinor / n)
    let rem = totalMinor - base * n
    ids.forEach((id, i) => out.set(id, base + (i < rem ? 1 : 0)))
    return out
  }
  const remainderId = [...positive].reverse().find((row) => row.w > 0)?.id ?? ids[ids.length - 1]!
  let allocated = 0
  for (const id of ids) {
    if (id === remainderId) continue
    const minor = Math.round(((weights[id] ?? 0) / weightSum) * totalMinor)
    out.set(id, minor)
    allocated += minor
  }
  out.set(remainderId, totalMinor - allocated)
  for (const id of ids) if (!out.has(id)) out.set(id, 0)
  return out
}

function splitWeights(expense: Expense, ids: string[]): Record<string, number> {
  if (expense.splitMode === 'percent' && expense.shares) {
    const out: Record<string, number> = {}
    for (const id of ids) out[id] = Math.max(0, expense.shares[id] ?? 0)
    if (ids.some((id) => out[id]! > 0)) return out
  }
  if (expense.splitMode === 'custom' && expense.shares) {
    const out: Record<string, number> = {}
    for (const id of ids) out[id] = Math.max(0, expense.shares[id] ?? 0)
    if (ids.some((id) => out[id]! > 0)) return out
  }
  const equal = equalShares(expense.amount, ids, expense.currency)
  const out: Record<string, number> = {}
  for (const id of ids) out[id] = equal[id] ?? 0
  return out
}

/**
 * Each participant's portion of a bill, in base-currency minor units.
 * Equal = even split. Custom amounts and percents are taken as weights so each
 * person is billed in proportion to what they have to pay on that bill.
 */
export function expenseShareMinor(trip: Trip, expense: Expense): Map<string, number> {
  const ids = participantIdsOf(expense)
  const totalMinor = toBaseMinor(expense.amount, expense.currency, trip)
  if (ids.length === 0 || totalMinor === 0) return new Map()
  return allocateProportional(ids, splitWeights(expense, ids), totalMinor)
}

export function computeMinorBalances(trip: Trip): MinorBalance[] {
  const paid = new Map<string, number>()
  const share = new Map<string, number>()
  const settled = new Map<string, number>()
  for (const person of trip.people) {
    paid.set(person.id, 0)
    share.set(person.id, 0)
    settled.set(person.id, 0)
  }

  for (const expense of trip.expenses) {
    const totalMinor = toBaseMinor(expense.amount, expense.currency, trip)
    if (isSettlement(trip, expense)) {
      const ids = participantIdsOf(expense)
      const recipients = ids.filter((id) => id !== expense.paidBy)
      const targets = recipients.length > 0 ? recipients : ids
      const portions = expenseShareMinor(trip, { ...expense, participantIds: targets })
      settled.set(expense.paidBy, (settled.get(expense.paidBy) ?? 0) + totalMinor)
      for (const [id, minor] of portions) {
        settled.set(id, (settled.get(id) ?? 0) - minor)
      }
      continue
    }
    paid.set(expense.paidBy, (paid.get(expense.paidBy) ?? 0) + totalMinor)
    for (const [id, minor] of expenseShareMinor(trip, expense)) {
      share.set(id, (share.get(id) ?? 0) + minor)
    }
  }

  return trip.people.map((person) => {
    const p = paid.get(person.id) ?? 0
    const s = share.get(person.id) ?? 0
    const x = settled.get(person.id) ?? 0
    return { personId: person.id, paid: p, share: s, settled: x, funded: p + x, net: p - s + x }
  })
}

export function computeBalances(trip: Trip): PersonBalance[] {
  const decimals = currencyDecimals(trip.baseCurrency)
  return computeMinorBalances(trip).map((b) => ({
    personId: b.personId,
    paid: fromMinor(b.paid, decimals),
    share: fromMinor(b.share, decimals),
    settled: fromMinor(b.settled, decimals),
    funded: fromMinor(b.funded, decimals),
    net: fromMinor(b.net, decimals),
  }))
}

/** Amount this person paid for group purchases — settle-up transfers do not count. */
export function personSpendPaid(trip: Trip, personId: string): number {
  return computeBalances(trip).find((row) => row.personId === personId)?.paid ?? 0
}

/** This person's split of the trip — what they have to pay after equal / custom / percent. */
export function personTripShare(trip: Trip, personId: string): number {
  return computeBalances(trip).find((row) => row.personId === personId)?.share ?? 0
}

/** What they have paid toward the trip after settle-up (cards + transfers). Equals share when settled. */
export function personFunded(trip: Trip, personId: string): number {
  return computeBalances(trip).find((row) => row.personId === personId)?.funded ?? 0
}

export function shareOfTripPercent(share: number, spent: number): number {
  if (spent <= 0) return 0
  return (share / spent) * 100
}

export function formatSharePercent(share: number, spent: number): string {
  const pct = shareOfTripPercent(share, spent)
  const rounded = Math.round(pct * 10) / 10
  return `${Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)}%`
}

export function describeBalance(b: PersonBalance, currency: string): string {
  if (Math.abs(b.net) < 0.005) return 'Settled'
  if (b.net > 0) return `Is owed ${formatMoney(b.net, currency)}`
  return `Owes ${formatMoney(-b.net, currency)}`
}

export function suggestedTransfers(trip: Trip): Transfer[] {
  const decimals = currencyDecimals(trip.baseCurrency)
  const balances = computeMinorBalances(trip)

  const debtors = balances
    .filter((b) => b.net <= -EPS)
    .map((b) => ({ personId: b.personId, remain: -b.net }))
    .sort((a, b) => b.remain - a.remain)
  const creditors = balances
    .filter((b) => b.net >= EPS)
    .map((b) => ({ personId: b.personId, remain: b.net }))
    .sort((a, b) => b.remain - a.remain)

  const transfers: Transfer[] = []

  for (let i = 0; i < debtors.length; i++) {
    const d = debtors[i]
    if (d.remain < EPS) continue
    const exact = creditors.findIndex((c) => c.remain === d.remain && c.remain >= EPS)
    if (exact === -1) continue
    const c = creditors[exact]
    transfers.push({
      fromId: d.personId,
      toId: c.personId,
      amount: fromMinor(d.remain, decimals),
    })
    d.remain = 0
    c.remain = 0
  }

  let di = 0
  let ci = 0
  while (di < debtors.length && ci < creditors.length) {
    const d = debtors[di]
    const c = creditors[ci]
    if (d.remain < EPS) {
      di += 1
      continue
    }
    if (c.remain < EPS) {
      ci += 1
      continue
    }
    const pay = Math.min(d.remain, c.remain)
    transfers.push({
      fromId: d.personId,
      toId: c.personId,
      amount: fromMinor(pay, decimals),
    })
    d.remain -= pay
    c.remain -= pay
  }

  return transfers
}

export function settlementExpense(
  trip: Trip,
  fromId: string,
  toId: string,
  amount: number,
): Expense {
  const settlement =
    trip.categories.find((c) => c.id === 'settlement') ?? trip.categories[0]
  return {
    id: uid(),
    amount,
    currency: trip.baseCurrency,
    paidBy: fromId,
    participantIds: [toId],
    splitMode: 'equal',
    categoryId: settlement.id,
    note: 'Settle up',
    date: todayISO(),
    createdAt: Date.now(),
  }
}
