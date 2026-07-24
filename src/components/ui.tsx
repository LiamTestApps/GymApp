import { useEffect, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useApp } from '../lib/app'

export function Screen({ children, pad = true }: { children: ReactNode; pad?: boolean }) {
  return (
    <div className={`rise min-h-full ${pad ? 'px-5 pb-28 pt-4' : 'pb-28'}`}>{children}</div>
  )
}

export function Title({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-5">
      <h1 className="font-display text-[28px] font-bold leading-tight tracking-tight">{children}</h1>
      {sub && <p className="mt-1 text-[15px] text-muted">{sub}</p>}
    </div>
  )
}

export function TopBar({ title, back, right }: { title?: string; back?: boolean; right?: ReactNode }) {
  const nav = useNavigate()
  return (
    <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-bg/95 px-5 py-3 backdrop-blur">
      {back && (
        <button
          onClick={() => nav(-1)}
          aria-label="Go back"
          className="-ml-2 flex h-9 w-9 items-center justify-center rounded-xl text-[22px] text-muted active:bg-raised"
        >
          ‹
        </button>
      )}
      <div className="font-display text-[17px] font-medium">{title}</div>
      <div className="ml-auto">{right}</div>
    </div>
  )
}

export function Button({
  children, onClick, variant = 'primary', disabled, full = true, type = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'ghost' | 'danger' | 'lime'
  disabled?: boolean
  full?: boolean
  type?: 'button' | 'submit'
}) {
  const base =
    'rounded-xl px-5 py-3.5 text-[15px] font-medium transition active:scale-[.98] disabled:opacity-40'
  const styles = {
    primary: 'bg-brand text-onbrand',
    lime: 'bg-lime text-onlime',
    ghost: 'border border-line bg-surface text-ink',
    danger: 'border border-line bg-surface text-danger',
  }[variant]
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`${base} ${styles} ${full ? 'w-full' : ''}`}>
      {children}
    </button>
  )
}

export function Card({ children, onClick, className = '' }: {
  children: ReactNode; onClick?: () => void; className?: string
}) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag onClick={onClick}
      className={`w-full rounded-2xl border border-line bg-surface p-4 text-left transition ${onClick ? 'active:scale-[.99]' : ''} ${className}`}>
      {children}
    </Tag>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12px] text-muted">{hint}</span>}
    </label>
  )
}

export const inputClass =
  'w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-[16px] text-ink outline-none focus:border-brand'

export function Stepper({ value, onChange, step = 1, min = 0, suffix, decimals = 0 }: {
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  suffix?: string
  decimals?: number
}) {
  const fmt = (n: number) => (decimals ? n.toFixed(decimals).replace(/\.0$/, '') : String(Math.round(n)))
  const bump = (d: number) => onChange(Math.max(min, Math.round((value + d * step) * 100) / 100))
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => bump(-1)} aria-label="Decrease"
        className="h-11 w-11 shrink-0 rounded-xl border border-line bg-surface text-[20px] text-muted active:scale-95">–</button>
      <div className="flex min-w-0 flex-1 items-baseline justify-center gap-1 rounded-xl border border-line bg-surface py-2.5">
        <span className="tabnum font-display text-[22px] font-bold">{fmt(value)}</span>
        {suffix && <span className="text-[13px] text-muted">{suffix}</span>}
      </div>
      <button onClick={() => bump(1)} aria-label="Increase"
        className="h-11 w-11 shrink-0 rounded-xl border border-line bg-surface text-[20px] text-muted active:scale-95">+</button>
    </div>
  )
}

export function Sheet({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title?: string; children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div
        className="rise max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-line bg-bg px-5 pb-8 pt-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line" />
        {title && <h2 className="mb-4 font-display text-[20px] font-bold">{title}</h2>}
        {children}
      </div>
    </div>
  )
}

export function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-5 py-10 text-center">
      <p className="font-display text-[17px] font-medium">{title}</p>
      <p className="mx-auto mt-1.5 max-w-[26ch] text-[14px] text-muted">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/** Small pills showing which muscles an exercise hits. */
