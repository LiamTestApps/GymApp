import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider, useApp } from './lib/app'
import { BottomNav } from './components/ui'
import Picker from './screens/Picker'
import Home from './screens/Home'
import RoutineEdit from './screens/RoutineEdit'
import SessionRun from './screens/SessionRun'
import SessionDone from './screens/SessionDone'
import Library from './screens/Library'
import ExerciseDetail from './screens/ExerciseDetail'
import Timer from './screens/Timer'
import Progress from './screens/Progress'
import Settings from './screens/Settings'

function Shell() {
  const { userId, profile, ready } = useApp()

  if (!ready) {
    return <div className="flex min-h-full items-center justify-center text-[15px] text-muted">Loading…</div>
  }

  if (!userId || !profile) return <Picker />

  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/routine/:id" element={<RoutineEdit />} />
        <Route path="/session/:id" element={<SessionRun />} />
        <Route path="/session/:id/done" element={<SessionDone />} />
        <Route path="/library" element={<Library />} />
        <Route path="/exercise/:id" element={<ExerciseDetail />} />
        <Route path="/timer" element={<Timer />} />
        <Route path="/progress" element={<Progress />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav />
    </>
  )
}

export default function App() {
  return (
    <AppProvider>
      <HashRouter>
        <div className="mx-auto min-h-full max-w-lg">
          <Shell />
        </div>
      </HashRouter>
    </AppProvider>
  )
}
