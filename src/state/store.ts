import { create } from 'zustand'
import type { Franchise, Screen, FacilityKey } from '../types'
import { generateRoster } from '../game/players'
import { pickEvent, type PressEvent } from '../game/pressEvents'
import { sfx } from '../audio/sfx'

const clampN = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const DEFAULT_FACILITIES = { training: 1, medical: 1, scouting: 1, stadium: 1 }
export const FACILITY_COST = (level: number) => 20 + level * 20

// Bump this if the save shape changes incompatibly in a later phase.
const SAVE_KEY = 'hoop_save_v1'

function loadSave(): Franchise | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    const f = JSON.parse(raw) as Franchise
    // Migrate older saves (Phase 4 rosters, Phase 5 facilities/fan interest).
    let dirty = false
    if (!f.roster || !f.roster.length) {
      f.roster = generateRoster()
      dirty = true
    }
    if (!f.facilities) {
      f.facilities = { ...DEFAULT_FACILITIES }
      dirty = true
    }
    if (typeof f.fanInterest !== 'number') {
      f.fanInterest = 50
      dirty = true
    }
    if (dirty) writeSave(f)
    return f
  } catch {
    return null
  }
}

function writeSave(f: Franchise) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(f))
  } catch {
    /* ignore (private mode / quota) */
  }
}

export interface NewFranchiseInput {
  coachName: string
  city: string
  teamName: string
  colorPrimary: string
  colorSecondary: string
}

interface GameStore {
  screen: Screen
  franchise: Franchise | null
  hasSave: boolean
  pendingEvent: PressEvent | null

  navigate: (s: Screen) => void
  startNewFranchise: (input: NewFranchiseInput) => void
  continueSave: () => void
  deleteSave: () => void
  /** Apply a finished game's result (record + credits + morale + fans). */
  recordGameResult: (win: boolean, credits: number) => void
  /** Upgrade a facility if affordable; applies its effect. */
  upgradeFacility: (key: FacilityKey) => void
  /** Queue a random press event; returns whether one was set. */
  triggerPressEvent: () => boolean
  /** Apply a press-event choice's effects and clear it. */
  resolvePressEvent: (choiceIndex: number) => void
  /** Persist the current franchise — call after every meta change. */
  autosave: () => void
}

export const useGame = create<GameStore>((set, get) => ({
  screen: 'menu',
  franchise: null,
  hasSave: !!loadSave(),
  pendingEvent: null,

  navigate: (s) => set({ screen: s }),

  startNewFranchise: (input) => {
    const f: Franchise = {
      coachName: input.coachName.trim() || 'Coach',
      city: input.city.trim() || 'Riverside',
      teamName: input.teamName.trim() || 'Hoops',
      colorPrimary: input.colorPrimary,
      colorSecondary: input.colorSecondary,
      credits: 50,
      season: 1,
      wins: 0,
      losses: 0,
      createdAt: Date.now(),
      roster: generateRoster(),
      facilities: { ...DEFAULT_FACILITIES },
      fanInterest: 50,
    }
    writeSave(f)
    set({ franchise: f, hasSave: true, screen: 'hub' })
  },

  continueSave: () => {
    const f = loadSave()
    if (f) set({ franchise: f, screen: 'hub' })
    else set({ hasSave: false })
  },

  deleteSave: () => {
    try {
      localStorage.removeItem(SAVE_KEY)
    } catch {
      /* ignore */
    }
    set({ franchise: null, hasSave: false, screen: 'menu' })
  },

  recordGameResult: (win, credits) => {
    const f = get().franchise
    if (!f) return
    // Win lifts morale + fans, loss drags them down.
    const dM = win ? 4 : -5
    const roster = f.roster.map((p) => ({
      ...p,
      morale: clampN(Math.round(p.morale + dM + (Math.random() * 4 - 2)), 0, 100),
    }))
    const nf: Franchise = {
      ...f,
      roster,
      wins: f.wins + (win ? 1 : 0),
      losses: f.losses + (win ? 0 : 1),
      credits: f.credits + credits,
      fanInterest: clampN(f.fanInterest + (win ? 6 : -4), 0, 100),
    }
    writeSave(nf)
    set({ franchise: nf })
  },

  upgradeFacility: (key) => {
    const f = get().franchise
    if (!f) return
    const level = f.facilities[key]
    if (level >= 5) return
    const cost = FACILITY_COST(level)
    if (f.credits < cost) {
      sfx.deny()
      return
    }
    const facilities = { ...f.facilities, [key]: level + 1 }
    let roster = f.roster
    let fanInterest = f.fanInterest
    // Immediate effects: training boosts morale, stadium boosts fans.
    if (key === 'training') {
      roster = f.roster.map((p) => ({ ...p, morale: clampN(p.morale + 5, 0, 100) }))
    } else if (key === 'stadium') {
      fanInterest = clampN(f.fanInterest + 8, 0, 100)
    }
    const nf: Franchise = { ...f, facilities, roster, fanInterest, credits: f.credits - cost }
    writeSave(nf)
    set({ franchise: nf })
    sfx.confirm()
  },

  triggerPressEvent: () => {
    if (!get().franchise) return false
    set({ pendingEvent: pickEvent() })
    return true
  },

  resolvePressEvent: (choiceIndex) => {
    const { franchise: f, pendingEvent } = get()
    if (!f || !pendingEvent) return
    const eff = pendingEvent.choices[choiceIndex]?.effect ?? {}
    // Identify the "star" = highest-overall player for star/others effects.
    let starId = f.roster[0]?.id
    let bestOv = -1
    for (const p of f.roster) {
      const ov = p.shooting + p.speed + p.inside + p.defense
      if (ov > bestOv) {
        bestOv = ov
        starId = p.id
      }
    }
    const roster = f.roster.map((p) => {
      let d = eff.teamMorale ?? 0
      if (p.id === starId) d += eff.starMorale ?? 0
      else d += eff.othersMorale ?? 0
      return d ? { ...p, morale: clampN(p.morale + d, 0, 100) } : p
    })
    const nf: Franchise = {
      ...f,
      roster,
      fanInterest: clampN(f.fanInterest + (eff.fanInterest ?? 0), 0, 100),
      credits: Math.max(0, f.credits + (eff.credits ?? 0)),
    }
    writeSave(nf)
    set({ franchise: nf, pendingEvent: null })
  },

  autosave: () => {
    const f = get().franchise
    if (f) writeSave(f)
  },
}))
