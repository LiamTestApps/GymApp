-- Gym App — Supabase schema
-- Paste this whole file into the Supabase SQL editor and run it once.
--
-- Two deliberate choices worth knowing about:
--   * ids are text, not uuid, because the client generates them offline
--     (and a few are readable literals like 'liam' or 'strength').
--   * updated_at is text holding an ISO-8601 UTC string. ISO strings sort
--     lexicographically in the same order they sort chronologically, so the
--     sync's "give me everything newer than X" comparison works without any
--     timezone-format drift between client and server.

create table if not exists profiles (
  id          text primary key,
  name        text not null,
  colour      text not null,
  age         integer,
  weight_kg   numeric,
  theme       text not null default 'light',
  updated_at  text not null,
  deleted     smallint not null default 0
);

create table if not exists goal_presets (
  id          text primary key,
  label       text not null,
  sets        integer not null,
  reps_low    integer not null,
  reps_high   integer not null,
  updated_at  text not null,
  deleted     smallint not null default 0
);

create table if not exists routines (
  id          text primary key,
  user_id     text not null,
  name        text not null,
  goal        text not null,
  position    integer not null default 0,
  updated_at  text not null,
  deleted     smallint not null default 0
);

create table if not exists routine_exercises (
  id           text primary key,
  routine_id   text not null,
  exercise_id  text not null,
  position     integer not null default 0,
  sets         integer not null,
  reps         integer not null,
  weight_kg    numeric,
  updated_at   text not null,
  deleted      smallint not null default 0
);

create table if not exists sessions (
  id          text primary key,
  user_id     text not null,
  routine_id  text,
  name        text not null,
  started_at  text not null,
  ended_at    text,
  duration_s  integer,
  intensity   text,
  calories    integer,
  updated_at  text not null,
  deleted     smallint not null default 0
);

create table if not exists session_entries (
  id           text primary key,
  session_id   text not null,
  exercise_id  text not null,
  position     integer not null default 0,
  sets         integer not null,
  reps         integer not null,
  weight_kg    numeric,
  done         smallint not null default 0,
  updated_at   text not null,
  deleted      smallint not null default 0
);

-- The sync pulls "rows changed since last time", so these matter.
create index if not exists idx_routines_updated          on routines (updated_at);
create index if not exists idx_routine_exercises_updated on routine_exercises (updated_at);
create index if not exists idx_sessions_updated          on sessions (updated_at);
create index if not exists idx_session_entries_updated   on session_entries (updated_at);
create index if not exists idx_routines_user             on routines (user_id);
create index if not exists idx_sessions_user             on sessions (user_id);

-- The app has no login, so the anon key is the only credential and it ships
-- in the browser bundle. These policies grant it full access on purpose.
-- Anyone who has your Pages URL could read or write this data. For two people
-- tracking leg press weights that is a reasonable trade; don't put anything
-- sensitive in here.
alter table profiles          enable row level security;
alter table goal_presets      enable row level security;
alter table routines          enable row level security;
alter table routine_exercises enable row level security;
alter table sessions          enable row level security;
alter table session_entries   enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','goal_presets','routines','routine_exercises','sessions','session_entries'
  ] loop
    execute format('drop policy if exists "open access" on %I', t);
    execute format(
      'create policy "open access" on %I for all to anon using (true) with check (true)', t);
  end loop;
end $$;
