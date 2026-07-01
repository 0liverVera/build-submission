import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Franchise, Screen, FacilityKey, Player } from '../types'
import {
  generateRoster,
  genPlayer,
  genProspect,
  genFreeAgent,
  salaryFor,
  overall,
  POSITIONS,
} from '../game/players'
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
export const SALARY_CAP = 250
export const ROSTER_MAX = 8
export const capUsed = (roster: { salary: number }[]) =>
  roster.reduce((s, p) => s + (p.salary ?? 0), 0)

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

// In-memory mirror of the persisted save. AsyncStorage is async, so we read it
// once at startup (hydrate) and keep this copy in sync on every write.
let cached: Franchise | null = null

/** Apply migrations / defensive backfills to a parsed save. Returns null if unusable. */
function migrate(f: Franchise): Franchise | null {
  // Basic shape check — bail to a fresh start if the core identity is gone.
  if (!f || typeof f !== 'object' || typeof f.teamName !== 'string') return null

  if (!Array.isArray(f.roster) || f.roster.length === 0) f.roster = generateRoster()
  if (!f.facilities || typeof f.facilities !== 'object') f.facilities = { ...DEFAULT_FACILITIES }
  if (typeof f.fanInterest !== 'number') f.fanInterest = 50
  if (!Array.isArray(f.league) || !f.seasonState || typeof f.seasonState !== 'object')
    Object.assign(f, initSeason())
  if (!Array.isArray(f.hallOfFame)) f.hallOfFame = []
  for (const p of f.roster) {
    if (typeof p.salary !== 'number') p.salary = salaryFor(p)
  }
  if (f.unlimited === undefined) f.unlimited = false
  if (typeof f.retryTokens !== 'number') f.retryTokens = 0
  if (typeof f.credits !== 'number') f.credits = 50
  return f
}

function writeSave(f: Franchise) {
  cached = f
  AsyncStorage.setItem(SAVE_KEY, JSON.stringify(f)).catch(() => {
    /* ignore (quota / unavailable) */
  })
}

function removeSave() {
  cached = null
  AsyncStorage.removeItem(SAVE_KEY).catch(() => {
    /* ignore */
  })
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
  hydrated: boolean
  pendingEvent: PressEvent | null
  toast: string | null
  storeAd: boolean

  /** Read the persisted save once at app start. */
  hydrate: () => Promise<void>
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
  /** Begin the offseason: goal eval, aging/retirement/HoF, draft + FA pools. */
  enterOffseason: () => void
  /** Draft a prospect onto the roster. */
  draftPlayer: (id: string) => void
  /** Sign a free agent if under cap + roster limit. */
  signFreeAgent: (id: string) => void
  /** Cut a player to free cap space. */
  cutPlayer: (id: string) => void
  /** Commit the offseason → fresh season. */
  commitNextSeason: () => void

  // --- Mock store / monetization (Phase 10) ---
  buyCreditsPack: (amount: number) => void
  buyUnlimited: () => void
  watchAdForCredits: () => void
  buyRetryToken: () => void
  editTeam: (input: { city: string; teamName: string; colorPrimary: string; colorSecondary: string }) => void
  showToast: (msg: string) => void
  clearToast: () => void

  /** Persist the current franchise — call after every meta change. */
  autosave: () => void
}

