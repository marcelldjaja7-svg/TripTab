import { describe, expect, it } from 'vitest'
import type { Trip } from '../types'
import { createDemoTrip, defaultCategories } from './demo'
import { ratesForBase } from './currencies'
import { tripTotalBase } from './money'
import {
  computeBalances,
  expenseShareMinor,
  personFunded,
  personSpendPaid,
  personTripShare,
  settlementExpense,
  shareOfTripPercent,
  suggestedTransfers,
} from './settle'

function trip(over: Partial<Trip> & Pick<Trip, 'people' | 'expenses'>): Trip {
  return {
    id: 't',
    name: 'Test',
    emoji: '✈️',
    startDate: '',
    endDate: '',
    baseCurrency: 'USD',
    categories: defaultCategories(),
    rates: ratesForBase('USD'),
    createdAt: 1,
    updatedAt: 1,
    ...over,
  }
}

describe('computeBalances', () => {
  it('nets a simple equal dinner', () => {
    const a = 'a'
    const b = 'b'
    const t = trip({
      people: [
        { id: a, name: 'A', color: '#000' },
        { id: b, name: 'B', color: '#111' },
      ],
      expenses: [
        {
          id: 'e1',
          amount: 40,
          currency: 'USD',
          paidBy: a,
          participantIds: [a, b],
          splitMode: 'equal',
          categoryId: 'food',
          note: 'Dinner',
          date: '2026-09-01',
          createdAt: 1,
        },
      ],
    })
    const nets = Object.fromEntries(computeBalances(t).map((b) => [b.personId, b.net]))
    expect(nets[a]).toBeCloseTo(20)
    expect(nets[b]).toBeCloseTo(-20)
  })

  it('converts foreign currency with the trip rate', () => {
    const a = 'a'
    const b = 'b'
    const t = trip({
      rates: { USD: 1, EUR: 2 },
      people: [
        { id: a, name: 'A', color: '#000' },
        { id: b, name: 'B', color: '#111' },
      ],
      expenses: [
        {
          id: 'e1',
          amount: 10,
          currency: 'EUR',
          paidBy: a,
          participantIds: [a, b],
          splitMode: 'equal',
          categoryId: 'food',
          note: '',
          date: '2026-09-01',
          createdAt: 1,
        },
      ],
    })
    const nets = Object.fromEntries(computeBalances(t).map((x) => [x.personId, x.net]))
    expect(nets[a]).toBeCloseTo(10)
    expect(nets[b]).toBeCloseTo(-10)
  })

  it('honors custom shares', () => {
    const a = 'a'
    const b = 'b'
    const t = trip({
      people: [
        { id: a, name: 'A', color: '#000' },
        { id: b, name: 'B', color: '#111' },
      ],
      expenses: [
        {
          id: 'e1',
          amount: 90,
          currency: 'USD',
          paidBy: a,
          participantIds: [a, b],
          splitMode: 'custom',
          shares: { [a]: 30, [b]: 60 },
          categoryId: 'food',
          note: '',
          date: '2026-09-01',
          createdAt: 1,
        },
      ],
    })
    const nets = Object.fromEntries(computeBalances(t).map((x) => [x.personId, x.net]))
    expect(nets[a]).toBeCloseTo(60)
    expect(nets[b]).toBeCloseTo(-60)
    const rows = Object.fromEntries(computeBalances(t).map((x) => [x.personId, x]))
    expect(rows[a]?.paid).toBeCloseTo(90)
    expect(rows[a]?.share).toBeCloseTo(30)
    expect(rows[b]?.paid).toBeCloseTo(0)
    expect(rows[b]?.share).toBeCloseTo(60)
  })

  it('honors percent shares and exclusions', () => {
    const a = 'a'
    const b = 'b'
    const c = 'c'
    const t = trip({
      people: [
        { id: a, name: 'A', color: '#000' },
        { id: b, name: 'B', color: '#111' },
        { id: c, name: 'C', color: '#222' },
      ],
      expenses: [
        {
          id: 'e1',
          amount: 100,
          currency: 'USD',
          paidBy: a,
          participantIds: [a, b],
          splitMode: 'percent',
          shares: { [a]: 70, [b]: 30 },
          categoryId: 'food',
          note: '',
          date: '2026-09-01',
          createdAt: 1,
        },
      ],
    })
    const nets = Object.fromEntries(computeBalances(t).map((x) => [x.personId, x.net]))
    expect(nets[a]).toBeCloseTo(30)
    expect(nets[b]).toBeCloseTo(-30)
    expect(nets[c]).toBeCloseTo(0)
  })

  it('does not bill a friend for a personal equal expense', () => {
    const a = 'a'
    const b = 'b'
    const t = trip({
      people: [
        { id: a, name: 'engdjaja', color: '#000' },
        { id: b, name: 'nathanaelsp', color: '#111' },
      ],
      expenses: [
        {
          id: 'steam',
          amount: 244,
          currency: 'USD',
          paidBy: a,
          participantIds: [a],
          splitMode: 'equal',
          categoryId: 'food',
          note: 'Steam',
          date: '2026-09-17',
          createdAt: 1,
        },
        {
          id: 'muse',
          amount: 180,
          currency: 'USD',
          paidBy: a,
          participantIds: [a, b],
          splitMode: 'equal',
          categoryId: 'activities',
          note: 'Design Muse',
          date: '2026-09-17',
          createdAt: 2,
        },
        {
          id: 'tonki',
          amount: 376,
          currency: 'USD',
          paidBy: a,
          participantIds: [a, b],
          splitMode: 'custom',
          shares: { [a]: 200, [b]: 176 },
          categoryId: 'food',
          note: 'District Tonki',
          date: '2026-09-17',
          createdAt: 3,
        },
      ],
    })
    const rows = Object.fromEntries(computeBalances(t).map((x) => [x.personId, x]))
    expect(rows[a]?.paid).toBeCloseTo(800)
    expect(rows[a]?.share).toBeCloseTo(244 + 90 + 200)
    expect(rows[b]?.paid).toBeCloseTo(0)
    expect(rows[b]?.share).toBeCloseTo(90 + 176)
    expect(rows[b]?.net).toBeCloseTo(-(90 + 176))
    expect(suggestedTransfers(t)).toMatchObject([{ fromId: b, toId: a, amount: 266 }])
  })

  it('treats custom splits without share amounts as equal', () => {
    const a = 'a'
    const b = 'b'
    const t = trip({
      people: [
        { id: a, name: 'A', color: '#000' },
        { id: b, name: 'B', color: '#111' },
      ],
      expenses: [
        {
          id: 'e1',
          amount: 40,
          currency: 'USD',
          paidBy: a,
          participantIds: [a, b],
          splitMode: 'custom',
          categoryId: 'food',
          note: '',
          date: '2026-09-01',
          createdAt: 1,
        },
      ],
    })
    const rows = Object.fromEntries(computeBalances(t).map((x) => [x.personId, x]))
    expect(rows[a]?.share).toBeCloseTo(20)
    expect(rows[b]?.share).toBeCloseTo(20)
  })
})

