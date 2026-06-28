import { create } from 'zustand'
import type { Franchise, Screen, FacilityKey, Player } from '../types'
import { generateRoster, genPlayer, overall, POSITIONS } from '../game/players'
import {
  generateLeague,
  freshSeasonState,
  simLeagueRound,
  playerRank,
} from '../game/league'
import { pickEvent, type PressEvent } from '../game/pressEvents'
import { sfx } from '../audio/sfx'

const clampN = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const DEFAULT_FACILITIES = { training: 1, medical: 1, scouting: 1, stadium: 1 }
export const FACILITY_COST = (level: number) => 20 + level * 20

type OppInfo = { city: string; name: string; abbr: string; color: string; offense: number }

function initSeason() {
  const league = generateLeague()
  return {
    league,
    seasonState: freshSeasonState(league),
    hallOfFame: [],
    failedGoals: 0,
    titles: 0,
    tenure: {} as Record<string, number>,
  }
}

const playerEntry = (f: Franchise) => ({
  abbr: f.teamName.slice(0, 3).toUpperCase(),
  name: f.teamName,
  color: f.colorPrimary,
  w: f.seasonState.wins,
  l: f.seasonState.losses,
})

const RKEYS: (keyof Player)[] = ['shooting', 'speed', 'inside', 'defense']
const rndKey = () => RKEYS[Math.floor(Math.random() * RKEYS.length)]

/** Ensure 5 starters cover every position; keep a bench of ≥3. */
function rebuildRoster(players: Player[]): Player[] {
  const used = new Set<Player>()
  const starters: Player[] = POSITIONS.map((pos) => {
    const found = players.find((p) => p.pos === pos && !used.has(p))
    if (found) {
      used.add(found)
      return found
    }
    return genPlayer(pos)
  })
  const bench = players.filter((p) => !used.has(p))
  while (bench.length < 3) bench.push(genPlayer(POSITIONS[Math.floor(Math.random() * 5)]))
  return [...starters, ...bench]
}

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
    if (!f.league || !f.seasonState) {
      Object.assign(f, initSeason())
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
  /** The opponent for the current scheduled/playoff game. */
  currentOpponent: () => OppInfo | null
  /** Advance the season after a finished game (record + standings + phase). */
  advanceSeason: (win: boolean) => void
  /** Offseason rollover: goal eval, aging/retirement/HoF, fresh season. */
  startNextSeason: () => void
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
      ...initSeason(),
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

  currentOpponent: () => {
    const f = get().franchise
    if (!f) return null
    const s = f.seasonState
    if (s.phase === 'regular') {
      const id = s.schedule[Math.min(s.game, s.schedule.length - 1)]
      const t = f.league.find((x) => x.id === id) ?? f.league[0]
      return { city: t.city, name: t.name, abbr: t.abbr, color: t.color, offense: t.rating }
    }
    // Playoffs: face the top AI seeds (final = best, semi = 2nd best).
    const aiSorted = [...f.league].sort((a, b) => b.w - b.l - (a.w - a.l))
    const t = (s.playoffRound >= 2 ? aiSorted[0] : aiSorted[1]) ?? aiSorted[0]
    return {
      city: t.city,
      name: t.name,
      abbr: t.abbr,
      color: t.color,
      offense: Math.min(9, t.rating + 1),
    }
  },

  advanceSeason: (win) => {
    const f = get().franchise
    if (!f) return
    const s = { ...f.seasonState }
    let league = f.league

    if (s.phase === 'regular') {
      if (win) s.wins++
      else s.losses++
      league = simLeagueRound(league)
      s.game++
      if (s.game >= s.schedule.length) {
        const rank = playerRank({ ...playerEntry(f), w: s.wins, l: s.losses }, league)
        if (rank <= 4) {
          s.phase = 'playoffs'
          s.playoffRound = 1
          s.alive = true
          s.lastResult = `You made the Playoffs — #${rank} seed!`
        } else {
          s.phase = 'offseason'
          s.alive = false
          s.lastResult = `Missed the Playoffs (finished #${rank}).`
        }
      }
    } else if (s.phase === 'playoffs') {
      if (s.playoffRound === 1) {
        if (win) {
          s.playoffRound = 2
          s.lastResult = 'Won the Semifinal! On to the Finals.'
        } else {
          s.phase = 'offseason'
          s.alive = false
          s.lastResult = 'Eliminated in the Semifinals.'
        }
      } else {
        if (win) {
          s.phase = 'offseason'
          s.alive = true
          s.lastResult = '🏆 CHAMPIONS! You won the Retro Cup!'
        } else {
          s.phase = 'offseason'
          s.alive = false
          s.lastResult = 'Lost in the Finals — runner-up.'
        }
      }
    }

    const nf: Franchise = { ...f, seasonState: s, league }
    writeSave(nf)
    set({ franchise: nf })
  },

  startNextSeason: () => {
    const f = get().franchise
    if (!f) return
    const s = f.seasonState
    const champion = s.alive
    const rank = playerRank({ ...playerEntry(f), w: s.wins, l: s.losses }, f.league)
    const goalMet = s.goal.type === 'playoffs' ? rank <= 4 : s.wins >= s.goal.target
    const failedGoals = goalMet ? 0 : f.failedGoals + 1

    // Repeated failure → fired (run over).
    if (failedGoals >= 3) {
      try {
        localStorage.removeItem(SAVE_KEY)
      } catch {
        /* ignore */
      }
      set({ franchise: null, hasSave: false, screen: 'menu', pendingEvent: null })
      return
    }

    // Age, grow/decline, retire → Hall of Fame.
    const tenure = { ...f.tenure }
    const hof = [...f.hallOfFame]
    const growthChance = 0.35 + f.facilities.training * 0.05
    const aged: Player[] = f.roster.map((p) => {
      tenure[p.id] = (tenure[p.id] ?? 0) + 1
      const np: Player = { ...p, age: p.age + 1 }
      if (np.age <= 25 && Math.random() < growthChance) {
        const k = rndKey()
        ;(np as unknown as Record<string, number>)[k] = clampN((np as unknown as Record<string, number>)[k] + 1, 1, 10)
      }
      if (np.age >= 31 && Math.random() < 0.5) {
        const k = rndKey()
        ;(np as unknown as Record<string, number>)[k] = clampN((np as unknown as Record<string, number>)[k] - 1, 1, 10)
      }
      return np
    })
    const survivors: Player[] = []
    for (const p of aged) {
      const retire = p.age >= 35 || (p.age >= 32 && Math.random() < 0.35)
      if (retire) {
        hof.push({
          name: p.name,
          pos: p.pos,
          overall: overall(p),
          seasons: tenure[p.id] ?? 1,
          titles: f.titles,
        })
        delete tenure[p.id]
      } else {
        survivors.push(p)
      }
    }
    const roster = rebuildRoster(survivors)

    const reward = (goalMet ? 60 : 0) + (champion ? 100 : 0)
    const league = generateLeague()
    const nf: Franchise = {
      ...f,
      roster,
      tenure,
      hallOfFame: hof,
      league,
      seasonState: freshSeasonState(league),
      season: f.season + 1,
      titles: f.titles + (champion ? 1 : 0),
      failedGoals,
      credits: f.credits + reward,
      fanInterest: clampN(f.fanInterest + (champion ? 12 : goalMet ? 4 : -6), 0, 100),
    }
    writeSave(nf)
    set({ franchise: nf })
    sfx.confirm()
  },

  autosave: () => {
    const f = get().franchise
    if (f) writeSave(f)
  },
}))
