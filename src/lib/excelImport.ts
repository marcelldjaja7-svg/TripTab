import { nextPersonColor } from './colors'
import { parseExpenseDate, todayISO } from './dates'
import { readZip } from './excel'
import { guessCategoryId, inferCurrency, parseAmountValue } from './receipt'
import type { Expense, Person, SplitMode, Trip } from '../types'
import { uid } from './utils'

export type ExcelImportResult = {
  trip: Trip
  added: number
  skipped: number
  warnings: string[]
}

const SKIP_SHEETS = new Set(['instructions', 'friends', 'categories', 'balances', 'settle up', 'settle'])

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

function textOf(xml: string): string {
  return [...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map((m) => decodeXml(m[1] ?? '')).join('')
}

function parseSharedStrings(xml: string): string[] {
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gi)].map((m) => textOf(m[1] ?? ''))
}

function colIndex(letters: string): number {
  let n = 0
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function cellValue(inner: string, attrs: string, shared: string[]): string | number {
  const type = attrs.match(/\bt="([^"]+)"/i)?.[1]?.toLowerCase()
  if (type === 'inlinestr') return textOf(inner)
  const raw = inner.match(/<v\b[^>]*>([\s\S]*?)<\/v>/i)?.[1] ?? ''
  const decoded = decodeXml(raw.trim())
  if (type === 's') return shared[Number(decoded)] ?? ''
  if (type === 'str' || type === 'e') return decoded
  if (decoded !== '' && Number.isFinite(Number(decoded))) return Number(decoded)
  return decoded
}

function parseSheetGrid(xml: string, shared: string[]): (string | number)[][] {
  const rows: (string | number)[][] = []
  for (const match of xml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi)) {
    const attrs = match[1] ?? ''
    const ref = attrs.match(/\br="([A-Z]+)(\d+)"/i)
    if (!ref) continue
    const c = colIndex(ref[1]!)
    const r = Number(ref[2]) - 1
    if (r < 0 || r > 4000 || c < 0 || c > 40) continue
    while (rows.length <= r) rows.push([])
    const row = rows[r]!
    while (row.length <= c) row.push('')
    row[c] = cellValue(match[2] ?? '', attrs, shared)
  }
  return rows
}

function parseWorkbookSheets(workbookXml: string): { name: string; id: string }[] {
  return [...workbookXml.matchAll(/<sheet\b[^>]*>/gi)].flatMap((m) => {
    const tag = m[0]
    const name = tag.match(/\bname="([^"]+)"/i)?.[1]
    const id = tag.match(/\br:id="([^"]+)"/i)?.[1]
    return name && id ? [{ name: decodeXml(name), id }] : []
  })
}

function parseRels(xml: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of xml.matchAll(/<Relationship\b[^>]*>/gi)) {
    const id = m[0].match(/\bId="([^"]+)"/)?.[1]
    const target = m[0].match(/\bTarget="([^"]+)"/)?.[1]
    if (id && target) out[id] = target.replace(/^\.\//, '')
  }
  return out
}

function headerKey(label: string): string {
  return String(label).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

type Cols = {
  date?: number
  note?: number
  amount?: number
  currency?: number
  paidBy?: number
  participants?: number
  category?: number
  splitMode?: number
}

function mapHeaders(row: (string | number)[]): Cols | null {
  const cols: Cols = {}
  row.forEach((cell, i) => {
    const key = headerKey(String(cell ?? ''))
    if (key === 'date' || key === 'tanggal') cols.date = i
    else if (key === 'note' || key === 'description' || key === 'merchant' || key === 'item' || key === 'title') cols.note = i
    else if (key === 'amount' || key === 'total') cols.amount = i
    else if (key === 'currency' || key === 'curr') cols.currency = i
    else if (key === 'paid by' || key === 'paidby' || key === 'payer' || key === 'who paid') cols.paidBy = i
    else if (
      key === 'split between' ||
      key === 'participants' ||
      key === 'split with' ||
      key === 'split among' ||
      key === 'for'
    ) {
      cols.participants = i
    } else if (key === 'category' || key === 'cat') cols.category = i
    else if (key === 'split') cols.splitMode = i
  })
  if (cols.amount === undefined || (cols.paidBy === undefined && cols.note === undefined)) return null
  return cols
}

function scoreGrid(rows: (string | number)[]): number {
  const cols = mapHeaders(rows)
  if (!cols || cols.amount === undefined) return 0
  let n = 2
  if (cols.date !== undefined) n += 2
  if (cols.paidBy !== undefined) n += 2
  if (cols.note !== undefined) n += 1
  if (cols.participants !== undefined) n += 1
  return n
}

export function excelSerialToIso(serial: number): string | undefined {
  if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) return undefined
  const utc = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000
  const d = new Date(utc)
  const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
  return parseExpenseDate(iso)
}

