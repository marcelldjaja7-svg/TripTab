import { parseExpenseDate } from './dates'
import { CURRENCY_CODES, DEFAULT_BASE_CURRENCY, getCurrency } from './currencies'

export const VISION_KEY_STORAGE = 'triptab.visionKey'

export type ReceiptLine = { name: string; amount: number }

export type ReceiptScan = {
  amount?: number
  currency?: string
  merchant?: string
  note?: string
  date?: string
  categoryId?: string
  lineItems?: ReceiptLine[]
}

export class ScanError extends Error {
  code: 'no-key' | 'unavailable' | 'unreadable' | 'image'
  constructor(code: ScanError['code'], message: string) {
    super(message)
    this.code = code
  }
}

export function loadVisionKey(): string {
  try {
    return localStorage.getItem(VISION_KEY_STORAGE)?.trim() ?? ''
  } catch {
    return ''
  }
}

export function saveVisionKey(key: string): void {
  const trimmed = key.trim()
  if (!trimmed) {
    localStorage.removeItem(VISION_KEY_STORAGE)
    return
  }
  localStorage.setItem(VISION_KEY_STORAGE, trimmed)
}

export function maskVisionKey(key: string): string {
  const k = key.trim()
  if (k.length < 8) return 'Saved'
  return `${k.slice(0, 4)}…${k.slice(-4)}`
}

export function builtInVisionKey(): string {
  const key = import.meta.env.VITE_GEMINI_API_KEY
  return typeof key === 'string' ? key.trim() : ''
}

export function resolveVisionKey(): string {
  return loadVisionKey() || builtInVisionKey()
}

export function visionKeySource(): 'custom' | 'builtin' | 'none' {
  if (loadVisionKey()) return 'custom'
  if (builtInVisionKey()) return 'builtin'
  return 'none'
}

const SYMBOL_TO_CODE: Record<string, string> = {
  RP: 'IDR',
  IDR: 'IDR',
  RUPIAH: 'IDR',
  USD: 'USD',
  US$: 'USD',
  SGD: 'SGD',
  S$: 'SGD',
  MYR: 'MYR',
  RM: 'MYR',
  THB: 'THB',
  EUR: 'EUR',
  GBP: 'GBP',
  JPY: 'JPY',
  AUD: 'AUD',
  A$: 'AUD',
  CAD: 'CAD',
  C$: 'CAD',
  CHF: 'CHF',
  CNY: 'CNY',
  RMB: 'CNY',
  HKD: 'HKD',
  HK$: 'HKD',
  INR: 'INR',
  RS: 'INR',
  KRW: 'KRW',
  WON: 'KRW',
  NZD: 'NZD',
  PHP: 'PHP',
  VND: 'VND',
  DONG: 'VND',
  BDT: 'BDT',
  TAKA: 'BDT',
  AED: 'AED',
  SAR: 'SAR',
  QAR: 'QAR',
  KWD: 'KWD',
  BHD: 'BHD',
  OMR: 'OMR',
  JOD: 'JOD',
  ILS: 'ILS',
  TRY: 'TRY',
  TL: 'TRY',
  EGP: 'EGP',
  MAD: 'MAD',
  KES: 'KES',
  NGN: 'NGN',
  ZAR: 'ZAR',
  MXN: 'MXN',
  BRL: 'BRL',
  R$: 'BRL',
  ARS: 'ARS',
  CLP: 'CLP',
  COP: 'COP',
  PEN: 'PEN',
  SEK: 'SEK',
  NOK: 'NOK',
  DKK: 'DKK',
  ISK: 'ISK',
  PLN: 'PLN',
  CZK: 'CZK',
  HUF: 'HUF',
  RON: 'RON',
  BGN: 'BGN',
  FJD: 'FJD',
  TWD: 'TWD',
  NT$: 'TWD',
  MOP: 'MOP',
  KHR: 'KHR',
  LAK: 'LAK',
  MMK: 'MMK',
  BND: 'BND',
  LKR: 'LKR',
  NPR: 'NPR',
  PKR: 'PKR',
}

