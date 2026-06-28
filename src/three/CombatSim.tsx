import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, Html } from '@react-three/drei'
import * as THREE from 'three'
import UnitMesh from './UnitMesh'
import { useGameStore } from '../game/store'
import { UNIT_DEFS } from '../game/units'
import { generateEnemyTeam, type EnemySeed } from '../game/enemies'
import type { ModifierId } from '../game/modifiers'
import { BOARD_Y, slotPos, enemySlotPos } from '../game/layout'
import type { UnitType, Level } from '../game/types'
import { sfx } from '../game/sfx'

const LEVEL_MULT = [1, 2.2, 5]
const HEAL_BASE = 26
const MAX_FIGHT_TIME = 24
const SLAM_RADIUS = 3.2
const SLAM_COOLDOWN = 3.4
const SPIKE_DMG = 14
const MELEE_RANGE = 1.5
const RANGED_RANGE = 3.0

type Team = 'player' | 'enemy' | 'neutral'

interface Profile {
  atk: number
  speed: number
  heal?: boolean
}
const PROFILE: Record<UnitType, Profile> = {
  brute: { atk: 1.2, speed: 1.6 },
  legionnaire: { atk: 0.95, speed: 2.1 },
  archer: { atk: 0.85, speed: 1.9 },
  spearman: { atk: 0.9, speed: 2.2 },
  priestess: { atk: 1.0, speed: 1.8, heal: true },
}

interface Combatant {
  id: string
  team: Team
  type: UnitType
  level: Level
  hp: number
  maxHp: number
  dmg: number
  range: number
  atkInterval: number
  speed: number
  heal: boolean
  healAmt: number
  isBoss: boolean
  isLion: boolean
  slamCd: number
  scaleMul: number
  pos: THREE.Vector3
  targetId: string | null
  cooldown: number
  alive: boolean
  deathT: number
  hitT: number
  group: THREE.Group | null
  hpFill: THREE.Mesh | null
}

let _cid = 0

function baseStats(src: { type: UnitType; level: Level; boss?: boolean }, wave: number) {
  if (src.boss) {
    const hp = Math.round(1700 * (1 + Math.max(0, wave - 5) * 0.12))
    return {
      maxHp: hp,
      dmg: Math.round(40 + wave * 2),
      range: 1.7,
      atkInterval: 1.3,
      speed: 1.2,
      heal: false,
      healAmt: 0,
      isBoss: true,
      slamCd: 3,
      scaleMul: 1.95,
    }
  }
  const def = UNIT_DEFS[src.type]
  const m = LEVEL_MULT[src.level - 1]
  const prof = PROFILE[src.type]
  return {
    maxHp: Math.round(def.hp * m),
    dmg: Math.round(def.dmg * m),
    range: def.range,
    atkInterval: prof.atk,
    speed: prof.speed,
    heal: !!prof.heal,
    healAmt: Math.round(HEAL_BASE * m),
    isBoss: false,
    slamCd: 0,
    scaleMul: 1,
  }
}

function makeCombatant(
  src: { type: UnitType; level: Level; boss?: boolean },
  team: Team,
  pos: [number, number, number],
  wave: number,
  modifier: ModifierId,
): Combatant {
  const s = baseStats(src, wave)
  let { maxHp, dmg } = s
  // Arena modifiers applied at creation
  if (modifier === 'bloodmoon') {
    maxHp = Math.round(maxHp * 0.75)
    dmg = Math.round(dmg * 1.25)
  }
  if (modifier === 'blessing' && s.range >= RANGED_RANGE) {
    dmg = Math.round(dmg * 1.3)
  }
  return {
    id: 'c' + ++_cid,
    team,
    type: src.type,
    level: src.level,
    maxHp,
    hp: maxHp,
    dmg,
    range: s.range,
    atkInterval: s.atkInterval,
    speed: s.speed,
    heal: s.heal,
    healAmt: s.healAmt,
    isBoss: s.isBoss,
    isLion: false,
    slamCd: s.slamCd,
    scaleMul: s.scaleMul,
    pos: new THREE.Vector3(pos[0], BOARD_Y, pos[2]),
    targetId: null,
    cooldown: Math.random() * 0.4,
    alive: true,
    deathT: -1,
    hitT: 0,
    group: null,
    hpFill: null,
  }
}

