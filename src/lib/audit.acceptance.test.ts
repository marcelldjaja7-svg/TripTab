import { describe, expect, it } from 'vitest'
import type { Expense, Trip } from '../types'
import { convertRatesToNewBase } from './currencies'
import { defaultCategories } from './demo'
import { applyExpenseSave } from './expenseSave'
import { applyTripSave, liveContentKey, mergeTrips } from './merge'
import {
  equalShares,
  expenseRate,
  expenseShares,
  hasAllZeroShares,
  hasNegativeShares,
  percentToAmounts,
  percentsMatch100,
  rateToBase,
  snapAmount,
  toBaseMinor,
  toMinor,
} from './money'
import { computeMinorBalances, expenseShareMinor, suggestedTransfers } from './settle'
import { decodeTripShare, encodeTripShare } from './share'
import { normalizeTrip } from './storage'

function trip(over: Partial<Trip> & Pick<Trip, 'people' | 'expenses'>): Trip {
  return {
    id: 't',
    name: 'Audit',
    emoji: '✈️',
    startDate: '',
    endDate: '',
    baseCurrency: 'IDR',
    categories: defaultCategories(),
    rates: { IDR: 1, USD: 16200, JPY: 108 },
    createdAt: 1,
    updatedAt: 1,
    ...over,
  }
}

function bill(over: Partial<Expense> & Pick<Expense, 'id' | 'paidBy' | 'amount'>): Expense {
  return {
    currency: 'IDR',
    participantIds: over.participantIds ?? ['a', 'b', 'c'],
    splitMode: 'equal',
    categoryId: 'food',
    note: over.note ?? over.id,
    date: '2026-10-06',
    createdAt: 1,
    ...over,
  }
}

function nets(t: Trip): Record<string, number> {
  return Object.fromEntries(computeMinorBalances(t).map((row) => [row.personId, row.net]))
}

function transferKey(t: Trip): string {
  return suggestedTransfers(t)
    .map((row) => `${row.fromId}>${row.toId}:${toMinor(row.amount, 0)}`)
    .join('|')
}

const abc = [
  { id: 'a', name: 'A', color: '#000' },
  { id: 'b', name: 'B', color: '#111' },
  { id: 'c', name: 'C', color: '#222' },
]

