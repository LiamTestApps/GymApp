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

export function search(query: string, category: Category | 'all'): CatalogueItem[] {
  const q = query.trim().toLowerCase()
  return catalogue.filter((c) => {
    if (category !== 'all' && c.category !== category) return false
    if (!q) return true
    return (
      c.name.toLowerCase().includes(q) ||
      c.primaryMuscles.some((m) => m.includes(q)) ||
      c.secondaryMuscles.some((m) => m.includes(q))
    )
  })
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

const MET: Record<'light' | 'moderate' | 'hard', number> = {
  light: 3.5,
  moderate: 5.0,
  hard: 6.5,
}

/**
 * Rough MET-based estimate. Genuinely approximate — weight training burn is
 * hard to pin down and this is only meant as a ballpark.
 */
export function estimateCalories(
  weightKg: number | null,
  durationSeconds: number,
  intensity: 'light' | 'moderate' | 'hard',
): number | null {
  if (!weightKg || durationSeconds <= 0) return null
  const minutes = durationSeconds / 60
  return Math.round((MET[intensity] * 3.5 * weightKg) / 200 * minutes)
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
