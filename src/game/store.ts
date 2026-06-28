import { create } from 'zustand'
import type { UnitInstance, UnitType, Level, SlotRef } from './types'
import { slotPos, BOARD_Y } from './layout'
import { UNIT_TYPES, UNIT_DEFS } from './units'
import { type ModifierId, rollModifierId } from './modifiers'
import {
  GEM_PACKS,
  SKINS,
  skinById,
  CHAMPION_PACK,
  REVIVE_COST,
  AD_COINS,
} from './store-items'
import { sfx } from './sfx'

let _id = 0
const nid = () => 'u' + ++_id
const mk = (type: UnitType, level: Level = 1): UnitInstance => ({
  id: nid(),
  type,
  level,
})

// --- Economy constants (classic autobattler; tuned in Phase 10) ---
const START_COINS = 12
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

// --- Player profile persistence (gems / skins / no-ads; survives runs) ---
const PROFILE_KEY = 'cc_profile'
interface Profile {
  gems: number
  skin: string
  ownedSkins: string[]
  noAds: boolean
  championOwned: boolean
}
const DEFAULT_PROFILE: Profile = {
  gems: 0,
  skin: 'classic',
  ownedSkins: ['classic'],
  noAds: false,
  championOwned: false,
}
function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    if (!raw) return { ...DEFAULT_PROFILE }
    return { ...DEFAULT_PROFILE, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_PROFILE }
  }
}
function saveProfile(p: Profile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p))
  } catch {
    /* ignore */
  }
}

