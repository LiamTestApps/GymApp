import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, put } from '../lib/db'
import { useApp } from '../lib/app'
import { supabaseConfigured } from '../lib/supabase'
import { sync } from '../lib/sync'
import { Screen, Title, Card, Field, inputClass, Button, Stepper } from '../components/ui'
import type { GoalPreset } from '../lib/types'

export default function Settings() {
  const { profile, profiles, setUserId, setTheme, syncState } = useApp()
  const goals = useLiveQuery(async () => (await db.goal_presets.toArray()).filter((g) => !g.deleted), [], [])

  const [age, setAge] = useState('')
  const [weight, setWeight] = useState('')

  useEffect(() => {
    setAge(profile?.age != null ? String(profile.age) : '')
    setWeight(profile?.weight_kg != null ? String(profile.weight_kg) : '')
  }, [profile?.id])

  if (!profile) return null

  async function saveProfile() {
    await put('profiles', {
      ...profile!,
      age: age.trim() ? Number(age) : null,
      weight_kg: weight.trim() ? Number(weight) : null,
    })
  }

  return (
    <Screen>
      <Title>Settings</Title>

      <h2 className="mb-2.5 font-display text-[17px] font-medium">Your profile</h2>
      <Card>
        <div className="space-y-4">
          <Field label="Weight" hint="Used for the calorie estimate.">
            <input className={inputClass} inputMode="decimal" value={weight}
              onChange={(e) => setWeight(e.target.value)} onBlur={saveProfile} placeholder="72" />
          </Field>
          <Field label="Age">
            <input className={inputClass} inputMode="numeric" value={age}
              onChange={(e) => setAge(e.target.value)} onBlur={saveProfile} placeholder="38" />
          </Field>
          <p className="text-[12px] text-muted">
            Calorie numbers are a rough estimate. Weight training burn is genuinely hard to measure,
            so treat them as a trend rather than a figure.
          </p>
        </div>
      </Card>

      <h2 className="mb-2.5 mt-7 font-display text-[17px] font-medium">Appearance</h2>
      <div className="grid grid-cols-2 gap-2">
        {(['light', 'dark'] as const).map((t) => (
          <button key={t} onClick={() => setTheme(t)}
            className={`rounded-xl border px-3 py-3 text-[14px] font-medium capitalize ${
              profile.theme === t ? 'border-brand bg-brandsoft text-brand' : 'border-line bg-surface text-muted'}`}>
            {t}
          </button>
        ))}
      </div>

      <h2 className="mb-2.5 mt-7 font-display text-[17px] font-medium">Goal presets</h2>
      <p className="mb-3 text-[13px] text-muted">
        Sets and reps suggested when you pick a goal. Shared between both of you.
      </p>
      <div className="space-y-2">
        {goals.map((g) => <GoalRow key={g.id} goal={g} />)}
      </div>

      <h2 className="mb-2.5 mt-7 font-display text-[17px] font-medium">Switch space</h2>
      <div className="space-y-2">
        {profiles.map((p) => (
          <button key={p.id} onClick={() => setUserId(p.id)}
            className={`flex w-full items-center gap-3 rounded-xl border bg-surface px-4 py-3.5 text-left ${
              p.id === profile.id ? 'border-brand' : 'border-line'}`}>
            <div className="flex h-9 w-9 items-center justify-center rounded-full font-display text-[15px] font-bold"
              style={{ background: p.colour, color: p.colour === '#CBFF3C' ? '#1E2A00' : '#fff' }}>
              {p.name[0]}
            </div>
            <span className="flex-1 text-[15px] font-medium">{p.name}</span>
            {p.id === profile.id && <span className="text-[13px] text-brand">Current</span>}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[12px] text-muted">
        Both spaces are fully open — no password. Switching lets you see or edit either set of routines.
      </p>

      <h2 className="mb-2.5 mt-7 font-display text-[17px] font-medium">Sync</h2>
      <Card>
        <p className="text-[14px]">
          {!supabaseConfigured
            ? 'Not connected — this device only.'
            : syncState === 'syncing' ? 'Syncing…'
            : syncState === 'offline' ? 'Offline. Changes are saved and will sync later.'
            : syncState === 'error' ? "Couldn't reach the server. Your data is safe on this device."
            : 'Up to date.'}
        </p>
        <p className="mt-1 text-[12.5px] text-muted">
          Everything works offline. The gym's signal doesn't matter.
        </p>
        {supabaseConfigured && (
          <div className="mt-3"><Button variant="ghost" onClick={() => sync()}>Sync now</Button></div>
        )}
      </Card>

      <p className="mt-8 text-center text-[12px] text-muted">Gym App · v1.0</p>
    </Screen>
  )
}

function GoalRow({ goal }: { goal: GoalPreset }) {
  const [open, setOpen] = useState(false)
  const [sets, setSets] = useState(goal.sets)
  const [low, setLow] = useState(goal.reps_low)
  const [high, setHigh] = useState(goal.reps_high)

  return (
    <div className="rounded-xl border border-line bg-surface">
      <button onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3.5 text-left">
        <span className="text-[15px] font-medium">{goal.label}</span>
        <span className="tabnum text-[14px] text-muted">
          {goal.sets} × {goal.reps_low}–{goal.reps_high}
        </span>
      </button>
      {open && (
        <div className="space-y-3.5 border-t border-line px-4 py-4">
          <Field label="Sets"><Stepper value={sets} onChange={setSets} min={1} /></Field>
          <Field label="Reps from"><Stepper value={low} onChange={setLow} min={1} /></Field>
          <Field label="Reps to"><Stepper value={high} onChange={setHigh} min={1} /></Field>
          <Button onClick={async () => {
            await put('goal_presets', { ...goal, sets, reps_low: low, reps_high: Math.max(low, high) })
            setOpen(false)
          }}>Save</Button>
        </div>
      )}
    </div>
  )
}
