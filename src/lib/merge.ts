import type { Trip } from '../types'

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

/** Union two copies of a live trip so 12-bill and 43-bill phones converge. */
export function mergeTrips(local: Trip, remote: Trip): Trip {
  const newer = versionSource(local, remote)
  const older = newer === local ? remote : local
  const deleted = new Set([...(local.deletedExpenseIds ?? []), ...(remote.deletedExpenseIds ?? [])])

  const expenses = byId(local.expenses)
  for (const expense of remote.expenses) {
    const prev = expenses.get(expense.id)
    if (!prev) {
      expenses.set(expense.id, expense)
      continue
    }
    const prevAt = prev.updatedAt ?? prev.createdAt
    const nextAt = expense.updatedAt ?? expense.createdAt
    expenses.set(expense.id, nextAt >= prevAt ? expense : prev)
  }
  for (const id of deleted) expenses.delete(id)

  const people = byId(older.people)
  for (const person of newer.people) people.set(person.id, person)

  const categories = byId(older.categories)
  for (const category of newer.categories) categories.set(category.id, category)

  const logAt = Math.max(latestLogAt(local), latestLogAt(remote))

  return {
    ...newer,
    shareId: local.shareId || remote.shareId,
    people: [...people.values()],
    categories: [...categories.values()],
    expenses: [...expenses.values()].sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id)),
    rates: { ...older.rates, ...newer.rates, [newer.baseCurrency]: 1 },
    deletedExpenseIds: [...deleted],
    isDemo: false,
    updatedAt: logAt || Math.max(local.updatedAt, remote.updatedAt),
    updatedBy: newer.updatedBy,
    updatedByName: newer.updatedByName,
  }
}

export function tripFingerprint(trip: Trip): string {
  return [
    trip.updatedAt,
    trip.name,
    trip.people.map((p) => `${p.id}:${p.name}`).join(','),
    trip.expenses.map((e) => `${e.id}:${e.updatedAt ?? e.createdAt}:${e.amount}`).join(','),
    (trip.deletedExpenseIds ?? []).join(','),
  ].join('|')
}

/** Bills, people, and deletes — ignores republish clocks so stale phones do not re-push. */
export function liveContentKey(trip: Trip): string {
  return [
    trip.name,
    trip.emoji,
    trip.startDate,
    trip.endDate,
    trip.baseCurrency,
    [...trip.people]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((p) => `${p.id}:${p.name}`)
      .join(','),
    [...trip.expenses]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((e) => `${e.id}:${e.updatedAt ?? e.createdAt}:${e.amount}:${e.note}`)
      .join(','),
    [...(trip.deletedExpenseIds ?? [])].sort().join(','),
  ].join('|')
}

export function shouldPublishLive(local: Trip, remote: Trip | null): boolean {
  if (!remote) return local.expenses.length > 0
  return liveContentKey(mergeTrips(local, remote)) !== liveContentKey(remote)
}
