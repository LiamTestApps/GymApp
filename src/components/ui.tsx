import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
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
  variant?: 'primary' | 'ghost' | 'danger' | 'lime' | 'green'
  disabled?: boolean
  full?: boolean
  type?: 'button' | 'submit'
}) {
  const base =
    'rounded-xl px-5 py-3.5 text-[15px] font-medium transition active:scale-[.98] disabled:opacity-40'
  const styles = {
    primary: 'bg-brand text-onbrand',
    green: 'bg-green text-white',
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
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div
        className="rise mx-auto max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border-t border-line bg-bg px-5 pb-24 pt-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line" />
        {title && <h2 className="mb-4 font-display text-[20px] font-bold">{title}</h2>}
        {children}
      </div>
    </div>,
    document.body,
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
            kind === 'primary' ? 'bg-greensoft text-green' : 'bg-bluesoft text-blue'}`}>
          {m}
        </span>
      ))}
      {hidden > 0 && (
        <span className="rounded-md px-1.5 py-0.5 text-[11px] text-muted">+{hidden}</span>
      )}
    </div>
  )
}

export { BodyMap } from './BodyMap'

const TABS = [
  { to: '/', label: 'Home', icon: 'M3 10.5 12 3l9 7.5V21H3z' },
  { to: '/library', label: 'Exercises', icon: 'M4 5h16M4 12h16M4 19h10' },
  { to: '/timer', label: 'Timer', icon: 'M12 8v5l3 2M21 13a9 9 0 1 1-9-9 9 9 0 0 1 9 9Z' },
  { to: '/progress', label: 'Progress', icon: 'M4 19V5m0 14h16M8 15l3-4 3 2 4-6' },
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
