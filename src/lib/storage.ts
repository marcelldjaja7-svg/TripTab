import type { AppData, Category, Expense, Person, Trip } from '../types'
import { CURRENCY_CODES, DEFAULT_BASE_CURRENCY, ratesForBase } from './currencies'
import { PERSON_COLORS } from './colors'
import { parseExpenseDate } from './dates'
import { defaultCategories } from './demo'

export const STORAGE_KEY = 'triptab.v1'

export function defaultAppData(): AppData {
  return {
    version: 1,
    theme: 'dark',
    currentTripId: null,
    trips: [],
  }
}

export function loadAppData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultAppData()
    const parsed = JSON.parse(raw) as unknown
    const data = normalizeAppData(parsed)
    return data ?? defaultAppData()
  } catch {
    return defaultAppData()
  }
}

export function saveAppData(data: AppData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function normalizeAppData(input: unknown): AppData | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Record<string, unknown>
  const tripsIn = Array.isArray(raw.trips) ? raw.trips : Array.isArray(raw) ? raw : null
  if (!tripsIn) {
    if (isTripLike(raw)) {
      const trip = normalizeTrip(raw)
      return trip
        ? { version: 1, theme: 'dark', currentTripId: trip.id, trips: [trip] }
        : null
    }
    return null
  }
  const trips = tripsIn.map(normalizeTrip).filter((t): t is Trip => Boolean(t))
  const theme = raw.theme === 'light' ? 'light' : 'dark'
  const currentTripId = typeof raw.currentTripId === 'string' ? raw.currentTripId : trips[0]?.id ?? null
  return { version: 1, theme, currentTripId, trips }
}

function isTripLike(raw: Record<string, unknown>): boolean {
  return typeof raw.name === 'string' && Array.isArray(raw.people) && Array.isArray(raw.expenses)
}

export function normalizeTrip(input: unknown): Trip | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Record<string, unknown>
  if (typeof raw.name !== 'string') return null
  const people = Array.isArray(raw.people) ? raw.people.map(normalizePerson).filter((p): p is Person => Boolean(p)) : []
  const categories = Array.isArray(raw.categories)
    ? raw.categories.map(normalizeCategory).filter((c): c is Category => Boolean(c))
    : defaultCategories()
  const catIds = new Set(categories.map((c) => c.id))
  if (!catIds.has('settlement')) {
    const extras = defaultCategories().filter((c) => !catIds.has(c.id))
    categories.push(...extras)
  }
  const baseCurrency =
    typeof raw.baseCurrency === 'string' && raw.baseCurrency.length === 3
      ? raw.baseCurrency.toUpperCase()
      : DEFAULT_BASE_CURRENCY
  const ratesRaw = raw.rates && typeof raw.rates === 'object' ? (raw.rates as Record<string, unknown>) : {}
  const rates = { ...ratesForBase(baseCurrency) }
  for (const [code, value] of Object.entries(ratesRaw)) {
    if (typeof value === 'number' && value > 0) rates[code] = value
  }
  rates[baseCurrency] = 1
  const expenses = Array.isArray(raw.expenses)
    ? raw.expenses.map((e) => normalizeExpense(e, people, categories)).filter((e): e is Expense => Boolean(e))
    : []

  return {
    id: typeof raw.id === 'string' ? raw.id : crypto.randomUUID(),
    name: raw.name.trim() || 'Untitled trip',
    emoji: typeof raw.emoji === 'string' && raw.emoji ? raw.emoji : '✈️',
    startDate: typeof raw.startDate === 'string' ? raw.startDate : '',
    endDate: typeof raw.endDate === 'string' ? raw.endDate : '',
    baseCurrency,
    destinationId: typeof raw.destinationId === 'string' && raw.destinationId ? raw.destinationId : undefined,
    people,
    categories,
    expenses,
    rates,
    ratesUpdatedAt: typeof raw.ratesUpdatedAt === 'string' ? raw.ratesUpdatedAt : undefined,
    isDemo: Boolean(raw.isDemo),
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
    shareId: typeof raw.shareId === 'string' ? raw.shareId : undefined,
    deletedExpenseIds: Array.isArray(raw.deletedExpenseIds)
      ? raw.deletedExpenseIds.filter((id): id is string => typeof id === 'string')
      : undefined,
    updatedBy: typeof raw.updatedBy === 'string' ? raw.updatedBy : undefined,
    updatedByName: typeof raw.updatedByName === 'string' && raw.updatedByName.trim() ? raw.updatedByName.trim() : undefined,
  }
}

function normalizePerson(input: unknown): Person | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Record<string, unknown>
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string') return null
  return {
    id: raw.id,
    name: raw.name.trim() || 'Friend',
    color: typeof raw.color === 'string' ? raw.color : PERSON_COLORS[0],
  }
}

function normalizeCategory(input: unknown): Category | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Record<string, unknown>
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string') return null
  return {
    id: raw.id,
    name: raw.name.trim() || 'Other',
    emoji: typeof raw.emoji === 'string' && raw.emoji ? raw.emoji : '📦',
  }
}

function normalizeExpense(
  input: unknown,
  people: Person[],
  categories: Category[],
): Expense | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Record<string, unknown>
  const amount = typeof raw.amount === 'number' ? raw.amount : Number(raw.amount)
  if (!Number.isFinite(amount) || amount < 0) return null
  const peopleIds = new Set(people.map((p) => p.id))
  const paidBy = typeof raw.paidBy === 'string' && peopleIds.has(raw.paidBy) ? raw.paidBy : people[0]?.id
  if (!paidBy) return null
  const participantIds = Array.isArray(raw.participantIds)
    ? raw.participantIds.filter((id): id is string => typeof id === 'string' && peopleIds.has(id))
    : people.map((p) => p.id)
  if (participantIds.length === 0) return null
  const currency =
    typeof raw.currency === 'string' && raw.currency.length === 3
      ? raw.currency.toUpperCase()
      : DEFAULT_BASE_CURRENCY
  const categoryId =
    typeof raw.categoryId === 'string' && categories.some((c) => c.id === raw.categoryId)
      ? raw.categoryId
      : categories[0]?.id ?? 'other'
  const shares =
    raw.shares && typeof raw.shares === 'object'
      ? Object.fromEntries(
          Object.entries(raw.shares as Record<string, unknown>)
            .filter(([id, n]) => participantIds.includes(id) && typeof n === 'number')
            .map(([id, n]) => [id, n as number]),
        )
      : undefined
  const splitMode = raw.splitMode === 'custom' || raw.splitMode === 'percent' ? raw.splitMode : 'equal'
  return {
    id: typeof raw.id === 'string' ? raw.id : crypto.randomUUID(),
    amount,
    currency: CURRENCY_CODES.includes(currency) || currency.length === 3 ? currency : DEFAULT_BASE_CURRENCY,
    paidBy,
    participantIds,
    shares,
    splitMode,
    categoryId,
    note: typeof raw.note === 'string' ? raw.note : '',
    date: parseExpenseDate(raw.date) ?? '',
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : undefined,
  }
}
