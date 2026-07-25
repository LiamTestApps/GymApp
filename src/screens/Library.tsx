import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { catalogue, search, CATEGORY_LABEL } from '../lib/fitness'
import type { Category } from '../lib/types'
import { Screen, Title, inputClass, MuscleTiles } from '../components/ui'

const FILTERS: (Category | 'all')[] = ['all', 'machine', 'cable', 'free', 'body', 'cardio']

export default function Library() {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [cat, setCat] = useState<Category | 'all'>('all')

  const results = useMemo(() => search(submitted, cat), [submitted, cat])
  const showPinned = !submitted.trim() && cat === 'all'
  const pinned = showPinned ? catalogue.filter((c) => c.pinned) : []
  const rest = showPinned ? results.filter((r) => !r.pinned) : results

  return (
    <Screen>
      <Title sub="Every exercise, with instructions and photos.">Exercises</Title>

      <form onSubmit={(e) => { e.preventDefault(); setSubmitted(q) }} className="flex gap-2">
        <input className={`${inputClass} flex-1 min-w-0`}
          type="search" enterKeyHint="search"
          placeholder="Search machines, muscles, exercises"
          value={q} onChange={(e) => { setQ(e.target.value); if (!e.target.value) setSubmitted('') }} autoComplete="off" />
        <button type="submit"
          className="shrink-0 rounded-xl bg-brand px-4 text-[14px] font-medium text-onbrand active:scale-[.98]">
          Search
        </button>
      </form>

      <div className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setCat(f)}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] ${
              cat === f ? 'border-brand bg-brand text-onbrand' : 'border-line bg-surface text-muted'}`}>
            {f === 'all' ? 'All' : CATEGORY_LABEL[f]}
          </button>
        ))}
      </div>

      {pinned.length > 0 && (
        <>
          <p className="mb-2 mt-5 text-[12px] font-medium uppercase tracking-wide text-muted">
            Most common
          </p>
          <List items={pinned} onOpen={(id) => nav(`/exercise/${id}`)} />
          <p className="mb-2 mt-5 text-[12px] font-medium uppercase tracking-wide text-muted">
            Everything else
          </p>
        </>
      )}

      <div className={pinned.length ? '' : 'mt-4'}>
        <List items={rest} onOpen={(id) => nav(`/exercise/${id}`)} />
      </div>

      {results.length === 0 && (
        <p className="py-10 text-center text-[14px] text-muted">
          Nothing matches “{submitted}”. Try a muscle name like “chest” or “quadriceps”.
        </p>
      )}
    </Screen>
  )
}

function List({ items, onOpen }: { items: typeof catalogue; onOpen: (id: string) => void }) {
  return (
    <div className="space-y-1.5">
      {items.map((c) => (
        <button key={c.id} onClick={() => onOpen(c.id)}
          className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 text-left active:scale-[.99]">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-medium">{c.name}</div>
            <div className="truncate text-[12px] text-muted">{CATEGORY_LABEL[c.category]}</div>
            <MuscleTiles primary={c.primaryMuscles} secondary={c.secondaryMuscles} />
          </div>
          <span className="shrink-0 text-[18px] text-muted" aria-hidden="true">›</span>
        </button>
      ))}
    </div>
  )
}
