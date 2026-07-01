import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, Pressable, StyleSheet, type LayoutChangeEvent } from 'react-native'
import {
  Svg,
  Rect,
  Line,
  Circle,
  Ellipse,
  Path,
  Defs,
  Stop,
  G,
  Polygon,
  RadialGradient,
  LinearGradient as SvgLinearGradient,
  Text as SvgText,
} from 'react-native-svg'
import { GestureDetector, Gesture } from 'react-native-gesture-handler'
import Animated, {
  useSharedValue,
  useDerivedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  ZoomIn,
  FadeOut,
  withTiming,
  withDelay,
  withSequence,
  withSpring,
  withRepeat,
  Easing,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { useGame } from '../state/store'
import { sfx } from '../audio/sfx'
import { C, PIXEL, T, FONT, R, OUTLINE, SHADOW } from '../theme'
import { Heading, Panel, CandyButton } from '../ui/kit'
import { Character, VB_TOP, VB_H } from './CharacterView'
import { computePose, restPose, type Pose, type AnimState, type PassKind } from './charAnim'
import { appearanceFromId, type CharacterAppearance } from './character'

// Flag: animated modular characters in-game. Flip to false to restore the original
// flat "blob" players instantly (zero gameplay change either way).
const USE_CHARACTERS = true
// Visual-only render scale for characters (gameplay radius PR is unchanged). Tune here.
// 1.0 = original pre-shrink size; 0.85 ≈ bigger than the small version, not the biggest.
const CHAR_SCALE = 0.85
// Overall hoop-assembly size (rim stays ~0.47× player height by construction). Tune.
const HOOP_SCALE = 1.0
// ---- Enemy difficulty knobs (both scale further by oppSkill = opponent rating) ----
const ENEMY_STEAL = 0.42 // base on-ball steal chance when tight to the handler
const ENEMY_INTERCEPT = 0.16 // base chance a defender jumps a home passing lane
const ENEMY_MAKE = 1.18 // enemy shooting multiplier

/**
 * Full-court controllable 5v5 — native (Expo) port of the web canvas game.
 * The simulation math/AI is unchanged; rendering is SVG (court) + Reanimated
 * Views (players/ball), input is a gesture-handler joystick + Pressable buttons.
 */

interface P {
  x: number
  y: number
  team: 'home' | 'away'
}
type Team = 'home' | 'away'

// 5-out half-court spacing relative to the attacking rim. dx = fraction of W
// toward center; dy = fraction of H from mid-court. PG up top, two wings, two
// corners/posts — players occupy distinct areas instead of crowding the ball.
const SPOTS = [
  [-0.34, 0.0], // PG — top of the key
  [-0.27, -0.3], // SG — left wing
  [-0.27, 0.3], // SF — right wing
  [-0.13, -0.34], // PF — left corner / short post
  [-0.13, 0.34], // C — right corner / short post
]

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by)
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax
  const dy = by - ay
  const l2 = dx * dx + dy * dy
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0
  t = clamp(t, 0, 1)
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t))
}

interface Controls {
  sprint: boolean
  charging: boolean
  release: boolean
  pass: boolean
  switchD: boolean
  steal: boolean
  block: boolean
}

