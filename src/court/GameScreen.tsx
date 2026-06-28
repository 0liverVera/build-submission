import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { motion } from 'framer-motion'
import CourtGame from './CourtGame'
import { useGame } from '../state/store'
import { teamDefense } from '../game/players'
import { sfx } from '../audio/sfx'

/** Counts a number up to a target with overshoot-free ease. */
function useCountUp(target: number, dur = 0.8) {
  const [v, setV] = useState(0)
  useEffect(() => {
    let raf = 0
    const t0 = performance.now()
    const step = (t: number) => {
      const k = Math.min((t - t0) / (dur * 1000), 1)
      setV(Math.round(target * (1 - Math.pow(1 - k, 3))))
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, dur])
  return v
}

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
  offense: number // 1–10, drives their sim scoring
}
function makeOpp(): Opp {
  const name = rnd(NAMES)
  return {
    city: rnd(CITIES),
    name,
    abbr: name.slice(0, 3).toUpperCase(),
    color: rnd(OPP_COLORS),
    offense: 4 + Math.floor(Math.random() * 4), // 4–7
  }
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
  const triggerPressEvent = useGame((s) => s.triggerPressEvent)
  const advanceSeason = useGame((s) => s.advanceSeason)

  // Opponent = this season's scheduled / playoff foe (fallback to random).
  const oppRef = useRef<Opp>(useGame.getState().currentOpponent() ?? makeOpp())
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
  const roster = franchise?.roster ?? []
  const ratings = roster.slice(0, 5).map((p) => ({
    shooting: p.shooting,
    speed: p.speed,
    inside: p.inside,
  }))
  const ourDefense = teamDefense(roster)
  const avgMorale = roster.length
    ? roster.slice(0, 5).reduce((s, p) => s + p.morale, 0) / Math.min(5, roster.length)
    : 60
  const moraleMult = Math.max(0.9, Math.min(1.12, 1 + (avgMorale - 60) / 300))

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
            ratings={ratings}
            moraleMult={moraleMult}
            clutch={quarter >= 4 && clock <= 30 && Math.abs(us - them) <= 6}
            onResult={(pts) => endPlayerPossession(pts)}
            onShotClock={(s) => setShotClock(s)}
          />
        )}
        {flow === 'oppsim' && (
          <OppSim opp={opp} ourDefense={ourDefense} onDone={endOppPossession} />
        )}
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
            fanInterest={franchise?.fanInterest ?? 50}
            onDone={(win, credits) => {
              recordGameResult(win, credits)
              advanceSeason(win)
              const phase = useGame.getState().franchise?.seasonState.phase
              if (phase === 'regular' && triggerPressEvent()) navigate('press')
              else navigate('season')
            }}
          />
        )}
      </div>
    </div>
  )
}

/** A quick, tense simulated opponent possession (Section 2 watch-and-react). */
function OppSim({
  opp,
  ourDefense,
  onDone,
}: {
  opp: Opp
  ourDefense: number
  onDone: (pts: number) => void
}) {
  const [line, setLine] = useState(`${opp.abbr} bring it up…`)
  const [kind, setKind] = useState<'neutral' | 'score' | 'stop'>('neutral')
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  useEffect(() => {
    const actions = ['drives the lane', 'pulls up from deep', 'works the post', 'runs the pick & roll']
    // Opponent offense vs our team defense decides the make chance.
    const makeProb = Math.max(0.2, Math.min(0.72, 0.46 + (opp.offense - ourDefense) * 0.035))
    const makes = Math.random() < makeProb
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
    timers.push(window.setTimeout(() => onDoneRef.current(pts), 2500))
    return () => timers.forEach(clearTimeout)
    // run once per mounted possession; onDone is read via ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
  fanInterest,
  onDone,
}: {
  us: number
  them: number
  home: string
  opp: Opp
  fanInterest: number
  onDone: (win: boolean, credits: number) => void
}) {
  const win = us > them
  const credits = 20 + (win ? 30 : 0) + Math.floor(us / 4) + Math.floor(fanInterest / 10)
  const shownCredits = useCountUp(credits)
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
      <div className="final-reward">
        <span className="final-coins">
          {[0, 1, 2, 3, 4].map((i) => (
            <motion.span
              key={i}
              className="fc-coin"
              initial={{ x: 0, y: 6, opacity: 0 }}
              animate={{ x: (i - 2) * 22, y: [-6, -34, -16], opacity: [0, 1, 0] }}
              transition={{ duration: 0.8, delay: 0.1 + i * 0.07 }}
            >
              🪙
            </motion.span>
          ))}
        </span>
        🪙 +{shownCredits} credits
      </div>
      <button className="btn primary" onClick={() => onDone(win, credits)}>
        CONTINUE ▶
      </button>
    </div>
  )
}