describe('keep 1–16 money and sync', () => {
  it('1. shares in minor units sum to the stored amount', () => {
    const ids = ['c', 'a', 'b']
    const shares = equalShares(100_000, ids, 'IDR')
    expect(toMinor(Object.values(shares).reduce((s, n) => s + n, 0), 0)).toBe(100_000)
    expect(toMinor(Object.values(equalShares(10, ids, 'USD')).reduce((s, n) => s + n, 0), 2)).toBe(1000)
  })

  it('2. equal-split remainder follows sorted participant ids', () => {
    const left = equalShares(100_000, ['c', 'a', 'b'], 'IDR')
    const right = equalShares(100_000, ['b', 'c', 'a'], 'IDR')
    expect(left).toEqual(right)
    expect(left.a + left.b + left.c).toBe(100_000)
  })

  it('3. nets sum to 0, including when a participant was removed from people', () => {
    const t = trip({
      people: abc,
      expenses: [
        bill({ id: 'e1', paidBy: 'a', amount: 100_000 }),
        bill({ id: 'e2', paidBy: 'b', amount: 10, currency: 'USD', fxRate: 16200, participantIds: ['a', 'b'] }),
      ],
    })
    expect(computeMinorBalances(t).reduce((s, row) => s + row.net, 0)).toBe(0)

    const ghost = trip({
      people: abc.slice(0, 2),
      expenses: [bill({ id: 'out', paidBy: 'c', amount: 90_000, participantIds: ['a', 'b', 'c'] })],
    })
    const rows = computeMinorBalances(ghost)
    expect(rows.reduce((s, row) => s + row.net, 0)).toBe(0)
    expect(rows.find((row) => row.personId === 'c')?.paid).toBe(90_000)
    expect(nets(ghost).a).toBe(-30_000)
    expect(nets(ghost).b).toBe(-30_000)
    expect(nets(ghost).c).toBe(60_000)
  })

  it('4. applying suggested transfers once clears nets and a second pass adds nothing', () => {
    const t = trip({
      people: abc,
      expenses: [bill({ id: 'e1', paidBy: 'a', amount: 100_000 })],
    })
    const first = suggestedTransfers(t)
    expect(first).toHaveLength(2)
    let logged = t
    for (const row of first) {
      logged = {
        ...logged,
        expenses: [
          {
            id: `pay-${row.fromId}-${row.toId}`,
            amount: row.amount,
            currency: 'IDR',
            paidBy: row.fromId,
            participantIds: [row.toId],
            splitMode: 'equal',
            categoryId: 'settlement',
            note: 'Settle up',
            date: '2026-10-06',
            createdAt: Date.now(),
          },
          ...logged.expenses,
        ],
      }
    }
    expect(computeMinorBalances(logged).every((row) => row.net === 0)).toBe(true)
    expect(suggestedTransfers(logged)).toEqual([])
  })

  it('5. transfer list is independent of people order', () => {
    const expenses = [
      bill({ id: 'e1', paidBy: 'a', amount: 200, participantIds: ['a', 'c'] }),
      bill({ id: 'e2', paidBy: 'b', amount: 200, participantIds: ['b', 'd'] }),
    ]
    const people = [
      { id: 'a', name: 'A', color: '#000' },
      { id: 'b', name: 'B', color: '#111' },
      { id: 'c', name: 'C', color: '#222' },
      { id: 'd', name: 'D', color: '#333' },
    ]
    const one = trip({ people, expenses })
    const two = trip({ people: [people[0], people[1], people[3], people[2]], expenses: [...expenses].reverse() })
    expect(transferKey(one)).toBe(transferKey(two))
  })

  it('6. negative shares and percents are rejected by the form helpers and the ledger', () => {
    const negative = bill({
      id: 'neg',
      paidBy: 'a',
      amount: 100,
      splitMode: 'custom',
      shares: { a: -10, b: 110 },
      participantIds: ['a', 'b'],
    })
    const zeros = bill({
      id: 'zero',
      paidBy: 'a',
      amount: 100,
      splitMode: 'custom',
      shares: { a: 0, b: 0 },
      participantIds: ['a', 'b'],
    })
    expect(hasNegativeShares(negative)).toBe(true)
    expect(hasAllZeroShares(zeros)).toBe(true)
    const t = trip({
      people: abc.slice(0, 2),
      expenses: [negative, zeros],
    })
    expect(computeMinorBalances(t).every((row) => row.paid === 0 && row.net === 0)).toBe(true)
  })

  it('7. a payer who is not in people is kept, not reassigned to people[0]', () => {
    const parsed = normalizeTrip({
      name: 'X',
      people: [
        { id: 'a', name: 'A', color: '#000' },
        { id: 'b', name: 'B', color: '#111' },
      ],
      expenses: [
        {
          id: 'g',
          amount: 90_000,
          currency: 'IDR',
          paidBy: 'c',
          participantIds: ['a', 'b', 'c'],
          splitMode: 'equal',
          categoryId: 'food',
          note: '',
          date: '2026-10-06',
          createdAt: 1,
        },
      ],
    })
    expect(parsed?.expenses[0]?.paidBy).toBe('c')
    expect(parsed?.expenses[0]?.participantIds).toEqual(['a', 'b', 'c'])
    expect(nets(parsed!).c).toBe(60_000)
  })

  it('8. saving USD 1.005 stores the intended cent and reloads unchanged', () => {
    expect(toMinor(1.005, 2)).toBe(101)
    expect(snapAmount(1.005, 'USD')).toBe(1.01)
    expect(snapAmount(snapAmount(1.005, 'USD'), 'USD')).toBe(1.01)
  })

  it('9. a later trip rate or base change does not revalue a locked bill', () => {
    const t = trip({
      people: abc.slice(0, 2),
      expenses: [bill({ id: 'usd', paidBy: 'a', amount: 10, currency: 'USD', fxRate: 16200, participantIds: ['a', 'b'] })],
    })
    const before = toBaseMinor(10, 'USD', t, t.expenses[0])
    const afterRate = toBaseMinor(10, 'USD', { ...t, rates: { ...t.rates, USD: 15000 } }, t.expenses[0])
    expect(before).toBe(162_000)
    expect(afterRate).toBe(162_000)
    expect(expenseRate(t.expenses[0]!, { ...t, rates: { ...t.rates, USD: 15000 } })).toBe(16200)
  })

  it('10. a missing or non-positive rate does not produce a balance', () => {
    const t = trip({
      rates: { IDR: 1 },
      people: abc.slice(0, 2),
      expenses: [bill({ id: 'usd', paidBy: 'a', amount: 20, currency: 'USD', participantIds: ['a', 'b'] })],
    })
    expect(rateToBase(t, 'USD')).toBeNull()
    expect(Number.isFinite(toBaseMinor(20, 'USD', t))).toBe(false)
    expect(computeMinorBalances(t).every((row) => row.paid === 0 && row.net === 0)).toBe(true)
  })

  it('11. fifty IDR 100 bills do not create a large phantom USD debt (follow-up rounding)', () => {
    const expenses = Array.from({ length: 50 }, (_, i) =>
      bill({
        id: `e${i}`,
        paidBy: i % 2 === 0 ? 'a' : 'b',
        amount: 100,
        currency: 'IDR',
        fxRate: 1 / 16200,
        participantIds: ['a', 'b'],
      }),
    )
    const t = trip({
      baseCurrency: 'USD',
      rates: { USD: 1, IDR: 1 / 16200 },
      people: abc.slice(0, 2),
      expenses,
    })
    const rows = Object.fromEntries(computeMinorBalances(t).map((row) => [row.personId, row]))
    expect(Math.abs((rows.a?.net ?? 0) + (rows.b?.net ?? 0))).toBeLessThanOrEqual(1)
  })

  it('12. line items report sum(lines) − total and do not drive shares', () => {
    const items = [
      { name: 'Nasi', amount: 40_000 },
      { name: 'Teh', amount: 10_000 },
    ]
    const total = 100_000
    expect(items.reduce((s, item) => s + item.amount, 0) - total).toBe(-50_000)
    const shares = expenseShares(bill({ id: 'scan', paidBy: 'a', amount: total, lineItems: items }))
    expect(toMinor(Object.values(shares).reduce((s, n) => s + n, 0), 0)).toBe(100_000)
  })

  it('13. two phones that add different bills keep both, including after a third joins', () => {
    const seed = trip({ people: abc.slice(0, 2), expenses: [] })
    const phoneA = { ...seed, expenses: [bill({ id: 'dinner', paidBy: 'a', amount: 100_000, participantIds: ['a', 'b'] })] }
    const phoneB = { ...seed, expenses: [bill({ id: 'taxi', paidBy: 'b', amount: 70_000, participantIds: ['a', 'b'] })] }
    const aMerged = mergeTrips(phoneA, phoneB)
    const bMerged = mergeTrips(phoneB, phoneA)
    expect(aMerged.expenses.map((e) => e.id).sort()).toEqual(['dinner', 'taxi'])
    expect(bMerged.expenses.map((e) => e.id).sort()).toEqual(['dinner', 'taxi'])
    expect(nets(aMerged)).toEqual(nets(bMerged))
    const phoneC = mergeTrips(seed, aMerged)
    expect(phoneC.expenses.map((e) => e.id).sort()).toEqual(['dinner', 'taxi'])
    expect(nets(phoneC)).toEqual(nets(aMerged))
    expect(transferKey(phoneC)).toBe(transferKey(aMerged))
  })

  it('14. applyTripSave keeps a remote bill the stale screen did not have', () => {
    const prev = trip({
      people: abc.slice(0, 2),
      expenses: [
        bill({ id: 'e1', paidBy: 'a', amount: 10, participantIds: ['a', 'b'] }),
        bill({ id: 'e2', paidBy: 'b', amount: 20, participantIds: ['a', 'b'] }),
      ],
    })
    const stale = trip({
      people: abc.slice(0, 2),
      name: 'Renamed',
      expenses: [bill({ id: 'e1', paidBy: 'a', amount: 10, participantIds: ['a', 'b'] })],
    })
    const saved = applyTripSave(prev, stale)
    expect(saved.expenses.map((e) => e.id).sort()).toEqual(['e1', 'e2'])
    expect(saved.name).toBe('Renamed')
  })

  it('15+16. logging suggestions from two people orders does not reverse nets; merge lists match', () => {
    const expenses = [
      bill({ id: 'e1', paidBy: 'a', amount: 200, participantIds: ['a', 'c'] }),
      bill({ id: 'e2', paidBy: 'b', amount: 200, participantIds: ['b', 'd'] }),
    ]
    const peopleA = [
      { id: 'a', name: 'A', color: '#000' },
      { id: 'b', name: 'B', color: '#111' },
      { id: 'c', name: 'C', color: '#222' },
      { id: 'd', name: 'D', color: '#333' },
    ]
    const peopleB = [peopleA[0], peopleA[1], peopleA[3], peopleA[2]]
    const left = trip({ people: peopleA, expenses })
    const right = trip({ people: peopleB, expenses })
    expect(transferKey(left)).toBe(transferKey(right))
    const merged = mergeTrips(left, right)
    expect(transferKey(merged)).toBe(transferKey(left))
    expect(suggestedTransfers(mergeTrips(right, left))).toEqual(suggestedTransfers(merged))
  })
})

