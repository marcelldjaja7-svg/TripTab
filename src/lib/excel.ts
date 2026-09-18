import type { Trip } from '../types'
import { toBase } from './money'
import { computeBalances, suggestedTransfers } from './settle'
import { slugify } from './share'

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const CRC_TABLE = new Uint32Array(256)
for (let i = 0; i < 256; i++) {
  let c = i
  for (let k = 0; k < 8; k++) c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  CRC_TABLE[i] = c >>> 0
}

function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

function u16(n: number): Uint8Array {
  const b = new Uint8Array(2)
  new DataView(b.buffer).setUint16(0, n, true)
  return b
}

function u32(n: number): Uint8Array {
  const b = new Uint8Array(4)
  new DataView(b.buffer).setUint32(0, n, true)
  return b
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

/** Uncompressed ZIP (STORE). Excel and Numbers open this as a real .xlsx. */
export function zipStore(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  const encoder = new TextEncoder()
  for (const file of files) {
    const name = encoder.encode(file.name)
    const data = file.data
    const crc = crc32(data)
    const local = concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      name,
      data,
    ])
    const central = concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    ])
    locals.push(local)
    centrals.push(central)
    offset += local.length
  }
  const localBlob = concat(locals)
  const centralBlob = concat(centrals)
  const eocd = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralBlob.length),
    u32(localBlob.length),
    u16(0),
  ])
  return concat([localBlob, centralBlob, eocd])
}

export function unzipStore(buf: Uint8Array): Record<string, string> {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const decoder = new TextDecoder()
  const out: Record<string, string> = {}
  let i = 0
  while (i + 30 <= buf.length && view.getUint32(i, true) === 0x04034b50) {
    const method = view.getUint16(i + 8, true)
    const size = view.getUint32(i + 22, true)
    const nameLen = view.getUint16(i + 26, true)
    const extraLen = view.getUint16(i + 28, true)
    const nameStart = i + 30
    const name = decoder.decode(buf.subarray(nameStart, nameStart + nameLen))
    const dataStart = nameStart + nameLen + extraLen
    if (method !== 0) throw new Error(`compressed ${name}`)
    out[name] = decoder.decode(buf.subarray(dataStart, dataStart + size))
    i = dataStart + size
  }
  return out
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') throw new Error('deflate')
  const copy = new Uint8Array(data.byteLength)
  copy.set(data)
  const stream = new Blob([copy.buffer]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** Read STORE or deflate-raw ZIP entries (Excel/Numbers rewrite templates as deflate). */
export async function readZip(buf: Uint8Array): Promise<Record<string, Uint8Array>> {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const decoder = new TextDecoder()
  const out: Record<string, Uint8Array> = {}
  let i = 0
  while (i + 30 <= buf.length && view.getUint32(i, true) === 0x04034b50) {
    const flags = view.getUint16(i + 6, true)
    const method = view.getUint16(i + 8, true)
    const compressed = view.getUint32(i + 18, true)
    const nameLen = view.getUint16(i + 26, true)
    const extraLen = view.getUint16(i + 28, true)
    const nameStart = i + 30
    const name = decoder.decode(buf.subarray(nameStart, nameStart + nameLen)).replace(/\\/g, '/')
    const dataStart = nameStart + nameLen + extraLen
    if ((flags & 0x8) !== 0) throw new Error('unsupported zip')
    const packed = buf.subarray(dataStart, dataStart + compressed)
    let data: Uint8Array = packed
    if (method === 8) data = await inflateRaw(packed)
    else if (method !== 0) throw new Error(`zip method ${method}`)
    out[name] = data
    i = dataStart + compressed
  }
  return out
}

function xml(value: string): string {
  let out = ''
  for (const ch of value) {
    const code = ch.charCodeAt(0)
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
      out += ' '
      continue
    }
    if (ch === '&') out += '&amp;'
    else if (ch === '<') out += '&lt;'
    else if (ch === '>') out += '&gt;'
    else if (ch === '"') out += '&quot;'
    else out += ch
  }
  return out
}

function colLetter(index: number): string {
  let n = index + 1
  let out = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    out = String.fromCharCode(65 + rem) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

function sheetName(name: string): string {
  return name.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31) || 'Sheet'
}

type Cell = string | number

function sheetXml(rows: Cell[][]): string {
  const body = rows
    .map((row, r) => {
      const cells = row
        .map((value, c) => {
          const ref = `${colLetter(c)}${r + 1}`
          if (typeof value === 'number' && Number.isFinite(value)) {
            return `<c r="${ref}"><v>${value}</v></c>`
          }
          return `<c r="${ref}" t="inlineStr"><is><t>${xml(String(value ?? ''))}</t></is></c>`
        })
        .join('')
      return `<row r="${r + 1}">${cells}</row>`
    })
    .join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`
}

function workbookXml(names: string[]): string {
  const sheets = names
    .map(
      (name, i) =>
        `<sheet name="${xml(sheetName(name))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
    )
    .join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets}</sheets></workbook>`
}

function workbookRels(count: number): string {
  const rels = Array.from({ length: count }, (_, i) => {
    return `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`
}

function contentTypesXml(count: number): string {
  const sheets = Array.from({ length: count }, (_, i) => {
    return `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${sheets}
