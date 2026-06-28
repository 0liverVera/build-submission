import { useEffect, useRef, useState } from 'react'
import { useGame } from '../state/store'
import { sfx } from '../audio/sfx'

/**
 * PHASE 2 — the core offensive possession (the make-or-break of the game).
 * A self-contained canvas sandbox: get the ball, read the defense, and
 *   • drag BACK from the ball handler + release to shoot (real arc + preview)
 *   • tap an open teammate to pass (defense reacts, opening windows)
 *   • swipe UP toward the rim to drive for a layup/dunk (a defender can block)
 * A 14s shot clock forces decisions. Make it FUN before anything else.
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

const FORMATION: { pos: PosName; rx: number; ry: number }[] = [
  { pos: 'PG', rx: 0.5, ry: 0.78 },
  { pos: 'SG', rx: 0.18, ry: 0.64 },
  { pos: 'SF', rx: 0.82, ry: 0.64 },
  { pos: 'PF', rx: 0.34, ry: 0.48 },
  { pos: 'C', rx: 0.66, ry: 0.46 },
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
    let pr = 14 // player radius
    let ballR = 9
    let floorY = 0
    let maxDrag = 200
    let GRAV = 1200

    // --- mutable game state ---
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
    const ball = { x: 0, y: 0, vx: 0, vy: 0, held: 0 as number | null, flight: false }

    let phase: Phase = 'live'
    let handler = 0
    let shotClock = 14
    let resolveAt = 0
    let now = 0
    let shake = 0
    let netFlash = 0
    let contested = false
    let shotOrigin = { x: 0, y: 0 }
    let result: 'make' | 'miss' | null = null
    let dribbleT = 0

    // pass / drive animation
    let passFrom = 0
    let passTo = 0
    let passT = 0
    let passDur = 0.25
    let driveFrom = { x: 0, y: 0 }
    let driveTarget = { x: 0, y: 0 }
    let driveT = 0

    // session stats
    let points = 0
    let made = 0
    let att = 0

    // input
    let aiming = false
    const down = { x: 0, y: 0 }
    const cur = { x: 0, y: 0 }
    let tapCandidate: number | null = null
    let hintUntil = 6 // seconds of showing the coaching hint
    let elapsed = 0

    const dist = (ax: number, ay: number, bx: number, by: number) =>
      Math.hypot(ax - bx, ay - by)

    function layout() {
      const rect = canvas!.getBoundingClientRect()
      W = rect.width
      H = rect.height
      canvas!.width = Math.floor(W * dpr)
      canvas!.height = Math.floor(H * dpr)
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      rimX = W * 0.5
      rimY = H * 0.135
      arcR = Math.min(W * 0.46, H * 0.4)
      pr = Math.max(12, W * 0.036)
      ballR = pr * 0.62
      floorY = H * 0.9
      maxDrag = Math.min(W, H) * 0.5
      GRAV = H * 1.85
      for (const p of players) {
        p.x = p.rx * W
        p.y = p.ry * H
      }
      setDefenderTargets(handler, true)
    }

    function setDefenderTargets(handlerId: number, snap = false) {
      for (const d of defenders) {
        const p = players[d.guard]
        const tight = d.guard === handlerId ? 0.14 : 0.36
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
      phase = 'live'
      shotClock = 14
      result = null
      contested = false
      setDefenderTargets(handler, true)
    }

    function setMsg(msg: string, kind: string) {
      pushHud(msg, kind)
    }

    function shootFromHandler(dir: { x: number; y: number }, power: number) {
      const p = players[handler]
      shotOrigin = { x: p.x, y: p.y - pr * 0.5 }
      const d = dist(p.x, p.y, rimX, rimY)
      contested = nearestDefenderTo(p.x, p.y) < pr * 3.4
      const speed = lerp(H * 0.95, H * 2.3, power)
      ball.held = null
      ball.flight = true
      ball.x = shotOrigin.x
      ball.y = shotOrigin.y
      ball.vx = dir.x * speed
      ball.vy = dir.y * speed
      result = null
      phase = 'shooting'
      att++
      sfx.shoot()
      // remember whether this was a 3
      ;(ball as unknown as { three: boolean }).three = d > arcR
    }

    function resolveShot(kind: 'swish' | 'make' | 'rattleIn' | 'miss') {
      const three = (ball as unknown as { three: boolean }).three
      if (kind === 'miss') {
        result = 'miss'
        setMsg('MISS', 'miss')
        sfx.rim()
        ball.vy = -Math.abs(ball.vy) * 0.4
        ball.vx += (ball.x < rimX ? -1 : 1) * H * 0.12
        shake = Math.max(shake, 2)
      } else {
        result = 'make'
        const pts = three ? 3 : 2
        points += pts
        made++
        netFlash = 0.45
        if (three) {
          setMsg(kind === 'swish' ? 'SWISH · 3!' : 'BANG · 3!', 'three')
          sfx.three()
          shake = Math.max(shake, 9)
        } else {
          setMsg(kind === 'swish' ? 'SWISH!' : kind === 'rattleIn' ? 'IN & OUT… IN!' : 'BUCKET!', 'make')
          sfx.make()
          if (kind === 'swish') sfx.swish()
          shake = Math.max(shake, 4)
        }
        // drop the ball through the rim
        ball.x = rimX
        ball.vx = 0
        ball.vy = Math.abs(ball.vy) * 0.4 + H * 0.35
      }
      phase = 'resolved'
      resolveAt = now + 1.15
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
      phase = 'passing'
      sfx.pass()
    }

    function startDrive() {
      driveFrom = { x: players[handler].x, y: players[handler].y }
      driveTarget = { x: rimX, y: rimY + pr * 1.7 }
      driveT = 0
      phase = 'driving'
      sfx.dribble()
    }

    function resolveDrive() {
      att++
      const guarded = nearestDefenderTo(rimX, rimY + pr * 1.6) < pr * 2.6
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
      resolveAt = now + 1.15
    }

    function turnover(msg: string) {
      setMsg(msg, 'miss')
      sfx.buzzer()
      phase = 'resolved'
      resolveAt = now + 1.1
      ball.held = null
      ball.flight = false
    }

    // --- per-frame update ---
    function update(dt: number) {
      elapsed += dt
      // defenders slide toward targets (delay creates open windows)
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
        ball.y = lerp(a.y, b.y, t) - pr * 0.5
        if (passT >= 1) {
          handler = passTo
          ball.held = handler
          phase = 'live'
          setDefenderTargets(handler) // closeout lags → brief open look
        }
      } else if (phase === 'driving') {
        driveT += dt / 0.5
        const t = easeOut(clamp(driveT, 0, 1))
        players[handler].x = lerp(driveFrom.x, driveTarget.x, t)
        players[handler].y = lerp(driveFrom.y, driveTarget.y, t)
        ball.held = handler
        if (driveT >= 1) resolveDrive()
      } else if (phase === 'shooting' || phase === 'resolved') {
        if (ball.flight) {
          const prevY = ball.y
          ball.vy += GRAV * dt
          ball.x += ball.vx * dt
          ball.y += ball.vy * dt
          if (phase === 'shooting' && result === null && ball.vy > 0 && ball.y >= rimY && prevY < rimY) {
            const dx = Math.abs(ball.x - rimX)
            const tol = (W * 0.072) * (contested ? 0.62 : 1)
            if (dx < tol * 0.45) resolveShot('swish')
            else if (dx < tol) resolveShot('make')
            else if (dx < tol * 1.7) resolveShot(Math.random() < 0.45 ? 'rattleIn' : 'miss')
            else resolveShot('miss')
          }
          if (phase === 'shooting' && result === null && ball.y > floorY) {
            resolveShot('miss')
          }
          if (ball.y > floorY) {
            ball.y = floorY
            ball.vy *= -0.42
            ball.vx *= 0.6
          }
        }
      }

      if (phase === 'resolved' && now >= resolveAt) {
        newPossession()
        pushHud('', '')
      }
    }

    // --- HUD throttling ---
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

    // --- drawing ---
    function drawCourt() {
      // floor
      ctx!.fillStyle = '#c98a4a'
      ctx!.fillRect(0, 0, W, H)
      ctx!.fillStyle = 'rgba(0,0,0,0.06)'
      for (let i = 0; i < H; i += 22) ctx!.fillRect(0, i, W, 1)
      // crowd band
      ctx!.fillStyle = '#1a1f33'
      ctx!.fillRect(0, 0, W, rimY - pr * 1.5)
      for (let i = 0; i < 40; i++) {
        ctx!.fillStyle = ['#3a4170', '#4a3a6a', '#5a4a3a', '#3a5a4a'][i % 4]
        const cx = ((i * 53) % W) + 6
        const cy = ((i * 31) % (rimY - pr * 2)) + 4
        ctx!.beginPath()
        ctx!.arc(cx, cy, 4, 0, Math.PI * 2)
        ctx!.fill()
      }
      // lane
      const laneW = W * 0.32
      ctx!.fillStyle = 'rgba(255,255,255,0.08)'
      ctx!.fillRect(rimX - laneW / 2, rimY, laneW, H * 0.34)
      ctx!.strokeStyle = 'rgba(255,255,255,0.5)'
      ctx!.lineWidth = 2.5
      ctx!.strokeRect(rimX - laneW / 2, rimY, laneW, H * 0.34)
      // 3pt arc
      ctx!.beginPath()
      ctx!.arc(rimX, rimY, arcR, 0.16 * Math.PI, 0.84 * Math.PI)
      ctx!.stroke()
      // baseline
      ctx!.beginPath()
      ctx!.moveTo(0, rimY)
      ctx!.lineTo(W, rimY)
      ctx!.stroke()
    }

    function drawHoop() {
      // backboard
      ctx!.fillStyle = '#eef1f6'
      ctx!.fillRect(rimX - W * 0.11, rimY - pr * 1.5, W * 0.22, 6)
      ctx!.strokeStyle = '#cf3a2a'
      ctx!.lineWidth = 3
      ctx!.strokeRect(rimX - W * 0.05, rimY - pr * 1.5, W * 0.1, pr * 0.9)
      // rim
      ctx!.strokeStyle = '#ff6a2a'
      ctx!.lineWidth = 4
      ctx!.beginPath()
      ctx!.ellipse(rimX, rimY, W * 0.07, 5, 0, 0, Math.PI * 2)
      ctx!.stroke()
      // net
      ctx!.strokeStyle = netFlash > 0 ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.6)'
      ctx!.lineWidth = 1.5
      const netW = W * 0.07
      for (let i = -3; i <= 3; i++) {
        ctx!.beginPath()
        ctx!.moveTo(rimX + (i / 3) * netW, rimY + 3)
        ctx!.lineTo(rimX + (i / 6) * netW, rimY + pr * 1.5)
        ctx!.stroke()
      }
    }

    function drawPlayer(x: number, y: number, color: string, opts: { ring?: string; ball?: boolean }) {
      // shadow
      ctx!.fillStyle = 'rgba(0,0,0,0.22)'
      ctx!.beginPath()
      ctx!.ellipse(x, y + pr * 0.9, pr * 0.9, pr * 0.4, 0, 0, Math.PI * 2)
      ctx!.fill()
      if (opts.ring) {
        ctx!.strokeStyle = opts.ring
        ctx!.lineWidth = 3
        ctx!.beginPath()
        ctx!.ellipse(x, y + pr * 0.9, pr * 1.25, pr * 0.55, 0, 0, Math.PI * 2)
        ctx!.stroke()
      }
      // body
      ctx!.fillStyle = color
      ctx!.beginPath()
      ctx!.moveTo(x - pr * 0.7, y + pr * 0.8)
      ctx!.lineTo(x - pr * 0.55, y - pr * 0.2)
      ctx!.quadraticCurveTo(x, y - pr * 0.7, x + pr * 0.55, y - pr * 0.2)
      ctx!.lineTo(x + pr * 0.7, y + pr * 0.8)
      ctx!.closePath()
      ctx!.fill()
      // head
      ctx!.fillStyle = '#e8b88f'
      ctx!.beginPath()
      ctx!.arc(x, y - pr * 0.7, pr * 0.45, 0, Math.PI * 2)
      ctx!.fill()
      ctx!.strokeStyle = 'rgba(0,0,0,0.25)'
      ctx!.lineWidth = 1.5
      ctx!.stroke()
    }

    function drawBall(x: number, y: number) {
      ctx!.fillStyle = '#ff8a3d'
      ctx!.beginPath()
      ctx!.arc(x, y, ballR, 0, Math.PI * 2)
      ctx!.fill()
      ctx!.strokeStyle = 'rgba(80,30,0,0.7)'
      ctx!.lineWidth = 1.2
      ctx!.beginPath()
      ctx!.arc(x, y, ballR, 0, Math.PI * 2)
      ctx!.moveTo(x - ballR, y)
      ctx!.lineTo(x + ballR, y)
      ctx!.moveTo(x, y - ballR)
      ctx!.lineTo(x, y + ballR)
      ctx!.stroke()
    }

    function drawAim() {
      if (!aiming) return
      const dragX = cur.x - down.x
      const dragY = cur.y - down.y
      const len = Math.hypot(dragX, dragY)
      if (len < 16) return
      const p = players[handler]
      if (dragY < -22 && len > 24) {
        // drive arrow toward rim
        ctx!.strokeStyle = 'rgba(45,212,191,0.9)'
        ctx!.lineWidth = 4
        ctx!.setLineDash([10, 8])
        ctx!.beginPath()
        ctx!.moveTo(p.x, p.y - pr)
        ctx!.lineTo(rimX, rimY + pr)
        ctx!.stroke()
        ctx!.setLineDash([])
        return
      }
      // shot trajectory preview (same physics as the real shot)
      const power = clamp(len / maxDrag, 0.12, 1)
      const dir = { x: -dragX / len, y: -dragY / len }
      const speed = lerp(H * 0.95, H * 2.3, power)
      let sx = p.x
      let sy = p.y - pr * 0.5
      let vx = dir.x * speed
      let vy = dir.y * speed
      ctx!.fillStyle = 'rgba(255,255,255,0.85)'
      for (let i = 0; i < 26; i++) {
        const t = 0.035
        vy += GRAV * t
        sx += vx * t
        sy += vy * t
        if (sy > H || sx < 0 || sx > W) break
        if (i % 2 === 0) {
          ctx!.beginPath()
          ctx!.arc(sx, sy, 3, 0, Math.PI * 2)
          ctx!.fill()
        }
      }
      // power pip
      ctx!.fillStyle = '#ffcf4a'
      ctx!.font = 'bold 12px system-ui'
      ctx!.textAlign = 'center'
      ctx!.fillText(`${Math.round(power * 100)}%`, p.x, p.y + pr * 2.1)
    }

    function render() {
      ctx!.save()
      if (shake > 0) {
        ctx!.translate((Math.random() * 2 - 1) * shake, (Math.random() * 2 - 1) * shake)
      }
      drawCourt()
      drawHoop()
      // defenders
      for (const d of defenders) drawPlayer(d.x, d.y, '#39406b', {})
      // offense (highlight open teammates + the handler)
      for (const p of players) {
        let ring: string | undefined
        if (phase === 'live') {
          if (p.id === handler) ring = '#ffcf4a'
          else {
            const open = nearestDefenderTo(p.x, p.y)
            ring = open > pr * 4 ? 'rgba(90,230,140,0.9)' : 'rgba(232,80,58,0.5)'
          }
        }
        drawPlayer(p.x, p.y, teamColor, { ring })
      }
      // ball
      if (ball.held !== null) {
        const p = players[ball.held]
        const bob = phase === 'live' ? Math.sin(dribbleT * 10) * 3 : 0
        drawBall(p.x + pr * 0.8, p.y + pr * 0.2 + bob)
      } else {
        drawBall(ball.x, ball.y)
      }
      drawAim()
      ctx!.restore()
    }

    // --- loop ---
    let raf = 0
    let last = performance.now()
    function frame(t: number) {
      now = t / 1000
      const dt = Math.min(0.034, (t - last) / 1000)
      last = t
      update(dt)
      // periodic dribble sound while live
      render()
      pushHud()
      raf = requestAnimationFrame(frame)
    }

    // --- input ---
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
          // tap on handler — do nothing
        } else if (dragY < -22 && len > 24) {
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
      hintUntil = 0
      void hintUntil
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
        <div className={`court-clock${hud.clock <= 5 ? ' warn' : ''}`}>{hud.clock}</div>
      </div>

      <div className="court-canvas-wrap">
        <canvas ref={canvasRef} className="court-canvas" />
        {hud.msg && <div className={`court-msg ${hud.msgKind}`}>{hud.msg}</div>}
        <div className="court-hint">
          Pull <b>back</b> from your player to shoot · Tap an <b>open</b> teammate to pass · Swipe
          <b> up</b> to drive
        </div>
      </div>
    </div>
  )
}