describe('add 17–24 same-bill, rates, tombstones', () => {
  it('17. a newer amount edit wins over an older participant edit; both phones match', () => {
    const seed = bill({
      id: 'e1',
      paidBy: 'a',
      amount: 100_000,
      participantIds: ['a', 'b', 'c'],
      note: 'Dinner',
      updatedAt: 10,
    })
    const phoneA = trip({
      people: abc,
      expenses: [{ ...seed, amount: 120_000, updatedAt: 100 }],
    })
    const phoneB = trip({
      people: abc,
      expenses: [{ ...seed, participantIds: ['a', 'b'], note: 'Warung', updatedAt: 90 }],
    })
    const ab = mergeTrips(phoneA, phoneB)
    const ba = mergeTrips(phoneB, phoneA)
    expect(ab.expenses[0]?.amount).toBe(120_000)
    expect(ab.expenses[0]?.note).toBe('Dinner')
    expect(ab.expenses[0]?.participantIds).toEqual(['a', 'b', 'c'])
    expect(ba.expenses[0]).toEqual(ab.expenses[0])
    expect(nets(ab)).toEqual({ a: 80_000, b: -40_000, c: -40_000 })
    expect(nets(ba)).toEqual(nets(ab))
  })

  it('18. equal updatedAt picks one deterministic bill and does not swap on rematch', () => {
    const phoneA = trip({
      people: abc,
      expenses: [
        bill({
          id: 'e1',
          paidBy: 'a',
          amount: 100_000,
          note: 'A',
          participantIds: ['a', 'b', 'c'],
          updatedAt: 50,
        }),
      ],
    })
    const phoneB = trip({
      people: abc,
      expenses: [
        bill({
          id: 'e1',
          paidBy: 'a',
          amount: 80_000,
          note: 'B',
          participantIds: ['a'],
          updatedAt: 50,
        }),
      ],
    })
    const ab = mergeTrips(phoneA, phoneB)
    const ba = mergeTrips(phoneB, phoneA)
    expect(ab.expenses[0]).toEqual(ba.expenses[0])
    expect(mergeTrips(ab, phoneB).expenses[0]).toEqual(ab.expenses[0])
    expect(mergeTrips(ba, phoneA).expenses[0]).toEqual(ab.expenses[0])
    expect(nets(ab)).toEqual(nets(ba))
  })

  it('19. a rate edit and a newer dinner on the other phone both survive', () => {
    const seed = trip({
      people: abc.slice(0, 2),
      expenses: [bill({ id: 'usd', paidBy: 'a', amount: 10, currency: 'USD', participantIds: ['a', 'b'] })],
      rates: { IDR: 1, USD: 16200, EUR: 18000 },
      rateTouchedAt: { USD: 10, EUR: 10 },
      updatedAt: 10,
    })
    const ratePhone = {
      ...seed,
      rates: { ...seed.rates, USD: 15000 },
      rateTouchedAt: { ...seed.rateTouchedAt, USD: 500 },
      updatedAt: 500,
    }
    const billPhone = {
      ...seed,
      expenses: [
        ...seed.expenses,
        bill({ id: 'dinner', paidBy: 'b', amount: 30_000, participantIds: ['a', 'b'], updatedAt: 200 }),
      ],
      updatedAt: 200,
    }
    const ab = mergeTrips(ratePhone, billPhone)
    const ba = mergeTrips(billPhone, ratePhone)
    expect(ab.rates.USD).toBe(15000)
    expect(ba.rates.USD).toBe(15000)
    expect(ab.expenses.map((e) => e.id).sort()).toEqual(['dinner', 'usd'])
    expect(ba.expenses.map((e) => e.id).sort()).toEqual(['dinner', 'usd'])
    expect(nets(ab)).toEqual(nets(ba))
  })

  it('20. a rate-only edit reaches the other phone; both show USD 10 as Rp 150,000', () => {
    const seed = trip({
      people: abc.slice(0, 2),
      expenses: [bill({ id: 'usd', paidBy: 'a', amount: 10, currency: 'USD', participantIds: ['a', 'b'] })],
      rates: { IDR: 1, USD: 16200 },
      rateTouchedAt: { USD: 10 },
      updatedAt: 10,
    })
    const editor = {
      ...seed,
      rates: { ...seed.rates, USD: 15000 },
      rateTouchedAt: { USD: 500 },
      updatedAt: 500,
    }
    const other = seed
    const ab = mergeTrips(editor, other)
    const ba = mergeTrips(other, editor)
    expect(ab.rates.USD).toBe(15000)
    expect(ba.rates.USD).toBe(15000)
    expect(toBaseMinor(10, 'USD', ab, ab.expenses[0])).toBe(150_000)
    expect(toBaseMinor(10, 'USD', ba, ba.expenses[0])).toBe(150_000)
    expect(nets(ab)).toEqual({ a: 75_000, b: -75_000 })
    expect(nets(ba)).toEqual(nets(ab))
    expect(liveContentKey(ab)).toBe(liveContentKey(ba))
  })

  it('21. a category rename and a base-currency change survive a newer bill', () => {
    const seed = trip({
      people: abc.slice(0, 2),
      expenses: [bill({ id: 'e1', paidBy: 'a', amount: 16_200, participantIds: ['a', 'b'] })],
      rates: { IDR: 1, USD: 16200 },
      updatedAt: 10,
    })
    const renamed = {
      ...seed,
      categories: seed.categories.map((c) => (c.id === 'food' ? { ...c, name: 'Meals' } : c)),
      categoriesUpdatedAt: 300,
      updatedAt: 300,
    }
    const baseSwitch = {
      ...renamed,
      baseCurrency: 'USD',
      baseUpdatedAt: 350,
      rates: convertRatesToNewBase(renamed.rates, 'USD'),
      rateTouchedAt: { IDR: 350, USD: 350 },
      updatedAt: 350,
    }
    const billed = {
      ...seed,
      expenses: [
        ...seed.expenses,
        bill({ id: 'coffee', paidBy: 'b', amount: 1_000, participantIds: ['a', 'b'], updatedAt: 400 }),
      ],
      updatedAt: 400,
    }
    const merged = mergeTrips(baseSwitch, billed)
    expect(merged.categories.find((c) => c.id === 'food')?.name).toBe('Meals')
    expect(merged.baseCurrency).toBe('USD')
    expect(merged.expenses.map((e) => e.id).sort()).toEqual(['coffee', 'e1'])
    expect(mergeTrips(billed, baseSwitch).baseCurrency).toBe('USD')
  })

  it('22. liveContentKey changes when only rates, paidBy, participantIds, or shares change', () => {
    const base = trip({
      people: abc,
      expenses: [bill({ id: 'e1', paidBy: 'a', amount: 10, participantIds: ['a', 'b'] })],
    })
    expect(liveContentKey(base)).not.toBe(liveContentKey({ ...base, rates: { ...base.rates, USD: 15000 } }))
    expect(liveContentKey(base)).not.toBe(
      liveContentKey({ ...base, expenses: [{ ...base.expenses[0]!, paidBy: 'b' }] }),
    )
    expect(liveContentKey(base)).not.toBe(
      liveContentKey({ ...base, expenses: [{ ...base.expenses[0]!, participantIds: ['a'] }] }),
    )
    expect(liveContentKey(base)).not.toBe(
      liveContentKey({
        ...base,
        expenses: [{ ...base.expenses[0]!, splitMode: 'custom', shares: { a: 7, b: 3 } }],
      }),
    )
  })

  it('23. tombstoning C who paid does not rewrite the payer or drop the split', () => {
    const dinner = bill({ id: 'e1', paidBy: 'c', amount: 90_000, participantIds: ['a', 'b', 'c'] })
    const local = trip({ people: abc, expenses: [dinner] })
    const remote = trip({
      people: abc.slice(0, 2),
      deletedPersonIds: ['c'],
      expenses: [dinner],
    })
    const merged = mergeTrips(local, remote)
    expect(merged.expenses[0]?.paidBy).toBe('c')
    expect(merged.expenses[0]?.participantIds).toEqual(['a', 'b', 'c'])
    expect(merged.people.map((p) => p.id)).toEqual(['a', 'b', 'c'])
    expect(Object.keys(nets(merged)).sort()).toEqual(['a', 'b', 'c'])
    expect(nets(merged)).toEqual({ a: -30_000, b: -30_000, c: 60_000 })
    expect(nets(merged)).not.toEqual({ a: -30_000, b: -30_000 })

    const decoded = decodeTripShare(encodeTripShare(mergeTrips(remote, local)))
    expect(decoded?.expenses[0]?.paidBy).toBe('c')
    expect(decoded?.expenses[0]?.paidBy).not.toBe('a')
    expect(nets(decoded!)).toEqual(nets(merged))
  })

  it('24. merging the same copies either way yields the same people order, rates, and nets', () => {
    const left = trip({
      people: [abc[1], abc[0], abc[2]],
      expenses: [bill({ id: 'e1', paidBy: 'a', amount: 100_000 })],
      rates: { IDR: 1, USD: 15000, JPY: 108 },
      rateTouchedAt: { USD: 40 },
    })
    const right = trip({
      people: [abc[2], abc[0]],
      expenses: [bill({ id: 'e2', paidBy: 'b', amount: 40_000, participantIds: ['a', 'b'] })],
      rates: { IDR: 1, USD: 16200, JPY: 110 },
      rateTouchedAt: { USD: 10, JPY: 20 },
    })
    const ab = mergeTrips(left, right)
    const ba = mergeTrips(right, left)
    expect(ab.people.map((p) => p.id)).toEqual(['a', 'b', 'c'])
    expect(ba.people.map((p) => p.id)).toEqual(['a', 'b', 'c'])
    expect(ab.rates.USD).toBe(15000)
    expect(ba.rates.USD).toBe(15000)
    expect(ab.rates.JPY).toBe(110)
    expect(ba.rates.JPY).toBe(110)
    expect(nets(ab)).toEqual(nets(ba))
    expect(transferKey(ab)).toBe(transferKey(ba))
    expect(liveContentKey(ab)).toBe(liveContentKey(ba))
  })
})

