import { describe, expect, it } from 'vitest'
import type { Expense, Trip } from '../types'
import { defaultCategories } from './demo'
import { allTripsWorkbookXlsx, unzipStore, zipStore, tripWorkbookXlsx, XLSX_MIME } from './excel'

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
  it('writes a real xlsx zip iPhone can open, not SpreadsheetML xml', () => {
    const bytes = tripWorkbookXlsx(trip())
    expect(bytes[0]).toBe(0x50)
    expect(bytes[1]).toBe(0x4b)
    expect(bytes[2]).toBe(3)
    expect(bytes[3]).toBe(4)
    expect(new TextDecoder().decode(bytes.subarray(0, 2))).not.toBe('<?')
    const files = unzipStore(bytes)
    expect(files['xl/workbook.xml']).toContain('sheet name="Expenses"')
    expect(files['xl/workbook.xml']).toContain('sheet name="Balances"')
    expect(files['xl/workbook.xml']).toContain('sheet name="Settle up"')
    expect(files['xl/worksheets/sheet1.xml']).toContain('Live croissant')
    expect(files['xl/worksheets/sheet1.xml']).toContain('Alex')
    expect(files['xl/worksheets/sheet1.xml']).toContain('>42</v>')
    expect(files['xl/worksheets/sheet1.xml']).toContain('Shares')
    expect(files['xl/worksheets/sheet1.xml']).toContain('Share (Alex)')
    expect(files['xl/worksheets/sheet1.xml']).toContain('Share (Sam)')
    expect(files['xl/worksheets/sheet2.xml']).toContain('To pay %')
    expect(files['xl/worksheets/sheet2.xml']).toContain('Have paid %')
    expect(XLSX_MIME).toContain('spreadsheetml.sheet')
  })

  it('exports every trip without a row cap', () => {
    const many = trip()
    many.expenses = Array.from({ length: 12 }, (_, i) => ({
      ...many.expenses[0]!,
      id: `e${i}`,
      note: `Bill line ${i + 1}`,
      amount: (i + 1) * 3,
    }))
    const files = unzipStore(allTripsWorkbookXlsx([many]))
    const sheet = files['xl/worksheets/sheet1.xml'] ?? ''
    expect(sheet).toContain('Bill line 1')
    expect(sheet).toContain('Bill line 8')
    expect(sheet).toContain('Bill line 12')
    expect(sheet).toContain('Sync Cafe')
  })

  it('round-trips zip entries', () => {
    const payload = new TextEncoder().encode('hello trip')
    const zipped = zipStore([{ name: 'hello.txt', data: payload }])
    expect(unzipStore(zipped)['hello.txt']).toBe('hello trip')
  })
})