const mmss = (s: number) => {
  const v = Math.max(0, Math.ceil(s))
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`
}

type BtnDef = {
  key: string
  label: string
  icon: string
  colors: { a: string; b: string; band: string; fg: string }
  size: number
  x: number
  y: number
  onIn: () => void
  onOut?: () => void
}
const BTN_GOLD = { a: '#F8DC86', b: T.amber, band: T.amberDeep, fg: T.ink }
const BTN_BLUE = { a: '#5CBAF0', b: T.teamA, band: T.teamADeep, fg: T.white }
const BTN_RED = { a: '#F58A8A', b: T.teamB, band: T.teamBDeep, fg: T.white }
const BTN_GREEN = { a: '#54D78E', b: T.green, band: T.greenDeep, fg: T.white }
const prFor = (h: number) => Math.max(9, h * 0.046)

// Snapshot the sim publishes to the UI thread each frame.
type Snap = {
  home: { x: number; y: number }[]
  away: { x: number; y: number }[]
  ball: { x: number; y: number; z: number; show: boolean; spin: number }
  active: number
  activeShow: boolean
  charging: boolean
  charge: number
  blockOn: boolean
  joy: { on: boolean; bx: number; by: number; vx: number; vy: number }
  shakeX: number
  shakeY: number
  // subtle camera offset that follows the action
  camX: number
  camY: number
  // jump-shot lift (0..1) applied to the current shooter (any team/index)
  shooterLift: number
  shooterTeam: Team
  shooterIdx: number
  // shot meter green sweet-spot (0..1 along the bar)
  meterCenter: number
  meterHalf: number
  // release flash: 0..1 decaying; kind 0 none / 1 perfect / 2 good / 3 miss
  meterFlash: number
  meterFlashKind: number
  // tip-off jump (0..1) for the two center-circle leapers
  tipUp: number
  tipH: number
  tipA: number
  // net ripple amplitude (0..1, decaying) per rim + a shared time base for the sway
  netL: number
  netR: number
  netT: number
  // per-player animation pose (locomotion/dribble), computed in the sim each frame
  homePoses: Pose[]
  awayPoses: Pose[]
}

const EMPTY: Snap = {
  home: Array.from({ length: 5 }, () => ({ x: -99, y: -99 })),
  away: Array.from({ length: 5 }, () => ({ x: -99, y: -99 })),
  ball: { x: -99, y: -99, z: 0, show: false, spin: 0 },
  active: 0,
  activeShow: true,
  charging: false,
  charge: 0,
  blockOn: false,
  joy: { on: false, bx: 0, by: 0, vx: 0, vy: 0 },
  shakeX: 0,
  shakeY: 0,
  camX: 0,
  camY: 0,
  shooterLift: 0,
  shooterTeam: 'home',
  shooterIdx: 0,
  meterCenter: 0.5,
  meterHalf: 0.15,
  meterFlash: 0,
  meterFlashKind: 0,
  tipUp: 0,
  tipH: -1,
  tipA: -1,
  netL: 0,
  netR: 0,
  netT: 0,
  homePoses: Array.from({ length: 5 }, () => restPose()),
  awayPoses: Array.from({ length: 5 }, () => restPose()),
}

export default function Court5v5({ matchMode = false }: { matchMode?: boolean }) {
  const navigate = useGame((s) => s.navigate)
  const franchise = useGame((s) => s.franchise)
  const insets = useSafeAreaInsets()

  const controls = useRef<Controls>({
    sprint: false,
    charging: false,
    release: false,
    pass: false,
    switchD: false,
    steal: false,
    block: false,
  })
  const joyRef = useRef({ on: false, bx: 0, by: 0, vx: 0, vy: 0 })
  // ONE multi-touch surface tracks every finger by id and routes it to the
  // joystick (left side) or a button (hit-test). No per-gesture arbitration, so
  // moving + pressing buttons works together. down = which buttons look pressed.
  const joyTouchId = useRef<number | null>(null)
  const btnTouches = useRef<Map<number, BtnDef>>(new Map())
  const buttonsRef = useRef<BtnDef[]>([])
  const geomRef = useRef({ W: 0, maxR: 0 })
  const [down, setDown] = useState<Record<string, boolean>>({})

  const [dims, setDims] = useState({ w: 0, h: 0 })
  const [msg, setMsg] = useState<{ text: string; kind: string; id: number }>({ text: '', kind: '', id: 0 })
  const [onDefense, setOnDefense] = useState(false)
  const [hud, setHud] = useState({
    us: 0,
    them: 0,
    quarter: 1,
    clock: 0,
    shot: 0,
    homeAbbr: 'HOM',
    awayAbbr: 'OPP',
    activeName: '',
    activePos: '',
    activePts: 0,
    auto: false,
  })
  const [final, setFinal] = useState<{
    us: number
    them: number
    win: boolean
    mvpName: string
    mvpPts: number
  } | null>(null)
  const [rematchKey, setRematchKey] = useState(0)

  const sv = useSharedValue<Snap>(EMPTY)

  const opp = useMemo(() => (matchMode ? useGame.getState().currentOpponent() : null), [matchMode])
  const homeColor = franchise?.colorPrimary ?? C.orange
  const awayColor = (matchMode && opp?.color) || C.danger
  const oppColorUi = opp?.color ?? C.danger

  // Names for the labels under each player.
  const { homeNames, homePos, awayLabel } = useMemo(() => {
    const starters = (franchise?.roster ?? []).slice(0, 5)
    const shortName = (full?: string) => {
      if (!full) return 'Player'
      const parts = full.split(' ')
      return parts.length > 1 ? `${parts[0][0]}. ${parts[parts.length - 1]}` : full
    }
    return {
      homeNames: Array.from({ length: 5 }, (_, i) => shortName(starters[i]?.name)),
      homePos: Array.from({ length: 5 }, (_, i) => starters[i]?.pos ?? ''),
      awayLabel: opp?.abbr ?? 'OPP',
    }
  }, [franchise, opp])

  // Deterministic look per player (stable across games), from their roster id.
  const { homeLooks, awayLooks } = useMemo(() => {
    const starters = (franchise?.roster ?? []).slice(0, 5)
    const oppAbbr = opp?.abbr ?? 'OPP'
    return {
      homeLooks: Array.from({ length: 5 }, (_, i) =>
        appearanceFromId(starters[i]?.id ?? `home-${i}`, { jerseyColor: homeColor, number: i + 1, pos: starters[i]?.pos }),
      ),
      awayLooks: Array.from({ length: 5 }, (_, i) =>
        appearanceFromId(`${oppAbbr}-away-${i}`, { jerseyColor: awayColor, number: i + 1 }),
      ),
    }
  }, [franchise, opp, homeColor, awayColor])

  const W = dims.w
  const H = dims.h
  const pr = prFor(H || 1)
  const maxR = Math.min(W || 1, H || 1) * 0.12

  useEffect(() => {
    if (W < 10 || H < 10) return

    const st0 = useGame.getState()
    const starters = (st0.franchise?.roster ?? []).slice(0, 5)
    const homeShoot = starters.length ? starters.reduce((a, p) => a + p.shooting, 0) / starters.length : 6
    const avgMorale = starters.length ? starters.reduce((a, p) => a + p.morale, 0) / starters.length : 60
    const opp0 = matchMode ? st0.currentOpponent() : null
    const homeShootF = (0.82 + homeShoot * 0.03) * (0.9 + avgMorale * 0.0016)
    const awayShootF = 0.9 + (opp0?.offense ?? 6) * 0.035
    // opponent skill 0..1 from team rating — drives tighter D, smarter steals, spacing
    const oppSkill = clamp(((opp0?.offense ?? 6) - 3) / 5, 0.35, 1)
    const homeAbbr = (st0.franchise?.teamName ?? 'HOM').slice(0, 3).toUpperCase()
    const awayAbbr = opp0?.abbr ?? 'OPP'
    const shortName = (full?: string) => {
      if (!full) return 'Player'
      const parts = full.split(' ')
      return parts.length > 1 ? `${parts[0][0]}. ${parts[parts.length - 1]}` : full
    }
    const homeNamesL = Array.from({ length: 5 }, (_, i) => shortName(starters[i]?.name))
    const homePosL = Array.from({ length: 5 }, (_, i) => starters[i]?.pos ?? '')
    const homePoints = [0, 0, 0, 0, 0]

    // ----- geometry -----
    const band = H * 0.07
    const mx = W * 0.035
    const rimY = H * 0.5
    const leftRimX = W * 0.1
    const rightRimX = W * 0.9
    // 3pt radius: capped so the arc stays inside the court vertically
    // (≤ distance from rim to the sideline) and isn't a giant half-circle.
    const arcR = Math.min(W * 0.2, (H * 0.5 - H * 0.07) * 0.9)
    const PR = prFor(H)
    const MAXR = Math.min(W, H) * 0.12
    const SPEED = H * 0.3
    const AISPEED = H * 0.24

    const inX = (x: number) => clamp(x, mx + PR, W - mx - PR)
    const inY = (y: number) => clamp(y, band + PR, H - band - PR)
    const atkX = (team: Team) => (team === 'home' ? rightRimX : leftRimX)
    const offSpot = (i: number, team: Team) => {
      const rx = atkX(team)
      const d = team === 'home' ? 1 : -1
      return { x: rx + d * SPOTS[i][0] * W, y: H * 0.5 + SPOTS[i][1] * H }
    }

    const home: P[] = Array.from({ length: 5 }, () => ({ x: 0, y: 0, team: 'home' as Team }))
    const away: P[] = Array.from({ length: 5 }, () => ({ x: 0, y: 0, team: 'away' as Team }))
    let active = 0
    let tipHomeIdx = 4
    let tipAwayIdx = 4
    const placeFormation = () => {
      home.forEach((p, i) => {
        const s = offSpot(i, 'home')
        p.x = s.x
        p.y = s.y
      })
      away.forEach((p, i) => {
        const man = home[i]
        p.x = man.x + (rightRimX - man.x) * 0.34
        p.y = man.y + (rimY - man.y) * 0.34
      })
    }
    placeFormation()
    // the best leaper on each side contests the tip (use the "inside"/size rating)
    tipHomeIdx = 0
    for (let i = 1; i < starters.length; i++)
      if ((starters[i]?.inside ?? 0) > (starters[tipHomeIdx]?.inside ?? 0)) tipHomeIdx = i
    tipAwayIdx = 4
    // line the leapers up at the center circle for the opening tip
    home[tipHomeIdx].x = W / 2 - PR * 1.3
    home[tipHomeIdx].y = rimY
    away[tipAwayIdx].x = W / 2 + PR * 1.3
    away[tipAwayIdx].y = rimY

    const cutUntil = new Array(5).fill(0)
    let nextCutAt = 0
    const awayCut = new Array(5).fill(0)
    let awayNextCut = 0

    // ---- per-player character animation state (locomotion/dribble) ----
    let lastPubNow = 0
    const prevHX = new Array(5).fill(0)
    const prevHY = new Array(5).fill(0)
    const prevAX = new Array(5).fill(0)
    const prevAY = new Array(5).fill(0)
    const homeAnim: AnimState[] = new Array(5).fill('idle')
    const awayAnim: AnimState[] = new Array(5).fill('idle')
    const homeAnimT = new Array(5).fill(0)
    const awayAnimT = new Array(5).fill(0)
    const homeFace = new Array(5).fill(1) as (1 | -1)[]
    const awayFace = new Array(5).fill(-1) as (1 | -1)[]

    // x,y = court position; z = height; vx,vy,vz = velocity for loose-ball physics
    const ball = { x: 0, y: 0, z: 0, t: 0, dur: 0.7, peak: 60, vx: 0, vy: 0, vz: 0 }
    let looseT = 0 // time the ball has been a live loose ball
    let camX = 0 // smoothed camera offset following the action
    let camY = 0
    let possession: Team = 'home'
    let awayHandler = 0
    let awayPossStart = 0
    let awayThinkAt = 0
    // hysteresis flags so off-ball behaviour doesn't flip-flop exactly on the arc
    let homeDriving = false
    let awayDrivingState = false
    let shooterLift = 0 // 0..1 jump height of the home shooter while charging
    let ballSpin = 0 // accumulated ball rotation (degrees) for animation
    // Shot meter (recomputed when a shot starts): green sweet-spot center/half-
    // width (0..1 along the bar) and fill time, all from distance + rating.
    let meterCenter = 0.5
    let meterHalf = 0.15
    let meterFill = 1.0 // seconds (slow-mo scaled) to fill the bar 0→1
    let meterFlash = 0 // release flash, decays
    let meterFlashKind = 0 // 1 perfect / 2 good / 3 miss
    let awayStealAt = 0
    let stealCd = 0
    let blockUntil = 0
    // steal/block reworks: recovery penalties + per-player swipe/jump animation tags
    let stealRecover = 0 // your defender is a step slow after a missed steal
    let blockRecover = 0 // ...and after a mistimed block
    let blockJumpStart = -1 // when the current contest jump began (for timing)
    let stealAnimTeam: Team = 'home'
    let stealAnimIdx = -1
    let stealAnimStart = -1
    let blockAnimIdx = -1
    let blockAnimStart = -1
    // FIFA-style auto-play: after a moment of no input the AI takes over your active
    // player too (drives/shoots/passes on O, guards/steals on D); any touch hands back
    const IDLE_TAKEOVER = 1.7 // seconds of no input before the CPU takes over (tunable)
    let lastInputAt = 0
    let homeThinkAt = 0
    let homeStealAt = 0
    let autoOn = false // current auto-play state (mirrored to the HUD badge)
    let phase:
      | 'tipoff'
      | 'live'
      | 'passing'
      | 'windup'
      | 'shooting'
      | 'resolved'
      | 'loose'
      | 'break'
      | 'gameover' = 'tipoff'
    let tipT = 0
    let breakT = 0
    let overT = 0
    let tipUp = 0 // 0..1 jump height of the two tip-off jumpers
    let tipTapped = false // did the user time the jump?
    let tipTapT = 0
    let tipPrompted = false
    let possArrow: Team = 'home' // alternates possession at quarter breaks
    let charge = 0
    let stamina = 1
    let netFlash = 0
    let netSwish = 0
    let netJiggleL = 0 // net ripple on the left rim (0..1, decays), kicked on contact
    let netJiggleR = 0 // net ripple on the right rim
    let crowdJump = 0
    let shake = 0
    let now = 0
    let resolveAt = 0
    let t = 0

    const shotFrom = { x: 0, y: 0 }
    const land = { x: 0, y: 0 }
    let made = false
    let shotKind: '2' | '3' | 'layup' = '2'
    let lastRimX = 0
    // miss readout for the player's shot: custom callout + whether it was an airball
    let shotMissText = ''
    let shotMissKind = 'miss'
    let shotAir = false
    // Pass animation: ball flies from a fixed start point to a (live) target
    // player, then runs a completion callback. Used for passes AND interceptions
    // (target = the defender that picks it off) so both animate smoothly.
    let passSX = 0
    let passSY = 0
    let passTarget: { x: number; y: number } | null = null
    let passT = 0
    let passDur = 0.4
    let passByHome = true
    let passDone: () => void = () => {}
    // passer animation tag (distance-scaled pass played by that player's character)
    let passerTeam: Team = 'home'
    let passerIdx = -1
    let passKindG: PassKind = 'chest'
    let passAnimStart = -1
    let passAnimDur = 0.25
    // direction the user's player is "facing" (last joystick direction); the
    // home rim is to the right, so default facing forward.
    let facingX = 1
    let facingY = 0
    const passDuration = (ax: number, ay: number, bx: number, by: number) =>
      clamp(dist(ax, ay, bx, by) / (W * 0.75), 0.45, 0.95)
    function startPass(src: P, dst: { x: number; y: number }, byHome: boolean, onDone: () => void) {
      passSX = src.x
      passSY = src.y
      passTarget = dst
      passByHome = byHome
      passT = 0
      passDur = passDuration(src.x, src.y, dst.x, dst.y)
      passDone = onDone
      lastTouch = byHome ? 'home' : 'away'
      // tag the passer so its character plays a distance-scaled pass animation
      const fArr = byHome ? homeFace : awayFace
      const idx = (byHome ? home : away).indexOf(src)
      const d = dist(src.x, src.y, dst.x, dst.y)
      passerTeam = byHome ? 'home' : 'away'
      passerIdx = idx
      passKindG = d < W * 0.16 ? 'short' : d < W * 0.4 ? 'chest' : 'long'
      passAnimDur = passKindG === 'short' ? 0.2 : passKindG === 'chest' ? 0.25 : 0.35
      passAnimStart = now
      if (idx >= 0) fArr[idx] = dst.x >= src.x ? 1 : -1
      phase = 'passing'
      sfx.pass()
    }

    // Jump-shot wind-up (AI): plant → rise → hang (airtime) → release.
    let windupT = 0
    let windupDur = 0.6
    let shotTeam: Team = 'home'
    let shotIdx = 0
    let pendingShooter: P | null = null
    let pendingRx = 0
    let pendingInfo: ReturnType<typeof shotInfo> | null = null
    let awaySettleUntil = 0 // after catching/rebounding, settle before shooting

    const QUARTER_SECONDS = 90 // length of each HALF (2 halves per game)
    const SHOT_CLOCK = 20
    let us = 0
    let them = 0
    let quarter = 1
    let gameClock = QUARTER_SECONDS
    let shotClock = SHOT_CLOCK
    let ended = false
    let prevPossession: Team = 'home'
    let lastTouch: Team = 'home' // team that last touched the ball (for OOB calls)
    let lastHudKey = ''

    const result = (text: string, kind: string) => setMsg((m) => ({ text, kind, id: m.id + 1 }))

    const nearestDist = (p: P, arr: P[]) => {
      let best = Infinity
      for (const d of arr) best = Math.min(best, dist(p.x, p.y, d.x, d.y))
      return best
    }
    const timingFactor = (c: number) => {
      if (c >= 0.78 && c <= 0.95) return 1.18
      const dd = Math.min(Math.abs(c - 0.78), Math.abs(c - 0.95))
      return Math.max(0.6, 1.18 - dd * 1.6)
    }
    function shotInfo(p: P, defenders: P[], rx: number) {
      const d = dist(p.x, p.y, rx, rimY)
      const layup = d < PR * 4.2
      const three = !layup && d > arcR
      const open = nearestDist(p, defenders) > PR * 4
      const baseP = layup ? 0.8 : three ? 0.42 : 0.56
      return { d, layup, three, open, baseP }
    }
    function flipToHome() {
      possession = 'home'
      active = 0
      setOnDefense(false)
      facingX = 1 // face the attacking rim by default
      facingY = 0
      lastTouch = 'home'
      phase = 'live'
    }
    function flipToAway(handlerIdx: number) {
      possession = 'away'
      awayHandler = handlerIdx
      awayPossStart = now
      awayThinkAt = now + 0.6
      awaySettleUntil = now + 0.7
      let best = 0
      let bd = Infinity
      for (let i = 0; i < home.length; i++) {
        const d = dist(home[i].x, home[i].y, away[handlerIdx].x, away[handlerIdx].y)
        if (d < bd) {
          bd = d
          best = i
        }
      }
      active = best
      lastTouch = 'away'
      setOnDefense(true)
    }
    // Loose ball that lands at (x,y): whoever is closest grabs it.
    function looseBallAt(x: number, y: number) {
      let bestIdx = 0
      let bestHome = true
      let bd = Infinity
      for (let i = 0; i < home.length; i++) {
        const d = dist(home[i].x, home[i].y, x, y)
        if (d < bd) {
          bd = d
          bestIdx = i
          bestHome = true
        }
      }
      for (let i = 0; i < away.length; i++) {
        const d = dist(away[i].x, away[i].y, x, y)
        if (d < bd) {
          bd = d
          bestIdx = i
          bestHome = false
        }
      }
      if (bestHome) {
        possession = 'home'
        active = bestIdx
        setOnDefense(false)
      } else {
        flipToAway(bestIdx)
      }
      phase = 'live'
    }
    // knock the ball loose with a bouncing velocity → live scramble (steal/block)
    function knockLoose(x: number, y: number) {
      ball.x = x
      ball.y = y
      ball.z = PR * 0.9
      ball.vx = (Math.random() * 2 - 1) * H * 0.3
      ball.vy = (Math.random() * 2 - 1) * H * 0.3
      ball.vz = H * 0.35
      looseT = 0
      phase = 'loose'
    }
    function doPass() {
      const a = home[active]
      // pick the teammate best lined up with the way the player is facing
      let target = -1
      let bestScore = -Infinity
      for (let i = 0; i < home.length; i++) {
        if (i === active) continue
        const dx = home[i].x - a.x
        const dy = home[i].y - a.y
        const d = Math.hypot(dx, dy) || 1
        const aligned = (dx / d) * facingX + (dy / d) * facingY // -1..1
        if (aligned < 0.35) continue // not in the direction we're facing
        const score = aligned * 1.5 - d / W // favour aligned, then nearer
        if (score > bestScore) {
          bestScore = score
          target = i
        }
      }
      if (target >= 0) {
        const b = home[target]
        const pickChance = clamp(ENEMY_INTERCEPT + oppSkill * 0.3, 0.1, 0.6) // jump the lane
        for (let i = 0; i < away.length; i++) {
          const d = away[i]
          if (segDist(d.x, d.y, a.x, a.y, b.x, b.y) < PR * 1.35 && Math.random() < pickChance) {
            startPass(a, away[i], true, () => {
              result('INTERCEPTED!', 'miss')
              sfx.aww()
              flipToAway(i)
            })
            return
          }
        }
        startPass(a, b, true, () => {
          active = target
          phase = 'live'
        })
        return
      }
      // no teammate that way → throw it there anyway; it lands as a loose ball
      const tx = inX(a.x + facingX * W * 0.32)
      const ty = inY(a.y + facingY * H * 0.45)
      startPass(a, { x: tx, y: ty }, true, () => {
        result('LOOSE BALL!', 'miss')
        looseBallAt(tx, ty)
      })
    }
    function doAwayPass(target: number) {
      if (target < 0 || target === awayHandler) return
      const a = away[awayHandler]
      const b = away[target]
      // home defenders can read the pass and jump the lane for a steal
      for (let i = 0; i < home.length; i++) {
        const d = home[i]
        if (segDist(d.x, d.y, a.x, a.y, b.x, b.y) < PR * 1.2 && Math.random() < 0.2) {
          startPass(a, home[i], false, () => {
            result('STOLEN!', 'make')
            sfx.make()
            possession = 'home'
            active = i
            setOnDefense(false)
            phase = 'live'
          })
          return
        }
      }
      startPass(a, b, false, () => {
        awayHandler = target
        awaySettleUntil = now + 0.8
        phase = 'live'
      })
    }
    type ShotOpts = {
      landX?: number
      landY?: number
      peakScale?: number
      missText?: string
      missKind?: string
      air?: boolean
    }
    function launchShot(p: P, rx: number, info: ReturnType<typeof shotInfo>, opts: ShotOpts = {}) {
      shotKind = info.layup ? 'layup' : info.three ? '3' : '2'
      lastTouch = p.team
      lastRimX = rx
      shotFrom.x = p.x
      shotFrom.y = p.y
      ball.x = p.x
      ball.y = p.y
      ball.z = 0
      ball.t = 0
      ball.dur = (info.layup ? 0.5 : 0.78) * (opts.air ? 1.05 : 1)
      ball.peak = (info.layup ? H * 0.12 : clamp(info.d * 0.26, H * 0.14, H * 0.4)) * (opts.peakScale ?? 1)
      shotMissText = opts.missText ?? ''
      shotMissKind = opts.missKind ?? 'miss'
      shotAir = opts.air ?? false
      if (opts.landX !== undefined) {
        land.x = inX(opts.landX)
        land.y = inY(opts.landY ?? rimY)
      } else if (made) {
        land.x = rx
        land.y = rimY
      } else {
        land.x = rx + (Math.random() * 2 - 1) * PR * 1.3
        land.y = rimY + (Math.random() * 2 - 1) * PR * 1.3
      }
      phase = 'shooting'
      sfx.shoot()
    }
    // Build the shot meter from the shooter's distance + shooting rating.
    // Far  → green sits near the END, is SMALL, and the bar fills FAST.
    // Close→ green sits near the START, is LARGE, and the bar fills SLOW.
    // Higher shooting rating widens the green (more forgiving) at any distance.
    function computeMeter() {
      const a = home[active]
      const d = dist(a.x, a.y, atkX('home'), rimY)
      const dClose = PR * 4 // ~ layup range
      const dMax = arcR * 1.05 // ~ a long 3-pointer
      const t = clamp((d - dClose) / Math.max(1, dMax - dClose), 0, 1)
      meterCenter = 0.3 + t * 0.55 // 0.30 (close) → 0.85 (deep)
      meterFill = 1.15 - t * 0.72 // 1.15s (close, slow) → 0.43s (deep, fast)
      let half = 0.17 - t * 0.12 // 0.17 (close, big) → 0.05 (deep, small)
      const rating = starters[active]?.shooting ?? 6 // 1..10
      half *= 0.6 + (rating / 10) * 0.85 // weak ~0.66× … elite ~1.45×
      meterHalf = clamp(half, 0.035, 0.26)
      meterCenter = clamp(meterCenter, meterHalf + 0.02, 0.97 - meterHalf)
    }
    function doShoot(c: number) {
      const a = home[active]
      const rx = atkX('home')
      const info = shotInfo(a, away, rx)
      // how far off the green the release was, in green-half units (0 = perfect)
      const e = (c - meterCenter) / meterHalf // signed: <0 early, >0 late
      const ae = Math.abs(e)
      // lateral aim = joystick up/down held at release (player faces the rim,
      // so up = his left, down = his right)
      const lat = joyRef.current.on ? clamp(joyRef.current.vy, -1, 1) : 0
      const dx = rx - a.x // toward the rim (positive)

      // instant release feedback: flash the bar + pop the timing call
      meterFlash = 1
      meterFlashKind = ae <= 1 ? 1 : ae <= 1.9 ? 2 : 3
      result(
        ae <= 1 ? 'PERFECT!' : ae <= 1.9 ? 'NICE!' : e < 0 ? 'TOO EARLY!' : 'TOO LATE!',
        ae <= 1 ? 'three' : ae <= 1.9 ? 'make' : 'miss',
      )

      if (ae <= 1) {
        // inside the green → clean make
        made = true
        launchShot(a, rx, info)
        return
      }
      // hard sideways aim on a non-perfect shot → wide miss left/right
      if (Math.abs(lat) > 0.5) {
        made = false
        const side = lat < 0 ? -1 : 1
        const wide = PR * 2.2 + (ae - 1) * PR * 1.6
        launchShot(a, rx, info, {
          landX: rx,
          landY: rimY + side * wide,
          missText: side < 0 ? 'TOO FAR LEFT!' : 'TOO FAR RIGHT!',
          air: true,
        })
        return
      }
      if (ae <= 1.9) {
        // just outside → catches the rim, may rattle in
        made = Math.random() < (1.9 - ae) * 0.6
        launchShot(a, rx, info, {
          landX: rx + (Math.random() * 2 - 1) * PR * 0.5,
          landY: rimY + (Math.random() * 2 - 1) * PR * 0.6,
          missText: 'RIM!',
          missKind: 'miss',
        })
        return
      }
      // big timing miss → airball short (early) or long/over (late)
      made = false
      if (e < 0) {
        const shortBy = clamp(0.25 + (ae - 1.9) * 0.45, 0.25, 0.85)
        launchShot(a, rx, info, {
          landX: a.x + dx * (1 - shortBy),
          landY: rimY + (Math.random() * 2 - 1) * PR * 0.8,
          peakScale: 0.65,
          missText: 'AIRBALL!',
          air: true,
        })
      } else {
        const overBy = clamp(0.2 + (ae - 1.9) * 0.4, 0.2, 0.8)
        launchShot(a, rx, info, {
          landX: rx + dx * overBy,
          landY: rimY + (Math.random() * 2 - 1) * PR * 0.8,
          peakScale: 1.3,
          missText: 'AIRBALL!',
          air: true,
        })
      }
    }
    // Generic jump-shot wind-up: the shooter plants and rises, the ball hangs in
    // his hands for a beat of airtime, then it launches at the top.
    function beginWindup(p: P, team: Team, idx: number, rx: number, info: ReturnType<typeof shotInfo>, willMake: boolean) {
      shotTeam = team
      shotIdx = idx
      pendingShooter = p
      pendingRx = rx
      pendingInfo = info
      made = willMake
      windupT = 0
      windupDur = info.layup ? 0.36 : 0.62
      phase = 'windup'
      sfx.shoot()
    }
    function awayShoot() {
      const bh = away[awayHandler]
      const rx = atkX('away')
      const contestD = dist(home[active].x, home[active].y, bh.x, bh.y)
      if (contestD < PR * 3 && now < blockUntil) {
        // timed contest: best near the apex of the jump (~0.28s in), scaled by the
        // defender's rating + proximity. Mistime/too far → no block, defender lands slow.
        const since = now - blockJumpStart
        const timing = Math.max(0, 1 - Math.abs(since - 0.28) / 0.28)
        const blockRating = (starters[active]?.defense ?? 5) / 10
        const prox = clamp(1 - contestD / (PR * 3), 0, 1)
        const chance = clamp((0.15 + timing * 0.55 + blockRating * 0.3) * (0.4 + prox * 0.6), 0.05, 0.92)
        if (Math.random() < chance) {
          result('BLOCKED!', 'miss')
          sfx.block()
          crowdJump = 0.6
          shake = Math.max(shake, 8)
          knockLoose(bh.x, bh.y) // swat it away → loose ball
          return
        }
        blockRecover = 0.5 // committed and missed → lands out of position
      }
      const info = shotInfo(bh, home, rx)
      // open looks go in at a solid rate; contested less — but no bricking wide-open shots
      let prob = info.baseP * (info.open ? 1.12 : 0.72) * (contestD < PR * 3 ? 0.74 : 1) * awayShootF * ENEMY_MAKE
      prob = clamp(prob, 0.05, 0.95)
      beginWindup(bh, 'away', awayHandler, rx, info, Math.random() < prob)
    }
    function resolveShotFlight() {
      const clutch = matchMode && quarter === 2 && gameClock <= 10 && Math.abs(us - them) <= 7
      if (made) {
        const pts = shotKind === '3' ? 3 : 2
        if (possession === 'home') {
          us += pts
          homePoints[active] += pts
        } else them += pts
        netFlash = 0.45
        netSwish = 0.5
        // kick the net on the rim that was scored on so it ripples as the ball drops
        if (lastRimX > W / 2) netJiggleR = 1
        else netJiggleL = 1
        crowdJump = clutch ? 0.85 : 0.6
        // drop the ball straight through the net, then let physics bounce it on the floor
        ball.x = lastRimX
        ball.y = rimY
        ball.z = PR * 0.7
        ball.vx = (Math.random() * 2 - 1) * W * 0.012
        ball.vy = H * 0.03
        ball.vz = -H * 0.18
        if (shotKind === 'layup') {
          const dunk = dist(shotFrom.x, shotFrom.y, lastRimX, rimY) < PR * 2.6
          result(dunk ? 'DUNK!' : 'LAYUP!', 'dunk')
          dunk ? sfx.dunk() : sfx.make()
          shake = Math.max(shake, dunk ? 9 : 4)
        } else if (shotKind === '3') {
          result(clutch ? 'CLUTCH 3!!' : 'SWISH · 3!', 'three')
          sfx.three()
          sfx.swish()
          shake = Math.max(shake, clutch ? 13 : 8)
        } else {
          result(clutch ? 'CLUTCH BUCKET!' : 'BUCKET!', 'make')
          sfx.make()
          sfx.swish()
          shake = Math.max(shake, clutch ? 10 : 4)
        }
        phase = 'resolved'
        resolveAt = now + 0.9
      } else {
        // airball misses everything (no rim clank); rim misses clank
        result(shotMissText || 'MISS', shotMissKind || 'miss')
        if (shotAir) {
          sfx.aww()
          shake = Math.max(shake, 6)
        } else {
          sfx.rim()
          sfx.aww()
          shake = Math.max(shake, 2)
        }
        shotMissText = ''
        // ball becomes a live, bouncing loose ball — players must go get it
        setupRebound()
      }
    }
    // Personal-space radius: no two players' centers get closer than this.
    const SEP = PR * 2.8
    function steerTo(p: P, tx: number, ty: number, spd: number, dt: number, sep = SEP) {
      // gentle idle micro-motion so an AI player never fully freezes at a spot —
      // they keep shuffling/repositioning around their target.
      const ph = (p.x + p.y) * 0.05
      tx += Math.sin(t * 1.8 + ph) * PR * 0.4
      ty += Math.cos(t * 1.4 + ph) * PR * 0.45
      // SEEK with arrival easing: ramp the speed down within ~1.2·PR of the target so
      // players ease in instead of overshooting and jittering at a waypoint. A small
      // floor keeps them drifting (never a hard stop).
      let sx = 0
      let sy = 0
      const dx = tx - p.x
      const dy = ty - p.y
      const gd = Math.hypot(dx, dy)
      if (gd > 0.5) {
        const seekSpd = spd * Math.max(0.18, Math.min(1, gd / (PR * 1.2)))
        sx = (dx / gd) * seekSpd
        sy = (dy / gd) * seekSpd
      }
      // SEPARATION: repel nearby players — but STRONG between teammates (so each team
      // spreads out and defenders never clump into an impassable wall) and WEAK +
      // short-range between opponents (so attackers can drive INTO and THROUGH the
      // gaps a defender occupies instead of hitting a physical barrier). Defense then
      // contests and slides without hard-blocking movement.
      let px = 0
      let py = 0
      for (const o of [...home, ...away]) {
        if (o === p) continue
        const ox = p.x - o.x
        const oy = p.y - o.y
        const d = Math.hypot(ox, oy)
        const sameTeam = o.team === p.team
        const sepR = sameTeam ? sep : sep * 0.55 // opponents claim much less personal space
        if (d > 0.01 && d < sepR) {
          const strength = sameTeam ? 1.9 : 0.4 // opponents repel weakly → drivable
          const push = ((sepR - d) / sepR) * spd * strength
          px += (ox / d) * push
          py += (oy / d) * push
        }
      }
      // KEY FIX: cap the separation vector below the seek speed so it can never fully
      // cancel the seek. Previously, in a crowd (the perimeter around the 3pt arc) the
      // summed separation overpowered the seek and the player froze/stuttered in place.
      // Capping it guarantees a net forward component → continuous motion, no hitch.
      const pm = Math.hypot(px, py)
      const pcap = spd * 0.85
      if (pm > pcap) {
        px = (px / pm) * pcap
        py = (py / pm) * pcap
      }
      let vx = sx + px
      let vy = sy + py
      const m = Math.hypot(vx, vy)
      if (m > spd) {
        vx = (vx / m) * spd
        vy = (vy / m) * spd
      }
      if (m > 0.3) {
        p.x = inX(p.x + vx * dt)
        p.y = inY(p.y + vy * dt)
      }
    }
    function runOffenseAI(dt: number) {
      const rx = atkX('home')
      const bh = home[active]
      const shotUp = phase === 'shooting' || phase === 'windup'
      // hysteresis band [0.78, 1.02]·arcR so the "driving" state can't flip on
      // the line every frame (that was the stutter at the 3pt arc)
      const dHandler = dist(bh.x, bh.y, rx, rimY)
      if (homeDriving) {
        if (dHandler > arcR * 1.02) homeDriving = false
      } else if (dHandler < arcR * 0.78) {
        homeDriving = true
      }
      const driving = homeDriving
      const sideSign = rx < W / 2 ? -1 : 1
      if (now > nextCutAt) {
        nextCutAt = now + 2.4 + Math.random() * 1.8
        const cands: number[] = []
        for (let i = 0; i < home.length; i++) if (i !== active && now >= cutUntil[i]) cands.push(i)
        if (cands.length) cutUntil[cands[(Math.random() * cands.length) | 0]] = now + 1.2
      }
      for (let i = 0; i < home.length; i++) {
        if (i === active) continue
        const sp = offSpot(i, 'home')
        let tx = sp.x
        let ty = sp.y
        if (shotUp) {
          // crash the boards — spread around the rim for an offensive rebound
          tx = rx - sideSign * PR * (1.8 + (i % 3) * 1.2)
          ty = rimY + (i - 2) * PR * 1.5
        } else if (now < cutUntil[i]) {
          // cut to the basket
          tx = rx - sideSign * PR * 2.2
          ty = rimY + (i - 2) * PR * 1.1
        } else if (driving) {
          // ball-handler driving → relocate wider / out for the kick-out (spacing)
          tx = sp.x + (sp.x - rx) * 0.14
          ty = sp.y + (sp.y >= rimY ? 1 : -1) * PR * 1.1
        }
        steerTo(home[i], tx, ty, AISPEED, dt)
      }
    }
    function runAwayOffenseAI(dt: number) {
      const rx = atkX('away')
      const bh = away[awayHandler]
      const openD = nearestDist(bh, home)
      const d2 = dist(bh.x, bh.y, rx, rimY)
      const contested = openD < PR * 2.7
      if (now > awayThinkAt) {
        awayThinkAt = now + 0.45 - oppSkill * 0.12 // smarter teams read the floor faster
        const elapsed = now - awayPossStart
        let bestT = -1
        let bestOpen = -Infinity
        for (let i = 0; i < away.length; i++) {
          if (i === awayHandler) continue
          const od = nearestDist(away[i], home)
          if (od > bestOpen) {
            bestOpen = od
            bestT = i
          }
        }
        const forced = shotClock < 6 || elapsed > 12
        // settled = had the ball a beat (no instant catch-and-shoot)
        const settled = now > awaySettleUntil
        if (forced) return awayShoot()
        if (settled && d2 < PR * 3.6 && !contested) return awayShoot()
        if (settled && !contested && openD > PR * 5 && d2 < arcR * 1.05 && elapsed > 2.5 && Math.random() < 0.4 + oppSkill * 0.25)
          return awayShoot()
        if (contested && bestT >= 0 && bestOpen > PR * 3.2) {
          doAwayPass(bestT)
          return
        }
        if (bestT >= 0 && bestOpen > openD + PR * 3 && Math.random() < 0.5 + oppSkill * 0.2) {
          doAwayPass(bestT)
          return
        }
      }
      let nd = Infinity
      let near: P | null = null
      for (const h of home) {
        const d = dist(bh.x, bh.y, h.x, h.y)
        if (d < nd) {
          nd = d
          near = h
        }
      }
      // continuous attack depth (no hard arcR switch → no hitch on the line)
      const dirSign = rx < W / 2 ? 1 : -1
      const pen = clamp(1.8 + (d2 / arcR) * 1.4, 1.8, 4)
      const driveX = rx + dirSign * PR * pen
      let ty = rimY
      if (near && nd < PR * 2.6) ty += (bh.y < rimY ? -1 : 1) * PR * 2.4
      steerTo(bh, driveX, ty, AISPEED * (contested ? 0.85 : 0.95), dt)
      if (now > awayNextCut) {
        awayNextCut = now + 2.6 + Math.random() * 2
        const cands: number[] = []
        for (let i = 0; i < away.length; i++) if (i !== awayHandler && now >= awayCut[i]) cands.push(i)
        if (cands.length) awayCut[cands[(Math.random() * cands.length) | 0]] = now + 1.1
      }
      const shotUp = phase === 'shooting' || phase === 'windup'
      if (awayDrivingState) {
        if (d2 > arcR * 1.02) awayDrivingState = false
      } else if (d2 < arcR * 0.78) {
        awayDrivingState = true
      }
      const awayDriving = awayDrivingState
      const sideSign = rx < W / 2 ? -1 : 1
      for (let i = 0; i < away.length; i++) {
        if (i === awayHandler) continue
        const sp = offSpot(i, 'away')
        let tx = sp.x
        let tyy = sp.y
        if (shotUp) {
          tx = rx - sideSign * PR * (1.8 + (i % 3) * 1.2)
          tyy = rimY + (i - 2) * PR * 1.5
        } else if (now < awayCut[i]) {
          tx = rx - sideSign * PR * 2.2
          tyy = rimY + (i - 2) * PR * 1.1
        } else if (awayDriving) {
          tx = sp.x + (sp.x - rx) * 0.14
          tyy = sp.y + (sp.y >= rimY ? 1 : -1) * PR * 1.1
        }
        steerTo(away[i], tx, tyy, AISPEED * 0.85, dt)
      }
    }
    function playDefense(defs: P[], off: P[], ballIdx: number, controlled: number | null, dt: number, skill = 0) {
      const rx = atkX(off[0].team)
      const ballP = off[ballIdx]
      const shotUp = phase === 'shooting' || phase === 'windup'
      // a rangier defense closes faster and hugs the ball-handler a step tighter
      const spd = 1 + skill * 0.14
      const hug = 0.18 - skill * 0.06
      for (let i = 0; i < defs.length; i++) {
        if (controlled != null && i === controlled) continue
        const man = off[i % off.length]
        const onBall = i % off.length === ballIdx
        if (shotUp) {
          // box out — get inside position between your man and the rim
          steerTo(defs[i], man.x + (rx - man.x) * 0.5, man.y + (rimY - man.y) * 0.5, AISPEED * 0.95 * spd, dt)
        } else if (onBall) {
          // pressure the ball, between man and the rim
          steerTo(defs[i], man.x + (rx - man.x) * hug, man.y + (rimY - man.y) * hug, AISPEED * 0.97 * spd, dt)
        } else {
          // stay on your OWN man, shaded a step toward the rim (help stance)
          steerTo(defs[i], man.x + (rx - man.x) * 0.2, man.y + (rimY - man.y) * 0.2, AISPEED * 0.9 * spd, dt)
        }
      }
      // RIM IS ALWAYS DEFENDED: on a drive into the paint the nearest off-ball
      // defender steps over to contest at the basket, then recovers.
      if (!shotUp && dist(ballP.x, ballP.y, rx, rimY) < arcR * 0.8) {
        let best = -1
        let bd = Infinity
        for (let i = 0; i < defs.length; i++) {
          if (i % off.length === ballIdx) continue
          if (controlled != null && i === controlled) continue
          const d = dist(defs[i].x, defs[i].y, rx, rimY)
          if (d < bd) {
            bd = d
            best = i
          }
        }
        if (best >= 0) steerTo(defs[best], rx * 0.55 + ballP.x * 0.45, rimY * 0.55 + ballP.y * 0.45, AISPEED * 0.98, dt, PR * 2)
      }
    }
    function runHomeDefenseAI(dt: number, controlled: number | null) {
      // controlled = the defender the user is steering (skip it); null = AI all.
      playDefense(home, away, awayHandler, controlled, dt)
    }
    function runAwayDefenseAI(dt: number) {
      playDefense(away, home, active, null, dt, oppSkill)
      if (phase !== 'live') return
      // on-ball pickpocket: the nearest defender to YOUR handler lunges for a strip,
      // odds rising the tighter they guard and the better the opponent
      const handler = home[active]
      let nd = Infinity
      let robber = 0
      for (let i = 0; i < away.length; i++) {
        const d = dist(away[i].x, away[i].y, handler.x, handler.y)
        if (d < nd) {
          nd = d
          robber = i
        }
      }
      if (now > awayStealAt) {
        awayStealAt = now + 0.5 + Math.random() * 0.7 // attempt more often (was ~1.0–2.0s)
        const reach = PR * 2.7
        if (nd < reach) {
          stealAnimTeam = 'away' // animate the reach/swipe on the attempt
          stealAnimIdx = robber
          stealAnimStart = now
          // tighter + better team + ball exposed (bottom of the user's dribble) = higher
          const closeness = 1 - nd / reach
          const u = (homeAnimT[active] % 0.52) / 0.52
          const exposed = 0.7 + Math.sin(u * Math.PI) * 0.5
          const chance = clamp(ENEMY_STEAL * closeness * (0.5 + oppSkill * 0.9) * exposed, 0.02, 0.6)
          if (Math.random() < chance) {
            result('STOLEN!', 'miss')
            sfx.aww()
            flipToAway(robber)
          }
        }
      }
    }
    // ---- auto-play: your AI ball-handler when you're idle ----
    function aiHomeShoot() {
      computeMeter()
      // good shooters mostly land in the green; jitter scales with the meter so deep
      // shots stay harder than layups
      doShoot(clamp(meterCenter + (Math.random() * 2 - 1) * meterHalf * 1.2, 0.02, 0.99))
    }
    function aiHomePass(target: number) {
      const a = home[active]
      const b = home[target]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const d = Math.hypot(dx, dy) || 1
      facingX = dx / d // face the target so doPass picks this teammate
      facingY = dy / d
      doPass()
    }
    function runHomeHandlerAI(dt: number) {
      const a = home[active]
      const rx = atkX('home')
      const openD = nearestDist(a, away)
      const d2 = dist(a.x, a.y, rx, rimY)
      const contested = openD < PR * 2.7
      const elapsed = SHOT_CLOCK - shotClock
      if (now > homeThinkAt) {
        homeThinkAt = now + 0.45
        let bestT = -1
        let bestOpen = -Infinity
        for (let i = 0; i < home.length; i++) {
          if (i === active) continue
          const od = nearestDist(home[i], away)
          if (od > bestOpen) {
            bestOpen = od
            bestT = i
          }
        }
        const forced = shotClock < 6 || elapsed > 12
        if (forced) return aiHomeShoot()
        if (d2 < PR * 3.6 && !contested) return aiHomeShoot()
        if (!contested && openD > PR * 5 && d2 < arcR * 1.05 && elapsed > 2.5 && Math.random() < 0.4)
          return aiHomeShoot()
        if (contested && bestT >= 0 && bestOpen > PR * 3.2) return aiHomePass(bestT)
        if (bestT >= 0 && bestOpen > openD + PR * 3 && Math.random() < 0.5) return aiHomePass(bestT)
      }
      // drive: probe toward the rim, sliding off the nearest defender
      let nd = Infinity
      let near: P | null = null
      for (const d of away) {
        const dd = dist(a.x, a.y, d.x, d.y)
        if (dd < nd) {
          nd = dd
          near = d
        }
      }
      const dirSign = rx < W / 2 ? 1 : -1
      const pen = clamp(1.8 + (d2 / arcR) * 1.4, 1.8, 4)
      const driveX = rx + dirSign * PR * pen
      let ty = rimY
      if (near && nd < PR * 2.6) ty += (a.y < rimY ? -1 : 1) * PR * 2.4
      steerTo(a, driveX, ty, AISPEED * (contested ? 0.85 : 0.95), dt)
    }
    function doSwitch() {
      // always grab the defender closest to the ball
      const ballP = away[awayHandler]
      let best = active
      let bd = Infinity
      for (let i = 0; i < home.length; i++) {
        const d = dist(home[i].x, home[i].y, ballP.x, ballP.y)
        if (d < bd) {
          bd = d
          best = i
        }
      }
      active = best
      sfx.tap()
    }
    function doSteal() {
      if (stealRecover > 0) return // still recovering from a previous whiff
      const def = home[active]
      const bh = away[awayHandler]
      // the swipe animation plays on EVERY attempt, hit or miss
      stealAnimTeam = 'home'
      stealAnimIdx = active
      stealAnimStart = now
      const d = dist(def.x, def.y, bh.x, bh.y)
      if (d > PR * 3) {
        stealRecover = 0.6 // reached at nothing → out of position
        sfx.aww()
        return
      }
      // chance from: your defender's rating, opponent ball security, positioning
      // (in front of the handler beats behind), and timing (ball exposed low in the dribble)
      const defRating = (starters[active]?.defense ?? 5) / 10
      const handleSkill = 0.5 + oppSkill * 0.35
      const rx = atkX('away')
      let fx = rx - bh.x
      let fy = rimY - bh.y
      const fn = Math.hypot(fx, fy) || 1
      fx /= fn
      fy /= fn
      let dx = def.x - bh.x
      let dy = def.y - bh.y
      const dn = Math.hypot(dx, dy) || 1
      const front = fx * (dx / dn) + fy * (dy / dn) // -1 behind .. 1 in front
      const posBonus = clamp(0.1 + front * 0.22, -0.12, 0.34)
      const u = (awayAnimT[awayHandler] % 0.45) / 0.45
      const timeBonus = Math.sin(u * Math.PI) * 0.22 // peak when the ball is at the floor
      const close = clamp(1 - d / (PR * 3), 0, 1)
      const chance = clamp((0.16 + defRating * 0.42 - handleSkill * 0.3 + posBonus + timeBonus) * (0.45 + close * 0.65), 0.03, 0.85)
      if (Math.random() < chance) {
        result('STEAL!', 'make')
        sfx.make()
        knockLoose(bh.x, bh.y) // poke it loose → scramble (your defender is closest)
      } else {
        stealRecover = 0.6 // whiff → a beat slow / out of position
        sfx.aww()
      }
    }
    // Turn a miss into a LIVE loose ball: give it a realistic carom velocity.
    function setupRebound() {
      ball.x = land.x
      ball.y = land.y
      looseT = 0
      if (shotAir) {
        // airball — drops from where it sailed with a bit of forward momentum
        ball.z = Math.max(PR * 1.6, ball.z)
        const dir = land.x >= shotFrom.x ? 1 : -1
        ball.vx = dir * H * 0.14 + (Math.random() * 2 - 1) * H * 0.07
        ball.vy = (Math.random() * 2 - 1) * H * 0.14
        ball.vz = H * 0.18
      } else {
        // caromed off the rim/backboard — pops up and back into the court
        ball.z = PR * 1.7
        const inward = lastRimX > W / 2 ? -1 : 1
        ball.vx = inward * H * 0.42 + (Math.random() * 2 - 1) * H * 0.12
        ball.vy = (Math.random() * 2 - 1) * H * 0.42
        ball.vz = H * 0.8
        // a rim clank tugs the net a little
        if (lastRimX > W / 2) netJiggleR = Math.max(netJiggleR, 0.4)
        else netJiggleL = Math.max(netJiggleL, 0.4)
      }
      phase = 'loose'
    }
    // made-shot ball: drop it through the net and bounce it on the floor (uses the
    // same gravity/bounce model as a loose ball, but possession is already decided)
    function stepMadeBall(dt: number) {
      const G = H * 2.2
      ball.vz -= G * dt
      ball.z += ball.vz * dt
      ball.x += ball.vx * dt
      ball.y += ball.vy * dt
      if (ball.z <= 0) {
        ball.z = 0
        if (ball.vz < -H * 0.06) {
          ball.vz = -ball.vz * 0.5
          ball.vx *= 0.7
          ball.vy *= 0.7
          sfx.dribble()
        } else {
          ball.vz = 0
          ball.vx *= 0.85
          ball.vy *= 0.85
        }
      }
      ball.x = clamp(ball.x, mx + PR, W - mx - PR)
      ball.y = clamp(ball.y, band + PR, H - band - PR)
    }
    // A player physically reaches the loose ball and collects it.
    function collectBall(isHome: boolean, idx: number) {
      ball.z = 0
      ball.vx = ball.vy = ball.vz = 0
      lastTouch = isHome ? 'home' : 'away'
      const off = isHome === (possession === 'home')
      if (isHome) {
        possession = 'home'
        active = idx
        setOnDefense(false)
        result(off ? 'OFF. BOARD!' : 'REBOUND', 'make')
      } else {
        flipToAway(idx)
        result(off ? 'OFF. BOARD!' : 'REBOUND', 'miss')
      }
      phase = 'live'
    }
    // Ball crossed the line / handler stepped out → other team inbounds quickly.
    function outOfBounds(lostBy: Team) {
      const winner: Team = lostBy === 'home' ? 'away' : 'home'
      // inbound spot: just inside the nearest boundary line
      const sx = clamp(ball.x, mx + PR, W - mx - PR)
      const sy = clamp(ball.y, band + PR, H - band - PR)
      ball.x = sx
      ball.y = sy
      ball.z = 0
      ball.vx = ball.vy = ball.vz = 0
      if (winner === 'home') {
        let bi = 0
        let bd = Infinity
        for (let i = 0; i < home.length; i++) {
          const d = dist(home[i].x, home[i].y, sx, sy)
          if (d < bd) {
            bd = d
            bi = i
          }
        }
        home[bi].x = sx
        home[bi].y = sy
        possession = 'home'
        active = bi
        facingX = 1
        facingY = 0
        lastTouch = 'home'
        setOnDefense(false)
        result('OUT! YOUR BALL', 'make')
      } else {
        let bi = 0
        let bd = Infinity
        for (let i = 0; i < away.length; i++) {
          const d = dist(away[i].x, away[i].y, sx, sy)
          if (d < bd) {
            bd = d
            bi = i
          }
        }
        away[bi].x = sx
        away[bi].y = sy
        flipToAway(bi)
        awaySettleUntil = now + 0.7
        result('OUT! OPP BALL', 'miss')
      }
      phase = 'live'
    }
    function runLooseBall(dt: number) {
      looseT += dt
      const G = H * 2.2
      ball.vz -= G * dt
      ball.z += ball.vz * dt
      ball.x += ball.vx * dt
      ball.y += ball.vy * dt
      // air drag on horizontal travel
      const drag = Math.max(0, 1 - 0.5 * dt)
      ball.vx *= drag
      ball.vy *= drag
      // floor bounce (decaying) or roll
      if (ball.z <= 0) {
        ball.z = 0
        if (ball.vz < -H * 0.06) {
          ball.vz = -ball.vz * 0.55 // firm, decaying bounce
          ball.vx *= 0.72 // ground friction grabs some horizontal speed
          ball.vy *= 0.72
          sfx.dribble()
        } else {
          ball.vz = 0
          const roll = Math.max(0, 1 - 2.2 * dt) // rolling friction
          ball.vx *= roll
          ball.vy *= roll
        }
      }
      // crossed the boundary line → out of bounds, other team inbounds
      if (ball.x < mx || ball.x > W - mx || ball.y < band || ball.y > H - band) {
        outOfBounds(lastTouch)
        return
      }
      // everyone scrambles for the ball (you keep manual control of your guy)
      for (let i = 0; i < away.length; i++) steerTo(away[i], ball.x, ball.y, AISPEED * 1.08, dt, PR * 2)
      for (let i = 0; i < home.length; i++) {
        if (i === active && joyRef.current.on) continue
        steerTo(home[i], ball.x, ball.y, AISPEED * 1.04, dt, PR * 2)
      }
      // a player can only grab it once it's low enough and within reach
      if (ball.z < PR * 1.6) {
        let bi = -1
        let bHome = true
        let bd = PR * 1.5
        for (let i = 0; i < home.length; i++) {
          const d = dist(home[i].x, home[i].y, ball.x, ball.y)
          if (d < bd) {
            bd = d
            bi = i
            bHome = true
          }
        }
        for (let i = 0; i < away.length; i++) {
          const d = dist(away[i].x, away[i].y, ball.x, ball.y)
          if (d < bd) {
            bd = d
            bi = i
            bHome = false
          }
        }
        if (bi >= 0) {
          collectBall(bHome, bi)
          return
        }
      }
      // safety: don't let a loose ball wander forever
      if (looseT > 7) {
        let bi = 0
        let bHome = true
        let bd = Infinity
        for (let i = 0; i < home.length; i++) {
          const d = dist(home[i].x, home[i].y, ball.x, ball.y)
          if (d < bd) {
            bd = d
            bi = i
            bHome = true
          }
        }
        for (let i = 0; i < away.length; i++) {
          const d = dist(away[i].x, away[i].y, ball.x, ball.y)
          if (d < bd) {
            bd = d
            bi = i
            bHome = false
          }
        }
        collectBall(bHome, bi)
      }
    }
    function endGame() {
      ended = true
      sfx.buzzer()
      if (us > them) sfx.three()
      let mvpI = 0
      for (let i = 1; i < homePoints.length; i++) if (homePoints[i] > homePoints[mvpI]) mvpI = i
      setFinal({
        us,
        them,
        win: us > them,
        mvpName: homeNamesL[mvpI] || 'Player',
        mvpPts: homePoints[mvpI],
      })
    }
    // ----- game flow: tip-off, quarter breaks, final buzzer -----
    function runTipoff(dt: number) {
      if (tipT === 0) result('TIP-OFF!', 'three')
      tipT += dt
      ball.x = W / 2
      ball.y = rimY
      const c = controls.current
      if (tipT < 0.7) {
        ball.z = 0
        tipUp = 0
      } else if (tipT < 1.5) {
        const u = (tipT - 0.7) / 0.8
        ball.z = Math.sin(Math.PI * u) * H * 0.32 // tossed straight up and down
        tipUp = Math.sin(Math.PI * u) // both leapers rise then land
        if (!tipPrompted) {
          tipPrompted = true
          result('TAP SHOOT!', 'make')
        }
        // catch the user's timed jump (any action button)
        if (!tipTapped && (c.charging || c.release || c.pass)) {
          tipTapped = true
          tipTapT = tipT
        }
        c.charging = false
        c.release = false
        c.pass = false
      } else {
        tipUp = 0
        ball.z = 0
        c.charging = false
        c.release = false
        c.pass = false
        // win the tip by tapping near the ball's apex (~tipT 1.1); a better
        // leaper (higher "inside" rating) gets a more forgiving window.
        const rating = starters[tipHomeIdx]?.inside ?? 6
        const win = 0.12 + (rating / 10) * 0.14
        let homeWins: boolean
        if (!tipTapped) homeWins = false // you didn't jump → you lose the tip
        else if (Math.abs(tipTapT - 1.1) < win) homeWins = true // well-timed leap
        else homeWins = Math.random() < 0.4 + (rating / 10) * 0.15 // mistimed → scrap
        if (homeWins) {
          possession = 'home'
          active = tipHomeIdx
          facingX = 1
          facingY = 0
          lastTouch = 'home'
          setOnDefense(false)
          possArrow = 'away'
          result(`${homeAbbr} WIN THE TIP!`, 'make')
        } else {
          flipToAway(tipAwayIdx)
          possArrow = 'home'
          result(`${awayAbbr} WIN THE TIP`, 'miss')
        }
        phase = 'live'
      }
    }
    function runBreak(dt: number) {
      breakT += dt
      ball.x = W / 2
      ball.y = rimY
      ball.z = 0
      if (breakT > 1.6) {
        quarter += 1
        gameClock = QUARTER_SECONDS
        placeFormation()
        possArrow = possArrow === 'home' ? 'away' : 'home'
        if (possArrow === 'home') {
          possession = 'home'
          active = 0
          facingX = 1
          facingY = 0
          lastTouch = 'home'
          setOnDefense(false)
        } else {
          flipToAway(0)
        }
        result('2ND HALF', 'three')
        phase = 'live'
      }
    }
    function runGameover(dt: number) {
      overT += dt
      if (overT > 1.3) endGame()
    }
    function pushHud() {
      const aName = possession === 'home' ? homeNamesL[active] : awayAbbr
      const aPos = possession === 'home' ? homePosL[active] : ''
      const aPts = possession === 'home' ? homePoints[active] : 0
      const key = `${us}|${them}|${quarter}|${Math.ceil(gameClock)}|${Math.ceil(shotClock)}|${aName}|${aPts}|${autoOn ? 1 : 0}`
      if (key !== lastHudKey) {
        lastHudKey = key
        setHud({
          us,
          them,
          quarter,
          clock: Math.max(0, Math.ceil(gameClock)),
          shot: Math.max(0, Math.ceil(shotClock)),
          homeAbbr,
          awayAbbr,
          activeName: aName,
          activePos: aPos,
          activePts: aPts,
          auto: autoOn,
        })
      }
    }

    function update(dt: number) {
      t += dt
      // ball spins while flying / rolling; a held ball is still
      ballSpin += dt * (phase === 'shooting' || phase === 'passing' ? 520 : phase === 'loose' ? 360 : 0)
      if (meterFlash > 0) meterFlash = Math.max(0, meterFlash - dt * 3)
      if (shake > 0) shake = Math.max(0, shake - dt * 40)
      if (netFlash > 0) netFlash = Math.max(0, netFlash - dt)
      if (netSwish > 0) netSwish = Math.max(0, netSwish - dt)
      if (netJiggleL > 0) netJiggleL = Math.max(0, netJiggleL - dt * 1.7)
      if (netJiggleR > 0) netJiggleR = Math.max(0, netJiggleR - dt * 1.7)
      if (crowdJump > 0) crowdJump = Math.max(0, crowdJump - dt)

      if (matchMode && !ended && phase === 'live') {
        gameClock -= dt
        shotClock -= dt
        if (shotClock <= 0) {
          result('SHOT CLOCK', 'miss')
          if (possession === 'home') flipToAway(0)
          else flipToHome()
        }
        if (gameClock <= 0) {
          sfx.buzzer()
          if (quarter >= 2) {
            phase = 'gameover'
            overT = 0
            result('FINAL!', 'three')
          } else {
            phase = 'break'
            breakT = 0
            result('HALFTIME', 'miss')
          }
        }
      }
      if (ended) return
      if (possession !== prevPossession) {
        prevPossession = possession
        shotClock = SHOT_CLOCK
      }
      if (stealCd > 0) stealCd -= dt
      if (stealRecover > 0) stealRecover -= dt
      if (blockRecover > 0) blockRecover -= dt

      const c = controls.current
      // any stick movement or button press means the user is playing; after a beat of
      // none, the AI takes over the active player so the game runs itself (FIFA-style)
      const hasInput =
        joyRef.current.on || c.sprint || c.charging || c.pass || c.release || c.switchD || c.steal || c.block
      if (hasInput) lastInputAt = now
      const aiActive = now - lastInputAt > IDLE_TAKEOVER
      autoOn = aiActive
      let speed = SPEED
      if (c.sprint && stamina > 0.02) {
        speed *= 1.6
        stamina = Math.max(0, stamina - dt * 0.5)
      } else {
        stamina = Math.min(1, stamina + dt * 0.3)
      }
      // a missed steal/block leaves your defender a step slow (out of position)
      if (stealRecover > 0 || blockRecover > 0) speed *= 0.55

      // Is the user actively driving? (joystick held).
      const userDriving = joyRef.current.on
      // Jump-shot lift: user charge-shot (home) or AI wind-up (either team).
      const aiming = possession === 'home' && phase === 'live' && c.charging
      if (aiming) {
        shotTeam = 'home'
        shotIdx = active
        shooterLift = Math.min(1, shooterLift + dt / 0.16)
      } else if (phase === 'windup') {
        shooterLift = Math.min(1, shooterLift + dt / (windupDur * 0.4))
      } else {
        shooterLift = Math.max(0, shooterLift - dt / 0.14)
      }
      const a = home[active]
      const isHandler = possession === 'home' && phase === 'live'
      // movement is allowed during normal play (incl. while the ball is in the
      // air on a pass/shot); only the pre-game/break/final beats freeze players.
      const canMove = phase !== 'tipoff' && phase !== 'break' && phase !== 'gameover'
      if (userDriving && !aiming && canMove) {
        const nx = a.x + joyRef.current.vx * speed * dt
        const ny = a.y + joyRef.current.vy * speed * dt
        if (isHandler) {
          // the ball-handler may reach/cross the line (so it can be called out)
          a.x = clamp(nx, mx - PR * 0.6, W - mx + PR * 0.6)
          a.y = clamp(ny, band - PR * 0.6, H - band + PR * 0.6)
        } else {
          a.x = inX(nx)
          a.y = inY(ny)
        }
      }
      // ball-handler stepped on/over the line → turnover
      if (isHandler && (a.x < mx || a.x > W - mx || a.y < band || a.y > H - band)) {
        outOfBounds('home')
      }
      // remember which way the user's player is facing (for directional passes)
      if (possession === 'home' && userDriving) {
        const len = Math.hypot(joyRef.current.vx, joyRef.current.vy)
        if (len > 0.25) {
          facingX = joyRef.current.vx / len
          facingY = joyRef.current.vy / len
        }
      }

      if (phase === 'tipoff') {
        runTipoff(dt)
      } else if (phase === 'break') {
        runBreak(dt)
      } else if (phase === 'gameover') {
        runGameover(dt)
      } else if (phase === 'loose') {
        runLooseBall(dt)
      } else if (possession === 'home') {
        runOffenseAI(dt)
        runAwayDefenseAI(dt)
        if (phase === 'live' && aiActive) {
          runHomeHandlerAI(dt)
          c.pass = false
          c.release = false
          charge = 0
        } else if (phase === 'live') {
          if (c.pass) {
            c.pass = false
            doPass()
          } else if (c.charging) {
            if (charge === 0) computeMeter() // lock meter params at shot start
            charge = Math.min(1, charge + dt / meterFill)
            // held too long: meter maxed without releasing → a defender strips it
            if (charge >= 1) {
              c.charging = false
              charge = 0
              let bi = 0
              let bd = Infinity
              for (let i = 0; i < away.length; i++) {
                const d = dist(away[i].x, away[i].y, home[active].x, home[active].y)
                if (d < bd) {
                  bd = d
                  bi = i
                }
              }
              result('STOLEN!', 'miss')
              sfx.aww()
              flipToAway(bi)
            }
          }
          if (c.release) {
            c.release = false
            if (charge > 0.02) doShoot(charge)
            charge = 0
          }
        } else {
          c.pass = false
          c.release = false
          charge = 0
        }
        c.switchD = false
        c.steal = false
        c.block = false
      } else {
        // You control your on-court defender; when idle the AI guards with all five
        runHomeDefenseAI(dt, aiActive ? null : active)
        if (phase === 'live') runAwayOffenseAI(dt)
        if (aiActive) {
          // auto-defense also goes for the occasional on-ball steal
          if (phase === 'live' && now > homeStealAt) {
            homeStealAt = now + 1.3 + Math.random() * 1.6
            const def = home[active]
            if (dist(def.x, def.y, away[awayHandler].x, away[awayHandler].y) < PR * 2.2) {
              stealAnimTeam = 'home'
              stealAnimIdx = active
              stealAnimStart = now
              if (Math.random() < 0.14) {
                result('STEAL!', 'make')
                sfx.make()
                knockLoose(away[awayHandler].x, away[awayHandler].y)
              }
            }
          }
          c.switchD = false
          c.steal = false
          c.block = false
        } else {
          if (c.switchD) {
            c.switchD = false
            if (phase === 'live') doSwitch()
          }
          if (c.steal) {
            c.steal = false
            if (phase === 'live') doSteal()
          }
          if (c.block) {
            c.block = false
            if (blockRecover <= 0) {
              // leap to contest: timed jump (the apex is the block window)
              blockUntil = now + 0.55
              blockJumpStart = now
              blockAnimIdx = active
              blockAnimStart = now
              sfx.shoot()
            }
          }
        }
        c.pass = false
        c.release = false
        charge = 0
      }

      if (phase === 'passing') {
        passT += dt / passDur
        const k = clamp(passT, 0, 1)
        const tx = passTarget ? passTarget.x : passSX
        const ty = passTarget ? passTarget.y : passSY
        // ease the arc a touch for a smoother throw
        ball.x = passSX + (tx - passSX) * k
        ball.y = passSY + (ty - passSY) * k
        ball.z = Math.sin(Math.PI * k) * PR * 1.25
        if (passT >= 1) {
          ball.z = 0
          passDone()
          if (phase === 'passing') phase = 'live'
        }
      } else if (phase === 'windup') {
        windupT += dt
        if (windupT >= windupDur && pendingShooter && pendingInfo) {
          launchShot(pendingShooter, pendingRx, pendingInfo)
        }
      } else if (phase === 'shooting') {
        ball.t += dt
        const ft = ball.t / ball.dur
        if (ft >= 1) resolveShotFlight()
        else {
          ball.x = shotFrom.x + (land.x - shotFrom.x) * ft
          ball.y = shotFrom.y + (land.y - shotFrom.y) * ft
          ball.z = ball.peak * Math.sin(Math.PI * ft)
        }
      } else if (phase === 'resolved') {
        // made shot: the ball drops through the net and bounces before the inbound
        stepMadeBall(dt)
        if (now >= resolveAt) {
          ball.z = 0
          result('', '')
          // scoring should NOT switch the player you control — keep it the same
          // across the possession change; only the SWITCH button changes it.
          const keepActive = active
          if (possession === 'home') flipToAway(0)
          else flipToHome()
          active = keepActive
          phase = 'live'
        }
      }
    }

    function publish() {
      // camera gently follows the ball/handler (kept subtle)
      const fx = phase === 'live' ? (possession === 'home' ? home[active].x : away[awayHandler].x) : ball.x
      const fy = phase === 'live' ? (possession === 'home' ? home[active].y : away[awayHandler].y) : ball.y
      const tcx = clamp(-(fx - W / 2) * 0.12, -W * 0.03, W * 0.03)
      const tcy = clamp(-(fy - H / 2) * 0.1, -H * 0.04, H * 0.04)
      camX += (tcx - camX) * 0.06
      camY += (tcy - camY) * 0.06

      // ---- per-player character poses (locomotion + dribble) ----
      const dtp = Math.max(0.001, Math.min(0.05, now - lastPubNow))
      lastPubNow = now
      const buildPose = (team: Team, i: number): Pose => {
        const arr = team === 'home' ? home : away
        const p = arr[i]
        const pvx = team === 'home' ? prevHX : prevAX
        const pvy = team === 'home' ? prevHY : prevAY
        const vx = (p.x - pvx[i]) / dtp
        const vy = (p.y - pvy[i]) / dtp
        pvx[i] = p.x
        pvy[i] = p.y
        const nspd = clamp(Math.hypot(vx, vy) / (SPEED * 1.1), 0, 1)
        const handler =
          (team === 'home' && possession === 'home' && i === active) ||
          (team === 'away' && possession === 'away' && i === awayHandler)
        const passing = passerTeam === team && passerIdx === i && passAnimStart >= 0 && now < passAnimStart + passAnimDur
        const blocking = team === 'home' && blockAnimIdx === i && blockAnimStart >= 0 && now < blockAnimStart + 0.7
        const stealing = stealAnimTeam === team && stealAnimIdx === i && stealAnimStart >= 0 && now < stealAnimStart + 0.45
        let target: AnimState
        if (blocking) target = 'jump'
        else if (stealing) target = 'steal'
        else if (passing) target = 'pass'
        else if (handler && phase === 'live') target = 'dribble'
        else if (nspd < 0.1) target = 'idle'
        else if (nspd < 0.5) target = 'walk'
        else target = 'run'
        const stArr = team === 'home' ? homeAnim : awayAnim
        const tArr = team === 'home' ? homeAnimT : awayAnimT
        if (stArr[i] !== target) {
          stArr[i] = target
          tArr[i] = 0
        }
        tArr[i] += dtp
        const faceArr = team === 'home' ? homeFace : awayFace
        if (!passing && Math.abs(vx) > SPEED * 0.06) faceArr[i] = vx > 0 ? 1 : -1
        const pose = computePose(stArr[i], tArr[i], {
          speed: Math.max(nspd, 0.3),
          facing: faceArr[i],
          passKind: passKindG,
        })
        pose.ballVisible = false // the real game ball is drawn separately
        // keep the existing jump/tip lift on top of locomotion (shadow stays grounded)
        const lift = shotTeam === team && shotIdx === i ? shooterLift : 0
        const tip = (team === 'home' && tipHomeIdx === i) || (team === 'away' && tipAwayIdx === i) ? tipUp : 0
        const extra = Math.max(lift, tip)
        if (extra > 0.01) {
          pose.rootDY -= extra * PR * 2
          pose.shadowScale *= 1 - extra * 0.5
          pose.shadowOpacity *= 1 - extra * 0.6
        }
        return pose
      }
      const homePoses = USE_CHARACTERS ? home.map((_, i) => buildPose('home', i)) : EMPTY.homePoses
      const awayPoses = USE_CHARACTERS ? away.map((_, i) => buildPose('away', i)) : EMPTY.awayPoses

      let bx: number, by: number, bz: number
      if (phase === 'live') {
        const homeBall = possession === 'home'
        const hIdx = homeBall ? active : awayHandler
        const hp = homeBall ? home[active] : away[awayHandler]
        const aimingNow = homeBall && controls.current.charging
        if (aimingNow) {
          // held in the shooter's hands as he rises for the jump shot
          bx = hp.x + PR * 0.45
          by = hp.y - PR * 0.2
          bz = shooterLift * PR * 2
        } else {
          // dribble: ball bounces beside the handler, synced to his dribbling hand
          // (same 0.52s clock as the dribble pose). Calmer/lower bounce so it reads as
          // a smooth dribble rather than a distracting bounce.
          const clk = (homeBall ? homeAnimT : awayAnimT)[hIdx]
          const u = (clk % 0.52) / 0.52
          const arch = Math.sin(u * Math.PI) // 0 at the hand, 1 at the floor
          const face = (homeBall ? homeFace : awayFace)[hIdx]
          bx = hp.x + face * PR * 0.95
          by = hp.y + PR * 0.3
          bz = PR * 1.3 * (1 - arch)
        }
      } else if (phase === 'windup') {
        // ball held in the AI shooter's hands as he rises
        const sp = (shotTeam === 'home' ? home : away)[shotIdx]
        bx = sp.x + PR * 0.45
        by = sp.y - PR * 0.2
        bz = shooterLift * PR * 2
      } else {
        bx = ball.x
        by = ball.y
        bz = ball.z
      }
      sv.value = {
        home: home.map((p) => ({ x: p.x, y: p.y })),
        away: away.map((p) => ({ x: p.x, y: p.y })),
        ball: { x: bx, y: by, z: bz, show: true, spin: ballSpin },
        active,
        activeShow: !(phase === 'passing' && passByHome),
        charging: phase === 'live' && possession === 'home' && controls.current.charging,
        charge: clamp(charge, 0, 1),
        blockOn: now < blockUntil,
        joy: { ...joyRef.current },
        shakeX: shake > 0 ? (Math.random() * 2 - 1) * shake : 0,
        shakeY: shake > 0 ? (Math.random() * 2 - 1) * shake : 0,
        camX,
        camY,
        shooterLift,
        shooterTeam: shotTeam,
        shooterIdx: shotIdx,
        meterCenter,
        meterHalf,
        meterFlash,
        meterFlashKind,
        tipUp,
        tipH: tipHomeIdx,
        tipA: tipAwayIdx,
        netL: netJiggleL,
        netR: netJiggleR,
        netT: t,
        homePoses,
        awayPoses,
      }
    }

    let raf = 0
    let last = 0
    let stopped = false
    function frame(time: number) {
      if (stopped) return
      if (last === 0) last = time
      now = time / 1000
      if (!lastInputAt) lastInputAt = now // start the idle countdown from first frame
      let dt = Math.min(0.034, (time - last) / 1000)
      last = time
      if (matchMode && quarter === 2 && gameClock <= 8 && Math.abs(us - them) <= 6 && phase === 'shooting')
        dt *= 0.4
      // Slight slow-motion while a jump shot is being lined up (you or the AI).
      if (phase === 'windup' || (phase === 'live' && possession === 'home' && controls.current.charging))
        dt *= 0.65
      update(dt)
      publish()
      if (matchMode) pushHud()
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      stopped = true
      cancelAnimationFrame(raf)
    }
    // NOTE: deliberately NOT depending on `franchise` — the sim reads roster/colors
    // from getState() at init. Re-running mid-match (because the store recreated the
    // franchise object, e.g. an autosave) would respawn everyone + restart the tip-off.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [W, H, matchMode, rematchKey])

  const gameReward = (f: { us: number; win: boolean } | null) => {
    const fan = useGame.getState().franchise?.fanInterest ?? 50
    return f ? 20 + (f.win ? 30 : 0) + Math.floor(f.us / 4) + Math.floor(fan / 10) : 0
  }
  function commitResult() {
    if (!final) return
    const g = useGame.getState()
    g.recordGameResult(final.win, gameReward(final))
    g.advanceSeason(final.win)
  }
  function finishGame() {
    if (!final) return
    commitResult()
    const g = useGame.getState()
    const phaseNow = useGame.getState().franchise?.seasonState.phase
    if (phaseNow === 'regular' && g.triggerPressEvent()) g.navigate('press')
    else g.navigate('lobby')
  }
  function rematch() {
    setFinal(null)
    setRematchKey((k) => k + 1)
  }

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    if (Math.abs(width - dims.w) > 1 || Math.abs(height - dims.h) > 1) setDims({ w: width, h: height })
  }

  // ONE manual multi-touch gesture handles the whole court: per-finger routing
  // to the joystick or a button. Created once; reads live geometry/buttons from
  // refs so it never goes stale and never gets recreated (which would drop it).
  const touch = useMemo(
    () =>
      Gesture.Manual()
        .runOnJS(true)
        .onTouchesDown((e) => {
          for (const t of e.changedTouches) {
            const hit = buttonsRef.current.find(
              (b) => t.x >= b.x && t.x <= b.x + b.size && t.y >= b.y && t.y <= b.y + b.size,
            )
            if (hit) {
              btnTouches.current.set(t.id, hit)
              hit.onIn()
              setDown((d) => ({ ...d, [hit.key]: true }))
            } else if (joyTouchId.current === null && t.x < geomRef.current.W * 0.55) {
              joyTouchId.current = t.id
              joyRef.current = { on: true, bx: t.x, by: t.y, vx: 0, vy: 0 }
            }
          }
        })
        .onTouchesMove((e) => {
          const mr = geomRef.current.maxR || 1
          for (const t of e.changedTouches) {
            if (t.id === joyTouchId.current) {
              const j = joyRef.current
              const dx = t.x - j.bx
              const dy = t.y - j.by
              const len = Math.hypot(dx, dy)
              const cl = Math.min(len, mr)
              j.vx = len > 0 ? (dx / len) * (cl / mr) : 0
              j.vy = len > 0 ? (dy / len) * (cl / mr) : 0
            }
          }
        })
        .onTouchesUp((e) => {
          for (const t of e.changedTouches) {
            if (t.id === joyTouchId.current) {
              joyTouchId.current = null
              joyRef.current = { on: false, bx: 0, by: 0, vx: 0, vy: 0 }
            } else {
              const b = btnTouches.current.get(t.id)
              if (b) {
                b.onOut?.()
                btnTouches.current.delete(t.id)
                setDown((d) => ({ ...d, [b.key]: false }))
              }
            }
          }
        })
        .onTouchesCancelled((e) => {
          for (const t of e.changedTouches) {
            if (t.id === joyTouchId.current) {
              joyTouchId.current = null
              joyRef.current = { on: false, bx: 0, by: 0, vx: 0, vy: 0 }
            } else {
              const b = btnTouches.current.get(t.id)
              if (b) {
                b.onOut?.()
                btnTouches.current.delete(t.id)
                setDown((d) => ({ ...d, [b.key]: false }))
              }
            }
          }
        }),
    [],
  )

  // Stable, memoized control handlers so the buttons' gestures never get
  // recreated on the frequent HUD re-renders (recreated gestures don't fire).
  const A = useMemo(() => {
    const c = controls.current
    return {
      shootIn: () => {
        c.charging = true
      },
      shootOut: () => {
        c.charging = false
        c.release = true
      },
      pass: () => {
        c.pass = true
      },
      sprintIn: () => {
        c.sprint = true
      },
      sprintOut: () => {
        c.sprint = false
      },
      steal: () => {
        c.steal = true
      },
      block: () => {
        c.block = true
      },
      switchD: () => {
        c.switchD = true
      },
    }
  }, [])

  // Button rectangles (right side, bottom-anchored). Computed so rendering and
  // the touch hit-test use the exact same coordinates.
  const buttons = useMemo<BtnDef[]>(() => {
    if (W < 10 || H < 10) return []
    const padR = insets.right + 16
    const padB = insets.bottom + 16
    const big = 78
    const sm = 62
    const gap = 14
    const rightX = (size: number) => W - padR - size
    const top = H - padB - (big + gap + sm)
    if (onDefense) {
      return [
        { key: 'steal', label: 'STEAL', icon: '✋', colors: BTN_RED, size: big, x: rightX(big), y: top, onIn: A.steal },
        { key: 'block', label: 'BLOCK', icon: '🛡', colors: BTN_GREEN, size: sm, x: rightX(big) - gap - sm, y: top + (big - sm) / 2, onIn: A.block },
        { key: 'switch', label: 'SWITCH', icon: '🔄', colors: BTN_BLUE, size: sm, x: rightX(sm), y: top + big + gap, onIn: A.switchD },
      ]
    }
    return [
      { key: 'shoot', label: 'SHOOT', icon: '🏀', colors: BTN_GOLD, size: big, x: rightX(big), y: top, onIn: A.shootIn, onOut: A.shootOut },
      { key: 'pass', label: 'PASS', icon: '➜', colors: BTN_BLUE, size: sm, x: rightX(sm), y: top + big + gap, onIn: A.pass },
    ]
  }, [W, H, insets.right, insets.bottom, onDefense, A])

  // keep the gesture's refs current (the gesture itself is created once)
  buttonsRef.current = buttons
  geomRef.current = { W, maxR }

  return (
    <View style={styles.wrap}>
      {/* Scoreboard */}
      <View style={[styles.scoreboard, { top: insets.top + 6 }]}>
        <Pressable style={styles.sbBack} onPress={() => navigate('lobby')}>
          <Text style={styles.sbBackTxt}>‹</Text>
        </Pressable>
        <LinearGradient colors={[T.panelRaised, T.panel]} style={styles.sbBar}>
          <View style={[styles.sbChip, { backgroundColor: homeColor }]}>
            <Text style={styles.sbAbbr}>{hud.homeAbbr}</Text>
          </View>
          <Heading size={24} color={T.white} style={styles.sbScoreNum}>
            {hud.us}
          </Heading>
          <View style={styles.sbCenter}>
            <Text style={styles.sbQ}>{hud.quarter === 1 ? '1ST' : '2ND'}</Text>
            <Heading size={18} color={hud.clock <= 10 ? T.teamB : T.white}>
              {mmss(hud.clock)}
            </Heading>
            <View style={[styles.sbShotPill, hud.shot <= 5 && { backgroundColor: T.teamB }]}>
              <Text style={styles.sbShotTxt}>{hud.shot}</Text>
            </View>
          </View>
          <Heading size={24} color={T.white} style={styles.sbScoreNum}>
            {hud.them}
          </Heading>
          <View style={[styles.sbChip, { backgroundColor: oppColorUi }]}>
            <Text style={styles.sbAbbr}>{hud.awayAbbr}</Text>
          </View>
        </LinearGradient>
      </View>

      {/* Court */}
      <View style={styles.courtArea} onLayout={onLayout}>
        {W > 10 && H > 10 && (
          <CourtScene
            sv={sv}
            w={W}
            h={H}
            pr={pr}
            maxR={maxR}
            homeColor={homeColor}
            awayColor={awayColor}
            homeNames={homeNames}
            homePos={homePos}
            awayLabel={awayLabel}
            teamLetter={(franchise?.teamName?.[0] ?? 'H').toUpperCase()}
            homeLooks={homeLooks}
            awayLooks={awayLooks}
          />
        )}

        {/* Button visuals (input handled by the surface below) — 3D candy */}
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {buttons.map((b) => {
            const isDown = !!down[b.key]
            const depth = 6
            const big = b.size >= 78
            return (
              <View
                key={b.key}
                style={{ position: 'absolute', left: b.x, top: b.y, width: b.size, height: b.size + depth }}
              >
                {/* darker bottom band */}
                <View
                  style={{
                    position: 'absolute',
                    top: depth,
                    width: b.size,
                    height: b.size,
                    borderRadius: b.size / 2,
                    backgroundColor: b.colors.band,
                  }}
                />
                {/* gradient face */}
                <View style={{ transform: [{ translateY: isDown ? depth : 0 }, { scale: isDown ? 0.95 : 1 }] }}>
                  <LinearGradient
                    colors={[b.colors.a, b.colors.b]}
                    style={{
                      width: b.size,
                      height: b.size,
                      borderRadius: b.size / 2,
                      borderWidth: 3,
                      borderColor: 'rgba(255,255,255,0.55)',
                      alignItems: 'center',
                      justifyContent: 'center',
                      ...SHADOW,
                    }}
                  >
                    <Text style={{ fontSize: big ? 30 : 22 }}>{b.icon}</Text>
                    <Text
                      style={{
                        fontFamily: FONT.black,
                        fontSize: big ? 11 : 9,
                        marginTop: 1,
                        letterSpacing: 0.5,
                        color: b.colors.fg,
                        ...(b.colors.fg === T.white ? OUTLINE : null),
                      }}
                    >
                      {b.label}
                    </Text>
                  </LinearGradient>
                </View>
              </View>
            )
          })}
        </View>

        {/* Single full-court multi-touch input surface */}
        <GestureDetector gesture={touch}>
          <View style={StyleSheet.absoluteFill} />
        </GestureDetector>

        {/* Active player info */}
        <View style={[styles.playerInfo, { left: insets.left + 10, top: insets.top + 8 }]} pointerEvents="none">
          <LinearGradient colors={[T.panelRaised, T.panel]} style={styles.piInner}>
            <View style={styles.piRow}>
              {!!hud.activePos && (
                <View style={styles.piPos}>
                  <Text style={styles.piPosTxt}>{hud.activePos}</Text>
                </View>
              )}
              <Text style={styles.piName}>{hud.activeName || 'Player'}</Text>
            </View>
            <Text style={styles.piStats}>
              PTS <Text style={styles.piStatsB}>{hud.activePts}</Text>
            </Text>
          </LinearGradient>
        </View>

        {/* AUTO badge — shown while the AI is running your team (you're idle) */}
        {hud.auto && (
          <View style={[styles.autoBadge, { left: insets.left + 10, top: insets.top + 66 }]} pointerEvents="none">
            <View style={styles.autoDot} />
            <Text style={styles.autoTxt}>AUTO</Text>
          </View>
        )}

        {/* Center message — punchy zoom-in per callout, fade out on clear */}
        {!!msg.text && (
          <Animated.View
            key={msg.id}
            entering={ZoomIn.springify().damping(11).stiffness(180)}
            exiting={FadeOut.duration(180)}
            style={styles.msgWrap}
            pointerEvents="none"
          >
            <Text style={[styles.msg, MSG_COLOR[msg.kind]]}>{msg.text}</Text>
          </Animated.View>
        )}

        {/* Results / end-of-game screen */}
        {final && (
          <ResultsOverlay
            final={final}
            homeAbbr={hud.homeAbbr}
            awayAbbr={hud.awayAbbr}
            homeColor={homeColor}
            awayColor={oppColorUi}
            reward={gameReward(final)}
            height={H}
            onContinue={finishGame}
            onRematch={rematch}
            onMenu={() => {
              commitResult()
              navigate('lobby')
            }}
          />
        )}
      </View>
    </View>
  )
}

/* ---------- visual subcomponents (read the shared snapshot) ---------- */

// Memoized so HUD/clock/message/button re-renders never reconcile the court —
// the players, ball and court only re-render on a real layout change. This is
// the main smoothness win: the per-frame animation loop runs uncontested.
// A realistic hanging net: a tapered cone of vertical strands (rim → throat) woven
// with horizontal rings. Built once per rim in court coordinates.
// White DIAMOND-MESH net hanging from the rim and tapering inward: ~12 strands
// crossed by a second diagonal set make the diamonds; bottom ring ~60% rim width.
// Light is top-left, so the bottom-right strands are shaded slightly darker.
function netMeshElements(rimX: number, rimY: number, pr: number, _dir: number): React.ReactNode[] {
  const rings = 4
  const strands = 12
  // top of the net = the rim ellipse (flat, on the ground plane); it hangs STRAIGHT
  // down (gravity) tapering to a smaller ellipse — same camera as the court markings.
  const topRx = pr * 3.4 * CHAR_SCALE * 0.235 * HOOP_SCALE // = the rim half-width
  const topRy = topRx * 0.4
  const botRx = topRx * 0.6
  const botRy = topRy * 0.6
  const drop = topRx * 2 * 1.2 // net length ≈ 1.2× rim width
  const node = (k: number, s: number) => {
    const t = k / rings
    const cx = rimX // straight down — no sideways drift
    const cy = rimY + drop * t
    const rx = topRx + (botRx - topRx) * t
    const ry = topRy + (botRy - topRy) * t
    const a = (s / strands) * Math.PI * 2
    return { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry, a }
  }
  const els: React.ReactNode[] = []
  // two crossing diagonal sets → diamond mesh
  for (let k = 0; k < rings; k++) {
    for (let s = 0; s < strands; s++) {
      const a = node(k, s)
      const down = Math.sin(a.a) > -0.2 // front/bottom strands read brighter
      const col = down ? 'rgba(255,255,255,0.78)' : 'rgba(214,224,236,0.5)'
      const b1 = node(k + 1, s + 0.5)
      const b2 = node(k + 1, s - 0.5)
      els.push(<Line key={`d1${rimX}-${k}-${s}`} x1={a.x} y1={a.y} x2={b1.x} y2={b1.y} stroke={col} strokeWidth={1.4} />)
      els.push(<Line key={`d2${rimX}-${k}-${s}`} x1={a.x} y1={a.y} x2={b2.x} y2={b2.y} stroke={col} strokeWidth={1.4} />)
    }
  }
  // hoop rings reinforce the diamond rows + cap the bottom
  for (let k = 1; k <= rings; k++) {
    const t = k / rings
    els.push(
      <Ellipse
        key={`ring${rimX}-${k}`}
        cx={rimX}
        cy={rimY + drop * t}
        rx={topRx + (botRx - topRx) * t}
        ry={topRy + (botRy - topRy) * t}
        stroke="rgba(255,255,255,0.5)"
        strokeWidth={1}
        fill="none"
      />,
    )
  }
  return els
}

// Animated net layer: a full-court SVG that plays a short, canned SWISH animation
// each time the ball passes through this rim — NOT a physics sim. Because the SVG is
// full height, scaleY pivots at h/2 = rimY (the rim line), so the net bulges straight
// down from the rim, then springs back and settles. The sim pulses netL/netR to 1 on
// a make; we edge-detect that to fire the keyframes.
function Net({
  sv,
  side,
  rimX,
  rimY,
  pr,
  dir,
  w,
  h,
}: {
  sv: ReturnType<typeof useSharedValue<Snap>>
  side: 'left' | 'right'
  rimX: number
  rimY: number
  pr: number
  dir: number
  w: number
  h: number
}) {
  const mesh = useMemo(() => netMeshElements(rimX, rimY, pr, dir), [rimX, rimY, pr, dir])
  const swish = useSharedValue(0) // 0 rest → 1 fully bulged
  useAnimatedReaction(
    () => (side === 'left' ? sv.value.netL : sv.value.netR),
    (cur, prev) => {
      // rising edge = the ball just went through → play the swish once
      if (cur > 0.5 && (prev ?? 0) <= 0.5) {
        swish.value = withSequence(
          withTiming(1, { duration: 90, easing: Easing.out(Easing.quad) }), // snap down
          withSpring(0, { damping: 11, stiffness: 170, mass: 0.5 }), // spring back + settle
        )
      }
    },
  )
  const style = useAnimatedStyle(() => {
    const s = swish.value
    // bulge the net downward (stretch + a little drop); pivots at the rim line
    return { transform: [{ translateY: s * pr * 0.45 }, { scaleY: 1 + s * 0.5 }] }
  })
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
        {mesh}
      </Svg>
    </Animated.View>
  )
}

// Animated modular character in-game: smooth position via Reanimated (UI thread),
// and the locomotion/dribble pose polled from the published snapshot (~30fps).
function CharActor({
  sv,
  team,
  i,
  pr,
  appearance,
  name,
}: {
  sv: ReturnType<typeof useSharedValue<Snap>>
  team: Team
  i: number
  pr: number
  appearance: CharacterAppearance
  name?: string
}) {
  const bodyH = pr * 3.4 * CHAR_SCALE // on-screen body height (152 viewBox units)
  const Wd = (bodyH * 100) / 152
  const fullH = (bodyH * VB_H) / 152 // taller: includes the jump/raised-arm headroom
  const feetIn = ((138 - VB_TOP) / VB_H) * fullH // feet measured from the box top
  const ringW = Wd * 0.72
  const ringH = Wd * 0.28
  const posStyle = useAnimatedStyle(() => {
    const p = sv.value[team][i]
    return { transform: [{ translateX: p.x - Wd / 2 }, { translateY: p.y + pr * 1.0 - feetIn }] }
  })
  const ringStyle = useAnimatedStyle(() => {
    const s = sv.value
    return { opacity: team === 'home' && s.active === i && s.activeShow ? 1 : 0 }
  })
  const [pose, setPose] = useState<Pose>(restPose())
  useEffect(() => {
    let raf = 0
    let f = 0
    const loop = () => {
      f++
      if (f % 2 === 0) {
        const arr = team === 'home' ? sv.value.homePoses : sv.value.awayPoses
        if (arr && arr[i]) setPose(arr[i])
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [i, team, sv])
  return (
    <Animated.View style={[{ position: 'absolute', width: Wd, height: fullH }, posStyle]} pointerEvents="none">
      <Character appearance={appearance} size={bodyH} pose={pose} />
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: Wd / 2 - ringW / 2,
            top: feetIn - ringH / 2,
            width: ringW,
            height: ringH,
            borderRadius: ringW,
            borderWidth: 2.5,
            borderColor: C.gold,
          },
          ringStyle,
        ]}
      />
      {name ? (
        <Text
          numberOfLines={1}
          style={{
            position: 'absolute',
            top: feetIn + ringH * 0.4,
            left: Wd / 2 - pr * 2,
            width: pr * 4,
            textAlign: 'center',
            fontSize: Math.max(8, Math.round(pr * 0.4)),
            fontWeight: '700',
            color: 'rgba(255,255,255,0.92)',
          }}
        >
          {name}
        </Text>
      ) : null}
    </Animated.View>
  )
}

const CourtScene = memo(function CourtScene({
  sv,
  w,
  h,
  pr,
  maxR,
  homeColor,
  awayColor,
  homeNames,
  homePos,
  awayLabel,
  teamLetter,
  homeLooks,
  awayLooks,
}: {
  sv: ReturnType<typeof useSharedValue<Snap>>
  w: number
  h: number
  pr: number
  maxR: number
  homeColor: string
  awayColor: string
  homeNames: string[]
  homePos: string[]
  awayLabel: string
  teamLetter: string
  homeLooks: CharacterAppearance[]
  awayLooks: CharacterAppearance[]
}) {
  return (
    <CourtShake sv={sv}>
      <CourtSvg w={w} h={h} pr={pr} teamLetter={teamLetter} homeColor={homeColor} awayColor={awayColor} />
      <Net sv={sv} side="left" rimX={w * 0.1} rimY={h * 0.5} pr={pr} dir={-1} w={w} h={h} />
      <Net sv={sv} side="right" rimX={w * 0.9} rimY={h * 0.5} pr={pr} dir={1} w={w} h={h} />
      {USE_CHARACTERS ? (
        <>
          {[0, 1, 2, 3, 4].map((i) => (
            <CharActor key={`a${i}`} sv={sv} team="away" i={i} pr={pr} appearance={awayLooks[i]} name={awayLabel} />
          ))}
          {homeNames.map((nm, i) => (
            <CharActor key={`h${i}`} sv={sv} team="home" i={i} pr={pr} appearance={homeLooks[i]} name={nm} />
          ))}
        </>
      ) : (
        <>
          {[0, 1, 2, 3, 4].map((i) => (
            <Actor key={`a${i}`} sv={sv} team="away" i={i} pr={pr} color={awayColor} name={awayLabel} />
          ))}
          {homeNames.map((nm, i) => (
            <Actor key={`h${i}`} sv={sv} team="home" i={i} pr={pr} color={homeColor} name={nm} pos={homePos[i]} />
          ))}
        </>
      )}
      <Ball sv={sv} pr={pr} />
      <ChargeMeter sv={sv} pr={pr} />
      <Joystick sv={sv} maxR={maxR} />
    </CourtShake>
  )
})

function CourtShake({ sv, children }: { sv: ReturnType<typeof useSharedValue<Snap>>; children: React.ReactNode }) {
  // slight overscan zoom so the camera can pan without revealing edges
  const style = useAnimatedStyle(() => ({
    transform: [
      { scale: 1.07 },
      { translateX: sv.value.shakeX + sv.value.camX },
      { translateY: sv.value.shakeY + sv.value.camY },
    ],
  }))
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      {children}
    </Animated.View>
  )
}

function Actor({
  sv,
  team,
  i,
  pr,
  color,
  name,
  pos,
}: {
  sv: ReturnType<typeof useSharedValue<Snap>>
  team: Team
  i: number
  pr: number
  color: string
  name: string
  pos?: string
}) {
  const size = pr * 2
  const posStyle = useAnimatedStyle(() => {
    const p = sv.value[team][i]
    return { transform: [{ translateX: p.x - pr }, { translateY: p.y - pr }] }
  })
  const ringStyle = useAnimatedStyle(() => {
    const s = sv.value
    const on = team === 'home' && s.active === i && s.activeShow
    return { opacity: on ? 1 : 0 }
  })
  // Lift: jump shot OR tip-off leap (shadow + ring stay on the ground).
  const liftStyle = useAnimatedStyle(() => {
    const s = sv.value
    const shoot = s.shooterTeam === team && s.shooterIdx === i ? s.shooterLift : 0
    const tip = (team === 'home' && s.tipH === i) || (team === 'away' && s.tipA === i) ? s.tipUp : 0
    return { transform: [{ translateY: -Math.max(shoot, tip) * pr * 2 }] }
  })
  const shadowStyle = useAnimatedStyle(() => {
    const s = sv.value
    const shoot = s.shooterTeam === team && s.shooterIdx === i ? s.shooterLift : 0
    const tip = (team === 'home' && s.tipH === i) || (team === 'away' && s.tipA === i) ? s.tipUp : 0
    const f = Math.max(shoot, tip)
    return { transform: [{ scale: 1 - f * 0.25 }], opacity: 1 - f * 0.25 }
  })
  return (
    <Animated.View style={[{ position: 'absolute', width: size, height: size }, posStyle]}>
      {/* shadow (stays grounded) */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: pr * 0.15,
            top: pr * 1.35,
            width: pr * 1.7,
            height: pr * 0.5,
            borderRadius: pr,
            backgroundColor: 'rgba(0,0,0,0.22)',
          },
          shadowStyle,
        ]}
      />
      {/* active ring (stays grounded) */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: pr * 0.05,
            top: pr * 1.25,
            width: pr * 1.9,
            height: pr * 0.7,
            borderRadius: pr,
            borderWidth: 3,
            borderColor: C.gold,
          },
          ringStyle,
        ]}
      />
      {/* body + head + name lift together for the jump */}
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: size, height: size }, liftStyle]}>
        {/* jersey body with shaded highlight + drop, and a number */}
        <View
          style={{
            position: 'absolute',
            left: pr * 0.35,
            top: pr * 0.55,
            width: pr * 1.3,
            height: pr * 1.25,
            borderTopLeftRadius: pr * 0.65,
            borderTopRightRadius: pr * 0.65,
            borderBottomLeftRadius: pr * 0.2,
            borderBottomRightRadius: pr * 0.2,
            backgroundColor: color,
            borderWidth: 1.5,
            borderColor: 'rgba(0,0,0,0.4)',
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: pr * 0.55, backgroundColor: 'rgba(255,255,255,0.22)' }} />
          <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: pr * 0.5, backgroundColor: 'rgba(0,0,0,0.2)' }} />
          <Text
            style={{
              fontFamily: FONT.black,
              fontSize: pr * 0.62,
              color: 'rgba(255,255,255,0.95)',
              textShadowColor: 'rgba(0,0,0,0.5)',
              textShadowOffset: { width: 0, height: 1 },
              textShadowRadius: 1,
            }}
          >
            {i + 1}
          </Text>
        </View>
        {/* head with highlight */}
        <View
          style={{
            position: 'absolute',
            left: pr * 0.58,
            top: pr * 0.1,
            width: pr * 0.84,
            height: pr * 0.84,
            borderRadius: pr * 0.42,
            backgroundColor: '#e8b88f',
            borderWidth: 1.5,
            borderColor: 'rgba(0,0,0,0.35)',
            overflow: 'hidden',
          }}
        >
          <View style={{ position: 'absolute', top: pr * 0.08, left: pr * 0.14, width: pr * 0.28, height: pr * 0.28, borderRadius: pr * 0.14, backgroundColor: 'rgba(255,255,255,0.4)' }} />
        </View>
        <Text
          numberOfLines={1}
          style={{
            position: 'absolute',
            top: pr * 1.95,
            left: -pr,
            width: pr * 4,
            textAlign: 'center',
            fontSize: Math.max(8, Math.round(pr * 0.42)),
            fontWeight: '700',
            color: 'rgba(255,255,255,0.92)',
          }}
        >
          {name}
        </Text>
      </Animated.View>
    </Animated.View>
  )
}

function Ball({ sv, pr }: { sv: ReturnType<typeof useSharedValue<Snap>>; pr: number }) {
  const r = pr * 0.4 // smaller ball (~70% of before) — less visually intrusive
  const seam = Math.max(1, r * 0.14)
  // ground shadow that shrinks as the ball rises
  const shadowStyle = useAnimatedStyle(() => {
    const b = sv.value.ball
    const h = Math.max(0, b.z)
    const k = 1 / (1 + h / (pr * 2))
    return {
      opacity: b.show ? 0.22 * k : 0,
      transform: [{ translateX: b.x - r }, { translateY: b.y - r * 0.4 }, { scaleX: k }, { scaleY: k * 0.5 }],
    }
  })
  // ball body: rises with z and spins
  const style = useAnimatedStyle(() => {
    const b = sv.value.ball
    return {
      opacity: b.show ? 1 : 0,
      transform: [
        { translateX: b.x - r },
        { translateY: b.y - r - b.z },
        { rotate: `${b.spin}deg` },
      ],
    }
  })
  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[
          { position: 'absolute', width: r * 2, height: r * 2, borderRadius: r, backgroundColor: '#000' },
          shadowStyle,
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            width: r * 2,
            height: r * 2,
            borderRadius: r,
            backgroundColor: C.orange,
            borderWidth: 1.5,
            borderColor: 'rgba(80,30,0,0.85)',
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
          },
          style,
        ]}
      >
        {/* basketball seams (spin with the ball) */}
        <View style={{ position: 'absolute', width: seam, height: r * 2, backgroundColor: 'rgba(60,20,0,0.85)' }} />
        <View style={{ position: 'absolute', width: r * 2, height: seam, backgroundColor: 'rgba(60,20,0,0.85)' }} />
        <View
          style={{
            position: 'absolute',
            width: r * 1.7,
            height: r * 1.7,
            borderRadius: r,
            borderWidth: seam,
            borderColor: 'transparent',
            borderLeftColor: 'rgba(60,20,0,0.85)',
            borderRightColor: 'rgba(60,20,0,0.85)',
          }}
        />
      </Animated.View>
    </>
  )
}

function ChargeMeter({ sv, pr }: { sv: ReturnType<typeof useSharedValue<Snap>>; pr: number }) {
  // small, calm bar that floats just above the shooter's head
  const w = pr * 3.2
  const h = 7
  const clmp = (v: number, a: number, b: number) => {
    'worklet'
    return Math.max(a, Math.min(b, v))
  }
  // anchor above the active home shooter; linger briefly on release (flash)
  const box = useAnimatedStyle(() => {
    const s = sv.value
    const p = s.home[s.active]
    const vis = s.charging ? 1 : s.meterFlash > 0.02 ? s.meterFlash : 0
    return { opacity: vis, transform: [{ translateX: p.x - w / 2 }, { translateY: p.y - pr * 3 }] }
  })
  const green = useAnimatedStyle(() => {
    const s = sv.value
    return { left: (s.meterCenter - s.meterHalf) * w, width: s.meterHalf * 2 * w }
  })
  const amberL = useAnimatedStyle(() => {
    const s = sv.value
    return { left: (s.meterCenter - s.meterHalf * 1.9) * w, width: s.meterHalf * 0.9 * w }
  })
  const amberR = useAnimatedStyle(() => {
    const s = sv.value
    return { left: (s.meterCenter + s.meterHalf) * w, width: s.meterHalf * 0.9 * w }
  })
  const fillStyle = useAnimatedStyle(() => ({ width: clmp(sv.value.charge, 0, 1) * w }))
  const markerStyle = useAnimatedStyle(() => ({ transform: [{ translateX: clmp(sv.value.charge, 0, 1) * w - 2.5 }] }))
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          width: w,
          height: h,
          borderRadius: h / 2,
          borderWidth: 2,
          borderColor: T.ink,
          overflow: 'hidden',
          backgroundColor: '#16233f',
        },
        box,
      ]}
    >
      {/* track — red toward the edges, navy in the middle */}
      <LinearGradient
        colors={['rgba(235,87,87,0.5)', '#16233f', '#16233f', 'rgba(235,87,87,0.5)']}
        locations={[0, 0.22, 0.78, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      {/* amber "good" zones */}
      <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, backgroundColor: 'rgba(242,201,76,0.75)' }, amberL]} />
      <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, backgroundColor: 'rgba(242,201,76,0.75)' }, amberR]} />
      {/* green sweet spot (solid, with a tiny top highlight — no pulse/glow) */}
      <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, backgroundColor: T.green }, green]} />
      <Animated.View style={[{ position: 'absolute', top: 0, height: 1.5, backgroundColor: 'rgba(255,255,255,0.4)' }, green]} />
      {/* thin building fill */}
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: 'rgba(255,233,168,0.4)' }, fillStyle]} />
      {/* small readable marker */}
      <Animated.View
        style={[
          { position: 'absolute', top: -1, height: h + 2, width: 5, borderRadius: 2.5, backgroundColor: '#fff', borderWidth: 1, borderColor: T.ink },
          markerStyle,
        ]}
      />
    </Animated.View>
  )
}

function Joystick({ sv, maxR }: { sv: ReturnType<typeof useSharedValue<Snap>>; maxR: number }) {
  const base = useAnimatedStyle(() => {
    const j = sv.value.joy
    return {
      opacity: j.on ? 1 : 0,
      transform: [{ translateX: j.bx - maxR }, { translateY: j.by - maxR }],
    }
  })
  const thumbR = maxR * 0.45
  const thumb = useAnimatedStyle(() => {
    const j = sv.value.joy
    return {
      opacity: j.on ? 1 : 0,
      transform: [{ translateX: j.bx + j.vx * maxR - thumbR }, { translateY: j.by + j.vy * maxR - thumbR }],
    }
  })
  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            width: maxR * 2,
            height: maxR * 2,
            borderRadius: maxR,
            borderWidth: 3,
            borderColor: 'rgba(255,255,255,0.3)',
            backgroundColor: 'rgba(255,255,255,0.08)',
          },
          base,
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            width: thumbR * 2,
            height: thumbR * 2,
            borderRadius: thumbR,
            backgroundColor: 'rgba(255,207,74,0.85)',
          },
          thumb,
        ]}
      />
    </>
  )
}

function CourtSvg({
  w,
  h,
  pr,
  teamLetter,
  homeColor,
  awayColor,
}: {
  w: number
  h: number
  pr: number
  teamLetter: string
  homeColor: string
  awayColor: string
}) {
  const band = h * 0.07 // MUST match the sim's play-area band (OOB/positions)
  const mx = w * 0.035
  const rimY = h * 0.5
  const leftRimX = w * 0.1
  const rightRimX = w * 0.9
  const arcR = Math.min(w * 0.2, (h * 0.5 - h * 0.07) * 0.9)
  const keyW = w * 0.13
  const keyH = h * 0.4
  const line = 'rgba(255,255,255,0.9)'
  const arcPath = (cx: number, cy: number, r: number, a0: number, a1: number) => {
    const x0 = cx + r * Math.cos(a0)
    const y0 = cy + r * Math.sin(a0)
    const x1 = cx + r * Math.cos(a1)
    const y1 = cy + r * Math.sin(a1)
    const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0
    return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`
  }

  // ---- crowd: tiered rows of chunky cartoon fans, team-colored sections ----
  const fanColors = ['#e7c14a', '#d96b4a', '#4a78d9', '#54b08a', '#b46bd9', '#e0e0e0']
  const crowd: React.ReactNode[] = []
  const cols = Math.ceil(w / (pr * 0.9))
  const rows = 3
  for (let band01 = 0; band01 < 2; band01++) {
    for (let row = 0; row < rows; row++) {
      const cy = band01 === 0 ? band - 6 - row * (band / rows) : h - band + 8 + row * (band / rows)
      for (let c = 0; c < cols; c++) {
        const cx = (c + (row % 2) * 0.5) * (pr * 0.9) + pr * 0.4
        // home section on the left third, away on the right third
        const tint = cx < w * 0.34 ? homeColor : cx > w * 0.66 ? awayColor : fanColors[(c + row) % fanColors.length]
        crowd.push(<Circle key={`f${band01}-${row}-${c}`} cx={cx} cy={cy} r={pr * 0.22} fill={tint} opacity={0.92} />)
      }
    }
  }

  // ---- a readable, dimensional hoop (light from top-left). Net is the animated
  // <Net> layer; stanchion / backboard / rim are drawn here back-to-front. ----
  const hoop = (rimX: number, dir: number) => {
    // ONE camera (slight-overhead tilt), matching court + players:
    //  • backboard = upright board FACING the camera (like a player's body),
    //  • rim = flat ellipse on the ground plane (like the court lines),
    //  • net hangs straight down, pole stands upright on the floor behind the board.
    const playerH = pr * 3.4 * CHAR_SCALE
    const rimRx = playerH * 0.235 * HOOP_SCALE // rim half-width ≈ 0.47× player height
    const rimRy = rimRx * 0.4 // flat, wider-than-tall (ground plane)
    const bbW = rimRx * 2.5 // backboard FACE: wider than tall
    const bbH = rimRx * 1.6
    const bbCX = rimX + dir * rimRx * 0.85 // board just behind the rim, toward the baseline
    const bbBottom = rimY - rimRy * 0.6 // board base sits just above the rim
    const bbTop = bbBottom - bbH
    const bbCY = (bbTop + bbBottom) / 2
    const boardBack = bbCX + (dir * bbW) / 2
    const poleX = bbCX + dir * (bbW * 0.5 + rimRx * 0.5) // upright pole behind the board
    const poleBaseY = rimY + bbH * 0.5
    const frame = '#27314a'
    return (
      <G key={`hoop${rimX}`}>
        {/* upright pole on the floor (shadow → pole → padded base) */}
        <Ellipse cx={poleX} cy={poleBaseY + rimRx * 0.16} rx={rimRx * 0.7} ry={rimRx * 0.16} fill="rgba(0,0,0,0.22)" />
        <Rect x={poleX - rimRx * 0.13} y={bbCY} width={rimRx * 0.26} height={poleBaseY - bbCY} fill="#3A3F4A" rx={3} />
        <Rect x={poleX - rimRx * 0.34} y={poleBaseY - rimRx * 0.1} width={rimRx * 0.68} height={rimRx * 0.42} rx={4} fill="#10203A" stroke={frame} strokeWidth={1.5} />
        {/* single straight arm: pole → back of the board */}
        <Rect x={Math.min(poleX, boardBack)} y={bbCY - rimRx * 0.1} width={Math.abs(poleX - boardBack)} height={rimRx * 0.2} fill="#3A3F4A" rx={2} />
        {/* backboard FACE (glass + frame), top-left highlight, orange target square */}
        <Rect x={bbCX - bbW / 2 + 2} y={bbTop + 3} width={bbW} height={bbH} rx={4} fill="rgba(0,0,0,0.16)" />
        <Rect x={bbCX - bbW / 2} y={bbTop} width={bbW} height={bbH} rx={4} fill="rgba(255,255,255,0.75)" stroke={frame} strokeWidth={2.5} />
        <Rect x={bbCX - bbW / 2 + 3} y={bbTop + 3} width={bbW * 0.34} height={bbH * 0.4} rx={3} fill="rgba(255,255,255,0.45)" />
        <Rect x={bbCX - bbW * 0.17} y={bbBottom - bbH * 0.52} width={bbW * 0.34} height={bbH * 0.4} stroke="#E8702A" strokeWidth={2.5} fill="none" />
        {/* connector: board front-bottom → rim */}
        <Line x1={bbCX - dir * bbW * 0.22} y1={bbBottom} x2={rimX + dir * rimRx * 0.6} y2={rimY} stroke="#E8702A" strokeWidth={3} />
        {/* rim: flat ground-plane ellipse (thick ring) + top-left highlight */}
        <Ellipse cx={rimX} cy={rimY} rx={rimRx} ry={rimRy} fill="none" stroke="#C2551B" strokeWidth={5} />
        <Ellipse cx={rimX} cy={rimY} rx={rimRx} ry={rimRy} fill="none" stroke="#E8702A" strokeWidth={3} />
        <Path d={`M ${rimX - rimRx} ${rimY} A ${rimRx} ${rimRy} 0 0 1 ${rimX} ${rimY - rimRy}`} stroke="#ffca9c" strokeWidth={1.6} fill="none" />
      </G>
    )
  }

  // ---- Layer A: hardwood planks (horizontal rows, alternating tones + variation) ----
  const shadeHex = (hex: string, amt: number) => {
    const n = parseInt(hex.slice(1), 16)
    const cl = (v: number) => Math.max(0, Math.min(255, v + amt))
    return `#${((1 << 24) + (cl((n >> 16) & 255) << 16) + (cl((n >> 8) & 255) << 8) + cl(n & 255)).toString(16).slice(1)}`
  }
  const playTop = band
  const playBot = h - band
  const playH = playBot - playTop
  const nPlanks = 22
  const ph = playH / nPlanks
  const planks: React.ReactNode[] = []
  for (let i = 0; i < nPlanks; i++) {
    const base = i % 2 === 0 ? '#C9923F' : '#BE8636'
    const v = (((i * 37) % 11) - 5) * 2.4 // deterministic ±~5% brightness
    planks.push(<Rect key={`pk${i}`} x={mx} y={playTop + i * ph} width={w - 2 * mx} height={ph + 0.6} fill={shadeHex(base, v)} />)
    if (i > 0)
      planks.push(<Line key={`sm${i}`} x1={mx} y1={playTop + i * ph} x2={w - mx} y2={playTop + i * ph} stroke="#8A5E2A" strokeWidth={1} opacity={0.4} />)
    for (let g = 0; g < 2; g++) {
      const gx = mx + (((i * 53 + g * 311) % 100) / 100) * (w - 2 * mx - 70)
      const gy = playTop + i * ph + ph * 0.5
      planks.push(
        <Path key={`gr${i}-${g}`} d={`M${gx} ${gy} q18 ${ph * 0.18} 36 0 q18 ${-ph * 0.18} 36 0`} stroke="rgba(86,58,26,0.16)" strokeWidth={1} fill="none" />,
      )
    }
  }
  const ftR = keyH * 0.32

  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
      <Defs>
        <SvgLinearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#e0a85e" />
          <Stop offset="0.5" stopColor="#cd9450" />
          <Stop offset="1" stopColor="#a9763c" />
        </SvgLinearGradient>
        <RadialGradient id="spot" cx="0.5" cy="0.46" rx="0.5" ry="0.42">
          <Stop offset="0" stopColor="#fff3d8" stopOpacity="0.28" />
          <Stop offset="0.6" stopColor="#ffe7b8" stopOpacity="0.08" />
          <Stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="sheen" cx="0.5" cy="0.42" rx="0.55" ry="0.5">
          <Stop offset="0" stopColor="#ffffff" stopOpacity="0.16" />
          <Stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="vignette" cx="0.5" cy="0.5" rx="0.75" ry="0.7">
          <Stop offset="0.55" stopColor="#000000" stopOpacity="0" />
          <Stop offset="1" stopColor="#000000" stopOpacity="0.45" />
        </RadialGradient>
        <SvgLinearGradient id="standsTop" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#10142a" />
          <Stop offset="1" stopColor="#222a48" />
        </SvgLinearGradient>
        <SvgLinearGradient id="standsBot" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#222a48" />
          <Stop offset="1" stopColor="#10142a" />
        </SvgLinearGradient>
      </Defs>

      {/* Layer D base: dark navy surround so the lit floor pops */}
      <Rect x={0} y={0} width={w} height={h} fill="#10203A" />

      {/* Layer A: hardwood planks (within the play area) */}
      <Rect x={mx} y={playTop} width={w - 2 * mx} height={playH} fill="url(#floor)" />
      {planks}

      {/* Layer B: warm spotlight + sheen */}
      <Rect x={mx} y={playTop} width={w - 2 * mx} height={playH} fill="url(#spot)" />
      <Rect x={mx} y={playTop} width={w - 2 * mx} height={playH} fill="url(#sheen)" />

      {/* tiered crowd stands */}
      <Rect x={0} y={0} width={w} height={band} fill="url(#standsTop)" />
      <Rect x={0} y={h - band} width={w} height={band} fill="url(#standsBot)" />
      {crowd}
      <Rect x={0} y={band - 3} width={w} height={3} fill="rgba(255,255,255,0.15)" />
      <Rect x={0} y={h - band} width={w} height={3} fill="rgba(255,255,255,0.15)" />

      {/* Layer C: painted keys (team-tinted) + free-throw circles */}
      <Rect x={mx} y={rimY - keyH / 2} width={keyW} height={keyH} fill={homeColor} opacity={0.25} stroke={line} strokeWidth={3} />
      <Rect x={w - mx - keyW} y={rimY - keyH / 2} width={keyW} height={keyH} fill={awayColor} opacity={0.25} stroke={line} strokeWidth={3} />
      <Circle cx={mx + keyW} cy={rimY} r={ftR} stroke={line} strokeWidth={3} fill="none" />
      <Circle cx={w - mx - keyW} cy={rimY} r={ftR} stroke={line} strokeWidth={3} fill="none" />

      {/* boundary + half-court line */}
      <Rect x={mx} y={band} width={w - 2 * mx} height={h - 2 * band} stroke={line} strokeWidth={3} fill="none" />
      <Line x1={w / 2} y1={band} x2={w / 2} y2={h - band} stroke={line} strokeWidth={3} />

      {/* center circle + logo */}
      <Circle cx={w / 2} cy={rimY} r={h * 0.15} stroke={line} strokeWidth={3} fill="rgba(255,255,255,0.04)" />
      <Circle cx={w / 2} cy={rimY} r={h * 0.1} fill={homeColor} opacity={0.16} />
      <SvgText x={w / 2} y={rimY + h * 0.055} fontSize={h * 0.16} fontWeight="bold" fill="rgba(255,255,255,0.12)" textAnchor="middle">
        {teamLetter}
      </SvgText>

      {/* 3pt arcs */}
      <Path d={arcPath(leftRimX, rimY, arcR, -0.42 * Math.PI, 0.42 * Math.PI)} stroke={line} strokeWidth={3} fill="none" />
      <Path d={arcPath(rightRimX, rimY, arcR, 0.58 * Math.PI, 1.42 * Math.PI)} stroke={line} strokeWidth={3} fill="none" />

      {/* hoops */}
      {hoop(leftRimX, -1)}
      {hoop(rightRimX, 1)}

      {/* vignette for depth (~20% darker edges) */}
      <Rect x={0} y={0} width={w} height={h} fill="url(#vignette)" pointerEvents="none" />
    </Svg>
  )
}