export function inferCurrency(raw: unknown, baseCurrency: string): string | undefined {
  if (typeof raw !== 'string' && typeof raw !== 'number') return undefined
  const text = String(raw).trim().toUpperCase().replace(/\s+/g, '')
  if (!text) return undefined
  if (CURRENCY_CODES.includes(text)) return text
  const stripped = text.replace(/[^A-Z$€£¥₩₹₱₫฿]/g, '')
  if (SYMBOL_TO_CODE[stripped]) return SYMBOL_TO_CODE[stripped]
  if (text.includes('RP') || text.includes('RUPIAH')) return 'IDR'
  if (text.includes('S$') || text.includes('SGD')) return 'SGD'
  if (text.includes('US$') || text.includes('USD')) return 'USD'
  if (text.includes('€') || text.includes('EUR')) return 'EUR'
  if (text.includes('£') || text.includes('GBP')) return 'GBP'
  if (text.includes('¥') && !text.includes('CNY')) return 'JPY'
  if (text === '$') return baseCurrency === 'SGD' || baseCurrency === 'AUD' || baseCurrency === 'CAD' ? baseCurrency : 'USD'
  return CURRENCY_CODES.includes(text.slice(0, 3)) ? text.slice(0, 3) : undefined
}

export function parseAmountValue(raw: unknown, currency?: string): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  const decimals = currency ? getCurrency(currency).decimals : 2
  const negative = /^-/.test(trimmed.replace(/[^0-9.,-]/g, ''))
  if (negative) return undefined
  const cleaned = trimmed.replace(/[^\d.,]/g, '')
  if (!cleaned) return undefined
  const lastComma = cleaned.lastIndexOf(',')
  const lastDot = cleaned.lastIndexOf('.')
  let normalized = cleaned
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) normalized = cleaned.replace(/\./g, '').replace(',', '.')
    else normalized = cleaned.replace(/,/g, '')
  } else if (lastComma >= 0) {
    const frac = cleaned.length - lastComma - 1
    normalized = frac === 3 && decimals === 0 ? cleaned.replace(/,/g, '') : cleaned.replace(',', '.')
  } else if (lastDot >= 0) {
    const frac = cleaned.length - lastDot - 1
    if (frac === 3 && (decimals === 0 || currency === 'IDR')) normalized = cleaned.replace(/\./g, '')
  }
  const n = Number(normalized)
  if (!Number.isFinite(n) || n <= 0 || n > 1e12) return undefined
  return n
}

export function parseScanDate(raw: unknown): string | undefined {
  return parseExpenseDate(raw)
}

export function guessCategoryId(
  text: string,
  categories: { id: string; name: string }[],
  hinted?: string,
): string | undefined {
  const ids = new Set(categories.map((c) => c.id))
  if (hinted && ids.has(hinted) && hinted !== 'settlement') return hinted
  if (hinted) {
    const lower = hinted.toLowerCase()
    const byName = categories.find((c) => c.id !== 'settlement' && (c.id === lower || c.name.toLowerCase() === lower))
    if (byName) return byName.id
  }
  const blob = text.toLowerCase()
  const rules: { id: string; keys: string[] }[] = [
    { id: 'food', keys: ['food', 'restaurant', 'cafe', 'coffee', 'meal', 'nasi', 'warung', 'ramen', 'pizza', 'bar', 'drink', 'bakery'] },
    { id: 'transport', keys: ['taxi', 'grab', 'uber', 'gojek', 'train', 'flight', 'airport', 'parking', 'toll', 'bus', 'fuel', 'petrol', 'gas'] },
    { id: 'lodging', keys: ['hotel', 'villa', 'airbnb', 'hostel', 'resort', 'inn', 'lodging'] },
    { id: 'activities', keys: ['ticket', 'museum', 'tour', 'activity', 'park', 'spa', 'dive'] },
    { id: 'shopping', keys: ['shop', 'store', 'mall', 'market', 'grocery', 'supermarket', 'uniqlo', 'souvenir'] },
  ]
  for (const rule of rules) {
    if (!ids.has(rule.id)) continue
    if (rule.keys.some((k) => blob.includes(k))) return rule.id
  }
  return ids.has('other') ? 'other' : categories.find((c) => c.id !== 'settlement')?.id
}

