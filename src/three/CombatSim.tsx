import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, Html } from '@react-three/drei'
import * as THREE from 'three'
import UnitMesh from './UnitMesh'
import { useGameStore } from '../game/store'
import { UNIT_DEFS, UNIT_TYPES } from '../game/units'
import { BOARD_Y, slotPos, enemySlotPos } from '../game/layout'
import type { UnitType, Level } from '../game/types'
import { sfx } from '../game/sfx'

const LEVEL_MULT = [1, 2.2, 5]
const HEAL_BASE = 26
const MAX_FIGHT_TIME = 22

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
  team: 'player' | 'enemy'
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

function makeCombatant(
  src: { type: UnitType; level: Level },
  team: 'player' | 'enemy',
  pos: [number, number, number],
): Combatant {
  const def = UNIT_DEFS[src.type]
  const m = LEVEL_MULT[src.level - 1]
  const prof = PROFILE[src.type]
  return {
    id: 'c' + ++_cid,
    team,
    type: src.type,
    level: src.level,
    maxHp: Math.round(def.hp * m),
    hp: Math.round(def.hp * m),
    dmg: Math.round(def.dmg * m),
    range: def.range,
    atkInterval: prof.atk,
    speed: prof.speed,
    heal: !!prof.heal,
    healAmt: Math.round(HEAL_BASE * m),
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

/** Simple escalating enemy team — bosses & finer tuning arrive in Phase 5/10. */
function generateEnemyTeam(wave: number): { type: UnitType; level: Level }[] {
  const count = Math.min(2 + Math.ceil(wave * 0.8), 9)
  const out: { type: UnitType; level: Level }[] = []
  for (let i = 0; i < count; i++) {
    const type = UNIT_TYPES[Math.floor(Math.random() * UNIT_TYPES.length)]
    const level: Level = wave >= 3 && Math.random() < 0.3 ? 2 : 1
    out.push({ type, level })
  }
  return out
}

interface DmgNumber {
  id: number
  pos: [number, number, number]
  text: string
  color: string
}

function CombatUnit({ c }: { c: Combatant }) {
  const g = useRef<THREE.Group>(null)
  const fill = useRef<THREE.Mesh>(null)
  useLayoutEffect(() => {
    c.group = g.current
    c.hpFill = fill.current
  }, [c])
  const barColor = c.team === 'player' ? '#4ad24a' : '#e8503a'
  return (
    <group
      ref={g}
      position={[c.pos.x, BOARD_Y, c.pos.z]}
      rotation={[0, c.team === 'player' ? Math.PI : 0, 0]}
    >
      <UnitMesh type={c.type} level={c.level} team={c.team} pop={false} />
      <Billboard position={[0, 2.05, 0]}>
        <mesh position={[0, 0, -0.002]}>
          <planeGeometry args={[0.94, 0.18]} />
          <meshBasicMaterial color="#2a1a0e" />
        </mesh>
        <mesh ref={fill} position={[0, 0, 0]}>
          <planeGeometry args={[0.9, 0.12]} />
          <meshBasicMaterial color={barColor} />
        </mesh>
      </Billboard>
    </group>
  )
}

export default function CombatSim() {
  // Snapshot the board + roll the enemy team once, when the fight begins.
  const start = useMemo(() => {
    const st = useGameStore.getState()
    const list: Combatant[] = []
    st.board.forEach((u, i) => {
      if (u) list.push(makeCombatant(u, 'player', slotPos({ area: 'board', index: i })))
    })
    generateEnemyTeam(st.wave).forEach((e, i) => {
      list.push(makeCombatant(e, 'enemy', enemySlotPos(i)))
    })
    return list
  }, [])

  const combatants = start
  const byId = useMemo(() => {
    const m = new Map<string, Combatant>()
    combatants.forEach((c) => m.set(c.id, c))
    return m
  }, [combatants])

  const [dmgs, setDmgs] = useState<DmgNumber[]>([])
  const dmgId = useRef(0)
  const spawnDmg = useCallback(
    (pos: [number, number, number], text: string, color: string) => {
      const id = ++dmgId.current
      setDmgs((d) => [...d, { id, pos, text, color }])
      window.setTimeout(
        () => setDmgs((d) => d.filter((x) => x.id !== id)),
        750,
      )
    },
    [],
  )

  const timer = useRef(0)
  const resolved = useRef(false)
  const tmp = useMemo(() => new THREE.Vector3(), [])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    timer.current += dt

    for (const c of combatants) {
      if (!c.alive) continue
      c.cooldown -= dt
      if (c.hitT > 0) c.hitT -= dt

      if (c.heal) {
        // Support: heal the most-wounded ally (any range), no movement
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

      // Acquire / validate target = nearest living enemy
      let target = c.targetId ? byId.get(c.targetId) : undefined
      if (!target || !target.alive) {
        let nearest: Combatant | null = null
        let nd = Infinity
        for (const o of combatants) {
          if (o.alive && o.team !== c.team) {
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
          // knockback
          tmp.subVectors(target.pos, c.pos).setY(0)
          if (tmp.lengthSq() > 1e-6) {
            tmp.normalize()
            target.pos.addScaledVector(tmp, 0.16)
          }
          spawnDmg(
            [target.pos.x, BOARD_Y + 2.2, target.pos.z],
            String(dmg),
            '#ff5a48',
          )
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

    // Resolve deaths
    for (const c of combatants) {
      if (c.alive && c.hp <= 0) {
        c.alive = false
        c.deathT = 0
        sfx.die()
      }
    }

    // Visual update
    for (const c of combatants) {
      if (!c.group) continue
      if (c.alive) {
        c.group.position.set(c.pos.x, BOARD_Y, c.pos.z)
        const t = c.targetId ? byId.get(c.targetId) : undefined
        if (t) {
          c.group.rotation.y = Math.atan2(t.pos.x - c.pos.x, t.pos.z - c.pos.z)
        }
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
        c.hpFill.position.x = -0.45 * (1 - r)
      }
    }

    // Win / lose detection
    if (resolved.current) return
    const pAlive = combatants.some((c) => c.alive && c.team === 'player')
    const eAlive = combatants.some((c) => c.alive && c.team === 'enemy')
    const timedOut = timer.current >= MAX_FIGHT_TIME
    if (!pAlive || !eAlive || timedOut) {
      resolved.current = true
      let result: 'win' | 'lose'
      if (!eAlive && pAlive) result = 'win'
      else if (!pAlive && eAlive) result = 'lose'
      else {
        // timeout / mutual wipe → decide by remaining HP fraction (ties favor enemy)
        const frac = (team: 'player' | 'enemy') =>
          combatants
            .filter((c) => c.team === team)
            .reduce((s, c) => s + Math.max(0, c.hp) / c.maxHp, 0)
        result = frac('player') > frac('enemy') ? 'win' : 'lose'
      }
      // brief delay so death animations land before the banner
      window.setTimeout(() => useGameStore.getState().finishFight(result), 650)
    }
  })

  return (
    <group>
      {combatants.map((c) => (
        <CombatUnit key={c.id} c={c} />
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
