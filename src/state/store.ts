import { create } from 'zustand'
import type { Franchise, Screen } from '../types'

// Bump this if the save shape changes incompatibly in a later phase.
const SAVE_KEY = 'hoop_save_v1'

function loadSave(): Franchise | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    return raw ? (JSON.parse(raw) as Franchise) : null
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

  navigate: (s: Screen) => void
  startNewFranchise: (input: NewFranchiseInput) => void
  continueSave: () => void
  deleteSave: () => void
  /** Apply a finished game's result (record + credits) and autosave. */
  recordGameResult: (win: boolean, credits: number) => void
  /** Persist the current franchise — call after every meta change (Phase 4+). */
  autosave: () => void
}

export const useGame = create<GameStore>((set, get) => ({
  screen: 'menu',
  franchise: null,
  hasSave: !!loadSave(),

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
    const nf: Franchise = {
      ...f,
      wins: f.wins + (win ? 1 : 0),
      losses: f.losses + (win ? 0 : 1),
      credits: f.credits + credits,
    }
    writeSave(nf)
    set({ franchise: nf })
  },

  autosave: () => {
    const f = get().franchise
    if (f) writeSave(f)
  },
}))
