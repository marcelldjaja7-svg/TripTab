import { describe, expect, it } from 'vitest'
import { normalizeLineItems, normalizeTrip } from './storage'

describe('normalizeLineItems', () => {
  it('keeps named amounts and drops junk', () => {
    expect(
      normalizeLineItems([
        { name: 'Nasi campur', amount: 45000 },
        { name: '  ', amount: 8 },
        { name: 'Es teh', amount: '8000' },
      ]),
    ).toEqual([
      { name: 'Nasi campur', amount: 45000 },
      { name: 'Es teh', amount: 8000 },
    ])
  })

  it('caps at 40 items', () => {
    const items = Array.from({ length: 45 }, (_, i) => ({ name: `Item ${i + 1}`, amount: 1 }))
    expect(normalizeLineItems(items)).toHaveLength(40)
  })
})

describe('normalizeTrip line items', () => {
  it('round-trips scanned items on an expense', () => {
    const trip = normalizeTrip({
      name: 'Test',
      people: [{ id: 'p1', name: 'Maya', color: '#000' }],
      expenses: [
        {
          id: 'e1',
          amount: 53000,
          currency: 'IDR',
          paidBy: 'p1',
          participantIds: ['p1'],
          splitMode: 'equal',
          categoryId: 'food',
          note: 'Warung Made · Nasi campur, Es teh',
          date: '2026-09-14',
          createdAt: 1,
          lineItems: [
            { name: 'Nasi campur', amount: 45000 },
            { name: 'Es teh', amount: 8000 },
          ],
        },
      ],
    })
    expect(trip?.expenses[0]?.lineItems).toEqual([
      { name: 'Nasi campur', amount: 45000 },
      { name: 'Es teh', amount: 8000 },
    ])
  })

  it('round-trips friend clocks and delete tombstones', () => {
    const trip = normalizeTrip({
      name: 'Test',
      people: [{ id: 'p1', name: 'Maya', color: '#000', updatedAt: 40 }],
      deletedPersonIds: ['p2'],
      expenses: [],
    })
    expect(trip?.people[0]?.updatedAt).toBe(40)
    expect(trip?.deletedPersonIds).toEqual(['p2'])
  })
})
