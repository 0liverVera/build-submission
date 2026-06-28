import { useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { motion, useAnimationControls } from 'framer-motion'
import Arena from './three/Arena'
import Board from './three/Board'
import CombatSim from './three/CombatSim'
import Shop from './ui/Shop'
import TapButton from './ui/TapButton'
import CoinFly from './ui/CoinFly'
import Confetti from './ui/Confetti'
import { useGameStore } from './game/store'
import { isBossWave } from './game/enemies'
import { MODIFIERS } from './game/modifiers'

/** Smoothly counts a displayed number toward a target value. */
function useCountUp(value: number, dur = 0.5) {
  const [disp, setDisp] = useState(value)
  const fromRef = useRef(value)
  useEffect(() => {
    const from = fromRef.current
    if (from === value) return
    let raf = 0
    const t0 = performance.now()
    const step = (t: number) => {
      const k = Math.min((t - t0) / (dur * 1000), 1)
      const eased = 1 - Math.pow(1 - k, 3)
      setDisp(Math.round(from + (value - from) * eased))
      if (k < 1) raf = requestAnimationFrame(step)
      else fromRef.current = value
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value, dur])
  return disp
}

/**
 * Phase 5 shell: prep → fight → (win advances wave / lose costs a life) → on 0
 * lives, a game-over results screen with restart. Best wave persists locally.
 */

function TopHud() {
  const lives = useGameStore((s) => s.lives)
  const coins = useGameStore((s) => s.coins)
  const wave = useGameStore((s) => s.wave)
  const shownCoins = useCountUp(coins)
  const controls = useAnimationControls()
  const prevCoins = useRef(coins)

  useEffect(() => {
    if (coins !== prevCoins.current) {
      controls.start({ scale: [1, 1.18, 1], transition: { duration: 0.35 } })
      prevCoins.current = coins
    }
  }, [coins, controls])

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
      <motion.div className="hud-pill coins" animate={controls}>
        <span className="icon">🪙</span>
        <span>{shownCoins}</span>
      </motion.div>
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
      <TapButton
        className={`candy-btn${boss ? ' boss' : ''}`}
        type="button"
        onClick={startFight}
      >
        ⚔ FIGHT
      </TapButton>
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
        <div className="go-emblem">💀</div>
        <div className="go-title">DEFEATED</div>
        <div className="go-row">
          <span>You reached</span>
          <b>Wave {wave}</b>
        </div>
        <div className="go-row best">
          <span>{isNewBest ? '🏆 New Best!' : 'Best'}</span>
          <b>Wave {bestWave}</b>
        </div>
        <TapButton className="candy-btn" type="button" onClick={restart}>
          ↺ PLAY AGAIN
        </TapButton>
      </div>
    </div>
  )
}

function BattleStrip() {
  return <div className="battle-strip">⚔ BATTLE IN PROGRESS</div>
}

function ModifierChip() {
  const modId = useGameStore((s) => s.modifier)
  const m = MODIFIERS[modId]
  return (
    <div className="modifier-chip" style={{ borderColor: m.color }}>
      <span className="mc-icon">{m.icon}</span>
      <div className="mc-text">
        <div className="mc-name" style={{ color: m.color }}>
          {m.name}
        </div>
        <div className="mc-desc">{m.desc}</div>
      </div>
    </div>
  )
}

function ModifierAnnounce() {
  const id = useGameStore((s) => s.modifierAnnounce)
  const clear = useGameStore((s) => s.clearModifierAnnounce)
  useEffect(() => {
    if (!id) return
    const t = window.setTimeout(clear, 1900)
    return () => window.clearTimeout(t)
  }, [id, clear])
  if (!id) return null
  const m = MODIFIERS[id]
  return (
    <div className="banner-overlay">
      <div
        className="mod-announce"
        style={{ background: `linear-gradient(180deg, ${m.color} 0%, #2a1a0e 160%)` }}
      >
        <div className="ma-icon">{m.icon}</div>
        <div className="ma-name">{m.name}</div>
        <div className="ma-desc">{m.desc}</div>
      </div>
    </div>
  )
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

        <div className="arena-vignette" />
        {phase === 'prep' && <ModifierChip />}
        {phase === 'prep' && <FightDock />}
        <BannerOverlay />
        <ModifierAnnounce />
        {phase === 'gameover' && <GameOverOverlay />}
      </div>

      {phase === 'prep' && <Shop />}
      {phase === 'fight' && <BattleStrip />}

      <CoinFly />
      <Confetti />
    </div>
  )
}
