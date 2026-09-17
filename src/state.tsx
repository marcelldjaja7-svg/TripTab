import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AppData, Theme, Trip } from './types'
import { createDemoTrip, emptyTrip } from './lib/demo'
import { captureShareLocation, shareLinkForTrip } from './lib/share'
import { nextPersonColor } from './lib/colors'
import { defaultAppData, loadAppData, normalizeAppData, normalizeTrip, saveAppData } from './lib/storage'
import {
  adoptSharedTrip,
  clearLiveShareLocation,
  ensureLiveRoom,
  isLocalHost,
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
  const dataRef = useRef(data)
  dataRef.current = data
  const joining = useRef(false)

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

    joining.current = true
    void (async () => {
      try {
        const remote = await pullLiveTrip(liveId)
        if (remote) {
          setData((prev) => {
            const next = { ...prev, ...adoptSharedTrip(prev.trips, remote, liveId) }
            saveAppData(next)
            return next
          })
          setLiveShareHash(liveId)
          if (!localMatch && !snapshot) notify('Live trip — everyone on this link can add expenses')
          return
        }
        if (localMatch || snapshot) {
          setLiveShareHash(liveId)
          return
        }
        notify('Could not open the shared trip. Check the link and try again.')
      } finally {
        joining.current = false
      }
    })()
  }, [])

  const currentTrip = data.trips.find((t) => t.id === data.currentTripId) ?? null
  const liveSig = currentTrip?.shareId
    ? `${currentTrip.shareId}|${currentTrip.updatedAt}|${currentTrip.expenses.length}|${currentTrip.people.length}`
    : ''

  useEffect(() => {
    const trip = dataRef.current.trips.find((t) => t.id === dataRef.current.currentTripId)
    if (!trip?.shareId || joining.current) return
    const shareId = trip.shareId
    const handle = window.setTimeout(() => {
      void (async () => {
        try {
          const remote = await pullLiveTrip(shareId)
          const latest = dataRef.current.trips.find((t) => t.shareId === shareId) ?? trip
          const merged = remote ? mergeTrips(latest, remote) : latest
          await pushLiveTrip(shareId, merged)
          if (tripFingerprint(merged) !== tripFingerprint(latest)) {
            setData((prev) => ({
              ...prev,
              trips: prev.trips.map((t) => (t.id === latest.id ? { ...merged, id: latest.id, shareId } : t)),
            }))
          }
        } catch {
          /* stay local if the room is briefly unreachable */
        }
      })()
    }, 700)
    return () => window.clearTimeout(handle)
  }, [liveSig])

  useEffect(() => {
    const shareId = currentTrip?.shareId
    if (!shareId) return
    const tick = async () => {
      if (document.hidden || joining.current) return
      const remote = await pullLiveTrip(shareId)
      if (!remote) return
      setData((prev) => {
        const local = prev.trips.find((t) => t.shareId === shareId)
        if (!local) return prev
        const merged = mergeTrips(local, remote)
        if (tripFingerprint(merged) === tripFingerprint(local)) return prev
        return {
          ...prev,
          trips: prev.trips.map((t) => (t.id === local.id ? { ...merged, id: local.id, shareId } : t)),
        }
      })
    }
    const interval = window.setInterval(() => void tick(), 4000)
    const onVis = () => void tick()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [currentTrip?.shareId])

  const value = useMemo<StoreValue>(() => {
    return {
      data,
      currentTrip,
      toast,
      setTheme: (theme) => setData((d) => ({ ...d, theme })),
      selectTrip: (id) => {
        setData((d) => ({ ...d, currentTripId: id }))
        const trip = data.trips.find((t) => t.id === id)
        if (trip?.shareId) setLiveShareHash(trip.shareId)
        else clearLiveShareLocation()
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
        let shareId = trip.shareId
        let live = false
        try {
          shareId = await ensureLiveRoom(trip)
          live = true
          const next = { ...trip, shareId, isDemo: false, updatedAt: Date.now() }
          setData((d) => ({
            ...d,
            trips: d.trips.map((t) => (t.id === trip.id ? next : t)),
          }))
          setLiveShareHash(shareId)
        } catch {
          /* snapshot in the link still opens the trip */
        }
        const url = shareLinkForTrip({ ...trip, shareId }, shareId)
        try {
          if (navigator.share) {
            await navigator.share({
              title: trip.name,
              text: 'Open this TripTab link to add expenses with the group.',
              url,
            })
          } else {
            await navigator.clipboard.writeText(url)
          }
        } catch {
          await navigator.clipboard.writeText(url)
        }
        notify(
          isLocalHost()
            ? 'Invite ready. Deploy TripTab (GitHub Pages) so friends outside this computer can open it.'
            : live
              ? 'Invite link copied — friends can open it and add expenses.'
              : 'Invite link copied — friends can open the trip on their phones.',
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
