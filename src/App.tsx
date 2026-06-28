import { Canvas } from '@react-three/fiber'
import Arena from './three/Arena'
import Board from './three/Board'
import Shop from './ui/Shop'
import { useGameStore } from './game/store'

/**
 * Phase 3 shell: top HUD, the 3D colosseum + interactive board (grid, bench,
 * drag & merge), and the recruit shop. A temporary "next wave" control grants
 * income so the economy can be tested until real fights/waves land (Phase 4–5).
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
  const grantIncome = useGameStore((s) => s.grantIncome)
  return (
    <div className="dev-bar">
      <span className="dev-hint">buy units below • drag matching units to merge</span>
      <button className="dev-btn" type="button" onClick={grantIncome}>
        ▶ NEXT WAVE — collect income (temp)
      </button>
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

      <Shop />
    </div>
  )
}
