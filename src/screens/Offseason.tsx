import { type CSSProperties } from 'react'
import Button from '../ui/Button'
import { useGame, SALARY_CAP, ROSTER_MAX, capUsed } from '../state/store'
import { overall } from '../game/players'
import type { Player } from '../types'

/** Reveal more of a prospect's rating the better your Scouting facility is. */
function scoutOverall(p: Player, scouting: number): string {
  const ov = overall(p)
  if (scouting >= 4) return String(ov)
  const spread = 5 - scouting // lvl1→4, lvl3→2
  return `${Math.max(1, ov - spread)}–${Math.min(10, ov + spread)}`
}

export default function Offseason() {
  const f = useGame((s) => s.franchise)
  const navigate = useGame((s) => s.navigate)
  const draftPlayer = useGame((s) => s.draftPlayer)
  const signFreeAgent = useGame((s) => s.signFreeAgent)
  const cutPlayer = useGame((s) => s.cutPlayer)
  const commitNextSeason = useGame((s) => s.commitNextSeason)
  if (!f || !f.offseason) return null

  const os = f.offseason
  const used = capUsed(f.roster)
  const room = SALARY_CAP - used
  const scouting = f.facilities.scouting
  const accent = { ['--p']: f.colorPrimary } as CSSProperties

  return (
    <div className="screen offseason-screen">
      <header className="screen-head">
        <h2>OFFSEASON · S{f.season}</h2>
        <div className="cap-meter">
          <span className="cap-k">CAP</span>
          <span className="cap-bar">
            <span
              className="cap-fill"
              style={{ width: `${Math.min(100, (used / SALARY_CAP) * 100)}%` }}
            />
          </span>
          <span className="cap-v">
            {used}/{SALARY_CAP}
          </span>
        </div>
        <Button
          variant="primary"
          className="os-start"
          onClick={() => {
            commitNextSeason()
            navigate('season')
          }}
        >
          START SEASON {f.season + 1} ▶
        </Button>
      </header>

      {os.retired.length > 0 && (
        <div className="os-retired">👋 Retired: {os.retired.join(', ')}</div>
      )}

      <div className="os-body">
        {/* DRAFT */}
        <div className="os-col">
          <div className="os-label">🎓 DRAFT {scouting < 4 && <em>(scouting: ratings fuzzy)</em>}</div>
          <div className="os-cards">
            {os.prospects.map((p) => (
              <div key={p.id} className="os-card" style={accent}>
                <div className="osc-top">
                  <span className="osc-pos">{p.pos}</span>
                  <span className="osc-name">{p.name}</span>
                  <span className="osc-ov">{scoutOverall(p, scouting)}</span>
                </div>
                <div className="osc-meta">Age {p.age} · 🪙{p.salary} cap</div>
                <Button
                  variant="secondary"
                  className="osc-btn"
                  disabled={os.drafted}
                  onClick={() => draftPlayer(p.id)}
                >
                  {os.drafted ? '—' : 'DRAFT'}
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* FREE AGENCY */}
        <div className="os-col">
          <div className="os-label">✍️ FREE AGENTS <em>(room: {room})</em></div>
          <div className="os-cards">
            {os.freeAgents.map((p) => {
              const canSign = f.roster.length < ROSTER_MAX && p.salary <= room
              return (
                <div key={p.id} className="os-card" style={accent}>
                  <div className="osc-top">
                    <span className="osc-pos">{p.pos}</span>
                    <span className="osc-name">{p.name}</span>
                    <span className="osc-ov">{overall(p)}</span>
                  </div>
                  <div className="osc-meta">Age {p.age} · 🪙{p.salary} cap</div>
                  <Button
                    variant="primary"
                    className="osc-btn"
                    disabled={!canSign}
                    onClick={() => signFreeAgent(p.id)}
                  >
                    SIGN
                  </Button>
                </div>
              )
            })}
            {os.freeAgents.length === 0 && <div className="os-empty">All signed.</div>}
          </div>
        </div>

        {/* ROSTER (cut to free cap) */}
        <div className="os-col">
          <div className="os-label">👥 YOUR ROSTER <em>({f.roster.length})</em></div>
          <div className="os-cards roster-cut">
            {f.roster.map((p) => (
              <div key={p.id} className="os-rrow">
                <span className="osc-pos">{p.pos}</span>
                <span className="osc-name">{p.name}</span>
                <span className="osc-ov small">{overall(p)}</span>
                <span className="osc-sal">🪙{p.salary}</span>
                <button
                  className="cut-btn"
                  disabled={f.roster.length <= 5}
                  onClick={() => cutPlayer(p.id)}
                  aria-label="Cut"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
