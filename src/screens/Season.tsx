import Button from '../ui/Button'
import { useGame } from '../state/store'
import { standings } from '../game/league'

/**
 * Season dashboard (Phase 6): standings, your schedule/goal, and the button to
 * play the next game — or, in the offseason, roll into the next season.
 */
export default function Season() {
  const f = useGame((s) => s.franchise)
  const navigate = useGame((s) => s.navigate)
  const startNextSeason = useGame((s) => s.startNextSeason)
  const currentOpponent = useGame((s) => s.currentOpponent)
  if (!f) return null

  const s = f.seasonState
  const player = {
    abbr: f.teamName.slice(0, 3).toUpperCase(),
    name: f.teamName,
    color: f.colorPrimary,
    w: s.wins,
    l: s.losses,
  }
  const table = standings(player, f.league)
  const opp = currentOpponent()

  let cta: React.ReactNode = null
  if (s.phase === 'regular') {
    cta = (
      <div className="season-cta">
        <div className="sc-next">
          Game {s.game + 1} of {s.schedule.length} · vs{' '}
          <b style={{ color: opp?.color }}>
            {opp?.city} {opp?.name}
          </b>
        </div>
        <Button variant="primary" onClick={() => navigate('game')}>
          🏀 PLAY NEXT GAME
        </Button>
      </div>
    )
  } else if (s.phase === 'playoffs') {
    cta = (
      <div className="season-cta">
        <div className="sc-next playoff">
          {s.playoffRound >= 2 ? '🏆 THE FINALS' : 'SEMIFINAL'} · vs{' '}
          <b style={{ color: opp?.color }}>
            {opp?.city} {opp?.name}
          </b>
        </div>
        <Button variant="primary" onClick={() => navigate('game')}>
          ⚔ PLAY {s.playoffRound >= 2 ? 'THE FINALS' : 'SEMIFINAL'}
        </Button>
      </div>
    )
  } else {
    cta = (
      <div className="season-cta">
        <div className="sc-result">{s.lastResult || 'Season complete.'}</div>
        <Button variant="primary" onClick={() => startNextSeason()}>
          ↻ START SEASON {f.season + 1}
        </Button>
      </div>
    )
  }

  const recentHof = f.hallOfFame.slice(-3).reverse()

  return (
    <div className="screen season-screen">
      <header className="screen-head">
        <Button variant="ghost" className="back" onClick={() => navigate('hub')}>
          ‹
        </Button>
        <h2>SEASON {f.season}</h2>
        <span className="season-goal">🎯 {s.goal.label}</span>
      </header>

      {s.lastResult && s.phase !== 'offseason' && (
        <div className="season-banner">{s.lastResult}</div>
      )}

      <div className="season-body">
        <div className="standings">
          <div className="std-title">STANDINGS</div>
          {table.map((r, i) => (
            <div key={r.abbr + i} className={`std-row${r.isPlayer ? ' me' : ''}${i < 4 ? ' playoff' : ''}`}>
              <span className="std-rank">{i + 1}</span>
              <span className="std-dot" style={{ background: r.color }} />
              <span className="std-name">{r.name}</span>
              <span className="std-rec">
                {r.w}-{r.l}
              </span>
            </div>
          ))}
          <div className="std-foot">Top 4 make the playoffs</div>
        </div>

        <div className="season-side">
          {cta}
          {recentHof.length > 0 && (
            <div className="hof">
              <div className="hof-title">🏛️ HALL OF FAME</div>
              {recentHof.map((h, i) => (
                <div key={i} className="hof-row">
                  <span className="hof-name">{h.name}</span>
                  <span className="hof-meta">
                    {h.pos} · OVR {h.overall} · {h.titles}🏆
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
