import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, put, uid, now, softDelete } from '../lib/db'
import { useApp } from '../lib/app'
import { currentStreak, exerciseName } from '../lib/fitness'
import { Screen, Title, Card, Button, Empty } from '../components/ui'
import type { Session, GoalKey } from '../lib/types'

const GOAL_LABEL: Record<GoalKey, string> = {
  strength: 'Strength',
  muscle: 'Build muscle',
  endurance: 'Endurance',
  fitness: 'General fitness',
}

export default function Home() {
  const nav = useNavigate()
  const { userId, profile } = useApp()

  const routines = useLiveQuery(
    async () => (await db.routines.where('user_id').equals(userId!).toArray())
      .filter((r) => !r.deleted)
      .sort((a, b) => a.position - b.position),
    [userId], [],
  )

  const sessions = useLiveQuery(
    async () => (await db.sessions.where('user_id').equals(userId!).toArray()).filter((s) => !s.deleted),
    [userId], [],
  )

  const counts = useLiveQuery(async () => {
    const all = await db.routine_exercises.toArray()
    const map = new Map<string, number>()
    for (const e of all) {
      if (e.deleted) continue
      map.set(e.routine_id, (map.get(e.routine_id) ?? 0) + 1)
    }
    return map
  }, [], new Map<string, number>())

  const open = sessions.find((s) => !s.ended_at)
  const done = sessions.filter((s) => s.ended_at)
  const streak = currentStreak(sessions)

  async function startQuick() {
    const session: Session = {
      id: uid(), user_id: userId!, routine_id: null, name: 'Quick session',
      started_at: now(), ended_at: null, duration_s: null, intensity: null,
      calories: null, updated_at: now(), deleted: 0,
    }
    await put('sessions', session)
    nav(`/session/${session.id}`)
  }

  async function startRoutine(routineId: string, name: string) {
    const session: Session = {
      id: uid(), user_id: userId!, routine_id: routineId, name,
      started_at: now(), ended_at: null, duration_s: null, intensity: null,
      calories: null, updated_at: now(), deleted: 0,
    }
    await put('sessions', session)

    const exercises = (await db.routine_exercises.where('routine_id').equals(routineId).toArray())
      .filter((e) => !e.deleted)
      .sort((a, b) => a.position - b.position)

    for (const [i, e] of exercises.entries()) {
      await put('session_entries', {
        id: uid(), session_id: session.id, exercise_id: e.exercise_id, position: i,
        sets: e.sets, reps: e.reps, weight_kg: e.weight_kg, done: 0,
        updated_at: now(), deleted: 0,
      })
    }
    nav(`/session/${session.id}`)
  }

  return (
    <Screen pad={false}>
      <div className="hero-gradient px-5 pb-6 pt-6 text-white">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[14px] font-medium text-white/70">{greeting()}</p>
            <h1 className="font-display text-[30px] font-bold leading-tight tracking-tight">
              {profile?.name}
            </h1>
          </div>
          <button onClick={() => nav('/settings')} aria-label="Open settings"
            className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-display text-[16px] font-bold ring-2 ring-white/30"
            style={{ background: profile?.colour, color: profile?.colour === '#CBFF3C' ? '#1E2A00' : '#fff' }}>
            {profile?.name[0]}
          </button>
        </div>

        <div className="mt-5 flex gap-2.5">
          <div className="flex-1 rounded-2xl bg-white/15 px-3.5 py-3 backdrop-blur">
            <p className="tabnum font-display text-[24px] font-bold leading-none">{done.length}</p>
            <p className="mt-1 text-[12px] text-white/70">
              session{done.length === 1 ? '' : 's'}
            </p>
          </div>
          <div className="flex-1 rounded-2xl bg-white/15 px-3.5 py-3 backdrop-blur">
            <p className="tabnum font-display text-[24px] font-bold leading-none">{streak}</p>
            <p className="mt-1 text-[12px] text-white/70">day streak</p>
          </div>
          <div className="flex-1 rounded-2xl bg-white/15 px-3.5 py-3 backdrop-blur">
            <p className="tabnum font-display text-[24px] font-bold leading-none">{routines.length}</p>
            <p className="mt-1 text-[12px] text-white/70">
              routine{routines.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
      </div>

      <div className="px-5 pt-5">
      {open && (
        <Card className="mb-4 !border-brand">
          <p className="text-[13px] font-medium text-brand">Session in progress</p>
          <p className="mt-0.5 font-display text-[18px] font-bold">{open.name}</p>
          <div className="mt-3 flex gap-2">
            <Button onClick={() => nav(`/session/${open.id}`)}>Resume</Button>
            <Button variant="ghost" onClick={async () => {
              await put('sessions', { ...open, deleted: 1 })
            }}>Discard</Button>
          </div>
        </Card>
      )}

      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-[17px] font-medium">Your routines</h2>
        <button onClick={() => nav('/routine/new')} className="text-[14px] font-medium text-brand">
          New routine
        </button>
      </div>

      {routines.length === 0 ? (
        <Empty
          title="Build your first routine"
          body="Pick your goal, choose your machines, and it's ready to run every week."
          action={<Button onClick={() => nav('/routine/new')} full={false}>Create routine</Button>}
        />
      ) : (
        <div className="space-y-2.5">
          {routines.map((r) => (
            <div key={r.id} className="overflow-hidden rounded-2xl border border-line bg-surface">
              <div className="flex">
                <div className="w-1.5 shrink-0 bg-gradient-to-b from-green to-blue" />
                <div className="min-w-0 flex-1 p-4">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-[18px] font-bold">{r.name}</p>
                      <p className="mt-0.5 text-[13px] text-muted">
                        {counts.get(r.id) ?? 0} exercises · {GOAL_LABEL[r.goal] ?? r.goal}
                      </p>
                    </div>
                    <button onClick={() => nav(`/routine/${r.id}`)}
                      className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-[13px] text-muted">
                      Edit
                    </button>
                  </div>
                  <div className="mt-3">
                    <Button variant="green" onClick={() => startRoutine(r.id, r.name)}>Start</Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4">
        <Button variant="ghost" onClick={startQuick}>Quick session</Button>
      </div>

      {done.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 font-display text-[17px] font-medium">Recent</h2>
          <div className="space-y-2">
            {done
              .sort((a, b) => b.started_at.localeCompare(a.started_at))
              .slice(0, 8)
              .map((s) => <RecentRow key={s.id} session={s} />)}
          </div>
        </>
      )}
      </div>
    </Screen>
  )
}

function RecentRow({ session }: { session: Session }) {
  const [confirming, setConfirming] = useState(false)

  const entries = useLiveQuery(
    async () => (await db.session_entries.where('session_id').equals(session.id).toArray())
      .filter((e) => !e.deleted && e.done),
    [session.id], [],
  )
  const mins = session.duration_s ? Math.round(session.duration_s / 60) : 0

  async function remove() {
    const all = await db.session_entries.where('session_id').equals(session.id).toArray()
    for (const e of all) await softDelete('session_entries', e.id)
    await softDelete('sessions', session.id)
  }

  if (confirming) {
    return (
      <div className="rounded-xl border border-danger bg-surface px-4 py-3">
        <p className="text-[14px] font-medium">Delete this session?</p>
        <p className="mt-0.5 text-[12.5px] text-muted">
          It goes from both phones. Your routine and its weights are untouched.
        </p>
        <div className="mt-3 flex gap-2">
          <button onClick={remove}
            className="flex-1 rounded-lg bg-danger px-3 py-2 text-[13px] font-medium text-white">
            Delete
          </button>
          <button onClick={() => setConfirming(false)}
            className="flex-1 rounded-lg border border-line px-3 py-2 text-[13px] text-muted">
            Keep it
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3">
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-greensoft text-[12px] font-bold text-green">
        ✓
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate text-[15px] font-medium">{session.name}</p>
          <p className="shrink-0 text-[12.5px] text-muted">
            {new Date(session.started_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
          </p>
        </div>
        <p className="mt-0.5 truncate text-[12.5px] text-muted">
          {mins} min · {entries.length} exercises
          {session.calories ? ` · ~${session.calories} kcal` : ''}
        </p>
        {entries.length > 0 && (
          <p className="mt-1 truncate text-[12px] text-muted">
            {entries.slice(0, 3).map((e) => exerciseName(e.exercise_id)).join(', ')}
            {entries.length > 3 ? '…' : ''}
          </p>
        )}
      </div>
      <button onClick={() => setConfirming(true)} aria-label={`Delete ${session.name}`}
        className="-mr-1 shrink-0 rounded-lg px-2 py-1 text-[16px] leading-none text-muted active:bg-raised">
        ×
      </button>
    </div>
  )
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Morning'
  if (h < 18) return 'Afternoon'
  return 'Evening'
}
