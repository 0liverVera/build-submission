import { Canvas } from '@react-three/fiber'
import Arena from './three/Arena'
import Board from './three/Board'
import { useGameStore } from './game/store'

/**
 * Phase 2 shell: top HUD, the 3D colosseum + interactive board (grid, bench,
 * drag & merge), and a placeholder shop bar. A temporary "add unit" control is
 * present for testing merges until the real shop arrives in Phase 3.
 */

function TopHud() {
  const lives = useGameStore((s) => s.lives)
  const coins = useGameStore((s) => s.coins)
  const wave = useGameStore((s) => s.wave)
  return (
    <div className="hud-top">
      <div className="hud-pill lives">
        <span className="icon">❤️</span>
        <span>{lives}</span>
      </div>
      <div className="wave-badge">
        <span className="label">WAVE</span>
        <span className="num">{wave}</span>
      </div>
      <div className="hud-pill coins">
        <span className="icon">🪙</span>
        <span>{coins}</span>
      </div>
    </div>
  )
}

function DevBar() {
  const addRandomUnit = useGameStore((s) => s.addRandomUnit)
  return (
    <div className="dev-bar">
      <span className="dev-hint">drag two matching units together to merge</span>
      <button className="dev-btn" type="button" onClick={addRandomUnit}>
        + ADD UNIT (temp)
      </button>
    </div>
  )
}

function ShopBarPlaceholder() {
  return (
    <div className="shop-bar">
      <div className="shop-row">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="shop-slot">
            ?
          </div>
        ))}
      </div>
    </div>
  )
}

export default function App() {
  return (
    <div className="game-stage">
      <TopHud />

      <div className="arena-viewport">
        <Canvas
          shadows
          dpr={[1, 2]}
          camera={{ position: [0, 13, 13.5], fov: 42, near: 0.1, far: 100 }}
          gl={{ antialias: true }}
        >
          <color attach="background" args={['#caa06a']} />
          <Arena />
          <Board />
        </Canvas>

        <DevBar />
      </div>

      <ShopBarPlaceholder />
    </div>
  )
}
