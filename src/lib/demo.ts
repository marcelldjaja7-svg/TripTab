import type { Category, Expense, Trip } from '../types'
import { PERSON_COLORS } from './colors'
import { ratesForBase } from './currencies'
import { uid } from './utils'

export function defaultCategories(): Category[] {
  return [
    { id: 'food', name: 'Food', emoji: '🍜' },
    { id: 'transport', name: 'Transport', emoji: '🚕' },
    { id: 'lodging', name: 'Lodging', emoji: '🏨' },
    { id: 'activities', name: 'Activities', emoji: '🎟️' },
    { id: 'shopping', name: 'Shopping', emoji: '🛍️' },
    { id: 'other', name: 'Other', emoji: '📦' },
    { id: 'settlement', name: 'Settle up', emoji: '💸' },
  ]
}

function exp(
  partial: Omit<Expense, 'id' | 'createdAt'> & { createdAt?: number },
): Expense {
  return {
    id: uid(),
    createdAt: partial.createdAt ?? Date.now(),
    ...partial,
  }
}

export function createDemoTrip(): Trip {
  const maya = uid()
  const jordan = uid()
  const priya = uid()
  const alex = uid()
  const now = Date.now()

  return {
    id: uid(),
    name: 'Bali Escape',
    emoji: '🏝️',
    destinationId: 'bali',
    startDate: '2026-09-12',
    endDate: '2026-09-20',
    baseCurrency: 'IDR',
    isDemo: true,
    createdAt: now,
    updatedAt: now,
    rates: ratesForBase('IDR'),
    people: [
      { id: maya, name: 'Maya', color: PERSON_COLORS[0] },
      { id: jordan, name: 'Jordan', color: PERSON_COLORS[1] },
      { id: priya, name: 'Priya', color: PERSON_COLORS[2] },
      { id: alex, name: 'Alex', color: PERSON_COLORS[3] },
    ],
    categories: defaultCategories(),
    expenses: [
      exp({
        amount: 450_000,
        currency: 'IDR',
        paidBy: jordan,
        participantIds: [maya, jordan, priya, alex],
        splitMode: 'equal',
        categoryId: 'transport',
        note: 'Airport taxi from DPS',
        date: '2026-09-12',
      }),
      exp({
        amount: 240,
        currency: 'USD',
        paidBy: priya,
        participantIds: [maya, jordan, priya, alex],
        splitMode: 'equal',
        categoryId: 'lodging',
        note: 'Canggu villa, 2 nights',
        date: '2026-09-12',
      }),
      exp({
        amount: 320_000,
        currency: 'IDR',
        paidBy: maya,
        participantIds: [maya, jordan, priya, alex],
        splitMode: 'equal',
        categoryId: 'food',
        note: 'Nasi campur welcome dinner',
        date: '2026-09-12',
      }),
      exp({
        amount: 40,
        currency: 'SGD',
        paidBy: alex,
        participantIds: [maya, alex],
        splitMode: 'percent',
        shares: { [maya]: 70, [alex]: 30 },
        categoryId: 'transport',
        note: 'Scooter rental',
        date: '2026-09-13',
      }),
      exp({
        amount: 85_000,
        currency: 'IDR',
        paidBy: priya,
        participantIds: [priya, jordan],
        splitMode: 'equal',
        categoryId: 'food',
        note: 'Coffee crawl',
        date: '2026-09-13',
      }),
      exp({
        amount: 75,
        currency: 'USD',
        paidBy: maya,
        participantIds: [maya, jordan, priya],
        splitMode: 'equal',
        categoryId: 'activities',
        note: 'Sunrise boat + snorkel',
        date: '2026-09-14',
      }),
      exp({
        amount: 160_000,
        currency: 'IDR',
        paidBy: alex,
        participantIds: [maya, jordan, priya, alex],
        splitMode: 'equal',
        categoryId: 'activities',
        note: 'Temple tickets',
        date: '2026-09-14',
      }),
      exp({
        amount: 210_000,
        currency: 'IDR',
        paidBy: jordan,
        participantIds: [maya, jordan, priya, alex],
        splitMode: 'custom',
        shares: {
          [maya]: 40_000,
          [jordan]: 70_000,
          [priya]: 50_000,
          [alex]: 50_000,
        },
        categoryId: 'food',
        note: 'Night market snacks',
        date: '2026-09-14',
      }),
      exp({
        amount: 18,
        currency: 'USD',
        paidBy: priya,
        participantIds: [maya, jordan, priya, alex],
        splitMode: 'equal',
        categoryId: 'shopping',
        note: 'Sarongs for the temple',
        date: '2026-09-15',
      }),
    ],
  }
}

export function emptyTrip(name: string, emoji: string, baseCurrency: string, destinationId?: string): Trip {
  const now = Date.now()
  return {
    id: uid(),
    name: name.trim() || 'Untitled trip',
    emoji: emoji || '✈️',
    startDate: '',
    endDate: '',
    baseCurrency,
    destinationId,
    people: [],
    categories: defaultCategories(),
    expenses: [],
    rates: ratesForBase(baseCurrency),
    createdAt: now,
    updatedAt: now,
  }
}
