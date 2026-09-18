import { describe, expect, it } from 'vitest'
import type { Expense, Trip } from '../types'
import { defaultCategories } from './demo'
import { allTripsWorkbookXml, tripWorkbookXml } from './excel'

function trip(): Trip {
  const expense: Expense = {
    id: 'e1',
    amount: 42,
    currency: 'IDR',
    paidBy: 'a',
    participantIds: ['a', 'b'],
    splitMode: 'equal',
    categoryId: 'food',
    note: 'Live croissant',
    date: '2026-09-18',
    createdAt: 1,
  }
  return {
    id: 't',
    name: 'Sync Cafe',
    emoji: '☕',
    startDate: '',
    endDate: '',
    baseCurrency: 'IDR',
    categories: defaultCategories(),
    rates: { IDR: 1 },
    createdAt: 1,
    updatedAt: 2,
    updatedByName: 'Alex',
    people: [
      { id: 'a', name: 'Alex', color: '#000' },
      { id: 'b', name: 'Sam', color: '#111' },
    ],
    expenses: [expense],
  }
}

describe('excel export', () => {
  it('includes expenses, balances, and settle sheets', () => {
    const xml = tripWorkbookXml(trip())
    expect(xml).toContain('ss:Name="Expenses"')
    expect(xml).toContain('ss:Name="Balances"')
    expect(xml).toContain('ss:Name="Settle up"')
    expect(xml).toContain('Live croissant')
    expect(xml).toContain('Alex')
    expect(xml).toContain('42')
  })

  it('exports every trip without a row cap', () => {
    const many = trip()
    many.expenses = Array.from({ length: 12 }, (_, i) => ({
      ...many.expenses[0]!,
      id: `e${i}`,
      note: `Bill line ${i + 1}`,
      amount: (i + 1) * 3,
    }))
    const xml = allTripsWorkbookXml([many])
    expect(xml).toContain('Bill line 1')
    expect(xml).toContain('Bill line 8')
    expect(xml).toContain('Bill line 12')
    expect(xml).toContain('Sync Cafe')
  })
})
