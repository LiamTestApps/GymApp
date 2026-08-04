import { useNavigate } from 'react-router-dom'
import { Sheet } from './ui'

/** The little "how much do you want to answer?" chooser that opens from the
 *  Create-with-AI button on Home. Both options land on /routine/ai; the form
 *  screen reads the mode from the query string. */
export default function AiRoutineSheet({ open, onClose }: {
  open: boolean
  onClose: () => void
}) {
  const nav = useNavigate()

  function go(mode: 'express' | 'custom') {
    onClose()
    nav(`/routine/ai?mode=${mode}`)
  }

  return (
    <Sheet open={open} onClose={onClose} title="Create routine with AI">
      <div className="space-y-3">
        <button
          onClick={() => go('express')}
          className="w-full rounded-2xl border border-line bg-surface px-4 py-4 text-left active:scale-[0.99]"
        >
          <p className="font-display text-[16px] font-bold">Express</p>
          <p className="mt-0.5 text-[13px] text-muted">
            Four quick questions. Best when you just want something solid, fast.
          </p>
        </button>

        <button
          onClick={() => go('custom')}
          className="w-full rounded-2xl border border-line bg-surface px-4 py-4 text-left active:scale-[0.99]"
        >
          <p className="font-display text-[16px] font-bold">Custom</p>
          <p className="mt-0.5 text-[13px] text-muted">
            A fuller set — goals, experience, injuries, preferences — for a more tailored plan.
          </p>
        </button>
      </div>
    </Sheet>
  )
}
