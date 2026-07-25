import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getMeta, setMeta } from '../lib/db'
import { useApp } from '../lib/app'
import { exerciseName, formatClock, currentWeekStreak, newlyEarned } from '../lib/fitness'
import { Screen, Button } from '../components/ui'

export default function SessionDone() {
  const { id } = useParams()
  const nav = useNavigate()
  const { userId } = useApp()

  const session = useLiveQuery(() => db.sessions.get(id!), [id], undefined)
  const entries = useLiveQuery(
    async () => (await db.session_entries.where('session_id').equals(id!).toArray())
      .filter((e) => !e.deleted).sort((a, b) => a.position - b.position),
    [id], [],
  )
  const sessions = useLiveQuery(
    async () => (await db.sessions.where('user_id').equals(userId!).toArray()).filter((s) => !s.deleted),
    [userId], [],
  )

  if (!session) return null

  const done = entries.filter((e) => e.done)
  const volume = done.reduce((sum, e) => sum + (e.weight_kg ?? 0) * e.sets * e.reps, 0)
  const streak = currentWeekStreak(sessions)

  const [milestone, setMilestone] = useState<string | null>(null)
  const doneSessions = sessions.filter((s) => s.ended_at)
  useEffect(() => {
    if (!userId || doneSessions.length === 0) return
    let cancelled = false
    ;(async () => {
      const key = `milestones-seen.${userId}`
      const seen: string[] = JSON.parse((await getMeta(key)) ?? '[]')
      const earned = newlyEarned(doneSessions, seen)
      if (earned && !cancelled) {
        setMilestone(earned.label)
        await setMeta(key, JSON.stringify([...seen, earned.id]))
      }
    })()
    return () => { cancelled = true }
  }, [userId, doneSessions.length])

  return (
    <Screen>
      <div className="pt-6">
        <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-green px-3 py-1 text-[12px] font-semibold uppercase tracking-wide text-white">
          <span className="text-[13px]">✓</span> Session logged
        </div>
        <h1 className="mt-3 font-display text-[30px] font-bold leading-tight tracking-tight">
          {session.name}
        </h1>
        <p className="mt-1 text-[15px] text-muted">
          {new Date(session.started_at).toLocaleDateString(undefined, {
            weekday: 'long', day: 'numeric', month: 'long',
          })}
        </p>
      </div>

      {milestone && (
        <div className="mt-5 flex items-center gap-3 rounded-2xl border border-green bg-greensoft px-4 py-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green text-[18px] text-white">★</div>
          <div>
            <p className="font-display text-[16px] font-bold text-green">Milestone reached</p>
            <p className="text-[13px] text-muted">{milestone}. Nicely done.</p>
          </div>
        </div>
      )}ç

      <div className="mt-6 grid grid-cols-2 gap-2.5">
        <Stat label="Duration" value={formatClock(session.duration_s ?? 0)} />
        <Stat label="Exercises" value={String(done.length)} />
        <Stat label="Total lifted" value={volume > 0 ? `${Math.round(volume).toLocaleString()} kg` : '—'} accent="green" />
        <Stat label="Calories" value={session.calories ? `~${session.calories}` : '—'} accent="coral" />
      </div>

      {!session.calories && (
        <p className="mt-2 text-[12px] text-muted">
          Add your weight in Settings to get a calorie estimate.
        </p>
      )}

      {streak > 1 && (
        <div className="mt-4 rounded-2xl border border-coral bg-coralsoft px-4 py-3.5">
          <p className="font-display text-[16px] font-medium text-coral">{streak} days in a row</p>
          <p className="mt-0.5 text-[13px] text-muted">Keep it going.</p>
        </div>
      )}

      {done.length > 0 && (
        <>
          <h2 className="mb-2.5 mt-7 font-display text-[17px] font-medium">What you did</h2>
          <div className="space-y-1.5">
            {done.map((e) => (
              <div key={e.id}
                className="flex items-baseline justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3">
                <span className="truncate text-[15px]">{exerciseName(e.exercise_id)}</span>
                <span className="tabnum shrink-0 text-[14px] text-muted">
                  {e.sets} × {e.reps}{e.weight_kg != null && ` · ${e.weight_kg} kg`}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="mt-7">
        <Button onClick={() => nav('/')}>Done</Button>
      </div>
    </Screen>
  )
}

function Stat({ label, value, accent }: {
  label: string; value: string; accent?: 'green' | 'coral'
}) {
  const tone = accent === 'green' ? 'text-green' : accent === 'coral' ? 'text-coral' : ''
  return (
    <div className="rounded-2xl border border-line bg-surface px-4 py-3.5">
      <p className="text-[12.5px] text-muted">{label}</p>
      <p className={`tabnum mt-1 font-display text-[22px] font-bold ${tone}`}>{value}</p>
    </div>
  )
}
