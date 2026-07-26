import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, put, uid, now, softDelete } from '../lib/db'
import { useApp } from '../lib/app'
import {
  exercise, exerciseName, usesWeight, alternatives, formatClock, estimateCalories, personalBests,
} from '../lib/fitness'
import { ExercisePicker } from '../components/ExercisePicker'
import { TopBar, Button, Field, Stepper, Sheet, Empty, MuscleTiles } from '../components/ui'
import type { SessionEntry } from '../lib/types'

export default function SessionRun() {
  const { id } = useParams()
  const nav = useNavigate()
  const { userId, profile } = useApp()

  const session = useLiveQuery(() => db.sessions.get(id!), [id], undefined)
  const entries = useLiveQuery(
    async () => (await db.session_entries.where('session_id').equals(id!).toArray())
      .filter((e) => !e.deleted).sort((a, b) => a.position - b.position),
    [id], [],
  )

  const history = useLiveQuery(async () => {
    const mine = (await db.sessions.where('user_id').equals(userId!).toArray())
      .filter((s) => s.ended_at && !s.deleted).map((s) => s.id)
    const all = await db.session_entries.toArray()
    return all.filter((e) => mine.includes(e.session_id))
  }, [userId], [])

  const [elapsed, setElapsed] = useState(0)
  const [picking, setPicking] = useState(false)
  const [editing, setEditing] = useState<SessionEntry | null>(null)
  const [swapping, setSwapping] = useState<SessionEntry | null>(null)
  const [finishing, setFinishing] = useState(false)

  useEffect(() => {
    if (!session?.started_at) return
    const tick = () =>
      setElapsed(Math.floor((Date.now() - new Date(session.started_at).getTime()) / 1000))
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [session?.started_at])

  if (!session) return null
  if (session.ended_at) { nav(`/session/${session.id}/done`, { replace: true }); return null }

  const bests = personalBests(history)
  const doneCount = entries.filter((e) => e.done).length

  async function addExercise(exerciseId: string) {
    await put('session_entries', {
      id: uid(), session_id: session!.id, exercise_id: exerciseId,
      position: entries.length, sets: 3, reps: 12,
      weight_kg: usesWeight(exerciseId) ? 0 : null,
      done: 0, updated_at: now(), deleted: 0,
    })
  }

  async function move(index: number, dir: -1 | 1) {
    const target = index + dir
    if (target < 0 || target >= entries.length) return
    const a = entries[index], b = entries[target]
    await put('session_entries', { ...a, position: b.position })
    await put('session_entries', { ...b, position: a.position })
  }

  async function toggle(e: SessionEntry) {
    await put('session_entries', { ...e, done: e.done ? 0 : 1 })
  }

  /** Writes the entry, and pushes the working weight back onto the routine. */
  async function saveEntry(e: SessionEntry, sets: number, reps: number, weight: number | null) {
    await put('session_entries', { ...e, sets, reps, weight_kg: weight })
    if (!session!.routine_id) return
    const linked = (await db.routine_exercises.where('routine_id').equals(session!.routine_id).toArray())
      .find((r) => !r.deleted && r.exercise_id === e.exercise_id)
    if (linked) await put('routine_exercises', { ...linked, sets, reps, weight_kg: weight })
  }

  return (
    <>
      <TopBar
        title={session.name}
        right={
          <span className="tabnum font-display text-[17px] font-bold text-brand">
            {formatClock(elapsed)}
          </span>
        }
      />

      <div className="rise px-5 pb-32 pt-4">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[14px] text-muted">{doneCount} of {entries.length} done</p>
          <button onClick={() => setPicking(true)} className="text-[14px] font-medium text-brand">
            Add exercise
          </button>
        </div>

        {entries.length === 0 ? (
          <Empty title="Nothing added yet" body="Add the first exercise and the clock keeps running."
            action={<Button full={false} onClick={() => setPicking(true)}>Add exercise</Button>} />
        ) : (
          <div className="space-y-2.5">
            {entries.map((e, i) => {
              const best = bests.get(e.exercise_id)
              const isPB = e.weight_kg != null && best != null && e.weight_kg > best
              return (
                <div key={e.id}
                  className={`rounded-2xl border bg-surface p-4 transition ${
                    e.done ? 'border-line opacity-55' : 'border-line'}`}>
                  <div className="flex items-start gap-3">
                    <button onClick={() => toggle(e)} aria-label={e.done ? 'Mark not done' : 'Mark done'}
                      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 text-[14px] ${
                        e.done ? 'border-green bg-green text-white' : 'border-line text-transparent'}`}>
                      ✓
                    </button>
                    <button className="min-w-0 flex-1 text-left" onClick={() => setEditing(e)}>
                      <p className="truncate text-[16px] font-medium">
                        {exerciseName(e.exercise_id)}
                        {isPB && (
                          <span className="ml-2 rounded-md bg-lime px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-onlime">
                            best
                          </span>
                        )}
                      </p>
                      <p className="mt-1 tabnum text-[15px] text-muted">
                        {e.sets} × {e.reps}
                        {e.weight_kg != null && ` · ${e.weight_kg} kg`}
                      </p>
                      <MuscleTiles
                        primary={exercise(e.exercise_id)?.primaryMuscles ?? []}
                        secondary={exercise(e.exercise_id)?.secondaryMuscles ?? []}
                        max={3}
                      />
                    </button>
                    <div className="flex shrink-0 flex-col gap-1">
                      <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up"
                        className="h-7 w-7 rounded-md border border-line text-[13px] text-muted disabled:opacity-30">↑</button>
                      <button onClick={() => move(i, 1)} disabled={i === entries.length - 1} aria-label="Move down"
                        className="h-7 w-7 rounded-md border border-line text-[13px] text-muted disabled:opacity-30">↓</button>
                    </div>
                  </div>
                    <div className="mt-3 flex items-center gap-2">
                      <button onClick={() => nav(`/exercise/${e.exercise_id}`)}
                        className="flex-[2] flex items-center justify-center gap-1.5 rounded-lg bg-brandsoft py-2.5 text-[13px] font-semibold text-brand">
                        <span className="text-[10px]">▶</span> How to
                      </button>
                      <button onClick={() => setSwapping(e)}
                        className="flex-1 rounded-lg py-2.5 text-[13px] text-muted">
                        Swap
                      </button>
                    </div>
                </div>
              )
            })}
          </div>
        )}

        <p className="mt-4 text-center text-[12px] text-muted">
          Reordering here only affects today. Your routine stays as it is.
        </p>

        <div className="mt-6">
          <Button onClick={() => setFinishing(true)}>Finish session</Button>
        </div>
      </div>

      <ExercisePicker open={picking} onClose={() => setPicking(false)}
        selected={entries.map((e) => e.exercise_id)}
        onPick={(item) => { addExercise(item.id); setPicking(false) }} />

      <EntrySheet entry={editing} onClose={() => setEditing(null)}
        onSave={saveEntry}
        onRemove={async (e) => { await softDelete('session_entries', e.id); setEditing(null) }} />

      <SwapSheet entry={swapping} onClose={() => setSwapping(null)}
        onSwap={async (e, newId) => {
          await put('session_entries', {
            ...e, exercise_id: newId,
            weight_kg: usesWeight(newId) ? (e.weight_kg ?? 0) : null,
          })
          setSwapping(null)
        }} />

      <FinishSheet
        open={finishing}
        onClose={() => setFinishing(false)}
        onFinish={async (intensity) => {
          const duration = Math.floor((Date.now() - new Date(session.started_at).getTime()) / 1000)
          await put('sessions', {
            ...session,
            ended_at: now(),
            duration_s: duration,
            intensity,
            calories: estimateCalories(profile?.weight_kg ?? null, duration, intensity),
          })
          nav(`/session/${session.id}/done`, { replace: true })
        }} />
    </>
  )
}

function EntrySheet({ entry, onClose, onSave, onRemove }: {
  entry: SessionEntry | null
  onClose: () => void
  onSave: (e: SessionEntry, sets: number, reps: number, weight: number | null) => Promise<void>
  onRemove: (e: SessionEntry) => void
}) {
  const [sets, setSets] = useState(3)
  const [reps, setReps] = useState(12)
  const [weight, setWeight] = useState(0)

  useEffect(() => {
    if (entry) { setSets(entry.sets); setReps(entry.reps); setWeight(entry.weight_kg ?? 0) }
  }, [entry?.id])

  if (!entry) return null
  const weighted = entry.weight_kg != null

  return (
    <Sheet open onClose={onClose} title={exerciseName(entry.exercise_id)}>
      <div className="space-y-4">
        <Field label="Sets"><Stepper value={sets} onChange={setSets} min={1} /></Field>
        <Field label="Reps"><Stepper value={reps} onChange={setReps} min={1} /></Field>
        {weighted && (
          <Field label="Weight" hint="Saved back to your routine for next time.">
            <Stepper value={weight} onChange={setWeight} step={2.5} decimals={1} suffix="kg" />
          </Field>
        )}
        <Button onClick={async () => {
          await onSave(entry, sets, reps, weighted ? weight : null)
          onClose()
        }}>Save</Button>
        <Button variant="danger" onClick={() => onRemove(entry)}>Remove from today</Button>
      </div>
    </Sheet>
  )
}

function SwapSheet({ entry, onClose, onSwap }: {
  entry: SessionEntry | null
  onClose: () => void
  onSwap: (e: SessionEntry, newId: string) => void
}) {
  if (!entry) return null
  const options = alternatives(entry.exercise_id)
  return (
    <Sheet open onClose={onClose} title="Swap for today">
      <p className="mb-4 text-[13.5px] text-muted">
        Same muscles, different equipment. Your routine keeps the original.
      </p>
      <div className="space-y-1.5">
        {options.map((o) => (
          <button key={o.id} onClick={() => onSwap(entry, o.id)}
            className="w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-left active:scale-[.99]">
            <div className="text-[15px] font-medium">{o.name}</div>
            <MuscleTiles primary={o.primaryMuscles} secondary={o.secondaryMuscles} max={3} />
          </button>
        ))}
        {options.length === 0 && (
          <p className="py-6 text-center text-[14px] text-muted">No close alternatives for this one.</p>
        )}
      </div>
    </Sheet>
  )
}

function FinishSheet({ open, onClose, onFinish }: {
  open: boolean
  onClose: () => void
  onFinish: (intensity: 'light' | 'moderate' | 'hard') => void
}) {
  const levels: { key: 'light' | 'moderate' | 'hard'; label: string; note: string }[] = [
    { key: 'light', label: 'Light', note: 'Barely broke a sweat' },
    { key: 'moderate', label: 'Moderate', note: 'Worked, could hold a conversation' },
    { key: 'hard', label: 'Hard', note: 'Really pushed it' },
  ]
  return (
    <Sheet open={open} onClose={onClose} title="How hard was it?">
      <p className="mb-4 text-[13.5px] text-muted">Used for a rough calorie estimate.</p>
      <div className="space-y-2">
        {levels.map((l) => (
          <button key={l.key} onClick={() => onFinish(l.key)}
            className="w-full rounded-xl border border-line bg-surface px-4 py-3.5 text-left active:scale-[.99]">
            <div className="font-display text-[16px] font-medium">{l.label}</div>
            <div className="mt-0.5 text-[13px] text-muted">{l.note}</div>
          </button>
        ))}
      </div>
    </Sheet>
  )
}
