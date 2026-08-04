// src/lib/ai.ts
// Talks to the Gemini API to draft a single-session routine, strictly from the
// app's own exercise catalogue. Pure logic — no Dexie, no React. The screens
// turn the validated result into routine_exercises rows.

import { catalogue } from './fitness'
import type { GoalKey } from './types'

// One place to change the model. gemini-3.5-flash is the current GA Flash.
// If your free-tier key rejects it, swap to 'gemini-3-flash-preview'.
const MODEL = 'gemini-3.5-flash'

const ENDPOINT = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

const KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined

/** Fewer valid exercises than this and the screen treats the generation as failed. */
export const MIN_EXERCISES = 3

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RoutineFormContext {
  description: string          // free text: "describe your routine"
  goal: GoalKey
  goalLabel: string            // human label for the prompt
  presetSets: number           // from goal_presets, used as an anchor
  presetRepsLow: number
  presetRepsHigh: number
  sessionMinutes: number       // 30 / 45 / 60 / 75 / 90
  muscles: string[]            // chosen from ALL_MUSCLES
  age: number | null           // pre-filled from profile
  weightKg: number | null      // pre-filled from profile

  // Custom path only — all optional.
  deadline?: string
  sex?: string
  heightCm?: number | null
  experience?: string
  fitnessLevel?: string
  trainingTypes?: string[]
  daysPerWeek?: number
  injuries?: string
  avoid?: string
  medical?: string
  activity?: string
  sleep?: string
  diet?: string
  split?: string
  cardio?: string
  intensity?: string
  focus?: string
  extra?: string
}

export interface DraftExercise {
  exercise_id: string
  sets: number
  reps: number
}

export interface Turn {
  role: 'user' | 'model'
  text: string
}

export interface GenResult {
  exercises: DraftExercise[]
  dropped: string[]   // ids the model returned that aren't in the catalogue
  turns: Turn[]        // full conversation so far — persisted to meta for refining
}

// ---------------------------------------------------------------------------
// Prompt building
// ---------------------------------------------------------------------------

const VALID_IDS = new Set(catalogue.map((c) => c.id))

const CATALOGUE_BLOCK = catalogue
  .map((c) => `${c.id} | ${c.name} | ${c.category} | ${c.primaryMuscles.join(', ')}`)
  .join('\n')

const SYSTEM = `You are a strength & conditioning coach building ONE single gym session (not a multi-day programme) for a member of a small commercial gym stocked with the usual common equipment.

Hard rules:
- Choose exercises ONLY from the catalogue below, using the exact id from the first column. Never invent ids or names, and never use an id that is not in the list.
- Return between 4 and 10 exercises, sized to the session length the user gives (roughly one exercise per 8-10 minutes).
- Order them sensibly: compound / heavier movements first, isolation and core later.
- Honour the user's target muscles, goal, injuries and anything they want to avoid. If they mention an injury or pain, do not pick exercises that load it.
- Give per-exercise sets and reps. Use the user's goal preset as your anchor, then adjust per exercise — heavier compounds get lower reps, isolation gets higher reps.
- For cardio or timed holds, just pick the exercise with reasonable sets/reps; the app fills in durations itself.

Catalogue (id | name | category | primary muscles):
${CATALOGUE_BLOCK}`

function renderContext(c: RoutineFormContext): string {
  const lines: string[] = []
  lines.push(`Goal: ${c.goalLabel}`)
  lines.push(`Session length: about ${c.sessionMinutes} minutes`)
  if (c.muscles.length) lines.push(`Wants to train: ${c.muscles.join(', ')}`)
  lines.push(`Goal preset (anchor for sets/reps): ${c.presetSets} sets of ${c.presetRepsLow}-${c.presetRepsHigh} reps`)
  if (c.description.trim()) lines.push(`In their words: ${c.description.trim()}`)
  if (c.deadline) lines.push(`Target / deadline: ${c.deadline}`)
  if (c.age != null) lines.push(`Age: ${c.age}`)
  if (c.weightKg != null) lines.push(`Bodyweight: ${c.weightKg} kg`)
  if (c.sex) lines.push(`Sex: ${c.sex}`)
  if (c.heightCm != null) lines.push(`Height: ${c.heightCm} cm`)
  if (c.experience) lines.push(`Training history: ${c.experience}`)
  if (c.fitnessLevel) lines.push(`Self-rated level: ${c.fitnessLevel}`)
  if (c.trainingTypes?.length) lines.push(`Done before: ${c.trainingTypes.join(', ')}`)
  if (c.daysPerWeek) lines.push(`Trains ${c.daysPerWeek} day(s)/week`)
  if (c.injuries) lines.push(`Injuries / pain: ${c.injuries}`)
  if (c.avoid) lines.push(`Avoid these exercises: ${c.avoid}`)
  if (c.medical) lines.push(`Medical notes: ${c.medical}`)
  if (c.activity) lines.push(`Activity outside gym: ${c.activity}`)
  if (c.sleep) lines.push(`Sleep quality: ${c.sleep}`)
  if (c.diet) lines.push(`Diet: ${c.diet}`)
  if (c.split) lines.push(`Preferred split: ${c.split}`)
  if (c.cardio) lines.push(`Feelings on cardio: ${c.cardio}`)
  if (c.intensity) lines.push(`Preferred intensity: ${c.intensity}`)
  if (c.focus) lines.push(`Wants to focus on: ${c.focus}`)
  if (c.extra) lines.push(`Also take into account: ${c.extra}`)
  lines.push(`\nBuild the single session now.`)
  return lines.join('\n')
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    exercises: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          exercise_id: { type: 'string' },
          sets: { type: 'integer' },
          reps: { type: 'integer' },
        },
        required: ['exercise_id', 'sets', 'reps'],
      },
    },
  },
  required: ['exercises'],
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

