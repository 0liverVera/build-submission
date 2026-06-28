import { useEffect, useRef, useState } from 'react'
import { useGame } from '../state/store'
import { sfx } from '../audio/sfx'

/**
 * PHASE 2 — the core offensive possession (LANDSCAPE, top-down-ish half court).
 * Hoop is on the RIGHT; the action reads left → right toward it.
 *   • drag BACK (away from the hoop) + release to shoot — aim the landing spot,
 *     power = drag length; a live target ring turns green when it's on the rim
 *   • tap an open teammate to pass (defenders close out with a lag → open windows)
 *   • swipe toward the hoop (RIGHT) to drive for a layup/dunk (a defender can block)
 * 14s shot clock forces decisions. Make it FUN before anything else.
 */

type PosName = 'PG' | 'SG' | 'SF' | 'PF' | 'C'
type Phase = 'live' | 'shooting' | 'passing' | 'driving' | 'resolved'

interface OPlayer {
  id: number
  pos: PosName
  rx: number
  ry: number
  x: number
  y: number
}
interface Defender {
  id: number
  guard: number
  x: number
  y: number
  tx: number
  ty: number
}

// Attacking the hoop on the right; spread across the left ~70% of the floor.
const FORMATION: { pos: PosName; rx: number; ry: number }[] = [
  { pos: 'PG', rx: 0.18, ry: 0.5 },
  { pos: 'SG', rx: 0.4, ry: 0.24 },
  { pos: 'SF', rx: 0.4, ry: 0.76 },
  { pos: 'PF', rx: 0.58, ry: 0.38 },
  { pos: 'C', rx: 0.62, ry: 0.64 },
]

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

interface Hud {
  points: number
  made: number
  att: number
  clock: number
  msg: string
  msgKind: string
}