export const useGame = create<GameStore>((set, get) => ({
  screen: 'menu',
  franchise: null,
  hasSave: false,
  hydrated: false,
  pendingEvent: null,
  toast: null,
  storeAd: false,

  hydrate: async () => {
    let raw: string | null = null
    try {
      raw = await AsyncStorage.getItem(SAVE_KEY)
    } catch {
      set({ hydrated: true })
      return
    }
    if (!raw) {
      set({ hydrated: true, hasSave: false })
      return
    }
    let parsed: Franchise | null = null
    try {
      parsed = migrate(JSON.parse(raw) as Franchise)
    } catch {
      parsed = null
    }
    if (!parsed) {
      removeSave()
      set({ hydrated: true, hasSave: false })
      return
    }
    cached = parsed
    writeSave(parsed) // persist any migration backfills
    set({ hydrated: true, hasSave: true })
  },

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
      unlimited: false,
      retryTokens: 0,
      ...initSeason(),
    }
    writeSave(f)
    set({ franchise: f, hasSave: true, screen: 'lobby' })
  },

  continueSave: () => {
    if (cached) set({ franchise: cached, screen: 'lobby' })
    else set({ hasSave: false })
  },

  deleteSave: () => {
    removeSave()
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

  enterOffseason: () => {
    const f = get().franchise
    if (!f) return
    if (f.offseason) return // already prepared
    const s = f.seasonState
    const champion = s.alive
    const rank = playerRank({ ...playerEntry(f), w: s.wins, l: s.losses }, f.league)
    const goalMet = s.goal.type === 'playoffs' ? rank <= 4 : s.wins >= s.goal.target
    let failedGoals = goalMet ? 0 : f.failedGoals + 1
    let retryTokens = f.retryTokens ?? 0
    let savedByToken = false

    // A retry token saves your job before a firing.
    if (failedGoals >= 3 && retryTokens > 0) {
      retryTokens -= 1
      failedGoals = 2
      savedByToken = true
    }

    // Repeated failure → fired (run over).
    if (failedGoals >= 3) {
      removeSave()
      set({ franchise: null, hasSave: false, screen: 'menu', pendingEvent: null })
      return
    }

    // Age, grow/decline, retire → Hall of Fame.
    const tenure = { ...f.tenure }
    const hof = [...f.hallOfFame]
    const retired: string[] = []
    const growthChance = 0.35 + f.facilities.training * 0.05
    const setKey = (np: Player, k: keyof Player, d: number) => {
      ;(np as unknown as Record<string, number>)[k as string] = clampN(
        (np as unknown as Record<string, number>)[k as string] + d,
        1,
        10,
      )
    }
    const survivors: Player[] = []
    for (const p of f.roster) {
      tenure[p.id] = (tenure[p.id] ?? 0) + 1
      const np: Player = { ...p, age: p.age + 1 }
      if (np.age <= 25 && Math.random() < growthChance) setKey(np, rndKey(), +1)
      if (np.age >= 31 && Math.random() < 0.5) setKey(np, rndKey(), -1)
      np.salary = salaryFor(np)
      const retire = np.age >= 35 || (np.age >= 32 && Math.random() < 0.35)
      if (retire) {
        hof.push({
          name: np.name,
          pos: np.pos,
          overall: overall(np),
          seasons: tenure[np.id] ?? 1,
          titles: f.titles,
        })
        retired.push(np.name)
        delete tenure[np.id]
      } else {
        survivors.push(np)
      }
    }
    const roster = rebuildRoster(survivors)
    const reward = (goalMet ? 60 : 0) + (champion ? 100 : 0)

    const nf: Franchise = {
      ...f,
      roster,
      tenure,
      hallOfFame: hof,
      titles: f.titles + (champion ? 1 : 0),
      failedGoals,
      retryTokens,
      credits: f.credits + reward,
      fanInterest: clampN(f.fanInterest + (champion ? 12 : goalMet ? 4 : -6), 0, 100),
      offseason: {
        prospects: [genProspect(), genProspect(), genProspect()],
        freeAgents: Array.from({ length: 5 }, genFreeAgent),
        retired,
        drafted: false,
      },
    }
    writeSave(nf)
    set({ franchise: nf, toast: savedByToken ? '🎟️ Retry token saved your job!' : null })
  },

  draftPlayer: (id) => {
    const f = get().franchise
    if (!f || !f.offseason || f.offseason.drafted) return
    const pick = f.offseason.prospects.find((p) => p.id === id)
    if (!pick) return
    const nf: Franchise = {
      ...f,
      roster: [...f.roster, pick],
      offseason: { ...f.offseason, drafted: true },
    }
    writeSave(nf)
    set({ franchise: nf })
    sfx.confirm()
  },

  signFreeAgent: (id) => {
    const f = get().franchise
    if (!f || !f.offseason) return
    const fa = f.offseason.freeAgents.find((p) => p.id === id)
    if (!fa) return
    if (f.roster.length >= ROSTER_MAX || capUsed(f.roster) + fa.salary > SALARY_CAP) {
      sfx.deny()
      return
    }
    const nf: Franchise = {
      ...f,
      roster: [...f.roster, fa],
      offseason: {
        ...f.offseason,
        freeAgents: f.offseason.freeAgents.filter((p) => p.id !== id),
      },
    }
    writeSave(nf)
    set({ franchise: nf })
    sfx.confirm()
  },

  cutPlayer: (id) => {
    const f = get().franchise
    if (!f) return
    if (f.roster.length <= 5) {
      sfx.deny()
      return
    }
    const nf: Franchise = { ...f, roster: f.roster.filter((p) => p.id !== id) }
    writeSave(nf)
    set({ franchise: nf })
    sfx.tap()
  },

  commitNextSeason: () => {
    const f = get().franchise
    if (!f) return
    const roster = rebuildRoster(f.roster)
    const league = generateLeague()
    const nf: Franchise = {
      ...f,
      roster,
      league,
      seasonState: freshSeasonState(league),
      season: f.season + 1,
      offseason: null,
    }
    writeSave(nf)
    set({ franchise: nf })
    sfx.confirm()
  },

  showToast: (msg) => set({ toast: msg }),
  clearToast: () => set({ toast: null }),

  buyCreditsPack: (amount) => {
    const f = get().franchise
    if (!f) return
    const nf = { ...f, credits: f.credits + amount }
    writeSave(nf)
    set({ franchise: nf, toast: `🪙 +${amount} credits` })
    sfx.confirm()
  },

  buyUnlimited: () => {
    const f = get().franchise
    if (!f || f.unlimited) return
    const nf = { ...f, unlimited: true, credits: f.credits + 100 }
    writeSave(nf)
    set({ franchise: nf, toast: '⭐ UNLIMITED unlocked — Team Editor open!' })
    sfx.three()
  },

  watchAdForCredits: () => {
    if (get().storeAd) return
    set({ storeAd: true })
    setTimeout(() => {
      const f = get().franchise
      if (!f) {
        set({ storeAd: false })
        return
      }
      const nf = { ...f, credits: f.credits + 15 }
      writeSave(nf)
      set({ franchise: nf, storeAd: false, toast: '🪙 +15 credits' })
      sfx.confirm()
    }, 2000)
  },

  buyRetryToken: () => {
    const f = get().franchise
    if (!f) return
    const nf = { ...f, retryTokens: (f.retryTokens ?? 0) + 1 }
    writeSave(nf)
    set({ franchise: nf, toast: '🎟️ +1 Retry Token' })
    sfx.confirm()
  },

  editTeam: (input) => {
    const f = get().franchise
    if (!f || !f.unlimited) return
    const nf: Franchise = {
      ...f,
      city: input.city.trim() || f.city,
      teamName: input.teamName.trim() || f.teamName,
      colorPrimary: input.colorPrimary,
      colorSecondary: input.colorSecondary,
    }
    writeSave(nf)
    set({ franchise: nf, toast: '✓ Team updated!' })
    sfx.confirm()
  },

  autosave: () => {
    const f = get().franchise
    if (f) writeSave(f)
  },
}))