async function callGemini(turns: Turn[]): Promise<string> {
  if (!KEY) throw new Error('No Gemini API key. Add VITE_GEMINI_API_KEY to your environment.')

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
    // Gemini 3.x is tuned for its defaults — we deliberately don't set temperature/top_p/top_k.
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
  })

  const res = await postWithFallback(body)

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    if (res.status === 429)
      throw new Error('Gemini is busy right now (rate limit). Give it a minute and try again.')
    if (res.status === 400 || res.status === 404)
      throw new Error(`Gemini rejected the request (${res.status}). The model "${MODEL}" may not be available on your key — try 'gemini-3-flash-preview'. ${detail.slice(0, 160)}`)
    throw new Error(`Gemini error ${res.status}. ${detail.slice(0, 160)}`)
  }

  const data = await res.json()
  const text: string =
    data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('') ?? ''
  if (!text.trim()) throw new Error('Gemini returned an empty response. Try again.')
  return text
}

// Direct browser call first; if the network/CORS layer blocks it, retry through
// corsproxy.io (the same fallback the recipe app leans on).
async function postWithFallback(body: string): Promise<Response> {
  const url = ENDPOINT(MODEL)
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY! },
      body,
    })
  } catch {
    // Proxies tend to strip custom headers, so pass the key as a query param here.
    const keyed = `${url}?key=${KEY}`
    const proxied = `https://corsproxy.io/?url=${encodeURIComponent(keyed)}`
    return await fetch(proxied, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
  }
}

// ---------------------------------------------------------------------------
// Parsing + validation
// ---------------------------------------------------------------------------

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(v))
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/** Keep only ids that really exist in the catalogue; drop invalid/duplicate ones. */
function parseAndValidate(text: string): { exercises: DraftExercise[]; dropped: string[] } {
  let obj: any
  try {
    obj = JSON.parse(text)
  } catch {
    throw new Error("Could not read Gemini's response.")
  }

  const raw: any[] = Array.isArray(obj?.exercises) ? obj.exercises : []
  const seen = new Set<string>()
  const exercises: DraftExercise[] = []
  const dropped: string[] = []

  for (const e of raw) {
    const id = String(e?.exercise_id ?? '')
    if (!VALID_IDS.has(id)) {
      if (id) dropped.push(id)
      continue
    }
    if (seen.has(id)) continue
    seen.add(id)
    exercises.push({
      exercise_id: id,
      sets: clampInt(e?.sets, 1, 10, 3),
      reps: clampInt(e?.reps, 1, 50, 10),
    })
  }

  return { exercises, dropped }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** First draft from the intake form. */
export async function generateRoutine(ctx: RoutineFormContext): Promise<GenResult> {
  const userTurn: Turn = { role: 'user', text: renderContext(ctx) }
  const text = await callGemini([userTurn])
  const { exercises, dropped } = parseAndValidate(text)
  return { exercises, dropped, turns: [userTurn, { role: 'model', text }] }
}

/** Follow-up tweak. Pass the conversation stored in meta plus the user's note. */
export async function refineRoutine(turns: Turn[], message: string): Promise<GenResult> {
  const next: Turn[] = [...turns, { role: 'user', text: message }]
  const text = await callGemini(next)
  const { exercises, dropped } = parseAndValidate(text)
  return { exercises, dropped, turns: [...next, { role: 'model', text }] }
}
