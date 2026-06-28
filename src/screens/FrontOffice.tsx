import Button from '../ui/Button'
import { useGame, FACILITY_COST } from '../state/store'
import type { FacilityKey } from '../types'

const FACS: { key: FacilityKey; name: string; icon: string; effect: string }[] = [
  { key: 'training', name: 'Training', icon: '🏋️', effect: 'Player growth & morale' },
  { key: 'medical', name: 'Medical', icon: '🏥', effect: 'Faster injury recovery' },
  { key: 'scouting', name: 'Scouting', icon: '🔭', effect: 'Better draft intel' },
  { key: 'stadium', name: 'Stadium', icon: '🏟️', effect: 'More fans & credit income' },
]

export default function FrontOffice() {
  const f = useGame((s) => s.franchise)
  const navigate = useGame((s) => s.navigate)
  const upgrade = useGame((s) => s.upgradeFacility)
  if (!f) return null

  const avgMorale = Math.round(
    f.roster.reduce((s, p) => s + p.morale, 0) / Math.max(1, f.roster.length),
  )

  return (
    <div className="screen fo-screen">
      <header className="screen-head">
        <Button variant="ghost" className="back" onClick={() => navigate('hub')}>
          ‹
        </Button>
        <h2>FRONT OFFICE</h2>
        <div className="fo-stats">
          <span className="fo-pill gold">🪙 {f.credits}</span>
          <span className="fo-pill">📣 {f.fanInterest}</span>
          <span className="fo-pill">😊 {avgMorale}</span>
        </div>
      </header>

      <div className="fo-grid">
        {FACS.map((fac) => {
          const level = f.facilities[fac.key]
          const max = level >= 5
          const cost = FACILITY_COST(level)
          const afford = f.credits >= cost
          return (
            <div key={fac.key} className="fo-card">
              <div className="fo-ic">{fac.icon}</div>
              <div className="fo-name">{fac.name}</div>
              <div className="fo-dots">
                {[1, 2, 3, 4, 5].map((n) => (
                  <span key={n} className={`fo-dot${n <= level ? ' on' : ''}`} />
                ))}
              </div>
              <div className="fo-effect">{fac.effect}</div>
              <Button
                variant={max ? 'secondary' : 'primary'}
                className="fo-up"
                disabled={max || !afford}
                onClick={() => upgrade(fac.key)}
              >
                {max ? 'MAX' : `▲ 🪙${cost}`}
              </Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
