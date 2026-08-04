import catalogueRaw from '../data/catalogue.json'
import type { CatalogueItem, Category, SessionEntry, Session } from './types'

export const catalogue = catalogueRaw as CatalogueItem[]

const byId = new Map(catalogue.map((c) => [c.id, c]))

export function exercise(id: string): CatalogueItem | undefined {
  return byId.get(id)
}

export function exerciseName(id: string): string {
  return byId.get(id)?.name ?? 'Unknown exercise'
}

const IMAGE_BASE = 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/'

export function imageUrl(path: string): string {
  return IMAGE_BASE + path
}

export const CATEGORY_LABEL: Record<Category, string> = {
  machine: 'Machine',
  cable: 'Cable',
  free: 'Free weights',
  body: 'Bodyweight',
  cardio: 'Cardio',
}

/** Whether a weight field makes sense for this exercise. */
export function usesWeight(id: string): boolean {
  const c = byId.get(id)
  return c ? c.category !== 'cardio' && c.category !== 'body' : true
}

export type TrackingMode = 'reps' | 'cardio' | 'hold'

// Isometric holds. Extend anytime with ids from catalogue.json.
const HOLD_IDS = new Set<string>(['plank', 'side-plank'])

/** How an exercise is logged: normal reps, continuous cardio, or a timed hold. */
export function trackingMode(id: string): TrackingMode {
  const c = byId.get(id)
  if (!c) return 'reps'
  if (c.category === 'cardio') return 'cardio'
  if (HOLD_IDS.has(id)) return 'hold'
  return 'reps'
}

/** Sensible starting values for a fresh entry of each mode. */
export function trackingDefaults(id: string): {
  sets: number; reps: number; weight_kg: number | null; duration_s: number | null
} {
  switch (trackingMode(id)) {
    case 'cardio': return { sets: 1, reps: 1, weight_kg: null, duration_s: 0 }
    case 'hold':   return { sets: 3, reps: 1, weight_kg: null, duration_s: 45 }
    default:       return { sets: 3, reps: 12, weight_kg: usesWeight(id) ? 0 : null, duration_s: null }
  }
}

/** One-line summary of a logged entry: "3 × 12 · 40 kg", "3 × 0:45", "12:30 · 9.5 km/h". */
export function entrySummary(e: {
  exercise_id: string; sets: number; reps: number
  weight_kg: number | null; duration_s: number | null
  speed_kmh: number | null; distance_km: number | null
}): string {
  const mode = trackingMode(e.exercise_id)
  if (mode === 'cardio') {
    const parts = [formatClock(e.duration_s ?? 0)]
    if (e.speed_kmh != null) parts.push(`${e.speed_kmh} km/h`)
    if (e.distance_km != null) parts.push(`${e.distance_km} km`)
    return parts.join(' · ')
  }
  if (mode === 'hold') return `${e.sets} × ${formatClock(e.duration_s ?? 0)}`
  return `${e.sets} × ${e.reps}` + (e.weight_kg != null ? ` · ${e.weight_kg} kg` : '')
}

export function search(query: string, category: Category | 'all'): CatalogueItem[] {
  const q = query.trim().toLowerCase()

  const matched = catalogue.filter((c) => {
    if (category !== 'all' && c.category !== category) return false
    if (!q) return true
    return (
      c.name.toLowerCase().includes(q) ||
      c.primaryMuscles.some((m) => m.toLowerCase().includes(q)) ||
      c.secondaryMuscles.some((m) => m.toLowerCase().includes(q))
    )
  })

  if (!q) return matched

  // Lower rank = shown first: primary-muscle match, then name, then secondary-only.
  const rank = (c: CatalogueItem): number => {
    if (c.primaryMuscles.some((m) => m.toLowerCase().includes(q))) return 0
    if (c.name.toLowerCase().includes(q)) return 1
    return 2
  }

  return matched.sort((a, b) => rank(a) - rank(b))
}

/** Exercises hitting the same primary muscle, for the swap button. */
export function alternatives(id: string, limit = 8): CatalogueItem[] {
  const src = byId.get(id)
  if (!src) return []
  const primary = new Set(src.primaryMuscles)
  return catalogue
    .filter((c) => c.id !== id && c.primaryMuscles.some((m) => primary.has(m)))
    .sort((a, b) => {
      const sameCat = Number(b.category === src.category) - Number(a.category === src.category)
      if (sameCat) return sameCat
      return Number(b.pinned) - Number(a.pinned)
    })
    .slice(0, limit)
}

