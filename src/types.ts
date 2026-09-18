export type Theme = 'light' | 'dark'

export type SplitMode = 'equal' | 'custom' | 'percent'

export type Person = {
  id: string
  name: string
  color: string
}

export type Category = {
  id: string
  name: string
  emoji: string
}

export type Expense = {
  id: string
  amount: number
  currency: string
  paidBy: string
  participantIds: string[]
  /** Custom amounts (custom mode) or percentages 0–100 (percent mode). */
  shares?: Record<string, number>
  splitMode: SplitMode
  categoryId: string
  note: string
  date: string
  createdAt: number
  updatedAt?: number
}

export type Trip = {
  id: string
  name: string
  emoji: string
  startDate: string
  endDate: string
  baseCurrency: string
  /** Pinned photo backdrop. When omitted, the destination is inferred from name/emoji. */
  destinationId?: string
  people: Person[]
  categories: Category[]
  expenses: Expense[]
  /** Units of base currency per 1 unit of this currency. */
  rates: Record<string, number>
  ratesUpdatedAt?: string
  isDemo?: boolean
  createdAt: number
  updatedAt: number
  /** Public room id so friends can add expenses from another phone. */
  shareId?: string
  deletedExpenseIds?: string[]
  /** Person id of whoever last saved this trip on any phone. */
  updatedBy?: string
  updatedByName?: string
}

export type AppData = {
  version: 1
  theme: Theme
  currentTripId: string | null
  trips: Trip[]
}

export type Transfer = {
  fromId: string
  toId: string
  amount: number
}

export type PersonBalance = {
  personId: string
  /** What they covered on group purchases (settle-up is not spend). */
  paid: number
  /** Their cut of each bill (equal / custom / percent). */
  share: number
  /** Settle-up transfers: positive = they paid a friend back. */
  settled: number
  /** paid − share + settled. Positive = is owed. */
  net: number
}
