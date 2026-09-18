import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AppData, Theme, Trip } from './types'
import { createDemoTrip, emptyTrip } from './lib/demo'
import { captureShareLocation, shareLinkForTrip } from './lib/share'
import { nextPersonColor } from './lib/colors'
import { defaultAppData, loadAppData, normalizeAppData, normalizeTrip, saveAppData, STORAGE_KEY } from './lib/storage'
import {
  pullLatestLiveTrip,
  subscribeLivePings,
  tripFromPing,
  waitForLiveTrip,
} from './lib/live'
import {
  adoptSharedTrip,
  clearLiveShareLocation,
  mintLiveShareId,
  mergeTrips,
  pullLiveTrip,
  pushLiveTrip,
  setLiveShareHash,
  tripFingerprint,
} from './lib/sync'
import { uid } from './lib/utils'

type Toast = { id: string; message: string }

type StoreValue = {
  data: AppData
  currentTrip: Trip | null
  toast: Toast | null
  setTheme: (theme: Theme) => void
  selectTrip: (id: string | null) => void
  createTrip: (input: {
    name: string
    emoji: string
    baseCurrency: string
    startDate?: string
    endDate?: string
    destinationId?: string
    people: string[]
  }) => Trip
  saveTrip: (trip: Trip) => void
  deleteTrip: (id: string) => void
  loadDemo: () => Trip
  importData: (raw: unknown) => boolean
  resetAll: () => void
  notify: (message: string) => void
  shareWithFriends: (trip: Trip) => Promise<string>
}

const StoreContext = createContext<StoreValue | null>(null)

let shareJoinStarted = false

