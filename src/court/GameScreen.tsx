import { useEffect, useRef, useState, type CSSProperties } from 'react'
import CourtGame from './CourtGame'
import { useGame } from '../state/store'
import { sfx } from '../audio/sfx'

/**
 * PHASE 3 — full game flow. A real game vs an invented opponent: 4 quarters,
 * the player's offense alternating with a SIMULATED opponent possession, a live
 * scoreboard + game/shot clocks, buzzer-beater drama, and a final W/L that pays
 * credits and updates the franchise record.
 */

const POSS_PER_TEAM = 3 // offensive possessions per team per quarter
const QUARTER_SECONDS = 120
const TIME_PER_POSS = QUARTER_SECONDS / (POSS_PER_TEAM * 2)

const CITIES = ['Bayview', 'Sunport', 'Ironcliff', 'Lakeside', 'Granite', 'Westend', 'Kingsbury', 'Northgate']
const NAMES = ['Sharks', 'Comets', 'Miners', 'Surge', 'Bolts', 'Wolves', 'Royals', 'Pumas', 'Vipers']
const OPP_COLORS = ['#e8503a', '#3a7be8', '#2dd4bf', '#b86bff', '#ff8a3d', '#56c06a']
const rnd = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]

interface Opp {
  city: string
  name: string
  abbr: string
  color: string
}
function makeOpp(): Opp {
  const name = rnd(NAMES)
  return { city: rnd(CITIES), name, abbr: name.slice(0, 3).toUpperCase(), color: rnd(OPP_COLORS) }
}

