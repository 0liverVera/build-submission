import { useEffect, useRef, useState } from 'react'
import { useGame } from '../state/store'
import { sfx } from '../audio/sfx'

/**
 * GAMEPLAY OVERHAUL — controllable 5v5 (BETA). Season games still use the old
 * model; this is sandboxed behind the 5v5 BETA hub entry.
 *
 * STEP 1: left joystick moves the active player.
 * STEP 2: right-side OFFENSE buttons — Pass (control switches to the receiver),
 *   charge-meter Shoot (auto-aimed at the rim; timing + openness + distance set
 *   the make %), and Sprint (stamina). Teammates are still static (AI = step 3).
 */

interface P {
  x: number
  y: number
  team: 'home' | 'away'
}

const HOME: [number, number][] = [
  [0.2, 0.5],
  [0.38, 0.24],
  [0.38, 0.76],
  [0.54, 0.4],
  [0.56, 0.62],
]
const AWAY: [number, number][] = [
  [0.34, 0.5],
  [0.52, 0.26],
  [0.52, 0.74],
  [0.66, 0.42],
  [0.68, 0.6],
]

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by)
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
/** Distance from point (px,py) to segment a→b — for pass-lane interceptions. */
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
  const [hud, setHud] = useState({ us: 0, them: 0, quarter: 1, clock: 0, shot: 0, homeAbbr: 'HOM', awayAbbr: 'OPP' })
  const [final, setFinal] = useState<{ us: number; them: number; win: boolean } | null>(null)
  const oppColorUi = matchMode ? useGame.getState().currentOpponent()?.color ?? '#e8503a' : '#e8503a'

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // match context (ratings + scheduled opponent)
    const st0 = useGame.getState()
    const starters = (st0.franchise?.roster ?? []).slice(0, 5)
    const homeShoot = starters.length ? starters.reduce((a, p) => a + p.shooting, 0) / starters.length : 6
    const avgMorale = starters.length ? starters.reduce((a, p) => a + p.morale, 0) / starters.length : 60
    const opp0 = matchMode ? st0.currentOpponent() : null
    // team morale nudges your shooting up/down
    const homeShootF = (0.82 + homeShoot * 0.03) * (0.9 + avgMorale * 0.0016)
    const awayShootF = 0.82 + (opp0?.offense ?? 6) * 0.03
    const homeAbbr = (st0.franchise?.teamName ?? 'HOM').slice(0, 3).toUpperCase()
    const awayAbbr = opp0?.abbr ?? 'OPP'

    const homeColor = franchise?.colorPrimary ?? '#ff8a3d'
    const awayColor = (matchMode && opp0?.color) || '#e8503a'
    const logo = (franchise?.teamName?.[0] ?? 'H').toUpperCase()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    // match clock / score
    const QUARTER_SECONDS = 60
    const SHOT_CLOCK = 20
    let us = 0
    let them = 0
    let quarter = 1
    let gameClock = QUARTER_SECONDS
    let shotClock = SHOT_CLOCK
    let ended = false
    let prevPossession: 'home' | 'away' = 'home'
    let lastHudKey = ''

    let W = 0
    let H = 0
    let rimX = 0
    let rimY = 0
    let arcR = 0
    let pr = 18
    let ballR = 10
    let band = 26
    let SPEED = 300
    let AISPEED = 230

    const home: P[] = HOME.map(() => ({ x: 0, y: 0, team: 'home' }))
    // Teammate offense AI: each holds a base spot + occasionally cuts to the rim.
    const cutUntil = new Array(5).fill(0)
    let nextCutAt = 0
    const away: P[] = AWAY.map(() => ({ x: 0, y: 0, team: 'away' }))
    let active = 0

    const ball = { x: 0, y: 0, z: 0, t: 0, dur: 0.7, peak: 60 }
    let possession: 'home' | 'away' = 'home'
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

    // shot/pass scratch
    const shotFrom = { x: 0, y: 0 }
    const land = { x: 0, y: 0 }
    let made = false
    let shotKind: '2' | '3' | 'layup' = '2'
    let passFrom = 0
    let passTo = 0
    let passT = 0
    let passDur = 0.25

    // joystick
    let joyId: number | null = null
    let baseX = 0
    let baseY = 0
    let vx = 0
    let vy = 0
    let maxR = 60

    const result = (text: string, kind: string) => setMsg({ text, kind })

    function layout() {
      const rect = canvas!.getBoundingClientRect()
      W = rect.width
      H = rect.height
      canvas!.width = Math.floor(W * dpr)
      canvas!.height = Math.floor(H * dpr)
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      rimX = W * 0.9
      rimY = H * 0.5
      arcR = Math.min(W * 0.52, H * 0.94)
      pr = Math.max(12, H * 0.062)
      ballR = pr * 0.55
      band = H * 0.07
      SPEED = H * 1.15
      AISPEED = SPEED * 0.78
      maxR = Math.min(W, H) * 0.12
      home.forEach((p, i) => {
        p.x = HOME[i][0] * W
        p.y = HOME[i][1] * H
      })
      away.forEach((p, i) => {
        p.x = AWAY[i][0] * W
        p.y = AWAY[i][1] * H
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
    function shotInfo(p: P, defenders: P[]) {
      const d = dist(p.x, p.y, rimX, rimY)
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

    function doPass() {
      const target = bestPassTarget()
      if (target < 0) return
      const a = home[active]
      const b = home[target]
      // a defender sitting in the lane can pick it off
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
      passDur = clamp(dist(a.x, a.y, b.x, b.y) / (W * 3), 0.16, 0.4)
      phase = 'passing'
      sfx.pass()
    }

    function doShoot(c: number) {
      const a = home[active]
      const info = shotInfo(a, away)
      shotKind = info.layup ? 'layup' : info.three ? '3' : '2'
      let prob = info.baseP * (info.open ? 1.12 : 0.62) * timingFactor(c) * homeShootF
      prob = clamp(prob, 0.05, 0.96)
      made = Math.random() < prob
      shotFrom.x = a.x
      shotFrom.y = a.y
      ball.x = a.x
      ball.y = a.y
      ball.z = 0
      ball.t = 0
      ball.dur = info.layup ? 0.45 : 0.72
      ball.peak = info.layup ? H * 0.12 : clamp(info.d * 0.26, H * 0.14, H * 0.4)
      if (made) {
        land.x = rimX
        land.y = rimY
      } else {
        land.x = rimX + (Math.random() * 2 - 1) * pr * 1.3
        land.y = rimY + (Math.random() * 2 - 1) * pr * 1.3
      }
      phase = 'shooting'
      sfx.shoot()
    }

    function resolveShotFlight() {
      const clutch = matchMode && quarter === 4 && gameClock <= 10 && Math.abs(us - them) <= 7
      if (made) {
        const pts = shotKind === '3' ? 3 : 2
        if (possession === 'home') us += pts
        else them += pts
        netFlash = 0.45
        netSwish = 0.5
        crowdJump = clutch ? 0.85 : 0.6
        ball.x = rimX
        ball.y = rimY
        ball.z = 0
        if (shotKind === 'layup') {
          const dunk = dist(shotFrom.x, shotFrom.y, rimX, rimY) < pr * 2.6
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

    // Steer a player toward a target with separation from everyone nearby.
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
        p.x = clamp(p.x + (gx / d) * s, W * 0.05, W * 0.95)
        p.y = clamp(p.y + (gy / d) * s, band + pr, H - band - pr)
      }
    }

    function runOffenseAI(dt: number) {
      if (now > nextCutAt) {
        nextCutAt = now + 2.4 + Math.random() * 1.8
        const cands: number[] = []
        for (let i = 0; i < home.length; i++) if (i !== active && now >= cutUntil[i]) cands.push(i)
        if (cands.length) cutUntil[cands[(Math.random() * cands.length) | 0]] = now + 1.2
      }
      for (let i = 0; i < home.length; i++) {
        if (i === active) continue
        const p = home[i]
        const cutting = now < cutUntil[i]
        const tx = cutting ? rimX - pr * 2.6 : HOME[i][0] * W
        const ty = cutting ? rimY + (i - 2) * pr * 1.1 : HOME[i][1] * H
        steerTo(p, tx, ty, AISPEED, dt)
      }
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

    // Step 6: opponent defense — guard your men, pressure the ball, steal.
    function runAwayDefenseAI(dt: number) {
      for (let i = 0; i < away.length; i++) {
        const man = home[i % home.length]
        const onBall = i % home.length === active
        const tight = onBall ? 0.18 : 0.34
        steerTo(
          away[i],
          man.x + (rimX - man.x) * tight,
          man.y + (rimY - man.y) * tight,
          onBall ? AISPEED * 0.96 : AISPEED * 0.82,
          dt,
          pr * 2.4,
        )
      }
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

    function awayPass(target: number) {
      awayHandler = target
      sfx.pass()
    }

    function awayShoot() {
      const bh = away[awayHandler]
      // a well-timed BLOCK by the active defender stuffs it
      const contestD = dist(home[active].x, home[active].y, bh.x, bh.y)
      if (contestD < pr * 2.7 && now < blockUntil) {
        result('BLOCKED!', 'miss')
        sfx.block()
        crowdJump = 0.6
        shake = Math.max(shake, 7)
        flipToHome()
        return
      }
      const info = shotInfo(bh, home)
      shotKind = info.layup ? 'layup' : info.three ? '3' : '2'
      let prob = info.baseP * (info.open ? 1.05 : 0.55) * (contestD < pr * 3 ? 0.62 : 1) * awayShootF
      prob = clamp(prob, 0.05, 0.92)
      made = Math.random() < prob
      shotFrom.x = bh.x
      shotFrom.y = bh.y
      ball.x = bh.x
      ball.y = bh.y
      ball.z = 0
      ball.t = 0
      ball.dur = info.layup ? 0.45 : 0.72
      ball.peak = info.layup ? H * 0.12 : clamp(info.d * 0.26, H * 0.14, H * 0.4)
      if (made) {
        land.x = rimX
        land.y = rimY
      } else {
        land.x = rimX + (Math.random() * 2 - 1) * pr * 1.3
        land.y = rimY + (Math.random() * 2 - 1) * pr * 1.3
      }
      phase = 'shooting'
      sfx.shoot()
    }

    // Step 5: opponent offense — drive, decide pass/shoot vs your defense.
    function runAwayOffenseAI(dt: number) {
      const bh = away[awayHandler]
      const openD = nearestDist(bh, home)
      const d2 = dist(bh.x, bh.y, rimX, rimY)
      if (now > awayThinkAt) {
        awayThinkAt = now + 0.35
        const elapsed = now - awayPossStart
        if (d2 < pr * 3.8 || elapsed > 6) {
          awayShoot()
          return
        }
        if (openD > pr * 4.6 && d2 < arcR * 1.05 && Math.random() < 0.55) {
          awayShoot()
          return
        }
        let best = -1
        let bs = openD + pr * 1.8
        for (let i = 0; i < away.length; i++) {
          if (i === awayHandler) continue
          const od = nearestDist(away[i], home)
          if (od > bs) {
            bs = od
            best = i
          }
        }
        if (best >= 0 && Math.random() < 0.5) {
          awayPass(best)
          return
        }
      }
      // drive toward the rim, drifting around a defender in the way
      let nd = Infinity
      let near: P | null = null
      for (const h of home) {
        const d = dist(bh.x, bh.y, h.x, h.y)
        if (d < nd) {
          nd = d
          near = h
        }
      }
      let ty = rimY
      if (near && nd < pr * 2.4) ty += (bh.y < rimY ? -1 : 1) * pr * 2
      steerTo(bh, rimX - pr * 2, ty, AISPEED * 0.95, dt)
      for (let i = 0; i < away.length; i++) {
        if (i === awayHandler) continue
        steerTo(away[i], AWAY[i][0] * W, AWAY[i][1] * H, AISPEED * 0.8, dt)
      }
    }

    // Home man-defense: each non-active defender sits between his man + rim.
    function runHomeDefenseAI(dt: number) {
      for (let i = 0; i < home.length; i++) {
        if (i === active) continue
        const man = away[i % away.length]
        const tx = man.x + (rimX - man.x) * 0.32
        const ty = man.y + (rimY - man.y) * 0.32
        steerTo(home[i], tx, ty, AISPEED, dt)
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

    // Step 7: rebound battle on a miss — nearest-to-rim (+RNG) grabs it.
    function rebound() {
      let bestIdx = 0
      let bestIsHome = true
      let bestScore = -Infinity
      for (let i = 0; i < home.length; i++) {
        const s = -dist(home[i].x, home[i].y, rimX, rimY) + Math.random() * pr * 4
        if (s > bestScore) {
          bestScore = s
          bestIdx = i
          bestIsHome = true
        }
      }
      for (let i = 0; i < away.length; i++) {
        const s = -dist(away[i].x, away[i].y, rimX, rimY) + Math.random() * pr * 4
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
      const key = `${us}|${them}|${quarter}|${Math.ceil(gameClock)}|${Math.ceil(shotClock)}`
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
        })
      }
    }

    function update(dt: number) {
      t += dt
      if (shake > 0) shake = Math.max(0, shake - dt * 40)
      if (netFlash > 0) netFlash = Math.max(0, netFlash - dt)
      if (netSwish > 0) netSwish = Math.max(0, netSwish - dt)
      if (crowdJump > 0) crowdJump = Math.max(0, crowdJump - dt)

      // --- match clock / quarters / shot clock (match mode only) ---
      if (matchMode && !ended) {
        if (phase === 'live') {
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
      }
      if (ended) return
      if (possession !== prevPossession) {
        prevPossession = possession
        shotClock = SHOT_CLOCK
      }

      const c = controls.current
      // sprint + stamina
      let speed = SPEED
      if (c.sprint && stamina > 0.02) {
        speed *= 1.7
        stamina = Math.max(0, stamina - dt * 0.5)
      } else {
        stamina = Math.min(1, stamina + dt * 0.3)
      }

      // move active
      const a = home[active]
      a.x = clamp(a.x + vx * speed * dt, W * 0.05, W * 0.95)
      a.y = clamp(a.y + vy * speed * dt, band + pr, H - band - pr)

      if (stealCd > 0) stealCd -= dt

      if (possession === 'home') {
        runOffenseAI(dt)
        runAwayDefenseAI(dt)
        // offense intents
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
        // defense intents
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
          // made bucket → the other team inbounds
          if (shooter === 'home') flipToAway(0)
          else flipToHome()
        } else {
          // miss → live rebound battle
          rebound()
        }
        phase = 'live'
      }
    }

    // ---- drawing ----
    function drawCourt() {
      ctx!.fillStyle = '#c98a4a'
      ctx!.fillRect(0, 0, W, H)
      ctx!.fillStyle = 'rgba(0,0,0,0.05)'
      for (let i = 0; i < W; i += 26) ctx!.fillRect(i, 0, 1, H)
      ctx!.fillStyle = '#1a1f33'
      ctx!.fillRect(0, 0, W, band)
      ctx!.fillRect(0, H - band, W, band)
      const hop = crowdJump > 0 ? Math.sin((1 - Math.min(1, crowdJump / 0.6)) * Math.PI) * 5 : 0
      for (let i = 0; i < 60; i++) {
        ctx!.fillStyle = ['#3a4170', '#4a3a6a', '#5a4a3a', '#3a5a4a'][i % 4]
        const cx = (i * 41) % W
        ctx!.beginPath()
        ctx!.arc(cx + 6, (i % 2 === 0 ? band * 0.5 : H - band * 0.5) - hop, 3.5, 0, Math.PI * 2)
        ctx!.fill()
      }
      ctx!.strokeStyle = 'rgba(255,255,255,0.16)'
      ctx!.lineWidth = 2
      ctx!.beginPath()
      ctx!.arc(W * 0.4, H * 0.5, pr * 1.9, 0, Math.PI * 2)
      ctx!.stroke()
      ctx!.globalAlpha = 0.12
      ctx!.fillStyle = '#fff'
      ctx!.font = `bold ${pr * 2.3}px sans-serif`
      ctx!.textAlign = 'center'
      ctx!.textBaseline = 'middle'
      ctx!.fillText(logo, W * 0.4, H * 0.5)
      ctx!.globalAlpha = 1
      ctx!.textBaseline = 'alphabetic'
      ctx!.strokeStyle = 'rgba(255,255,255,0.5)'
      ctx!.lineWidth = 2.5
      const laneH = H * 0.42
      const laneW = W * 0.18
      ctx!.fillStyle = 'rgba(255,255,255,0.08)'
      ctx!.fillRect(rimX - laneW, rimY - laneH / 2, laneW + W * 0.1, laneH)
      ctx!.strokeRect(rimX - laneW, rimY - laneH / 2, laneW + W * 0.1, laneH)
      ctx!.beginPath()
      ctx!.arc(rimX, rimY, arcR, 0.62 * Math.PI, 1.38 * Math.PI)
      ctx!.stroke()
      // hoop + net
      ctx!.fillStyle = '#eef1f6'
      ctx!.fillRect(rimX + pr * 1.4, rimY - H * 0.11, 6, H * 0.22)
      ctx!.strokeStyle = '#ff6a2a'
      ctx!.lineWidth = 4
      ctx!.beginPath()
      ctx!.ellipse(rimX, rimY, pr * 0.5, pr * 0.8, 0, 0, Math.PI * 2)
      ctx!.stroke()
      ctx!.strokeStyle = netFlash > 0 ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.55)'
      ctx!.lineWidth = 1.4
      const sw = netSwish > 0 ? netSwish / 0.5 : 0
      for (let i = -2; i <= 2; i++) {
        const sway = Math.sin((0.5 - netSwish) * 26 + i * 1.5) * pr * 0.18 * sw
        ctx!.beginPath()
        ctx!.moveTo(rimX, rimY + (i / 2) * pr * 0.7)
        ctx!.lineTo(rimX - pr * 0.7 - sway, rimY + (i / 4) * pr * 0.7 + sw * pr * 0.25)
        ctx!.stroke()
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
      // charge meter + live make-% while charging
      if (phase === 'live' && possession === 'home' && controls.current.charging) {
        const bw = pr * 2.6
        const bx = a.x - bw / 2
        const by = a.y - pr * 2.6
        ctx!.fillStyle = 'rgba(0,0,0,0.5)'
        ctx!.fillRect(bx, by, bw, 7)
        // sweet band
        ctx!.fillStyle = 'rgba(90,230,140,0.55)'
        ctx!.fillRect(bx + bw * 0.78, by, bw * 0.17, 7)
        ctx!.fillStyle = '#ffcf4a'
        ctx!.fillRect(bx, by, bw * clamp(charge, 0, 1), 7)
        // make %
        const info = shotInfo(a, away)
        const prob = clamp(info.baseP * (info.open ? 1.12 : 0.62) * timingFactor(charge), 0.05, 0.96)
        ctx!.fillStyle = '#fff'
        ctx!.font = 'bold 13px system-ui'
        ctx!.textAlign = 'center'
        ctx!.fillText(`${Math.round(prob * 100)}%`, a.x, by - 5)
      }
      // contest ring while blocking (a real shot to block arrives in step 5)
      if (now < blockUntil) {
        ctx!.strokeStyle = '#b86bff'
        ctx!.lineWidth = 3
        ctx!.beginPath()
        ctx!.arc(a.x, a.y - pr * 1.9, pr * 0.55, 0, Math.PI * 2)
        ctx!.stroke()
      }
      // stamina bar (when sprinting / not full)
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
      // buzzer-beater slow-mo: Q4, final seconds, close, ball in the air
      if (matchMode && quarter === 4 && gameClock <= 8 && Math.abs(us - them) <= 6 && phase === 'shooting') {
        dt *= 0.4
      }
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
          <button
            className="court-back"
            onClick={() => navigate('season')}
            aria-label="Back"
          >
            ‹
          </button>
          <div className="sb-team" style={{ ['--p']: franchise?.colorPrimary } as React.CSSProperties}>
            <span className="sb-abbr">{hud.homeAbbr}</span>
            <span className="sb-score">{hud.us}</span>
          </div>
          <div className="sb-center">
            <span className="sb-q">Q{hud.quarter}</span>
            <span className={`sb-clock${hud.clock <= 10 ? ' clutch' : ''}`}>{mmss(hud.clock)}</span>
            <span className={`sb-shot${hud.shot <= 5 ? ' low' : ''}`}>:{hud.shot}</span>
          </div>
          <div className="sb-team opp" style={{ ['--p']: oppColorUi } as React.CSSProperties}>
            <span className="sb-score">{hud.them}</span>
            <span className="sb-abbr">{hud.awayAbbr}</span>
          </div>
        </div>
      ) : (
        <div className="court-hud">
          <button className="court-back" onClick={() => navigate('hub')} aria-label="Back">
            ‹
          </button>
          <div className="court-stat">
            <span className="cs-k">5v5</span>
            <span className="cs-v">BETA</span>
          </div>
          <div className="court-hint-top">
            {onDefense ? (
              <>
                <b>DEFENSE</b> · <b>SWITCH</b> · <b>STEAL</b> near ball · <b>BLOCK</b> a shot ·{' '}
                <b>SPRINT</b>
              </>
            ) : (
              <>
                <b>Left</b>: move · <b>SHOOT</b>: hold &amp; release in the green · <b>PASS</b>{' '}
                switches control · <b>SPRINT</b>
              </>
            )}
          </div>
        </div>
      )}
      <div className="court-canvas-wrap">
        <canvas ref={canvasRef} className="court-canvas" />
        {msg.text && <div className={`court-msg ${msg.kind}`}>{msg.text}</div>}

        {final && (
          <div className="c5-final">
            <div className="c5-final-card">
              <div className={`final-title ${final.win ? 'win' : 'loss'}`}>
                {final.win ? 'WIN!' : 'LOSS'}
              </div>
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
            <button
              className="c5-btn pass"
              onPointerDown={press((c) => {
                c.switchD = true
              })}
            >
              🔄<small>SWITCH</small>
            </button>
            <button
              className="c5-btn shoot"
              onPointerDown={press((c) => {
                c.steal = true
              })}
            >
              ✋<small>STEAL</small>
            </button>
            <button
              className="c5-btn block"
              onPointerDown={press((c) => {
                c.block = true
              })}
            >
              🚫<small>BLOCK</small>
            </button>
            <button
              className="c5-btn sprint"
              onPointerDown={press((c) => {
                c.sprint = true
              })}
              onPointerUp={press((c) => {
                c.sprint = false
              })}
              onPointerLeave={press((c) => {
                c.sprint = false
              })}
            >
              ⚡<small>SPRINT</small>
            </button>
          </div>
        ) : (
          <div className="c5-buttons">
            <button
              className="c5-btn pass"
              onPointerDown={press((c) => {
                c.pass = true
              })}
            >
              ➜<small>PASS</small>
            </button>
            <button
              className="c5-btn shoot"
              onPointerDown={press((c) => {
                c.charging = true
              })}
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
              onPointerDown={press((c) => {
                c.sprint = true
              })}
              onPointerUp={press((c) => {
                c.sprint = false
              })}
              onPointerLeave={press((c) => {
                c.sprint = false
              })}
            >
              ⚡<small>SPRINT</small>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
