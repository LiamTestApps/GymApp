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

  if (mode === 'custom') return <CustomWizard />
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

// (It reuses createRoutine, draftToRow, Group and Choice already in that file.)
// ===========================================================================
 
const SEX = ['Male', 'Female', 'Prefer not to say']
const EXPERIENCE = ['Never', '< 6 months', '6–12 months', '1–3 years', '3+ years']
const LEVEL = ['Beginner', 'Intermediate', 'Advanced']
const TRAINING_TYPES = ['Weight training', 'Cardio', 'HIIT', 'CrossFit', 'Yoga', 'Sports', 'None']
const DAYS = [1, 2, 3, 4, 5, 6, 7]
const ACTIVITY = ['Sedentary', 'Lightly active', 'Moderately active', 'Very active']
const SLEEP = ['Poor', 'Average', 'Good']
const DIET = ['No preference', 'High protein', 'Vegan', 'Vegetarian', 'Keto', 'Other']
const SPLIT = ['Full body', 'Upper-Lower', 'Push-Pull-Legs', 'Bro split', 'No preference']
const CARDIO_FEEL = ['Love it', 'Tolerate it', 'Avoid it']
const INTENSITY = ['Heavy & low reps', 'Moderate weight & reps', 'Light & high reps', 'Varied']
const STEP_TITLES = ['Goals', 'About you', 'Experience', 'Schedule', 'Health', 'Lifestyle', 'Preferences']
 
const num = (s: string): number | null => {
  const n = Number(s)
  return s.trim() !== '' && Number.isFinite(n) ? n : null
}
 
