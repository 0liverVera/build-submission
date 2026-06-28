import type { UnitType } from './types'

export type Role = 'Tank' | 'Bruiser' | 'Ranged' | 'Anti-tank' | 'Support'

export interface UnitDef {
  type: UnitType
  name: string
  role: Role
  /** Base Lv1 stats. Lv2 ≈ 2.2×, Lv3 ≈ 5× (applied where used). Tuned in Phase 10. */
  hp: number
  dmg: number
  /** Attack range in world units. Melee ≈ 1.4, short ≈ 2.4, ranged ≈ 4.5. */
  range: number
  /** Shop cost in coins (used from Phase 3). */
  cost: number
}

export const UNIT_DEFS: Record<UnitType, UnitDef> = {
  brute: { type: 'brute', name: 'Brute', role: 'Tank', hp: 320, dmg: 14, range: 1.4, cost: 3 },
  legionnaire: { type: 'legionnaire', name: 'Legionnaire', role: 'Bruiser', hp: 180, dmg: 26, range: 1.4, cost: 3 },
  archer: { type: 'archer', name: 'Archer', role: 'Ranged', hp: 95, dmg: 30, range: 4.8, cost: 3 },
  spearman: { type: 'spearman', name: 'Spearman', role: 'Anti-tank', hp: 150, dmg: 38, range: 2.4, cost: 3 },
  priestess: { type: 'priestess', name: 'Priestess', role: 'Support', hp: 110, dmg: 0, range: 4.5, cost: 3 },
}

export const UNIT_TYPES: UnitType[] = [
  'brute',
  'legionnaire',
  'archer',
  'spearman',
  'priestess',
]
