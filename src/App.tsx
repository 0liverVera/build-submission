import { useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import Arena from './three/Arena'
import Board from './three/Board'
import CombatSim from './three/CombatSim'
import Shop from './ui/Shop'
import { useGameStore } from './game/store'
import { isBossWave } from './game/enemies'

/**
 * Phase 5 shell: prep → fight → (win advances wave / lose costs a life) → on 0
 * lives, a game-over results screen with restart. Best wave persists locally.
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
  const wave = useGameStore((s) => s.wave)
  const boss = isBossWave(wave)
  return (
    <div className="fight-dock">
      {boss && <div className="boss-badge">⚠ BOSS WAVE</div>}
      <button
        className={`candy-btn${boss ? ' boss' : ''}`}
        type="button"
        onClick={startFight}
      >
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

function GameOverOverlay() {
  const wave = useGameStore((s) => s.wave)
  const bestWave = useGameStore((s) => s.bestWave)
  const restart = useGameStore((s) => s.restart)
  const isNewBest = wave >= bestWave && wave > 1
  return (
    <div className="gameover-overlay">
      <div className="gameover-card">
        <div className="go-title">DEFEATED</div>
        <div className="go-row">
          <span>You reached</span>
          <b>Wave {wave}</b>
        </div>
        <div className="go-row best">
          <span>{isNewBest ? '🏆 New Best!' : 'Best'}</span>
          <b>Wave {bestWave}</b>
        </div>
        <button className="candy-btn" type="button" onClick={restart}>
          ↺ PLAY AGAIN
        </button>
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
          {phase === 'prep' && <Board />}
          {phase === 'fight' && <CombatSim />}
        </Canvas>

        {phase === 'prep' && <FightDock />}
        <BannerOverlay />
        {phase === 'gameover' && <GameOverOverlay />}
      </div>

      {phase === 'prep' && <Shop />}
      {phase === 'fight' && <BattleStrip />}
    </div>
  )
}
