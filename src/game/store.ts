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
const START_LIVES = 3

const randType = () => UNIT_TYPES[Math.floor(Math.random() * UNIT_TYPES.length)]
const rollShopArr = (): UnitType[] =>
  Array.from({ length: SHOP_SIZE }, randType)
const interestFor = (coins: number) =>
  Math.min(Math.floor(coins / 10), MAX_INTEREST)

// --- Best-wave persistence (localStorage; offline-safe) ---
const BEST_KEY = 'cc_bestWave'
function loadBest(): number {
  try {
    return parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0
  } catch {
    return 0
  }
}
function saveBest(v: number) {
  try {
    localStorage.setItem(BEST_KEY, String(v))
  } catch {
    /* ignore (private mode / SSR) */
  }
}

/** Fresh-run state (everything that resets on restart; best wave persists). */
function initialRun() {
  const board = Array<UnitInstance | null>(9).fill(null)
  board[6] = mk('brute')
  board[7] = mk('brute')
  return {
    board,
    bench: [null, null, null] as (UnitInstance | null)[],
    shop: rollShopArr() as (UnitType | null)[],
    coins: START_COINS,
    lives: START_LIVES,
    wave: 1,
    phase: 'prep' as Phase,
    banner: null as FightResult | null,
    bursts: [] as Burst[],
    kickAt: 0,
    kickPower: 0,
  }
}

interface Burst {
  id: string
  pos: [number, number, number]
}

export type Phase = 'prep' | 'fight' | 'gameover'
export type FightResult = 'win' | 'lose'

interface GameState {
  board: (UnitInstance | null)[]
  bench: (UnitInstance | null)[]
  shop: (UnitType | null)[]
  coins: number
  lives: number
  wave: number
  bestWave: number
  phase: Phase
  banner: FightResult | null
  bursts: Burst[]
  kickAt: number
  kickPower: number
  rerollCost: number

  moveUnit: (from: SlotRef, to: SlotRef) => void
  buyFromShop: (index: number) => void
  reroll: () => void
  startFight: () => void
  finishFight: (result: FightResult) => void
  clearBanner: () => void
  restart: () => void
  removeBurst: (id: string) => void
  triggerShake: (power: number) => void
}

const sameSlot = (a: SlotRef, b: SlotRef) =>
  a.area === b.area && a.index === b.index
const firstEmpty = (arr: (UnitInstance | null)[]) => arr.findIndex((x) => !x)

export const useGameStore = create<GameState>((set, get) => ({
  ...initialRun(),
  bestWave: loadBest(),
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

  startFight: () => {
    const s = get()
    if (s.phase !== 'prep') return
    if (!s.board.some(Boolean)) {
      sfx.deny()
      return
    }
    set({ phase: 'fight', banner: null, kickAt: performance.now(), kickPower: 0.22 })
    sfx.fight()
  },

  finishFight: (result) => {
    const s = get()
    if (s.phase !== 'fight') return
    let { coins, lives, wave } = s

    if (result === 'win') {
      coins += INCOME_BASE + WIN_BONUS + interestFor(coins)
      wave += 1
      const best = Math.max(s.bestWave, wave)
      saveBest(best)
      set({ phase: 'prep', banner: 'win', coins, wave, bestWave: best, shop: rollShopArr() })
      sfx.win()
      return
    }

    // loss
    coins += INCOME_BASE
    lives = Math.max(0, lives - 1)
    if (lives <= 0) {
      const best = Math.max(s.bestWave, wave)
      saveBest(best)
      set({ phase: 'gameover', lives: 0, coins, banner: null, bestWave: best })
      sfx.lose()
      return
    }
    set({ phase: 'prep', banner: 'lose', coins, lives, shop: rollShopArr() })
    sfx.lose()
  },

  clearBanner: () => set({ banner: null }),

  restart: () => set({ ...initialRun() }),

  removeBurst: (id) =>
    set((s) => ({ bursts: s.bursts.filter((b) => b.id !== id) })),

  triggerShake: (power) =>
    set({ kickAt: performance.now(), kickPower: power }),
}))
