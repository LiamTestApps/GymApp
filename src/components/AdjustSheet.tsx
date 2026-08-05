import { useState } from 'react'
import { put, softDelete, uid, now, getMeta, setMeta } from '../lib/db'
import { exerciseName, trackingMode, trackingDefaults, usesWeight } from '../lib/fitness'
import { refineRoutine, MIN_EXERCISES, type DraftExercise, type Turn } from '../lib/ai'
import { Sheet, Button, Field, inputClass } from './ui'
import type { RoutineExercise } from '../lib/types'

/** "Adjust with AI" — sends the user's note plus the routine's saved
 *  conversation (or a fresh seed) to Gemini, then reconciles the returned
 *  list against the routine so kept exercises retain their working weight. */
export default function AdjustSheet({ open, onClose, routineId, goalLabel, exercises }: {
  open: boolean
  onClose: () => void
  routineId: string
  goalLabel: string
  exercises: RoutineExercise[]
}) {
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function adjust() {
    if (!note.trim()) return
    setLoading(true)
    setError(null)
    try {
      const stored = await getMeta(`ai-routine.${routineId}`)
      let result
      if (stored) {
        const turns: Turn[] = JSON.parse(stored)
        result = await refineRoutine(turns, note.trim())
      } else {
        // No saved conversation (manual routine, or made on another device):
        // seed one from the routine as it stands, then apply the note.
        const seed = `${buildSeed(goalLabel, exercises)}\n\nAdjustment: ${note.trim()}`
        result = await refineRoutine([], seed)
      }

      if (result.exercises.length < MIN_EXERCISES) {
        setError("That left too few exercises to work with — your routine hasn't been changed. Try rephrasing.")
        setLoading(false)
        return
      }

      await reconcile(routineId, exercises, result.exercises)
      await setMeta(`ai-routine.${routineId}`, JSON.stringify(result.turns))
      setNote('')
      setLoading(false)
      onClose()
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong. Try again.')
      setLoading(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Adjust with AI">
      <div className="space-y-4">
        <p className="text-[13.5px] text-muted">
          Describe what to change and the AI reworks the exercises. Any weights you've logged stay on
          the exercises it keeps.
        </p>
        <Field label="What should change?">
          <textarea
            className={`${inputClass} resize-none`}
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. swap the leg work for machines, add more core, make it shorter"
          />
        </Field>

        {error && (
          <div className="rounded-xl border border-danger bg-surface px-4 py-3 text-[13.5px] text-danger">
            {error}
          </div>
        )}

        <Button onClick={adjust} disabled={!note.trim() || loading}>
          {loading ? 'Adjusting…' : 'Adjust routine'}
        </Button>
      </div>
    </Sheet>
  )
}

function buildSeed(goalLabel: string, exercises: RoutineExercise[]): string {
  const lines = exercises.map(
    (e) => `- ${e.exercise_id} (${exerciseName(e.exercise_id)}) — ${e.sets}x${e.reps}`,
  )
  return `Here is my current single-session routine (goal: ${goalLabel}). Rework it and return the full updated exercise list.\nCurrent exercises:\n${lines.join('\n')}`
}

async function reconcile(routineId: string, current: RoutineExercise[], drafts: DraftExercise[]) {
  const byId = new Map(current.map((e) => [e.exercise_id, e]))
  const keep = new Set(drafts.map((d) => d.exercise_id))

  // Drop anything the new list no longer includes.
  for (const e of current) {
    if (!keep.has(e.exercise_id)) await softDelete('routine_exercises', e.id)
  }

  // Upsert the new list in order — survivors keep their working weight.
  for (const [i, draft] of drafts.entries()) {
    const existing = byId.get(draft.exercise_id)
    const mode = trackingMode(draft.exercise_id)
    if (existing) {
      await put(
        'routine_exercises',
        mode === 'reps'
          ? { ...existing, sets: draft.sets, reps: draft.reps, position: i }
          : { ...existing, position: i },
      )
    } else {
      await put('routine_exercises', newRow(routineId, draft, i))
    }
  }
}

// Mirrors draftToRow in AiRoutine.tsx — kept local so this sheet is self-contained.
function newRow(routineId: string, draft: DraftExercise, position: number) {
  const mode = trackingMode(draft.exercise_id)
  const d = trackingDefaults(draft.exercise_id)
  const base = {
    id: uid(),
    routine_id: routineId,
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
  return { ...base, sets: d.sets, reps: d.reps, weight_kg: d.weight_kg, duration_s: d.duration_s }
}