function cellDate(raw: string | number | undefined): string {
  if (typeof raw === 'number') return excelSerialToIso(raw) ?? parseExpenseDate(raw) ?? todayISO()
  return parseExpenseDate(raw) ?? todayISO()
}

function cellText(raw: string | number | undefined): string {
  if (raw === undefined || raw === null) return ''
  return String(raw).trim()
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const src = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i += 1
        } else quoted = false
      } else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else if (ch !== '\r') cell += ch
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

function ensurePerson(people: Person[], name: string): Person {
  const key = name.trim().toLowerCase()
  const existing = people.find((p) => p.name.trim().toLowerCase() === key)
  if (existing) return existing
  const person: Person = {
    id: uid(),
    name: name.trim(),
    color: nextPersonColor(people.map((p) => p.color)),
  }
  people.push(person)
  return person
}

function namesList(raw: string): string[] {
  return raw
    .split(/[,;/|]/)
    .map((n) => n.trim())
    .filter(Boolean)
}

function expenseKey(expense: Pick<Expense, 'date' | 'amount' | 'currency' | 'note' | 'paidBy'>): string {
  return `${expense.date}|${expense.amount}|${expense.currency}|${expense.note.trim().toLowerCase()}|${expense.paidBy}`
}

function splitModeOf(raw: string): SplitMode {
  const v = raw.trim().toLowerCase()
  if (v === 'custom' || v === 'amounts') return 'custom'
  if (v === 'percent' || v === '%') return 'percent'
  return 'equal'
}

export function importExpenseRows(trip: Trip, rows: (string | number)[][]): ExcelImportResult {
  const warnings: string[] = []
  if (rows.length === 0) {
    return { trip, added: 0, skipped: 0, warnings: ['No rows in that file'] }
  }
  let headerAt = 0
  let cols = mapHeaders(rows[0] ?? [])
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    const mapped = mapHeaders(rows[i] ?? [])
    if (mapped && scoreGrid(rows[i] ?? []) >= (cols ? scoreGrid(rows[headerAt] ?? []) : 0)) {
      cols = mapped
      headerAt = i
    }
  }
  if (!cols || cols.amount === undefined) {
    return { trip, added: 0, skipped: 0, warnings: ['Need a header row with Amount, plus Date or Paid by'] }
  }

  const people = [...trip.people]
  const existing = new Set(trip.expenses.map(expenseKey))
  const added: Expense[] = []
  let skipped = 0

  for (let r = headerAt + 1; r < rows.length; r++) {
    const row = rows[r] ?? []
    const note = cellText(row[cols.note ?? -1])
    const paidName = cellText(row[cols.paidBy ?? -1])
    const currencyHint = inferCurrency(cellText(row[cols.currency ?? -1]), trip.baseCurrency) ?? trip.baseCurrency
    const amount = parseAmountValue(row[cols.amount], currencyHint)
    if (amount === undefined) {
      if (note || paidName) {
        skipped += 1
        warnings.push(`Row ${r + 1}: missing amount`)
      }
      continue
    }
    if (!paidName) {
      skipped += 1
      warnings.push(`Row ${r + 1}: missing Paid by`)
      continue
    }
    const payer = ensurePerson(people, paidName)
    const splitNames = namesList(cellText(row[cols.participants ?? -1]))
    const participants = (splitNames.length ? splitNames : people.map((p) => p.name)).map((n) => ensurePerson(people, n))
    const participantIds = [...new Set(participants.map((p) => p.id))]
    if (!participantIds.includes(payer.id)) participantIds.push(payer.id)
    const categoryHint = cellText(row[cols.category ?? -1])
    const categoryId =
      guessCategoryId(`${note} ${categoryHint}`, trip.categories, categoryHint || undefined) ??
      trip.categories.find((c) => c.id === 'other')?.id ??
      trip.categories[0]?.id ??
      'other'
    const expense: Expense = {
      id: uid(),
      amount,
      currency: currencyHint,
      paidBy: payer.id,
      participantIds,
      splitMode: splitModeOf(cellText(row[cols.splitMode ?? -1])),
      categoryId,
      note,
      date: cellDate(row[cols.date ?? -1]),
      createdAt: Date.now() + r,
    }
    const key = expenseKey(expense)
    if (existing.has(key)) {
      skipped += 1
      continue
    }
    existing.add(key)
    added.push(expense)
  }

  const currencies = new Set(added.map((e) => e.currency))
  const rates = { ...trip.rates }
  for (const code of currencies) {
    if (rates[code] === undefined) rates[code] = code === trip.baseCurrency ? 1 : 1
  }

  return {
    trip: {
      ...trip,
      people,
      expenses: [...trip.expenses, ...added],
      rates,
    },
    added: added.length,
    skipped,
    warnings,
  }
}

