import Dexie, { type Table } from 'dexie'
import type {
  Profile, Routine, RoutineExercise, Session, SessionEntry,
  GoalPreset, Outbox, TableName,
} from './types'

export class GymDB extends Dexie {
  profiles!: Table<Profile, string>
  routines!: Table<Routine, string>
  routine_exercises!: Table<RoutineExercise, string>
  sessions!: Table<Session, string>
  session_entries!: Table<SessionEntry, string>
  goal_presets!: Table<GoalPreset, string>
  outbox!: Table<Outbox, number>
  meta!: Table<{ key: string; value: string }, string>

  constructor() {
    super('gym-app')
    this.version(1).stores({
      profiles: 'id, updated_at',
      routines: 'id, user_id, position, updated_at',
      routine_exercises: 'id, routine_id, position, updated_at',
      sessions: 'id, user_id, started_at, updated_at',
      session_entries: 'id, session_id, exercise_id, updated_at',
      goal_presets: 'id, updated_at',
      outbox: '++key, table, row_id',
      meta: 'key',
    })
  }
}

export const db = new GymDB()

export const uid = () =>
  (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`)

export const now = () => new Date().toISOString()

/**
 * Every write goes through here: it lands in Dexie immediately so the UI never
 * waits on the network, and queues the row id for the sync loop to push later.
 */
export async function put<T extends { id: string; updated_at: string }>(
  table: TableName,
  row: T,
): Promise<T> {
  const stamped = { ...row, updated_at: now() }
  await db.transaction('rw', (db as any)[table], db.outbox, async () => {
    await (db as any)[table].put(stamped)
    await db.outbox.add({ table, row_id: row.id, queued_at: now() })
  })
  return stamped
}

export async function softDelete(table: TableName, id: string) {
  const row = await (db as any)[table].get(id)
  if (!row) return
  await put(table, { ...row, deleted: 1 })
}

export async function getMeta(key: string) {
  return (await db.meta.get(key))?.value ?? null
}

export async function setMeta(key: string, value: string) {
  await db.meta.put({ key, value })
}
