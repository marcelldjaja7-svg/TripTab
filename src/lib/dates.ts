const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
}

const MONTH_RE =
  'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?'

export function todayISO(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseExpenseDate(raw: unknown, now = new Date()): string | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const ms = raw > 1e12 ? raw : raw > 1e9 ? raw * 1000 : NaN
    if (!Number.isFinite(ms)) return undefined
    const d = new Date(ms)
    if (Number.isNaN(d.getTime())) return undefined
    return clampIso(todayISO(d), now)
  }
  if (typeof raw !== 'string') return undefined
  const t = raw.trim().replace(/,/g, ' ').replace(/\s+/g, ' ')
  if (!t) return undefined

  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return clampIso(padIso(iso[1]!, iso[2]!, iso[3]!), now)

  const dmy = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
  if (dmy) {
    return clampIso(padIso(dmy[3]!, dmy[2]!, dmy[1]!), now) ?? clampIso(padIso(dmy[3]!, dmy[1]!, dmy[2]!), now)
  }

  const short = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2})$/)
  if (short) {
    const year = expandYear(short[3]!)
    return clampIso(padIso(year, short[2]!, short[1]!), now) ?? clampIso(padIso(year, short[1]!, short[2]!), now)
  }

  const namedDmy = t.match(
    new RegExp(`^(\\d{1,2})(?:st|nd|rd|th)?[\\s.-]+(${MONTH_RE})(?:[\\s.-]+(\\d{2,4}))?$`, 'i'),
  )
  if (namedDmy) {
    const year = namedDmy[3] ? expandYear(namedDmy[3]) : String(now.getFullYear())
    return (
      clampIso(padIso(year, monthNum(namedDmy[2]!), namedDmy[1]!), now) ??
      (namedDmy[3] ? undefined : clampIso(padIso(String(now.getFullYear() - 1), monthNum(namedDmy[2]!), namedDmy[1]!), now))
    )
  }

  const namedMdy = t.match(
    new RegExp(`^(${MONTH_RE})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:[\\s.-]+(\\d{2,4}))?$`, 'i'),
  )
  if (namedMdy) {
    const year = namedMdy[3] ? expandYear(namedMdy[3]) : String(now.getFullYear())
    return (
      clampIso(padIso(year, monthNum(namedMdy[1]!), namedMdy[2]!), now) ??
      (namedMdy[3] ? undefined : clampIso(padIso(String(now.getFullYear() - 1), monthNum(namedMdy[1]!), namedMdy[2]!), now))
    )
  }

  return undefined
}

export function formatExpenseDate(iso: string): string {
  const parsed = parseExpenseDate(iso) ?? iso
  if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed)) return parsed || 'Undated'
  const d = new Date(`${parsed}T12:00:00`)
  if (Number.isNaN(d.getTime())) return parsed
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function monthNum(name: string): string {
  return String(MONTHS[name.toLowerCase()] ?? '')
}

function expandYear(raw: string): string {
  if (raw.length === 4) return raw
  const n = Number(raw)
  if (!Number.isInteger(n)) return raw
  return String(n < 70 ? 2000 + n : 1900 + n)
}

function padIso(year: string, month: string, day: string): string | undefined {
  const y = Number(year)
  const m = Number(month)
  const d = Number(day)
  if (!Number.isInteger(y) || m < 1 || m > 12 || d < 1 || d > 31) return undefined
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const dt = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(dt.getTime()) || dt.getMonth() + 1 !== m || dt.getDate() !== d) return undefined
  return iso
}

function clampIso(iso: string | undefined, now: Date): string | undefined {
  if (!iso) return undefined
  const dt = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(dt.getTime())) return undefined
  const max = new Date(now)
  max.setDate(max.getDate() + 2)
  const min = new Date(now)
  min.setFullYear(min.getFullYear() - 5)
  if (dt > max || dt < min) return undefined
  return iso
}
