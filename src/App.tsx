import { Canvas } from '@react-three/fiber'
import Arena from './three/Arena'

/**
 * Phase 1 shell: top HUD, the 3D colosseum in the middle, and a placeholder
 * shop bar at the bottom. Real game state (Zustand), units, and shop come in
 * later phases — this establishes the mobile portrait layout and the arena.
 */

function TopHud() {
  return (
    <div className="hud-top">
      <div className="hud-pill lives">
        <span className="icon">❤️</span>
        <span>3</span>
      </div>
      <div className="wave-badge">
        <span className="label">WAVE</span>
        <span className="num">1</span>
      </div>
      <div className="hud-pill coins">
        <span className="icon">🪙</span>
        <span>10</span>
      </div>
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
        </Canvas>

        <div className="fight-dock">
          <button className="candy-btn" type="button">
            FIGHT
          </button>
        </div>
      </div>

      <ShopBarPlaceholder />
    </div>
  )
}
