import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useGameStore } from '../game/store'
import { sfx } from '../game/sfx'

interface FlyCoin {
  id: number
  sx: number
  sy: number
  ex: number
  ey: number
  delay: number
}

/**
 * When coins are gained, a spray of coins arcs from the arena toward the coin
 * counter (Section 4). Anchors to the live position of the `.hud-pill.coins`.
 */
export default function CoinFly() {
  const coins = useGameStore((s) => s.coins)
  const prev = useRef(coins)
  const idRef = useRef(0)
  const [flies, setFlies] = useState<FlyCoin[]>([])

  useEffect(() => {
    const delta = coins - prev.current
    prev.current = coins
    if (delta <= 0) return

    const stage = document.querySelector('.game-stage') as HTMLElement | null
    if (!stage) return
    const sr = stage.getBoundingClientRect()
    const pill = document.querySelector('.hud-pill.coins') as HTMLElement | null
    const pr = pill?.getBoundingClientRect()
    const ex = pr ? pr.left - sr.left + pr.width / 2 : sr.width - 44
    const ey = pr ? pr.top - sr.top + pr.height / 2 : 34
    const cx = sr.width / 2
    const cy = sr.height * 0.5

    const n = Math.min(delta, 10)
    const batch: FlyCoin[] = []
    for (let i = 0; i < n; i++) {
      batch.push({
        id: ++idRef.current,
        sx: cx + (Math.random() * 70 - 35),
        sy: cy + (Math.random() * 36 - 18),
        ex,
        ey,
        delay: i * 0.05,
      })
    }
    setFlies((f) => [...f, ...batch])
    sfx.coin()
    const ids = new Set(batch.map((b) => b.id))
    window.setTimeout(
      () => setFlies((f) => f.filter((x) => !ids.has(x.id))),
      1000 + n * 50,
    )
  }, [coins])

  return (
    <div className="coinfly-layer">
      {flies.map((c) => (
        <motion.div
          key={c.id}
          className="fly-coin"
          initial={{ x: c.sx, y: c.sy, opacity: 0, scale: 0.4 }}
          animate={{
            x: c.ex,
            y: [c.sy, Math.min(c.sy, c.ey) - 60, c.ey],
            opacity: [0, 1, 1, 0],
            scale: [0.4, 1, 1, 0.6],
          }}
          transition={{ duration: 0.62, delay: c.delay, ease: 'easeIn' }}
        >
          🪙
        </motion.div>
      ))}
    </div>
  )
}