function mmss(sec: number) {
  const s = Math.max(0, Math.ceil(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

type Flow = 'play' | 'oppsim' | 'break' | 'final'

export default function GameScreen() {
  const navigate = useGame((s) => s.navigate)
  const franchise = useGame((s) => s.franchise)
  const recordGameResult = useGame((s) => s.recordGameResult)

  const oppRef = useRef<Opp>(makeOpp())
  const opp = oppRef.current

  const [us, setUs] = useState(0)
  const [them, setThem] = useState(0)
  const [quarter, setQuarter] = useState(1)
  const [clock, setClock] = useState(QUARTER_SECONDS)
  const [shotClock, setShotClock] = useState(14)
  const [flow, setFlow] = useState<Flow>('play')
  const [possKey, setPossKey] = useState(0)

  // refs mirror state for use inside async callbacks
  const usRef = useRef(0)
  const themRef = useRef(0)
  const clockRef = useRef(QUARTER_SECONDS)
  const possRef = useRef(0)
  const quarterRef = useRef(1)

  const teamAbbr = (franchise?.teamName ?? 'HOM').slice(0, 3).toUpperCase()

  function advanceClock() {
    const next = Math.max(0, clockRef.current - (TIME_PER_POSS + (Math.random() * 6 - 3)))
    clockRef.current = next
    setClock(next)
    possRef.current += 1
  }

  function quarterOver() {
    return clockRef.current <= 0 || possRef.current >= POSS_PER_TEAM * 2
  }

  function endPlayerPossession(points: number) {
    usRef.current += points
    setUs(usRef.current)
    advanceClock()
    if (quarterOver()) endQuarter()
    else setFlow('oppsim')
  }

  function endOppPossession(points: number) {
    themRef.current += points
    setThem(themRef.current)
    advanceClock()
    if (quarterOver()) endQuarter()
    else {
      setShotClock(14)
      setPossKey((k) => k + 1)
      setFlow('play')
    }
  }

  function endQuarter() {
    if (quarterRef.current >= 4) {
      setFlow('final')
    } else {
      setFlow('break')
    }
  }

  function nextQuarter() {
    quarterRef.current += 1
    possRef.current = 0
    clockRef.current = QUARTER_SECONDS
    setQuarter(quarterRef.current)
    setClock(QUARTER_SECONDS)
    setShotClock(14)
    setPossKey((k) => k + 1)
    setFlow('play')
  }

  const clutch = clock <= 12 && Math.abs(us - them) <= 5

  const headVars = {
    ['--p']: franchise?.colorPrimary ?? '#ff8a3d',
  } as CSSProperties
  const oppVars = { ['--p']: opp.color } as CSSProperties

  return (
    <div className="court-wrap">
      <div className="scoreboard">
        <button className="court-back" onClick={() => navigate('hub')} aria-label="Back">
          ‹
        </button>
        <div className="sb-team" style={headVars}>
          <span className="sb-abbr">{teamAbbr}</span>
          <span className="sb-score">{us}</span>
        </div>
        <div className="sb-center">
          <span className="sb-q">Q{quarter}</span>
          <span className={`sb-clock${clutch ? ' clutch' : ''}`}>{mmss(clock)}</span>
          <span className="sb-shot">:{shotClock}</span>
        </div>
        <div className="sb-team opp" style={oppVars}>
          <span className="sb-score">{them}</span>
          <span className="sb-abbr">{opp.abbr}</span>
        </div>
      </div>

      <div className="court-body">
        {flow === 'play' && (
          <CourtGame
            key={possKey}
            matchMode
            onResult={(pts) => endPlayerPossession(pts)}
            onShotClock={(s) => setShotClock(s)}
          />
        )}
        {flow === 'oppsim' && <OppSim opp={opp} onDone={endOppPossession} />}
        {flow === 'break' && (
          <QuarterBreak
            quarter={quarter}
            us={us}
            them={them}
            home={teamAbbr}
            opp={opp.abbr}
            onContinue={nextQuarter}
          />
        )}
        {flow === 'final' && (
          <FinalCard
            us={us}
            them={them}
            home={teamAbbr}
            opp={opp}
            onDone={(win, credits) => {
              recordGameResult(win, credits)
              navigate('hub')
            }}
          />
        )}
      </div>
    </div>
  )
}

/** A quick, tense simulated opponent possession (Section 2 watch-and-react). */
function OppSim({ opp, onDone }: { opp: Opp; onDone: (pts: number) => void }) {
  const [line, setLine] = useState(`${opp.abbr} bring it up…`)
  const [kind, setKind] = useState<'neutral' | 'score' | 'stop'>('neutral')

  useEffect(() => {
    const actions = ['drives the lane', 'pulls up from deep', 'works the post', 'runs the pick & roll']
    const makes = Math.random() < 0.47
    const three = makes && Math.random() < 0.33
    const pts = makes ? (three ? 3 : 2) : 0
    const timers: number[] = []
    timers.push(
      window.setTimeout(() => {
        setLine(`${opp.abbr} ${rnd(actions)}…`)
        sfx.dribble()
      }, 450),
    )
    timers.push(
      window.setTimeout(() => {
        if (makes) {
          setLine(three ? `KNOCKS DOWN A THREE! +3` : `SCORES! +2`)
          setKind('score')
          sfx.make()
        } else {
          setLine(`MISS — you grab the board!`)
          setKind('stop')
          sfx.swish()
        }
      }, 1450),
    )
    timers.push(window.setTimeout(() => onDone(pts), 2500))
    return () => timers.forEach(clearTimeout)
  }, [opp, onDone])

  const oppVars = { ['--p']: opp.color } as CSSProperties
  return (
    <div className="oppsim">
      <div className="oppsim-crest" style={oppVars}>
        {opp.name[0]}
      </div>
      <div className={`oppsim-line ${kind}`}>{line}</div>
      <div className="oppsim-sub">{opp.city} {opp.name} on offense</div>
    </div>
  )
}

function QuarterBreak({
  quarter,
  us,
  them,
  home,
  opp,
  onContinue,
}: {
  quarter: number
  us: number
  them: number
  home: string
  opp: string
  onContinue: () => void
}) {
  return (
    <div className="break-card">
      <div className="break-title">END OF Q{quarter}</div>
      <div className="break-score">
        <span>{home}</span>
        <b>
          {us} – {them}
        </b>
        <span>{opp}</span>
      </div>
      <button
        className="btn primary"
        onClick={() => {
          sfx.tap()
          onContinue()
        }}
      >
        START Q{quarter + 1} ▶
      </button>
    </div>
  )
}

function FinalCard({
  us,
  them,
  home,
  opp,
  onDone,
}: {
  us: number
  them: number
  home: string
  opp: Opp
  onDone: (win: boolean, credits: number) => void
}) {
  const win = us > them
  const credits = 20 + (win ? 30 : 0) + Math.floor(us / 4)
  useEffect(() => {
    if (win) sfx.three()
    else sfx.buzzer()
  }, [win])
  return (
    <div className="break-card final">
      <div className={`final-title ${win ? 'win' : 'loss'}`}>{win ? 'WIN!' : 'LOSS'}</div>
      <div className="break-score">
        <span>{home}</span>
        <b>
          {us} – {them}
        </b>
        <span>{opp.abbr}</span>
      </div>
      <div className="final-reward">🪙 +{credits} credits</div>
      <button className="btn primary" onClick={() => onDone(win, credits)}>
        CONTINUE ▶
      </button>
    </div>
  )
}