describe('suggestedTransfers', () => {
  it('minimizes to one payment for two people', () => {
    const a = 'a'
    const b = 'b'
    const t = trip({
      people: [
        { id: a, name: 'A', color: '#000' },
        { id: b, name: 'B', color: '#111' },
      ],
      expenses: [
        {
          id: 'e1',
          amount: 50,
          currency: 'USD',
          paidBy: a,
          participantIds: [a, b],
          splitMode: 'equal',
          categoryId: 'food',
          note: '',
          date: '2026-09-01',
          createdAt: 1,
        },
      ],
    })
    const xfers = suggestedTransfers(t)
    expect(xfers).toHaveLength(1)
    expect(xfers[0]).toMatchObject({ fromId: b, toId: a, amount: 25 })
  })

  it('settles a three-person cycle with two transfers or fewer', () => {
    const a = 'a'
    const b = 'b'
    const c = 'c'
    const t = trip({
      people: [
        { id: a, name: 'A', color: '#000' },
        { id: b, name: 'B', color: '#111' },
        { id: c, name: 'C', color: '#222' },
      ],
      expenses: [
        {
          id: 'e1',
          amount: 30,
          currency: 'USD',
          paidBy: a,
          participantIds: [a, b],
          splitMode: 'equal',
          categoryId: 'food',
          note: '',
          date: '2026-09-01',
          createdAt: 1,
        },
        {
          id: 'e2',
          amount: 30,
          currency: 'USD',
          paidBy: b,
          participantIds: [b, c],
          splitMode: 'equal',
          categoryId: 'food',
          note: '',
          date: '2026-09-01',
          createdAt: 2,
        },
        {
          id: 'e3',
          amount: 30,
          currency: 'USD',
          paidBy: c,
          participantIds: [c, a],
          splitMode: 'equal',
          categoryId: 'food',
          note: '',
          date: '2026-09-01',
          createdAt: 3,
        },
      ],
    })
    const nets = computeBalances(t)
    expect(nets.every((n) => Math.abs(n.net) < 0.01)).toBe(true)
    expect(suggestedTransfers(t)).toHaveLength(0)
  })

  it('keeps the demo trip nets summing to ~zero', () => {
    const nets = computeBalances(createDemoTrip())
    const sum = nets.reduce((s, b) => s + b.net, 0)
    expect(Math.abs(sum)).toBeLessThan(0.05)
    expect(suggestedTransfers(createDemoTrip()).length).toBeGreaterThan(0)
  })

  it('reconstructs each person net from suggested transfers', () => {
    const t = createDemoTrip()
    const nets = Object.fromEntries(computeBalances(t).map((b) => [b.personId, b.net]))
    const reconstructed: Record<string, number> = {}
    for (const id of Object.keys(nets)) reconstructed[id] = 0
    for (const xfer of suggestedTransfers(t)) {
      reconstructed[xfer.fromId] -= xfer.amount
      reconstructed[xfer.toId] += xfer.amount
    }
    for (const id of Object.keys(nets)) {
      expect(reconstructed[id]).toBeCloseTo(nets[id], 2)
    }
  })
})