function ConfettiPiece({
  x,
  delay,
  dur,
  rot,
  color,
  w,
  fall,
}: {
  x: number
  delay: number
  dur: number
  rot: number
  color: string
  w: number
  fall: number
}) {
  const ty = useSharedValue(-30)
  const op = useSharedValue(1)
  useEffect(() => {
    ty.value = withDelay(delay, withTiming(fall, { duration: dur }))
    op.value = withDelay(delay + dur * 0.65, withTiming(0, { duration: dur * 0.35 }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: ty.value }, { rotate: `${rot}deg` }],
    opacity: op.value,
  }))
  return (
    <Animated.View
      style={[
        { position: 'absolute', top: 0, left: `${x * 100}%`, width: w, height: w * 1.4, borderRadius: 3, backgroundColor: color },
        style,
      ]}
    />
  )
}

function Confetti({ height }: { height: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => ({
        x: Math.random(),
        delay: Math.random() * 500,
        dur: 1400 + Math.random() * 1400,
        rot: Math.floor(Math.random() * 360),
        color: [T.gold, T.amber, T.teamA, T.teamB, T.green, T.white][i % 6],
        w: 8 + Math.floor(Math.random() * 6),
      })),
    [],
  )
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => (
        <ConfettiPiece key={i} {...p} fall={height + 40} />
      ))}
    </View>
  )
}

