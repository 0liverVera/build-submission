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
  const [auto, setAuto] = useState(false)
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
    // opponent skill 0..1, derived from team rating — drives tighter D + steals
    const oppRating = opp0?.offense ?? 6
    const oppSkill = clamp((oppRating - 3) / 5, 0.35, 1)
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
    // per-player rebound pursuit speed, from each starter's inside/strength rating
    const homeReb = Array.from({ length: 5 }, (_, i) => 0.9 + (starters[i]?.inside ?? 5) * 0.018)

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

    // ball carries real velocity so it can drop through the net and bounce on the
    // floor like a loose ball (vx/vy = screen drift, vz = height velocity)
    const ball = { x: 0, y: 0, z: 0, t: 0, dur: 0.7, peak: 60, vx: 0, vy: 0, vz: 0, bounces: 0 }
    let possession: Team = 'home'
    let awayHandler = 0
    let awayPossStart = 0
    let awayThinkAt = 0
    let awayStealAt = 0
    let stealCd = 0
    let blockUntil = 0
    // FIFA-style auto-play: if the user gives no input for a moment, the AI takes
    // over the active player too (drives/shoots/passes on O, guards/steals on D).
    // Touching the stick or any button hands control straight back.
    const IDLE_TAKEOVER = 1.1
    let lastInputAt = 0
    let homeThinkAt = 0
    let homeStealAt = 0
    // live = ball in play · passing/shooting = action in flight · settle = dead-ball
    // resolve (ball physically dropping through the net or caroming off the rim) ·
    // inbound = clean reset to formation before the next possession tips off
    let phase: 'live' | 'passing' | 'shooting' | 'settle' | 'loose' | 'inbound' = 'live'
    let charge = 0
    let stamina = 1
    let netFlash = 0
    let netSwish = 0
    let netJiggle = 0 // 0..1 net ripple, kicked when the ball passes through / clips rim
    let crowdJump = 0
    let shake = 0
    let now = 0
    let settleUntil = 0
    let inboundUntil = 0
    let looseUntil = 0 // hard timeout so a loose-ball scramble can't last forever
    let quarterExpired = false // clock hit 0 — end the quarter at the next dead ball
    let madeShot = false // did the resolving shot go in (drives net + ball drop)
    let t = 0
    let autoShown = false
    // broadcast camera: a slight zoom that pans toward the action for more energy
    const CAM_ZOOM = 1.14
    let camX = 0
    let camY = 0

    const shotFrom = { x: 0, y: 0 }
    const land = { x: 0, y: 0 }
    let made = false
    let shotKind: '2' | '3' | 'layup' = '2'
    let lastRimX = 0
    let passFrom = 0
    let passTo = 0
    let passT = 0
    let passDur = 0.4
    let passTeam: Team = 'home'
    // a pass should read as a real throw: ball crosses ~85% of court width per
    // second, with a clear arc — never an instant teleport, never ultra-speed.
    const PASS_SPEED_DIVISOR = 0.85
    const passDuration = (ax: number, ay: number, bx: number, by: number) =>
      clamp(dist(ax, ay, bx, by) / (W * PASS_SPEED_DIVISOR), 0.4, 0.85)

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

    function formation(offTeam: Team) {
      const off = offTeam === 'home' ? home : away
      const def = offTeam === 'home' ? away : home
      const drx = atkX(offTeam)
      off.forEach((p, i) => {
        const s = offSpot(i, offTeam)
        p.x = s.x
        p.y = s.y
      })
      def.forEach((p, i) => {
        const man = off[i]
        p.x = man.x + (drx - man.x) * 0.34
        p.y = man.y + (rimY - man.y) * 0.34
      })
    }

    let laidOut = false
    function layout() {
      const rect = canvas!.getBoundingClientRect()
      const prevW = W
      const prevH = H
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
      pr = Math.max(9, H * 0.046)
      ballR = pr * 0.6
      SPEED = H * 0.42
      AISPEED = H * 0.36
      maxR = Math.min(W, H) * 0.12
      if (!laidOut) {
        // first layout: set the opening formation (home attacks right)
        laidOut = true
        formation('home')
      } else if (prevW > 0 && prevH > 0 && (W !== prevW || H !== prevH)) {
        // a resize must NOT yank players to new spots mid-play — just rescale every
        // position proportionally so the live action is preserved exactly
        const sx = W / prevW
        const sy = H / prevH
        for (const p of [...home, ...away]) {
          p.x *= sx
          p.y *= sy
        }
        ball.x *= sx
        ball.y *= sy
      }
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
      passTeam = 'home'
      passFrom = active
      passTo = target
      passT = 0
      passDur = passDuration(a.x, a.y, b.x, b.y)
      phase = 'passing'
      sfx.pass()
    }

    function doAwayPass(target: number) {
      if (target < 0 || target === awayHandler) return
      const a = away[awayHandler]
      const b = away[target]
      passTeam = 'away'
      passFrom = awayHandler
      passTo = target
      passT = 0
      passDur = passDuration(a.x, a.y, b.x, b.y)
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

    // gravity + floor/wall bounces for a loose ball (made drop-through, missed carom)
    function stepBallPhysics(dt: number) {
      const G = H * 2.4
      ball.vz -= G * dt
      ball.x += ball.vx * dt
      ball.y += ball.vy * dt
      ball.z += ball.vz * dt
      if (ball.z <= 0) {
        ball.z = 0
        if (ball.vz < -H * 0.06) {
          // bounce off the hardwood, losing energy each time
          ball.vz = -ball.vz * 0.56
          ball.vx *= 0.72
          ball.vy *= 0.72
          ball.bounces++
          sfx.dribble()
        } else {
          // out of hops — roll to a stop
          ball.vz = 0
          ball.vx *= 0.86
          ball.vy *= 0.86
        }
      }
      // carom off the sidelines/baselines instead of leaving the floor
      const minx = mx + ballR
      const maxx = W - mx - ballR
      const miny = band + ballR
      const maxy = H - band - ballR
      if (ball.x < minx) {
        ball.x = minx
        ball.vx = Math.abs(ball.vx) * 0.6
      } else if (ball.x > maxx) {
        ball.x = maxx
        ball.vx = -Math.abs(ball.vx) * 0.6
      }
      if (ball.y < miny) {
        ball.y = miny
        ball.vy = Math.abs(ball.vy) * 0.6
      } else if (ball.y > maxy) {
        ball.y = maxy
        ball.vy = -Math.abs(ball.vy) * 0.6
      }
    }

    function resolveShotFlight() {
      const clutch = matchMode && quarter === 4 && gameClock <= 10 && Math.abs(us - them) <= 7
      madeShot = made
      ball.x = land.x
      ball.y = land.y
      ball.bounces = 0
      if (made) {
        const pts = shotKind === '3' ? 3 : 2
        if (possession === 'home') {
          us += pts
          homePoints[active] += pts
        } else them += pts
        netFlash = 0.45
        netSwish = 0.5
        netJiggle = 1 // big ripple — the ball is dropping straight through the mesh
        crowdJump = clutch ? 0.85 : 0.6
        // sit the ball in the cylinder, then let physics drop it through to the floor
        ball.x = lastRimX
        ball.y = rimY
        ball.z = pr * 0.65
        ball.vx = (Math.random() * 2 - 1) * W * 0.012
        ball.vy = H * 0.03
        ball.vz = -H * 0.18
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
        // miss: the ball physically caroms off the iron, pops up and out, then bounces
        netJiggle = 0.4 // a clipped rim still tugs the net a little
        const ox = land.x - lastRimX
        const oy = land.y - rimY
        const on = Math.hypot(ox, oy) || 1
        ball.z = pr * 0.55
        ball.vx = (ox / on) * W * 0.1 + (Math.random() * 2 - 1) * W * 0.03
        ball.vy = (oy / on) * H * 0.1 + (Math.random() * 2 - 1) * H * 0.03
        ball.vz = H * 0.44
        result('MISS', 'miss')
        sfx.rim()
        sfx.aww()
        shake = Math.max(shake, 2)
      }
      if (made) {
        phase = 'settle'
        settleUntil = now + 1.5
      } else if (quarterExpired) {
        // time's up on a miss — no rebound battle, just let it settle then end
        phase = 'settle'
        settleUntil = now + 1.0
      } else {
        // live loose ball: both teams crash the glass for a contested rebound
        phase = 'loose'
        looseUntil = now + 3
      }
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

    // Auto-play handler for YOUR ball-handler when you're idle: same brain as the
    // opponent — drive toward the rim, kick out of help, take open/forced shots.
    function runHomeHandlerAI(dt: number) {
      const a = home[active]
      const rx = atkX('home')
      const openD = nearestDist(a, away)
      const d2 = dist(a.x, a.y, rx, rimY)
      const contested = openD < pr * 2.7
      const elapsed = SHOT_CLOCK - shotClock

      if (now > homeThinkAt) {
        homeThinkAt = now + 0.3
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
        const forced = shotClock < 5 || elapsed > 12
        if (d2 < pr * 3.6 && !contested) return doShoot(0.86)
        if (forced) return doShoot(0.86)
        if (!contested && openD > pr * 5 && d2 < arcR * 1.05 && elapsed > 2 && Math.random() < 0.5)
          return doShoot(0.86)
        if (contested && bestT >= 0 && bestOpen > pr * 4) return doPass()
        if (bestT >= 0 && bestOpen > openD + pr * 3.5 && Math.random() < 0.45) return doPass()
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
      const driveX = d2 > arcR ? rx + (rx < W / 2 ? 1 : -1) * pr * 4 : rx + (rx < W / 2 ? 1 : -1) * pr * 2
      let ty = rimY
      if (near && nd < pr * 2.6) ty += (a.y < rimY ? -1 : 1) * pr * 2.4
      steerTo(a, driveX, ty, AISPEED * (contested ? 0.85 : 0.95), dt)
    }

    // Opponent offense: patient, drives + kicks out, takes good shots, cuts.
    function runAwayOffenseAI(dt: number) {
      const rx = atkX('away')
      const bh = away[awayHandler]
      const openD = nearestDist(bh, home)
      const d2 = dist(bh.x, bh.y, rx, rimY)
      const contested = openD < pr * 2.7

      if (now > awayThinkAt) {
        awayThinkAt = now + 0.3 - oppSkill * 0.12 // smarter teams read the floor faster
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
        if (!contested && openD > pr * 5 && d2 < arcR * 1.05 && elapsed > 2 && Math.random() < 0.5 + oppSkill * 0.25)
          return awayShoot() // clean open jumper — better teams punish open looks
        if (contested && bestT >= 0 && bestOpen > pr * 4) {
          doAwayPass(bestT) // driven into help → kick out
          return
        }
        if (bestT >= 0 && bestOpen > openD + pr * 3.5 && Math.random() < 0.45 + oppSkill * 0.2) {
          doAwayPass(bestT) // swing to a much more open man — moves the ball quicker
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
        // hold real positions, but spread wider off the ball so kick-outs stay open
        const spreadY = sp.y + (sp.y >= rimY ? 1 : -1) * pr * oppSkill * 1.3
        const tx = cutting ? rx - (rx < W / 2 ? -1 : 1) * pr * 2.6 : sp.x
        const tyy = cutting ? rimY + (i - 2) * pr * 1.1 : inY(spreadY)
        steerTo(away[i], tx, tyy, AISPEED * (0.82 + oppSkill * 0.13), dt)
      }
    }

    /**
     * Pack-line man defense for whichever team is guarding:
     * on-ball pressure, off-ball sag toward rim+ball (help position), and the
     * nearest helper collapses on a drive into the paint, then recovers.
     */
    function playDefense(
      defs: P[],
      off: P[],
      ballIdx: number,
      controlled: number | null,
      dt: number,
      skill = 0,
    ) {
      const rx = atkX(off[0].team) // rim the offense attacks
      const ball = off[ballIdx]
      // a smarter, rangier defense closes faster, hugs the man tighter, and keeps
      // disciplined spacing (lower separation = stays in a stance, not bumped off)
      const spd = 1 + skill * 0.16
      const sep = pr * (2.2 - skill * 0.7)
      const hug = 0.16 - skill * 0.06
      for (let i = 0; i < defs.length; i++) {
        if (controlled != null && i === controlled) continue
        const man = off[i % off.length]
        const onBall = i % off.length === ballIdx
        if (onBall) {
          steerTo(defs[i], man.x + (rx - man.x) * hug, man.y + (rimY - man.y) * hug, AISPEED * 0.97 * spd, dt, sep)
        } else {
          // help position: sag toward the rim, shifted toward the ball. Smarter
          // defenses sag a touch deeper and lean harder to the ball (spread help).
          const sagX = man.x + (rx - man.x) * (0.45 + skill * 0.08)
          const sagY = man.y + (rimY - man.y) * (0.45 + skill * 0.08)
          const ballLean = 0.34 + skill * 0.06
          steerTo(
            defs[i],
            sagX * (1 - ballLean) + ball.x * ballLean,
            sagY * (1 - ballLean) + ball.y * ballLean,
            AISPEED * 0.84 * spd,
            dt,
            sep,
          )
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
        if (best >= 0) steerTo(defs[best], (ball.x + rx) / 2, (ball.y + rimY) / 2, AISPEED * 0.95 * spd, dt, pr * 2)
      }
    }

    function runHomeDefenseAI(dt: number, aiActive: boolean) {
      // normally you control one home defender; when idle the AI guards with all 5
      playDefense(home, away, awayHandler, aiActive ? null : active, dt)
      if (aiActive && phase === 'live' && now > homeStealAt) {
        homeStealAt = now + 1.3 + Math.random() * 1.6
        const def = home[active]
        if (dist(def.x, def.y, away[awayHandler].x, away[awayHandler].y) < pr * 2.2 && Math.random() < 0.14) {
          result('STEAL!', 'make')
          sfx.make()
          possession = 'home'
          setOnDefense(false)
          phase = 'live'
        }
      }
    }
    function runAwayDefenseAI(dt: number) {
      playDefense(away, home, active, null, dt, oppSkill)
      if (phase !== 'live') return
      // on-ball pickpocket: the nearest defender to YOUR ball-handler lunges for a
      // strip. The tighter they're guarding, the better the odds — drive into
      // pressure and a smart defense will take it off you.
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
        awayStealAt = now + 0.9 + Math.random() * 1.1
        const reach = pr * 2.4
        if (nd < reach) {
          // closeness 0..1, scaled by opponent skill → up to ~0.3 strip chance
          const closeness = 1 - nd / reach
          if (Math.random() < closeness * (0.16 + oppSkill * 0.2)) {
            result('STOLEN!', 'miss')
            sfx.aww()
            flipToAway(robber)
          }
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

    // hand a corralled loose ball to a player and resume live play
    function secureRebound(team: Team, idx: number) {
      const wasOff = team === possession // rebounder's team also shot it = offensive board
      if (team === 'home') {
        possession = 'home'
        active = idx
        setOnDefense(false)
      } else {
        flipToAway(idx)
      }
      result(wasOff ? 'OFF. BOARD!' : 'REBOUND', wasOff ? 'make' : 'miss')
      if (wasOff) sfx.make()
      shotClock = SHOT_CLOCK // fresh possession on any board
      ball.z = 0
      ball.vx = ball.vy = ball.vz = 0
      phase = 'live'
    }
    // everyone crashes the glass toward the loose ball; the defending team holds a
    // slight inside-position edge (speed) so defensive boards stay the norm
    function runRebound(dt: number, controlled: number | null) {
      const shooter = possession // the team that shot is on the offensive glass
      const tx = ball.x + ball.vx * 0.18 // lead the bouncing ball a touch
      const ty = ball.y + ball.vy * 0.18
      for (let i = 0; i < home.length; i++) {
        if (controlled != null && i === controlled) continue
        const defending = shooter !== 'home'
        steerTo(home[i], tx, ty, AISPEED * (defending ? 1.06 : 0.97) * homeReb[i], dt, pr * 1.5)
      }
      const awayReb = 0.94 + oppSkill * 0.12
      for (let i = 0; i < away.length; i++) {
        const defending = shooter !== 'away'
        steerTo(away[i], tx, ty, AISPEED * (defending ? 1.06 : 0.97) * awayReb, dt, pr * 1.5)
      }
    }
    // whoever reaches the descending ball first grabs it (defenders reach a bit further)
    function trySecureRebound() {
      const shooter = possession
      let team: Team | null = null
      let idx = -1
      let best = Infinity
      for (let i = 0; i < home.length; i++) {
        const d = dist(home[i].x, home[i].y, ball.x, ball.y)
        const reach = shooter !== 'home' ? pr * 1.3 : pr * 1.05
        if (d < reach && d < best) {
          best = d
          team = 'home'
          idx = i
        }
      }
      for (let i = 0; i < away.length; i++) {
        const d = dist(away[i].x, away[i].y, ball.x, ball.y)
        const reach = shooter !== 'away' ? pr * 1.3 : pr * 1.05
        if (d < reach && d < best) {
          best = d
          team = 'away'
          idx = i
        }
      }
      if (team) secureRebound(team, idx)
    }
    // timeout fallback: a ball that never gets corralled goes to the closest player
    function forceRebound() {
      let team: Team = 'home'
      let idx = 0
      let best = Infinity
      for (let i = 0; i < home.length; i++) {
        const d = dist(home[i].x, home[i].y, ball.x, ball.y)
        if (d < best) {
          best = d
          team = 'home'
          idx = i
        }
      }
      for (let i = 0; i < away.length; i++) {
        const d = dist(away[i].x, away[i].y, ball.x, ball.y)
        if (d < best) {
          best = d
          team = 'away'
          idx = i
        }
      }
      secureRebound(team, idx)
    }

    // dead-ball reset: hand the ball to a team and glide everyone into a proper
    // formation for a clean inbound (used after makes, violations, quarter starts)
    function startInbound(team: Team) {
      possession = team
      prevPossession = team
      shotClock = SHOT_CLOCK
      if (team === 'home') {
        active = 0
        setOnDefense(false)
      } else {
        awayHandler = 0
        awayPossStart = now
        awayThinkAt = now + 0.6
        active = 0
        setOnDefense(true)
      }
      const h = team === 'home' ? home[active] : away[awayHandler]
      ball.x = h.x + pr * 0.8
      ball.y = h.y + pr * 0.1
      ball.z = 0
      ball.vx = ball.vy = ball.vz = 0
      phase = 'inbound'
      inboundUntil = now + 0.7
    }
    // glide players to their formation spots during the inbound dead ball
    function runInbound(dt: number) {
      const off = possession === 'home' ? home : away
      const def = possession === 'home' ? away : home
      const drx = atkX(possession)
      for (let i = 0; i < off.length; i++) {
        const s = offSpot(i, possession)
        steerTo(off[i], s.x, s.y, AISPEED * 1.5, dt)
      }
      for (let i = 0; i < def.length; i++) {
        const man = off[i]
        steerTo(def[i], man.x + (drx - man.x) * 0.34, man.y + (rimY - man.y) * 0.34, AISPEED * 1.5, dt)
      }
      const h = possession === 'home' ? home[active] : away[awayHandler]
      ball.x = h.x + pr * 0.8
      ball.y = h.y + pr * 0.1
      ball.z = 0
    }
    // clock hit zero and play has settled — advance the period or end the game
    function finishQuarter() {
      quarterExpired = false
      if (quarter >= 4) {
        endGame()
        return
      }
      quarter += 1
      gameClock = QUARTER_SECONDS
      sfx.buzzer()
      result(`Q${quarter}`, '')
      startInbound('home')
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
      if (netJiggle > 0) netJiggle = Math.max(0, netJiggle - dt * 1.4)
      if (crowdJump > 0) crowdJump = Math.max(0, crowdJump - dt)

      if (matchMode && !ended) {
        // the game clock runs only while the ball is genuinely in play — it freezes
        // on dead balls (settle/inbound) the way a real game clock stops
        const clockLive = phase === 'live' || phase === 'passing' || phase === 'shooting'
        if (clockLive && !quarterExpired) {
          gameClock -= dt
          if (gameClock <= 0) {
            gameClock = 0
            quarterExpired = true // don't freeze the action; end at the next dead ball
          }
        }
        if (phase === 'live') {
          shotClock -= dt
          if (shotClock <= 0 && !quarterExpired) {
            // shot-clock violation is a turnover dead ball — other team inbounds
            result('SHOT CLOCK', 'miss')
            startInbound(possession === 'home' ? 'away' : 'home')
          }
        }
        // a buzzer-beater in the air finishes first; the quarter ends once the ball
        // is settled (in someone's hands or already reset for an inbound)
        if (quarterExpired && (phase === 'live' || phase === 'inbound')) finishQuarter()
      }
      if (ended) return
      if (possession !== prevPossession) {
        prevPossession = possession
        shotClock = SHOT_CLOCK
      }
      if (stealCd > 0) stealCd -= dt

      const c = controls.current
      // any stick movement or button press counts as "the user is playing"
      const hasJoy = Math.hypot(vx, vy) > 0.06
      const hasBtn =
        c.pass || c.charging || c.release || c.switchD || c.steal || c.block || c.sprint
      if (hasJoy || hasBtn) lastInputAt = now
      const aiActive = now - lastInputAt > IDLE_TAKEOVER
      if (aiActive !== autoShown) {
        autoShown = aiActive
        setAuto(aiActive)
      }

      let speed = SPEED
      if (c.sprint && stamina > 0.02) {
        speed *= 1.6
        stamina = Math.max(0, stamina - dt * 0.5)
      } else {
        stamina = Math.min(1, stamina + dt * 0.3)
      }

      // plays only run while the ball is in play; dead balls (settle/inbound) freeze
      // the action so nothing moves or respawns mid-stoppage
      const playActive = phase === 'live' || phase === 'shooting' || phase === 'passing'

      const a = home[active]
      // you move your guy on a live ball or while chasing a loose rebound; when idle
      // the AI steers them instead
      if ((phase === 'live' || phase === 'loose') && !aiActive) {
        a.x = inX(a.x + vx * speed * dt)
        a.y = inY(a.y + vy * speed * dt)
      }

      if (possession === 'home') {
        if (playActive) {
          runOffenseAI(dt)
          runAwayDefenseAI(dt)
        }
        if (phase === 'live') {
          if (aiActive) {
            runHomeHandlerAI(dt)
          } else if (c.pass) {
            c.pass = false
            doPass()
          } else if (c.charging) {
            charge = Math.min(1.15, charge + dt / 0.9)
          }
          if (!aiActive && c.release) {
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
        if (playActive) {
          runHomeDefenseAI(dt, aiActive)
          if (phase === 'live') runAwayOffenseAI(dt)
        }
        if (!aiActive) {
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
        } else {
          c.switchD = false
          c.steal = false
          c.block = false
        }
        c.pass = false
        c.release = false
        charge = 0
      }

      if (phase === 'passing') {
        passT += dt / passDur
        const arr = passTeam === 'home' ? home : away
        const pa = arr[passFrom]
        const pb = arr[passTo]
        const k = clamp(passT, 0, 1)
        ball.x = pa.x + (pb.x - pa.x) * k
        ball.y = pa.y + (pb.y - pa.y) * k
        ball.z = Math.sin(Math.PI * k) * pr * 1.1
        if (passT >= 1) {
          if (passTeam === 'home') active = passTo
          else awayHandler = passTo
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
      } else if (phase === 'settle') {
        // dead-ball resolve: ball drops through the net on a make (or the period has
        // ended) and bounces on the floor before the next possession sets up
        stepBallPhysics(dt)
        if (now >= settleUntil) {
          result('', '')
          if (quarterExpired) finishQuarter()
          else if (madeShot) startInbound(possession === 'home' ? 'away' : 'home')
          else forceRebound()
        }
      } else if (phase === 'loose') {
        // live rebound: ball caroms off the iron while both teams crash the glass
        stepBallPhysics(dt)
        runRebound(dt, aiActive ? null : active)
        // grabbable only once it's descending and low — gives the scramble time to form
        if (ball.z < pr * 0.9 && ball.vz <= 0) trySecureRebound()
        if (phase === 'loose' && now >= looseUntil) forceRebound()
      } else if (phase === 'inbound') {
        runInbound(dt)
        if (now >= inboundUntil) phase = 'live'
      }

      // broadcast camera follows the ball/handler, clamped so the floor always fills
      // the frame (no black edges), then eases in for a smooth, lively pan
      const focus =
        phase === 'live' ? (possession === 'home' ? home[active] : away[awayHandler]) : ball
      const slackX = (W * (CAM_ZOOM - 1)) / (2 * CAM_ZOOM)
      const slackY = (H * (CAM_ZOOM - 1)) / (2 * CAM_ZOOM)
      const tgtX = clamp((focus.x - W / 2) * 0.85, -slackX, slackX)
      const tgtY = clamp((focus.y - H / 2) * 0.85, -slackY, slackY)
      const ease = Math.min(1, dt * 3.5)
      camX += (tgtX - camX) * ease
      camY += (tgtY - camY) * ease
    }

    // ---- drawing ----
    function line(x1: number, y1: number, x2: number, y2: number) {
      ctx!.beginPath()
      ctx!.moveTo(x1, y1)
      ctx!.lineTo(x2, y2)
      ctx!.stroke()
    }
    function drawEnd(rx: number, dir: number, col: string) {
      const keyW = W * 0.135
      const keyH = H * 0.32
      const kx = dir > 0 ? W - mx - keyW : mx
      const ftx = dir > 0 ? kx : kx + keyW // free-throw line (inner edge of the key)
      const ftR = keyH * 0.34
      // painted lane, tinted with the team colour like a real home floor
      ctx!.save()
      ctx!.globalAlpha = 0.2
      ctx!.fillStyle = col
      ctx!.fillRect(kx, rimY - keyH / 2, keyW, keyH)
      ctx!.restore()
      ctx!.strokeStyle = 'rgba(255,255,255,0.85)'
      ctx!.lineWidth = 2.4
      ctx!.strokeRect(kx, rimY - keyH / 2, keyW, keyH)
      // free-throw circle: solid arc toward mid-court, dashed arc toward the baseline
      const front: [number, number] = dir > 0 ? [Math.PI / 2, (3 * Math.PI) / 2] : [-Math.PI / 2, Math.PI / 2]
      ctx!.beginPath()
      ctx!.arc(ftx, rimY, ftR, front[0], front[1])
      ctx!.stroke()
      ctx!.setLineDash([6, 6])
      ctx!.beginPath()
      ctx!.arc(ftx, rimY, ftR, front[1], front[0] + Math.PI * 2)
      ctx!.stroke()
      ctx!.setLineDash([])
      // restricted-area semicircle under the rim
      ctx!.beginPath()
      ctx!.arc(rx, rimY, pr * 1.7, front[0], front[1])
      ctx!.stroke()
      // three-point line: an arc that meets two straight corner segments at the baseline
      const arcStart = dir > 0 ? 0.6 * Math.PI : -0.4 * Math.PI
      const arcEnd = dir > 0 ? 1.4 * Math.PI : 0.4 * Math.PI
      ctx!.beginPath()
      ctx!.arc(rx, rimY, arcR, arcStart, arcEnd)
      ctx!.stroke()
      const bx = dir > 0 ? W - mx : mx
      const ax1 = rx + Math.cos(arcStart) * arcR
      const ay1 = rimY + Math.sin(arcStart) * arcR
      const ax2 = rx + Math.cos(arcEnd) * arcR
      const ay2 = rimY + Math.sin(arcEnd) * arcR
      line(bx, ay1, ax1, ay1)
      line(bx, ay2, ax2, ay2)
    }
    function drawCourt() {
      const top = band
      const bot = H - band
      const cl = W / 2
      // hardwood floor: warm gradient with lengthwise plank seams
      const g = ctx!.createLinearGradient(0, top, 0, bot)
      g.addColorStop(0, '#d8ad70')
      g.addColorStop(0.5, '#c8965c')
      g.addColorStop(1, '#bd8850')
      ctx!.fillStyle = g
      ctx!.fillRect(0, 0, W, H)
      ctx!.strokeStyle = 'rgba(86,52,18,0.12)'
      ctx!.lineWidth = 1
      const plank = Math.max(9, H * 0.042)
      for (let y = top + plank; y < bot; y += plank) line(mx, y, W - mx, y)
      // subtle vertical sheen bands so the wood catches the light
      ctx!.fillStyle = 'rgba(255,231,188,0.04)'
      for (let i = 0; i < W; i += 70) ctx!.fillRect(i, top, 26, bot - top)

      // crowd / seating beyond the baselines
      ctx!.fillStyle = '#15192b'
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

      // boundary
      ctx!.strokeStyle = 'rgba(255,255,255,0.85)'
      ctx!.lineWidth = 3
      ctx!.strokeRect(mx, top, W - 2 * mx, bot - top)
      // half-court line + center circles
      ctx!.lineWidth = 2.4
      line(cl, top, cl, bot)
      ctx!.beginPath()
      ctx!.arc(cl, H / 2, H * 0.135, 0, Math.PI * 2)
      ctx!.stroke()
      ctx!.beginPath()
      ctx!.arc(cl, H / 2, H * 0.05, 0, Math.PI * 2)
      ctx!.stroke()
      // center-court logo letter
      ctx!.globalAlpha = 0.12
      ctx!.fillStyle = '#fff'
      ctx!.font = `bold ${pr * 2.2}px sans-serif`
      ctx!.textAlign = 'center'
      ctx!.textBaseline = 'middle'
      ctx!.fillText((franchise?.teamName?.[0] ?? 'H').toUpperCase(), cl, H / 2)
      ctx!.globalAlpha = 1
      ctx!.textBaseline = 'alphabetic'
      // both ends (home attacks the right rim, so tint right with the home colour)
      drawEnd(leftRimX, -1, awayColor)
      drawEnd(rightRimX, 1, homeColor)
      drawHoop(leftRimX, -1)
      drawHoop(rightRimX, 1)
    }
    // Build the hanging-net mesh as a tapered cone of nodes: a rim-sized top ring
    // narrowing to a throat that hangs toward the court, with a live ripple when the
    // ball passes through. Returns node grid [ring][strand] for the strand drawing.
    const NET_RINGS = 5
    const NET_STRANDS = 10
    function netNodes(rx: number, dir: number) {
      const rax = pr * 0.46
      const ray = pr * 0.74
      const scored = Math.abs(rx - lastRimX) < 1
      const jig = netJiggle * (scored ? 1 : 0.2)
      // throat hangs toward center court (-dir) and droops down; droops more on a make
      const hangX = -dir * pr * (0.32 + jig * 0.12)
      const hangY = pr * (1.0 + jig * 0.55)
      const grid: { x: number; y: number; a: number }[][] = []
      for (let k = 0; k <= NET_RINGS; k++) {
        const t = k / NET_RINGS
        const cx = rx + hangX * t
        const cy = rimY + hangY * t
        const rrx = rax * (1 - 0.58 * t)
        const rry = ray * (1 - 0.58 * t)
        const row: { x: number; y: number; a: number }[] = []
        for (let s = 0; s < NET_STRANDS; s++) {
          const a = (s / NET_STRANDS) * Math.PI * 2
          let px = cx + Math.cos(a) * rrx
          let py = cy + Math.sin(a) * rry
          if (jig > 0) {
            // ripple grows toward the throat (bottom moves most) and waves over time
            px += Math.sin(t * 6 - now * 24 + a * 2) * pr * 0.13 * jig * t * -dir
            py += Math.cos(t * 5 - now * 21 + a) * pr * 0.07 * jig * t
          }
          row.push({ x: px, y: py, a })
        }
        grid.push(row)
      }
      return grid
    }
    function drawNet(rx: number, dir: number, front: boolean) {
      const grid = netNodes(rx, dir)
      const bright = netFlash > 0 && Math.abs(rx - lastRimX) < 1
      // connecting rings give the mesh its weave — drawn on the back pass, below the ball
      if (!front) {
        ctx!.lineWidth = 1
        for (let k = 1; k <= NET_RINGS; k++) {
          ctx!.beginPath()
          for (let s = 0; s <= NET_STRANDS; s++) {
            const n = grid[k][s % NET_STRANDS]
            s === 0 ? ctx!.moveTo(n.x, n.y) : ctx!.lineTo(n.x, n.y)
          }
          ctx!.strokeStyle = bright ? 'rgba(255,255,255,0.8)' : 'rgba(238,242,255,0.2)'
          ctx!.stroke()
        }
      }
      // vertical strands, split by depth: front strands (toward viewer) are brighter
      // and drawn over the ball so a made shot reads as passing through the mesh
      ctx!.lineWidth = 1.4
      for (let s = 0; s < NET_STRANDS; s++) {
        const a = (s / NET_STRANDS) * Math.PI * 2
        const isFront = Math.sin(a) >= 0
        if (isFront !== front) continue
        const depth = (Math.sin(a) + 1) / 2
        const alpha = front ? 0.5 + depth * 0.45 : 0.24 + depth * 0.2
        ctx!.strokeStyle = bright ? 'rgba(255,255,255,0.95)' : `rgba(246,249,255,${alpha})`
        ctx!.beginPath()
        for (let k = 0; k <= NET_RINGS; k++) {
          const n = grid[k][s]
          k === 0 ? ctx!.moveTo(n.x, n.y) : ctx!.lineTo(n.x, n.y)
        }
        ctx!.stroke()
      }
    }
    function drawHoop(rx: number, dir: number) {
      // backboard plate behind the rim, with an orange shooter's square
      const bx = rx + dir * pr * 1.35
      ctx!.fillStyle = 'rgba(20,24,40,0.35)'
      ctx!.fillRect(bx - 1, rimY - H * 0.105, 6, H * 0.21)
      ctx!.fillStyle = '#eef1f6'
      ctx!.fillRect(bx, rimY - H * 0.1, 4, H * 0.2)
      ctx!.strokeStyle = '#ff6a2a'
      ctx!.lineWidth = 2
      ctx!.strokeRect(bx - dir * pr * 0.4, rimY - pr * 0.5, pr * 0.4, pr)
      // hanging net (back half) sits under the ball
      drawNet(rx, dir, false)
      // rim: a shaded orange ring drawn on top of the net's top edge
      ctx!.strokeStyle = '#d8531f'
      ctx!.lineWidth = 5
      ctx!.beginPath()
      ctx!.ellipse(rx, rimY + 1, pr * 0.46, pr * 0.75, 0, 0, Math.PI * 2)
      ctx!.stroke()
      ctx!.strokeStyle = '#ff7a3a'
      ctx!.lineWidth = 3
      ctx!.beginPath()
      ctx!.ellipse(rx, rimY, pr * 0.46, pr * 0.74, 0, 0, Math.PI * 2)
      ctx!.stroke()
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
      // broadcast camera: zoom slightly and pan toward the action (camX/camY)
      ctx!.translate(W / 2, H / 2)
      ctx!.scale(CAM_ZOOM, CAM_ZOOM)
      ctx!.translate(-W / 2 - camX, -H / 2 - camY)
      if (shake > 0) ctx!.translate((Math.random() * 2 - 1) * shake, (Math.random() * 2 - 1) * shake)
      drawCourt()
      for (const p of away) drawPlayer(p, awayColor)
      home.forEach((p, i) => {
        if (i === active && !(phase === 'passing' && passTeam === 'home')) drawActiveMarker(p)
        drawPlayer(p, homeColor)
      })
      if (phase === 'live') {
        const hp = possession === 'home' ? home[active] : away[awayHandler]
        drawBall(hp.x + pr * 0.8, hp.y + pr * 0.1, 0)
      } else {
        drawBall(ball.x, ball.y, ball.z)
      }
      // front half of each net, drawn over the ball so a make visibly threads through
      drawNet(leftRimX, -1, true)
      drawNet(rightRimX, 1, true)
      drawLabels()
      drawOverlays()
      ctx!.restore()
      drawJoystick()
    }

    let raf = 0
    let last = performance.now()
    function frame(time: number) {
      now = time / 1000
      if (!lastInputAt) lastInputAt = now
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
        {auto && (
          <div className="auto-badge">
            <span className="auto-dot" /> AUTO
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
