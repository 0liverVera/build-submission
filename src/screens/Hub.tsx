import { type CSSProperties } from 'react'
import { useGame } from '../state/store'
import { sfx } from '../audio/sfx'
import type { Screen } from '../types'

export default function Hub() {
  const f = useGame((s) => s.franchise)
  const navigate = useGame((s) => s.navigate)
  if (!f) return null

  const headVars = {
    ['--p']: f.colorPrimary,
    ['--s']: f.colorSecondary,
  } as CSSProperties

  const go = (screen: Screen) => {
    sfx.tap()
    navigate(screen)
  }

  return (
    <div className="screen hub-screen">
      <header className="hub-head" style={headVars}>
        <div className="crest small">
          <span>{f.teamName[0].toUpperCase()}</span>
        </div>
        <div className="hub-id">
          <div className="hub-team">
            {f.city} {f.teamName}
          </div>
          <div className="hub-sub">
            Coach {f.coachName} · Season {f.season}
          </div>
        </div>
        <div className="hub-stat">
          <span className="k">RECORD</span>
          <span className="v">
            {f.wins}-{f.losses}
          </span>
        </div>
        <div className="hub-stat">
          <span className="k">CREDITS</span>
          <span className="v gold">🪙 {f.credits}</span>
        </div>
        <button className="hub-menu" onClick={() => go('menu')} aria-label="Menu">
          ≡
        </button>
      </header>

      <div className="hub-nav">
        <button className="nav-card play" onClick={() => go('season')}>
          <span className="ic">🏀</span>
          <span className="lbl">PLAY GAME</span>
        </button>
        <button className="nav-card" onClick={() => go('roster')}>
          <span className="ic">👥</span>
          <span className="lbl">ROSTER</span>
        </button>
        <button className="nav-card" onClick={() => go('frontoffice')}>
          <span className="ic">🏢</span>
          <span className="lbl">FRONT OFFICE</span>
        </button>
        <button className="nav-card" onClick={() => go('store')}>
          <span className="ic">🛒</span>
          <span className="lbl">STORE</span>
        </button>
      </div>
    </div>
  )
}