function makeLion(wave: number): Combatant {
  return {
    id: 'lion' + ++_cid,
    team: 'neutral',
    type: 'brute',
    level: 1,
    maxHp: 999999,
    hp: 999999,
    dmg: Math.round(24 + wave),
    range: 1.5,
    atkInterval: 0.9,
    speed: 2.7,
    heal: false,
    healAmt: 0,
    isBoss: false,
    isLion: true,
    slamCd: 0,
    scaleMul: 1.6,
    pos: new THREE.Vector3(0, BOARD_Y, 0),
    targetId: null,
    cooldown: 0.6,
    alive: true,
    deathT: -1,
    hitT: 0,
    group: null,
    hpFill: null,
  }
}

/** Who a combatant will attack. Player/enemy ignore the neutral Lion; the Lion
 *  attacks everyone; teams attack their opposite. */
function hostile(c: Combatant, o: Combatant): boolean {
  if (!o.alive) return false
  if (c.team === 'neutral') return o.team !== 'neutral'
  return o.team !== c.team && o.team !== 'neutral'
}

interface FloatNum {
  id: number
  pos: [number, number, number]
  text: string
  color: string
}
interface Shock {
  id: number
  pos: [number, number, number]
}

function Crown() {
  return (
    <group position={[0, 1.78, 0]}>
      {[-0.22, 0, 0.22].map((x, i) => (
        <mesh key={i} position={[x, i === 1 ? 0.06 : 0, 0]}>
          <coneGeometry args={[0.07, 0.22, 8]} />
          <meshStandardMaterial color="#ffd54a" emissive="#ffd54a" emissiveIntensity={0.5} />
        </mesh>
      ))}
    </group>
  )
}

function LionMesh() {
  const TAN = '#e0a64b'
  const MANE = '#a65f24'
  const DARK = '#6b4226'
  const legs: [number, number][] = [
    [-0.24, 0.4],
    [0.24, 0.4],
    [-0.24, -0.4],
    [0.24, -0.4],
  ]
  return (
    <group>
      <mesh position={[0, 0.46, 0]} castShadow>
        <boxGeometry args={[0.72, 0.5, 1.1]} />
        <meshStandardMaterial color={TAN} />
      </mesh>
      {legs.map(([x, z], i) => (
        <mesh key={i} position={[x, 0.18, z]} castShadow>
          <cylinderGeometry args={[0.1, 0.1, 0.36, 8]} />
          <meshStandardMaterial color={DARK} />
        </mesh>
      ))}
      {/* mane (behind), head, muzzle (front) */}
      <mesh position={[0, 0.64, 0.48]} castShadow>
        <sphereGeometry args={[0.43, 16, 16]} />
        <meshStandardMaterial color={MANE} />
      </mesh>
      <mesh position={[0, 0.64, 0.66]} castShadow>
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshStandardMaterial color={TAN} />
      </mesh>
      <mesh position={[0, 0.6, 0.86]} castShadow>
        <sphereGeometry args={[0.16, 12, 12]} />
        <meshStandardMaterial color="#f0c97a" />
      </mesh>
      <mesh position={[-0.16, 0.95, 0.5]}>
        <coneGeometry args={[0.08, 0.14, 8]} />
        <meshStandardMaterial color={MANE} />
      </mesh>
      <mesh position={[0.16, 0.95, 0.5]}>
        <coneGeometry args={[0.08, 0.14, 8]} />
        <meshStandardMaterial color={MANE} />
      </mesh>
      <mesh position={[0, 0.52, -0.64]} rotation={[0.6, 0, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 0.5, 6]} />
        <meshStandardMaterial color={TAN} />
      </mesh>
    </group>
  )
}

