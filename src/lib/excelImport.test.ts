import { describe, expect, it } from 'vitest'
import type { Expense, Trip } from '../types'
import { defaultCategories } from './demo'
import { IMPORT_HEADERS, tripImportTemplateXlsx, tripWorkbookXlsx, unzipStore, workbookXlsx } from './excel'
import { excelSerialToIso, importTripExcel } from './excelImport'

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

describe('excel import', () => {
  it('ships a fillable template with instructions, expenses, friends, and categories', () => {
    const files = unzipStore(tripImportTemplateXlsx(trip()))
    expect(files['xl/workbook.xml']).toContain('sheet name="Instructions"')
    expect(files['xl/workbook.xml']).toContain('sheet name="Expenses"')
    expect(files['xl/workbook.xml']).toContain('sheet name="Friends"')
    expect(files['xl/workbook.xml']).toContain('sheet name="Categories"')
    expect(files['xl/worksheets/sheet2.xml']).toContain('Paid by')
    expect(files['xl/worksheets/sheet2.xml']).toContain('Split between')
    expect(files['xl/worksheets/sheet3.xml']).toContain('Alex')
    expect(IMPORT_HEADERS[0]).toBe('Date')
  })

  it('adds bills from a filled template workbook', async () => {
    const filled = workbookXlsx([
      { name: 'Instructions', rows: [['TripTab Excel import']] },
      {
        name: 'Expenses',
        rows: [
          [...IMPORT_HEADERS],
          ['2026-09-17', 'Warung Made', 88000, 'IDR', 'Alex', 'Alex, Sam', 'Food'],
          ['', '', '', '', '', '', ''],
        ],
      },
    ])
    const result = await importTripExcel(trip(), filled)
    expect(result.added).toBe(1)
    const warung = result.trip.expenses.find((e) => e.note === 'Warung Made')
    expect(warung?.amount).toBe(88000)
    expect(warung?.paidBy).toBe('a')
    expect(warung?.participantIds.sort()).toEqual(['a', 'b'])
    expect(warung?.categoryId).toBe('food')
    expect(warung?.date).toBe('2026-09-17')
  })

  it('creates a new friend named in Paid by', async () => {
    const filled = workbookXlsx([
      {
        name: 'Expenses',
        rows: [
          [...IMPORT_HEADERS],
          ['2026-09-17', 'Coffee', 20, 'USD', 'Riley', '', 'Food'],
        ],
      },
    ])
    const result = await importTripExcel({ ...trip(), expenses: [] }, filled)
    expect(result.added).toBe(1)
    expect(result.trip.people.some((p) => p.name === 'Riley')).toBe(true)
    const coffee = result.trip.expenses[0]!
    expect(coffee.currency).toBe('USD')
    expect(result.trip.people.find((p) => p.id === coffee.paidBy)?.name).toBe('Riley')
  })

  it('re-imports an exported trip workbook', async () => {
    const empty = { ...trip(), expenses: [] }
    const result = await importTripExcel(empty, tripWorkbookXlsx(trip()))
    expect(result.added).toBe(1)
    expect(result.trip.expenses[0]?.note).toBe('Live croissant')
    expect(result.trip.expenses[0]?.amount).toBe(42)
  })

  it('skips a bill that is already on the trip', async () => {
    const result = await importTripExcel(trip(), tripWorkbookXlsx(trip()))
    expect(result.added).toBe(0)
    expect(result.skipped).toBe(1)
    expect(result.trip.expenses).toHaveLength(1)
  })

  it('reads csv with the template headers', async () => {
    const csv = `${IMPORT_HEADERS.join(',')}
2026-09-16,Taxi,150000,IDR,Sam,"Alex, Sam",Transport`
    const result = await importTripExcel({ ...trip(), expenses: [] }, csv)
    expect(result.added).toBe(1)
    expect(result.trip.expenses[0]?.note).toBe('Taxi')
    expect(result.trip.expenses[0]?.categoryId).toBe('transport')
    expect(result.trip.expenses[0]?.paidBy).toBe('b')
  })

  it('maps excel serial dates', () => {
    const serial = (Date.UTC(2026, 8, 18) - Date.UTC(1899, 11, 30)) / 86400000
    expect(excelSerialToIso(serial)).toBe('2026-09-18')
  })
})
