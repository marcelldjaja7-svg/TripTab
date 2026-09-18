import { describe, expect, it } from 'vitest'
import { equalPercents, equalShares, percentToAmounts, percentsMatch100, sharesMatchTotal, tripBillCount, tripTotalBase } from './money'
import { ratesForBase } from './currencies'
import { defaultCategories } from './demo'
import type { Expense, Trip } from '../types'

describe('equalShares', () => {
  it('splits cents without losing remainder', () => {
    const ids = ['a', 'b', 'c']
    const shares = equalShares(10, ids, 'USD')
    expect(shares.a + shares.b + shares.c).toBeCloseTo(10, 6)
    expect(sharesMatchTotal(shares, 10, 'USD')).toBe(true)
  })

  it('uses whole units for IDR', () => {
    const shares = equalShares(100, ['a', 'b', 'c'], 'IDR')
    expect(shares.a + shares.b + shares.c).toBe(100)
    expect(Object.values(shares).every((n) => Number.isInteger(n))).toBe(true)
  })
})

describe('percent split', () => {
  it('splits a percent bill without losing remainder', () => {
    const amounts = percentToAmounts(100_000, { a: 70, b: 30 }, ['a', 'b'], 'IDR')
    expect(amounts.a + amounts.b).toBe(100_000)
    expect(amounts.a).toBe(70_000)
    expect(amounts.b).toBe(30_000)
  })

  it('equal percents sum to 100', () => {
    const pct = equalPercents(['a', 'b', 'c'])
    expect(percentsMatch100(pct, ['a', 'b', 'c'])).toBe(true)
  })
})

describe('ratesForBase', () => {
  it('keeps the base currency at 1', () => {
    expect(ratesForBase('IDR').IDR).toBe(1)
    expect(ratesForBase('USD').USD).toBe(1)
  })

  it('converts consistently through USD', () => {
    const idr = ratesForBase('IDR')
    const usd = ratesForBase('USD')
    expect(idr.USD * usd.IDR).toBeCloseTo(1, 6)
  })
})

describe('trip spend vs settle-up payments', () => {
  const eng = 'e'
  const nat = 'n'

  function cph(over: Partial<Trip> & Pick<Trip, 'expenses'>): Trip {
    return {
      id: 'cph',
      name: 'Copenhagen',
      emoji: '🌅',
      startDate: '2026-09-15',
      endDate: '2026-09-20',
      baseCurrency: 'DKK',
      categories: defaultCategories(),
      rates: { DKK: 1 },
      createdAt: 1,
      updatedAt: 1,
      people: [
        { id: eng, name: 'engdjaja', color: '#fb7185' },
        { id: nat, name: 'nathanaelsp', color: '#60a5fa' },
      ],
      ...over,
    }
  }

  function bill(id: string, amount: number, paidBy: string, extra: Partial<Expense> = {}): Expense {
    return {
      id,
      amount,
      currency: 'DKK',
      paidBy,
      participantIds: [eng, nat],
      splitMode: 'equal',
      categoryId: 'food',
      note: id,
      date: '2026-09-18',
      createdAt: 1,
      ...extra,
    }
  }

  it('does not add settle-up payments to Spent or the bill count', () => {
    const trip = cph({
      expenses: [
        bill('steam', 244, eng),
        bill('test', 1, eng),
        bill('pay-443', 443, nat, { categoryId: 'settlement', note: 'Settle up', participantIds: [eng] }),
        bill('pay-215', 215, nat, { categoryId: 'settlement', note: 'Settle up', participantIds: [eng] }),
      ],
    })
    expect(trip.expenses).toHaveLength(4)
    expect(tripBillCount(trip)).toBe(2)
    expect(tripTotalBase(trip)).toBeCloseTo(245)
  })
})