interface FlashMat {
  mat: THREE.MeshStandardMaterial
  baseE: THREE.Color
  baseI: number
}

function CombatUnit({ c }: { c: Combatant }) {
  const g = useRef<THREE.Group>(null)
  const fill = useRef<THREE.Mesh>(null)
  const mats = useRef<FlashMat[]>([])
  const white = useMemo(() => new THREE.Color('#ffffff'), [])

  useLayoutEffect(() => {
    c.group = g.current
    c.hpFill = fill.current
    const found: FlashMat[] = []
    g.current?.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined
      if (m && (m as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
        const sm = m as THREE.MeshStandardMaterial
        found.push({ mat: sm, baseE: sm.emissive.clone(), baseI: sm.emissiveIntensity })
      }
    })
    mats.current = found
  }, [c])

  // White flash on hit (Section 4): lerp emissive toward white by the hit timer.
  useFrame(() => {
    const f = c.hitT > 0 ? Math.min(c.hitT / 0.18, 1) : 0
    for (const e of mats.current) {
      e.mat.emissive.copy(e.baseE).lerp(white, f * 0.85)
      e.mat.emissiveIntensity = e.baseI + f * 0.9
    }
  })

  const barColor = c.team === 'player' ? '#4ad24a' : '#e8503a'
  const barW = c.isBoss ? 1.6 : 0.9
  return (
    <group
      ref={g}
      position={[c.pos.x, BOARD_Y, c.pos.z]}
      rotation={[0, c.team === 'player' ? Math.PI : 0, 0]}
    >
      <group scale={c.scaleMul}>
        {c.isLion ? (
          <LionMesh />
        ) : (
          <UnitMesh type={c.type} level={c.level} team={c.team as 'player' | 'enemy'} pop={false} />
        )}
        {c.isBoss && <Crown />}
      </group>
      {!c.isLion && (
        <Billboard position={[0, c.isBoss ? 3.7 : 2.05, 0]}>
          <mesh position={[0, 0, -0.002]}>
            <planeGeometry args={[barW + 0.04, 0.18]} />
            <meshBasicMaterial color="#2a1a0e" />
          </mesh>
          <mesh ref={fill}>
            <planeGeometry args={[barW, 0.12]} />
            <meshBasicMaterial color={barColor} />
          </mesh>
        </Billboard>
      )}
    </group>
  )
}

function ShockRing({ pos, onDone }: { pos: [number, number, number]; onDone: () => void }) {
  const m = useRef<THREE.Mesh>(null)
  const age = useRef(0)
  useFrame((_, dt) => {
    if (!m.current) return
    age.current += dt
    const k = age.current / 0.5
    if (k >= 1) {
      onDone()
      return
    }
    const s = 0.5 + k * 4
    m.current.scale.set(s, s, 1)
    ;(m.current.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - k)
  })
  return (
    <mesh ref={m} position={pos} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.6, 0.95, 36]} />
      <meshBasicMaterial color="#ff6a3c" transparent depthWrite={false} />
    </mesh>
  )
}

