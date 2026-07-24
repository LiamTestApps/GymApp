import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, put, uid, now, softDelete } from '../lib/db'
import { useApp } from '../lib/app'
import { exercise, exerciseName, usesWeight } from '../lib/fitness'
import { ExercisePicker } from '../components/ExercisePicker'
import {
  TopBar, Button, Card, Field, inputClass, Empty, Stepper, Sheet, BodyMap, MuscleTiles,
} from '../components/ui'
import type { GoalKey, RoutineExercise } from '../lib/types'

export default function RoutineEdit() {
  const { id } = useParams()
  const nav = useNavigate()
  const { userId } = useApp()
  const isNew = id === 'new'

  const goals = useLiveQuery(async () => (await db.goal_presets.toArray()).filter((g) => !g.deleted), [], [])
  const routine = useLiveQuery(async () => (isNew ? undefined : db.routines.get(id!)), [id], undefined)

  const [name, setName] = useState('')
  const [goal, setGoal] = useState<GoalKey>('muscle')
  const [routineId, setRoutineId] = useState<string | null>(isNew ? null : id!)
  const [picking, setPicking] = useState(false)
  const [editing, setEditing] = useState<RoutineExercise | null>(null)

  useEffect(() => {
    if (routine) { setName(routine.name); setGoal(routine.goal) }
  }, [routine?.id])

  const exercises = useLiveQuery(
    async () => routineId
      ? (await db.routine_exercises.where('routine_id').equals(routineId).toArray())
          .filter((e) => !e.deleted).sort((a, b) => a.position - b.position)
      : [],
    [routineId], [],
  )

  const preset = goals.find((g) => g.id === goal)

  const coverage = (() => {
    const primary = new Set<string>()
    const secondary = new Set<string>()
    for (const e of exercises) {
      const c = exercise(e.exercise_id)
      c?.primaryMuscles.forEach((m) => primary.add(m))
      c?.secondaryMuscles.forEach((m) => secondary.add(m))
    }
    return { primary, secondary }
  })()

  async function ensureRoutine(): Promise<string> {
    if (routineId) {
      const r = await db.routines.get(routineId)
      if (r) await put('routines', { ...r, name: name.trim() || 'Untitled routine', goal })
      return routineId
    }
    const count = await db.routines.where('user_id').equals(userId!).count()
    const created = {
      id: uid(), user_id: userId!, name: name.trim() || 'Untitled routine',
      goal, position: count, updated_at: now(), deleted: 0 as const,
    }
    await put('routines', created)
    setRoutineId(created.id)
    return created.id
  }

  async function addExercise(exerciseId: string) {
    const rid = await ensureRoutine()
    const existing = await db.routine_exercises.where('routine_id').equals(rid).toArray()
    await put('routine_exercises', {
      id: uid(), routine_id: rid, exercise_id: exerciseId,
      position: existing.filter((e) => !e.deleted).length,
      sets: preset?.sets ?? 3,
      reps: preset?.reps_high ?? 12,
      weight_kg: usesWeight(exerciseId) ? 0 : null,
      updated_at: now(), deleted: 0,
    })
  }

  async function move(index: number, dir: -1 | 1) {
    const target = index + dir
    if (target < 0 || target >= exercises.length) return
    const a = exercises[index]
    const b = exercises[target]
    await put('routine_exercises', { ...a, position: b.position })
    await put('routine_exercises', { ...b, position: a.position })
  }

  async function save() {
    if (!name.trim() && exercises.length === 0) { nav('/'); return }
    await ensureRoutine()
    nav('/')
  }

  async function remove() {
    if (routineId) {
      for (const e of exercises) await softDelete('routine_exercises', e.id)
      await softDelete('routines', routineId)
    }
    nav('/')
  }

  return (
    <>
      <TopBar back title={isNew ? 'New routine' : 'Edit routine'} />
      <div className="rise space-y-5 px-5 pb-32 pt-4">
        <Field label="Routine name">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Push day" autoComplete="off" />
        </Field>

        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-muted">Goal</span>
          <div className="grid grid-cols-2 gap-2">
            {goals.map((g) => (
              <button key={g.id} onClick={() => setGoal(g.id)}
                className={`rounded-xl border px-3 py-3 text-left ${
                  goal === g.id ? 'border-brand bg-brandsoft' : 'border-line bg-surface'}`}>
                <div className="text-[14px] font-medium">{g.label}</div>
                <div className="mt-0.5 text-[12px] text-muted">
                  {g.sets} × {g.reps_low}–{g.reps_high}
                </div>
              </button>
            ))}
          </div>
          <p className="mt-2 text-[12px] text-muted">
            Sets and reps for new exercises come from this. You can change any of them per exercise.
          </p>
        </div>

        {exercises.length > 0 && (
          <div>
            <span className="mb-1.5 block text-[13px] font-medium text-muted">What this works</span>
            <BodyMap primary={coverage.primary} secondary={coverage.secondary} />
          </div>
        )}

        <div>
          <div className="mb-2.5 flex items-center justify-between">
            <span className="text-[13px] font-medium text-muted">Exercises</span>
            <button onClick={() => setPicking(true)} className="text-[14px] font-medium text-brand">
              Add
            </button>
          </div>

          {exercises.length === 0 ? (
            <Empty title="No exercises yet" body="Add the machines you use, in the order you use them."
              action={<Button full={false} onClick={() => setPicking(true)}>Add exercise</Button>} />
          ) : (
            <div className="space-y-2">
              {exercises.map((e, i) => (
                <Card key={e.id}>
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1" onClick={() => setEditing(e)}>
                      <p className="truncate text-[15px] font-medium">{exerciseName(e.exercise_id)}</p>
                      <p className="mt-0.5 text-[13px] text-muted">
                        {e.sets} × {e.reps}
                        {e.weight_kg != null && ` · ${e.weight_kg} kg`}
                      </p>
                      <MuscleTiles
                        primary={exercise(e.exercise_id)?.primaryMuscles ?? []}
                        secondary={exercise(e.exercise_id)?.secondaryMuscles ?? []}
                      />
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up"
                        className="h-7 w-7 rounded-md border border-line text-[13px] text-muted disabled:opacity-30">↑</button>
                      <button onClick={() => move(i, 1)} disabled={i === exercises.length - 1} aria-label="Move down"
                        className="h-7 w-7 rounded-md border border-line text-[13px] text-muted disabled:opacity-30">↓</button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2 pt-2">
          <Button onClick={save}>{isNew ? 'Create routine' : 'Save changes'}</Button>
          {!isNew && <Button variant="danger" onClick={remove}>Delete routine</Button>}
        </div>
      </div>

      <ExercisePicker
        open={picking}
        onClose={() => setPicking(false)}
        selected={exercises.map((e) => e.exercise_id)}
        onPick={(item) => { addExercise(item.id); setPicking(false) }}
      />

      <EditExerciseSheet
        entry={editing}
        onClose={() => setEditing(null)}
        onRemove={async (e) => { await softDelete('routine_exercises', e.id); setEditing(null) }}
      />
    </>
  )
}

function EditExerciseSheet({ entry, onClose, onRemove }: {
  entry: RoutineExercise | null
  onClose: () => void
  onRemove: (e: RoutineExercise) => void
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
          <Field label="Weight" hint="This is your working weight — it updates automatically after each session.">
            <Stepper value={weight} onChange={setWeight} step={2.5} decimals={1} suffix="kg" />
          </Field>
        )}
        <Button onClick={async () => {
          await put('routine_exercises', { ...entry, sets, reps, weight_kg: weighted ? weight : null })
          onClose()
        }}>Save</Button>
        <Button variant="danger" onClick={() => onRemove(entry)}>Remove from routine</Button>
      </div>
    </Sheet>
  )
}
