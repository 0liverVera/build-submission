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
}

export type Screen =
  | 'menu'
  | 'newFranchise'
  | 'hub'
  | 'game'
  | 'roster'
  | 'frontoffice'
  | 'store'
