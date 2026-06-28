import { create } from 'zustand'
import type { UnitInstance, UnitType, Level, SlotRef } from './types'
import { slotPos, BOARD_Y } from './layout'
import { UNIT_TYPES } from './units'
import { sfx } from './sfx'

let _id = 0
const nid = () => 'u' + ++_id
const mk = (type: UnitType, level: Level = 1): UnitInstance => ({
  id: nid(),
  type,
  level,
})

interface Burst {
  id: string
  pos: [number, number, number]
}

interface GameState {
  board: (UnitInstance | null)[]
  bench: (UnitInstance | null)[]
  coins: number
  lives: number
  wave: number
  bursts: Burst[]
  /** Screen-shake trigger: timestamp + strength, read by the camera rig. */
  kickAt: number
  kickPower: number

  moveUnit: (from: SlotRef, to: SlotRef) => void
  addRandomUnit: () => void
  removeBurst: (id: string) => void
  triggerShake: (power: number) => void
}

const sameSlot = (a: SlotRef, b: SlotRef) =>
  a.area === b.area && a.index === b.index

export const useGameStore = create<GameState>((set, get) => ({
  // Seeded with two Brutes on the bench so a merge can be tried immediately.
  board: (() => {
    const b = Array<UnitInstance | null>(9).fill(null)
    b[7] = mk('legionnaire')
    b[1] = mk('archer')
    return b
  })(),
  bench: [mk('brute'), mk('brute'), mk('priestess')],
  coins: 10,
  lives: 3,
  wave: 1,
  bursts: [],
  kickAt: 0,
  kickPower: 0,

  moveUnit: (from, to) => {
    if (sameSlot(from, to)) return
    const s = get()
    const board = [...s.board]
    const bench = [...s.bench]
    const read = (r: SlotRef) =>
      r.area === 'board' ? board[r.index] : bench[r.index]
    const write = (r: SlotRef, v: UnitInstance | null) => {
      if (r.area === 'board') board[r.index] = v
      else bench[r.index] = v
    }

    const src = read(from)
    if (!src) return
    const dst = read(to)

    if (!dst) {
      // Move into empty slot
      write(to, src)
      write(from, null)
      set({ board, bench })
      sfx.drop()
      return
    }

    if (dst.type === src.type && dst.level === src.level && dst.level < 3) {
      // MERGE → next level, with juice (burst + screen shake + sound)
      write(to, { id: nid(), type: dst.type, level: (dst.level + 1) as Level })
      write(from, null)
      const [bx, , bz] = slotPos(to)
      set({
        board,
        bench,
        bursts: [...s.bursts, { id: nid(), pos: [bx, BOARD_Y + 0.5, bz] }],
        kickAt: performance.now(),
        kickPower: 0.3,
      })
      sfx.merge()
      return
    }

    // Occupied by a different unit → swap
    write(to, src)
    write(from, dst)
    set({ board, bench })
    sfx.drop()
  },

  addRandomUnit: () => {
    const s = get()
    const type = UNIT_TYPES[Math.floor(Math.random() * UNIT_TYPES.length)]
    const bench = [...s.bench]
    const bi = bench.findIndex((x) => !x)
    if (bi >= 0) {
      bench[bi] = mk(type)
      set({ bench })
      sfx.drop()
      return
    }
    const board = [...s.board]
    const oi = board.findIndex((x) => !x)
    if (oi >= 0) {
      board[oi] = mk(type)
      set({ board })
      sfx.drop()
    }
  },

  removeBurst: (id) =>
    set((s) => ({ bursts: s.bursts.filter((b) => b.id !== id) })),

  triggerShake: (power) =>
    set({ kickAt: performance.now(), kickPower: power }),
}))
