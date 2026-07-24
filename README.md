# Gym App

A workout tracker for two people. Offline-first, installs to the Android home screen,
no login. React + Vite + TypeScript + Tailwind v4 + Dexie + Supabase, deployed to GitHub Pages.

---

## Setup, in order

Do these in order and verify each one before moving on. Nothing here needs a local
Node install — it all happens in the GitHub web UI, Codespaces, and the Supabase dashboard.

### 1. Create the repo

1. Go to <https://github.com/new>, owner `LiamTestApps`, repository name **`GymApp`**.
   The name matters: `base` in `vite.config.ts` and `start_url` in the manifest are both
   set to `/GymApp/`. If you name it something else, change those two places to match.
2. Set it to Public (GitHub Pages on free accounts needs this), don't add a README.
3. Upload the contents of this folder. The fastest route is Codespaces:
   open the empty repo → **Code** → **Codespaces** → **Create codespace on main**,
   then drag the files into the file explorer.

**Verify:** you can see `package.json`, `src/`, and `.github/workflows/` in the repo.

### 2. Create the Supabase project

1. Sign in to your new Supabase account and click **New project**.
2. Name it `gym-app`, pick a region near you (Frankfurt or Paris), and set a database
   password. Save that password somewhere — you won't need it for the app, but you'll
   want it later.
3. Wait for the project to finish provisioning, roughly two minutes.

### 3. Create the tables

1. In the Supabase dashboard, open **SQL Editor** in the left sidebar.
2. Click **New query**, paste the entire contents of `supabase-schema.sql`, and click **Run**.
3. You should see "Success. No rows returned".

**Verify:** open **Table Editor** and confirm six tables exist — `profiles`, `goal_presets`,
`routines`, `routine_exercises`, `sessions`, `session_entries`.

### 4. Get your keys

1. In Supabase, go to **Project Settings** → **API**.
2. Copy the **Project URL** (looks like `https://abcdefgh.supabase.co`).
3. Copy the **anon / public** key — the long one. Not the `service_role` key, ever.

### 5. Add the keys to GitHub

1. In your repo: **Settings** → **Secrets and variables** → **Actions**.
2. Click **New repository secret** twice:
   - Name `VITE_SUPABASE_URL`, value = your project URL
   - Name `VITE_SUPABASE_ANON_KEY`, value = your anon key

### 6. Turn on Pages

1. Repo **Settings** → **Pages**.
2. Under **Source**, choose **GitHub Actions**.

### 7. Deploy

Push any commit to `main` — or go to **Actions** → **Deploy to GitHub Pages** → **Run workflow**.

**Verify:** the workflow goes green, then visit `https://liamtestapps.github.io/GymApp/`.
You should see the "Who's training?" screen with Liam and Orla.

### 8. Install it on your phones

1. Open the URL in Chrome on Android.
2. Menu (⋮) → **Add to Home screen** → **Install**.
3. Open it from the home screen. It runs full-screen with no browser chrome.
4. Tap your name once. The phone remembers it from then on.

---

## Running it locally in Codespaces

```bash
npm install
cp .env.example .env      # then paste your real URL and key into .env
npm run dev
```

Codespaces will offer to forward the port; open it and you're running the app.
Without a `.env` the app still works — it just stays local to that browser and
doesn't sync.

---

## How the data works

Every write lands in IndexedDB first and queues in an `outbox` table. A loop pushes
the queue to Supabase every 30 seconds, whenever the app regains focus, and whenever
the device comes back online — then pulls anything either of you changed elsewhere.

This means the gym's signal is irrelevant. Log everything on airplane mode if you like;
it reconciles when you get home. Conflicts resolve last-write-wins on `updated_at`,
which is the right answer for two people who don't edit the same routine simultaneously.

Nothing is ever hard-deleted. Deletes set `deleted = 1` so the removal propagates to
the other phone instead of the row reappearing on the next sync.

### Working weights

A routine stores your working weight per exercise. When you change the weight during a
session, two things get written: the session entry records what you actually did that
day, and the routine's working weight updates so it's there next time. Drop to 40kg on a
tired day and the routine follows you down — edit it in the routine screen if that's
not what you wanted.

---

## Exercise data

101 exercises curated from
[free-exercise-db](https://github.com/yuhonas/free-exercise-db) (public domain),
renamed to match what you'd actually call them. Fifteen common machines are pinned to
the top of every picker; the rest are searchable by name or muscle.

Photos stream from jsDelivr and are cached permanently by the service worker on first
view. Written instructions are bundled into the app, so they work offline immediately —
only the photos need one connected view each. Open the ones you use at home and
they're yours for good.

To add or rename an exercise, edit `src/data/catalogue.json`.

---

## Known rough edges

- Time-based exercises (plank, cardio) still display as "sets × reps". Use the Timer tab
  for the actual holds. Worth fixing if it grates.
- The bundle is 632 KB (176 KB gzipped), mostly the Supabase client. Fine over wifi,
  and it's cached after first load, but it could be code-split later.
- No progress charts yet. Every set is stored, so the data is there whenever we build them.