// --- Calorie estimate ------------------------------------------------------
// Built per exercise from what was actually logged. Deliberately ignores the
// session wall-clock (which can read anywhere from seconds to days depending
// on when Finish was tapped). Rough by nature — a trend, not a measurement.

const STRENGTH_MET: Record<'light' | 'moderate' | 'hard', number> = {
  light: 3.0,
  moderate: 4.5,
  hard: 6.0,
}
const HOLD_MET = 3.5            // isometric holds (plank, side-plank)
const CARDIO_MET_DEFAULT = 7.0  // cardio with no speed logged
const SEC_PER_REP = 3           // rough tempo per rep
const REST_SEC = 45             // rough rest after each set
const LIFT_KCAL = 0.005         // small bonus per (kg × rep × set) for heavy loads

/** kcal for a block of work: MET × 3.5 × bodyweight / 200 × minutes. */
function metKcal(met: number, weightKg: number, seconds: number): number {
  return (met * 3.5 * weightKg) / 200 * (seconds / 60)
}

function cardioMet(speedKmh: number | null): number {
  if (speedKmh == null || speedKmh <= 0) return CARDIO_MET_DEFAULT
  return Math.min(14, Math.max(2.5, speedKmh * 0.9))
}

type CalorieEntry = {
  exercise_id: string
  sets: number
  reps: number
  weight_kg: number | null
  duration_s: number | null
  speed_kmh: number | null
}

/**
 * Rough calorie estimate, summed per exercise from the logged details —
 * cardio time/speed, hold time, or sets/reps/weight — then nudged by age.
 * Needs a bodyweight; returns null without one.
 */
export function estimateCalories(
  profile: { age: number | null; weight_kg: number | null } | null,
  entries: CalorieEntry[],
  intensity: 'light' | 'moderate' | 'hard',
): number | null {
  const weightKg = profile?.weight_kg ?? null
  if (!weightKg) return null

  let kcal = 0
  for (const e of entries) {
    const mode = trackingMode(e.exercise_id)
    if (mode === 'cardio') {
      kcal += metKcal(cardioMet(e.speed_kmh), weightKg, e.duration_s ?? 0)
    } else if (mode === 'hold') {
      kcal += metKcal(HOLD_MET, weightKg, e.sets * (e.duration_s ?? 0))
    } else {
      const workSec = e.sets * (e.reps * SEC_PER_REP + REST_SEC)
      kcal += metKcal(STRENGTH_MET[intensity], weightKg, workSec)
      kcal += (e.weight_kg ?? 0) * e.reps * e.sets * LIFT_KCAL
    }
  }

  if (kcal <= 0) return null

  const age = profile?.age ?? null
  const ageFactor = age == null ? 1 : Math.min(1.05, Math.max(0.85, 1 - 0.003 * (age - 30)))
  return Math.round(kcal * ageFactor)
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
}

/** Consecutive days (counting back from today or yesterday) with a finished session. */

/** Monday-based week key, e.g. "2026-W30", used to group sessions by week. */
export function weekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = (date.getUTCDay() + 6) % 7 // Mon=0 … Sun=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3) // nearest Thursday
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4))
  const week =
    1 + Math.round(((date.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7)
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/** Monday 00:00 of the week containing d. */
export function weekStart(d: Date): Date {
  const date = new Date(d)
  const dayNum = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - dayNum)
  date.setHours(0, 0, 0, 0)
  return date
}

/** Consecutive weeks (counting back from this week) with at least one session. */
export function currentWeekStreak(sessions: Session[]): number {
  const weeks = new Set(
    sessions
      .filter((s) => s.ended_at && !s.deleted)
      .map((s) => weekKey(weekStart(new Date(s.started_at)))),
  )
  if (!weeks.size) return 0

  const cursor = weekStart(new Date())
  if (!weeks.has(weekKey(cursor))) {
    cursor.setDate(cursor.getDate() - 7)
    if (!weeks.has(weekKey(cursor))) return 0
  }

  let streak = 0
  while (weeks.has(weekKey(cursor))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 7)
  }
  return streak
}

export function currentStreak(sessions: Session[]): number {
  const days = new Set(
    sessions
      .filter((s) => s.ended_at && !s.deleted)
      .map((s) => new Date(s.started_at).toDateString()),
  )
  if (!days.size) return 0

  const day = new Date()
  if (!days.has(day.toDateString())) {
    day.setDate(day.getDate() - 1)
    if (!days.has(day.toDateString())) return 0
  }

  let streak = 0
  while (days.has(day.toDateString())) {
    streak += 1
    day.setDate(day.getDate() - 1)
  }
  return streak
}

