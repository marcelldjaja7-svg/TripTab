import type { Category, Expense, Person, Trip } from '../types'

function byId<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]))
}

/** Timestamp of the most recently logged or edited bill. */
export function latestLogAt(trip: Trip): number {
  let max = 0
  for (const expense of trip.expenses) {
    const at = expense.updatedAt ?? expense.createdAt
    if (at > max) max = at
  }
  return max
}

function versionSource(local: Trip, remote: Trip): Trip {
  const localLog = latestLogAt(local)
  const remoteLog = latestLogAt(remote)
  if (localLog !== remoteLog) return localLog > remoteLog ? local : remote
  return local.updatedAt >= remote.updatedAt ? local : remote
}

function maxRateClock(trip: Trip): number {
  return Math.max(0, ...Object.values(trip.rateTouchedAt ?? {}))
}

/** Bill + rate/base/category clocks — never a stale header updatedAt. */
function mergeUpdatedAt(local: Trip, remote: Trip, logAt: number): number {
  const meta = Math.max(
    logAt,
    maxRateClock(local),
    maxRateClock(remote),
    local.baseUpdatedAt ?? 0,
    remote.baseUpdatedAt ?? 0,
    local.categoriesUpdatedAt ?? 0,
    remote.categoriesUpdatedAt ?? 0,
  )
  return meta || Math.max(local.updatedAt, remote.updatedAt)
}

/** Union two copies of a live trip so 12-bill and 43-bill phones converge. */
export function mergeTrips(local: Trip, remote: Trip): Trip {
  const newer = versionSource(local, remote)
  const deleted = new Set([...(local.deletedExpenseIds ?? []), ...(remote.deletedExpenseIds ?? [])])

  const expenses = byId(local.expenses)
  for (const expense of remote.expenses) {
    const prev = expenses.get(expense.id)
    if (!prev) {
      expenses.set(expense.id, expense)
      continue
    }
    expenses.set(expense.id, mergeExpense(prev, expense))
  }
  for (const id of deleted) expenses.delete(id)
  const expenseList = [...expenses.values()].sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))

  const deletedPeople = new Set([...(local.deletedPersonIds ?? []), ...(remote.deletedPersonIds ?? [])])
  const people = mergePeople(local.people, remote.people, deletedPeople, expenseList)

  const { baseCurrency, baseUpdatedAt } = pickBase(local, remote)
  const { categories, categoriesUpdatedAt } = pickCategories(local, remote)
  const logAt = Math.max(latestLogAt(local), latestLogAt(remote))

  return {
    ...newer,
    shareId: local.shareId || remote.shareId,
    people,
    categories,
    expenses: expenseList,
    baseCurrency,
    baseUpdatedAt,
    categoriesUpdatedAt,
    ...mergeRateTables(local, remote, baseCurrency),
    deletedExpenseIds: [...deleted],
    deletedPersonIds: [...deletedPeople],
    isDemo: false,
    updatedAt: mergeUpdatedAt(local, remote, logAt),
    updatedBy: newer.updatedBy,
    updatedByName: newer.updatedByName,
  }
}

function rateClock(trip: Trip, code: string): number {
  return trip.rateTouchedAt?.[code] ?? 0
}

function mergeRateTables(
  local: Trip,
  remote: Trip,
  baseCurrency: string,
): { rates: Record<string, number>; rateTouchedAt?: Record<string, number> } {
  const codes = new Set([...Object.keys(local.rates), ...Object.keys(remote.rates)])
  const rates: Record<string, number> = {}
  const rateTouchedAt: Record<string, number> = {}
  for (const code of codes) {
    const localAt = rateClock(local, code)
    const remoteAt = rateClock(remote, code)
    const localVal = local.rates[code]
    const remoteVal = remote.rates[code]
    let value: number | undefined
    if (localAt !== remoteAt) {
      value = localAt > remoteAt ? localVal : remoteVal
    } else if (typeof localVal === 'number' && typeof remoteVal === 'number') {
      value = localVal >= remoteVal ? localVal : remoteVal
    } else {
      value = typeof localVal === 'number' ? localVal : remoteVal
    }
    const touched = Math.max(localAt, remoteAt)
    if (typeof value === 'number' && value > 0) rates[code] = value
    if (touched > 0) rateTouchedAt[code] = touched
  }
  rates[baseCurrency] = 1
  return { rates, rateTouchedAt: Object.keys(rateTouchedAt).length ? rateTouchedAt : undefined }
}

function pickBase(local: Trip, remote: Trip): { baseCurrency: string; baseUpdatedAt?: number } {
  const leftAt = local.baseUpdatedAt ?? 0
  const rightAt = remote.baseUpdatedAt ?? 0
  const winner = leftAt !== rightAt ? (leftAt > rightAt ? local : remote) : local.baseCurrency >= remote.baseCurrency ? local : remote
  const at = Math.max(leftAt, rightAt)
  return { baseCurrency: winner.baseCurrency, baseUpdatedAt: at || undefined }
}

function categoryKey(categories: Category[]): string {
  return [...categories]
    .map((c) => `${c.id}:${c.name}:${c.emoji}`)
    .sort()
    .join(',')
}

function pickCategories(local: Trip, remote: Trip): { categories: Category[]; categoriesUpdatedAt?: number } {
  const leftAt = local.categoriesUpdatedAt ?? 0
  const rightAt = remote.categoriesUpdatedAt ?? 0
  const winner =
    leftAt !== rightAt
      ? leftAt > rightAt
        ? local
        : remote
      : categoryKey(local.categories) >= categoryKey(remote.categories)
        ? local
        : remote
  const at = Math.max(leftAt, rightAt)
  return { categories: winner.categories, categoriesUpdatedAt: at || undefined }
}

