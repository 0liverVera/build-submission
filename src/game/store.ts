import { create } from 'zustand'
import type { UnitInstance, UnitType, Level, SlotRef } from './types'
import { slotPos, BOARD_Y } from './layout'
import { UNIT_TYPES, UNIT_DEFS } from './units'
import { sfx } from './sfx'

let _id = 0
const nid = () => 'u' + ++_id
const mk = (type: UnitType, level: Level = 1): UnitInstance => ({
  id: nid(),
  type,
  level,
})

// --- Economy constants (classic autobattler; tuned in Phase 10) ---
const START_COINS = 10
const REROLL_COST = 2
const INCOME_BASE = 5
const WIN_BONUS = 1
const SHOP_SIZE = 4
const MAX_INTEREST = 5

const randType = () => UNIT_TYPES[Math.floor(Math.random() * UNIT_TYPES.length)]
const rollShopArr = (): UnitType[] =>
  Array.from({ length: SHOP_SIZE }, randType)
/** Interest: +1 coin per 10 saved, capped. Rewards banking gold. */
const interestFor = (coins: number) =>
  Math.min(Math.floor(coins / 10), MAX_INTEREST)

interface Burst {
  id: string
  pos: [number, number, number]
}

interface GameState {
  board: (UnitInstance | null)[]
  bench: (UnitInstance | null)[]
  shop: (UnitType | null)[]
  coins: number
  lives: number
  wave: number
  bursts: Burst[]
  /** Screen-shake trigger: timestamp + strength, read by the camera rig. */
  kickAt: number
  kickPower: number

  rerollCost: number

  moveUnit: (from: SlotRef, to: SlotRef) => void
  buyFromShop: (index: number) => void
  reroll: () => void
  grantIncome: () => void
  removeBurst: (id: string) => void
  triggerShake: (power: number) => void
}

const sameSlot = (a: SlotRef, b: SlotRef) =>
  a.area === b.area && a.index === b.index

const firstEmpty = (arr: (UnitInstance | null)[]) => arr.findIndex((x) => !x)

export const useGameStore = create<GameState>((set, get) => ({
  // Two Brutes seeded on the front row so a merge can be tried immediately,
  // with the bench left open so the shop can be tested too.
  board: (() => {
    const b = Array<UnitInstance | null>(9).fill(null)
    b[6] = mk('brute')
    b[7] = mk('brute')
    return b
  })(),
  bench: [null, null, null],
  shop: rollShopArr(),
  coins: START_COINS,
  lives: 3,
  wave: 1,
  bursts: [],
  kickAt: 0,
  kickPower: 0,
  rerollCost: REROLL_COST,

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

  buyFromShop: (index) => {
    const s = get()
    const type = s.shop[index]
    if (!type) return
    const cost = UNIT_DEFS[type].cost
    if (s.coins < cost) {
      sfx.deny()
      return
    }
    const bench = [...s.bench]
    const bi = firstEmpty(bench)
    if (bi < 0) {
      // Bench full — no room to recruit
      sfx.deny()
      return
    }
    bench[bi] = mk(type)
    const shop = [...s.shop]
    shop[index] = null
    set({ bench, shop, coins: s.coins - cost })
    sfx.buy()
  },

  reroll: () => {
    const s = get()
    if (s.coins < REROLL_COST) {
      sfx.deny()
      return
    }
    set({ coins: s.coins - REROLL_COST, shop: rollShopArr() })
    sfx.reroll()
  },

  grantIncome: () => {
    const s = get()
    const interest = interestFor(s.coins)
    const gain = INCOME_BASE + WIN_BONUS + interest
    // New round: collect income (base + win bonus + interest) and a free shop.
    set({ coins: s.coins + gain, wave: s.wave + 1, shop: rollShopArr() })
    sfx.coin()
  },

  removeBurst: (id) =>
    set((s) => ({ bursts: s.bursts.filter((b) => b.id !== id) })),

  triggerShake: (power) =>
    set({ kickAt: performance.now(), kickPower: power }),
}))
