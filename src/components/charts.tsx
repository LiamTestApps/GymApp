import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { weekStart } from '../lib/fitness'
import type { Session } from '../lib/types'

const cssVar = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888'

export function LineTrend({ data, unit, color = 'var(--c-green)' }: {
  data: { label: string; value: number }[]
  unit?: string
  color?: string
}) {
  const line = color.startsWith('var(') ? cssVar(color.slice(4, -1)) : color
  const grid = cssVar('--c-line')
  const text = cssVar('--c-muted')
  return (
    <div style={{ width: '100%', height: 200 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: text }} tickLine={false} axisLine={{ stroke: grid }} />
          <YAxis tick={{ fontSize: 11, fill: text }} tickLine={false} axisLine={false} width={38}
            unit={unit ? ` ${unit}` : undefined} />
          <Tooltip
            contentStyle={{
              background: cssVar('--c-surface'), border: `1px solid ${grid}`,
              borderRadius: 12, fontSize: 12, color: cssVar('--c-ink'),
            }}
            labelStyle={{ color: text }}
            formatter={(v) => [`${v}${unit ? ` ${unit}` : ''}`, '']}
          />
          <Line type="monotone" dataKey="value" stroke={line} strokeWidth={2.5}
            dot={{ r: 3, fill: line }} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function BarSeries({ data, unit, color = 'var(--c-brand)', showValues = true }: {
  data: { label: string; value: number }[]
  unit?: string
  color?: string
  showValues?: boolean
}) {
  const bar = color.startsWith('var(') ? cssVar(color.slice(4, -1)) : color
  const grid = cssVar('--c-line')
  const text = cssVar('--c-muted')
  return (
    <div style={{ width: '100%', height: 210 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 20, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: text }} tickLine={false} axisLine={{ stroke: grid }} />
          <YAxis tick={{ fontSize: 11, fill: text }} tickLine={false} axisLine={false} width={38} />
          <Tooltip
            cursor={{ fill: cssVar('--c-raised') }}
            contentStyle={{
              background: cssVar('--c-surface'), border: `1px solid ${grid}`,
              borderRadius: 12, fontSize: 12, color: cssVar('--c-ink'),
            }}
            labelStyle={{ color: text }}
            formatter={(v) => [`${v}${unit ? ` ${unit}` : ''}`, '']}
          />
          <Bar dataKey="value" fill={bar} radius={[6, 6, 0, 0]}
            label={showValues ? { position: 'top', fontSize: 11, fill: text } : undefined} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** GitHub-style calendar heatmap of training days over the last `weeks` weeks. */
export function ConsistencyHeatmap({ sessions, weeks = 13 }: { sessions: Session[]; weeks?: number }) {
  const green = cssVar('--c-green')
  const base = cssVar('--c-raised')
  const text = cssVar('--c-muted')

  const byDay = new Map<string, number>()
  for (const s of sessions) {
    if (!s.ended_at || s.deleted) continue
    const key = new Date(s.started_at).toDateString()
    byDay.set(key, (byDay.get(key) ?? 0) + Math.round((s.duration_s ?? 0) / 60))
  }

  const start = weekStart(new Date())
  start.setDate(start.getDate() - (weeks - 1) * 7)

  const cols: Date[][] = []
  for (let w = 0; w < weeks; w++) {
    const col: Date[] = []
    for (let d = 0; d < 7; d++) {
      const day = new Date(start)
      day.setDate(day.getDate() + w * 7 + d)
      col.push(day)
    }
    cols.push(col)
  }

  const today = new Date(); today.setHours(23, 59, 59, 999)
  const shade = (mins: number) => {
    if (mins <= 0) return base
    if (mins < 20) return `color-mix(in srgb, ${green} 35%, ${base})`
    if (mins < 45) return `color-mix(in srgb, ${green} 65%, ${base})`
    return green
  }

  return (
    <div>
      <div className="flex gap-[3px] overflow-x-auto no-scrollbar">
        {cols.map((col, i) => (
          <div key={i} className="flex flex-col gap-[3px]">
            {col.map((day, j) => {
              const future = day > today
              const mins = byDay.get(day.toDateString()) ?? 0
              return (
                <div key={j}
                  title={future ? '' : `${day.toLocaleDateString()} · ${mins} min`}
                  className="h-3.5 w-3.5 rounded-[3px]"
                  style={{ background: future ? 'transparent' : shade(mins) }} />
              )
            })}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[11px]" style={{ color: text }}>
        <span>Less</span>
        <span className="h-3 w-3 rounded-[3px]" style={{ background: base }} />
        <span className="h-3 w-3 rounded-[3px]" style={{ background: `color-mix(in srgb, ${green} 35%, ${base})` }} />
        <span className="h-3 w-3 rounded-[3px]" style={{ background: `color-mix(in srgb, ${green} 65%, ${base})` }} />
        <span className="h-3 w-3 rounded-[3px]" style={{ background: green }} />
        <span>More</span>
      </div>
    </div>
  )
}