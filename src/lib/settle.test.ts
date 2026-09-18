import { describe, expect, it } from 'vitest'
import type { Trip } from '../types'
import { createDemoTrip, defaultCategories } from './demo'
import { ratesForBase } from './currencies'
import { tripTotalBase } from './money'
import { computeBalances, personSpendPaid, personTripShare, settlementExpense, suggestedTransfers } from './settle'

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

  it('keeps a bill 100% on the friend it was bought for when the payer is not on the split', () => {
    const a = 'a'
    const b = 'b'
    const t = trip({
      people: [
        { id: a, name: 'A', color: '#000' },
        { id: b, name: 'B', color: '#111' },
      ],
      expenses: [
        {
          id: 'gift',
          amount: 100,
          currency: 'USD',
          paidBy: a,
          participantIds: [b],
          splitMode: 'equal',
          categoryId: 'food',
          note: 'Treat',
          date: '2026-09-01',
          createdAt: 1,
        },
      ],
    })
    const rows = Object.fromEntries(computeBalances(t).map((x) => [x.personId, x]))
    expect(rows[a]?.paid).toBeCloseTo(100)
    expect(rows[a]?.share).toBeCloseTo(0)
    expect(rows[b]?.paid).toBeCloseTo(0)
    expect(rows[b]?.share).toBeCloseTo(100)
    expect(rows[a]?.net).toBeCloseTo(100)
    expect(rows[b]?.net).toBeCloseTo(-100)
  })

  it('allocates Copenhagen-style personal, equal, custom, and settle-up per person', () => {
    const eng = 'eng'
    const nat = 'nat'
    const t = trip({
      baseCurrency: 'DKK',
      rates: { DKK: 1 },
      people: [
        { id: eng, name: 'engdjaja', color: '#000' },
        { id: nat, name: 'nathanaelsp', color: '#111' },
      ],
      expenses: [
        {
          id: 'steam',
          amount: 244,
          currency: 'DKK',
          paidBy: eng,
          participantIds: [eng],
          splitMode: 'equal',
          categoryId: 'food',
          note: 'Steam',
          date: '2026-09-17',
          createdAt: 1,
        },
        {
          id: 'muse',
          amount: 180,
          currency: 'DKK',
          paidBy: eng,
          participantIds: [eng, nat],
          splitMode: 'equal',
          categoryId: 'activities',
          note: 'Design Museum',
          date: '2026-09-17',
          createdAt: 2,
        },
        {
          id: 'tonkin',
          amount: 376,
          currency: 'DKK',
          paidBy: eng,
          participantIds: [eng, nat],
          splitMode: 'custom',
          shares: { [eng]: 183, [nat]: 193 },
          categoryId: 'food',
          note: 'District Tonkin',
          date: '2026-09-17',
          createdAt: 3,
        },
        {
          id: 'amager',
          amount: 320,
          currency: 'DKK',
          paidBy: eng,
          participantIds: [eng, nat],
          splitMode: 'equal',
          categoryId: 'transport',
          note: 'Amagerbro Station',
          date: '2026-09-17',
          createdAt: 4,
        },
        {
          id: 'fabro',
          amount: 430,
          currency: 'DKK',
          paidBy: eng,
          participantIds: [eng, nat],
          splitMode: 'equal',
          categoryId: 'food',
          note: 'Fabro',
          date: '2026-09-16',
          createdAt: 5,
        },
        {
          id: 'water',
          amount: 22,
          currency: 'DKK',
          paidBy: nat,
          participantIds: [nat],
          splitMode: 'equal',
          categoryId: 'food',
          note: 'magasin water',
          date: '2026-09-17',
          createdAt: 6,
        },
      ],
    })
    const before = Object.fromEntries(computeBalances(t).map((x) => [x.personId, x]))
    expect(personTripShare(t, eng)).toBeCloseTo(244 + 90 + 183 + 160 + 215)
    expect(personTripShare(t, nat)).toBeCloseTo(22 + 90 + 193 + 160 + 215)
    expect(before[eng]?.paid).toBeCloseTo(244 + 180 + 376 + 320 + 430)
    expect(before[nat]?.paid).toBeCloseTo(22)
    expect(before[eng]?.share + before[nat]?.share).toBeCloseTo(tripTotalBase(t))
    expect(before[nat]?.net).toBeCloseTo(-(90 + 193 + 160 + 215))
    expect(suggestedTransfers(t)).toMatchObject([{ fromId: nat, toId: eng, amount: 658 }])

    const settled = {
      ...t,
      expenses: [...t.expenses, settlementExpense(t, nat, eng, 658)],
    }
    const after = Object.fromEntries(computeBalances(settled).map((x) => [x.personId, x]))
    expect(after[eng]?.share).toBeCloseTo(before[eng]?.share ?? 0)
    expect(after[nat]?.share).toBeCloseTo(before[nat]?.share ?? 0)
    expect(after[eng]?.paid).toBeCloseTo(before[eng]?.paid ?? 0)
    expect(after[nat]?.paid).toBeCloseTo(before[nat]?.paid ?? 0)
    expect(after[nat]?.settled).toBeCloseTo(658)
    expect(after[eng]?.settled).toBeCloseTo(-658)
    expect(after[eng]?.net).toBeCloseTo(0)
    expect(after[nat]?.net).toBeCloseTo(0)
    expect(suggestedTransfers(settled)).toHaveLength(0)
    expect(personSpendPaid(settled, eng)).toBeCloseTo(before[eng]?.paid ?? 0)
  })

  it('moves the full settle-up even if both friends were listed on the payment', () => {
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
          amount: 80,
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
    const messy = {
      ...dinner,
      expenses: [
        ...dinner.expenses,
        {
          ...settlementExpense(dinner, b, a, 40),
          participantIds: [a, b],
        },
      ],
    }
    const rows = Object.fromEntries(computeBalances(messy).map((x) => [x.personId, x]))
    expect(rows[a]?.net).toBeCloseTo(0)
    expect(rows[b]?.net).toBeCloseTo(0)
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
    const rows = Object.fromEntries(computeBalances(settled).map((row) => [row.personId, row]))
    expect(rows[a]?.paid).toBeCloseTo(100)
    expect(rows[a]?.share).toBeCloseTo(50)
    expect(rows[a]?.settled).toBeCloseTo(-50)
    expect(rows[b]?.paid).toBeCloseTo(0)
    expect(rows[b]?.share).toBeCloseTo(50)
    expect(rows[b]?.settled).toBeCloseTo(50)
  })
})
