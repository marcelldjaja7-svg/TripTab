import { describe, expect, it } from 'vitest'
import { expenseMatchesFilter, filterExpenses, toggleId } from './filter'
import type { Expense } from '../types'

function bill(over: Partial<Expense> & Pick<Expense, 'id' | 'paidBy' | 'categoryId'>): Expense {
  return {
    amount: 10,
    currency: 'DKK',
    participantIds: [over.paidBy],
    splitMode: 'equal',
    note: over.id,
    date: '2026-09-16',
    createdAt: 1,
    ...over,
  }
}

describe('expense filters', () => {
  const food = bill({ id: 'food', paidBy: 'e', categoryId: 'food', participantIds: ['e', 'n'] })
  const taxi = bill({ id: 'taxi', paidBy: 'n', categoryId: 'transport', participantIds: ['n'] })
  const stay = bill({ id: 'stay', paidBy: 'e', categoryId: 'lodging', participantIds: ['e', 'n'] })

  it('shows every bill when nothing is selected', () => {
    expect(filterExpenses([food, taxi, stay], { personIds: [], categoryIds: [] })).toHaveLength(3)
  })

  it('keeps bills a friend paid or split', () => {
    const onlyN = filterExpenses([food, taxi, stay], { personIds: ['n'], categoryIds: [] })
    expect(onlyN.map((e) => e.id).sort()).toEqual(['food', 'stay', 'taxi'])
    expect(expenseMatchesFilter(taxi, { personIds: ['e'], categoryIds: [] })).toBe(false)
  })

  it('intersects people and categories', () => {
    const filtered = filterExpenses([food, taxi, stay], { personIds: ['e'], categoryIds: ['food'] })
    expect(filtered.map((e) => e.id)).toEqual(['food'])
  })

  it('toggles chip ids', () => {
    expect(toggleId(['food'], 'transport')).toEqual(['food', 'transport'])
    expect(toggleId(['food', 'transport'], 'food')).toEqual(['transport'])
  })
})
