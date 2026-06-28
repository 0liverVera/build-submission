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
]

export default function NewFranchise() {
  const navigate = useGame((s) => s.navigate)
  const start = useGame((s) => s.startNewFranchise)

  const [coach, setCoach] = useState('')
  const [city, setCity] = useState('')
  const [team, setTeam] = useState('')
  const [theme, setTheme] = useState(0)

  const t = THEMES[theme]
  const crestLetter = (team.trim()[0] || '?').toUpperCase()
  const crestVars = { ['--p']: t.p, ['--s']: t.s } as CSSProperties

  return (
    <div className="screen form-screen">
      <header className="screen-head">
        <Button variant="ghost" className="back" onClick={() => navigate('menu')}>
          ‹
        </Button>
        <h2>NEW FRANCHISE</h2>
      </header>

      <div className="form-body">
        <div className="crest-preview" style={crestVars}>
          <div className="crest">
            <span>{crestLetter}</span>
          </div>
          <div className="crest-name">
            {(city.trim() || 'Riverside') + ' ' + (team.trim() || 'Hoops')}
          </div>
        </div>

        <label className="field">
          <span>Coach Name</span>
          <input
            value={coach}
            onChange={(e) => setCoach(e.target.value)}
            maxLength={16}
            placeholder="Coach"
          />
        </label>
        <label className="field">
          <span>City</span>
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            maxLength={16}
            placeholder="Riverside"
          />
        </label>
        <label className="field">
          <span>Team Name</span>
          <input
            value={team}
            onChange={(e) => setTeam(e.target.value)}
            maxLength={16}
            placeholder="Hoops"
          />
        </label>

        <div className="field">
          <span>Team Colors</span>
          <div className="theme-row">
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

      <div className="form-foot">
        <Button
          variant="primary"
          onClick={() => {
            sfx.confirm()
            start({
              coachName: coach,
              city,
              teamName: team,
              colorPrimary: t.p,
              colorSecondary: t.s,
            })
          }}
        >
          CREATE TEAM ▶
        </Button>
      </div>
    </div>
  )
}
