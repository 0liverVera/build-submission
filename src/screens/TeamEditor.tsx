import { useState, type CSSProperties } from 'react'
import Button from '../ui/Button'
import { useGame } from '../state/store'
import { sfx } from '../audio/sfx'

const THEMES = [
  { p: '#ff8a3d', s: '#14182b' },
  { p: '#2dd4bf', s: '#0b3b36' },
  { p: '#e8503a', s: '#2a0e0a' },
  { p: '#3a7be8', s: '#0a1a3a' },
  { p: '#b86bff', s: '#2a1050' },
  { p: '#ffcf4a', s: '#4a3608' },
  { p: '#56c06a', s: '#0e3a1e' },
  { p: '#ff5e9c', s: '#3a0e22' },
]

/** The "Unlimited" reward — edit your team identity (Section 9). */
export default function TeamEditor() {
  const f = useGame((s) => s.franchise)
  const navigate = useGame((s) => s.navigate)
  const editTeam = useGame((s) => s.editTeam)

  const startTheme = f ? THEMES.findIndex((t) => t.p === f.colorPrimary) : 0
  const [city, setCity] = useState(f?.city ?? '')
  const [team, setTeam] = useState(f?.teamName ?? '')
  const [theme, setTheme] = useState(startTheme >= 0 ? startTheme : 0)
  if (!f) return null

  const t = THEMES[theme]
  const crestLetter = (team.trim()[0] || '?').toUpperCase()
  const crestVars = { ['--p']: t.p, ['--s']: t.s } as CSSProperties

  return (
    <div className="screen form-screen">
      <header className="screen-head">
        <Button variant="ghost" className="back" onClick={() => navigate('store')}>
          ‹
        </Button>
        <h2>TEAM EDITOR</h2>
        <span className="roster-sub">⭐ Unlimited</span>
      </header>

      <div className="form-body">
        <div className="form-col left">
          <div className="crest-preview" style={crestVars}>
            <div className="crest">
              <span>{crestLetter}</span>
            </div>
            <div className="crest-name">
              {(city.trim() || f.city) + ' ' + (team.trim() || f.teamName)}
            </div>
          </div>
          <div className="field">
            <span>Team Colors & Jersey</span>
            <div className="theme-row wrap">
              {THEMES.map((th, i) => (
                <button
                  key={i}
                  type="button"
                  className={`swatch${i === theme ? ' on' : ''}`}
                  style={{ background: th.p }}
                  onClick={() => {
                    sfx.tap()
                    setTheme(i)
                  }}
                  aria-label={`Theme ${i + 1}`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="form-col right">
          <label className="field">
            <span>City</span>
            <input value={city} onChange={(e) => setCity(e.target.value)} maxLength={16} />
          </label>
          <label className="field">
            <span>Team Name</span>
            <input value={team} onChange={(e) => setTeam(e.target.value)} maxLength={16} />
          </label>
          <div className="form-foot">
            <Button
              variant="primary"
              onClick={() => {
                editTeam({ city, teamName: team, colorPrimary: t.p, colorSecondary: t.s })
                navigate('hub')
              }}
            >
              ✓ SAVE TEAM
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
