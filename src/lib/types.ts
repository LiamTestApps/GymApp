export type GoalKey = 'strength' | 'muscle' | 'endurance' | 'fitness'

export type Category = 'machine' | 'cable' | 'free' | 'body' | 'cardio'

export interface CatalogueItem {
  id: string
  name: string
  category: Category
  pinned: boolean
  primaryMuscles: string[]
  secondaryMuscles: string[]
  level: string
  mechanic: string | null
  instructions: string[]
  images: string[]
}

export interface Profile {
  id: string
  name: string
  colour: string
  age: number | null
  weight_kg: number | null
  theme: 'light' | 'dark'
  updated_at: string
  deleted: 0 | 1
}

export interface Routine {
  id: string
  user_id: string
  name: string
  goal: GoalKey
  position: number
  updated_at: string
  deleted: 0 | 1
}

export interface RoutineExercise {
  id: string
  routine_id: string
  exercise_id: string
  position: number
  sets: number
  reps: number
  weight_kg: number | null
  updated_at: string
  deleted: 0 | 1
}

export interface Session {
  id: string
  user_id: string
  routine_id: string | null
  name: string
  started_at: string
  ended_at: string | null
  duration_s: number | null
  intensity: 'light' | 'moderate' | 'hard' | null
  calories: number | null
  updated_at: string
  deleted: 0 | 1
}

export interface SessionEntry {
  id: string
  session_id: string
  exercise_id: string
  position: number
  sets: number
  reps: number
  weight_kg: number | null
  done: 0 | 1
  updated_at: string
  deleted: 0 | 1
}

export interface GoalPreset {
  id: GoalKey
  label: string
  sets: number
  reps_low: number
  reps_high: number
  updated_at: string
  deleted: 0 | 1
}

export interface Goal {
  id: string
  user_id: string
  sessions_per_week: number
  months: number
  started_at: string
  updated_at: string
  deleted: 0 | 1
}

export type TableName =
  | 'profiles'
  | 'routines'
  | 'routine_exercises'
  | 'sessions'
  | 'session_entries'
  | 'goal_presets'
  | 'goals'

export interface Outbox {
  key?: number
  table: TableName
  row_id: string
  queued_at: string
}



