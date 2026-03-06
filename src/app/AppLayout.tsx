import { createContext, useCallback, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { LandingOverlay } from '@/pages/LandingPage'

export const IntroDissolveContext = createContext(false)

const TRANSITION_MS = 1600

export function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const [showLanding, setShowLanding] = useState(location.pathname === '/')
  const [introDissolve, setIntroDissolve] = useState(false)
  const timerRef = useRef(0)

  const onLandingEnter = useCallback(() => {
    setIntroDissolve(true)
    clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      setShowLanding(false)
      setIntroDissolve(false)
      if (location.pathname === '/') navigate('/map', { replace: true })
    }, TRANSITION_MS)
  }, [navigate, location.pathname])

  return (
    <div className="app-layout">
      <IntroDissolveContext.Provider value={introDissolve}>
        <Outlet />
      </IntroDissolveContext.Provider>
      {showLanding && <LandingOverlay onEnter={onLandingEnter} />}
    </div>
  )
}
