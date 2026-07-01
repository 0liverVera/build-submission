export type Position = 'PG' | 'SG' | 'SF' | 'PF' | 'C'

export interface Player {
  id: string
  name: string
  pos: Position
  /** All ratings 1–10. */
  shooting: number
  speed: number
  inside: number
  defense: number
  age: number
  /** 0–100; drives morale faces and (later) performance. */
  morale: number
  /** Cap hit in cap units (Phase 7). */
  salary: number
}

export interface OffseasonData {
  prospects: Player[]
  freeAgents: Player[]
  retired: string[]
  drafted: boolean
}

export type FacilityKey = 'training' | 'medical' | 'scouting' | 'stadium'
export type Facilities = Record<FacilityKey, number>

export interface LeagueTeam {
  id: string
  city: string
  name: string
  abbr: string
  color: string
  rating: number // ~4–8 team strength
  w: number
  l: number
}

export type GoalType = 'playoffs' | 'wins'
export interface OwnerGoal {
  type: GoalType
  target: number
  label: string
}

export type SeasonPhase = 'regular' | 'playoffs' | 'offseason'
export interface SeasonState {
  phase: SeasonPhase
  game: number // regular-season game index
  schedule: string[] // opponent league-team ids
  wins: number
  losses: number
  goal: OwnerGoal
  playoffRound: number // 0 none, 1 semifinal, 2 final
  alive: boolean // still alive in the playoffs / champion flag at offseason
  lastResult: string // headline for the Season screen
}

export interface HofPlayer {
  name: string
  pos: Position
  overall: number
  seasons: number
  titles: number
}

export interface Franchise {
  coachName: string
  city: string
  teamName: string
  colorPrimary: string
  colorSecondary: string
  credits: number
  season: number
  wins: number
  losses: number
  createdAt: number
  /** First 5 are the starters (PG,SG,SF,PF,C); the rest are bench. */
  roster: Player[]
  /** Facility levels 1–5. */
  facilities: Facilities
  /** 0–100; raises credit income and reflects the fanbase. */
  fanInterest: number
  // --- Season / dynasty (Phase 6) ---
  league: LeagueTeam[]
  seasonState: SeasonState
  hallOfFame: HofPlayer[]
  failedGoals: number
  titles: number
  /** Per-player seasons played, keyed by player id (for HoF legacy). */
  tenure: Record<string, number>
  /** Active offseason draft/FA pools (Phase 7); cleared on new season. */
  offseason?: OffseasonData | null
  // --- Monetization (Phase 10, all mock) ---
  unlimited?: boolean
  retryTokens?: number
}

export type Screen =
  | 'menu'
  | 'newFranchise'
  | 'hub'
  | 'lobby'
  | 'game'
  | 'season'
  | 'offseason'
  | 'roster'
  | 'frontoffice'
  | 'press'
  | 'store'
  | 'teameditor'
  | 'animtest'
