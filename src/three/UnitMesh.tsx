import { useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { UnitType, Level } from '../game/types'

const SKIN = '#e8b88f'
const GOLD = '#ffd54a'
const LEVEL_SCALE = [1, 1.18, 1.42]

function easeOutBack(t: number) {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

/** Distinct primitive silhouette per unit type — readable at a glance. */
function Body({ type }: { type: UnitType }): ReactNode {
  switch (type) {
    case 'brute':
      return (
        <group>
          <mesh position={[0, 0.5, 0]} castShadow>
            <boxGeometry args={[0.9, 0.7, 0.62]} />
            <meshStandardMaterial color="#8a98a8" roughness={0.6} metalness={0.3} />
          </mesh>
          <mesh position={[0, 0.36, 0]} castShadow>
            <boxGeometry args={[0.96, 0.22, 0.66]} />
            <meshStandardMaterial color="#5c6773" />
          </mesh>
          <mesh position={[-0.5, 0.74, 0]} castShadow>
            <sphereGeometry args={[0.23, 16, 16]} />
            <meshStandardMaterial color="#6b7785" metalness={0.3} />
          </mesh>
          <mesh position={[0.5, 0.74, 0]} castShadow>
            <sphereGeometry args={[0.23, 16, 16]} />
            <meshStandardMaterial color="#6b7785" metalness={0.3} />
          </mesh>
          <mesh position={[0, 1.02, 0]} castShadow>
            <boxGeometry args={[0.4, 0.36, 0.4]} />
            <meshStandardMaterial color={SKIN} />
          </mesh>
        </group>
      )
    case 'legionnaire':
      return (
        <group>
          <mesh position={[0, 0.55, -0.3]} castShadow>
            <boxGeometry args={[0.5, 0.62, 0.06]} />
            <meshStandardMaterial color="#c0392b" />
          </mesh>
          <mesh position={[0, 0.55, 0]} castShadow>
            <cylinderGeometry args={[0.3, 0.34, 0.72, 16]} />
            <meshStandardMaterial color="#c8893f" metalness={0.3} roughness={0.5} />
          </mesh>
          <mesh position={[0.42, 0.55, 0]} castShadow>
            <boxGeometry args={[0.12, 0.52, 0.42]} />
            <meshStandardMaterial color="#9c5a2a" />
          </mesh>
          <mesh position={[0, 1.0, 0]} castShadow>
            <sphereGeometry args={[0.22, 16, 16]} />
            <meshStandardMaterial color={SKIN} />
          </mesh>
          <mesh position={[0, 1.2, 0]} castShadow>
            <boxGeometry args={[0.46, 0.16, 0.34]} />
            <meshStandardMaterial color="#b0703a" metalness={0.4} />
          </mesh>
          <mesh position={[0, 1.36, 0]} castShadow>
            <boxGeometry args={[0.08, 0.22, 0.4]} />
            <meshStandardMaterial color="#c0392b" />
          </mesh>
        </group>
      )
    case 'archer':
      return (
        <group>
          <mesh position={[0, 0.5, 0]} castShadow>
            <cylinderGeometry args={[0.22, 0.3, 0.72, 14]} />
            <meshStandardMaterial color="#5fa860" />
          </mesh>
          <mesh position={[0, 0.94, 0]} castShadow>
            <sphereGeometry args={[0.2, 16, 16]} />
            <meshStandardMaterial color={SKIN} />
          </mesh>
          <mesh position={[0, 1.24, 0]} castShadow>
            <coneGeometry args={[0.28, 0.42, 16]} />
            <meshStandardMaterial color="#3d7a45" />
          </mesh>
          <mesh position={[-0.36, 0.62, 0]} castShadow>
            <torusGeometry args={[0.3, 0.04, 8, 20]} />
            <meshStandardMaterial color="#6b4226" />
          </mesh>
        </group>
      )
    case 'spearman':
      return (
        <group>
          <mesh position={[0, 0.55, 0]} castShadow>
            <cylinderGeometry args={[0.26, 0.32, 0.74, 14]} />
            <meshStandardMaterial color="#3fb6a8" />
          </mesh>
          <mesh position={[0, 1.0, 0]} castShadow>
            <sphereGeometry args={[0.2, 16, 16]} />
            <meshStandardMaterial color={SKIN} />
          </mesh>
          <mesh position={[0.42, 0.9, 0.05]} castShadow>
            <cylinderGeometry args={[0.035, 0.035, 1.7, 8]} />
            <meshStandardMaterial color="#7a5a3a" />
          </mesh>
          <mesh position={[0.42, 1.82, 0.05]} castShadow>
            <coneGeometry args={[0.09, 0.24, 12]} />
            <meshStandardMaterial color="#cfd6dd" metalness={0.5} roughness={0.3} />
          </mesh>
        </group>
      )
    case 'priestess':
      return (
        <group>
          <mesh position={[0, 0.42, 0]} castShadow>
            <coneGeometry args={[0.36, 0.86, 18]} />
            <meshStandardMaterial color="#f1e3c0" />
          </mesh>
          <mesh position={[0, 0.94, 0]} castShadow>
            <sphereGeometry args={[0.2, 16, 16]} />
            <meshStandardMaterial color={SKIN} />
          </mesh>
          <mesh position={[0, 1.16, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.24, 0.03, 8, 24]} />
            <meshStandardMaterial color={GOLD} emissive={GOLD} emissiveIntensity={0.6} />
          </mesh>
          <mesh position={[0, 1.42, 0]}>
            <sphereGeometry args={[0.13, 16, 16]} />
            <meshStandardMaterial color="#fff2c2" emissive={GOLD} emissiveIntensity={0.9} />
          </mesh>
        </group>
      )
  }
}

function Pips({ n }: { n: number }) {
  const spacing = 0.2
  const start = -((n - 1) * spacing) / 2
  return (
    <group>
      {Array.from({ length: n }, (_, i) => (
        <mesh key={i} position={[start + i * spacing, 1.92, 0]} castShadow>
          <coneGeometry args={[0.07, 0.16, 8]} />
          <meshStandardMaterial color={GOLD} emissive={GOLD} emissiveIntensity={0.5} />
        </mesh>
      ))}
    </group>
  )
}

interface UnitMeshProps {
  type: UnitType
  level: Level
  team?: 'player' | 'enemy'
  /** Plays the slam-in pop on mount (off for the unit being dragged). */
  pop?: boolean
}

export default function UnitMesh({
  type,
  level,
  team = 'player',
  pop = true,
}: UnitMeshProps) {
  const g = useRef<THREE.Group>(null)
  const age = useRef(0)
  const done = useRef(!pop)
  const phase = useRef(Math.random() * Math.PI * 2)
  const clock = useRef(0)

  useFrame((_, dt) => {
    if (!g.current) return
    // Slam-in pop on mount
    if (!done.current) {
      age.current += dt
      const t = Math.min(age.current / 0.32, 1)
      g.current.scale.setScalar(0.3 + 0.7 * easeOutBack(t))
      if (t >= 1) {
        g.current.scale.setScalar(1)
        done.current = true
      }
      return
    }
    // Subtle idle bob + breathing so units feel alive at rest
    clock.current += dt
    const p = clock.current * 1.8 + phase.current
    g.current.position.y = Math.sin(p) * 0.025
    const breathe = 1 + Math.sin(p) * 0.012
    g.current.scale.set(1, breathe, 1)
  })

  const teamColor = team === 'player' ? '#3a7be8' : '#e8503a'
  const bodyScale = LEVEL_SCALE[level - 1]
  const baseScale = 1 + (level - 1) * 0.12

  return (
    <group ref={g} scale={pop ? 0.001 : 1}>
      {/* Team-colored base disc */}
      <group scale={[baseScale, 1, baseScale]}>
        <mesh position={[0, 0.06, 0]} receiveShadow>
          <cylinderGeometry args={[0.6, 0.66, 0.12, 28]} />
          <meshStandardMaterial color={teamColor} roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.13, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.6, 0.04, 8, 28]} />
          <meshStandardMaterial color="#ffffff" opacity={0.5} transparent />
        </mesh>
      </group>

      <group scale={bodyScale} position={[0, 0.12, 0]}>
        <Body type={type} />
      </group>

      <Pips n={level} />
    </group>
  )
}
