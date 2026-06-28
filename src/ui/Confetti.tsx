import { useEffect, useMemo, useState } from 'react'
import { useGameStore } from '../game/store'

const COLORS = ['#ffd54a', '#e8503a', '#3a7be8', '#56c06a', '#b86bff', '#ff9a3c']

/** Confetti burst on victory (Section 4 wave-win juice). */
export default function Confetti() {
  const banner = useGameStore((s) => s.banner)
  const [show, setShow] = useState(false)
  const [seed, setSeed] = useState(0)

  useEffect(() => {
    if (banner !== 'win') return
    setShow(true)
    setSeed((s) => s + 1)
    const t = window.setTimeout(() => setShow(false), 1700)
    return () => window.clearTimeout(t)
  }, [banner])

  const pieces = useMemo(
    () =>
      Array.from({ length: 44 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        color: COLORS[i % COLORS.length],
        delay: Math.random() * 0.25,
        dur: 1 + Math.random() * 0.7,
        drift: (Math.random() * 2 - 1) * 40,
        rot: Math.random() * 720,
      })),
    [seed],
  )

  if (!show) return null
  return (
    <div className="confetti-layer">
      {pieces.map((p) => (
        <div
          key={p.id}
          className="confetti-pc"
          style={{
            left: `${p.left}%`,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
            // @ts-expect-error custom props consumed by the keyframes
            '--drift': `${p.drift}px`,
            '--rot': `${p.rot}deg`,
          }}
        />
      ))}
    </div>
  )
}
