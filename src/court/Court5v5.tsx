import { useEffect, useRef } from 'react'
import { useGame } from '../state/store'

/**
 * GAMEPLAY OVERHAUL — full controllable 5v5 (FIFA-style). Built behind a BETA
 * entry so the existing season games keep working until this is playable.
 *
 * SUB-STEP 1: one active player controlled by a left-side virtual joystick,
 * clearly marked, moving smoothly on the landscape court. The other 9 players
 * are placed but static for now (AI arrives in later sub-steps).
 */

interface P {
  x: number
  y: number
  team: 'home' | 'away'
}

// Half-court 5v5 attacking the right hoop. Relative spots (rx,ry).
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

export default function Court5v5() {
  const navigate = useGame((s) => s.navigate)
  const franchise = useGame((s) => s.franchise)
  const canvasRef = useRef<HTMLCanvasElement>(null)

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

    const home: P[] = HOME.map(() => ({ x: 0, y: 0, team: 'home' }))
    const away: P[] = AWAY.map(() => ({ x: 0, y: 0, team: 'away' }))
    let active = 0 // index into home

    // joystick
    let joyId: number | null = null
    let baseX = 0
    let baseY = 0
    let vx = 0
    let vy = 0
    let maxR = 60
    let t = 0

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
      SPEED = H * 1.25
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

    function update(dt: number) {
      t += dt
      const a = home[active]
      a.x = Math.max(W * 0.05, Math.min(W * 0.95, a.x + vx * SPEED * dt))
      a.y = Math.max(band + pr, Math.min(H - band - pr, a.y + vy * SPEED * dt))
    }

    function drawCourt() {
      ctx!.fillStyle = '#c98a4a'
      ctx!.fillRect(0, 0, W, H)
      ctx!.fillStyle = 'rgba(0,0,0,0.05)'
      for (let i = 0; i < W; i += 26) ctx!.fillRect(i, 0, 1, H)
      ctx!.fillStyle = '#1a1f33'
      ctx!.fillRect(0, 0, W, band)
      ctx!.fillRect(0, H - band, W, band)
      for (let i = 0; i < 60; i++) {
        ctx!.fillStyle = ['#3a4170', '#4a3a6a', '#5a4a3a', '#3a5a4a'][i % 4]
        const cx = (i * 41) % W
        ctx!.beginPath()
        ctx!.arc(cx + 6, i % 2 === 0 ? band * 0.5 : H - band * 0.5, 3.5, 0, Math.PI * 2)
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
      // lane + arc + hoop
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
      // hoop
      ctx!.fillStyle = '#eef1f6'
      ctx!.fillRect(rimX + pr * 1.4, rimY - H * 0.11, 6, H * 0.22)
      ctx!.strokeStyle = '#ff6a2a'
      ctx!.lineWidth = 4
      ctx!.beginPath()
      ctx!.ellipse(rimX, rimY, pr * 0.5, pr * 0.8, 0, 0, Math.PI * 2)
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
      // arrow above
      ctx!.fillStyle = '#ffcf4a'
      const ay = p.y - pr * 1.6 - Math.sin(t * 6) * 2
      ctx!.beginPath()
      ctx!.moveTo(p.x - pr * 0.32, ay)
      ctx!.lineTo(p.x + pr * 0.32, ay)
      ctx!.lineTo(p.x, ay + pr * 0.42)
      ctx!.closePath()
      ctx!.fill()
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
      ctx!.stroke()
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
      drawCourt()
      for (const p of away) drawPlayer(p, awayColor)
      home.forEach((p, i) => {
        if (i === active) drawActiveMarker(p)
        drawPlayer(p, homeColor)
      })
      const a = home[active]
      drawBall(a.x + pr * 0.8, a.y + pr * 0.1)
      drawJoystick()
    }

    let raf = 0
    let last = performance.now()
    function frame(time: number) {
      const dt = Math.min(0.034, (time - last) / 1000)
      last = time
      update(dt)
      render()
      raf = requestAnimationFrame(frame)
    }

    function local(e: PointerEvent) {
      const r = canvas!.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    function onDown(e: PointerEvent) {
      const p = local(e)
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
      const p = local(e)
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
          Drag on the <b>left</b> side to move your highlighted player
        </div>
      </div>
      <div className="court-canvas-wrap">
        <canvas ref={canvasRef} className="court-canvas" />
      </div>
    </div>
  )
}