export function MuscleTiles({ primary, secondary, max = 4 }: {
  primary: string[]; secondary?: string[]; max?: number
}) {
  const sec = (secondary ?? []).filter((m) => !primary.includes(m))
  const shown = [
    ...primary.map((m) => ({ m, kind: 'primary' as const })),
    ...sec.map((m) => ({ m, kind: 'secondary' as const })),
  ].slice(0, max)
  const hidden = primary.length + sec.length - shown.length

  if (!shown.length) return null
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {shown.map(({ m, kind }) => (
        <span key={m}
          className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium capitalize ${
            kind === 'primary' ? 'bg-greensoft text-green' : 'bg-coralsoft text-coral'}`}>
          {m}
        </span>
      ))}
      {hidden > 0 && (
        <span className="rounded-md px-1.5 py-0.5 text-[11px] text-muted">+{hidden}</span>
      )}
    </div>
  )
}

type Region = { key: string; d?: string; cx?: number; cy?: number; rx?: number; ry?: number }

const FRONT: Region[] = [
  { key: 'traps', d: 'M56,55 Q68,44 71,50 L71,58 Z' },
  { key: 'traps', d: 'M94,55 Q82,44 79,50 L79,58 Z' },
  { key: 'shoulders', cx: 48, cy: 63, rx: 12, ry: 11 },
  { key: 'shoulders', cx: 102, cy: 63, rx: 12, ry: 11 },
  { key: 'chest', d: 'M60,56 L74,53 L74,81 L63,81 Q56,73 60,56 Z' },
  { key: 'chest', d: 'M90,56 L76,53 L76,81 L87,81 Q94,73 90,56 Z' },
  { key: 'biceps', cx: 41, cy: 89, rx: 9, ry: 18 },
  { key: 'biceps', cx: 109, cy: 89, rx: 9, ry: 18 },
  { key: 'forearms', cx: 35, cy: 126, rx: 8, ry: 21 },
  { key: 'forearms', cx: 115, cy: 126, rx: 8, ry: 21 },
  { key: 'abdominals', d: 'M63,83 L87,83 L86,125 L64,125 Z' },
  { key: 'abductors', d: 'M56,132 L62,132 L62,192 L57,190 Z' },
  { key: 'abductors', d: 'M94,132 L88,132 L88,192 L93,190 Z' },
  { key: 'quadriceps', d: 'M62,130 L71,130 L70,194 L62,194 Z' },
  { key: 'quadriceps', d: 'M88,130 L79,130 L80,194 L88,194 Z' },
  { key: 'adductors', d: 'M71,133 L74,133 L73,180 L70,180 Z' },
  { key: 'adductors', d: 'M79,133 L76,133 L77,180 L80,180 Z' },
  { key: 'calves', cx: 67, cy: 227, rx: 8, ry: 25 },
  { key: 'calves', cx: 83, cy: 227, rx: 8, ry: 25 },
]

const BACK: Region[] = [
  { key: 'traps', d: 'M60,50 L75,58 L90,50 L86,80 L64,80 Z' },
  { key: 'shoulders', cx: 48, cy: 63, rx: 12, ry: 11 },
  { key: 'shoulders', cx: 102, cy: 63, rx: 12, ry: 11 },
  { key: 'lats', d: 'M58,66 L71,80 L71,106 L60,99 Q53,84 58,66 Z' },
  { key: 'lats', d: 'M92,66 L79,80 L79,106 L90,99 Q97,84 92,66 Z' },
  { key: 'middle back', d: 'M66,80 L84,80 L84,101 L66,101 Z' },
  { key: 'lower back', d: 'M66,103 L84,103 L85,124 L65,124 Z' },
  { key: 'triceps', cx: 41, cy: 89, rx: 9, ry: 18 },
  { key: 'triceps', cx: 109, cy: 89, rx: 9, ry: 18 },
  { key: 'forearms', cx: 35, cy: 126, rx: 8, ry: 21 },
  { key: 'forearms', cx: 115, cy: 126, rx: 8, ry: 21 },
  { key: 'glutes', cx: 67, cy: 136, rx: 12, ry: 13 },
  { key: 'glutes', cx: 83, cy: 136, rx: 12, ry: 13 },
  { key: 'hamstrings', cx: 66, cy: 172, rx: 11, ry: 27 },
  { key: 'hamstrings', cx: 84, cy: 172, rx: 11, ry: 27 },
  { key: 'calves', cx: 67, cy: 227, rx: 9, ry: 25 },
  { key: 'calves', cx: 83, cy: 227, rx: 9, ry: 25 },
]

const SILHOUETTE =
  'M75,8 C82,8 88,15 88,24 C88,31 85,36 82,39 L82,45 C92,47 103,52 106,60 ' +
  'L112,100 L120,142 C121,148 114,151 112,145 L104,112 L100,124 L98,128 ' +
  'L97,196 L93,258 L92,272 C92,277 82,277 82,272 L80,206 L75,186 L70,206 ' +
  'L68,272 C68,277 58,277 58,272 L57,258 L53,196 L52,128 L50,124 L46,112 ' +
  'L38,145 C36,151 29,148 30,142 L38,100 L44,60 C47,52 58,47 68,45 L68,39 ' +
  'C65,36 62,31 62,24 C62,15 68,8 75,8 Z'

function Figure({ regions, primary, secondary, label }: {
  regions: Region[]; primary: Set<string>; secondary: Set<string>; label: string
}) {
  const fill = (key: string) =>
    primary.has(key) ? 'var(--c-green)' : secondary.has(key) ? 'var(--c-coral)' : 'transparent'

  return (
    <figure className="m-0 flex-1">
      <svg viewBox="0 0 150 290" className="h-auto w-full" role="img"
        aria-label={`${label} view of the muscles this routine works`}>
        <path d={SILHOUETTE} fill="var(--c-raised)" stroke="var(--c-line)" strokeWidth="1.5" />
        {regions.map((r, i) =>
          r.d ? (
            <path key={i} d={r.d} fill={fill(r.key)} opacity={0.9} />
          ) : (
            <ellipse key={i} cx={r.cx} cy={r.cy} rx={r.rx} ry={r.ry} fill={fill(r.key)} opacity={0.9} />
          ),
        )}
        <path d={SILHOUETTE} fill="none" stroke="var(--c-line)" strokeWidth="1.5" />
      </svg>
      <figcaption className="mt-1 text-center text-[11px] text-muted">{label}</figcaption>
    </figure>
  )
}

/** Front and back figure with worked muscles filled in. */
export function BodyMap({ primary, secondary }: { primary: Set<string>; secondary: Set<string> }) {
  const sec = new Set([...secondary].filter((m) => !primary.has(m)))
  return (
    <div>
      <div className="flex gap-2 rounded-2xl border border-line bg-surface px-3 py-4">
        <Figure regions={FRONT} primary={primary} secondary={sec} label="Front" />
        <Figure regions={BACK} primary={primary} secondary={sec} label="Back" />
      </div>
      <div className="mt-2 flex items-center justify-center gap-4 text-[12px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-green" /> Main target
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-coral" /> Also worked
        </span>
      </div>
    </div>
  )
}

const TABS = [
  { to: '/', label: 'Home', icon: 'M3 10.5 12 3l9 7.5V21H3z' },
  { to: '/library', label: 'Exercises', icon: 'M4 5h16M4 12h16M4 19h10' },
  { to: '/timer', label: 'Timer', icon: 'M12 8v5l3 2M21 13a9 9 0 1 1-9-9 9 9 0 0 1 9 9Z' },
  { to: '/settings', label: 'Settings', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM4 12h1m14 0h1M12 4v1m0 14v1' },
]

export function BottomNav() {
  const { profile } = useApp()
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex max-w-lg">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.to === '/'}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] ${isActive ? 'text-brand' : 'text-muted'}`}>
            {({ isActive }) => (
              <>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth={isActive ? 2.2 : 1.7}
                  strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={t.icon} />
                </svg>
                {t.label}
              </>
            )}
          </NavLink>
        ))}
      </div>
      {profile && <div className="sr-only">Signed in as {profile.name}</div>}
    </nav>
  )
}
