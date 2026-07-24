import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, put } from './db'
import { seedIfEmpty, startSyncLoop, onSyncState, type SyncState } from './sync'
import type { Profile } from './types'

const USER_KEY = 'gym-app.user'

interface AppValue {
  userId: string | null
  profile: Profile | undefined
  profiles: Profile[]
  setUserId: (id: string | null) => void
  setTheme: (t: 'light' | 'dark') => void
  syncState: SyncState
  ready: boolean
}

const Ctx = createContext<AppValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [userId, setUserIdState] = useState<string | null>(() => localStorage.getItem(USER_KEY))
  const [ready, setReady] = useState(false)
  const [syncState, setSyncState] = useState<SyncState>('idle')

  const profiles = useLiveQuery(() => db.profiles.filter((p) => !p.deleted).toArray(), [], [])
  const profile = profiles.find((p) => p.id === userId)

  useEffect(() => {
    let stop: (() => void) | undefined
    seedIfEmpty()
      .then(() => { setReady(true); stop = startSyncLoop() })
      .catch((e) => { console.error(e); setReady(true) })
    const off = onSyncState(setSyncState)
    return () => { stop?.(); off() }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = profile?.theme ?? 'light'
    const meta = document.querySelector('meta[name="theme-color"]')
    meta?.setAttribute('content', profile?.theme === 'dark' ? '#0C0E12' : '#F1F2F4')
  }, [profile?.theme])

  const setUserId = (id: string | null) => {
    if (id) localStorage.setItem(USER_KEY, id)
    else localStorage.removeItem(USER_KEY)
    setUserIdState(id)
  }

  const setTheme = (t: 'light' | 'dark') => {
    if (profile) put('profiles', { ...profile, theme: t })
  }

  return (
    <Ctx.Provider value={{ userId, profile, profiles, setUserId, setTheme, syncState, ready }}>
      {children}
    </Ctx.Provider>
  )
}

export function useApp() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp must be used inside AppProvider')
  return v
}
