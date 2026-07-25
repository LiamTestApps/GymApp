import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { useApp } from '../lib/app'
import {
  exercise, exerciseName, weightHistory, exerciseFrequency, muscleFrequency, ALL_MUSCLES,
  timeBuckets, weeklyTotals, milestones,
  type Timescale,
} from '../lib/fitness'
import { Screen, Title, Empty, BodyMap } from '../components/ui'
import { LineTrend, BarSeries, ConsistencyHeatmap } from '../components/charts'
import type { Session, SessionEntry } from '../lib/types'

export default function Progress() {
  const { userId } = useApp()
  const [params] = useSearchParams()

  const sessions = useLiveQuery(
    async () => (await db.sessions.where('user_id').equals(userId!).toArray()).filter((s) => !s.deleted),
    [userId], [] as Session[],
  )
  const entries = useLiveQuery(async () => {
    const mine = new Set(sessions.map((s) => s.id))
    if (!mine.size) return [] as SessionEntry[]
    return (await db.session_entries.toArray()).filter((e) => mine.has(e.session_id) && !e.deleted)
  }, [sessions], [] as SessionEntry[])

  const done = sessions.filter((s) => s.ended_at)

  if (done.length === 0) {
    return (
      <Screen>
        <Title sub="Charts appear here once you've logged a few sessions.">Progress</Title>
        <Empty title="Nothing to chart yet"
          body="Finish a workout or two and you'll see your weights, consistency and time here." />
      </Screen>
    )
  }

  return (
    <Screen>
      <Title sub="Everything you've logged, over time.">Progress</Title>
      <div className="space-y-8">
        <WeightSection sessions={done} entries={entries} initial={params.get('exercise')} />
        <ConsistencySection sessions={done} />
        <TimeSection sessions={done} />
        <MuscleSection sessions={done} entries={entries} />
        <MilestonesSection sessions={done} />
        <OptionalCharts sessions={done} entries={entries} />
      </div>
    </Screen>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-[18px] font-bold">{title}</h2>
      {hint && <p className="mb-3 mt-0.5 text-[13px] text-muted">{hint}</p>}
      <div className={hint ? '' : 'mt-3'}>{children}</div>
    </section>
  )
}

function WeightSection({ sessions, entries, initial }: {
  sessions: Session[]; entries: SessionEntry[]; initial: string | null
}) {
  const freq = useMemo(() => exerciseFrequency(sessions, entries), [sessions, entries])
  const options = useMemo(
    () => [...freq.entries()]
      .filter(([id]) => exercise(id))
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id),
    [freq],
  )
  const [selected, setSelected] = useState(
    initial && options.includes(initial) ? initial : options[0] ?? '',
  )

  if (!options.length) {
    return (
      <Section title="Weight progression" hint="Track how your working weight climbs.">
        <p className="rounded-2xl border border-line bg-surface px-4 py-6 text-center text-[14px] text-muted">
          Log some weighted exercises and they'll show up here.
        </p>
      </Section>
    )
  }

  const history = weightHistory(sessions, entries, selected)
  const data = history.map((p) => ({
    label: new Date(p.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
    value: p.weight,
  }))
  const first = history[0]?.weight
  const last = history[history.length - 1]?.weight
  const delta = first != null && last != null ? last - first : 0

  return (
    <Section title="Weight progression" hint="Working weight logged per session.">
      <select value={selected} onChange={(e) => setSelected(e.target.value)}
        className="mb-3 w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-[15px] font-medium text-ink outline-none focus:border-brand">
        {options.map((id) => (
          <option key={id} value={id}>{exerciseName(id)} · {freq.get(id)}×</option>
        ))}
      </select>

      {data.length < 2 ? (
        <p className="rounded-2xl border border-line bg-surface px-4 py-6 text-center text-[14px] text-muted">
          Only one session logged for this exercise so far. The line appears once there are two.
        </p>
      ) : (
        <div className="rounded-2xl border border-line bg-surface p-3">
          <div className="mb-1 flex items-baseline justify-between px-1">
            <span className="text-[13px] text-muted">{data.length} sessions</span>
            {delta !== 0 && (
              <span className={`text-[13px] font-medium ${delta > 0 ? 'text-green' : 'text-blue'}`}>
                {delta > 0 ? '+' : ''}{delta} kg since start
              </span>
            )}
          </div>
          <LineTrend data={data} unit="kg" />
        </div>
      )}
    </Section>
  )
}