function pickExpenseGrid(sheets: { name: string; rows: (string | number)[][] }[]): (string | number)[][] {
  const named = sheets.find((s) => s.name.trim().toLowerCase() === 'expenses')
  if (named && named.rows.length) return named.rows
  let best: (string | number)[][] = []
  let bestScore = 0
  for (const sheet of sheets) {
    if (SKIP_SHEETS.has(sheet.name.trim().toLowerCase())) continue
    const header = sheet.rows.find((row) => mapHeaders(row)) ?? sheet.rows[0]
    const score = scoreGrid(header ?? [])
    if (score > bestScore) {
      bestScore = score
      best = sheet.rows
    }
  }
  return best
}

async function gridsFromXlsx(bytes: Uint8Array): Promise<{ name: string; rows: (string | number)[][] }[]> {
  const files = await readZip(bytes)
  const decoder = new TextDecoder()
  const workbook = decoder.decode(files['xl/workbook.xml'] ?? new Uint8Array())
  const rels = parseRels(decoder.decode(files['xl/_rels/workbook.xml.rels'] ?? new Uint8Array()))
  const shared = parseSharedStrings(decoder.decode(files['xl/sharedStrings.xml'] ?? new Uint8Array()))
  const sheets = parseWorkbookSheets(workbook)
  return sheets.map((sheet, i) => {
    const target = rels[sheet.id] ?? `worksheets/sheet${i + 1}.xml`
    const path = target.startsWith('xl/') ? target : `xl/${target}`
    const xml = decoder.decode(files[path] ?? files[path.replace(/^xl\//, '')] ?? new Uint8Array())
    return { name: sheet.name, rows: parseSheetGrid(xml, shared) }
  })
}

export async function importTripExcel(trip: Trip, input: Uint8Array | string): Promise<ExcelImportResult> {
  if (typeof input === 'string') {
    return importExpenseRows(trip, parseCsv(input))
  }
  if (input.length >= 2 && input[0] === 0x50 && input[1] === 0x4b) {
    const sheets = await gridsFromXlsx(input)
    const rows = pickExpenseGrid(sheets)
    if (rows.length === 0) return { trip, added: 0, skipped: 0, warnings: ['No Expenses sheet with Date / Amount / Paid by'] }
    return importExpenseRows(trip, rows)
  }
  const text = new TextDecoder().decode(input).trim()
  if (text.includes(',') && /date|amount|paid/i.test(text.slice(0, 200))) {
    return importExpenseRows(trip, parseCsv(text))
  }
  return { trip, added: 0, skipped: 0, warnings: ['Use the Excel template (.xlsx) or a CSV with the same headers'] }
}
