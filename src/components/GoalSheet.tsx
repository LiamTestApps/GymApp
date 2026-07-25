import { useEffect, useState } from 'react'
import { put, uid, now, softDelete } from '../lib/db'
import { useApp } from '../lib/app'
import { Sheet, Button, Field, Stepper } from './ui'
import type { Goal } from '../lib/types'

export function GoalSheet({ open, onClose, existing }: {
  open: boolean
  onClose: () => void
  existing?: Goal | null
}) {
  const { userId } = useApp()
  const [perWeek, setPerWeek] = useState(3)
  const [months, setMonths] = useState(3)

  useEffect(() => {
    if (existing) { setPerWeek(existing.sessions_per_week); setMonths(existing.months) }
    else { setPerWeek(3); setMonths(3) }
  }, [existing?.id, open])

  const weeks = Math.round(months * 4.345)
  const target = weeks * perWeek

  async function save() {
    const goal: Goal = {
      id: existing?.id ?? uid(),
      user_id: userId!,
      sessions_per_week: perWeek,
      months,
      started_at: existing?.started_at ?? now(),
      updated_at: now(),
      deleted: 0,
    }
    await put('goals', goal)
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={existing ? 'Edit goal' : 'Set a goal'}>
      <p className="mb-4 text-[13.5px] text-muted">
        Pick how often you want to train and for how long. We'll track your sessions against it.
      </p>
      <div className="space-y-4">
        <Field label="Sessions per week"><Stepper value={perWeek} onChange={setPerWeek} min={1} /></Field>
        <Field label="Over how many months"><Stepper value={months} onChange={setMonths} min={1} /></Field>

        <div className="rounded-xl border border-brand bg-brandsoft px-4 py-3 text-center">
          <p className="text-[13px] text-muted">That's a target of</p>
          <p className="font-display text-[26px] font-bold text-brand">{target} sessions</p>
          <p className="text-[12px] text-muted">over about {weeks} weeks</p>
        </div>

        <Button onClick={save}>{existing ? 'Save goal' : 'Start goal'}</Button>
        {existing && (
          <Button variant="danger" onClick={async () => { await softDelete('goals', existing.id); onClose() }}>
            Cancel this goal
          </Button>
        )}
      </div>
    </Sheet>
  )
}