describe('three-phone Japan JPY / IDR', () => {
  it('A dinner + B taxi + late C from the merged snapshot share nets and transfers', () => {
    const people = abc
    const seed = trip({
      name: 'Japan',
      people,
      expenses: [],
      rates: { IDR: 1, JPY: 108, USD: 16200 },
      rateTouchedAt: { JPY: 5 },
    })
    const dinner = bill({
      id: 'dinner',
      paidBy: 'a',
      amount: 12_000,
      currency: 'JPY',
      fxRate: 108,
      participantIds: ['a', 'b', 'c'],
      note: 'Ichiran',
      updatedAt: 20,
    })
    const taxi = bill({
      id: 'taxi',
      paidBy: 'b',
      amount: 4_500,
      currency: 'JPY',
      fxRate: 108,
      participantIds: ['a', 'b', 'c'],
      note: 'Taxi',
      updatedAt: 21,
    })
    const phoneA = { ...seed, expenses: [dinner] }
    const phoneB = { ...seed, expenses: [taxi] }
    const mergedAB = mergeTrips(phoneA, phoneB)
    const mergedBA = mergeTrips(phoneB, phoneA)
    expect(mergedAB.expenses.map((e) => e.id).sort()).toEqual(['dinner', 'taxi'])
    expect(mergedBA.expenses.map((e) => e.id).sort()).toEqual(['dinner', 'taxi'])
    expect(nets(mergedAB)).toEqual(nets(mergedBA))
    expect(transferKey(mergedAB)).toBe(transferKey(mergedBA))

    const snapshot = decodeTripShare(encodeTripShare(mergedAB))
    expect(snapshot).not.toBeNull()
    const phoneC = mergeTrips(seed, snapshot!)
    expect(phoneC.expenses.map((e) => e.id).sort()).toEqual(['dinner', 'taxi'])
    expect(nets(phoneC)).toEqual(nets(mergedAB))
    expect(transferKey(phoneC)).toBe(transferKey(mergedAB))
    expect(computeMinorBalances(phoneC).reduce((s, row) => s + row.net, 0)).toBe(0)

    expect(toBaseMinor(12_000, 'JPY', phoneC, dinner)).toBe(1_296_000)
    expect(toBaseMinor(4_500, 'JPY', phoneC, taxi)).toBe(486_000)
    expect(nets(phoneC)).toEqual({ a: 702_000, b: -108_000, c: -594_000 })
  })
})

