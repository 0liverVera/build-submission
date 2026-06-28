import { type CSSProperties } from 'react'
import Button from '../ui/Button'
import { useGame } from '../state/store'
import { overall, moraleFace } from '../game/players'
import type { Player } from '../types'

function PlayerCard({ p, color }: { p: Player; color: string }) {
  const ov = overall(p)
  const initials = p.name
    .split(' ')
    .map((w) => w[0])
    .join('')
  const avatarVars = { ['--p']: color } as CSSProperties
  return (
    <div className="pcard">
      <div className="pcard-top">
        <div className="pavatar" style={avatarVars}>
          {initials}
          <span className="pmorale">{moraleFace(p.morale)}</span>
        </div>
        <div className="pcard-id">
          <div className="pname">{p.name}</div>
          <div className="pmeta">
            {p.pos} · Age {p.age}
          </div>
        </div>
        <div className="povr">{ov}</div>
      </div>
      <div className="pstats">
        <Stat k="SHO" v={p.shooting} />
        <Stat k="SPD" v={p.speed} />
        <Stat k="INS" v={p.inside} />
        <Stat k="DEF" v={p.defense} />
      </div>
    </div>
  )
}

function Stat({ k, v }: { k: string; v: number }) {
  return (
    <div className="pstat">
      <span className="ps-k">{k}</span>
      <span className="ps-bar">
        <span className="ps-fill" style={{ width: `${v * 10}%` }} />
      </span>
      <span className="ps-v">{v}</span>
    </div>
  )
}

export default function Roster() {
  const f = useGame((s) => s.franchise)
  const navigate = useGame((s) => s.navigate)
  if (!f) return null
  const starters = f.roster.slice(0, 5)
  const bench = f.roster.slice(5)
  const color = f.colorPrimary

  return (
    <div className="screen roster-screen">
      <header className="screen-head">
        <Button variant="ghost" className="back" onClick={() => navigate('hub')}>
          ‹
        </Button>
        <h2>ROSTER</h2>
        <span className="roster-sub">
          {f.city} {f.teamName}
        </span>
      </header>

      <div className="roster-body">
        <div className="roster-label">STARTERS</div>
        <div className="roster-row starters">
          {starters.map((p) => (
            <PlayerCard key={p.id} p={p} color={color} />
          ))}
        </div>
        <div className="roster-label">BENCH</div>
        <div className="roster-row bench">
          {bench.map((p) => (
            <PlayerCard key={p.id} p={p} color={color} />
          ))}
        </div>
      </div>
    </div>
  )
}
