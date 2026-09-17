import type { Expense } from '../types'

export type ExpenseFilter = {
  personIds: string[]
  categoryIds: string[]
}

export const EMPTY_FILTER: ExpenseFilter = { personIds: [], categoryIds: [] }

export function isFilterActive(filter: ExpenseFilter): boolean {
  return filter.personIds.length > 0 || filter.categoryIds.length > 0
}

export function filterChipCount(filter: ExpenseFilter): number {
  return filter.personIds.length + filter.categoryIds.length
}

export function expenseMatchesFilter(expense: Expense, filter: ExpenseFilter): boolean {
  if (filter.personIds.length > 0) {
    const involved = new Set([expense.paidBy, ...expense.participantIds])
    if (!filter.personIds.some((id) => involved.has(id))) return false
  }
  if (filter.categoryIds.length > 0 && !filter.categoryIds.includes(expense.categoryId)) {
    return false
  }
  return true
}

export function filterExpenses(expenses: Expense[], filter: ExpenseFilter): Expense[] {
  if (!isFilterActive(filter)) return expenses
  return expenses.filter((expense) => expenseMatchesFilter(expense, filter))
}

export function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
}