export default function CombatSim() {
  const modifierRef = useRef<ModifierId>('none')

  const combatants = useMemo(() => {
    const st = useGameStore.getState()
    const modifier = st.modifier
    modifierRef.current = modifier
    const list: Combatant[] = []
    st.board.forEach((u, i) => {
      if (u)
        list.push(
          makeCombatant(u, 'player', slotPos({ area: 'board', index: i }), st.wave, modifier),
        )
    })
    const enemies: EnemySeed[] = generateEnemyTeam(st.wave)
    const addOrder = [1, 3, 5, 7, 0, 2, 6, 8]
    let ai = 0
    enemies.forEach((e) => {
      const pos = e.boss
        ? enemySlotPos(4)
        : enemySlotPos(addOrder[ai++ % addOrder.length])
      list.push(makeCombatant(e, 'enemy', pos, st.wave, modifier))
    })
    if (modifier === 'lion') list.push(makeLion(st.wave))
    return list
  }, [])

  const byId = useMemo(() => {
    const m = new Map<string, Combatant>()
    combatants.forEach((c) => m.set(c.id, c))
    return m
  }, [combatants])

  const [dmgs, setDmgs] = useState<FloatNum[]>([])
  const [shocks, setShocks] = useState<Shock[]>([])
  const idRef = useRef(0)

  const spawnDmg = useCallback(
    (pos: [number, number, number], text: string, color: string) => {
      const id = ++idRef.current
      setDmgs((d) => [...d, { id, pos, text, color }])
      window.setTimeout(() => setDmgs((d) => d.filter((x) => x.id !== id)), 750)
    },
    [],
  )
  const spawnShock = useCallback((p: THREE.Vector3) => {
    const id = ++idRef.current
    setShocks((s) => [...s, { id, pos: [p.x, BOARD_Y + 0.05, p.z] }])
    window.setTimeout(() => setShocks((s) => s.filter((x) => x.id !== id)), 550)
  }, [])

  const timer = useRef(0)
  const spikeAccum = useRef(0)
  const resolved = useRef(false)
  const tmp = useMemo(() => new THREE.Vector3(), [])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    timer.current += dt
    const modifier = modifierRef.current

    // Spiked Floor: melee units bleed HP once per second
    if (modifier === 'spikes') {
      spikeAccum.current += dt
      if (spikeAccum.current >= 1) {
        spikeAccum.current -= 1
        for (const c of combatants) {
          if (c.alive && !c.isLion && c.range <= MELEE_RANGE) {
            c.hp -= SPIKE_DMG
            c.hitT = Math.max(c.hitT, 0.1)
            spawnDmg([c.pos.x, BOARD_Y + 2.0, c.pos.z], String(SPIKE_DMG), '#d98a3a')
          }
        }
      }
    }

    for (const c of combatants) {
      if (!c.alive) continue
      c.cooldown -= dt
      if (c.hitT > 0) c.hitT -= dt

      // Boss ground-slam: AoE around the boss
      if (c.isBoss) {
        c.slamCd -= dt
        if (c.slamCd <= 0) {
          let hitAny = false
          for (const o of combatants) {
            if (o.alive && hostile(c, o) && c.pos.distanceTo(o.pos) <= SLAM_RADIUS) {
              const sd = Math.round(c.dmg * 1.6)
              o.hp -= sd
              o.hitT = 0.22
              tmp.subVectors(o.pos, c.pos).setY(0)
              if (tmp.lengthSq() > 1e-6) {
                tmp.normalize()
                o.pos.addScaledVector(tmp, 0.5)
              }
              spawnDmg([o.pos.x, BOARD_Y + 2.2, o.pos.z], String(sd), '#ff2d2d')
              hitAny = true
            }
          }
          if (hitAny) {
            sfx.hit()
            spawnShock(c.pos)
            useGameStore.setState({ kickAt: performance.now(), kickPower: 0.42 })
          }
          c.slamCd = SLAM_COOLDOWN
        }
      }

      if (c.heal) {
        let best: Combatant | null = null
        let bestRatio = 1
        for (const a of combatants) {
          if (a.alive && a.team === c.team && a.id !== c.id && a.hp < a.maxHp) {
            const r = a.hp / a.maxHp
            if (r < bestRatio) {
              bestRatio = r
              best = a
            }
          }
        }
        if (best && c.cooldown <= 0) {
          best.hp = Math.min(best.maxHp, best.hp + c.healAmt)
          spawnDmg([best.pos.x, BOARD_Y + 2.2, best.pos.z], '+' + c.healAmt, '#7af07a')
          sfx.heal()
          c.cooldown = c.atkInterval
        }
        continue
      }

      // Targeting
      let target = c.targetId ? byId.get(c.targetId) : undefined
      if (!target || !target.alive || !hostile(c, target)) {
        let nearest: Combatant | null = null
        let nd = Infinity
        for (const o of combatants) {
          if (hostile(c, o)) {
            const d = c.pos.distanceToSquared(o.pos)
            if (d < nd) {
              nd = d
              nearest = o
            }
          }
        }
        c.targetId = nearest ? nearest.id : null
        target = nearest ?? undefined
      }
      if (!target) continue

      const dist = c.pos.distanceTo(target.pos)
      const reach = c.range + 0.6
      if (dist <= reach) {
        if (c.cooldown <= 0) {
          let dmg = c.dmg
          if (c.type === 'spearman' && target.maxHp >= 250) dmg = Math.round(dmg * 1.6)
          target.hp -= dmg
          target.hitT = 0.18
          tmp.subVectors(target.pos, c.pos).setY(0)
          if (tmp.lengthSq() > 1e-6) {
            tmp.normalize()
            target.pos.addScaledVector(tmp, target.isBoss || target.isLion ? 0.03 : 0.16)
          }
          spawnDmg([target.pos.x, BOARD_Y + 2.2, target.pos.z], String(dmg), '#ff5a48')
          sfx.hit()
          if (dmg >= 60) {
            useGameStore.setState({ kickAt: performance.now(), kickPower: 0.16 })
          }
          c.cooldown = c.atkInterval
        }
      } else {
        tmp.subVectors(target.pos, c.pos).setY(0)
        const d = tmp.length()
        if (d > 1e-4) {
          tmp.multiplyScalar(1 / d)
          c.pos.addScaledVector(tmp, c.speed * dt)
        }
      }
    }

    for (const c of combatants) {
      if (c.alive && c.hp <= 0) {
        c.alive = false
        c.deathT = 0
        sfx.die()
      }
    }

    for (const c of combatants) {
      if (!c.group) continue
      if (c.alive) {
        c.group.position.set(c.pos.x, BOARD_Y, c.pos.z)
        const t = c.targetId ? byId.get(c.targetId) : undefined
        if (t) c.group.rotation.y = Math.atan2(t.pos.x - c.pos.x, t.pos.z - c.pos.z)
        const squash = c.hitT > 0 ? 1 + (c.hitT / 0.18) * 0.16 : 1
        c.group.scale.setScalar(squash)
      } else if (c.deathT >= 0) {
        c.deathT += dt
        const k = Math.min(c.deathT / 0.45, 1)
        c.group.scale.setScalar(Math.max(0, 1 - k))
        c.group.position.y = BOARD_Y - k * 0.3
      }
      if (c.hpFill) {
        const r = Math.max(0, c.hp / c.maxHp)
        c.hpFill.scale.x = r
        c.hpFill.position.x = -((c.isBoss ? 1.6 : 0.9) / 2) * (1 - r)
      }
    }

    if (resolved.current) return
    const pAlive = combatants.some((c) => c.alive && c.team === 'player')
    const eAlive = combatants.some((c) => c.alive && c.team === 'enemy')
    if (!pAlive || !eAlive || timer.current >= MAX_FIGHT_TIME) {
      resolved.current = true
      let result: 'win' | 'lose'
      if (!eAlive && pAlive) result = 'win'
      else if (!pAlive && eAlive) result = 'lose'
      else {
        const frac = (team: 'player' | 'enemy') =>
          combatants
            .filter((c) => c.team === team)
            .reduce((s, c) => s + Math.max(0, c.hp) / c.maxHp, 0)
        result = frac('player') > frac('enemy') ? 'win' : 'lose'
      }
      window.setTimeout(() => useGameStore.getState().finishFight(result), 650)
    }
  })

  return (
    <group>
      {combatants.map((c) => (
        <CombatUnit key={c.id} c={c} />
      ))}
      {shocks.map((s) => (
        <ShockRing
          key={s.id}
          pos={s.pos}
          onDone={() => setShocks((x) => x.filter((y) => y.id !== s.id))}
        />
      ))}
      {dmgs.map((d) => (
        <Html key={d.id} position={d.pos} center style={{ pointerEvents: 'none' }}>
          <div className="dmg-pop" style={{ color: d.color }}>
            {d.text}
          </div>
        </Html>
      ))}
    </group>
  )
}
