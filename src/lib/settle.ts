import type { Expense, PersonBalance, Transfer, Trip } from '../types'
import { currencyDecimals } from './currencies'
import {
  equalShares,
  expenseShares,
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
  net: number
}

function participantIdsOf(expense: Expense): string[] {
  const ids = expense.participantIds.filter(Boolean)
  if (ids.length > 0) return [...new Set(ids)]
  return expense.paidBy ? [expense.paidBy] : []
}

/** Each participant's portion of a bill, in base-currency minor units. Honors equal / custom / percent. */
export function expenseShareMinor(trip: Trip, expense: Expense): Map<string, number> {
  const ids = participantIdsOf(expense)
  const totalMinor = toBaseMinor(expense.amount, expense.currency, trip)
  const out = new Map<string, number>()
  if (ids.length === 0 || totalMinor === 0) return out

  let parts = expenseShares({ ...expense, participantIds: ids })
  let partSum = Object.values(parts).reduce((sum, n) => sum + n, 0)
  if (partSum <= 0) {
    parts = equalShares(expense.amount, ids, expense.currency)
    partSum = Object.values(parts).reduce((sum, n) => sum + n, 0)
  }
  if (partSum <= 0) {
    out.set(ids[0]!, totalMinor)
    return out
  }

  let allocated = 0
  ids.forEach((id, index) => {
    const last = index === ids.length - 1
    const minor = last ? totalMinor - allocated : Math.round(((parts[id] ?? 0) / partSum) * totalMinor)
    if (!last) allocated += minor
    out.set(id, minor)
  })
  return out
}

export function computeMinorBalances(trip: Trip): MinorBalance[] {
  const paid = new Map<string, number>()
  const share = new Map<string, number>()
  const settleAdj = new Map<string, number>()
  for (const person of trip.people) {
    paid.set(person.id, 0)
    share.set(person.id, 0)
    settleAdj.set(person.id, 0)
  }

  for (const expense of trip.expenses) {
    const totalMinor = toBaseMinor(expense.amount, expense.currency, trip)
    const portions = expenseShareMinor(trip, expense)
    if (isSettlement(trip, expense)) {
      settleAdj.set(expense.paidBy, (settleAdj.get(expense.paidBy) ?? 0) + totalMinor)
      for (const [id, minor] of portions) {
        settleAdj.set(id, (settleAdj.get(id) ?? 0) - minor)
      }
      continue
    }
    paid.set(expense.paidBy, (paid.get(expense.paidBy) ?? 0) + totalMinor)
    for (const [id, minor] of portions) {
      share.set(id, (share.get(id) ?? 0) + minor)
    }
  }

  return trip.people.map((person) => {
    const p = paid.get(person.id) ?? 0
    const s = share.get(person.id) ?? 0
    const adj = settleAdj.get(person.id) ?? 0
    return { personId: person.id, paid: p, share: s, net: p - s + adj }
  })
}

export function computeBalances(trip: Trip): PersonBalance[] {
  const decimals = currencyDecimals(trip.baseCurrency)
  return computeMinorBalances(trip).map((b) => ({
    personId: b.personId,
    paid: fromMinor(b.paid, decimals),
    share: fromMinor(b.share, decimals),
    net: fromMinor(b.net, decimals),
  }))
}

/** Amount this person paid for group purchases — settle-up transfers do not count. */
export function personSpendPaid(trip: Trip, personId: string): number {
  return computeBalances(trip).find((row) => row.personId === personId)?.paid ?? 0
}

/** This person's split of the trip (equal / custom / percent). After settle-up, that is what they paid toward. */
export function personTripShare(trip: Trip, personId: string): number {
  return computeBalances(trip).find((row) => row.personId === personId)?.share ?? 0
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
