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
}

export type FacilityKey = 'training' | 'medical' | 'scouting' | 'stadium'
export type Facilities = Record<FacilityKey, number>

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
}

export type Screen =
  | 'menu'
  | 'newFranchise'
  | 'hub'
  | 'game'
  | 'roster'
  | 'frontoffice'
  | 'press'
  | 'store'