</Types>`
}

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

export function workbookXlsx(sheets: { name: string; rows: Cell[][] }[]): Uint8Array {
  const files = [
    { name: '[Content_Types].xml', data: utf8(contentTypesXml(sheets.length)) },
    { name: '_rels/.rels', data: utf8(ROOT_RELS) },
    { name: 'xl/workbook.xml', data: utf8(workbookXml(sheets.map((s) => s.name))) },
    { name: 'xl/_rels/workbook.xml.rels', data: utf8(workbookRels(sheets.length)) },
    ...sheets.map((sheet, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: utf8(sheetXml(sheet.rows)),
    })),
  ]
  return zipStore(files)
}

function peopleNames(trip: Trip): Map<string, string> {
  return new Map(trip.people.map((p) => [p.id, p.name]))
}

function expenseSheet(trip: Trip): Cell[][] {
  const names = peopleNames(trip)
  const cats = new Map(trip.categories.map((c) => [c.id, c]))
  const sorted = [...trip.expenses].sort(
    (a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt,
  )
  const rows: Cell[][] = [
    ['Date', 'Note', 'Category', 'Paid by', 'Amount', 'Currency', `Amount (${trip.baseCurrency})`, 'Split', 'Participants'],
  ]
  for (const expense of sorted) {
    const cat = cats.get(expense.categoryId)
    rows.push([
      expense.date || '',
      expense.note.trim() || cat?.name || 'Expense',
      cat?.name ?? '',
      names.get(expense.paidBy) ?? 'Friend',
      expense.amount,
      expense.currency,
      toBase(expense.amount, expense.currency, trip),
      expense.splitMode,
      expense.participantIds.map((id) => names.get(id) ?? 'Friend').join(', '),
    ])
  }
  return rows
}

function balanceSheet(trip: Trip): Cell[][] {
  const names = peopleNames(trip)
  const rows: Cell[][] = [['Person', `Paid (${trip.baseCurrency})`, `Share (${trip.baseCurrency})`, `Net (${trip.baseCurrency})`]]
  for (const row of computeBalances(trip)) {
    rows.push([names.get(row.personId) ?? 'Friend', row.paid, row.share, row.net])
  }
  return rows
}

function settleSheet(trip: Trip): Cell[][] {
  const names = peopleNames(trip)
  const transfers = suggestedTransfers(trip)
  const rows: Cell[][] = [['From', 'To', `Amount (${trip.baseCurrency})`]]
  if (transfers.length === 0) {
    rows.push(['Everyone is settled', '', ''])
    return rows
  }
  for (const row of transfers) {
    rows.push([names.get(row.fromId) ?? 'Friend', names.get(row.toId) ?? 'Friend', row.amount])
  }
  return rows
}

export function tripWorkbookXlsx(trip: Trip): Uint8Array {
  return workbookXlsx([
    { name: 'Expenses', rows: expenseSheet(trip) },
    { name: 'Balances', rows: balanceSheet(trip) },
    { name: 'Settle up', rows: settleSheet(trip) },
  ])
}

export function allTripsWorkbookXlsx(trips: Trip[]): Uint8Array {
  const rows: Cell[][] = [
    ['Trip', 'Date', 'Note', 'Category', 'Paid by', 'Amount', 'Currency', 'Base currency', 'Amount in base'],
  ]
  for (const trip of trips) {
    const names = peopleNames(trip)
    const cats = new Map(trip.categories.map((c) => [c.id, c]))
    const sorted = [...trip.expenses].sort(
      (a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt,
    )
    for (const expense of sorted) {
      const cat = cats.get(expense.categoryId)
      rows.push([
        trip.name,
        expense.date || '',
        expense.note.trim() || cat?.name || 'Expense',
        cat?.name ?? '',
        names.get(expense.paidBy) ?? 'Friend',
        expense.amount,
        expense.currency,
        trip.baseCurrency,
        toBase(expense.amount, expense.currency, trip),
      ])
    }
  }
  return workbookXlsx([{ name: 'All expenses', rows }])
}

function isAppleTouch(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export async function downloadExcel(filename: string, bytes: Uint8Array): Promise<'share' | 'download'> {
  const name = filename.endsWith('.xlsx') ? filename : `${filename.replace(/\.xls$/i, '')}.xlsx`
  const copy = new Uint8Array(bytes)
  const file = new File([copy], name, { type: XLSX_MIME })
  if (isAppleTouch() && typeof navigator.share === 'function' && typeof navigator.canShare === 'function') {
    try {
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: name })
        return 'share'
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return 'share'
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  window.setTimeout(() => {
    a.remove()
    URL.revokeObjectURL(url)
  }, 4000)
  return 'download'
}

export const IMPORT_HEADERS = ['Date', 'Note', 'Amount', 'Currency', 'Paid by', 'Split between', 'Category'] as const

export function tripImportTemplateXlsx(trip: Trip): Uint8Array {
  const expenses: Cell[][] = [[...IMPORT_HEADERS]]
  for (let i = 0; i < 12; i++) expenses.push(IMPORT_HEADERS.map(() => ''))
  const friends: Cell[][] = [['Name'], ...trip.people.map((person) => [person.name])]
  const categories: Cell[][] = [
    ['Name'],
    ...trip.categories.filter((c) => c.id !== 'settlement').map((c) => [c.name]),
  ]
  const how: Cell[][] = [
    ['TripTab Excel import'],
    [''],
    ['1. Open the Expenses sheet. Keep the header row as-is.'],
    ['2. Type one bill per row.'],
    ['3. Date as YYYY-MM-DD, for example 2026-09-18.'],
    [`4. Amount is what was paid. Leave Currency blank to use ${trip.baseCurrency}.`],
    ['5. Paid by must be a name from the Friends sheet, or a new name we will add.'],
    ['6. Split between is optional. Comma-separated names. Blank = everyone on the trip.'],
    ['7. Category should match the Categories sheet. Blank = Other.'],
    ['8. Save the file, then tap Import Excel in this trip.'],
    [''],
    [`Trip: ${trip.name}`],
    [`Friends: ${trip.people.map((p) => p.name).join(', ') || '(add friends first)'}`],
  ]
  return workbookXlsx([
    { name: 'Instructions', rows: how },
    { name: 'Expenses', rows: expenses },
    { name: 'Friends', rows: friends },
    { name: 'Categories', rows: categories },
  ])
}

export function downloadTripExcel(trip: Trip): Promise<'share' | 'download'> {
  return downloadExcel(`${slugify(trip.name)}.xlsx`, tripWorkbookXlsx(trip))
}

export function downloadImportTemplate(trip: Trip): Promise<'share' | 'download'> {
  return downloadExcel(`${slugify(trip.name)}-template.xlsx`, tripImportTemplateXlsx(trip))
}

export function downloadAllTripsExcel(trips: Trip[]): Promise<'share' | 'download'> {
  return downloadExcel('triptab.xlsx', allTripsWorkbookXlsx(trips))
}