export function normalizeReceiptScan(
  input: unknown,
  opts: { baseCurrency: string; categories: { id: string; name: string }[] },
): ReceiptScan {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const currency =
    inferCurrency(raw.currency, opts.baseCurrency) ??
    inferCurrency(raw.currencyCode, opts.baseCurrency) ??
    inferCurrency(raw.symbol, opts.baseCurrency) ??
    opts.baseCurrency
  const amount = parseAmountValue(raw.amount ?? raw.total ?? raw.grandTotal, currency)
  const merchant = typeof raw.merchant === 'string' ? raw.merchant.trim() : typeof raw.vendor === 'string' ? raw.vendor.trim() : ''
  const noteRaw = typeof raw.note === 'string' ? raw.note.trim() : typeof raw.title === 'string' ? raw.title.trim() : ''
  const note = (noteRaw || merchant).slice(0, 240)
  const date = parseScanDate(raw.date ?? raw.issuedAt ?? raw.receiptDate)
  const categoryId = guessCategoryId(`${merchant} ${note} ${String(raw.category ?? '')}`, opts.categories, typeof raw.category === 'string' ? raw.category : typeof raw.categoryId === 'string' ? raw.categoryId : undefined)
  const lineItems = Array.isArray(raw.lineItems)
    ? raw.lineItems
        .map((item) => {
          if (!item || typeof item !== 'object') return null
          const row = item as Record<string, unknown>
          const name = typeof row.name === 'string' ? row.name.trim() : typeof row.description === 'string' ? row.description.trim() : ''
          const lineAmount = parseAmountValue(row.amount ?? row.total, currency)
          if (!name || lineAmount === undefined) return null
          return { name: name.slice(0, 120), amount: lineAmount }
        })
        .filter((x): x is ReceiptLine => Boolean(x))
    : undefined
  const scan: ReceiptScan = {}
  if (amount !== undefined) scan.amount = amount
  if (currency) scan.currency = currency
  if (merchant) scan.merchant = merchant.slice(0, 120)
  if (note) scan.note = note
  if (date) scan.date = date
  if (categoryId) scan.categoryId = categoryId
  if (lineItems && lineItems.length) scan.lineItems = lineItems
  return scan
}

export function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = (fenced ? fenced[1] : text).trim()
  try {
    return JSON.parse(body) as unknown
  } catch {
    const start = body.indexOf('{')
    const end = body.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(body.slice(start, end + 1)) as unknown
    throw new Error('not json')
  }
}

/** Current Gemini Flash models. 1.5 and 2.0 are shut down and 404. */
export const SCAN_MODELS = [
  'gemini-flash-latest',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
  'gemini-2.5-flash',
] as const

function scanPrompt(baseCurrency: string, categories: { id: string; name: string }[]): string {
  const cats = categories
    .filter((c) => c.id !== 'settlement')
    .map((c) => `${c.id} (${c.name})`)
    .join(', ')
  return `You extract data from a photo of a receipt or bill. Return JSON only, no markdown.
Schema:
{"amount": number|null, "currency": string|null, "merchant": string|null, "note": string|null, "date": "YYYY-MM-DD"|null, "category": string|null, "lineItems": [{"name": string, "amount": number}]}
Rules:
- amount is the TOTAL the customer paid (grand total / amount due), not a subtotal or tax line if a grand total exists.
- currency is a 3-letter code (IDR, USD, SGD, EUR, ...). Infer from symbols, locale, and language. If unsure, use ${baseCurrency}.
- Indonesian receipts often use "." as thousands (88.000 means 88000 IDR). Return the numeric amount, not a formatted string.
- date is the receipt date if clearly visible, else null.
- category must be one of: ${cats}
- note should be a short human label (merchant or what was bought).
- lineItems: every distinct product/service line on the bill, in order. Do not cap or skip lines because there are many. Skip only blank or unreadable rows. Tax/service/total rows can be omitted if a grand total is already in amount.
If this is not a receipt, still guess amount if any total is visible; otherwise nulls.`
}

async function drawToJpeg(
  source: CanvasImageSource,
  width: number,
  height: number,
): Promise<string> {
  const max = 2400
  const scale = Math.min(1, max / Math.max(width, height))
  const w = Math.max(1, Math.round(width * scale))
  const h = Math.max(1, Math.round(height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas')
  ctx.drawImage(source, 0, 0, w, h)
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('blob'))), 'image/jpeg', 0.82)
  })
  return blobToBase64(blob)
}

