import { useEffect, useRef, useState } from 'react'
import { useGame } from '../state/store'
import { sfx } from '../audio/sfx'

/**
 * Full-court controllable 5v5. HOME attacks the RIGHT hoop, AWAY attacks the
 * LEFT hoop; each defends its own basket. Left joystick moves the active player;
 * the right button cluster swaps between offense and defense.
 */

interface P {
  x: number
  y: number
  team: 'home' | 'away'
}
type Team = 'home' | 'away'

// Offensive spots relative to the attacking rim (dx as a fraction of W toward
// center court, dy as a fraction of H from center). PG / 2 wings / 2 posts.
const SPOTS = [
  [-0.3, 0.0],
  [-0.22, -0.22],
  [-0.22, 0.22],
  [-0.13, -0.13],
  [-0.13, 0.13],
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

export default function Court5v5({ matchMode = false }: { matchMode?: boolean }) {
  const navigate = useGame((s) => s.navigate)
  const franchise = useGame((s) => s.franchise)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const controls = useRef<Controls>({
    sprint: false,
    charging: false,
    release: false,
    pass: false,
    switchD: false,
    steal: false,
    block: false,
  })
  const [msg, setMsg] = useState<{ text: string; kind: string }>({ text: '', kind: '' })
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
  })
  const [final, setFinal] = useState<{ us: number; them: number; win: boolean } | null>(null)
  const oppColorUi = matchMode ? useGame.getState().currentOpponent()?.color ?? '#e8503a' : '#e8503a'

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const st0 = useGame.getState()
    const starters = (st0.franchise?.roster ?? []).slice(0, 5)
    const homeShoot = starters.length ? starters.reduce((a, p) => a + p.shooting, 0) / starters.length : 6
    const avgMorale = starters.length ? starters.reduce((a, p) => a + p.morale, 0) / starters.length : 60
    const opp0 = matchMode ? st0.currentOpponent() : null
    const homeShootF = (0.82 + homeShoot * 0.03) * (0.9 + avgMorale * 0.0016)
    const awayShootF = 0.82 + (opp0?.offense ?? 6) * 0.03
    const homeAbbr = (st0.franchise?.teamName ?? 'HOM').slice(0, 3).toUpperCase()
    const awayAbbr = opp0?.abbr ?? 'OPP'
    const shortName = (full?: string) => {
      if (!full) return 'Player'
      const parts = full.split(' ')
      return parts.length > 1 ? `${parts[0][0]}. ${parts[parts.length - 1]}` : full
    }
    const homeNames = Array.from({ length: 5 }, (_, i) => shortName(starters[i]?.name))
    const homePos = Array.from({ length: 5 }, (_, i) => starters[i]?.pos ?? '')
    const homePoints = [0, 0, 0, 0, 0]

    const homeColor = franchise?.colorPrimary ?? '#ff8a3d'
    const awayColor = (matchMode && opp0?.color) || '#e8503a'
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    let W = 0
    let H = 0
    let mx = 0 // court side margin
    let leftRimX = 0
    let rightRimX = 0
    let rimY = 0
    let arcR = 0
    let pr = 18
    let ballR = 10
    let band = 26
    let SPEED = 200
    let AISPEED = 160

    const home: P[] = Array.from({ length: 5 }, () => ({ x: 0, y: 0, team: 'home' as Team }))
    const away: P[] = Array.from({ length: 5 }, () => ({ x: 0, y: 0, team: 'away' as Team }))
    let active = 0

    const cutUntil = new Array(5).fill(0)
    let nextCutAt = 0
    const awayCut = new Array(5).fill(0)
    let awayNextCut = 0

    const ball = { x: 0, y: 0, z: 0, t: 0, dur: 0.7, peak: 60 }
    let possession: Team = 'home'
    let awayHandler = 0
    let awayPossStart = 0
    let awayThinkAt = 0
    let awayStealAt = 0
    let stealCd = 0
    let blockUntil = 0
    let phase: 'live' | 'passing' | 'shooting' | 'resolved' = 'live'
    let charge = 0
    let stamina = 1
    let netFlash = 0
    let netSwish = 0
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
    let passFrom = 0
    let passTo = 0
    let passT = 0
    let passDur = 0.4

    // match clock / score
    const QUARTER_SECONDS = 60
    const SHOT_CLOCK = 20
    let us = 0
    let them = 0
    let quarter = 1
    let gameClock = QUARTER_SECONDS
    let shotClock = SHOT_CLOCK
    let ended = false
    let prevPossession: Team = 'home'
    let lastHudKey = ''

    let joyId: number | null = null
    let baseX = 0
    let baseY = 0
    let vx = 0
    let vy = 0
    let maxR = 60

    const result = (text: string, kind: string) => setMsg({ text, kind })
    const atkX = (team: Team) => (team === 'home' ? rightRimX : leftRimX)
    const offSpot = (i: number, team: Team) => {
      const rx = atkX(team)
      const d = team === 'home' ? 1 : -1
      return { x: rx + d * SPOTS[i][0] * W, y: H * 0.5 + SPOTS[i][1] * H }
    }
    const inX = (x: number) => clamp(x, mx + pr, W - mx - pr)
    const inY = (y: number) => clamp(y, band + pr, H - band - pr)

    function layout() {
      const rect = canvas!.getBoundingClientRect()
      W = rect.width
      H = rect.height
      canvas!.width = Math.floor(W * dpr)
      canvas!.height = Math.floor(H * dpr)
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      band = H * 0.07
      mx = W * 0.035
      rimY = H * 0.5
      leftRimX = W * 0.1
      rightRimX = W * 0.9
      arcR = Math.min(W * 0.26, H * 0.86)
      pr = Math.max(11, H * 0.058)
      ballR = pr * 0.55
      SPEED = H * 0.6
      AISPEED = H * 0.5
      maxR = Math.min(W, H) * 0.12
      // home sets up on the right (attacking right); away guards
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
      const layup = d < pr * 4.2
      const three = !layup && d > arcR
      const open = nearestDist(p, defenders) > pr * 4
      const baseP = layup ? 0.8 : three ? 0.42 : 0.56
      return { d, layup, three, open, baseP }
    }

    function bestPassTarget() {
      let best = -1
      let score = -Infinity
      home.forEach((p, i) => {
        if (i === active) return
        const s = nearestDist(p, away) + (p.x - home[active].x) * 0.3
        if (s > score) {
          score = s
          best = i
        }
      })
      return best
    }

    function flipToHome() {
      possession = 'home'
      active = 0
      setOnDefense(false)
      phase = 'live'
    }
    function flipToAway(handlerIdx: number) {
      possession = 'away'
      awayHandler = handlerIdx
      awayPossStart = now
      awayThinkAt = now + 0.5
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
      setOnDefense(true)
    }

    function doPass() {
      const target = bestPassTarget()
      if (target < 0) return
      const a = home[active]
      const b = home[target]
      for (let i = 0; i < away.length; i++) {
        const d = away[i]
        if (segDist(d.x, d.y, a.x, a.y, b.x, b.y) < pr * 1.1 && Math.random() < 0.3) {
          result('INTERCEPTED!', 'miss')
          sfx.aww()
          flipToAway(i)
          return
        }
      }
      passFrom = active
      passTo = target
      passT = 0
      passDur = clamp(dist(a.x, a.y, b.x, b.y) / (W * 1.1), 0.3, 0.7)
      phase = 'passing'
      sfx.pass()
    }

    function launchShot(p: P, rx: number, info: ReturnType<typeof shotInfo>) {
      shotKind = info.layup ? 'layup' : info.three ? '3' : '2'
      lastRimX = rx
      shotFrom.x = p.x
      shotFrom.y = p.y
      ball.x = p.x
      ball.y = p.y
      ball.z = 0
      ball.t = 0
      ball.dur = info.layup ? 0.5 : 0.78
      ball.peak = info.layup ? H * 0.12 : clamp(info.d * 0.26, H * 0.14, H * 0.4)
      if (made) {
        land.x = rx
        land.y = rimY
      } else {
        land.x = rx + (Math.random() * 2 - 1) * pr * 1.3
        land.y = rimY + (Math.random() * 2 - 1) * pr * 1.3
      }
      phase = 'shooting'
      sfx.shoot()
    }

    function doShoot(c: number) {
      const a = home[active]
      const rx = atkX('home')
      const info = shotInfo(a, away, rx)
      let prob = info.baseP * (info.open ? 1.12 : 0.62) * timingFactor(c) * homeShootF
      prob = clamp(prob, 0.05, 0.96)
      made = Math.random() < prob
      launchShot(a, rx, info)
    }

    function awayShoot() {
      const bh = away[awayHandler]
      const rx = atkX('away')
      const contestD = dist(home[active].x, home[active].y, bh.x, bh.y)
      if (contestD < pr * 2.7 && now < blockUntil) {
        result('BLOCKED!', 'miss')
        sfx.block()
        crowdJump = 0.6
        shake = Math.max(shake, 7)
        flipToHome()
        return
      }
      const info = shotInfo(bh, home, rx)
      let prob = info.baseP * (info.open ? 1.05 : 0.55) * (contestD < pr * 3 ? 0.62 : 1) * awayShootF
      prob = clamp(prob, 0.05, 0.92)
      made = Math.random() < prob
      launchShot(bh, rx, info)
    }

    function resolveShotFlight() {
      const clutch = matchMode && quarter === 4 && gameClock <= 10 && Math.abs(us - them) <= 7
      if (made) {
        const pts = shotKind === '3' ? 3 : 2
        if (possession === 'home') {
          us += pts
          homePoints[active] += pts
        } else them += pts
        netFlash = 0.45
        netSwish = 0.5
        crowdJump = clutch ? 0.85 : 0.6
        ball.x = lastRimX
        ball.y = rimY
        ball.z = 0
        if (shotKind === 'layup') {
          const dunk = dist(shotFrom.x, shotFrom.y, lastRimX, rimY) < pr * 2.6
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
      } else {
        result('MISS', 'miss')
        sfx.rim()
        sfx.aww()
        shake = Math.max(shake, 2)
      }
      phase = 'resolved'
      resolveAt = now + 0.9
    }

    function steerTo(p: P, tx: number, ty: number, spd: number, dt: number, sep = pr * 3) {
      let sx = 0
      let sy = 0
      for (const o of [...home, ...away]) {
        if (o === p) continue
        const d = dist(p.x, p.y, o.x, o.y)
        if (d > 0.1 && d < sep) {
          sx += (p.x - o.x) / d
          sy += (p.y - o.y) / d
        }
      }
      const gx = tx + sx * pr * 1.6 - p.x
      const gy = ty + sy * pr * 1.6 - p.y
      const d = Math.hypot(gx, gy)
      if (d > 2) {
        const s = Math.min(spd * dt, d)
        p.x = inX(p.x + (gx / d) * s)
        p.y = inY(p.y + (gy / d) * s)
      }
    }

    function runOffenseAI(dt: number) {
      const rx = atkX('home')
      if (now > nextCutAt) {
        nextCutAt = now + 2.4 + Math.random() * 1.8
        const cands: number[] = []
        for (let i = 0; i < home.length; i++) if (i !== active && now >= cutUntil[i]) cands.push(i)
        if (cands.length) cutUntil[cands[(Math.random() * cands.length) | 0]] = now + 1.2
      }
      for (let i = 0; i < home.length; i++) {
        if (i === active) continue
        const cutting = now < cutUntil[i]
        const sp = offSpot(i, 'home')
        const tx = cutting ? rx - pr * 2.6 : sp.x
        const ty = cutting ? rimY + (i - 2) * pr * 1.1 : sp.y
        steerTo(home[i], tx, ty, AISPEED, dt)
      }
    }

    // Opponent offense: patient, drives + kicks out, takes good shots, cuts.
    function runAwayOffenseAI(dt: number) {
      const rx = atkX('away')
      const bh = away[awayHandler]
      const openD = nearestDist(bh, home)
      const d2 = dist(bh.x, bh.y, rx, rimY)
      const contested = openD < pr * 2.7

      if (now > awayThinkAt) {
        awayThinkAt = now + 0.3
        const elapsed = now - awayPossStart
        // most-open teammate
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
        const forced = shotClock < 5 || elapsed > 11
        if (d2 < pr * 3.6 && !contested) return awayShoot() // open at the rim
        if (forced) return awayShoot() // beat the clock
        if (!contested && openD > pr * 5 && d2 < arcR * 1.05 && elapsed > 2 && Math.random() < 0.5)
          return awayShoot() // clean open jumper, with patience
        if (contested && bestT >= 0 && bestOpen > pr * 4) {
          awayHandler = bestT // driven into help → kick out
          sfx.pass()
          return
        }
        if (bestT >= 0 && bestOpen > openD + pr * 3.5 && Math.random() < 0.45) {
          awayHandler = bestT // swing to a much more open man
          sfx.pass()
          return
        }
      }

      // ball handler: probe toward the rim, sliding around the nearest defender
      let nd = Infinity
      let near: P | null = null
      for (const h of home) {
        const d = dist(bh.x, bh.y, h.x, h.y)
        if (d < nd) {
          nd = d
          near = h
        }
      }
      const driveX = d2 > arcR ? rx + (rx < W / 2 ? 1 : -1) * pr * 4 : rx + (rx < W / 2 ? 1 : -1) * pr * 2
      let ty = rimY
      if (near && nd < pr * 2.6) ty += (bh.y < rimY ? -1 : 1) * pr * 2.4
      steerTo(bh, driveX, ty, AISPEED * (contested ? 0.85 : 0.95), dt)

      // off-ball: space + staggered cuts to the rim
      if (now > awayNextCut) {
        awayNextCut = now + 2.6 + Math.random() * 2
        const cands: number[] = []
        for (let i = 0; i < away.length; i++) if (i !== awayHandler && now >= awayCut[i]) cands.push(i)
        if (cands.length) awayCut[cands[(Math.random() * cands.length) | 0]] = now + 1.1
      }
      for (let i = 0; i < away.length; i++) {
        if (i === awayHandler) continue
        const cutting = now < awayCut[i]
        const sp = offSpot(i, 'away')
        const tx = cutting ? rx - (rx < W / 2 ? -1 : 1) * pr * 2.6 : sp.x
        const tyy = cutting ? rimY + (i - 2) * pr * 1.1 : sp.y
        steerTo(away[i], tx, tyy, AISPEED * 0.82, dt)
      }
    }

    /**
     * Pack-line man defense for whichever team is guarding:
     * on-ball pressure, off-ball sag toward rim+ball (help position), and the
     * nearest helper collapses on a drive into the paint, then recovers.
     */
    function playDefense(defs: P[], off: P[], ballIdx: number, controlled: number | null, dt: number) {
      const rx = atkX(off[0].team) // rim the offense attacks
      const ball = off[ballIdx]
      for (let i = 0; i < defs.length; i++) {
        if (controlled != null && i === controlled) continue
        const man = off[i % off.length]
        const onBall = i % off.length === ballIdx
        if (onBall) {
          steerTo(defs[i], man.x + (rx - man.x) * 0.16, man.y + (rimY - man.y) * 0.16, AISPEED * 0.97, dt, pr * 2.2)
        } else {
          // help position: sag toward the rim, shifted toward the ball
          const sagX = man.x + (rx - man.x) * 0.45
          const sagY = man.y + (rimY - man.y) * 0.45
          steerTo(defs[i], sagX * 0.66 + ball.x * 0.34, sagY * 0.66 + ball.y * 0.34, AISPEED * 0.84, dt, pr * 2.2)
        }
      }
      // help on the drive: pull the nearest off-ball defender into the lane
      if (Math.abs(ball.x - rx) < W * 0.2) {
        let best = -1
        let bd = Infinity
        for (let i = 0; i < defs.length; i++) {
          if (i % off.length === ballIdx) continue
          if (controlled != null && i === controlled) continue
          const d = dist(defs[i].x, defs[i].y, ball.x, ball.y)
          if (d < bd) {
            bd = d
            best = i
          }
        }
        if (best >= 0) steerTo(defs[best], (ball.x + rx) / 2, (ball.y + rimY) / 2, AISPEED * 0.95, dt, pr * 2)
      }
    }

    function runHomeDefenseAI(dt: number) {
      playDefense(home, away, awayHandler, active, dt) // you control one home defender
    }
    function runAwayDefenseAI(dt: number) {
      playDefense(away, home, active, null, dt)
      if (phase === 'live' && now > awayStealAt) {
        awayStealAt = now + 1.3 + Math.random() * 1.6
        const def = away[active % away.length]
        if (dist(def.x, def.y, home[active].x, home[active].y) < pr * 2.1 && Math.random() < 0.14) {
          result('STOLEN!', 'miss')
          sfx.aww()
          flipToAway(active % away.length)
        }
      }
    }

    function doSwitch() {
      active = (active + 1) % home.length
      sfx.tap()
    }
    function doSteal() {
      if (stealCd > 0) return
      const d = dist(home[active].x, home[active].y, away[awayHandler].x, away[awayHandler].y)
      if (d < pr * 2.7 && Math.random() < 0.42) {
        possession = 'home'
        setOnDefense(false)
        phase = 'live'
        result('STEAL!', 'make')
        sfx.make()
      } else {
        stealCd = 0.7
        sfx.aww()
      }
    }

    function rebound() {
      let bestIdx = 0
      let bestIsHome = true
      let bestScore = -Infinity
      for (let i = 0; i < home.length; i++) {
        const s = -dist(home[i].x, home[i].y, lastRimX, rimY) + Math.random() * pr * 4
        if (s > bestScore) {
          bestScore = s
          bestIdx = i
          bestIsHome = true
        }
      }
      for (let i = 0; i < away.length; i++) {
        const s = -dist(away[i].x, away[i].y, lastRimX, rimY) + Math.random() * pr * 4
        if (s > bestScore) {
          bestScore = s
          bestIdx = i
          bestIsHome = false
        }
      }
      if (bestIsHome) {
        const off = possession === 'home'
        possession = 'home'
        active = bestIdx
        setOnDefense(false)
        result(off ? 'OFF. BOARD!' : 'REBOUND', 'make')
      } else {
        const off = possession === 'away'
        flipToAway(bestIdx)
        result(off ? 'OFF. BOARD!' : 'REBOUND', 'miss')
      }
    }

    function endGame() {
      ended = true
      sfx.buzzer()
      if (us > them) sfx.three()
      setFinal({ us, them, win: us > them })
    }
    function pushHud() {
      const aName = possession === 'home' ? homeNames[active] : awayAbbr
      const aPos = possession === 'home' ? homePos[active] : ''
      const aPts = possession === 'home' ? homePoints[active] : 0
      const key = `${us}|${them}|${quarter}|${Math.ceil(gameClock)}|${Math.ceil(shotClock)}|${aName}|${aPts}`
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
        })
      }
    }

    function update(dt: number) {
      t += dt
      if (shake > 0) shake = Math.max(0, shake - dt * 40)
      if (netFlash > 0) netFlash = Math.max(0, netFlash - dt)
      if (netSwish > 0) netSwish = Math.max(0, netSwish - dt)
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
          if (quarter >= 4) endGame()
          else {
            quarter += 1
            gameClock = QUARTER_SECONDS
            sfx.buzzer()
          }
        }
      }
      if (ended) return
      if (possession !== prevPossession) {
        prevPossession = possession
        shotClock = SHOT_CLOCK
      }
      if (stealCd > 0) stealCd -= dt

      const c = controls.current
      let speed = SPEED
      if (c.sprint && stamina > 0.02) {
        speed *= 1.6
        stamina = Math.max(0, stamina - dt * 0.5)
      } else {
        stamina = Math.min(1, stamina + dt * 0.3)
      }

      const a = home[active]
      a.x = inX(a.x + vx * speed * dt)
      a.y = inY(a.y + vy * speed * dt)

      if (possession === 'home') {
        runOffenseAI(dt)
        runAwayDefenseAI(dt)
        if (phase === 'live') {
          if (c.pass) {
            c.pass = false
            doPass()
          } else if (c.charging) {
            charge = Math.min(1.15, charge + dt / 0.9)
          }
          if (c.release) {
            c.release = false
            if (charge > 0.05) doShoot(charge)
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
        runHomeDefenseAI(dt)
        if (phase === 'live') runAwayOffenseAI(dt)
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
          blockUntil = now + 0.45
          sfx.shoot()
        }
        c.pass = false
        c.release = false
        charge = 0
      }

      if (phase === 'passing') {
        passT += dt / passDur
        const pa = home[passFrom]
        const pb = home[passTo]
        const k = clamp(passT, 0, 1)
        ball.x = pa.x + (pb.x - pa.x) * k
        ball.y = pa.y + (pb.y - pa.y) * k
        ball.z = Math.sin(Math.PI * k) * pr * 0.6
        if (passT >= 1) {
          active = passTo
          ball.z = 0
          phase = 'live'
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
      } else if (phase === 'resolved' && now >= resolveAt) {
        ball.z = 0
        result('', '')
        const shooter = possession
        if (made) {
          if (shooter === 'home') flipToAway(0)
          else flipToHome()
        } else {
          rebound()
        }
        phase = 'live'
      }
    }

    // ---- drawing ----
    function line(x1: number, y1: number, x2: number, y2: number) {
      ctx!.beginPath()
      ctx!.moveTo(x1, y1)
      ctx!.lineTo(x2, y2)
      ctx!.stroke()
    }
    function drawCourt() {
      const top = band
      const bot = H - band
      const cl = W / 2
      ctx!.fillStyle = '#c98a4a'
      ctx!.fillRect(0, 0, W, H)
      ctx!.fillStyle = 'rgba(0,0,0,0.05)'
      for (let i = 0; i < W; i += 28) ctx!.fillRect(i, 0, 1, H)
      // crowd
      ctx!.fillStyle = '#1a1f33'
      ctx!.fillRect(0, 0, W, band)
      ctx!.fillRect(0, H - band, W, band)
      const hop = crowdJump > 0 ? Math.sin((1 - Math.min(1, crowdJump / 0.6)) * Math.PI) * 5 : 0
      for (let i = 0; i < 70; i++) {
        ctx!.fillStyle = ['#3a4170', '#4a3a6a', '#5a4a3a', '#3a5a4a'][i % 4]
        const cx = (i * 41) % W
        ctx!.beginPath()
        ctx!.arc(cx + 6, (i % 2 === 0 ? band * 0.5 : H - band * 0.5) - hop, 3.5, 0, Math.PI * 2)
        ctx!.fill()
      }
      ctx!.strokeStyle = 'rgba(255,255,255,0.65)'
      ctx!.lineWidth = 2.5
      // boundary
      ctx!.strokeRect(mx, top, W - 2 * mx, bot - top)
      // center line + circle
      line(cl, top, cl, bot)
      ctx!.beginPath()
      ctx!.arc(cl, H / 2, H * 0.13, 0, Math.PI * 2)
      ctx!.stroke()
      ctx!.globalAlpha = 0.1
      ctx!.fillStyle = '#fff'
      ctx!.font = `bold ${pr * 2}px sans-serif`
      ctx!.textAlign = 'center'
      ctx!.textBaseline = 'middle'
      ctx!.fillText((franchise?.teamName?.[0] ?? 'H').toUpperCase(), cl, H / 2)
      ctx!.globalAlpha = 1
      ctx!.textBaseline = 'alphabetic'
      // keys + arcs for both ends
      const keyW = W * 0.13
      const keyH = H * 0.4
      ctx!.fillStyle = 'rgba(255,255,255,0.08)'
      ctx!.strokeStyle = 'rgba(255,255,255,0.65)'
      // left key
      ctx!.fillRect(mx, rimY - keyH / 2, keyW, keyH)
      ctx!.strokeRect(mx, rimY - keyH / 2, keyW, keyH)
      ctx!.beginPath()
      ctx!.arc(mx + keyW, rimY, keyH * 0.32, -Math.PI / 2, Math.PI / 2)
      ctx!.stroke()
      // right key
      ctx!.fillRect(W - mx - keyW, rimY - keyH / 2, keyW, keyH)
      ctx!.strokeRect(W - mx - keyW, rimY - keyH / 2, keyW, keyH)
      ctx!.beginPath()
      ctx!.arc(W - mx - keyW, rimY, keyH * 0.32, Math.PI / 2, (3 * Math.PI) / 2)
      ctx!.stroke()
      // 3pt arcs
      ctx!.beginPath()
      ctx!.arc(leftRimX, rimY, arcR, -0.42 * Math.PI, 0.42 * Math.PI)
      ctx!.stroke()
      ctx!.beginPath()
      ctx!.arc(rightRimX, rimY, arcR, 0.58 * Math.PI, 1.42 * Math.PI)
      ctx!.stroke()
      drawHoop(leftRimX, -1)
      drawHoop(rightRimX, 1)
    }
    function drawHoop(rx: number, dir: number) {
      // backboard just outside the rim
      ctx!.fillStyle = '#eef1f6'
      ctx!.fillRect(rx + dir * pr * 1.4, rimY - H * 0.1, 5, H * 0.2)
      ctx!.strokeStyle = '#ff6a2a'
      ctx!.lineWidth = 4
      ctx!.beginPath()
      ctx!.ellipse(rx, rimY, pr * 0.45, pr * 0.75, 0, 0, Math.PI * 2)
      ctx!.stroke()
      const swishHere = Math.abs(rx - lastRimX) < 1
      const sw = swishHere && netSwish > 0 ? netSwish / 0.5 : 0
      ctx!.strokeStyle = swishHere && netFlash > 0 ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.55)'
      ctx!.lineWidth = 1.4
      for (let i = -2; i <= 2; i++) {
        const sway = Math.sin((0.5 - netSwish) * 26 + i * 1.5) * pr * 0.16 * sw
        line(rx, rimY + (i / 2) * pr * 0.65, rx - dir * pr * 0.6 + sway, rimY + (i / 4) * pr * 0.65 + sw * pr * 0.25)
      }
    }
    function drawPlayer(p: P, color: string) {
      ctx!.fillStyle = 'rgba(0,0,0,0.22)'
      ctx!.beginPath()
      ctx!.ellipse(p.x, p.y + pr * 0.85, pr * 0.85, pr * 0.38, 0, 0, Math.PI * 2)
      ctx!.fill()
      ctx!.fillStyle = color
      ctx!.beginPath()
      ctx!.moveTo(p.x - pr * 0.65, p.y + pr * 0.75)
      ctx!.lineTo(p.x - pr * 0.5, p.y - pr * 0.2)
      ctx!.quadraticCurveTo(p.x, p.y - pr * 0.65, p.x + pr * 0.5, p.y - pr * 0.2)
      ctx!.lineTo(p.x + pr * 0.65, p.y + pr * 0.75)
      ctx!.closePath()
      ctx!.fill()
      ctx!.fillStyle = '#e8b88f'
      ctx!.beginPath()
      ctx!.arc(p.x, p.y - pr * 0.65, pr * 0.42, 0, Math.PI * 2)
      ctx!.fill()
    }
    function drawActiveMarker(p: P) {
      const pulse = 1 + Math.sin(t * 6) * 0.12
      ctx!.strokeStyle = '#ffcf4a'
      ctx!.lineWidth = 3.5
      ctx!.beginPath()
      ctx!.ellipse(p.x, p.y + pr * 0.85, pr * 1.15 * pulse, pr * 0.5 * pulse, 0, 0, Math.PI * 2)
      ctx!.stroke()
      ctx!.fillStyle = '#ffcf4a'
      const ay = p.y - pr * 1.6 - Math.sin(t * 6) * 2
      ctx!.beginPath()
      ctx!.moveTo(p.x - pr * 0.32, ay)
      ctx!.lineTo(p.x + pr * 0.32, ay)
      ctx!.lineTo(p.x, ay + pr * 0.42)
      ctx!.closePath()
      ctx!.fill()
    }
    function drawBall(x: number, y: number, z: number) {
      if (z > 1) {
        ctx!.fillStyle = 'rgba(0,0,0,0.2)'
        ctx!.beginPath()
        ctx!.ellipse(x, y, ballR * 0.8, ballR * 0.4, 0, 0, Math.PI * 2)
        ctx!.fill()
      }
      const by = y - z
      ctx!.fillStyle = '#ff8a3d'
      ctx!.beginPath()
      ctx!.arc(x, by, ballR, 0, Math.PI * 2)
      ctx!.fill()
      ctx!.strokeStyle = 'rgba(80,30,0,0.7)'
      ctx!.lineWidth = 1.2
      ctx!.beginPath()
      ctx!.arc(x, by, ballR, 0, Math.PI * 2)
      ctx!.moveTo(x - ballR, by)
      ctx!.lineTo(x + ballR, by)
      ctx!.stroke()
    }
    function drawOverlays() {
      const a = home[active]
      if (phase === 'live' && possession === 'home' && controls.current.charging) {
        const bw = pr * 2.6
        const bx = a.x - bw / 2
        const by = a.y - pr * 2.6
        ctx!.fillStyle = 'rgba(0,0,0,0.5)'
        ctx!.fillRect(bx, by, bw, 7)
        ctx!.fillStyle = 'rgba(90,230,140,0.55)'
        ctx!.fillRect(bx + bw * 0.78, by, bw * 0.17, 7)
        ctx!.fillStyle = '#ffcf4a'
        ctx!.fillRect(bx, by, bw * clamp(charge, 0, 1), 7)
        const info = shotInfo(a, away, atkX('home'))
        const prob = clamp(info.baseP * (info.open ? 1.12 : 0.62) * timingFactor(charge) * homeShootF, 0.05, 0.96)
        ctx!.fillStyle = '#fff'
        ctx!.font = 'bold 13px system-ui'
        ctx!.textAlign = 'center'
        ctx!.fillText(`${Math.round(prob * 100)}%`, a.x, by - 5)
      }
      if (now < blockUntil) {
        ctx!.strokeStyle = '#b86bff'
        ctx!.lineWidth = 3
        ctx!.beginPath()
        ctx!.arc(a.x, a.y - pr * 1.9, pr * 0.55, 0, Math.PI * 2)
        ctx!.stroke()
      }
      if (stamina < 0.999) {
        const bw = pr * 1.6
        const bx = a.x - bw / 2
        const by = a.y + pr * 1.2
        ctx!.fillStyle = 'rgba(0,0,0,0.5)'
        ctx!.fillRect(bx, by, bw, 4)
        ctx!.fillStyle = stamina > 0.3 ? '#3aa0ff' : '#e8503a'
        ctx!.fillRect(bx, by, bw * stamina, 4)
      }
    }
    function label(x: number, y: number, text: string, color: string) {
      ctx!.font = `bold ${Math.max(9, Math.round(pr * 0.5))}px system-ui`
      ctx!.textAlign = 'center'
      ctx!.lineWidth = 3
      ctx!.strokeStyle = 'rgba(0,0,0,0.8)'
      ctx!.strokeText(text, x, y)
      ctx!.fillStyle = color
      ctx!.fillText(text, x, y)
    }
    function holderPct() {
      const holder = possession === 'home' ? home[active] : away[awayHandler]
      const defs = possession === 'home' ? away : home
      const info = shotInfo(holder, defs, atkX(possession))
      const f = possession === 'home' ? homeShootF : awayShootF
      return Math.round(clamp(info.baseP * (info.open ? 1.1 : 0.6) * f, 0.05, 0.96) * 100)
    }
    function drawLabels() {
      const ly = (p: P) => p.y + pr * 1.55
      const holdsHome = possession === 'home' && phase === 'live'
      for (let i = 0; i < home.length; i++) {
        if (holdsHome && i === active) {
          label(home[i].x, ly(home[i]), `${homeNames[i]} ${holderPct()}%`, '#ffe27a')
        } else {
          label(home[i].x, ly(home[i]), homeNames[i], 'rgba(255,255,255,0.92)')
        }
      }
      if (possession === 'away' && phase === 'live') {
        const h = away[awayHandler]
        label(h.x, ly(h), `${awayAbbr} ${holderPct()}%`, '#ffb0a0')
      }
    }
    function drawJoystick() {
      if (joyId === null) return
      ctx!.fillStyle = 'rgba(255,255,255,0.08)'
      ctx!.strokeStyle = 'rgba(255,255,255,0.3)'
      ctx!.lineWidth = 3
      ctx!.beginPath()
      ctx!.arc(baseX, baseY, maxR, 0, Math.PI * 2)
      ctx!.fill()
      ctx!.stroke()
      ctx!.fillStyle = 'rgba(255,207,74,0.85)'
      ctx!.beginPath()
      ctx!.arc(baseX + vx * maxR, baseY + vy * maxR, maxR * 0.45, 0, Math.PI * 2)
      ctx!.fill()
    }
    function render() {
      ctx!.save()
      if (shake > 0) ctx!.translate((Math.random() * 2 - 1) * shake, (Math.random() * 2 - 1) * shake)
      drawCourt()
      for (const p of away) drawPlayer(p, awayColor)
      home.forEach((p, i) => {
        if (i === active && phase !== 'passing') drawActiveMarker(p)
        drawPlayer(p, homeColor)
      })
      if (phase === 'live') {
        const hp = possession === 'home' ? home[active] : away[awayHandler]
        drawBall(hp.x + pr * 0.8, hp.y + pr * 0.1, 0)
      } else {
        drawBall(ball.x, ball.y, ball.z)
      }
      drawLabels()
      drawOverlays()
      ctx!.restore()
      drawJoystick()
    }

    let raf = 0
    let last = performance.now()
    function frame(time: number) {
      now = time / 1000
      let dt = Math.min(0.034, (time - last) / 1000)
      last = time
      if (matchMode && quarter === 4 && gameClock <= 8 && Math.abs(us - them) <= 6 && phase === 'shooting') dt *= 0.4
      update(dt)
      render()
      if (matchMode) pushHud()
      raf = requestAnimationFrame(frame)
    }

    function localPt(e: PointerEvent) {
      const r = canvas!.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    function onDown(e: PointerEvent) {
      const p = localPt(e)
      if (p.x < W * 0.55 && joyId === null) {
        joyId = e.pointerId
        baseX = p.x
        baseY = p.y
        vx = 0
        vy = 0
        canvas!.setPointerCapture(e.pointerId)
      }
      e.preventDefault()
    }
    function onMove(e: PointerEvent) {
      if (e.pointerId !== joyId) return
      const p = localPt(e)
      const dx = p.x - baseX
      const dy = p.y - baseY
      const len = Math.hypot(dx, dy)
      const cl = Math.min(len, maxR)
      vx = len > 0 ? (dx / len) * (cl / maxR) : 0
      vy = len > 0 ? (dy / len) * (cl / maxR) : 0
    }
    function onUp(e: PointerEvent) {
      if (e.pointerId !== joyId) return
      joyId = null
      vx = 0
      vy = 0
    }

    layout()
    const ro = new ResizeObserver(() => layout())
    ro.observe(canvas)
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
    }
  }, [franchise, matchMode])

  function finishGame() {
    if (!final) return
    const g = useGame.getState()
    const fan = g.franchise?.fanInterest ?? 50
    const credits = 20 + (final.win ? 30 : 0) + Math.floor(final.us / 4) + Math.floor(fan / 10)
    g.recordGameResult(final.win, credits)
    g.advanceSeason(final.win)
    const phaseNow = useGame.getState().franchise?.seasonState.phase
    if (phaseNow === 'regular' && g.triggerPressEvent()) g.navigate('press')
    else g.navigate('season')
  }

  const press = (fn: (c: Controls) => void) => (e: React.PointerEvent) => {
    e.preventDefault()
    fn(controls.current)
  }

  return (
    <div className="court-wrap">
      {matchMode ? (
        <div className="scoreboard">
          <button className="court-back" onClick={() => navigate('season')} aria-label="Back">
            ‹
          </button>
          <div className="sb-team" style={{ ['--p']: franchise?.colorPrimary } as React.CSSProperties}>
            <span className="sb-abbr">{hud.homeAbbr}</span>
            <span className="sb-score">{hud.us}</span>
          </div>
          <div className="sb-team opp" style={{ ['--p']: oppColorUi } as React.CSSProperties}>
            <span className="sb-score">{hud.them}</span>
            <span className="sb-abbr">{hud.awayAbbr}</span>
          </div>
          <div className="sb-center">
            <span className="sb-q">Q{hud.quarter}</span>
            <span className={`sb-clock${hud.clock <= 10 ? ' clutch' : ''}`}>{mmss(hud.clock)}</span>
            <span className={`sb-shot${hud.shot <= 5 ? ' low' : ''}`}>:{hud.shot}</span>
          </div>
        </div>
      ) : (
        <div className="court-hud">
          <button className="court-back" onClick={() => navigate('hub')} aria-label="Back">
            ‹
          </button>
          <div className="court-stat">
            <span className="cs-k">5v5</span>
            <span className="cs-v">PRACTICE</span>
          </div>
          <div className="court-hint-top">
            {onDefense ? (
              <>
                <b>DEFENSE</b> · <b>SWITCH</b> · <b>STEAL</b> · <b>BLOCK</b> · <b>SPRINT</b>
              </>
            ) : (
              <>
                <b>Left</b> moves · <b>SHOOT</b> hold &amp; release in green · <b>PASS</b> · <b>SPRINT</b>
              </>
            )}
          </div>
        </div>
      )}
      <div className="court-canvas-wrap">
        <canvas ref={canvasRef} className="court-canvas" />
        {matchMode && (
          <div className="player-info">
            <div className="pi-row">
              <span className="pi-name">{hud.activeName || 'Player'}</span>
              {hud.activePos && <span className="pi-pos">{hud.activePos}</span>}
            </div>
            <div className="pi-stats">
              PTS <b>{hud.activePts}</b>
            </div>
          </div>
        )}
        {msg.text && <div className={`court-msg ${msg.kind}`}>{msg.text}</div>}

        {final && (
          <div className="c5-final">
            <div className="c5-final-card">
              <div className={`final-title ${final.win ? 'win' : 'loss'}`}>{final.win ? 'WIN!' : 'LOSS'}</div>
              <div className="break-score">
                <span>{hud.homeAbbr}</span>
                <b>
                  {final.us} – {final.them}
                </b>
                <span>{hud.awayAbbr}</span>
              </div>
              <button className="btn primary" onClick={finishGame}>
                CONTINUE ▶
              </button>
            </div>
          </div>
        )}

        {onDefense ? (
          <div className="c5-buttons">
            <button className="c5-btn pass" onPointerDown={press((c) => (c.switchD = true))}>
              🔄<small>SWITCH</small>
            </button>
            <button className="c5-btn shoot" onPointerDown={press((c) => (c.steal = true))}>
              ✋<small>STEAL</small>
            </button>
            <button className="c5-btn block" onPointerDown={press((c) => (c.block = true))}>
              🚫<small>BLOCK</small>
            </button>
            <button
              className="c5-btn sprint"
              onPointerDown={press((c) => (c.sprint = true))}
              onPointerUp={press((c) => (c.sprint = false))}
              onPointerLeave={press((c) => (c.sprint = false))}
            >
              ⚡<small>SPRINT</small>
            </button>
          </div>
        ) : (
          <div className="c5-buttons">
            <button className="c5-btn pass" onPointerDown={press((c) => (c.pass = true))}>
              ➜<small>PASS</small>
            </button>
            <button
              className="c5-btn shoot"
              onPointerDown={press((c) => (c.charging = true))}
              onPointerUp={press((c) => {
                c.charging = false
                c.release = true
              })}
              onPointerLeave={press((c) => {
                if (c.charging) {
                  c.charging = false
                  c.release = true
                }
              })}
            >
              🏀<small>SHOOT</small>
            </button>
            <button
              className="c5-btn sprint"
              onPointerDown={press((c) => (c.sprint = true))}
              onPointerUp={press((c) => (c.sprint = false))}
              onPointerLeave={press((c) => (c.sprint = false))}
            >
              ⚡<small>SPRINT</small>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
