import type { Expense, PersonBalance, Transfer, Trip } from '../types'
import { currencyDecimals } from './currencies'
import { expenseShares, fromMinor, isSettlement, toBaseMinor } from './money'
import { uid } from './utils'
import { todayISO } from './dates'

const EPS = 1

type MinorBalance = {
  personId: string
  paid: number
  share: number
  net: number
}

export function computeMinorBalances(trip: Trip): MinorBalance[] {
  const paid = new Map<string, number>()
  const share = new Map<string, number>()
  for (const person of trip.people) {
    paid.set(person.id, 0)
    share.set(person.id, 0)
  }

  for (const expense of trip.expenses) {
    const totalMinor = toBaseMinor(expense.amount, expense.currency, trip)
    paid.set(expense.paidBy, (paid.get(expense.paidBy) ?? 0) + totalMinor)

    const parts = expenseShares(expense)
    const partSum = Object.values(parts).reduce((s, n) => s + n, 0)
    if (partSum <= 0 || expense.participantIds.length === 0) continue

    let allocated = 0
    expense.participantIds.forEach((id, index) => {
      const last = index === expense.participantIds.length - 1
      let minor: number
      if (last) {
        minor = totalMinor - allocated
      } else {
        minor = Math.round((parts[id] / partSum) * totalMinor)
        allocated += minor
      }
      share.set(id, (share.get(id) ?? 0) + minor)
    })
  }

  return trip.people.map((person) => {
    const p = paid.get(person.id) ?? 0
    const s = share.get(person.id) ?? 0
    return { personId: person.id, paid: p, share: s, net: p - s }
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
  const decimals = currencyDecimals(trip.baseCurrency)
  let minor = 0
  for (const expense of trip.expenses) {
    if (expense.paidBy !== personId || isSettlement(trip, expense)) continue
    minor += toBaseMinor(expense.amount, expense.currency, trip)
  }
  return fromMinor(minor, decimals)
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
