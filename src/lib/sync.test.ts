import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Expense, Trip } from '../types'
import { defaultCategories } from './demo'
import { encodeTripShare } from './share'
import { adoptSharedTrip, mergeTrips, pullLiveTrip, shouldPublishLive } from './sync'

function trip(over: Partial<Trip> & Pick<Trip, 'people' | 'expenses'>): Trip {
  return {
    id: 't',
    name: 'Test',
    emoji: '✈️',
    startDate: '',
    endDate: '',
    baseCurrency: 'IDR',
    categories: defaultCategories(),
    rates: { IDR: 1, USD: 16200 },
    createdAt: 1,
    updatedAt: 1,
    ...over,
  }
}

function expense(over: Partial<Expense> & Pick<Expense, 'id' | 'paidBy'>): Expense {
  return {
    amount: 10,
    currency: 'IDR',
    participantIds: [over.paidBy],
    splitMode: 'equal',
    categoryId: 'food',
    note: over.id,
    date: '2026-09-01',
    createdAt: 1,
    ...over,
  }
}

describe('mergeTrips', () => {
  it('keeps expenses added on two devices', () => {
    const a = 'a'
    const b = 'b'
    const left = trip({
      updatedAt: 10,
      people: [
        { id: a, name: 'A', color: '#000' },
        { id: b, name: 'B', color: '#111' },
      ],
      expenses: [expense({ id: 'e1', paidBy: a, amount: 50 })],
    })
    const right = trip({
      updatedAt: 11,
      people: [
        { id: a, name: 'A', color: '#000' },
        { id: b, name: 'B', color: '#111' },
      ],
      expenses: [expense({ id: 'e2', paidBy: b, amount: 70 })],
    })
    const merged = mergeTrips(left, right)
    const ids = merged.expenses.map((e) => e.id).sort()
    expect(ids).toEqual(['e1', 'e2'])
  })

  it('keeps who last updated from the newer trip', () => {
    const a = 'a'
    const older = trip({
      updatedAt: 10,
      updatedByName: 'Sam',
      people: [{ id: a, name: 'A', color: '#000' }],
      expenses: [],
    })
    const newer = trip({
      updatedAt: 40,
      updatedByName: 'Alex',
      people: [{ id: a, name: 'A', color: '#000' }],
      expenses: [expense({ id: 'e1', paidBy: a })],
    })
    expect(mergeTrips(older, newer).updatedByName).toBe('Alex')
  })

  it('does not resurrect a deleted expense', () => {
    const a = 'a'
    const local = trip({
      updatedAt: 20,
      deletedExpenseIds: ['e1'],
      people: [{ id: a, name: 'A', color: '#000' }],
      expenses: [],
    })
    const remote = trip({
      updatedAt: 10,
      people: [{ id: a, name: 'A', color: '#000' }],
      expenses: [expense({ id: 'e1', paidBy: a })],
    })
    expect(mergeTrips(local, remote).expenses).toHaveLength(0)
  })

  it('keeps an uploaded bill on the older trip when the other phone is newer', () => {
    const a = 'a'
    const local = trip({
      updatedAt: 10,
      people: [{ id: a, name: 'A', color: '#000' }],
      expenses: [expense({ id: 'scan-17', paidBy: a, amount: 88, date: '2026-09-17', updatedAt: 10 })],
    })
    const remote = trip({
      updatedAt: 50,
      people: [{ id: a, name: 'A', color: '#000' }],
      expenses: [expense({ id: 'coffee', paidBy: a, amount: 4, updatedAt: 50 })],
    })
    const ids = mergeTrips(local, remote).expenses.map((e) => e.id).sort()
    expect(ids).toEqual(['coffee', 'scan-17'])
  })

  it('keeps people added on two devices', () => {
    const left = trip({
      updatedAt: 5,
      people: [{ id: 'a', name: 'A', color: '#000' }],
      expenses: [],
    })
    const right = trip({
      updatedAt: 8,
      people: [
        { id: 'a', name: 'A', color: '#000' },
        { id: 'c', name: 'C', color: '#222' },
      ],
      expenses: [],
    })
    const ids = mergeTrips(left, right).people.map((p) => p.id).sort()
    expect(ids).toEqual(['a', 'c'])
  })

  it('follows the last logged bill, not a stale phone clock', () => {
    const a = 'a'
    const stale = trip({
      updatedAt: 9_000,
      updatedByName: 'Old phone',
      people: [{ id: a, name: 'A', color: '#000' }],
      expenses: [expense({ id: 'e1', paidBy: a, createdAt: 10 })],
    })
    const live = trip({
      updatedAt: 20,
      updatedByName: 'engdjaja',
      people: [{ id: a, name: 'A', color: '#000' }],
      expenses: [
        expense({ id: 'e1', paidBy: a, createdAt: 10 }),
        expense({ id: 'e2', paidBy: a, createdAt: 80, note: 'Last log' }),
      ],
    })
    const merged = mergeTrips(stale, live)
    expect(merged.expenses.map((e) => e.id).sort()).toEqual(['e1', 'e2'])
    expect(merged.updatedByName).toBe('engdjaja')
    expect(merged.updatedAt).toBe(80)
  })

  it('does not republish a poorer 12-bill copy over a 43-bill room', () => {
    const a = 'a'
    const bills = (n: number) =>
      Array.from({ length: n }, (_, i) => expense({ id: `e${i}`, paidBy: a, amount: i + 1 }))
    const stale = trip({
      updatedAt: 90,
      people: [{ id: a, name: 'A', color: '#000' }],
      expenses: bills(12),
    })
    const live = trip({
      updatedAt: 40,
      people: [{ id: a, name: 'A', color: '#000' }],
      expenses: bills(43),
    })
    expect(shouldPublishLive(stale, live)).toBe(false)
    expect(shouldPublishLive({ ...stale, expenses: [...stale.expenses, expense({ id: 'new', paidBy: a })] }, live)).toBe(
      true,
    )
    expect(shouldPublishLive(trip({ people: [{ id: a, name: 'A', color: '#000' }], expenses: [] }), null)).toBe(false)
  })
})

