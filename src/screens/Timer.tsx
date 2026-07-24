import { useEffect, useRef, useState } from 'react'
import { formatClock } from '../lib/fitness'
import { Screen, Title, Button } from '../components/ui'

type Mode = 'stopwatch' | 'countdown'
const PRESETS = [30, 45, 60, 90, 120]

export default function Timer() {
  const [mode, setMode] = useState<Mode>('countdown')
  const [target, setTarget] = useState(60)
  const [remaining, setRemaining] = useState(60)
  const [elapsed, setElapsed] = useState(0)
  const [running, setRunning] = useState(false)
  const finished = useRef(false)

  useEffect(() => {
    if (!running) return
    const t = setInterval(() => {
      if (mode === 'stopwatch') setElapsed((e) => e + 1)
      else setRemaining((r) => Math.max(0, r - 1))
    }, 1000)
    return () => clearInterval(t)
  }, [running, mode])

  useEffect(() => {
    if (mode !== 'countdown') return
    if (remaining === 0 && running && !finished.current) {
      finished.current = true
      setRunning(false)
      navigator.vibrate?.([200, 100, 200, 100, 400])
    }
  }, [remaining, running, mode])

  function reset() {
    finished.current = false
    setRunning(false)
    setElapsed(0)
    setRemaining(target)
  }

  function pick(seconds: number) {
    finished.current = false
    setTarget(seconds)
    setRemaining(seconds)
    setRunning(false)
  }

  const value = mode === 'stopwatch' ? elapsed : remaining
  const done = mode === 'countdown' && remaining === 0

  return (
    <Screen>
      <Title sub="For planks, holds, and anything else you time.">Timer</Title>

      <div className="mb-6 grid grid-cols-2 gap-2">
        {(['countdown', 'stopwatch'] as Mode[]).map((m) => (
          <button key={m} onClick={() => { setMode(m); reset() }}
            className={`rounded-xl border px-3 py-2.5 text-[14px] font-medium capitalize ${
              mode === m ? 'border-brand bg-brandsoft text-brand' : 'border-line bg-surface text-muted'}`}>
            {m}
          </button>
        ))}
      </div>

      <div className={`rounded-3xl border py-12 text-center transition ${
        done ? 'border-lime bg-lime' : 'border-line bg-surface'}`}>
        <p className={`tabnum font-display text-[64px] font-bold leading-none tracking-tight ${
          done ? 'text-onlime' : ''}`}>
          {formatClock(value)}
        </p>
        {done && <p className="mt-2 text-[14px] font-medium text-onlime">Time</p>}
      </div>

      {mode === 'countdown' && (
        <div className="no-scrollbar -mx-5 mt-4 flex gap-2 overflow-x-auto px-5">
          {PRESETS.map((p) => (
            <button key={p} onClick={() => pick(p)}
              className={`shrink-0 rounded-full border px-4 py-2 text-[13px] ${
                target === p ? 'border-brand bg-brand text-onbrand' : 'border-line bg-surface text-muted'}`}>
              {p < 60 ? `${p}s` : `${p / 60}m`}
            </button>
          ))}
        </div>
      )}

      <div className="mt-5 flex gap-2.5">
        <Button onClick={() => { finished.current = false; setRunning((r) => !r) }}
          variant={running ? 'ghost' : 'primary'}>
          {running ? 'Pause' : value === 0 && mode === 'countdown' ? 'Restart' : 'Start'}
        </Button>
        <Button variant="ghost" onClick={reset}>Reset</Button>
      </div>

      <p className="mt-4 text-center text-[12px] text-muted">
        Your phone will buzz when a countdown finishes, as long as the app is open.
      </p>
    </Screen>
  )
}