function ResultsOverlay({
  final,
  homeAbbr,
  awayAbbr,
  homeColor,
  awayColor,
  reward,
  height,
  onContinue,
  onRematch,
  onMenu,
}: {
  final: { us: number; them: number; win: boolean; mvpName: string; mvpPts: number }
  homeAbbr: string
  awayAbbr: string
  homeColor: string
  awayColor: string
  reward: number
  height: number
  onContinue: () => void
  onRematch: () => void
  onMenu: () => void
}) {
  const win = final.win
  const margin = Math.abs(final.us - final.them)
  const stars = win ? (margin >= 15 ? 3 : margin >= 6 ? 2 : 1) : 0
  const [shown, setShown] = useState(0)
  useEffect(() => {
    let v = 0
    const step = Math.max(1, Math.ceil(reward / 28))
    const id = setInterval(() => {
      v = Math.min(reward, v + step)
      setShown(v)
      if (v >= reward) clearInterval(id)
    }, 28)
    return () => clearInterval(id)
  }, [reward])
  return (
    <View style={styles.finalWrap}>
      {win && <Confetti height={height} />}
      <Animated.View entering={ZoomIn.springify().damping(12).stiffness(140)} style={{ width: 440, maxWidth: '92%' }}>
        <Panel padded={false}>
          <View style={styles.resInner}>
            <Heading size={42} color={win ? T.gold : T.teamB}>{win ? 'VICTORY!' : 'DEFEAT'}</Heading>
            <View style={styles.resStars}>
              {[0, 1, 2].map((i) => (
                <Text key={i} style={{ fontSize: 30, opacity: i < stars ? 1 : 0.22 }}>
                  ⭐
                </Text>
              ))}
            </View>
            <View style={styles.resScoreRow}>
              <View style={[styles.resChip, { backgroundColor: homeColor }]}>
                <Text style={styles.resChipTxt}>{homeAbbr}</Text>
              </View>
              <Heading size={40} color={T.white}>
                {final.us}
              </Heading>
              <Heading size={24} color={T.muted}>
                –
              </Heading>
              <Heading size={40} color={T.white}>
                {final.them}
              </Heading>
              <View style={[styles.resChip, { backgroundColor: awayColor }]}>
                <Text style={styles.resChipTxt}>{awayAbbr}</Text>
              </View>
            </View>
            <View style={styles.resMvp}>
              <Text style={styles.resMvpTag}>MVP</Text>
              <Text style={styles.resMvpName}>{final.mvpName}</Text>
              <Text style={styles.resMvpPts}>{final.mvpPts} PTS</Text>
            </View>
            <Heading size={26} color={T.gold} style={styles.resReward}>
              🪙 +{shown}
            </Heading>
            <CandyButton label="CONTINUE" icon="▶" variant="primary" size="lg" fullWidth onPress={onContinue} />
            <View style={styles.resBtnRow}>
              <CandyButton label="REMATCH" variant="teamA" size="md" fullWidth style={{ flex: 1 }} onPress={onRematch} />
              <CandyButton label="MENU" variant="secondary" size="md" fullWidth style={{ flex: 1 }} onPress={onMenu} />
            </View>
          </View>
        </Panel>
      </Animated.View>
    </View>
  )
}

