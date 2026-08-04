import { useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { db, put, uid, now, setMeta } from '../lib/db'
import { useApp } from '../lib/app'
import { ALL_MUSCLES, trackingMode, trackingDefaults, usesWeight } from '../lib/fitness'
import { generateRoutine, MIN_EXERCISES, type DraftExercise, type RoutineFormContext } from '../lib/ai'
import { TopBar, Button, Field, inputClass } from '../components/ui'
import type { GoalKey } from '../lib/types'

// The five form goals map onto the app's four goal keys.
const GOAL_OPTIONS: { label: string; goal: GoalKey }[] = [
  { label: 'Build muscle', goal: 'muscle' },
  { label: 'Lose fat', goal: 'fitness' },
  { label: 'Build strength', goal: 'strength' },
  { label: 'Improve endurance', goal: 'endurance' },
  { label: 'General health', goal: 'fitness' },
]

const LENGTHS = [30, 45, 60, 75, 90]
const PRESET_FALLBACK = { sets: 3, reps_low: 8, reps_high: 12 }

export default function AiRoutine() {
  const [params] = useSearchParams()
  const mode = params.get('mode') === 'custom' ? 'custom' : 'express'

  // The full questionnaire lands in commit 4.
  if (mode === 'custom') {
    return (
      <>
        <TopBar back title="Custom AI routine" />
        <div className="rise px-5 pb-28 pt-4">
          <p className="text-[15px] text-muted">The full questionnaire arrives in the next step.</p>
        </div>
      </>
    )
  }

  return <ExpressForm />
}

function ExpressForm() {
  const nav = useNavigate()
  const { userId, profile } = useApp()

  const [description, setDescription] = useState('')
  const [goalLabel, setGoalLabel] = useState<string | null>(null)
  const [minutes, setMinutes] = useState<number | null>(null)
  const [muscles, setMuscles] = useState<string[]>([])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const chosen = GOAL_OPTIONS.find((g) => g.label === goalLabel)
  const canSubmit = !!chosen && !!minutes && !loading

  function toggleMuscle(m: string) {
    setMuscles((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]))
  }

  async function submit() {
    if (!chosen || !minutes || !userId) return
    setLoading(true)
    setError(null)
    try {
      const preset = (await db.goal_presets.get(chosen.goal)) ?? PRESET_FALLBACK
      const ctx: RoutineFormContext = {
        description,
        goal: chosen.goal,
        goalLabel: chosen.label,
        presetSets: preset.sets,
        presetRepsLow: preset.reps_low,
        presetRepsHigh: preset.reps_high,
        sessionMinutes: minutes,
        muscles,
        age: profile?.age ?? null,
        weightKg: profile?.weight_kg ?? null,
      }

      const result = await generateRoutine(ctx)
      if (result.exercises.length < MIN_EXERCISES) {
        setError("The AI couldn't put together enough usable exercises. Add a bit more detail or pick a few muscles, then try again.")
        setLoading(false)
        return
      }

      const rid = await createRoutine(userId, chosen.goal, description, result.exercises)
      // Keep the conversation so "Adjust with AI" (commit 5) has the original context.
      await setMeta(`ai-routine.${rid}`, JSON.stringify(result.turns))
      nav(`/routine/${rid}`)
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong. Try again.')
      setLoading(false)
    }
  }

  return (
    <>
      <TopBar back title="Express AI routine" />
      <div className="rise space-y-5 px-5 pb-28 pt-4">
        <Field label="Describe your routine in a few words">
          <textarea
            className={`${inputClass} resize-none`}
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. a solid full-body machine session I can do after work"
          />
        </Field>

        <Group label="Fitness goal">
          <div className="grid grid-cols-2 gap-2">
            {GOAL_OPTIONS.map((g) => (
              <Choice key={g.label} active={goalLabel === g.label} onClick={() => setGoalLabel(g.label)}>
                {g.label}
              </Choice>
            ))}
          </div>
        </Group>

        <Group label="How long should the session be?">
          <div className="grid grid-cols-3 gap-2">
            {LENGTHS.map((m) => (
              <Choice key={m} active={minutes === m} onClick={() => setMinutes(m)}>
                {m === 90 ? '90 min+' : `${m} min`}
              </Choice>
            ))}
          </div>
        </Group>

        <Group label="Which muscles would you like to work? (optional)">
          <div className="flex flex-wrap gap-1.5">
            {ALL_MUSCLES.map((m) => (
              <button
                key={m}
                onClick={() => toggleMuscle(m)}
                className={`rounded-full border px-3 py-1.5 text-[13px] capitalize ${
                  muscles.includes(m)
                    ? 'border-brand bg-brandsoft text-brand'
                    : 'border-line bg-surface text-muted'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </Group>

        {error && (
          <div className="rounded-xl border border-danger bg-surface px-4 py-3 text-[13.5px] text-danger">
            {error}
          </div>
        )}

        <Button onClick={submit} disabled={!canSubmit}>
          {loading ? 'Generating…' : 'Generate routine'}
        </Button>
        {(!chosen || !minutes) && (
          <p className="text-center text-[12.5px] text-muted">
            Pick a goal and a session length to continue.
          </p>
        )}
      </div>

      {loading && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-bg/90 backdrop-blur">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-brand" />
          <p className="text-[15px] text-muted">Building your routine…</p>
        </div>
      )}
    </>
  )
}

// --- creating the routine ---------------------------------------------------

async function createRoutine(
  userId: string,
  goal: GoalKey,
  description: string,
  drafts: DraftExercise[],
): Promise<string> {
  const count = await db.routines.where('user_id').equals(userId).count()
  const rid = uid()
  await put('routines', {
    id: rid,
    user_id: userId,
    // A sensible default the user renames on the edit screen they land on next.
    name: description.trim().slice(0, 40) || 'New routine',
    goal,
    position: count,
    updated_at: now(),
    deleted: 0,
  })

  for (const [i, draft] of drafts.entries()) {
    await put('routine_exercises', draftToRow(rid, draft, i))
  }
  return rid
}

/** Turn a validated AI draft into a routine_exercises row, honouring the
 *  app's own tracking modes so cardio/holds get correct timed fields. */
function draftToRow(rid: string, draft: DraftExercise, position: number) {
  const mode = trackingMode(draft.exercise_id)
  const d = trackingDefaults(draft.exercise_id)
  const base = {
    id: uid(),
    routine_id: rid,
    exercise_id: draft.exercise_id,
    position,
    speed_kmh: null,
    distance_km: null,
    timer_started_at: null,
    updated_at: now(),
    deleted: 0 as const,
  }
  if (mode === 'reps') {
    return {
      ...base,
      sets: draft.sets,
      reps: draft.reps,
      weight_kg: usesWeight(draft.exercise_id) ? 0 : null,
      duration_s: null,
    }
  }
  // cardio or hold — the app's defaults drive sets/duration; weight stays blank
  return { ...base, sets: d.sets, reps: d.reps, weight_kg: d.weight_kg, duration_s: d.duration_s }
}

// --- little local form controls (kept here to avoid touching ui.tsx) --------

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span className="mb-1.5 block text-[13px] font-medium text-muted">{label}</span>
      {children}
    </div>
  )
}

function Choice({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border px-3 py-2.5 text-[14px] font-medium ${
        active ? 'border-brand bg-brandsoft text-ink' : 'border-line bg-surface text-muted'
      }`}
    >
      {children}
    </button>
  )
}
