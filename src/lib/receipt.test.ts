import { describe, expect, it } from 'vitest'
import {
  extractJsonObject,
  guessCategoryId,
  inferCurrency,
  normalizeReceiptScan,
  parseAmountValue,
  parseScanDate,
  SCAN_MODELS,
} from './receipt'
import { defaultCategories } from './demo'

const cats = defaultCategories()

describe('parseAmountValue', () => {
  it('reads IDR thousands dots', () => {
    expect(parseAmountValue('88.000', 'IDR')).toBe(88000)
    expect(parseAmountValue('Rp 150.000', 'IDR')).toBe(150000)
  })

  it('reads decimal currencies', () => {
    expect(parseAmountValue('$12.50', 'USD')).toBe(12.5)
    expect(parseAmountValue('1,234.50', 'USD')).toBe(1234.5)
    expect(parseAmountValue('12,50', 'EUR')).toBe(12.5)
  })

  it('accepts numeric totals', () => {
    expect(parseAmountValue(88000, 'IDR')).toBe(88000)
  })
})

describe('inferCurrency', () => {
  it('maps symbols and codes', () => {
    expect(inferCurrency('Rp', 'USD')).toBe('IDR')
    expect(inferCurrency('S$', 'IDR')).toBe('SGD')
    expect(inferCurrency('eur', 'IDR')).toBe('EUR')
    expect(inferCurrency('$', 'IDR')).toBe('USD')
    expect(inferCurrency('$', 'SGD')).toBe('SGD')
  })
})

describe('parseScanDate', () => {
  it('accepts ISO and written 17 September receipt dates', () => {
    expect(parseScanDate('17 September 2026')).toBe('2026-09-17')
    expect(parseScanDate('17th Sep 2026')).toBe('2026-09-17')
    expect(parseScanDate('17/09/2026')).toBe('2026-09-17')
  })

  it('drops nonsense dates', () => {
    expect(parseScanDate('1999-01-01')).toBeUndefined()
  })
})

describe('guessCategoryId', () => {
  it('guesses from merchant text', () => {
    expect(guessCategoryId('Grab * Taxi', cats)).toBe('transport')
    expect(guessCategoryId('Warung Nasi Goreng', cats)).toBe('food')
    expect(guessCategoryId('Random place', cats, 'shopping')).toBe('shopping')
  })
})

describe('normalizeReceiptScan', () => {
  it('prefills amount, IDR, note, date, and category', () => {
    const now = new Date()
    const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const dmy = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`
    const scan = normalizeReceiptScan(
      {
        amount: '88.000',
        currency: 'Rp',
        merchant: 'Warung Made',
        date: dmy,
        category: 'food',
        lineItems: [{ name: 'Nasi campur', amount: 45000 }],
      },
      { baseCurrency: 'IDR', categories: cats },
    )
    expect(scan.amount).toBe(88000)
    expect(scan.currency).toBe('IDR')
    expect(scan.note).toBe('Warung Made')
    expect(scan.date).toBe(iso)
    expect(scan.categoryId).toBe('food')
    expect(scan.lineItems?.[0]?.name).toBe('Nasi campur')
  })

  it('falls back to trip base currency', () => {
    const scan = normalizeReceiptScan({ amount: 20, merchant: 'Snack' }, { baseCurrency: 'IDR', categories: cats })
    expect(scan.currency).toBe('IDR')
    expect(scan.amount).toBe(20)
  })

  it('keeps every line from a long receipt instead of capping at 8', () => {
    const lineItems = Array.from({ length: 24 }, (_, i) => ({
      name: `Item ${i + 1}`,
      amount: (i + 1) * 1000,
    }))
    const scan = normalizeReceiptScan(
      { amount: 300000, merchant: 'Supermarket', lineItems },
      { baseCurrency: 'IDR', categories: cats },
    )
    expect(scan.lineItems).toHaveLength(24)
    expect(scan.lineItems?.[0]?.name).toBe('Item 1')
    expect(scan.lineItems?.[23]?.name).toBe('Item 24')
  })
})

describe('extractJsonObject', () => {
  it('reads fenced json', () => {
    const json = extractJsonObject('```json\n{"amount": 9}\n```') as { amount: number }
    expect(json.amount).toBe(9)
  })
})

describe('Gemini photo scan', () => {
  it('uses current Flash models instead of shut-down 1.5 / 2.0 ids', () => {
    expect(SCAN_MODELS[0]).toBe('gemini-flash-latest')
    expect(SCAN_MODELS.some((model) => model.includes('1.5'))).toBe(false)
    expect(SCAN_MODELS.some((model) => model.includes('2.0'))).toBe(false)
  })
})