export default function CourtGame() {
  const navigate = useGame((s) => s.navigate)
  const franchise = useGame((s) => s.franchise)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hud, setHud] = useState<Hud>({
    points: 0,
    made: 0,
    att: 0,
    clock: 14,
    msg: '',
    msgKind: '',
  })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const teamColor = franchise?.colorPrimary ?? '#ff8a3d'
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    let W = 0
    let H = 0
    let rimX = 0
    let rimY = 0
    let arcR = 0
    let pr = 18
    let ballR = 10
    let maxDrag = 200
    let TOL = 34

    const dist = (ax: number, ay: number, bx: number, by: number) =>
      Math.hypot(ax - bx, ay - by)

    const players: OPlayer[] = FORMATION.map((f, i) => ({
      id: i,
      pos: f.pos,
      rx: f.rx,
      ry: f.ry,
      x: 0,
      y: 0,
    }))
    const defenders: Defender[] = players.map((p) => ({
      id: p.id,
      guard: p.id,
      x: 0,
      y: 0,
      tx: 0,
      ty: 0,
    }))
    const ball = {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      z: 0,
      t: 0,
      dur: 0.7,
      peak: 60,
      held: 0 as number | null,
      flight: false,
      three: false,
    }

    let phase: Phase = 'live'
    let handler = 0
    let shotClock = 14
    let resolveAt = 0
    let now = 0
    let shake = 0
    let netFlash = 0
    let contested = false
    let dribbleT = 0

    let passFrom = 0
    let passTo = 0
    let passT = 0
    let passDur = 0.25
    let driveFrom = { x: 0, y: 0 }
    let driveTarget = { x: 0, y: 0 }
    let driveT = 0

    let points = 0
    let made = 0
    let att = 0

    let aiming = false
    const down = { x: 0, y: 0 }
    const cur = { x: 0, y: 0 }
    let tapCandidate: number | null = null

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
      maxDrag = Math.min(W, H) * 0.55
      TOL = pr * 1.95
      for (const p of players) {
        p.x = p.rx * W
        p.y = p.ry * H
      }
      setDefenderTargets(handler, true)
    }

    function setDefenderTargets(handlerId: number, snap = false) {
      for (const d of defenders) {
        const p = players[d.guard]
        const tight = d.guard === handlerId ? 0.16 : 0.4
        d.tx = p.x + (rimX - p.x) * tight + (Math.random() * 2 - 1) * 5
        d.ty = p.y + (rimY - p.y) * tight + (Math.random() * 2 - 1) * 5
        if (snap) {
          d.x = d.tx
          d.y = d.ty
        }
      }
    }

    function nearestDefenderTo(x: number, y: number) {
      let best = Infinity
      for (const d of defenders) best = Math.min(best, dist(x, y, d.x, d.y))
      return best
    }

    function newPossession() {
      for (const p of players) {
        p.x = p.rx * W
        p.y = p.ry * H
      }
      handler = 0
      ball.held = handler
      ball.flight = false
      ball.z = 0
      phase = 'live'
      shotClock = 14
      contested = false
      setDefenderTargets(handler, true)
    }

    function shootFromHandler(dir: { x: number; y: number }, power: number) {
      const p = players[handler]
      const range = lerp(W * 0.22, W * 1.0, power)
      ball.dur = lerp(0.55, 0.95, power)
      ball.peak = clamp(range * 0.26, H * 0.12, H * 0.42)
      ball.held = null
      ball.flight = true
      ball.x = p.x
      ball.y = p.y
      ball.z = 0
      ball.t = 0
      ball.vx = (dir.x * range) / ball.dur
      ball.vy = (dir.y * range) / ball.dur
      ball.three = dist(p.x, p.y, rimX, rimY) > arcR
      contested = nearestDefenderTo(p.x, p.y) < pr * 3.2
      phase = 'shooting'
      att++
      sfx.shoot()
    }

    function resolveShot() {
      const d = dist(ball.x, ball.y, rimX, rimY)
      const tol = TOL * (contested ? 0.62 : 1)
      let kind: 'swish' | 'make' | 'rattleIn' | 'miss'
      if (d < tol * 0.42) kind = 'swish'
      else if (d < tol) kind = 'make'
      else if (d < tol * 1.7) kind = Math.random() < 0.45 ? 'rattleIn' : 'miss'
      else kind = 'miss'

      if (kind === 'miss') {
        setMsg('MISS', 'miss')
        sfx.rim()
        shake = Math.max(shake, 2)
      } else {
        const pts = ball.three ? 3 : 2
        points += pts
        made++
        netFlash = 0.45
        ball.x = rimX
        ball.y = rimY
        ball.z = 0
        if (ball.three) {
          setMsg(kind === 'swish' ? 'SWISH · 3!' : 'BANG · 3!', 'three')
          sfx.three()
          shake = Math.max(shake, 9)
        } else {
          setMsg(
            kind === 'swish' ? 'SWISH!' : kind === 'rattleIn' ? 'IN & OUT… IN!' : 'BUCKET!',
            'make',
          )
          sfx.make()
          if (kind === 'swish') sfx.swish()
          shake = Math.max(shake, 4)
        }
      }
      phase = 'resolved'
      resolveAt = now + 1.1
    }

    function startPass(targetId: number) {
      passFrom = handler
      passTo = targetId
      passT = 0
      const a = players[passFrom]
      const b = players[targetId]
      passDur = clamp(dist(a.x, a.y, b.x, b.y) / (W * 3), 0.16, 0.4)
      ball.held = null
      ball.flight = false
      ball.z = 0
      phase = 'passing'
      sfx.pass()
    }

    function startDrive() {
      driveFrom = { x: players[handler].x, y: players[handler].y }
      driveTarget = { x: rimX - pr * 2, y: rimY }
      driveT = 0
      phase = 'driving'
      sfx.dribble()
    }

    function resolveDrive() {
      att++
      const guarded = nearestDefenderTo(rimX - pr, rimY) < pr * 2.6
      if (guarded && Math.random() < 0.5) {
        setMsg('STUFFED!', 'miss')
        sfx.block()
        shake = Math.max(shake, 6)
      } else if (guarded) {
        points += 2
        made++
        setMsg('AND-1 LAYUP!', 'make')
        sfx.make()
        netFlash = 0.4
        shake = Math.max(shake, 4)
      } else {
        points += 2
        made++
        setMsg('DUNK!', 'dunk')
        sfx.dunk()
        netFlash = 0.5
        shake = Math.max(shake, 10)
      }
      phase = 'resolved'
      resolveAt = now + 1.1
    }

    function turnover(msg: string) {
      setMsg(msg, 'miss')
      sfx.buzzer()
      phase = 'resolved'
      resolveAt = now + 1.0
      ball.held = null
      ball.flight = false
    }

    function update(dt: number) {
      for (const d of defenders) {
        const k = Math.min(1, 6 * dt)
        d.x = lerp(d.x, d.tx, k)
        d.y = lerp(d.y, d.ty, k)
      }
      if (shake > 0) shake = Math.max(0, shake - dt * 40)
      if (netFlash > 0) netFlash = Math.max(0, netFlash - dt)
      dribbleT += dt

      if (phase === 'live') {
        shotClock -= dt
        if (shotClock <= 0) {
          shotClock = 0
          turnover('SHOT CLOCK!')
        }
      } else if (phase === 'passing') {
        passT += dt / passDur
        const a = players[passFrom]
        const b = players[passTo]
        const t = clamp(passT, 0, 1)
        ball.x = lerp(a.x, b.x, t)
        ball.y = lerp(a.y, b.y, t)
        ball.z = Math.sin(Math.PI * t) * pr * 0.6
        if (passT >= 1) {
          handler = passTo
          ball.held = handler
          ball.z = 0
          phase = 'live'
          setDefenderTargets(handler)
        }
      } else if (phase === 'driving') {
        driveT += dt / 0.5
        const t = easeOut(clamp(driveT, 0, 1))
        players[handler].x = lerp(driveFrom.x, driveTarget.x, t)
        players[handler].y = lerp(driveFrom.y, driveTarget.y, t)
        ball.held = handler
        if (driveT >= 1) resolveDrive()
      } else if (phase === 'shooting') {
        ball.t += dt
        const ft = ball.t / ball.dur
        if (ft >= 1) {
          resolveShot()
        } else {
          ball.x += ball.vx * dt
          ball.y += ball.vy * dt
          ball.z = ball.peak * Math.sin(Math.PI * ft)
        }
      }

      if (phase === 'resolved' && now >= resolveAt) {
        newPossession()
        pushHud('', '')
      }
    }

    let lastHud: Hud = { points: -1, made: -1, att: -1, clock: -1, msg: '?', msgKind: '' }
    function pushHud(msg = lastHud.msg, kind = lastHud.msgKind) {
      const clk = Math.ceil(shotClock)
      if (
        points !== lastHud.points ||
        made !== lastHud.made ||
        att !== lastHud.att ||
        clk !== lastHud.clock ||
        msg !== lastHud.msg ||
        kind !== lastHud.msgKind
      ) {
        lastHud = { points, made, att, clock: clk, msg, msgKind: kind }
        setHud({ points, made, att, clock: clk, msg, msgKind: kind })
      }
    }
    function setMsg(msg: string, kind: string) {
      pushHud(msg, kind)
    }

    // --- drawing ---
    function drawCourt() {
      ctx!.fillStyle = '#c98a4a'
      ctx!.fillRect(0, 0, W, H)
      ctx!.fillStyle = 'rgba(0,0,0,0.05)'
      for (let i = 0; i < W; i += 26) ctx!.fillRect(i, 0, 1, H)
      // crowd bands top & bottom
      const band = H * 0.07
      ctx!.fillStyle = '#1a1f33'
      ctx!.fillRect(0, 0, W, band)
      ctx!.fillRect(0, H - band, W, band)
      for (let i = 0; i < 60; i++) {
        ctx!.fillStyle = ['#3a4170', '#4a3a6a', '#5a4a3a', '#3a5a4a'][i % 4]
        const cx = (i * 41) % W
        const top = i % 2 === 0
        ctx!.beginPath()
        ctx!.arc(cx + 6, top ? band * 0.5 : H - band * 0.5, 3.5, 0, Math.PI * 2)
        ctx!.fill()
      }
      ctx!.strokeStyle = 'rgba(255,255,255,0.5)'
      ctx!.lineWidth = 2.5
      // lane (key) on the right
      const laneH = H * 0.42
      const laneW = W * 0.18
      ctx!.fillStyle = 'rgba(255,255,255,0.08)'
      ctx!.fillRect(rimX - laneW, rimY - laneH / 2, laneW + W * 0.1, laneH)
      ctx!.strokeRect(rimX - laneW, rimY - laneH / 2, laneW + W * 0.1, laneH)
      // 3pt arc opening left
      ctx!.beginPath()
      ctx!.arc(rimX, rimY, arcR, 0.62 * Math.PI, 1.38 * Math.PI)
      ctx!.stroke()
      // sideline at right (baseline)
      ctx!.beginPath()
      ctx!.moveTo(rimX + W * 0.02, band)
      ctx!.lineTo(rimX + W * 0.02, H - band)
      ctx!.stroke()
    }

    function drawHoop() {
      // backboard (vertical, right of rim)
      ctx!.fillStyle = '#eef1f6'
      ctx!.fillRect(rimX + pr * 1.4, rimY - H * 0.11, 6, H * 0.22)
      ctx!.strokeStyle = '#cf3a2a'
      ctx!.lineWidth = 3
      ctx!.strokeRect(rimX + pr * 1.4, rimY - pr * 0.7, 5, pr * 1.4)
      // rim (top-down ellipse)
      ctx!.strokeStyle = '#ff6a2a'
      ctx!.lineWidth = 4
      ctx!.beginPath()
      ctx!.ellipse(rimX, rimY, pr * 0.5, pr * 0.8, 0, 0, Math.PI * 2)
      ctx!.stroke()
      // net hint
      ctx!.strokeStyle = netFlash > 0 ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.55)'
      ctx!.lineWidth = 1.4
      for (let i = -2; i <= 2; i++) {
        ctx!.beginPath()
        ctx!.moveTo(rimX, rimY + (i / 2) * pr * 0.7)
        ctx!.lineTo(rimX - pr * 0.7, rimY + (i / 4) * pr * 0.7)
        ctx!.stroke()
      }
    }

    function drawPlayer(x: number, y: number, color: string, ring?: string) {
      ctx!.fillStyle = 'rgba(0,0,0,0.22)'
      ctx!.beginPath()
      ctx!.ellipse(x, y + pr * 0.85, pr * 0.85, pr * 0.38, 0, 0, Math.PI * 2)
      ctx!.fill()
      if (ring) {
        ctx!.strokeStyle = ring
        ctx!.lineWidth = 3
        ctx!.beginPath()
        ctx!.ellipse(x, y + pr * 0.85, pr * 1.2, pr * 0.5, 0, 0, Math.PI * 2)
        ctx!.stroke()
      }
      ctx!.fillStyle = color
      ctx!.beginPath()
      ctx!.moveTo(x - pr * 0.65, y + pr * 0.75)
      ctx!.lineTo(x - pr * 0.5, y - pr * 0.2)
      ctx!.quadraticCurveTo(x, y - pr * 0.65, x + pr * 0.5, y - pr * 0.2)
      ctx!.lineTo(x + pr * 0.65, y + pr * 0.75)
      ctx!.closePath()
      ctx!.fill()
      ctx!.fillStyle = '#e8b88f'
      ctx!.beginPath()
      ctx!.arc(x, y - pr * 0.65, pr * 0.42, 0, Math.PI * 2)
      ctx!.fill()
      ctx!.strokeStyle = 'rgba(0,0,0,0.22)'
      ctx!.lineWidth = 1.4
      ctx!.stroke()
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

    function drawAim() {
      if (!aiming) return
      const dragX = cur.x - down.x
      const dragY = cur.y - down.y
      const len = Math.hypot(dragX, dragY)
      if (len < 16) return
      const p = players[handler]
      if (dragX > 22 && Math.abs(dragX) > Math.abs(dragY) * 0.8) {
        ctx!.strokeStyle = 'rgba(45,212,191,0.9)'
        ctx!.lineWidth = 4
        ctx!.setLineDash([10, 8])
        ctx!.beginPath()
        ctx!.moveTo(p.x, p.y)
        ctx!.lineTo(rimX - pr, rimY)
        ctx!.stroke()
        ctx!.setLineDash([])
        return
      }
      const power = clamp(len / maxDrag, 0.12, 1)
      const dir = { x: -dragX / len, y: -dragY / len }
      const range = lerp(W * 0.22, W * 1.0, power)
      const lx = p.x + dir.x * range
      const ly = p.y + dir.y * range
      const tol = TOL * (nearestDefenderTo(p.x, p.y) < pr * 3.2 ? 0.62 : 1)
      const inRim = dist(lx, ly, rimX, rimY) < tol
      ctx!.strokeStyle = inRim ? 'rgba(90,230,140,0.95)' : 'rgba(255,255,255,0.8)'
      ctx!.lineWidth = 3
      ctx!.setLineDash([6, 7])
      ctx!.beginPath()
      ctx!.moveTo(p.x, p.y)
      ctx!.lineTo(lx, ly)
      ctx!.stroke()
      ctx!.setLineDash([])
      ctx!.beginPath()
      ctx!.arc(lx, ly, tol, 0, Math.PI * 2)
      ctx!.stroke()
      ctx!.fillStyle = '#ffcf4a'
      ctx!.font = 'bold 12px system-ui'
      ctx!.textAlign = 'center'
      ctx!.fillText(`${Math.round(power * 100)}%`, p.x, p.y - pr * 1.4)
    }

    function render() {
      ctx!.save()
      if (shake > 0) {
        ctx!.translate((Math.random() * 2 - 1) * shake, (Math.random() * 2 - 1) * shake)
      }
      drawCourt()
      drawHoop()
      for (const d of defenders) drawPlayer(d.x, d.y, '#39406b')
      for (const p of players) {
        let ring: string | undefined
        if (phase === 'live') {
          if (p.id === handler) ring = '#ffcf4a'
          else ring = nearestDefenderTo(p.x, p.y) > pr * 4 ? 'rgba(90,230,140,0.9)' : 'rgba(232,80,58,0.5)'
        }
        drawPlayer(p.x, p.y, teamColor, ring)
      }
      if (ball.held !== null) {
        const p = players[ball.held]
        const bob = phase === 'live' ? Math.abs(Math.sin(dribbleT * 9)) * 4 : 0
        drawBall(p.x + pr * 0.8, p.y + pr * 0.1, bob)
      } else {
        drawBall(ball.x, ball.y, ball.z)
      }
      drawAim()
      ctx!.restore()
    }

    let raf = 0
    let last = performance.now()
    function frame(t: number) {
      now = t / 1000
      const dt = Math.min(0.034, (t - last) / 1000)
      last = t
      update(dt)
      render()
      pushHud()
      raf = requestAnimationFrame(frame)
    }

    function local(e: PointerEvent) {
      const r = canvas!.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    function nearestPlayer(x: number, y: number) {
      let best = -1
      let bd = Infinity
      for (const p of players) {
        const d = dist(x, y, p.x, p.y)
        if (d < bd) {
          bd = d
          best = p.id
        }
      }
      return { id: best, d: bd }
    }
    function onDown(e: PointerEvent) {
      if (phase !== 'live') return
      const pt = local(e)
      down.x = pt.x
      down.y = pt.y
      cur.x = pt.x
      cur.y = pt.y
      const np = nearestPlayer(pt.x, pt.y)
      if (np.id === handler && np.d < pr * 3) {
        aiming = true
        tapCandidate = null
        canvas!.setPointerCapture(e.pointerId)
      } else if (np.id !== handler && np.d < pr * 2.6) {
        tapCandidate = np.id
      } else {
        tapCandidate = null
      }
      e.preventDefault()
    }
    function onMove(e: PointerEvent) {
      if (!aiming) return
      const pt = local(e)
      cur.x = pt.x
      cur.y = pt.y
    }
    function onUp(e: PointerEvent) {
      const pt = local(e)
      if (aiming) {
        aiming = false
        const dragX = pt.x - down.x
        const dragY = pt.y - down.y
        const len = Math.hypot(dragX, dragY)
        if (len < 18) {
          /* tap on handler — ignore */
        } else if (dragX > 22 && Math.abs(dragX) > Math.abs(dragY) * 0.8) {
          startDrive()
        } else {
          const dir = { x: -dragX / len, y: -dragY / len }
          shootFromHandler(dir, clamp(len / maxDrag, 0.12, 1))
        }
      } else if (tapCandidate !== null) {
        const moved = Math.hypot(pt.x - down.x, pt.y - down.y)
        if (moved < 20 && phase === 'live') startPass(tapCandidate)
      }
      tapCandidate = null
    }

    layout()
    newPossession()
    pushHud()
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
  }, [franchise])

  const pct = hud.att > 0 ? Math.round((hud.made / hud.att) * 100) : 0

  return (
    <div className="court-wrap">
      <div className="court-hud">
        <button className="court-back" onClick={() => navigate('hub')} aria-label="Back">
          ‹
        </button>
        <div className="court-stat">
          <span className="cs-k">PTS</span>
          <span className="cs-v">{hud.points}</span>
        </div>
        <div className="court-stat">
          <span className="cs-k">FG</span>
          <span className="cs-v">
            {hud.made}/{hud.att} · {pct}%
          </span>
        </div>
        <div className="court-hint-top">
          Pull <b>back</b> to shoot · tap <b>open</b> man to pass · swipe <b>right</b> to drive
        </div>
        <div className={`court-clock${hud.clock <= 5 ? ' warn' : ''}`}>{hud.clock}</div>
      </div>

      <div className="court-canvas-wrap">
        <canvas ref={canvasRef} className="court-canvas" />
        {hud.msg && <div className={`court-msg ${hud.msgKind}`}>{hud.msg}</div>}
      </div>
    </div>
  )
}