/** Best weight ever logged per exercise, from that user's completed entries. */
export function personalBests(entries: SessionEntry[]): Map<string, number> {
  const best = new Map<string, number>()
  for (const e of entries) {
    if (!e.done || e.deleted || e.weight_kg == null) continue
    const prev = best.get(e.exercise_id)
    if (prev == null || e.weight_kg > prev) best.set(e.exercise_id, e.weight_kg)
  }
  return best
}

// ---------------------------------------------------------------------------
// v2 analytics helpers
// ---------------------------------------------------------------------------

export interface WeightPoint { date: string; weight: number }

/** Actual logged working weight per session for one exercise, oldest first. */
export function weightHistory(
  sessions: Session[],
  entries: SessionEntry[],
  exerciseId: string,
): WeightPoint[] {
  const sessionDate = new Map(sessions.map((s) => [s.id, s.started_at]))
  const points: WeightPoint[] = []
  for (const e of entries) {
    if (e.deleted || !e.done || e.exercise_id !== exerciseId || e.weight_kg == null) continue
    const started = sessionDate.get(e.session_id)
    if (!started) continue
    points.push({ date: started, weight: e.weight_kg })
  }
  return points.sort((a, b) => a.date.localeCompare(b.date))
}

/** How many finished sessions included each exercise — for the "most trained" pick. */
export function exerciseFrequency(sessions: Session[], entries: SessionEntry[]): Map<string, number> {
  const done = new Set(sessions.filter((s) => s.ended_at && !s.deleted).map((s) => s.id))
  const freq = new Map<string, number>()
  for (const e of entries) {
    if (e.deleted || !e.done || !done.has(e.session_id)) continue
    freq.set(e.exercise_id, (freq.get(e.exercise_id) ?? 0) + 1)
  }
  return freq
}

/** Total sets logged per muscle group (primary weighted 2x, secondary 1x). */
export function muscleFrequency(
  sessions: Session[],
  entries: SessionEntry[],
): Map<string, number> {
  const done = new Set(sessions.filter((s) => s.ended_at && !s.deleted).map((s) => s.id))
  const freq = new Map<string, number>()
  for (const e of entries) {
    if (e.deleted || !e.done || !done.has(e.session_id)) continue
    const c = exercise(e.exercise_id)
    if (!c) continue
    for (const m of c.primaryMuscles) freq.set(m, (freq.get(m) ?? 0) + e.sets * 2)
    for (const m of c.secondaryMuscles) freq.set(m, (freq.get(m) ?? 0) + e.sets)
  }
  return freq
}

export const ALL_MUSCLES = [
  'chest', 'lats', 'middle back', 'lower back', 'traps', 'shoulders',
  'biceps', 'triceps', 'forearms', 'abdominals',
  'quadriceps', 'hamstrings', 'glutes', 'calves', 'abductors', 'adductors',
]

export type Timescale = 'week' | 'month' | 'year'

export interface TimeBucket { label: string; minutes: number; key: string }

/** Workout minutes bucketed by week / month / year, most recent last. */
export function timeBuckets(sessions: Session[], scale: Timescale, count: number): TimeBucket[] {
  const done = sessions.filter((s) => s.ended_at && !s.deleted && s.duration_s)
  const now = new Date()
  const buckets: TimeBucket[] = []

  for (let i = count - 1; i >= 0; i--) {
    let start: Date, end: Date, label: string, key: string
    if (scale === 'week') {
      start = weekStart(now); start.setDate(start.getDate() - i * 7)
      end = new Date(start); end.setDate(end.getDate() + 7)
      label = start.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
      key = weekKey(start)
    } else if (scale === 'month') {
      start = new Date(now.getFullYear(), now.getMonth() - i, 1)
      end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
      label = start.toLocaleDateString(undefined, { month: 'short' })
      key = `${start.getFullYear()}-${start.getMonth()}`
    } else {
      start = new Date(now.getFullYear() - i, 0, 1)
      end = new Date(now.getFullYear() - i + 1, 0, 1)
      label = String(start.getFullYear())
      key = String(start.getFullYear())
    }
    const minutes = done
      .filter((s) => { const t = new Date(s.started_at); return t >= start && t < end })
      .reduce((sum, s) => sum + Math.round((s.duration_s ?? 0) / 60), 0)
    buckets.push({ label, minutes, key })
  }
  return buckets
}

