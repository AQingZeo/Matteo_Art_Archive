import { createContext, useCallback, useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { LandingOverlay } from '@/pages/LandingPage'

export const IntroDissolveContext = createContext(false)

const TRANSITION_MS = 1600
const BGM_VOLUME = 0.15

export function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const [showLanding, setShowLanding] = useState(location.pathname === '/')
  const [introDissolve, setIntroDissolve] = useState(false)
  const timerRef = useRef(0)
  const bgmRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    const audio = new Audio('/abcSong.m4a')
    audio.loop = true
    audio.volume = BGM_VOLUME
    bgmRef.current = audio

    const start = () => {
      audio.play().catch(() => {})
      window.removeEventListener('click', start)
      window.removeEventListener('keydown', start)
      window.removeEventListener('touchstart', start)
    }

    window.addEventListener('click', start, { once: true })
    window.addEventListener('keydown', start, { once: true })
    window.addEventListener('touchstart', start, { once: true })

    return () => {
      audio.pause()
      audio.src = ''
      window.removeEventListener('click', start)
      window.removeEventListener('keydown', start)
      window.removeEventListener('touchstart', start)
    }
  }, [])

  const onLandingEnter = useCallback((options?: { skipTransition?: boolean }) => {
    if (options?.skipTransition) {
      setShowLanding(false)
      if (location.pathname === '/') navigate('/map', { replace: true })
      return
    }
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
