import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, put, uid, now, softDelete } from '../lib/db'
import { useApp } from '../lib/app'
import {
  exercise, exerciseName, usesWeight, alternatives, formatClock, estimateCalories, personalBests,
  trackingMode, trackingDefaults, entrySummary,
} from '../lib/fitness'
import { ExercisePicker } from '../components/ExercisePicker'
import { ExerciseView } from './ExerciseDetail'
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
  const [cardioFinishing, setCardioFinishing] = useState<SessionEntry | null>(null)

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
    const d = trackingDefaults(exerciseId)
    await put('session_entries', {
      id: uid(), session_id: session!.id, exercise_id: exerciseId,
      position: entries.length,
      sets: d.sets, reps: d.reps, weight_kg: d.weight_kg, duration_s: d.duration_s,
      speed_kmh: null, distance_km: null, timer_started_at: null,
      done: 0, updated_at: now(), deleted: 0,
    })
  }

  function liveSecs(e: SessionEntry): number {
    if (!e.timer_started_at) return e.duration_s ?? 0
    const secs = Math.floor((Date.now() - new Date(e.timer_started_at).getTime()) / 1000)
    return trackingMode(e.exercise_id) === 'cardio' ? (e.duration_s ?? 0) + secs : secs
  }

  function liveSummary(e: SessionEntry): string {
    if (!e.timer_started_at) return entrySummary(e)
    return trackingMode(e.exercise_id) === 'hold'
      ? `${e.sets} × ${formatClock(liveSecs(e))}`
      : formatClock(liveSecs(e)) + (e.speed_kmh != null ? ` · ${e.speed_kmh} km/h` : '')
  }

  async function move(index: number, dir: -1 | 1) {
    const target = index + dir
    if (target < 0 || target >= entries.length) return
    const a = entries[index], b = entries[target]
    await put('session_entries', { ...a, position: b.position })
    await put('session_entries', { ...b, position: a.position })
  }

  async function toggle(e: SessionEntry) {
    if (trackingMode(e.exercise_id) === 'cardio' && !e.done) {
      const stopped = e.timer_started_at ? await stopTimer(e) : e
      setCardioFinishing(stopped)     // opens the sheet; done is set on save
      return
    }
    await put('session_entries', { ...e, done: e.done ? 0 : 1 })
  }

  async function stopTimer(e: SessionEntry): Promise<SessionEntry> {
    if (!e.timer_started_at) return e
    const secs = Math.floor((Date.now() - new Date(e.timer_started_at).getTime()) / 1000)
    const mode = trackingMode(e.exercise_id)
    const duration_s = mode === 'cardio' ? (e.duration_s ?? 0) + secs : secs
    return await put('session_entries', { ...e, duration_s, timer_started_at: null })
  }

  async function startTimer(e: SessionEntry) {
    const running = entries.find((x) => x.timer_started_at && x.id !== e.id)
    if (running) await stopTimer(running)          // only one runs at a time
    await put('session_entries', { ...e, timer_started_at: now() })
  }

  /** Writes the entry, and pushes the working weight back onto the routine. */
  async function saveEntry(e: SessionEntry, patch: Partial<SessionEntry>) {
    const updated = { ...e, ...patch }
    await put('session_entries', updated)
    if (!session!.routine_id) return
    const linked = (await db.routine_exercises.where('routine_id').equals(session!.routine_id).toArray())
      .find((r) => !r.deleted && r.exercise_id === e.exercise_id)
    if (linked) await put('routine_exercises', {
      ...linked, sets: updated.sets, reps: updated.reps,
      weight_kg: updated.weight_kg, duration_s: updated.duration_s,
    })
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
                        {liveSummary(e)}
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
                  {trackingMode(e.exercise_id) !== 'reps' && (
                    <button
                      onClick={() => (e.timer_started_at ? stopTimer(e) : startTimer(e))}
                      className={`mt-3 w-full rounded-lg py-2.5 text-[13px] font-semibold ${
                        e.timer_started_at ? 'bg-coral text-white' : 'bg-brandsoft text-brand'}`}>
                      {e.timer_started_at
                        ? `Stop · ${formatClock(liveSecs(e))}`
                        : trackingMode(e.exercise_id) === 'hold' ? 'Time a set' : 'Start'}
                    </button>
                  )}
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

      <SwapSheet entry={swapping} canPersist={!!session.routine_id} onClose={() => setSwapping(null)}
        onSwap={async (e, newId, keep) => {
          const sameMode = trackingMode(e.exercise_id) === trackingMode(newId)
          const d = trackingDefaults(newId)
          await put('session_entries', {
            ...e, exercise_id: newId,
            weight_kg: usesWeight(newId) ? (e.weight_kg ?? 0) : null,
            sets: sameMode ? e.sets : d.sets,
            reps: sameMode ? e.reps : d.reps,
            duration_s: sameMode ? e.duration_s : d.duration_s,
            speed_kmh: sameMode ? e.speed_kmh : null,
            distance_km: sameMode ? e.distance_km : null,
            timer_started_at: null,
          })
          if (keep && session!.routine_id) {
            const linked = (await db.routine_exercises.where('routine_id').equals(session!.routine_id).toArray())
              .find((r) => !r.deleted && r.exercise_id === e.exercise_id)
            if (linked) await put('routine_exercises', {
              ...linked, exercise_id: newId,
              weight_kg: usesWeight(newId) ? (linked.weight_kg ?? 0) : null,
              sets: sameMode ? linked.sets : d.sets,
              reps: sameMode ? linked.reps : d.reps,
              duration_s: sameMode ? linked.duration_s : d.duration_s,
            })
          }
          setSwapping(null)
        }} />

      <CardioFinishSheet entry={cardioFinishing} onClose={() => setCardioFinishing(null)}
        onSave={async (e, speed, distance) => {
          await put('session_entries', { ...e, done: 1, speed_kmh: speed, distance_km: distance })
          setCardioFinishing(null)
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
  onSave: (e: SessionEntry, patch: Partial<SessionEntry>) => Promise<void>
  onRemove: (e: SessionEntry) => void
}) {
  const [sets, setSets] = useState(3)
  const [reps, setReps] = useState(12)
  const [weight, setWeight] = useState(0)
  const [holdSec, setHoldSec] = useState(45)
  const [mins, setMins] = useState(0)
  const [secs, setSecs] = useState(0)
  const [speed, setSpeed] = useState(0)
  const [dist, setDist] = useState(0)

  useEffect(() => {
    if (!entry) return
    setSets(entry.sets); setReps(entry.reps); setWeight(entry.weight_kg ?? 0)
    setHoldSec(entry.duration_s ?? 45)
    setMins(Math.floor((entry.duration_s ?? 0) / 60))
    setSecs((entry.duration_s ?? 0) % 60)
    setSpeed(entry.speed_kmh ?? 0)
    setDist(entry.distance_km ?? 0)
  }, [entry?.id])

  if (!entry) return null
  const mode = trackingMode(entry.exercise_id)

  async function save() {
    let patch: Partial<SessionEntry>
    if (mode === 'cardio') {
      patch = {
        duration_s: mins * 60 + secs,
        speed_kmh: speed > 0 ? speed : null,
        distance_km: dist > 0 ? dist : null,
      }
    } else if (mode === 'hold') {
      patch = { sets, duration_s: holdSec }
    } else {
      patch = { sets, reps, weight_kg: entry!.weight_kg != null ? weight : null }
    }
    await onSave(entry!, patch)
    onClose()
  }

  return (
    <Sheet open onClose={onClose} title={exerciseName(entry.exercise_id)}>
      <div className="space-y-4">
        {mode === 'reps' && (<>
          <Field label="Sets"><Stepper value={sets} onChange={setSets} min={1} /></Field>
          <Field label="Reps"><Stepper value={reps} onChange={setReps} min={1} /></Field>
          {entry.weight_kg != null && (
            <Field label="Weight" hint="Saved back to your routine for next time.">
              <Stepper value={weight} onChange={setWeight} step={2.5} decimals={1} suffix="kg" />
            </Field>
          )}
        </>)}

        {mode === 'hold' && (<>
          <Field label="Sets"><Stepper value={sets} onChange={setSets} min={1} /></Field>
          <Field label="Hold" hint="Seconds per set. Saved back to your routine.">
            <Stepper value={holdSec} onChange={setHoldSec} min={5} step={5} suffix="s" />
          </Field>
        </>)}

        {mode === 'cardio' && (<>
          <div className="flex gap-3">
            <Field label="Minutes"><Stepper value={mins} onChange={setMins} min={0} /></Field>
            <Field label="Seconds"><Stepper value={secs} onChange={setSecs} min={0} step={5} /></Field>
          </div>
          <Field label="Avg speed" hint="Optional — leave at 0 to skip.">
            <Stepper value={speed} onChange={setSpeed} min={0} step={0.5} decimals={1} suffix="km/h" />
          </Field>
          <Field label="Distance" hint="Optional.">
            <Stepper value={dist} onChange={setDist} min={0} step={0.1} decimals={1} suffix="km" />
          </Field>
        </>)}

        <Button onClick={save}>Save</Button>
        <Button variant="danger" onClick={() => onRemove(entry)}>Remove from today</Button>
      </div>
    </Sheet>
  )
}

function SwapSheet({ entry, canPersist, onClose, onSwap }: {
  entry: SessionEntry | null
  canPersist: boolean
  onClose: () => void
  onSwap: (e: SessionEntry, newId: string, keep: boolean) => void
}) {
  const [keep, setKeep] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)

  // Fresh toggle + no stale preview each time a new swap opens.
  useEffect(() => { setKeep(false); setPreview(null) }, [entry?.id])

  if (!entry) return null
  const options = alternatives(entry.exercise_id)

  return (
    <>
      <Sheet open onClose={onClose} title="Swap this exercise">
        <p className="mb-4 text-[13.5px] text-muted">
          Same muscles, different equipment.
        </p>

        {canPersist && (
          <button onClick={() => setKeep((k) => !k)}
            className="mb-4 flex w-full items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 text-left">
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 text-[13px] ${
              keep ? 'border-green bg-green text-white' : 'border-line text-transparent'}`}>✓</span>
            <span className="min-w-0">
              <span className="block text-[14px] font-medium">Keep this in my routine</span>
              <span className="block text-[12px] text-muted">
                {keep ? 'Updates the routine too, not just today.' : 'Off — this swap is for today only.'}
              </span>
            </span>
          </button>
        )}

        <div className="space-y-1.5">
          {options.map((o) => (
            <div key={o.id}
              className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-3">
              <button onClick={() => onSwap(entry, o.id, keep)}
                className="min-w-0 flex-1 text-left active:scale-[.99]">
                <div className="text-[15px] font-medium">{o.name}</div>
                <MuscleTiles primary={o.primaryMuscles} secondary={o.secondaryMuscles} max={3} />
              </button>
              <button onClick={() => setPreview(o.id)} aria-label={`About ${o.name}`}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line text-[14px] font-semibold italic text-muted">
                i
              </button>
            </div>
          ))}
          {options.length === 0 && (
            <p className="py-6 text-center text-[14px] text-muted">No close alternatives for this one.</p>
          )}
        </div>
      </Sheet>

      {preview && (
        <Sheet open onClose={() => setPreview(null)}>
          <ExerciseView id={preview} />
        </Sheet>
      )}
    </>
  )
}

function CardioFinishSheet({ entry, onClose, onSave }: {
  entry: SessionEntry | null
  onClose: () => void
  onSave: (e: SessionEntry, speed: number | null, distance: number | null) => void
}) {
  const [speed, setSpeed] = useState(0)
  const [dist, setDist] = useState(0)
  useEffect(() => {
    if (entry) { setSpeed(entry.speed_kmh ?? 0); setDist(entry.distance_km ?? 0) }
  }, [entry?.id])
  if (!entry) return null
  return (
    <Sheet open onClose={onClose} title="Nice work">
      <p className="mb-4 text-[13.5px] text-muted">
        {formatClock(entry.duration_s ?? 0)} logged. Add your average speed if you like — both optional.
      </p>
      <div className="space-y-4">
        <Field label="Avg speed">
          <Stepper value={speed} onChange={setSpeed} min={0} step={0.5} decimals={1} suffix="km/h" />
        </Field>
        <Field label="Distance">
          <Stepper value={dist} onChange={setDist} min={0} step={0.1} decimals={1} suffix="km" />
        </Field>
        <Button onClick={() => onSave(entry, speed > 0 ? speed : null, dist > 0 ? dist : null)}>
          Save & mark done
        </Button>
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