describe('already-fixed splits on this branch', () => {
  it('USD 10 at 16,200 / 3 is 54,000 IDR each', () => {
    const t = trip({
      people: abc,
      expenses: [bill({ id: 'usd', paidBy: 'a', amount: 10, currency: 'USD', fxRate: 16200 })],
    })
    const parts = expenseShareMinor(t, t.expenses[0]!)
    expect(parts.get('a')).toBe(54_000)
    expect(parts.get('b')).toBe(54_000)
    expect(parts.get('c')).toBe(54_000)
  })

  it('IDR / JPY / USD equal splits keep the remainder', () => {
    expect(equalShares(100_000, ['a', 'b', 'c'], 'IDR')).toEqual({ a: 33_334, b: 33_333, c: 33_333 })
    expect(equalShares(1_000, ['a', 'b', 'c'], 'JPY')).toEqual({ a: 334, b: 333, c: 333 })
    expect(equalShares(0.01, ['a', 'b', 'c'], 'USD')).toEqual({ a: 0.01, b: 0, c: 0 })
  })

  it('50/50/0 percent never goes negative', () => {
    const amounts = percentToAmounts(1, { a: 50, b: 50, c: 0 }, ['a', 'b', 'c'], 'IDR')
    expect(amounts.a + amounts.b + amounts.c).toBe(1)
    expect(amounts.c).toBe(0)
    expect(percentsMatch100({ a: 50, b: 50, c: 0 }, ['a', 'b', 'c'])).toBe(true)
  })
})