/** Weekly totals of a numeric session field (calories or volume), most recent last. */
export function weeklyTotals(
  sessions: Session[],
  value: (s: Session) => number,
  weeks: number,
): { label: string; total: number }[] {
  const done = sessions.filter((s) => s.ended_at && !s.deleted)
  const now = new Date()
  const out: { label: string; total: number }[] = []
  for (let i = weeks - 1; i >= 0; i--) {
    const start = weekStart(now); start.setDate(start.getDate() - i * 7)
    const end = new Date(start); end.setDate(end.getDate() + 7)
    const total = done
      .filter((s) => { const t = new Date(s.started_at); return t >= start && t < end })
      .reduce((sum, s) => sum + value(s), 0)
    out.push({ label: start.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), total })
  }
  return out
}

/** Total kg moved in a session (sum of weight × sets × reps over done entries). */
export function sessionVolume(entries: SessionEntry[]): number {
  return entries
    .filter((e) => e.done && !e.deleted && e.weight_kg != null)
    .reduce((sum, e) => sum + (e.weight_kg ?? 0) * e.sets * e.reps, 0)
}

export interface Milestone {
  id: string
  kind: 'sessions' | 'hours'
  threshold: number
  label: string
  earned: boolean
}

const SESSION_MILESTONES = [1, 10, 20, 50, 100]
const HOUR_MILESTONES = [2, 10, 20, 50]

export function milestones(sessions: Session[]): Milestone[] {
  const done = sessions.filter((s) => s.ended_at && !s.deleted)
  const count = done.length
  const hours = done.reduce((sum, s) => sum + (s.duration_s ?? 0) / 3600, 0)

  const out: Milestone[] = SESSION_MILESTONES.map((n) => ({
    id: `sessions-${n}`, kind: 'sessions', threshold: n,
    label: n === 1 ? 'First session' : `${n} sessions`, earned: count >= n,
  }))
  for (const h of HOUR_MILESTONES) {
    out.push({
      id: `hours-${h}`, kind: 'hours', threshold: h,
      label: `${h} hours trained`, earned: hours >= h,
    })
  }
  return out
}

/** The highest newly-earned milestone id not already in `seen`, if any. */
export function newlyEarned(sessions: Session[], seen: string[]): Milestone | null {
  const earned = milestones(sessions).filter((m) => m.earned && !seen.includes(m.id))
  if (!earned.length) return null
  return earned.sort((a, b) =>
    a.kind === b.kind ? b.threshold - a.threshold : a.kind === 'sessions' ? -1 : 1,
  )[0]
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

export interface GoalProgress {
  target: number
  completed: number
  weeksTotal: number
  weeksElapsed: number
  endDate: Date
  ended: boolean
  onPace: boolean
  pct: number
  message: string
}

export function goalProgress(
  goal: { sessions_per_week: number; months: number; started_at: string },
  sessions: Session[],
): GoalProgress {
  const start = new Date(goal.started_at)
  const end = new Date(start)
  end.setMonth(end.getMonth() + goal.months)

  const weeksTotal = Math.max(1, Math.round((end.getTime() - start.getTime()) / (7 * 86400000)))
  const target = weeksTotal * goal.sessions_per_week

  const completed = sessions.filter(
    (s) => s.ended_at && !s.deleted && new Date(s.started_at) >= start && new Date(s.started_at) <= end,
  ).length

  const now = new Date()
  const ended = now > end
  const weeksElapsed = Math.min(
    weeksTotal,
    Math.max(0, (now.getTime() - start.getTime()) / (7 * 86400000)),
  )
  const expected = weeksElapsed * goal.sessions_per_week
  const onPace = completed >= expected
  const pct = Math.min(100, Math.round((completed / target) * 100))

  let message: string
  if (ended) {
    message = completed >= target
      ? `Goal smashed — ${completed} of ${target} sessions. Time for the next one.`
      : `Goal wrapped up at ${completed} of ${target}. Set a fresh one when you're ready.`
  } else if (pct >= 100) {
    message = "Target hit early — outstanding."
  } else if (pct >= 75) {
    message = "So close now. Keep the rhythm going."
  } else if (onPace) {
    message = "Right on pace. This is exactly how it's done."
  } else {
    const behind = Math.ceil(expected - completed)
    message = behind <= 1
      ? "Just behind pace — one session gets you back on track."
      : `A few sessions behind pace. No drama, just chip away at it.`
  }

  return { target, completed, weeksTotal, weeksElapsed, endDate: end, ended, onPace, pct, message }
}
