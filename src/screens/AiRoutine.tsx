import { useSearchParams } from 'react-router-dom'
import { TopBar } from '../components/ui'

// Placeholder for commit 2 — just proves the route + chooser wiring works.
// Commit 3 replaces this with the Express form, commit 4 adds the Custom wizard.
export default function AiRoutine() {
  const [params] = useSearchParams()
  const mode = params.get('mode') === 'custom' ? 'custom' : 'express'

  return (
    <>
      <TopBar back title={mode === 'custom' ? 'Custom AI routine' : 'Express AI routine'} />
      <div className="rise px-5 pb-28 pt-4">
        <p className="text-[15px] text-muted">
          The {mode === 'custom' ? 'full questionnaire' : 'four quick questions'} will live here.
        </p>
        <p className="mt-2 text-[13px] text-muted">Mode: {mode}</p>
      </div>
    </>
  )
}
