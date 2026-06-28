import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * A one-shot merge effect: a bright flash ring that expands + fades, plus a
 * spray of gold/orange shards that fly out, arc down under gravity, and shrink.
 * Self-removes via onDone when finished. This is *the* satisfying moment.
 */
export function MergeBurst({
  pos,
  onDone,
}: {
  pos: [number, number, number]
  onDone: () => void
}) {
  const group = useRef<THREE.Group>(null)
  const age = useRef(0)

  const parts = useMemo(() => {
    const n = 14
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2
      return {
        dx: Math.cos(a),
        dz: Math.sin(a),
        up: 1.6 + Math.random() * 1.6,
        speed: 2.4 + Math.random() * 2.2,
        spin: (Math.random() - 0.5) * 12,
      }
    })
  }, [])

  const DUR = 0.7

  useFrame((_, dt) => {
    if (!group.current) return
    age.current += dt
    const t = age.current
    if (t >= DUR) {
      onDone()
      return
    }
    const k = t / DUR
    const children = group.current.children

    // child[0] = flash ring
    const ring = children[0] as THREE.Mesh
    if (ring) {
      const rs = 0.3 + k * 3.2
      ring.scale.setScalar(rs)
      ;(ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - k)
    }

    // child[1..] = shards
    for (let i = 0; i < parts.length; i++) {
      const m = children[i + 1] as THREE.Mesh
      if (!m) continue
      const p = parts[i]
      const dist = p.speed * t
      m.position.set(
        p.dx * dist,
        Math.max(-0.25, p.up * t - 3.2 * t * t),
        p.dz * dist,
      )
      const s = Math.max(0, 0.16 * (1 - k))
      m.scale.setScalar(s)
      m.rotation.x += p.spin * dt
      m.rotation.y += p.spin * dt
      ;(m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - k)
    }
  })

  return (
    <group ref={group} position={pos}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.45, 0.72, 28]} />
        <meshBasicMaterial color="#fff3c4" transparent depthWrite={false} />
      </mesh>
      {parts.map((_, i) => (
        <mesh key={i}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial
            color={i % 2 ? '#ffd54a' : '#ff9a3c'}
            transparent
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  )
}