export async function fileToInlineImage(file: File): Promise<{ mime: string; data: string; previewUrl: string }> {
  const previewUrl = URL.createObjectURL(file)
  try {
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(file)
      const data = await drawToJpeg(bitmap, bitmap.width, bitmap.height)
      bitmap.close()
      return { mime: 'image/jpeg', data, previewUrl }
    }
  } catch {
    /* iPhone HEIC sometimes needs an <img> decode */
  }
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('img'))
      el.src = previewUrl
    })
    const data = await drawToJpeg(img, img.naturalWidth || img.width, img.naturalHeight || img.height)
    return { mime: 'image/jpeg', data, previewUrl }
  } catch {
    try {
      const data = await blobToBase64(file)
      const mime = file.type.startsWith('image/') ? file.type : 'image/jpeg'
      return { mime, data, previewUrl }
    } catch {
      URL.revokeObjectURL(previewUrl)
      throw new ScanError('image', 'Could not read that photo. Try the camera, or pick a JPEG/PNG.')
    }
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read'))
    reader.onload = () => {
      const result = String(reader.result ?? '')
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.readAsDataURL(blob)
  })
}

export async function scanReceiptPhoto(opts: {
  file: File
  apiKey?: string
  baseCurrency: string
  categories: { id: string; name: string }[]
}): Promise<{ scan: ReceiptScan; previewUrl: string }> {
  const key = (opts.apiKey ?? resolveVisionKey()).trim()
  if (!key) {
    throw new ScanError('no-key', 'Add a Gemini API key in Scan bills to read photos. You can still fill this in yourself.')
  }
  const image = await fileToInlineImage(opts.file)
  const prompt = scanPrompt(opts.baseCurrency || DEFAULT_BASE_CURRENCY, opts.categories)
  let lastError: Error | null = null
  for (const model of SCAN_MODELS) {
    try {
      const json = await generateGeminiJson(key, model, prompt, image.mime, image.data)
      const scan = normalizeReceiptScan(json, opts)
      if (scan.amount === undefined && !scan.note && !scan.merchant) {
        throw new ScanError('unreadable', 'Could not read a total on that bill. Enter it manually.')
      }
      return { scan, previewUrl: image.previewUrl }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if (error instanceof ScanError && error.code === 'unreadable') throw error
    }
  }
  if (lastError instanceof ScanError) throw lastError
  throw new ScanError(
    'unavailable',
    'Gemini could not read that photo right now. Check the API key, or enter the bill manually.',
  )
}

type GeminiPart = { text?: string; thought?: boolean }

async function postGemini(
  apiKey: string,
  model: string,
  prompt: string,
  mime: string,
  data: string,
  generationConfig: Record<string, unknown>,
): Promise<Response> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }, { inline_data: { mime_type: mime, data } }],
        },
      ],
      generationConfig,
    }),
  })
}

async function generateGeminiJson(
  apiKey: string,
  model: string,
  prompt: string,
  mime: string,
  data: string,
): Promise<unknown> {
  const jsonConfig = {
    temperature: 0,
    responseMimeType: 'application/json',
    maxOutputTokens: 8192,
    thinkingConfig: { thinkingBudget: 0 },
  }
  let res = await postGemini(apiKey, model, prompt, mime, data, jsonConfig)
  if (res.status === 400) {
    res = await postGemini(apiKey, model, prompt, mime, data, {
      temperature: 0,
      responseMimeType: 'application/json',
      maxOutputTokens: 8192,
    })
  }
  if (res.status === 401 || res.status === 403) {
    throw new ScanError('unavailable', 'That Gemini API key was rejected. Paste a valid key from Google AI Studio.')
  }
  if (res.status === 404) throw new Error(`missing model ${model}`)
  if (!res.ok) throw new Error(`gemini ${res.status}`)
  const body = (await res.json()) as {
    candidates?: { content?: { parts?: GeminiPart[] } }[]
    error?: { message?: string }
  }
  const text =
    body.candidates?.[0]?.content?.parts
      ?.filter((part) => !part.thought)
      .map((part) => part.text ?? '')
      .join('\n') ?? ''
  if (!text.trim()) throw new Error(body.error?.message || 'empty')
  try {
    return extractJsonObject(text)
  } catch {
    throw new Error('parse')
  }
}