describe('re-saving a locked bill does not snap the trip rate', () => {
  it('keeps trip JPY at 110 and the dinner lock at 105 when only the amount changes', () => {
    const dinner = bill({
      id: 'dinner',
      paidBy: 'a',
      amount: 3_000,
      currency: 'JPY',
      fxRate: 105,
      participantIds: ['a', 'b'],
    })
    const t = trip({
      people: abc.slice(0, 2),
      rates: { IDR: 1, JPY: 110 },
      rateTouchedAt: { JPY: 500 },
      expenses: [dinner],
    })
    const saved = applyExpenseSave(t, { ...dinner, amount: 3_300, fxRate: 105 }, { currency: 'JPY', rate: 105 })
    expect(saved.rates.JPY).toBe(110)
    expect(saved.rateTouchedAt?.JPY).toBe(500)
    expect(saved.expenses[0]?.fxRate).toBe(105)
    expect(saved.expenses[0]?.amount).toBe(3_300)
    expect(toBaseMinor(3_300, 'JPY', saved, saved.expenses[0])).toBe(346_500)
    const taxi = bill({
      id: 'taxi',
      paidBy: 'b',
      amount: 2_000,
      currency: 'JPY',
      participantIds: ['a', 'b'],
    })
    const withTaxi = applyExpenseSave(saved, taxi, { currency: 'JPY', rate: 110 })
    expect(withTaxi.rates.JPY).toBe(110)
    expect(toBaseMinor(2_000, 'JPY', withTaxi, withTaxi.expenses.find((e) => e.id === 'taxi'))).toBe(220_000)
  })
})

describe('convertRatesToNewBase', () => {
  it('refuses leftover old-unit keys when the new base has no rate', () => {
    const next = convertRatesToNewBase({ IDR: 1 }, 'USD')
    expect(next.USD).toBe(1)
    expect(next.IDR).not.toBe(1)
  })
})
