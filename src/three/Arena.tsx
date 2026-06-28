import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore } from '../game/store'

/**
 * The colosseum environment: an oval sand floor, a dividing line between the
 * player (near) and enemy (far) halves, and tiered stadium walls built from
 * stacked scaled rings. All primitives, no external assets — fully offline.
 */

const SAND = '#e8b86d'
const SAND_DARK = '#cf9a4f'
const STONE = '#caa06a'
const BROWN = '#6b4226'
const BROWN_DARK = '#4a2c19'

function StadiumTiers() {
  // Each tier is a flat, open-ended cylinder ring that steps up and outward,
  // reading as colosseum seating around the oval arena.
  const tiers = [
    { r: 8.4, y: 0.4, h: 0.9, color: BROWN },
    { r: 9.3, y: 1.1, h: 0.9, color: '#7d5230' },
    { r: 10.3, y: 1.9, h: 0.9, color: '#8a5c38' },
    { r: 11.4, y: 2.8, h: 1.0, color: '#9a6a42' },
  ]
  return (
    <group scale={[1, 1, 1.18]}>
      {tiers.map((t, i) => (
        <mesh key={i} position={[0, t.y, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[t.r, t.r - 0.5, t.h, 64, 1, true]} />
          <meshStandardMaterial
            color={t.color}
            side={THREE.DoubleSide}
            roughness={0.95}
          />
        </mesh>
      ))}
      {/* Solid base ring under the seating so you can't see through the gap */}
      <mesh position={[0, 0, 0]} receiveShadow>
        <cylinderGeometry args={[11.6, 11.6, 0.6, 64]} />
        <meshStandardMaterial color={BROWN_DARK} roughness={1} />
      </mesh>
    </group>
  )
}

function ArenaFloor() {
  return (
    <group>
      {/* Oval sand floor */}
      <mesh
        rotation={[0, 0, 0]}
        position={[0, 0, 0]}
        scale={[7.6, 0.5, 9.2]}
        receiveShadow
      >
        <cylinderGeometry args={[1, 1, 1, 64]} />
        <meshStandardMaterial color={SAND} roughness={0.9} />
      </mesh>

      {/* Slightly inset darker ring to frame the sand */}
      <mesh position={[0, 0.26, 0]} scale={[7.0, 1, 8.6]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.92, 1, 64]} />
        <meshStandardMaterial color={SAND_DARK} side={THREE.DoubleSide} />
      </mesh>

      {/* Center divider line between player and enemy halves */}
      <mesh position={[0, 0.27, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[13.5, 0.22]} />
        <meshStandardMaterial color={STONE} transparent opacity={0.5} />
      </mesh>
    </group>
  )
}

function CameraRig() {
  // Subtle idle drift so the scene feels alive even at rest (Section 4: camera),
  // plus a decaying screen shake driven by the store (e.g. on merge).
  const t = useRef(0)
  useFrame((state, delta) => {
    t.current += delta
    const cam = state.camera
    const driftX = Math.sin(t.current * 0.18) * 0.5
    const driftY = Math.sin(t.current * 0.25) * 0.18

    const { kickAt, kickPower, zoomAt } = useGameStore.getState()
    const since = (performance.now() - kickAt) / 1000
    const shake = since >= 0 && since < 0.4 ? kickPower * (1 - since / 0.4) : 0

    // Zoom-punch: dive the camera in then ease back out when a fight starts.
    const zt = (performance.now() - zoomAt) / 1000
    const zoom = zt >= 0 && zt < 0.5 ? Math.sin((zt / 0.5) * Math.PI) * 1.6 : 0

    cam.position.x = driftX + (Math.random() * 2 - 1) * shake
    cam.position.y = 13 - zoom * 0.5 + driftY + (Math.random() * 2 - 1) * shake
    cam.position.z = 13.5 - zoom
    cam.lookAt(0, 0.4, -0.3)
  })
  return null
}

export default function Arena() {
  return (
    <>
      <CameraRig />

      {/* Warm colosseum lighting — no external HDR, fully offline */}
      <hemisphereLight args={['#fff1cf', '#5a3a20', 0.7]} />
      <ambientLight intensity={0.35} />
      <directionalLight
        position={[6, 14, 6]}
        intensity={1.5}
        color="#fff0d0"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={1}
        shadow-camera-far={40}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
      />
      {/* Cool rim light from the opposite side for depth */}
      <directionalLight position={[-8, 6, -6]} intensity={0.4} color="#9fc0ff" />

      <ArenaFloor />
      <StadiumTiers />

      {/* Soft ground fog plane far below to ground the scene visually */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.4, 0]} receiveShadow>
        <circleGeometry args={[30, 48]} />
        <meshStandardMaterial color="#3a2414" roughness={1} />
      </mesh>
    </>
  )
}
