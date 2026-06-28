import type { SlotRef, Area } from './types'

/** Top surface of the arena floor — units and pads sit here. */
export const BOARD_Y = 0.26

const COLS_X = [-2.0, 0, 2.0]
const ROWS_Z = [2.0, 3.7, 5.4] // +z is the player's near half (toward camera)
const BENCH_Z = 7.2

export interface SlotPoint {
  ref: SlotRef
  x: number
  z: number
}

export const SLOTS: SlotPoint[] = []
for (let i = 0; i < 9; i++) {
  SLOTS.push({
    ref: { area: 'board', index: i },
    x: COLS_X[i % 3],
    z: ROWS_Z[Math.floor(i / 3)],
  })
}
for (let i = 0; i < 3; i++) {
  SLOTS.push({ ref: { area: 'bench', index: i }, x: COLS_X[i], z: BENCH_Z })
}

export function slotPos(ref: SlotRef): [number, number, number] {
  const p = SLOTS.find(
    (s) => s.ref.area === ref.area && s.ref.index === ref.index,
  )!
  return [p.x, BOARD_Y, p.z]
}

/** Nearest slot to a point on the board plane — used to resolve a drop target. */
export function nearestSlot(x: number, z: number): SlotRef {
  let best = SLOTS[0]
  let bestD = Infinity
  for (const s of SLOTS) {
    const d = (s.x - x) ** 2 + (s.z - z) ** 2
    if (d < bestD) {
      bestD = d
      best = s
    }
  }
  return best.ref
}

export function areaCount(area: Area): number {
  return SLOTS.filter((s) => s.ref.area === area).length
}
