import { useApp } from '../lib/app'

export default function Picker() {
  const { profiles, setUserId } = useApp()

  return (
    <div className="rise flex min-h-full flex-col justify-center px-6 py-10">
      <div className="mb-8">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff"
            strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M4 9v6M20 9v6M7 6v12M17 6v12M7 12h10" />
          </svg>
        </div>
        <h1 className="font-display text-[34px] font-bold leading-none tracking-tight">Gym App</h1>
        <p className="mt-2 text-[16px] text-muted">Who's training?</p>
      </div>

      <div className="space-y-3">
        {profiles.map((p) => (
          <button key={p.id} onClick={() => setUserId(p.id)}
            className="flex w-full items-center gap-4 rounded-2xl border border-line bg-surface px-4 py-4 text-left active:scale-[.99]">
            <div className="flex h-12 w-12 items-center justify-center rounded-full font-display text-[19px] font-bold"
              style={{ background: p.colour, color: p.colour === '#CBFF3C' ? '#1E2A00' : '#fff' }}>
              {p.name[0]}
            </div>
            <div className="flex-1">
              <div className="font-display text-[19px] font-medium">{p.name}</div>
              <div className="text-[13px] text-muted">
                {p.weight_kg ? `${p.weight_kg} kg` : 'Profile not set up yet'}
              </div>
            </div>
            <span className="text-[20px] text-muted" aria-hidden="true">›</span>
          </button>
        ))}
      </div>

      <p className="mt-8 text-center text-[13px] text-muted">
        You can switch between spaces any time from Settings.
      </p>
    </div>
  )
}