describe('settle-up payments', () => {
  it('credits the participants without increasing group spend paid', () => {
    const a = 'a'
    const b = 'b'
    const dinner = trip({
      people: [
        { id: a, name: 'A', color: '#000' },
        { id: b, name: 'B', color: '#111' },
      ],
      expenses: [
        {
          id: 'e1',
          amount: 100,
          currency: 'USD',
          paidBy: a,
          participantIds: [a, b],
          splitMode: 'equal',
          categoryId: 'food',
          note: 'Dinner',
          date: '2026-09-18',
          createdAt: 1,
        },
      ],
    })
    expect(suggestedTransfers(dinner)).toMatchObject([{ fromId: b, toId: a, amount: 50 }])
    const settled = {
      ...dinner,
      expenses: [...dinner.expenses, settlementExpense(dinner, b, a, 50)],
    }
    const nets = Object.fromEntries(computeBalances(settled).map((row) => [row.personId, row.net]))
    expect(nets[a]).toBeCloseTo(0)
    expect(nets[b]).toBeCloseTo(0)
    expect(suggestedTransfers(settled)).toHaveLength(0)
    expect(personSpendPaid(settled, a)).toBeCloseTo(100)
    expect(personSpendPaid(settled, b)).toBeCloseTo(0)
    expect(personTripShare(settled, a)).toBeCloseTo(50)
    expect(personTripShare(settled, b)).toBeCloseTo(50)
    expect(personFunded(settled, a)).toBeCloseTo(50)
    expect(personFunded(settled, b)).toBeCloseTo(50)
    const rows = Object.fromEntries(computeBalances(settled).map((row) => [row.personId, row]))
    expect(rows[a]?.paid).toBeCloseTo(100)
    expect(rows[a]?.share).toBeCloseTo(50)
    expect(rows[b]?.paid).toBeCloseTo(0)
    expect(rows[b]?.share).toBeCloseTo(50)
  })

  it('ranks High Rollers by share so settle-up and splits beat cards swiped', () => {
    const a = 'a'
    const b = 'b'
    const t = trip({
      people: [
        { id: a, name: 'engdjaja', color: '#000' },
        { id: b, name: 'nathanaelsp', color: '#111' },
      ],
      expenses: [
        {
          id: 'personal',
          amount: 244,
          currency: 'USD',
          paidBy: a,
          participantIds: [a],
          splitMode: 'equal',
          categoryId: 'food',
          note: 'Steam',
          date: '2026-09-17',
          createdAt: 1,
        },
        {
          id: 'tonkin',
          amount: 376,
          currency: 'USD',
          paidBy: a,
          participantIds: [a, b],
          splitMode: 'custom',
          shares: { [a]: 183, [b]: 193 },
          categoryId: 'food',
          note: 'District Tonkin',
          date: '2026-09-17',
          createdAt: 2,
        },
        {
          id: 'pay',
          amount: 193,
          currency: 'USD',
          paidBy: b,
          participantIds: [a],
          splitMode: 'equal',
          categoryId: 'settlement',
          note: 'Settle up',
          date: '2026-09-18',
          createdAt: 3,
        },
      ],
    })
    expect(personSpendPaid(t, a)).toBeCloseTo(620)
    expect(personSpendPaid(t, b)).toBeCloseTo(0)
    expect(personTripShare(t, a)).toBeCloseTo(244 + 183)
    expect(personTripShare(t, b)).toBeCloseTo(193)
    const ranked = [...computeBalances(t)].sort((x, y) => y.share - x.share)
    expect(ranked.map((row) => row.personId)).toEqual([a, b])
    expect(ranked[0]?.share).toBeCloseTo(427)
    expect(ranked[1]?.share).toBeCloseTo(193)
    expect(personFunded(t, a)).toBeCloseTo(244 + 183)
    expect(personFunded(t, b)).toBeCloseTo(193)
  })
})

