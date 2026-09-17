import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Expense, Trip } from '../types'
import { defaultCategories } from './demo'
import { encodeTripShare } from './share'
import { adoptSharedTrip, mergeTrips, pullLiveTrip } from './sync'

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
    const shareId = 'ff808181payload1'
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
      if (url.includes('ntfy.sh')) {
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
    await pushLiveTrip(id, { ...sample, shareId: id, expenses: [expense({ id: 'e-live', paidBy: 'a' })] })
    const urls = fetchMock.mock.calls.map(([input]) => String(input))
    expect(urls.some((url) => url.includes('ntfy.sh'))).toBe(true)
  })
})
