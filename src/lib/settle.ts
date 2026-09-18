import type { Expense, PersonBalance, Transfer, Trip } from '../types'
import { currencyDecimals } from './currencies'
import {
  equalShares,
  formatMoney,
  fromMinor,
  isSettlement,
  percentToAmounts,
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
  net: number
}

function participantIdsOf(expense: Expense): string[] {
  const ids = expense.participantIds.filter(Boolean)
  if (ids.length > 0) return [...new Set(ids)]
  return expense.paidBy ? [expense.paidBy] : []
}

/** Split `totalMinor` across `ids` using `weights` (0+). Last positive-weight person gets the remainder. */
function allocateMinor(ids: string[], weights: Record<string, number>, totalMinor: number): Map<string, number> {
  const out = new Map<string, number>()
  if (ids.length === 0) return out
  const weightSum = ids.reduce((sum, id) => sum + Math.max(0, weights[id] ?? 0), 0)
  if (weightSum <= 0) {
    const n = ids.length
    const base = Math.floor(totalMinor / n)
    let rem = totalMinor - base * n
    ids.forEach((id, i) => out.set(id, base + (i < rem ? 1 : 0)))
    return out
  }
  const remainderId = [...ids].reverse().find((id) => (weights[id] ?? 0) > 0) ?? ids[ids.length - 1]!
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

function weightsFromAmounts(ids: string[], amounts: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const id of ids) out[id] = Math.max(0, amounts[id] ?? 0)
  return out
}

/**
 * Each participant's portion of a bill, in base-currency minor units.
 * Equal / custom amounts / percent. Personal bills (only the payer) stay 100% theirs.
 */
export function expenseShareMinor(trip: Trip, expense: Expense): Map<string, number> {
  const ids = participantIdsOf(expense)
  const totalMinor = toBaseMinor(expense.amount, expense.currency, trip)
  if (ids.length === 0 || totalMinor === 0) return new Map()

  if (expense.splitMode === 'custom') {
    const custom: Record<string, number> = {}
    let sum = 0
    for (const id of ids) {
      const n = expense.shares?.[id] ?? 0
      custom[id] = n
      sum += n
    }
    if (sum > 0) {
      const asMinor: Record<string, number> = {}
      for (const id of ids) asMinor[id] = toBaseMinor(custom[id] ?? 0, expense.currency, trip)
      const minorSum = ids.reduce((s, id) => s + asMinor[id]!, 0)
      if (minorSum === totalMinor) {
        return new Map(ids.map((id) => [id, asMinor[id]!]))
      }
      return allocateMinor(ids, asMinor, totalMinor)
    }
  }

  if (expense.splitMode === 'percent' && expense.shares) {
    const amounts = percentToAmounts(expense.amount, expense.shares, ids, expense.currency)
    return allocateMinor(ids, weightsFromAmounts(ids, amounts), totalMinor)
  }

  const equal = equalShares(expense.amount, ids, expense.currency)
  return allocateMinor(ids, weightsFromAmounts(ids, equal), totalMinor)
}

/** Base-currency share of one bill for every participant. */
export function expenseShareBase(trip: Trip, expense: Expense): Record<string, number> {
  const decimals = currencyDecimals(trip.baseCurrency)
  const out: Record<string, number> = {}
  for (const [id, minor] of expenseShareMinor(trip, expense)) {
    out[id] = fromMinor(minor, decimals)
  }
  return out
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
    return { personId: person.id, paid: p, share: s, settled: x, net: p - s + x }
  })
}

export function computeBalances(trip: Trip): PersonBalance[] {
  const decimals = currencyDecimals(trip.baseCurrency)
  return computeMinorBalances(trip).map((b) => ({
    personId: b.personId,
    paid: fromMinor(b.paid, decimals),
    share: fromMinor(b.share, decimals),
    settled: fromMinor(b.settled, decimals),
    net: fromMinor(b.net, decimals),
  }))
}

/** Amount this person paid for group purchases — settle-up transfers do not count. */
export function personSpendPaid(trip: Trip, personId: string): number {
  return computeBalances(trip).find((row) => row.personId === personId)?.paid ?? 0
}

/** This person's split of trip purchases (equal / custom / percent). */
export function personTripShare(trip: Trip, personId: string): number {
  return computeBalances(trip).find((row) => row.personId === personId)?.share ?? 0
}

export function describeBalance(b: PersonBalance, currency: string): string {
  if (Math.abs(b.net) < 0.005) return 'Settled'
  if (b.net > 0) return `Is owed ${formatMoney(b.net, currency)}`
  return `Owes ${formatMoney(-b.net, currency)}`
}

export function describeSettled(b: PersonBalance, currency: string): string | null {
  if (Math.abs(b.settled) < 0.005) return null
  if (b.settled > 0) return `Logged ${formatMoney(b.settled, currency)} settle-up`
  return `Received ${formatMoney(-b.settled, currency)} settle-up`
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