describe('proportional shares', () => {
  it('keeps custom amounts as each person\'s proportion of the bill', () => {
    const a = 'a'
    const b = 'b'
    const t = trip({
      people: [
        { id: a, name: 'A', color: '#000' },
        { id: b, name: 'B', color: '#111' },
      ],
      expenses: [
        {
          id: 'tonkin',
          amount: 376,
          currency: 'USD',
          paidBy: a,
          participantIds: [a, b],
          splitMode: 'custom',
          shares: { [a]: 183, [b]: 193 },
          categoryId: 'food',
          note: 'District Tonkin',
          date: '2026-09-17',
          createdAt: 1,
        },
      ],
    })
    const parts = expenseShareMinor(t, t.expenses[0]!)
    expect(parts.get(a)).toBe(18300)
    expect(parts.get(b)).toBe(19300)
    expect(personTripShare(t, a)).toBeCloseTo(183)
    expect(personTripShare(t, b)).toBeCloseTo(193)
  })

  it('splits percent bills in proportion to the named percents', () => {
    const a = 'a'
    const b = 'b'
    const t = trip({
      people: [
        { id: a, name: 'A', color: '#000' },
        { id: b, name: 'B', color: '#111' },
      ],
      expenses: [
        {
          id: 'e1',
          amount: 100,
          currency: 'USD',
          paidBy: a,
          participantIds: [a, b],
          splitMode: 'percent',
          shares: { [a]: 70, [b]: 30 },
          categoryId: 'food',
          note: '',
          date: '2026-09-01',
          createdAt: 1,
        },
      ],
    })
    expect(personTripShare(t, a)).toBeCloseTo(70)
    expect(personTripShare(t, b)).toBeCloseTo(30)
  })

  it('does not give leftover cents to a friend with a zero share', () => {
    const a = 'a'
    const b = 'b'
    const t = trip({
      people: [
        { id: a, name: 'A', color: '#000' },
        { id: b, name: 'B', color: '#111' },
      ],
      expenses: [
        {
          id: 'e1',
          amount: 100,
          currency: 'USD',
          paidBy: a,
          participantIds: [a, b],
          splitMode: 'custom',
          shares: { [a]: 100, [b]: 0 },
          categoryId: 'food',
          note: '',
          date: '2026-09-01',
          createdAt: 1,
        },
      ],
    })
    expect(personTripShare(t, a)).toBeCloseTo(100)
    expect(personTripShare(t, b)).toBeCloseTo(0)
  })

  it('makes every person\'s share add up to trip spend', () => {
    const t = createDemoTrip()
    const spent = tripTotalBase(t)
    const shares = computeBalances(t).reduce((sum, row) => sum + row.share, 0)
    expect(shares).toBeCloseTo(spent, 2)
    const pct = computeBalances(t).reduce((sum, row) => sum + shareOfTripPercent(row.share, spent), 0)
    expect(pct).toBeCloseTo(100, 5)
  })
})