const MSG_COLOR: Record<string, { color: string }> = {
  make: { color: '#5ae68c' },
  three: { color: C.gold },
  dunk: { color: C.orange },
  miss: { color: '#ff8a8a' },
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0e1120' },
  courtArea: { flex: 1, overflow: 'hidden' },
  joyArea: { position: 'absolute', left: 0, top: 0, bottom: 0, width: '55%' },

  scoreboard: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sbBack: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: T.panelRaised,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOW,
  },
  sbBackTxt: { color: T.white, fontSize: 22, lineHeight: 24, fontFamily: FONT.black },
  sbBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: R.md,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.12)',
    ...SHADOW,
  },
  sbChip: {
    minWidth: 40,
    alignItems: 'center',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.25)',
  },
  sbAbbr: { fontFamily: FONT.black, fontSize: 12, color: '#fff', ...OUTLINE },
  sbScoreNum: { minWidth: 26, textAlign: 'center' },
  sbCenter: { alignItems: 'center', paddingHorizontal: 4 },
  sbQ: { fontFamily: FONT.bold, fontSize: 9, letterSpacing: 1, color: T.muted },
  sbShotPill: {
    marginTop: 1,
    minWidth: 22,
    alignItems: 'center',
    backgroundColor: T.panelDeep,
    borderRadius: R.pill,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  sbShotTxt: { fontFamily: FONT.black, fontSize: 11, color: T.gold },

  playerInfo: { position: 'absolute', zIndex: 8, ...SHADOW },
  autoBadge: {
    position: 'absolute',
    zIndex: 9,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(11,14,28,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(90,230,140,0.55)',
  },
  autoDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#5ae68c', marginRight: 6 },
  autoTxt: { color: '#5ae68c', fontFamily: FONT.black, fontSize: 11, letterSpacing: 1 },
  piInner: {
    gap: 2,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: R.md,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  piRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  piName: { fontFamily: FONT.black, fontSize: 13, color: T.white, ...OUTLINE },
  piPos: { backgroundColor: T.gold, borderRadius: 7, paddingHorizontal: 6, paddingVertical: 1 },
  piPosTxt: { fontFamily: FONT.black, fontSize: 10, color: T.ink },
  piStats: { fontFamily: FONT.semi, fontSize: 11, color: T.muted },
  piStatsB: { fontFamily: FONT.black, color: T.gold, fontSize: 14 },

  msgWrap: { position: 'absolute', top: '26%', left: 0, right: 0, alignItems: 'center', zIndex: 9 },
  msg: {
    fontFamily: FONT.black,
    fontSize: 30,
    color: T.white,
    letterSpacing: 0.5,
    textShadowColor: T.ink,
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 4,
  },

  finalWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10,12,22,0.7)',
  },
  resInner: { alignItems: 'center', paddingVertical: 22, paddingHorizontal: 24, gap: 14 },
  resStars: { flexDirection: 'row', gap: 6 },
  resScoreRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  resChip: {
    minWidth: 44,
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.25)',
  },
  resChipTxt: { fontFamily: FONT.black, fontSize: 14, color: '#fff', ...OUTLINE },
  resMvp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: T.panelDeep,
    borderRadius: R.pill,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 5,
    paddingHorizontal: 14,
  },
  resMvpTag: { fontFamily: FONT.black, fontSize: 11, color: T.ink, backgroundColor: T.gold, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden' },
  resMvpName: { fontFamily: FONT.bold, fontSize: 14, color: T.white },
  resMvpPts: { fontFamily: FONT.black, fontSize: 14, color: T.gold },
  resReward: { marginTop: 2 },
  resBtnRow: { flexDirection: 'row', gap: 12, alignSelf: 'stretch' },
})
