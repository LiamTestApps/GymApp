import { useMemo, useState } from 'react'
import { catalogue, search, CATEGORY_LABEL } from '../lib/fitness'
import type { Category, CatalogueItem } from '../lib/types'
import { inputClass, Sheet, MuscleTiles } from './ui'

const FILTERS: (Category | 'all')[] = ['all', 'machine', 'cable', 'free', 'body', 'cardio']

export function ExercisePicker({
  open, onClose, onPick, selected = [], title = 'Add exercise',
}: {
  open: boolean
  onClose: () => void
  onPick: (item: CatalogueItem) => void
  selected?: string[]
  title?: string
}) {
  const [q, setQ] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [cat, setCat] = useState<Category | 'all'>('all')

  const results = useMemo(() => search(submitted, cat), [submitted, cat])
  const pinned = useMemo(
    () => (submitted.trim() || cat !== 'all' ? [] : catalogue.filter((c) => c.pinned)),
    [submitted, cat],
  )
  const rest = pinned.length ? results.filter((r) => !r.pinned) : results
  const chosen = new Set(selected)

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <form onSubmit={(e) => { e.preventDefault(); setSubmitted(q) }} className="flex gap-2">
        <input
          className={`${inputClass} flex-1 min-w-0`}
          type="search"
          enterKeyHint="search"
          placeholder="Search machines, muscles, exercises"
          value={q}
          onChange={(e) => { setQ(e.target.value); if (!e.target.value) setSubmitted('') }}
          autoComplete="off"
        />
        <button
          type="submit"
          className="shrink-0 rounded-xl bg-brand px-4 text-[14px] font-medium text-onbrand active:scale-[.98]"
        >
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
          <div className="space-y-1.5">
            {pinned.map((item) => (
              <Row key={item.id} item={item} chosen={chosen.has(item.id)} onPick={onPick} />
            ))}
          </div>
          <p className="mb-2 mt-5 text-[12px] font-medium uppercase tracking-wide text-muted">
            Everything else
          </p>
        </>
      )}

      <div className="mt-2 space-y-1.5">
        {rest.map((item) => (
          <Row key={item.id} item={item} chosen={chosen.has(item.id)} onPick={onPick} />
        ))}
        {results.length === 0 && (
          <p className="py-8 text-center text-[14px] text-muted">
            Nothing matches “{submitted}”. Try a muscle name like “chest” or “hamstrings”.
          </p>
        )}
      </div>
    </Sheet>
  )
}

function Row({ item, chosen, onPick }: {
  item: CatalogueItem; chosen: boolean; onPick: (i: CatalogueItem) => void
}) {
  return (
    <button
      onClick={() => onPick(item)}
      className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 text-left active:scale-[.99]"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="truncate text-[15px] font-medium">{item.name}</div>
          {chosen && (
            <span className="shrink-0 rounded-full bg-brandsoft px-2 py-0.5 text-[11px] font-medium text-brand">
              added
            </span>
          )}
        </div>
        <div className="truncate text-[12px] text-muted">{CATEGORY_LABEL[item.category]}</div>
        <MuscleTiles primary={item.primaryMuscles} secondary={item.secondaryMuscles} max={4} />
      </div>
    </button>
  )
}