function expenseTieKey(expense: Expense): string {
  return [
    expense.amount,
    expense.currency,
    expense.paidBy,
    expense.splitMode,
    expense.note,
    JSON.stringify(expense.shares ?? {}),
    [...expense.participantIds].sort().join('+'),
    expense.fxRate ?? '',
    expense.categoryId,
    expense.date,
    lineKey(expense.lineItems),
  ].join('|')
}

/** Newer rev/clock wins scalars; equal clocks pick a stable content key so phones do not swap. */
function mergeExpense(left: Expense, right: Expense): Expense {
  const leftRev = left.rev ?? 0
  const rightRev = right.rev ?? 0
  const leftAt = left.updatedAt ?? left.createdAt
  const rightAt = right.updatedAt ?? right.createdAt
  let newer: Expense
  if (leftRev !== rightRev) newer = leftRev > rightRev ? left : right
  else if (leftAt !== rightAt) newer = leftAt > rightAt ? left : right
  else newer = expenseTieKey(left) >= expenseTieKey(right) ? left : right
  const older = newer === left ? right : left
  const merged = { ...newer }
  if (!merged.lineItems?.length && older.lineItems?.length) merged.lineItems = older.lineItems
  if (merged.fxRate == null && older.fxRate != null) merged.fxRate = older.fxRate
  return merged
}

/** Apply a local save onto the latest trip so a stale screen cannot drop a bill that just synced in. */
export function applyTripSave(prev: Trip, next: Trip): Trip {
  const merged = mergeTrips(prev, next)
  const { baseCurrency, baseUpdatedAt } = pickBase(prev, next)
  const { categories, categoriesUpdatedAt } = pickCategories(prev, next)
  return {
    ...merged,
    name: next.name,
    emoji: next.emoji,
    startDate: next.startDate,
    endDate: next.endDate,
    destinationId: next.destinationId,
    baseCurrency,
    categories,
    baseUpdatedAt,
    categoriesUpdatedAt,
    updatedAt: Math.max(next.updatedAt, merged.updatedAt),
    updatedBy: next.updatedBy,
    updatedByName: next.updatedByName,
    ...mergeRateTables(prev, next, baseCurrency),
  }
}

function personOnBills(id: string, expenses: Expense[]): boolean {
  return expenses.some((expense) => expense.paidBy === id || expense.participantIds.includes(id))
}

function personTieKey(person: Person): string {
  return `${person.name}:${person.color}`
}

function mergePeople(local: Person[], remote: Person[], deleted: Set<string>, expenses: Expense[]): Person[] {
  const people = byId(local)
  for (const person of remote) {
    const prev = people.get(person.id)
    if (!prev) {
      people.set(person.id, person)
      continue
    }
    const prevAt = prev.updatedAt ?? 0
    const nextAt = person.updatedAt ?? 0
    if (nextAt !== prevAt) {
      people.set(person.id, nextAt > prevAt ? person : prev)
      continue
    }
    people.set(person.id, personTieKey(prev) >= personTieKey(person) ? prev : person)
  }
  for (const id of deleted) {
    if (personOnBills(id, expenses)) continue
    people.delete(id)
  }
  return [...people.values()].sort((a, b) => a.id.localeCompare(b.id))
}

export function tripFingerprint(trip: Trip): string {
  return [
    trip.updatedAt,
    trip.name,
    trip.people.map((p) => `${p.id}:${p.name}:${p.color}:${p.updatedAt ?? 0}`).join(','),
    trip.expenses
      .map(
        (e) =>
          `${e.id}:${e.updatedAt ?? e.createdAt}:${e.rev ?? 0}:${e.amount}:${e.currency}:${e.paidBy}:${e.splitMode}:${e.note}:${JSON.stringify(e.shares ?? {})}:${e.participantIds.slice().sort().join('+')}:${e.fxRate ?? ''}:${lineKey(e.lineItems)}`,
      )
      .join(','),
    trip.baseCurrency,
    Object.entries(trip.rates)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([code, rate]) => `${code}:${rate}`)
      .join(','),
    (trip.deletedExpenseIds ?? []).join(','),
    (trip.deletedPersonIds ?? []).join(','),
  ].join('|')
}

function lineKey(items: { name: string; amount: number }[] | undefined): string {
  if (!items?.length) return ''
  return items.map((item) => `${item.name}:${item.amount}`).join(';')
}

/** Bills, people, rates, and deletes — ignores republish clocks so stale phones do not re-push. */
export function liveContentKey(trip: Trip): string {
  return [
    trip.name,
    trip.emoji,
    trip.startDate,
    trip.endDate,
    trip.baseCurrency,
    [...trip.people]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((p) => `${p.id}:${p.name}:${p.color}:${p.updatedAt ?? 0}`)
      .join(','),
    [...trip.expenses]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(
        (e) =>
          `${e.id}:${e.updatedAt ?? e.createdAt}:${e.rev ?? 0}:${e.amount}:${e.currency}:${e.paidBy}:${e.splitMode}:${e.note}:${JSON.stringify(e.shares ?? {})}:${e.participantIds.slice().sort().join('+')}:${e.fxRate ?? ''}:${lineKey(e.lineItems)}`,
      )
      .join(','),
    Object.entries(trip.rates)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([code, rate]) => `${code}:${rate}`)
      .join(','),
    [...trip.categories]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((c) => `${c.id}:${c.name}:${c.emoji}`)
      .join(','),
    [...(trip.deletedExpenseIds ?? [])].sort().join(','),
    [...(trip.deletedPersonIds ?? [])].sort().join(','),
  ].join('|')
}

export function shouldPublishLive(local: Trip, remote: Trip | null): boolean {
  if (!remote) return local.expenses.length > 0
  return liveContentKey(mergeTrips(local, remote)) !== liveContentKey(remote)
}