function ConsistencySection({ sessions }: { sessions: Session[] }) {
  return (
    <Section title="Consistency" hint="Each square is a day. Greener means longer.">
      <div className="rounded-2xl border border-line bg-surface p-4">
        <ConsistencyHeatmap sessions={sessions} />
      </div>
    </Section>
  )
}

function TimeSection({ sessions }: { sessions: Session[] }) {
  const [scale, setScale] = useState<Timescale>('week')
  const count = scale === 'week' ? 8 : scale === 'month' ? 6 : 3
  const buckets = timeBuckets(sessions, scale, count)
  const showBars = scale !== 'year'
  const totalMin = buckets.reduce((s, b) => s + b.minutes, 0)

  return (
    <Section title="Time trained">
      <div className="mb-3 grid grid-cols-3 gap-2">
        {(['week', 'month', 'year'] as Timescale[]).map((s) => (
          <button key={s} onClick={() => setScale(s)}
            className={`rounded-xl border px-3 py-2 text-[13px] font-medium capitalize ${
              scale === s ? 'border-brand bg-brandsoft text-brand' : 'border-line bg-surface text-muted'}`}>
            {s}
          </button>
        ))}
      </div>
      <div className="rounded-2xl border border-line bg-surface p-3">
        {showBars ? (
          <BarSeries data={buckets.map((b) => ({ label: b.label, value: b.minutes }))} unit="min" />
        ) : (
          <div className="space-y-2 p-1">
            {buckets.map((b) => (
              <div key={b.key} className="flex items-baseline justify-between border-b border-line py-2 last:border-0">
                <span className="text-[15px] font-medium">{b.label}</span>
                <span className="tabnum font-display text-[17px] font-bold">{formatHours(b.minutes)}</span>
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 px-1 text-[12px] text-muted">
          {formatHours(totalMin)} across the last {count} {scale}s.
        </p>
      </div>
    </Section>
  )
}

function MuscleSection({ sessions, entries }: { sessions: Session[]; entries: SessionEntry[] }) {
  const freq = useMemo(() => muscleFrequency(sessions, entries), [sessions, entries])
  const ranked = [...freq.entries()].sort((a, b) => b[1] - a[1])
  const top = ranked.slice(0, 3).map(([m]) => m)
  const trained = new Set(freq.keys())
  const neglected = ALL_MUSCLES.filter((m) => !trained.has(m) || (freq.get(m) ?? 0) <= 2).slice(0, 4)

  const primary = new Set(top)
  const secondary = new Set(neglected)

  if (!ranked.length) return null

  return (
    <Section title="Muscle balance" hint="Where your training has landed.">
      <BodyMap primary={primary} secondary={secondary} />
      <div className="mt-3 space-y-2">
        <div className="rounded-xl border border-line bg-surface px-4 py-3">
          <p className="text-[13px] font-medium text-green">Most trained</p>
          <p className="mt-1 text-[14px] capitalize">{top.join(', ') || '—'}</p>
        </div>
        {neglected.length > 0 && (
          <div className="rounded-xl border border-line bg-surface px-4 py-3">
            <p className="text-[13px] font-medium text-blue">Lightly trained lately</p>
            <p className="mt-1 text-[14px] capitalize">{neglected.join(', ')}</p>
            <p className="mt-1 text-[12px] text-muted">
              Something to weave in if you fancy a more even spread — no pressure.
            </p>
          </div>
        )}
      </div>
      <p className="mt-2 text-[11px] text-muted">
        On the figures, green shows your top muscles and blue the ones that could use more.
      </p>
    </Section>
  )
}

function MilestonesSection({ sessions }: { sessions: Session[] }) {
  const items = milestones(sessions)
  return (
    <Section title="Milestones">
      <div className="grid grid-cols-3 gap-2">
        {items.map((m) => (
          <div key={m.id}
            className={`rounded-2xl border px-3 py-3 text-center ${
              m.earned ? 'border-green bg-greensoft' : 'border-line bg-surface opacity-60'}`}>
            <div className={`font-display text-[20px] font-bold ${m.earned ? 'text-green' : 'text-muted'}`}>
              {m.kind === 'sessions' ? m.threshold : `${m.threshold}h`}
            </div>
            <div className="mt-0.5 text-[11px] leading-tight text-muted">
              {m.kind === 'sessions' ? (m.threshold === 1 ? 'first session' : 'sessions') : 'trained'}
            </div>
            {m.earned && <div className="mt-1 text-[12px] text-green">✓</div>}
          </div>
        ))}
      </div>
    </Section>
  )
}

function OptionalCharts({ sessions, entries }: { sessions: Session[]; entries: SessionEntry[] }) {
  const [showCalories, setShowCalories] = useState(false)
  const [showVolume, setShowVolume] = useState(false)

  const entriesBySession = useMemo(() => {
    const map = new Map<string, SessionEntry[]>()
    for (const e of entries) {
      if (!map.has(e.session_id)) map.set(e.session_id, [])
      map.get(e.session_id)!.push(e)
    }
    return map
  }, [entries])

  const calories = weeklyTotals(sessions, (s) => s.calories ?? 0, 8)
  const volume = weeklyTotals(sessions, (s) => {
    const es = entriesBySession.get(s.id) ?? []
    return Math.round(es.filter((e) => e.done && e.weight_kg != null)
      .reduce((sum, e) => sum + (e.weight_kg ?? 0) * e.sets * e.reps, 0))
  }, 8)

  return (
    <Section title="More charts">
      {!showCalories && !showVolume && (
        <p className="mb-3 text-[13px] text-muted">Add extra views if you want them.</p>
      )}

      {showCalories && (
        <div className="mb-3 rounded-2xl border border-line bg-surface p-3">
          <div className="mb-1 flex items-center justify-between px-1">
            <span className="text-[13px] font-medium">Calories per week</span>
            <button onClick={() => setShowCalories(false)} className="text-[12px] text-muted">Hide</button>
          </div>
          <BarSeries data={calories.map((c) => ({ label: c.label, value: c.total }))}
            unit="kcal" color="var(--c-coral)" showValues={false} />
          <p className="mt-1 px-1 text-[11px] text-muted">Rough estimate from session length and intensity.</p>
        </div>
      )}

      {showVolume && (
        <div className="mb-3 rounded-2xl border border-line bg-surface p-3">
          <div className="mb-1 flex items-center justify-between px-1">
            <span className="text-[13px] font-medium">Volume per week</span>
            <button onClick={() => setShowVolume(false)} className="text-[12px] text-muted">Hide</button>
          </div>
          <BarSeries data={volume.map((v) => ({ label: v.label, value: v.total }))}
            unit="kg" color="var(--c-blue)" showValues={false} />
          <p className="mt-1 px-1 text-[11px] text-muted">Total weight moved: weight × sets × reps.</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {!showCalories && (
          <button onClick={() => setShowCalories(true)}
            className="rounded-xl border border-line bg-surface px-4 py-2.5 text-[14px] font-medium text-brand">
            + Calories per week
          </button>
        )}
        {!showVolume && (
          <button onClick={() => setShowVolume(true)}
            className="rounded-xl border border-line bg-surface px-4 py-2.5 text-[14px] font-medium text-brand">
            + Volume per week
          </button>
        )}
      </div>
    </Section>
  )
}

function formatHours(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h}h ${m}m` : `${h}h`
}