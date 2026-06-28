import { useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import Arena from './three/Arena'
import Board from './three/Board'
import CombatSim from './three/CombatSim'
import Shop from './ui/Shop'
import { useGameStore } from './game/store'

/**
 * Phase 4 shell: prep phase shows the board + recruit shop + FIGHT button.
 * Pressing FIGHT swaps the board for the auto-battle simulation; on resolution
 * a VICTORY/DEFEAT banner shows and play returns to prep.
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

function FightDock() {
  const startFight = useGameStore((s) => s.startFight)
  return (
    <div className="fight-dock">
      <button className="candy-btn" type="button" onClick={startFight}>
        ⚔ FIGHT
      </button>
    </div>
  )
}

function BannerOverlay() {
  const banner = useGameStore((s) => s.banner)
  const clearBanner = useGameStore((s) => s.clearBanner)
  useEffect(() => {
    if (!banner) return
    const t = window.setTimeout(clearBanner, 1800)
    return () => window.clearTimeout(t)
  }, [banner, clearBanner])

  if (!banner) return null
  return (
    <div className="banner-overlay">
      <div className={`banner ${banner}`}>
        {banner === 'win' ? 'VICTORY' : 'DEFEAT'}
      </div>
    </div>
  )
}

function BattleStrip() {
  return <div className="battle-strip">⚔ BATTLE IN PROGRESS</div>
}

export default function App() {
  const phase = useGameStore((s) => s.phase)
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
          {phase === 'prep' ? <Board /> : <CombatSim />}
        </Canvas>

        {phase === 'prep' && <FightDock />}
        <BannerOverlay />
      </div>

      {phase === 'prep' ? <Shop /> : <BattleStrip />}
    </div>
  )
}