// --- One-time "how to play" intro flag ---
const INTRO_KEY = 'cc_seenIntro'
function loadIntroSeen(): boolean {
  try {
    return localStorage.getItem(INTRO_KEY) === '1'
  } catch {
    return false
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
    // Wave 1 is a clean intro; modifiers start rolling from wave 2.
    modifier: 'none' as ModifierId,
    modifierAnnounce: null as ModifierId | null,
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
  modifier: ModifierId
  modifierAnnounce: ModifierId | null
  bursts: Burst[]
  kickAt: number
  kickPower: number
  /** Camera zoom-punch trigger timestamp (read by the camera rig). */
  zoomAt: number
  rerollCost: number

  // --- Profile / monetization (Phase 9, all mock) ---
  gems: number
  skin: string
  ownedSkins: string[]
  noAds: boolean
  championOwned: boolean
  storeOpen: boolean
  adWatching: boolean
  toast: string | null
  showIntro: boolean

  moveUnit: (from: SlotRef, to: SlotRef) => void
  buyFromShop: (index: number) => void
  reroll: () => void
  startFight: () => void
  finishFight: (result: FightResult) => void
  clearBanner: () => void
  clearModifierAnnounce: () => void
  restart: () => void
  removeBurst: (id: string) => void
  triggerShake: (power: number) => void

  openStore: () => void
  closeStore: () => void
  buyGems: (packId: string) => void
  buySkin: (id: string) => void
  equipSkin: (id: string) => void
  buyChampionPack: () => void
  removeAds: () => void
  watchAd: () => void
  revive: () => void
  showToast: (msg: string) => void
  clearToast: () => void
  dismissIntro: () => void
}

const sameSlot = (a: SlotRef, b: SlotRef) =>
  a.area === b.area && a.index === b.index
const firstEmpty = (arr: (UnitInstance | null)[]) => arr.findIndex((x) => !x)

const _profile = loadProfile()

export const useGameStore = create<GameState>((set, get) => ({
  ...initialRun(),
  bestWave: loadBest(),
  zoomAt: 0,
  rerollCost: REROLL_COST,

  gems: _profile.gems,
  skin: _profile.skin,
  ownedSkins: _profile.ownedSkins,
  noAds: _profile.noAds,
  championOwned: _profile.championOwned,
  storeOpen: false,
  adWatching: false,
  toast: null,
  showIntro: !loadIntroSeen(),

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
    set({
      phase: 'fight',
      banner: null,
      // Announce the active modifier with a big banner as the fight starts.
      modifierAnnounce: s.modifier === 'none' ? null : s.modifier,
      kickAt: performance.now(),
      kickPower: 0.22,
      zoomAt: performance.now(),
    })
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
      set({
        phase: 'prep',
        banner: 'win',
        coins,
        wave,
        bestWave: best,
        shop: rollShopArr(),
        modifier: rollModifierId(), // roll the next wave's arena rule
      })
      sfx.win()
      sfx.crowd()
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
    set({
      phase: 'prep',
      banner: 'lose',
      coins,
      lives,
      shop: rollShopArr(),
      modifier: rollModifierId(), // re-roll the arena rule for the retry
    })
    sfx.lose()
  },

  clearBanner: () => set({ banner: null }),
  clearModifierAnnounce: () => set({ modifierAnnounce: null }),

  restart: () => set({ ...initialRun() }),

  removeBurst: (id) =>
    set((s) => ({ bursts: s.bursts.filter((b) => b.id !== id) })),

  triggerShake: (power) =>
    set({ kickAt: performance.now(), kickPower: power }),

  // --- Mock store actions (no real payment is ever processed) ---
  openStore: () => set({ storeOpen: true }),
  closeStore: () => set({ storeOpen: false }),

  showToast: (msg) => set({ toast: msg }),
  clearToast: () => set({ toast: null }),

  dismissIntro: () => {
    try {
      localStorage.setItem(INTRO_KEY, '1')
    } catch {
      /* ignore */
    }
    set({ showIntro: false })
  },

  buyGems: (packId) => {
    const pack = GEM_PACKS.find((p) => p.id === packId)
    if (!pack) return
    const s = get()
    const gems = s.gems + pack.gems
    set({ gems })
    persist(get())
    sfx.coin()
    get().showToast(`+${pack.gems} 💎`)
  },

  buySkin: (id) => {
    const s = get()
    const skin = SKINS.find((k) => k.id === id)
    if (!skin || s.ownedSkins.includes(id)) return
    if (s.gems < skin.gemCost) {
      sfx.deny()
      get().showToast('Not enough gems')
      return
    }
    const ownedSkins = [...s.ownedSkins, id]
    set({ gems: s.gems - skin.gemCost, ownedSkins, skin: id })
    persist(get())
    sfx.buy()
    get().showToast(`Unlocked ${skin.name}!`)
  },

  equipSkin: (id) => {
    const s = get()
    if (!s.ownedSkins.includes(id)) return
    set({ skin: id })
    persist(get())
    sfx.tap()
    get().showToast(`Equipped ${skinById(id).name}`)
  },

  buyChampionPack: () => {
    const s = get()
    const ownedSkins = s.ownedSkins.includes(CHAMPION_PACK.skin)
      ? s.ownedSkins
      : [...s.ownedSkins, CHAMPION_PACK.skin]
    set({
      gems: s.gems + CHAMPION_PACK.gems,
      noAds: true,
      championOwned: true,
      ownedSkins,
    })
    persist(get())
    sfx.win()
    get().showToast('Champion Pack unlocked! 👑')
  },

  removeAds: () => {
    set({ noAds: true })
    persist(get())
    sfx.buy()
    get().showToast('Ads removed — thank you!')
  },

  watchAd: () => {
    const s = get()
    if (s.adWatching) return
    set({ adWatching: true })
    window.setTimeout(() => {
      const cur = get()
      set({ adWatching: false, coins: cur.coins + AD_COINS })
      sfx.coin()
      cur.showToast(`+${AD_COINS} 🪙`)
    }, 2000)
  },

  revive: () => {
    const s = get()
    if (s.phase !== 'gameover') return
    if (s.gems < REVIVE_COST) {
      sfx.deny()
      get().showToast('Not enough gems')
      return
    }
    set({ gems: s.gems - REVIVE_COST, phase: 'prep', lives: 1, banner: null })
    persist(get())
    sfx.fight()
    get().showToast('Revived! ⚔')
  },
}))

/** Persist just the profile slice after any monetization change. */
function persist(s: GameState) {
  saveProfile({
    gems: s.gems,
    skin: s.skin,
    ownedSkins: s.ownedSkins,
    noAds: s.noAds,
    championOwned: s.championOwned,
  })
}