function CustomWizard() {
  const nav = useNavigate()
  const { userId, profile } = useApp()
 
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
 
  // Goals
  const [goalLabel, setGoalLabel] = useState<string | null>(null)
  const [deadline, setDeadline] = useState('')
  // About you
  const [age, setAge] = useState(profile?.age != null ? String(profile.age) : '')
  const [sex, setSex] = useState<string | null>(null)
  const [height, setHeight] = useState('')
  const [weight, setWeight] = useState(profile?.weight_kg != null ? String(profile.weight_kg) : '')
  // Experience
  const [experience, setExperience] = useState<string | null>(null)
  const [level, setLevel] = useState<string | null>(null)
  const [trainingTypes, setTrainingTypes] = useState<string[]>([])
  // Schedule
  const [days, setDays] = useState<number | null>(null)
  const [minutes, setMinutes] = useState<number | null>(null)
  // Health
  const [hasInjuries, setHasInjuries] = useState(false)
  const [injuries, setInjuries] = useState('')
  const [avoid, setAvoid] = useState('')
  const [medical, setMedical] = useState('')
  // Lifestyle
  const [activity, setActivity] = useState<string | null>(null)
  const [sleep, setSleep] = useState<string | null>(null)
  const [diet, setDiet] = useState<string | null>(null)
  // Preferences
  const [ideal, setIdeal] = useState('')
  const [muscles, setMuscles] = useState<string[]>([])
  const [split, setSplit] = useState<string | null>(null)
  const [cardio, setCardio] = useState<string | null>(null)
  const [intensity, setIntensity] = useState<string | null>(null)
  const [focus, setFocus] = useState('')
  const [extra, setExtra] = useState('')
 
  const chosen = GOAL_OPTIONS.find((g) => g.label === goalLabel)
  const last = STEP_TITLES.length - 1
  const canNext = (step !== 0 || !!chosen) && (step !== 3 || !!minutes)
 
  function toggle(list: string[], set: (v: string[]) => void, v: string) {
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  }
 
  async function submit() {
    if (!chosen || !minutes || !userId) return
    setLoading(true)
    setError(null)
    try {
      const preset = (await db.goal_presets.get(chosen.goal)) ?? PRESET_FALLBACK
      const ctx: RoutineFormContext = {
        description: ideal,
        goal: chosen.goal,
        goalLabel: chosen.label,
        presetSets: preset.sets,
        presetRepsLow: preset.reps_low,
        presetRepsHigh: preset.reps_high,
        sessionMinutes: minutes,
        muscles,
        age: num(age) ?? profile?.age ?? null,
        weightKg: num(weight) ?? profile?.weight_kg ?? null,
        deadline: deadline.trim() || undefined,
        sex: sex ?? undefined,
        heightCm: num(height),
        experience: experience ?? undefined,
        fitnessLevel: level ?? undefined,
        trainingTypes: trainingTypes.length ? trainingTypes : undefined,
        daysPerWeek: days ?? undefined,
        injuries: hasInjuries && injuries.trim() ? injuries.trim() : undefined,
        avoid: avoid.trim() || undefined,
        medical: medical.trim() || undefined,
        activity: activity ?? undefined,
        sleep: sleep ?? undefined,
        diet: diet ?? undefined,
        split: split ?? undefined,
        cardio: cardio ?? undefined,
        intensity: intensity ?? undefined,
        focus: focus.trim() || undefined,
        extra: extra.trim() || undefined,
      }
 
      const result = await generateRoutine(ctx)
      if (result.exercises.length < MIN_EXERCISES) {
        setError("The AI couldn't put together enough usable exercises. Loosen a constraint or two and try again.")
        setLoading(false)
        return
      }
 
      const rid = await createRoutine(userId, chosen.goal, ideal || deadline, result.exercises)
      await setMeta(`ai-routine.${rid}`, JSON.stringify(result.turns))
      nav(`/routine/${rid}`)
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong. Try again.')
      setLoading(false)
    }
  }
 
  return (
    <>
      <TopBar back title="Custom AI routine" />
      <div className="rise px-5 pb-28 pt-4">
        <div className="mb-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] font-medium text-muted">
              Step {step + 1} of {STEP_TITLES.length}
            </span>
            <span className="font-display text-[15px] font-bold">{STEP_TITLES[step]}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-brand transition-all"
              style={{ width: `${((step + 1) / STEP_TITLES.length) * 100}%` }}
            />
          </div>
        </div>
 
        <div className="space-y-5">
          {step === 0 && (
            <>
              <Group label="Primary fitness goal">
                <div className="grid grid-cols-2 gap-2">
                  {GOAL_OPTIONS.map((g) => (
                    <Choice key={g.label} active={goalLabel === g.label} onClick={() => setGoalLabel(g.label)}>
                      {g.label}
                    </Choice>
                  ))}
                </div>
              </Group>
              <Field label="A specific target or deadline? (optional)">
                <input className={inputClass} value={deadline}
                  onChange={(e) => setDeadline(e.target.value)} placeholder="e.g. beach holiday in July" />
              </Field>
            </>
          )}
 
          {step === 1 && (
            <>
              <Field label="Age">
                <input type="number" inputMode="numeric" className={inputClass}
                  value={age} onChange={(e) => setAge(e.target.value)} placeholder="—" />
              </Field>
              <Group label="Biological sex">
                <div className="grid grid-cols-3 gap-2">
                  {SEX.map((s) => <Choice key={s} active={sex === s} onClick={() => setSex(s)}>{s}</Choice>)}
                </div>
              </Group>
              <Field label="Height (cm)">
                <input type="number" inputMode="numeric" className={inputClass}
                  value={height} onChange={(e) => setHeight(e.target.value)} placeholder="—" />
              </Field>
              <Field label="Weight (kg)">
                <input type="number" inputMode="decimal" className={inputClass}
                  value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="—" />
              </Field>
            </>
          )}
 
          {step === 2 && (
            <>
              <Group label="How long have you been training consistently?">
                <div className="grid grid-cols-2 gap-2">
                  {EXPERIENCE.map((x) => (
                    <Choice key={x} active={experience === x} onClick={() => setExperience(x)}>{x}</Choice>
                  ))}
                </div>
              </Group>
              <Group label="Current fitness level">
                <div className="grid grid-cols-3 gap-2">
                  {LEVEL.map((x) => <Choice key={x} active={level === x} onClick={() => setLevel(x)}>{x}</Choice>)}
                </div>
              </Group>
              <Group label="What have you done before? (optional)">
                <ChipMulti options={TRAINING_TYPES} value={trainingTypes}
                  onToggle={(v) => toggle(trainingTypes, setTrainingTypes, v)} />
              </Group>
            </>
          )}
 
          {step === 3 && (
            <>
              <Group label="How many days per week can you train?">
                <div className="grid grid-cols-7 gap-1.5">
                  {DAYS.map((d) => <Choice key={d} active={days === d} onClick={() => setDays(d)}>{d}</Choice>)}
                </div>
              </Group>
              <Group label="How long should each session be?">
                <div className="grid grid-cols-3 gap-2">
                  {LENGTHS.map((m) => (
                    <Choice key={m} active={minutes === m} onClick={() => setMinutes(m)}>
                      {m === 90 ? '90 min+' : `${m} min`}
                    </Choice>
                  ))}
                </div>
              </Group>
            </>
          )}
 
          {step === 4 && (
            <>
              <Group label="Any injuries or chronic pain?">
                <div className="grid grid-cols-2 gap-2">
                  <Choice active={!hasInjuries} onClick={() => setHasInjuries(false)}>No</Choice>
                  <Choice active={hasInjuries} onClick={() => setHasInjuries(true)}>Yes</Choice>
                </div>
              </Group>
              {hasInjuries && (
                <Field label="Tell the AI what to work around">
                  <textarea className={`${inputClass} resize-none`} rows={2}
                    value={injuries} onChange={(e) => setInjuries(e.target.value)}
                    placeholder="e.g. dodgy left knee, avoid deep squats" />
                </Field>
              )}
              <Field label="Exercises you can't or prefer not to do? (optional)">
                <textarea className={`${inputClass} resize-none`} rows={2}
                  value={avoid} onChange={(e) => setAvoid(e.target.value)} placeholder="e.g. no overhead pressing" />
              </Field>
              <Field label="Any medical conditions to consider? (optional)">
                <textarea className={`${inputClass} resize-none`} rows={2}
                  value={medical} onChange={(e) => setMedical(e.target.value)} />
              </Field>
            </>
          )}
 
          {step === 5 && (
            <>
              <Group label="How active are you outside the gym?">
                <div className="grid grid-cols-2 gap-2">
                  {ACTIVITY.map((x) => (
                    <Choice key={x} active={activity === x} onClick={() => setActivity(x)}>{x}</Choice>
                  ))}
                </div>
              </Group>
              <Group label="Sleep quality">
                <div className="grid grid-cols-3 gap-2">
                  {SLEEP.map((x) => <Choice key={x} active={sleep === x} onClick={() => setSleep(x)}>{x}</Choice>)}
                </div>
              </Group>
              <Group label="Following a specific diet?">
                <div className="grid grid-cols-2 gap-2">
                  {DIET.map((x) => <Choice key={x} active={diet === x} onClick={() => setDiet(x)}>{x}</Choice>)}
                </div>
              </Group>
            </>
          )}
 
          {step === 6 && (
            <>
              <Field label="Describe your ideal routine (optional)">
                <textarea className={`${inputClass} resize-none`} rows={2}
                  value={ideal} onChange={(e) => setIdeal(e.target.value)}
                  placeholder="e.g. mostly machines, a couple of free-weight lifts, quick" />
              </Field>
              <Group label="Which muscles would you like to work? (optional)">
                <ChipMulti options={ALL_MUSCLES} value={muscles}
                  onToggle={(v) => toggle(muscles, setMuscles, v)} capitalize />
              </Group>
              <Group label="Preferred training split (optional)">
                <div className="grid grid-cols-2 gap-2">
                  {SPLIT.map((x) => <Choice key={x} active={split === x} onClick={() => setSplit(x)}>{x}</Choice>)}
                </div>
              </Group>
              <Group label="How do you feel about cardio? (optional)">
                <div className="grid grid-cols-3 gap-2">
                  {CARDIO_FEEL.map((x) => (
                    <Choice key={x} active={cardio === x} onClick={() => setCardio(x)}>{x}</Choice>
                  ))}
                </div>
              </Group>
              <Group label="Preferred intensity style (optional)">
                <div className="grid grid-cols-2 gap-2">
                  {INTENSITY.map((x) => (
                    <Choice key={x} active={intensity === x} onClick={() => setIntensity(x)}>{x}</Choice>
                  ))}
                </div>
              </Group>
              <Field label="Anything to focus on? (optional)">
                <input className={inputClass} value={focus}
                  onChange={(e) => setFocus(e.target.value)} placeholder="e.g. glutes, arms" />
              </Field>
              <Field label="Anything else the routine should account for? (optional)">
                <textarea className={`${inputClass} resize-none`} rows={2}
                  value={extra} onChange={(e) => setExtra(e.target.value)} />
              </Field>
            </>
          )}
        </div>
 
        {error && (
          <div className="mt-5 rounded-xl border border-danger bg-surface px-4 py-3 text-[13.5px] text-danger">
            {error}
          </div>
        )}
 
        <div className="mt-6 flex gap-2">
          {step > 0 && <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>Back</Button>}
          {step < last ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext}>Next</Button>
          ) : (
            <Button onClick={submit} disabled={loading || !chosen || !minutes}>
              {loading ? 'Generating…' : 'Generate routine'}
            </Button>
          )}
        </div>
        {step === 0 && !chosen && (
          <p className="mt-2 text-center text-[12.5px] text-muted">Pick a goal to continue.</p>
        )}
        {step === 3 && !minutes && (
          <p className="mt-2 text-center text-[12.5px] text-muted">Pick a session length to continue.</p>
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
 
function ChipMulti({ options, value, onToggle, capitalize = false }: {
  options: string[]
  value: string[]
  onToggle: (v: string) => void
  capitalize?: boolean
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onToggle(o)}
          className={`rounded-full border px-3 py-1.5 text-[13px] ${capitalize ? 'capitalize' : ''} ${
            value.includes(o) ? 'border-brand bg-brandsoft text-brand' : 'border-line bg-surface text-muted'
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  )
}
 
