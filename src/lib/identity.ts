const KEY = 'triptab.me.'

export function loadMyPersonId(tripId: string): string | null {
  try {
    const id = localStorage.getItem(KEY + tripId)
    return id && id.length > 0 ? id : null
  } catch {
    return null
  }
}

export function saveMyPersonId(tripId: string, personId: string): void {
  try {
    if (!personId) localStorage.removeItem(KEY + tripId)
    else localStorage.setItem(KEY + tripId, personId)
  } catch {
    /* private mode */
  }
}

export function stampTripAuthor<T extends { id: string; people: { id: string; name: string }[] }>(
  trip: T,
): T & { updatedAt: number; updatedBy?: string; updatedByName?: string } {
  const me = loadMyPersonId(trip.id)
  const person = trip.people.find((p) => p.id === me) ?? trip.people[0]
  return {
    ...trip,
    updatedAt: Date.now(),
    updatedBy: person?.id,
    updatedByName: person?.name.trim() || 'Someone',
  }
}
