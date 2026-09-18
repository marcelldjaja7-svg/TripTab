import type { Trip } from '../types'
import {
  canonicalAppUrl,
  decodeTripShare,
  encodeTripShare,
  parseShareLocation,
  shareLinkForTrip,
} from './share'
import { PING_MAX, publishLivePing } from './live'
import { mergeTrips } from './merge'
import { normalizeTrip } from './storage'

export { mergeTrips, shouldPublishLive, tripFingerprint } from './merge'

const SNAPSHOT = 'https://bytebin.lucko.me'
const ROOM = 'https://api.restful-api.dev/objects'
const TIMEOUT_MS = 10000

async function request(url: string, init: RequestInit, timeoutMs = TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController()
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      credentials: 'omit',
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    })
  } finally {
    globalThis.clearTimeout(timer)
  }
}

async function postSnapshot(trip: Trip): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await request(`${SNAPSHOT}/post`, {
        method: 'POST',
        body: JSON.stringify({ ...trip, isDemo: false }),
      })
      if (!res.ok) continue
      const json = (await res.json()) as { key?: string }
      if (json.key && json.key.length > 3) return json.key
    } catch {
      /* retry — live trips must not be capped by a single failed snapshot */
    }
  }
  return null
}

async function readSnapshot(bin: string): Promise<Trip | null> {
  try {
    const res = await request(`${SNAPSHOT}/${encodeURIComponent(bin)}`, { method: 'GET' })
    if (!res.ok) return null
    return normalizeTrip(await res.json())
  } catch {
    return null
  }
}

type RoomBody = {
  id?: string
  name?: unknown
  data?: unknown
  payload?: unknown
  bin?: unknown
  people?: unknown
  expenses?: unknown
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function roomPayload(json: RoomBody): { payload?: string; bin?: string; trip?: Trip | null } {
  const data = asRecord(json.data) ?? json
  const payload =
    typeof data.payload === 'string'
      ? data.payload
      : typeof json.payload === 'string'
        ? json.payload
        : undefined
  const bin =
    typeof data.bin === 'string' ? data.bin : typeof json.bin === 'string' ? json.bin : undefined
  const tripLike = data.name && (data.people || data.expenses) ? data : json.name && json.people ? json : null
  return {
    payload,
    bin,
    trip: tripLike ? normalizeTrip(tripLike) : null,
  }
}

export function mintLiveShareId(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = new Uint8Array(8)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 36)
  let id = 'tt'
  for (const b of bytes) id += alphabet[b % 36]
  return id
}

export async function createLiveRoom(trip: Trip): Promise<string> {
  const shareId = mintLiveShareId()
  try {
    await pushLiveTrip(shareId, { ...trip, shareId, isDemo: false })
  } catch {
    /* later saves retry; the room id is still valid */
  }
  return shareId
}

export async function pullLiveTrip(shareId: string): Promise<Trip | null> {
  if (!/^[a-f0-9]{16,}$/i.test(shareId)) return null
  try {
    const res = await request(`${ROOM}/${encodeURIComponent(shareId)}`, { method: 'GET' })
    if (!res.ok) return null
    const extracted = roomPayload((await res.json()) as RoomBody)
    const fromPayload = extracted.payload ? decodeTripShare(extracted.payload) : null
    const fromObject = extracted.trip
    const fromBin = extracted.bin ? await readSnapshot(extracted.bin) : null
    const trip = fromPayload ?? fromObject ?? fromBin
    if (!trip) return null
    return { ...trip, shareId, isDemo: false }
  } catch {
    return null
  }
}

export async function pushLiveTrip(shareId: string, trip: Trip): Promise<void> {
  const withId = { ...trip, shareId, isDemo: false }
  const encoded = encodeTripShare(withId)
  const bin = await postSnapshot(withId)
  if (encoded.length > PING_MAX && !bin) {
    const retry = await postSnapshot(withId)
    await publishLivePing(shareId, withId, retry)
    return
  }
  await publishLivePing(shareId, withId, bin)
}

export async function ensureLiveRoom(trip: Trip): Promise<string> {
  if (trip.shareId) {
    await pushLiveTrip(trip.shareId, trip)
    return trip.shareId
  }
  return createLiveRoom(trip)
}

export function adoptSharedTrip(
  trips: Trip[],
  incoming: Trip,
  shareId?: string | null,
): { trips: Trip[]; currentTripId: string } {
  const tagged: Trip = {
    ...incoming,
    shareId: shareId || incoming.shareId,
    isDemo: false,
  }
  const existing = trips.find(
    (t) => (tagged.shareId && t.shareId === tagged.shareId) || t.id === incoming.id,
  )
  if (existing) {
    const merged = mergeTrips(existing, { ...tagged, id: existing.id })
    return {
      trips: trips.map((t) =>
        t.id === existing.id ? { ...merged, id: existing.id, shareId: tagged.shareId || existing.shareId } : t,
      ),
      currentTripId: existing.id,
    }
  }
  return {
    trips: [tagged, ...trips],
    currentTripId: tagged.id,
  }
}

export function liveShareUrl(shareId: string, trip?: Trip): string {
  if (trip) return shareLinkForTrip(trip, shareId)
  const url = new URL(canonicalAppUrl())
  url.searchParams.set('t', shareId)
  return url.toString()
}

export function parseLiveShareId(): string | null {
  if (typeof window === 'undefined') return null
  return parseShareLocation(window.location.href).shareId
}

export function setLiveShareHash(shareId: string): void {
  const url = new URL(window.location.href)
  url.searchParams.set('t', shareId)
  url.searchParams.delete('trip')
  url.searchParams.delete('import')
  url.searchParams.delete('s')
  url.hash = ''
  const next = `${url.pathname}${url.search}`
  if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== next) {
    window.history.replaceState(null, '', next)
  }
}

export function clearLiveShareLocation(): void {
  const url = new URL(window.location.href)
  url.searchParams.delete('t')
  url.searchParams.delete('trip')
  url.searchParams.delete('s')
  url.searchParams.delete('import')
  url.hash = ''
  window.history.replaceState(null, '', `${url.pathname}${url.search}`)
}

export function isLocalHost(): boolean {
  const host = window.location.hostname
  return host === 'localhost' || host === '127.0.0.1' || host === '::1'
}
