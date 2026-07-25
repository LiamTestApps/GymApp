import { db, getMeta, setMeta, now, uid } from './db'
import { supabase, supabaseConfigured } from './supabase'
import type { TableName, GoalPreset, Profile } from './types'

const TABLES: TableName[] = [
  'profiles', 'goal_presets', 'goals', 'routines', 'routine_exercises', 'sessions', 'session_entries',
]

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error'

let listeners: ((s: SyncState) => void)[] = []
let state: SyncState = 'idle'

export function onSyncState(fn: (s: SyncState) => void) {
  listeners.push(fn)
  fn(state)
  return () => { listeners = listeners.filter((l) => l !== fn) }
}

function setState(s: SyncState) {
  state = s
  listeners.forEach((l) => l(s))
}

const DEFAULT_GOALS: Omit<GoalPreset, 'updated_at' | 'deleted'>[] = [
  { id: 'strength',  label: 'Strength',        sets: 4, reps_low: 4,  reps_high: 6 },
  { id: 'muscle',    label: 'Build muscle',    sets: 3, reps_low: 8,  reps_high: 12 },
  { id: 'endurance', label: 'Endurance / tone', sets: 3, reps_low: 15, reps_high: 20 },
  { id: 'fitness',   label: 'General fitness', sets: 3, reps_low: 10, reps_high: 12 },
]

const DEFAULT_PROFILES: Omit<Profile, 'updated_at' | 'deleted'>[] = [
  { id: 'liam', name: 'Liam', colour: '#3D2BFF', age: null, weight_kg: null, theme: 'light' },
  { id: 'orla', name: 'Orla', colour: '#CBFF3C', age: null, weight_kg: null, theme: 'light' },
]

/** Creates the two profiles and the goal presets the very first time the app runs. */
export async function seedIfEmpty() {
  const stamp = { updated_at: now(), deleted: 0 as const }

  if ((await db.goal_presets.count()) === 0) {
    await db.goal_presets.bulkPut(DEFAULT_GOALS.map((g) => ({ ...g, ...stamp })))
    for (const g of DEFAULT_GOALS) {
      await db.outbox.add({ table: 'goal_presets', row_id: g.id, queued_at: now() })
    }
  }

  if ((await db.profiles.count()) === 0) {
    await db.profiles.bulkPut(DEFAULT_PROFILES.map((p) => ({ ...p, ...stamp })))
    for (const p of DEFAULT_PROFILES) {
      await db.outbox.add({ table: 'profiles', row_id: p.id, queued_at: now() })
    }
  }
}

async function push() {
  if (!supabase) return
  const queued = await db.outbox.toArray()
  if (!queued.length) return

  const byTable = new Map<TableName, Set<string>>()
  for (const q of queued) {
    if (!byTable.has(q.table)) byTable.set(q.table, new Set())
    byTable.get(q.table)!.add(q.row_id)
  }

  for (const [table, ids] of byTable) {
    const rows = (await (db as any)[table].bulkGet([...ids])).filter(Boolean)
    if (!rows.length) continue
    const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' })
    if (error) throw error
    const keys = queued.filter((q) => q.table === table && ids.has(q.row_id)).map((q) => q.key!)
    await db.outbox.bulkDelete(keys)
  }
}

async function pull() {
  if (!supabase) return
  const since = (await getMeta('last_pull')) ?? '1970-01-01T00:00:00.000Z'
  const highWater = now()

  for (const table of TABLES) {
    const { data, error } = await supabase.from(table).select('*').gt('updated_at', since)
    if (error) throw error
    if (!data?.length) continue

    // Local wins only if it is genuinely newer; otherwise take the remote row.
    const local = await (db as any)[table].bulkGet(data.map((r: any) => r.id))
    const incoming = data.filter((r: any, i: number) => {
      const l = local[i]
      return !l || new Date(r.updated_at) >= new Date(l.updated_at)
    })
    if (incoming.length) await (db as any)[table].bulkPut(incoming)
  }

  await setMeta('last_pull', highWater)
}

let running = false

export async function sync() {
  if (!supabaseConfigured || running) return
  if (!navigator.onLine) { setState('offline'); return }
  running = true
  setState('syncing')
  try {
    await push()
    await pull()
    setState('idle')
  } catch (e) {
    console.error('[sync]', e)
    setState('error')
  } finally {
    running = false
  }
}

export function startSyncLoop() {
  sync()
  const timer = setInterval(sync, 30_000)
  window.addEventListener('online', sync)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') sync()
  })
  return () => {
    clearInterval(timer)
    window.removeEventListener('online', sync)
  }
}
