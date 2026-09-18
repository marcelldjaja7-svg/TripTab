import type { Trip } from '../types'
import { toBase } from './money'
import { computeBalances, suggestedTransfers } from './settle'
import { slugify } from './share'

function xml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function strCell(value: string): string {
  return `<Cell><Data ss:Type="String">${xml(value)}</Data></Cell>`
}

function numCell(value: number): string {
  const n = Number.isFinite(value) ? value : 0
  return `<Cell><Data ss:Type="Number">${n}</Data></Cell>`
}

function headerRow(labels: string[]): string {
  return `<Row>${labels.map((label) => `<Cell ss:StyleID="header"><Data ss:Type="String">${xml(label)}</Data></Cell>`).join('')}</Row>`
}

function sheet(name: string, rows: string): string {
  return `<Worksheet ss:Name="${xml(name.slice(0, 31))}"><Table>${rows}</Table></Worksheet>`
}

function peopleNames(trip: Trip): Map<string, string> {
  return new Map(trip.people.map((p) => [p.id, p.name]))
}

function expenseRows(trip: Trip): string {
  const names = peopleNames(trip)
  const cats = new Map(trip.categories.map((c) => [c.id, c]))
  const sorted = [...trip.expenses].sort(
    (a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt,
  )
  const head = headerRow([
    'Date',
    'Note',
    'Category',
    'Paid by',
    'Amount',
    'Currency',
    `Amount (${trip.baseCurrency})`,
    'Split',
    'Participants',
  ])
  const body = sorted
    .map((expense) => {
      const cat = cats.get(expense.categoryId)
      const participants = expense.participantIds.map((id) => names.get(id) ?? 'Friend').join(', ')
      return `<Row>${strCell(expense.date || '')}${strCell(expense.note.trim() || cat?.name || 'Expense')}${strCell(cat?.name ?? '')}${strCell(names.get(expense.paidBy) ?? 'Friend')}${numCell(expense.amount)}${strCell(expense.currency)}${numCell(toBase(expense.amount, expense.currency, trip))}${strCell(expense.splitMode)}${strCell(participants)}</Row>`
    })
    .join('')
  return head + body
}

function balanceRows(trip: Trip): string {
  const names = peopleNames(trip)
  const head = headerRow(['Person', `Paid (${trip.baseCurrency})`, `Share (${trip.baseCurrency})`, `Net (${trip.baseCurrency})`])
  const body = computeBalances(trip)
    .map((row) => {
      return `<Row>${strCell(names.get(row.personId) ?? 'Friend')}${numCell(row.paid)}${numCell(row.share)}${numCell(row.net)}</Row>`
    })
    .join('')
  return head + body
}

function settleRows(trip: Trip): string {
  const names = peopleNames(trip)
  const transfers = suggestedTransfers(trip)
  const head = headerRow(['From', 'To', `Amount (${trip.baseCurrency})`])
  if (transfers.length === 0) {
    return `${head}<Row>${strCell('Everyone is settled')}${strCell('')}${strCell('')}</Row>`
  }
  const body = transfers
    .map(
      (row) =>
        `<Row>${strCell(names.get(row.fromId) ?? 'Friend')}${strCell(names.get(row.toId) ?? 'Friend')}${numCell(row.amount)}</Row>`,
    )
    .join('')
  return head + body
}

export function tripWorkbookXml(trip: Trip): string {
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles><Style ss:ID="header"><Font ss:Bold="1"/></Style></Styles>
${sheet('Expenses', expenseRows(trip))}
${sheet('Balances', balanceRows(trip))}
${sheet('Settle up', settleRows(trip))}
</Workbook>`
}

export function allTripsWorkbookXml(trips: Trip[]): string {
  const head = headerRow([
    'Trip',
    'Date',
    'Note',
    'Category',
    'Paid by',
    'Amount',
    'Currency',
    'Base currency',
    'Amount in base',
  ])
  const body = trips
    .flatMap((trip) => {
      const names = peopleNames(trip)
      const cats = new Map(trip.categories.map((c) => [c.id, c]))
      return [...trip.expenses]
        .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt)
        .map((expense) => {
          const cat = cats.get(expense.categoryId)
          return `<Row>${strCell(trip.name)}${strCell(expense.date || '')}${strCell(expense.note.trim() || cat?.name || 'Expense')}${strCell(cat?.name ?? '')}${strCell(names.get(expense.paidBy) ?? 'Friend')}${numCell(expense.amount)}${strCell(expense.currency)}${strCell(trip.baseCurrency)}${numCell(toBase(expense.amount, expense.currency, trip))}</Row>`
        })
    })
    .join('')
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles><Style ss:ID="header"><Font ss:Bold="1"/></Style></Styles>
${sheet('All expenses', head + body)}
</Workbook>`
}

export function downloadExcel(filename: string, xmlDoc: string): void {
  const blob = new Blob([xmlDoc], { type: 'application/vnd.ms-excel' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.xls') ? filename : `${filename}.xls`
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadTripExcel(trip: Trip): void {
  downloadExcel(`${slugify(trip.name)}.xls`, tripWorkbookXml(trip))
}
