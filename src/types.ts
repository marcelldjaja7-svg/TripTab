export type Theme = 'light' | 'dark'

export type SplitMode = 'equal' | 'custom' | 'percent'

export type Person = {
  id: string
  name: string
  color: string
  /** When this friend was last renamed, recolored, or added. Used to merge live copies. */
  updatedAt?: number
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
  /** Monotonic save count for this bill. Merge prefers the higher rev over wall clocks. */
  rev?: number
  /** Units of the trip base per 1 of this currency, locked when the bill was saved. */
  fxRate?: number
  /** Items identified from a receipt photo. Optional; never required to split. */
  lineItems?: { name: string; amount: number }[]
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
  /** When each rate key was last edited, so USD and EUR changes merge independently. */
  rateTouchedAt?: Record<string, number>
  /** When the settle currency was last switched — not the newest bill. */
  baseUpdatedAt?: number
  /** When a category was last renamed or added. */
  categoriesUpdatedAt?: number
  ratesUpdatedAt?: string
  isDemo?: boolean
  createdAt: number
  updatedAt: number
  /** Public room id so friends can add expenses from another phone. */
  shareId?: string
  deletedExpenseIds?: string[]
  /** Friends removed on any phone — merge uses this so they stay gone. */
  deletedPersonIds?: string[]
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
  /** Cards they swiped for purchases (settle-up is not spend). */
  paid: number
  /** Their portion of each bill — what they have to pay of the trip. */
  share: number
  /** Settle-up transfers: positive = they paid a friend back. */
  settled: number
  /** paid + settled — what they have paid toward the trip after settle-up. */
  funded: number
  /** paid − share + settled. Positive = is owed. */
  net: number
}
