import { useGame } from './state/store'
import MainMenu from './screens/MainMenu'
import NewFranchise from './screens/NewFranchise'
import Hub from './screens/Hub'
import Roster from './screens/Roster'
import FrontOffice from './screens/FrontOffice'
import Press from './screens/Press'
import Season from './screens/Season'
import Offseason from './screens/Offseason'
import Store from './screens/Store'
import TeamEditor from './screens/TeamEditor'
import GameScreen from './court/GameScreen'
import Court5v5 from './court/Court5v5'
import RotateGate from './ui/RotateGate'
import { useEffect, useState } from 'react'
import { playTrack, setMusicMuted } from './audio/music'
import { setSfxMuted } from './audio/sfx'

const MUTE_KEY = 'hoop_muted'
function loadMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

function Toast() {
  const toast = useGame((s) => s.toast)
  const clearToast = useGame((s) => s.clearToast)
  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(clearToast, 1800)
    return () => window.clearTimeout(t)
  }, [toast, clearToast])
  if (!toast) return null
  return (
    <div className="toast-wrap">
      <div className="toast">{toast}</div>
    </div>
  )
}

function MuteButton() {
  const [muted, setMuted] = useState(loadMuted)
  useEffect(() => {
    setMusicMuted(muted)
    setSfxMuted(muted)
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [muted])
  return (
    <button className="mute-btn" onClick={() => setMuted((m) => !m)} aria-label="Toggle sound">
      {muted ? '🔇' : '🔊'}
    </button>
  )
}

export default function App() {
  const screen = useGame((s) => s.screen)

  // Menu loop on the front screens, in-game loop everywhere else. Audio can
  // only start after a user gesture, so kick it off on the first pointerdown.
  useEffect(() => {
    const track = screen === 'menu' || screen === 'newFranchise' ? 'menu' : 'game'
    playTrack(track)
    const onGesture = () => playTrack(track)
    window.addEventListener('pointerdown', onGesture)
    return () => window.removeEventListener('pointerdown', onGesture)
  }, [screen])

  return (
    <div className="stage">
      <RotateGate />
      {screen === 'menu' && <MuteButton />}
      {screen === 'menu' && <MainMenu />}
      {screen === 'newFranchise' && <NewFranchise />}
      {screen === 'hub' && <Hub />}
      {screen === 'game' && <GameScreen />}
      {screen === 'season' && <Season />}
      {screen === 'offseason' && <Offseason />}
      {screen === 'roster' && <Roster />}
      {screen === 'frontoffice' && <FrontOffice />}
      {screen === 'press' && <Press />}
      {screen === 'store' && <Store />}
      {screen === 'teameditor' && <TeamEditor />}
      {screen === 'practice' && <Court5v5 />}
      <Toast />
    </div>
  )
}
