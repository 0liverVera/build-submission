export type UnitType =
  | 'brute'
  | 'legionnaire'
  | 'archer'
  | 'spearman'
  | 'priestess'

export type Level = 1 | 2 | 3

export interface UnitInstance {
  id: string
  type: UnitType
  level: Level
}

export type Area = 'board' | 'bench'

export interface SlotRef {
  area: Area
  index: number
}