function applyTheme(theme: Theme) {
  const dark = theme !== 'light'
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#000000' : '#F2F2F7')
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(() => {
    const loaded = loadAppData()
    applyTheme(loaded.theme)
    return loaded
  })
  const [toast, setToast] = useState<Toast | null>(null)
  const [liveRoomId, setLiveRoomId] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : captureShareLocation(window.location.href).shareId,
  )
  const dataRef = useRef(data)
  dataRef.current = data

  useEffect(() => {
    saveAppData(data)
    applyTheme(data.theme)
  }, [data])

  const notify = (message: string) => {
    const id = uid()
    setToast({ id, message })
    window.setTimeout(() => {
      setToast((t) => (t?.id === id ? null : t))
    }, 2800)
  }

  useEffect(() => {
    if (shareJoinStarted) return
    const { shareId: liveId, trip: snapshot } = captureShareLocation(window.location.href)
    if (!liveId && !snapshot) return
    shareJoinStarted = true

    const localMatch = dataRef.current.trips.find(
      (t) => (liveId && t.shareId === liveId) || (snapshot && t.id === snapshot.id),
    )
    if (localMatch || snapshot) {
      const incoming = snapshot ?? localMatch
      if (incoming) {
        setData((prev) => {
          const next = { ...prev, ...adoptSharedTrip(prev.trips, incoming, liveId ?? incoming.shareId) }
          saveAppData(next)
          return next
        })
      }
    }

    if (!liveId) {
      if (snapshot) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
        notify(`Opened “${snapshot.name}”`)
      }
      return
    }

    void (async () => {
      const remote =
        (await pullLatestLiveTrip(liveId)) ??
        (await pullLiveTrip(liveId)) ??
        (localMatch || snapshot ? null : await waitForLiveTrip(liveId, 2500))
      if (remote) {
        setData((prev) => {
          const next = { ...prev, ...adoptSharedTrip(prev.trips, remote, liveId) }
          saveAppData(next)
          return next
        })
        setLiveShareHash(liveId, remote)
        if (!localMatch && !snapshot) notify('Live trip — everyone on this link can add expenses')
        return
      }
      if (localMatch || snapshot || dataRef.current.trips.some((t) => t.shareId === liveId)) {
        setLiveShareHash(liveId, snapshot ?? localMatch ?? undefined)
        return
      }
      notify('Waiting for the live trip. Add a bill on another phone and it will appear here.')
    })()
  }, [])

  const currentTrip = data.trips.find((t) => t.id === data.currentTripId) ?? null
  const liveSig = currentTrip?.shareId
    ? `${currentTrip.shareId}|${currentTrip.updatedAt}|${currentTrip.expenses.length}|${currentTrip.people.length}`
    : ''

  useEffect(() => {
    const trip = dataRef.current.trips.find((t) => t.id === dataRef.current.currentTripId)
    if (!trip?.shareId) return
    const shareId = trip.shareId
    const local = trip
    const handle = window.setTimeout(() => {
      void (async () => {
        try {
          // Push the local bills first so other phones see uploads without waiting
          // on a pull that can hang on a dead ntfy.sh.
          await pushLiveTrip(shareId, local)
          setLiveShareHash(shareId, local)
          const remote = await pullLatestLiveTrip(shareId)
          const latest = dataRef.current.trips.find((t) => t.shareId === shareId) ?? local
          if (!remote) return
          const merged = mergeTrips(latest, remote)
          if (tripFingerprint(merged) === tripFingerprint(latest)) return
          await pushLiveTrip(shareId, merged)
          setLiveShareHash(shareId, merged)
          setData((prev) => ({
            ...prev,
            trips: prev.trips.map((t) => (t.id === latest.id ? { ...merged, id: latest.id, shareId } : t)),
          }))
        } catch {
          /* stay local if the room is briefly unreachable */
        }
      })()
    }, 50)
    return () => window.clearTimeout(handle)
  }, [liveSig])

  const activeShareId = currentTrip?.shareId ?? liveRoomId

  useEffect(() => {
    const shareId = activeShareId
    if (!shareId) return
    const applyRemote = (remote: Trip) => {
      setData((prev) => {
        const next = { ...prev, ...adoptSharedTrip(prev.trips, remote, shareId) }
        const before = prev.trips.find((t) => t.shareId === shareId)
        const after = next.trips.find((t) => t.shareId === shareId)
        if (
          before &&
          after &&
          tripFingerprint(before) === tripFingerprint(after) &&
          prev.currentTripId === next.currentTripId
        ) {
          return prev
        }
        saveAppData(next)
        return next
      })
    }
    const unsub = subscribeLivePings(shareId, (ping) => {
      void tripFromPing(ping, shareId).then((remote) => {
        if (remote) applyRemote(remote)
      })
    })
    const onVis = () => {
      if (document.visibilityState !== 'visible') return
      void pullLatestLiveTrip(shareId).then((remote) => {
        if (remote) applyRemote(remote)
      })
    }
    const onOnline = () => {
      void pullLatestLiveTrip(shareId).then((remote) => {
        if (remote) applyRemote(remote)
      })
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('online', onOnline)
    void pullLatestLiveTrip(shareId).then((remote) => {
      if (remote) applyRemote(remote)
    })
    return () => {
      unsub()
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('online', onOnline)
    }
  }, [activeShareId])

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return
      try {
        const incoming = normalizeAppData(JSON.parse(event.newValue) as unknown)
        if (!incoming) return
        setData((prev) => {
          const shareId = prev.trips.find((t) => t.id === prev.currentTripId)?.shareId
          const local = shareId ? prev.trips.find((t) => t.shareId === shareId) : null
          const remote = shareId ? incoming.trips.find((t) => t.shareId === shareId) : null
          if (!local || !remote) {
            return { ...incoming, currentTripId: prev.currentTripId ?? incoming.currentTripId }
          }
          const merged = mergeTrips(local, remote)
          if (tripFingerprint(merged) === tripFingerprint(local)) return prev
          return {
            ...prev,
            trips: prev.trips.map((t) => (t.id === local.id ? { ...merged, id: local.id, shareId } : t)),
          }
        })
      } catch {
        /* ignore bad storage */
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const value = useMemo<StoreValue>(() => {
    return {
      data,
      currentTrip,
      toast,
      setTheme: (theme) => setData((d) => ({ ...d, theme })),
      selectTrip: (id) => {
        setData((d) => ({ ...d, currentTripId: id }))
        const trip = data.trips.find((t) => t.id === id)
        if (trip?.shareId) {
          setLiveRoomId(trip.shareId)
          setLiveShareHash(trip.shareId, trip)
        } else {
          setLiveRoomId(null)
          clearLiveShareLocation()
        }
      },
      createTrip: (input) => {
        const trip = emptyTrip(input.name, input.emoji, input.baseCurrency, input.destinationId)
        trip.startDate = input.startDate ?? ''
        trip.endDate = input.endDate ?? ''
        const colors: string[] = []
        trip.people = input.people
          .map((name) => name.trim())
          .filter(Boolean)
          .map((name) => {
            const color = nextPersonColor(colors)
            colors.push(color)
            return { id: uid(), name, color }
          })
        setData((d) => ({
          ...d,
          trips: [trip, ...d.trips],
          currentTripId: trip.id,
        }))
        return trip
      },
      saveTrip: (trip) =>
        setData((d) => ({
          ...d,
          trips: d.trips.map((t) => (t.id === trip.id ? { ...trip, updatedAt: Date.now(), isDemo: false } : t)),
        })),
      deleteTrip: (id) =>
        setData((d) => {
          const trips = d.trips.filter((t) => t.id !== id)
          return {
            ...d,
            trips,
            currentTripId: d.currentTripId === id ? trips[0]?.id ?? null : d.currentTripId,
          }
        }),
      loadDemo: () => {
        const trip = createDemoTrip()
        setData((d) => ({
          ...d,
          trips: [trip, ...d.trips.filter((t) => !t.isDemo)],
          currentTripId: trip.id,
        }))
        return trip
      },
      importData: (raw) => {
        const parsed = normalizeAppData(raw)
        if (parsed && parsed.trips.length > 0) {
          setData((d) => {
            const ids = new Set(d.trips.map((t) => t.id))
            const incoming = parsed.trips.map((t) => (ids.has(t.id) ? { ...t, id: uid() } : t))
            return {
              ...d,
              trips: [...incoming, ...d.trips],
              currentTripId: incoming[0]?.id ?? d.currentTripId,
            }
          })
          return true
        }
        const one = normalizeTrip(raw)
        if (!one) return false
        const id = uid()
        setData((d) => ({
          ...d,
          trips: [{ ...one, id }, ...d.trips],
          currentTripId: id,
        }))
        return true
      },
      resetAll: () => setData(defaultAppData()),
      notify,
      shareWithFriends: async (trip) => {
        const shareId = trip.shareId || mintLiveShareId()
        const next = { ...trip, shareId, isDemo: false, updatedAt: Date.now() }
        setData((d) => ({
          ...d,
          trips: d.trips.map((t) => (t.id === trip.id ? next : t)),
        }))
        setLiveRoomId(shareId)
        setLiveShareHash(shareId, next)
        let live = false
        try {
          await pushLiveTrip(shareId, next)
          live = true
        } catch {
          /* snapshot in the link still opens the trip; later saves retry */
        }
        const url = shareLinkForTrip(next, shareId)
        try {
          await Promise.race([
            navigator.clipboard.writeText(url),
            new Promise((_, reject) => window.setTimeout(() => reject(new Error('clipboard')), 400)),
          ])
        } catch {
          /* share sheet below may still work */
        }
        const mobile = typeof navigator !== 'undefined' && /iPhone|iPad|Android/i.test(navigator.userAgent)
        try {
          if (mobile && navigator.share) {
            await Promise.race([
              navigator.share({
                title: trip.name,
                text: 'Open this TripTab link to add expenses with the group.',
                url,
              }),
              new Promise((_, reject) => window.setTimeout(() => reject(new Error('share')), 1500)),
            ])
          }
        } catch {
          try {
            await navigator.clipboard.writeText(url)
          } catch {
            /* invite URL is still in the address bar as ?t= */
          }
        }
        notify(
          live
            ? 'Invite copied — friends open the public TripTab link and can add expenses.'
            : 'Invite copied — friends can open the trip on their phones.',
        )
        return url
      },
    }
  }, [data, toast, currentTrip])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}
