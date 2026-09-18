import { describe, expect, it } from 'vitest'
import { formatExpenseDate, parseExpenseDate } from './dates'
import { normalizeTrip } from './storage'

const now = new Date('2026-09-18T01:34:00')

describe('parseExpenseDate', () => {
  it('keeps ISO dates from uploaded 17 September bills', () => {
    expect(parseExpenseDate('2026-09-17', now)).toBe('2026-09-17')
    expect(parseExpenseDate('2026-09-17T22:15:00Z', now)).toBe('2026-09-17')
  })

  it('reads day-first numeric dates', () => {
    expect(parseExpenseDate('17/09/2026', now)).toBe('2026-09-17')
    expect(parseExpenseDate('17-9-26', now)).toBe('2026-09-17')
    expect(parseExpenseDate('17.09.2026', now)).toBe('2026-09-17')
  })

  it('reads written dates from receipts', () => {
    expect(parseExpenseDate('17 September 2026', now)).toBe('2026-09-17')
    expect(parseExpenseDate('17th Sep 2026', now)).toBe('2026-09-17')
    expect(parseExpenseDate('Sep 17, 2026', now)).toBe('2026-09-17')
    expect(parseExpenseDate('September 17 2026', now)).toBe('2026-09-17')
    expect(parseExpenseDate('17 September', now)).toBe('2026-09-17')
  })

  it('drops dates that are clearly wrong', () => {
    expect(parseExpenseDate('1999-01-01', now)).toBeUndefined()
    expect(parseExpenseDate('not a date', now)).toBeUndefined()
  })
})

describe('formatExpenseDate', () => {
  it('labels 17 September for the expense list', () => {
    expect(formatExpenseDate('2026-09-17')).toBe('Thu, Sep 17')
    expect(formatExpenseDate('17/09/2026')).toBe('Thu, Sep 17')
  })
})

describe('trip load', () => {
  it('puts uploaded 17 September bills on that day in the trip', () => {
    const trip = normalizeTrip({
      name: 'Bali',
      people: [{ id: 'a', name: 'Alex', color: '#000' }],
      expenses: [
        {
          id: 'e1',
          amount: 42,
          currency: 'IDR',
          paidBy: 'a',
          participantIds: ['a'],
          splitMode: 'equal',
          categoryId: 'food',
          note: 'Nasi',
          date: '17 September 2026',
          createdAt: 1,
        },
      ],
    })
    expect(trip?.expenses[0]?.date).toBe('2026-09-17')
  })
})