describe('adoptSharedTrip', () => {
  it('merges a snapshot into the existing trip instead of ignoring new bills', () => {
    const local = trip({
      id: 't',
      shareId: 'room1',
      updatedAt: 10,
      people: [{ id: 'a', name: 'A', color: '#000' }],
      expenses: [expense({ id: 'e1', paidBy: 'a' })],
    })
    const incoming = trip({
      id: 't',
      shareId: 'room1',
      updatedAt: 40,
      people: [{ id: 'a', name: 'A', color: '#000' }],
      expenses: [expense({ id: 'e2', paidBy: 'a', amount: 12 })],
    })
    const next = adoptSharedTrip([local], incoming, 'room1')
    expect(next.currentTripId).toBe('t')
    expect(next.trips[0].expenses.map((e) => e.id).sort()).toEqual(['e1', 'e2'])
  })
})

describe('live room payload', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('reads a trip from the room payload without bytebin', async () => {
    const sample = trip({
      name: 'API check',
      people: [{ id: 'a', name: 'A', color: '#000' }],
      expenses: [],
    })
    const encoded = encodeTripShare(sample)
    const shareId = 'ff808181abcd1234abcd5678'
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes(shareId)) {
          return new Response(JSON.stringify({ id: shareId, name: 'triptab', data: { payload: encoded } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return new Response('no', { status: 404 })
      }),
    )
    const loaded = await pullLiveTrip(shareId)
    expect(loaded?.name).toBe('API check')
    expect(loaded?.shareId).toBe(shareId)
  })

  it('writes a live ping when creating and updating a room', async () => {
    const sample = trip({
      name: 'API check',
      people: [{ id: 'a', name: 'A', color: '#000' }],
      expenses: [],
    })
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      if (url.includes('lucko.me/post') && method === 'POST') {
        return new Response(JSON.stringify({ key: 'bin123456' }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.includes('ntfy')) {
        return new Response('{}', { status: 200 })
      }
      if (url.includes('/objects') && method === 'PUT') {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response('no', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const { createLiveRoom, pushLiveTrip } = await import('./sync')
    const id = await createLiveRoom(sample)
    expect(id.startsWith('tt')).toBe(true)
    expect(id.length).toBe(10)
    await pushLiveTrip(id, { ...sample, shareId: id, expenses: [expense({ id: 'e-live', paidBy: 'a' })] })
    const urls = fetchMock.mock.calls.map(([input]) => String(input))
    expect(urls.some((url) => url.includes('ntfy'))).toBe(true)
  })

  it('stores a full snapshot before pinging so a trip can hold any number of bills', async () => {
    const fat = trip({
      name: 'Huge scan dump',
      people: [{ id: 'a', name: 'A', color: '#000' }],
      expenses: Array.from({ length: 40 }, (_, i) =>
        expense({
          id: `scan-${i}`,
          paidBy: 'a',
          amount: 10 + i,
          note: `Uploaded receipt ${i} ${'x'.repeat(80)}`,
        }),
      ),
    })
    const order: string[] = []
    const ntfyBodies: string[] = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      if (url.includes('lucko.me/post') && method === 'POST') {
        order.push('bytebin')
        return new Response(JSON.stringify({ key: 'bin-huge' }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.includes('ntfy') && method === 'POST') {
        order.push('ntfy')
        ntfyBodies.push(String(init?.body ?? ''))
        return new Response('{}', { status: 200 })
      }
      return new Response('no', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const { pushLiveTrip } = await import('./sync')
    await pushLiveTrip('tthuge', fat)
    expect(order[0]).toBe('bytebin')
    expect(order).toContain('ntfy')
    expect(ntfyBodies.some((body) => body.includes('bin-huge'))).toBe(true)
    expect(ntfyBodies.every((body) => body.length <= 4000)).toBe(true)
  })
})
