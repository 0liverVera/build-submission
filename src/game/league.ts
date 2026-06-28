import type { LeagueTeam, OwnerGoal, SeasonState } from '../types'

const POOL = [
  { city: 'Bayview', name: 'Sharks', abbr: 'BAY', color: '#3a7be8' },
  { city: 'Sunport', name: 'Comets', abbr: 'SUN', color: '#ff8a3d' },
  { city: 'Ironcliff', name: 'Miners', abbr: 'IRO', color: '#9aa3c7' },
  { city: 'Lakeside', name: 'Surge', abbr: 'LAK', color: '#2dd4bf' },
  { city: 'Westend', name: 'Wolves', abbr: 'WES', color: '#b86bff' },
  { city: 'Kingsbury', name: 'Royals', abbr: 'KIN', color: '#ffcf4a' },
  { city: 'Northgate', name: 'Vipers', abbr: 'NOR', color: '#56c06a' },
  { city: 'Granite', name: 'Bolts', abbr: 'GRA', color: '#e8503a' },
]

const rRange = (min: number, max: number) =>
  Math.round(min + Math.random() * (max - min))
function shuffle<T>(a: T[]): T[] {
  const r = [...a]
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[r[i], r[j]] = [r[j], r[i]]
  }
  return r
}

let _tid = 0
export function generateLeague(): LeagueTeam[] {
  return shuffle(POOL)
    .slice(0, 5)
    .map((t) => ({
      ...t,
      id: 't' + Date.now().toString(36) + (_tid++).toString(36),
      rating: rRange(4, 8),
      w: 0,
      l: 0,
    }))
}

/** 6-game regular season: each rival once, plus one rematch. */
export function generateSchedule(league: LeagueTeam[]): string[] {
  const ids = league.map((t) => t.id)
  const sched = shuffle(ids)
  sched.push(ids[Math.floor(Math.random() * ids.length)])
  return sched
}

export function generateGoal(): OwnerGoal {
  if (Math.random() < 0.5) {
    return { type: 'playoffs', target: 4, label: 'Make the Playoffs' }
  }
  return { type: 'wins', target: 4, label: 'Win 4+ games' }
}

export function freshSeasonState(league: LeagueTeam[]): SeasonState {
  return {
    phase: 'regular',
    game: 0,
    schedule: generateSchedule(league),
    wins: 0,
    losses: 0,
    goal: generateGoal(),
    playoffRound: 0,
    alive: false,
    lastResult: '',
  }
}

const winProb = (a: number, b: number) =>
  Math.max(0.12, Math.min(0.88, 0.5 + (a - b) * 0.06))

/** Sim one game for each AI team vs a random rival (keeps standings moving). */
export function simLeagueRound(league: LeagueTeam[]): LeagueTeam[] {
  return league.map((t) => {
    const others = league.filter((o) => o.id !== t.id)
    const opp = others[Math.floor(Math.random() * others.length)]
    const win = Math.random() < winProb(t.rating, opp.rating)
    return { ...t, w: t.w + (win ? 1 : 0), l: t.l + (win ? 0 : 1) }
  })
}

export interface StandingRow {
  abbr: string
  name: string
  color: string
  w: number
  l: number
  isPlayer: boolean
}

export function standings(
  player: { abbr: string; name: string; color: string; w: number; l: number },
  league: LeagueTeam[],
): StandingRow[] {
  const rows: StandingRow[] = [
    { ...player, isPlayer: true },
    ...league.map((t) => ({
      abbr: t.abbr,
      name: t.name,
      color: t.color,
      w: t.w,
      l: t.l,
      isPlayer: false,
    })),
  ]
  const pct = (r: StandingRow) => (r.w + r.l ? r.w / (r.w + r.l) : 0)
  return rows.sort((a, b) => pct(b) - pct(a) || b.w - a.w)
}

/** Rank of the player (1-based) in the current standings. */
export function playerRank(
  player: { abbr: string; name: string; color: string; w: number; l: number },
  league: LeagueTeam[],
): number {
  return standings(player, league).findIndex((r) => r.isPlayer) + 1
}
