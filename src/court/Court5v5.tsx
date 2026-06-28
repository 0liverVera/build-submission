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

interface Controls {
  sprint: boolean
  charging: boolean
  release: boolean
  pass: boolean
}

export default function Court5v5() {
  const navigate = useGame((s) => s.navigate)
  const franchise = useGame((s) => s.franchise)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const controls = useRef<Controls>({ sprint: false, charging: false, release: false, pass: false })
  const [msg, setMsg] = useState<{ text: string; kind: string }>({ text: '', kind: '' })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const homeColor = franchise?.colorPrimary ?? '#ff8a3d'
    const awayColor = '#e8503a'
    const logo = (franchise?.teamName?.[0] ?? 'H').toUpperCase()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

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

    const ball = { x: 0, y: 0, z: 0, t: 0, dur: 0.7, peak: 60, heldBy: 0 as number | null }
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

    const nearestAwayDist = (p: P) => {
      let best = Infinity
      for (const d of away) best = Math.min(best, dist(p.x, p.y, d.x, d.y))
      return best
    }
    const timingFactor = (c: number) => {
      if (c >= 0.78 && c <= 0.95) return 1.18
      const dd = Math.min(Math.abs(c - 0.78), Math.abs(c - 0.95))
      return Math.max(0.6, 1.18 - dd * 1.6)
    }
    function shotInfo(p: P) {
      const d = dist(p.x, p.y, rimX, rimY)
      const layup = d < pr * 4.2
      const three = !layup && d > arcR
      const open = nearestAwayDist(p) > pr * 4
      const baseP = layup ? 0.8 : three ? 0.42 : 0.56
      return { d, layup, three, open, baseP }
    }

    function bestPassTarget() {
      let best = -1
      let score = -Infinity
      home.forEach((p, i) => {
        if (i === active) return
        const s = nearestAwayDist(p) + (p.x - home[active].x) * 0.3
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
      passFrom = active
      passTo = target
      passT = 0
      const a = home[passFrom]
      const b = home[passTo]
      passDur = clamp(dist(a.x, a.y, b.x, b.y) / (W * 3), 0.16, 0.4)
      ball.heldBy = null
      phase = 'passing'
      sfx.pass()
    }

    function doShoot(c: number) {
      const a = home[active]
      const info = shotInfo(a)
      shotKind = info.layup ? 'layup' : info.three ? '3' : '2'
      let prob = info.baseP * (info.open ? 1.12 : 0.62) * timingFactor(c)
      prob = clamp(prob, 0.05, 0.96)
      made = Math.random() < prob
      shotFrom.x = a.x
      shotFrom.y = a.y
      ball.heldBy = null
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
      if (made) {
        netFlash = 0.45
        netSwish = 0.5
        crowdJump = 0.6
        ball.x = rimX
        ball.y = rimY
        ball.z = 0
        if (shotKind === 'layup') {
          const dunk = dist(shotFrom.x, shotFrom.y, rimX, rimY) < pr * 2.6
          result(dunk ? 'DUNK!' : 'LAYUP!', 'dunk')
          dunk ? sfx.dunk() : sfx.make()
          shake = Math.max(shake, dunk ? 9 : 4)
        } else if (shotKind === '3') {
          result('SWISH · 3!', 'three')
          sfx.three()
          sfx.swish()
          shake = Math.max(shake, 8)
        } else {
          result('BUCKET!', 'make')
          sfx.make()
          sfx.swish()
          shake = Math.max(shake, 4)
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

    function update(dt: number) {
      t += dt
      if (shake > 0) shake = Math.max(0, shake - dt * 40)
      if (netFlash > 0) netFlash = Math.max(0, netFlash - dt)
      if (netSwish > 0) netSwish = Math.max(0, netSwish - dt)
      if (crowdJump > 0) crowdJump = Math.max(0, crowdJump - dt)

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

      // --- teammate offense AI (the 4 you don't control) ---
      // stagger basket cuts so one teammate slashes at a time
      if (now > nextCutAt) {
        nextCutAt = now + 2.4 + Math.random() * 1.8
        const cands: number[] = []
        for (let i = 0; i < home.length; i++) if (i !== active && now >= cutUntil[i]) cands.push(i)
        if (cands.length) cutUntil[cands[(Math.random() * cands.length) | 0]] = now + 1.2
      }
      for (let i = 0; i < home.length; i++) {
        if (i === active) continue
        const p = home[i]
        let dxT: number
        let dyT: number
        if (now < cutUntil[i]) {
          // cut toward the rim with a little vertical spread
          dxT = rimX - pr * 2.6
          dyT = rimY + (i - 2) * pr * 1.1
        } else {
          // hold your spot
          dxT = HOME[i][0] * W
          dyT = HOME[i][1] * H
        }
        // spacing: push away from anyone too close
        let sx = 0
        let sy = 0
        for (const o of [...home, ...away]) {
          if (o === p) continue
          const d = dist(p.x, p.y, o.x, o.y)
          if (d > 0.1 && d < pr * 3) {
            sx += (p.x - o.x) / d
            sy += (p.y - o.y) / d
          }
        }
        const tx = dxT + sx * pr * 1.6
        const ty = dyT + sy * pr * 1.6
        const ddx = tx - p.x
        const ddy = ty - p.y
        const dd = Math.hypot(ddx, ddy)
        if (dd > 2) {
          const s = Math.min(AISPEED * dt, dd)
          p.x = clamp(p.x + (ddx / dd) * s, W * 0.05, W * 0.95)
          p.y = clamp(p.y + (ddy / dd) * s, band + pr, H - band - pr)
        }
      }

      // offense intents (only while live and holding the ball)
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
          ball.heldBy = active
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
        ball.heldBy = active
        ball.z = 0
        phase = 'live'
        result('', '')
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
      if (phase === 'live' && controls.current.charging) {
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
        const info = shotInfo(a)
        const prob = clamp(info.baseP * (info.open ? 1.12 : 0.62) * timingFactor(charge), 0.05, 0.96)
        ctx!.fillStyle = '#fff'
        ctx!.font = 'bold 13px system-ui'
        ctx!.textAlign = 'center'
        ctx!.fillText(`${Math.round(prob * 100)}%`, a.x, by - 5)
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
      if (ball.heldBy !== null) {
        const p = home[ball.heldBy]
        drawBall(p.x + pr * 0.8, p.y + pr * 0.1, 0)
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
      const dt = Math.min(0.034, (time - last) / 1000)
      last = time
      update(dt)
      render()
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
  }, [franchise])

  const press = (fn: (c: Controls) => void) => (e: React.PointerEvent) => {
    e.preventDefault()
    fn(controls.current)
  }

  return (
    <div className="court-wrap">
      <div className="court-hud">
        <button className="court-back" onClick={() => navigate('hub')} aria-label="Back">
          ‹
        </button>
        <div className="court-stat">
          <span className="cs-k">5v5</span>
          <span className="cs-v">BETA</span>
        </div>
        <div className="court-hint-top">
          <b>Left</b>: move · <b>SHOOT</b>: hold &amp; release in the green · <b>PASS</b> switches
          control · <b>SPRINT</b> burns stamina
        </div>
      </div>
      <div className="court-canvas-wrap">
        <canvas ref={canvasRef} className="court-canvas" />
        {msg.text && <div className={`court-msg ${msg.kind}`}>{msg.text}</div>}

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
      </div>
    </div>
  )
}
