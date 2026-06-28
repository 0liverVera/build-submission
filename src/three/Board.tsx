import { useCallback, useMemo, useRef, useState } from 'react'
import { useThree, useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import UnitMesh from './UnitMesh'
import { MergeBurst } from './MergeBurst'
import { useGameStore } from '../game/store'
import { SLOTS, slotPos, nearestSlot, BOARD_Y } from '../game/layout'
import type { SlotRef, UnitInstance } from '../game/types'
import { sfx } from '../game/sfx'

const GOLD_PAD = '#ffd54a'

function SlotPad({
  x,
  z,
  kind,
  hot,
}: {
  x: number
  z: number
  kind: 'board' | 'bench'
  hot: boolean
}) {
  const base = kind === 'board' ? '#3a7be8' : '#6b4226'
  return (
    <mesh position={[x, BOARD_Y - 0.01, z]}>
      <cylinderGeometry args={[0.92, 0.92, 0.06, 28]} />
      <meshStandardMaterial
        color={hot ? GOLD_PAD : base}
        transparent
        opacity={hot ? 0.85 : kind === 'board' ? 0.3 : 0.55}
        emissive={hot ? GOLD_PAD : '#000000'}
        emissiveIntensity={hot ? 0.7 : 0}
      />
    </mesh>
  )
}

/** The lifted unit that follows the finger while dragging. */
function DraggedUnit({
  content,
  posRef,
}: {
  content: UnitInstance
  posRef: React.MutableRefObject<THREE.Vector3>
}) {
  const g = useRef<THREE.Group>(null)
  const tmp = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    if (!g.current) return
    tmp.set(posRef.current.x, BOARD_Y + 0.8, posRef.current.z)
    g.current.position.lerp(tmp, 0.5)
  })
  return (
    <group
      ref={g}
      position={[posRef.current.x, BOARD_Y + 0.8, posRef.current.z]}
    >
      <UnitMesh type={content.type} level={content.level} pop={false} />
    </group>
  )
}

export default function Board() {
  const { camera, gl } = useThree()
  const board = useGameStore((s) => s.board)
  const bench = useGameStore((s) => s.bench)
  const moveUnit = useGameStore((s) => s.moveUnit)
  const bursts = useGameStore((s) => s.bursts)
  const removeBurst = useGameStore((s) => s.removeBurst)

  const [drag, setDrag] = useState<{ from: SlotRef; content: UnitInstance } | null>(
    null,
  )
  const [hover, setHover] = useState<SlotRef | null>(null)

  const dragPos = useRef(new THREE.Vector3())
  const dragRef = useRef(drag)
  dragRef.current = drag

  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const plane = useMemo(
    () => new THREE.Plane(new THREE.Vector3(0, 1, 0), -BOARD_Y),
    [],
  )
  const hit = useMemo(() => new THREE.Vector3(), [])

  // Project a screen coordinate onto the board plane, independent of whatever
  // 3D object happens to be under the finger — robust for drag.
  const toBoard = useCallback(
    (cx: number, cy: number) => {
      const rect = gl.domElement.getBoundingClientRect()
      const nx = ((cx - rect.left) / rect.width) * 2 - 1
      const ny = -(((cy - rect.top) / rect.height) * 2 - 1)
      raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera)
      raycaster.ray.intersectPlane(plane, hit)
      return hit
    },
    [camera, gl, raycaster, plane, hit],
  )

  const onMove = useCallback(
    (e: PointerEvent) => {
      if (!dragRef.current) return
      const p = toBoard(e.clientX, e.clientY)
      dragPos.current.set(p.x, BOARD_Y, p.z)
      const s = nearestSlot(p.x, p.z)
      setHover((prev) =>
        prev && prev.area === s.area && prev.index === s.index ? prev : s,
      )
    },
    [toBoard],
  )

  const onUp = useCallback(
    (e: PointerEvent) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      const d = dragRef.current
      if (d) {
        const p = toBoard(e.clientX, e.clientY)
        moveUnit(d.from, nearestSlot(p.x, p.z))
      }
      setDrag(null)
      setHover(null)
    },
    [onMove, toBoard, moveUnit],
  )

  const startDrag = useCallback(
    (from: SlotRef, content: UnitInstance, e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      const ne = e.nativeEvent
      const p = toBoard(ne.clientX, ne.clientY)
      dragPos.current.set(p.x, BOARD_Y, p.z)
      setDrag({ from, content })
      setHover(from)
      sfx.pick()
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [toBoard, onMove, onUp],
  )

  const isDragged = (u: UnitInstance | null) =>
    !!u && !!drag && drag.content.id === u.id
  const isHot = (area: 'board' | 'bench', index: number) =>
    !!hover && hover.area === area && hover.index === index

  return (
    <group>
      {SLOTS.map((s) => (
        <SlotPad
          key={s.ref.area + s.ref.index}
          x={s.x}
          z={s.z}
          kind={s.ref.area}
          hot={isHot(s.ref.area, s.ref.index)}
        />
      ))}

      {board.map((u, i) =>
        u && !isDragged(u) ? (
          <group
            key={u.id}
            position={slotPos({ area: 'board', index: i })}
            onPointerDown={(e) => startDrag({ area: 'board', index: i }, u, e)}
          >
            <UnitMesh type={u.type} level={u.level} />
          </group>
        ) : null,
      )}

      {bench.map((u, i) =>
        u && !isDragged(u) ? (
          <group
            key={u.id}
            position={slotPos({ area: 'bench', index: i })}
            onPointerDown={(e) => startDrag({ area: 'bench', index: i }, u, e)}
          >
            <UnitMesh type={u.type} level={u.level} />
          </group>
        ) : null,
      )}

      {drag && <DraggedUnit content={drag.content} posRef={dragPos} />}

      {bursts.map((b) => (
        <MergeBurst key={b.id} pos={b.pos} onDone={() => removeBurst(b.id)} />
      ))}
    </group>
  )
}
