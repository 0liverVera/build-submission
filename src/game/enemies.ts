import type { UnitType, Level } from './types'
import { UNIT_TYPES } from './units'

export interface EnemySeed {
  type: UnitType
  level: Level
  boss?: boolean
}

export function isBossWave(wave: number): boolean {
  return wave % 5 === 0
}

const randType = () => UNIT_TYPES[Math.floor(Math.random() * UNIT_TYPES.length)]

/**
 * Escalating enemy team for a wave. Normal waves grow in count and unit level;
 * every 5th wave is a boss wave (one oversized champion + a few adds).
 */
export function generateEnemyTeam(wave: number): EnemySeed[] {
  if (isBossWave(wave)) return generateBossWave(wave)

  const count = Math.min(2 + Math.ceil(wave * 0.7), 9)
  const lvl2Chance = Math.min(0.1 + wave * 0.06, 0.7)
  const lvl3Chance = wave >= 8 ? Math.min((wave - 8) * 0.04, 0.3) : 0

  const out: EnemySeed[] = []
  for (let i = 0; i < count; i++) {
    const r = Math.random()
    let level: Level = 1
    if (r < lvl3Chance) level = 3
    else if (r < lvl3Chance + lvl2Chance) level = 2
    out.push({ type: randType(), level })
  }
  return out
}

function generateBossWave(wave: number): EnemySeed[] {
  const out: EnemySeed[] = [{ type: 'brute', level: 3, boss: true }]
  const adds = Math.min(2 + Math.floor(wave / 5), 5)
  const addLevel: Level = wave >= 10 ? 2 : 1
  for (let i = 0; i < adds; i++) {
    out.push({ type: randType(), level: addLevel })
  }
  return out
}
