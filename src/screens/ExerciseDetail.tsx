import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { exercise, imageUrl, CATEGORY_LABEL } from '../lib/fitness'
import { TopBar } from '../components/ui'

export default function ExerciseDetail() {
  const { id } = useParams()
  const item = exercise(id!)
  const [frame, setFrame] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [failed, setFailed] = useState(false)

  const frames = item?.images ?? []

  useEffect(() => {
    if (!playing || frames.length < 2) return
    const t = setInterval(() => setFrame((f) => (f + 1) % frames.length), 1100)
    return () => clearInterval(t)
  }, [playing, frames.length])

  if (!item) {
    return (
      <>
        <TopBar back title="Exercise" />
        <p className="px-5 py-10 text-center text-[15px] text-muted">This exercise no longer exists.</p>
      </>
    )
  }

  return (
    <>
      <TopBar back title={item.name} />
      <div className="rise px-5 pb-28 pt-4">
        <h1 className="font-display text-[26px] font-bold leading-tight tracking-tight">{item.name}</h1>
        <p className="mt-1 text-[14px] capitalize text-muted">
          {CATEGORY_LABEL[item.category]} · {item.level}
          {item.mechanic ? ` · ${item.mechanic}` : ''}
        </p>

        {frames.length > 0 && !failed && (
          <div className="mt-4">
            <button
              onClick={() => setPlaying((p) => !p)}
              className="relative block w-full overflow-hidden rounded-2xl border border-line bg-raised"
              aria-label={playing ? 'Pause animation' : 'Play animation'}
            >
              <img
                src={imageUrl(frames[frame])}
                alt={`${item.name}, position ${frame + 1} of ${frames.length}`}
                className="aspect-[4/3] w-full object-cover"
                loading="lazy"
                onError={() => setFailed(true)}
              />
              <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white">
                {playing ? 'Tap to pause' : 'Tap to play'}
              </span>
            </button>
            <p className="mt-2 text-[12px] text-muted">
              Start and end positions, looping. Cached after the first view so it works offline.
            </p>
          </div>
        )}

        {failed && (
          <p className="mt-4 rounded-xl border border-line bg-surface px-4 py-3 text-[13.5px] text-muted">
            Photos couldn't load. They need a connection the first time — the instructions below
            always work offline.
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-1.5">
          {item.primaryMuscles.map((m) => (
            <span key={m} className="rounded-full bg-greensoft px-2.5 py-1 text-[12px] font-medium capitalize text-green">
              {m}
            </span>
          ))}
          {item.secondaryMuscles.filter((m) => !item.primaryMuscles.includes(m)).map((m) => (
            <span key={m} className="rounded-full bg-bluesoft px-2.5 py-1 text-[12px] font-medium capitalize text-blue">
              {m}
            </span>
          ))}
        </div>

        <h2 className="mb-3 mt-7 font-display text-[17px] font-medium">How to do it</h2>
        <ol className="space-y-3">
          {item.instructions.map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="tabnum mt-0.5 shrink-0 font-display text-[13px] font-bold text-brand">
                {String(i + 1).padStart(2, '0')}
              </span>
              <p className="text-[15px] leading-relaxed">{step}</p>
            </li>
          ))}
        </ol>
        {item.instructions.length === 0 && (
          <p className="text-[14px] text-muted">No written instructions for this one.</p>
        )}
      </div>
    </>
  )
}
