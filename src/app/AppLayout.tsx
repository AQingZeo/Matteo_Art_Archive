import {
  createContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { LandingOverlay } from '@/pages/LandingPage'

export const IntroDissolveContext = createContext(false)

export type BgmContextValue = {
  soundOn: boolean
  setSoundOn: Dispatch<SetStateAction<boolean>>
}

export const BgmContext = createContext<BgmContextValue | null>(null)

const TRANSITION_MS = 1600
const BGM_VOLUME = 0.3
/** Viewport width below this is treated as phone (MediaPipe not supported). */
const PHONE_BREAKPOINT_PX = 768

export function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const [showLanding, setShowLanding] = useState(location.pathname === '/')
  const [introDissolve, setIntroDissolve] = useState(false)
  const [isPhone, setIsPhone] = useState(() => typeof window !== 'undefined' && window.innerWidth < PHONE_BREAKPOINT_PX)
  const [phoneBannerDismissed, setPhoneBannerDismissed] = useState(false)
  const timerRef = useRef(0)
  const bgmRef = useRef<HTMLAudioElement | null>(null)
  const [soundOn, setSoundOn] = useState(true)

  useEffect(() => {
    const check = () => setIsPhone(window.innerWidth < PHONE_BREAKPOINT_PX)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

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

  useEffect(() => {
    const el = bgmRef.current
    if (el) el.muted = !soundOn
  }, [soundOn])

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
      {isPhone && !phoneBannerDismissed && (
        <div className="phone-notice" role="status">
          <p className="phone-notice-text">
            This site uses MediaPipe and currently doesn’t work on phones. Please use a tablet or desktop.
          </p>
          <button
            type="button"
            className="phone-notice-dismiss"
            aria-label="Dismiss"
            onClick={() => setPhoneBannerDismissed(true)}
          >
            ×
          </button>
        </div>
      )}
      <IntroDissolveContext.Provider value={introDissolve}>
        <BgmContext.Provider value={{ soundOn, setSoundOn }}>
          <Outlet />
        </BgmContext.Provider>
      </IntroDissolveContext.Provider>
      {showLanding && <LandingOverlay onEnter={onLandingEnter} />}
    </div>
  )
}
