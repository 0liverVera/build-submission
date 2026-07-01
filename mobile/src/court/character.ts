import type { Position } from '../types'

// ============================================================================
// Step 1 — CharacterAppearance data model. These option lists are the ONLY
// allowed values; an appearance object fully determines how a character looks.
// ============================================================================

export const SKIN_TONES = ['#F2C9A0', '#E0AC85', '#C68642', '#9A5E32', '#6F4421'] as const

export const HAIR_STYLES = ['bald', 'buzz', 'short', 'flattop', 'curly', 'afro', 'long', 'ponytail'] as const

export const HAIR_COLORS = [
  '#1A1A1A', // black
  '#4A2C12', // dark brown
  '#8B5A2B', // brown
  '#C9952B', // blonde
  '#9A9A9A', // grey
  '#B33A2B', // auburn
] as const

export const ACCESSORIES = ['none', 'headband', 'glasses', 'beard'] as const

// build → overall height scale
export const BUILDS = { small: 0.9, medium: 1.0, tall: 1.12 } as const

export type HairStyle = (typeof HAIR_STYLES)[number]
export type Accessory = (typeof ACCESSORIES)[number]
export type Build = keyof typeof BUILDS

export interface CharacterAppearance {
  skinTone: string
  hairStyle: HairStyle
  hairColor: string
  accessory: Accessory
  build: Build
  jerseyColor: string // provided by the team, never invented here
  number: number // the player's roster number
}

// ============================================================================
// Deterministic choice helpers — a small seeded PRNG so a given id ALWAYS maps
// to the same look across games/sessions (never random per frame or per match).
// ============================================================================

function hashStr(s: string): number {
  let h = 1779033703 ^ s.length
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = <T>(rng: () => number, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)]

/**
 * Build a deterministic appearance from a stable player id. The same id +
 * team color + number always yields an identical character.
 */
export function appearanceFromId(
  id: string,
  opts: { jerseyColor: string; number: number; pos?: Position },
): CharacterAppearance {
  const rng = mulberry32(hashStr(id))
  // draw in a fixed order so adding a field later doesn't reshuffle earlier ones
  const skinTone = pick(rng, SKIN_TONES)
  const hairStyle = pick(rng, HAIR_STYLES)
  const hairColor = pick(rng, HAIR_COLORS)

  // Most players have no accessory; a minority get one.
  const ar = rng()
  const accessory: Accessory = ar < 0.68 ? 'none' : ar < 0.8 ? 'headband' : ar < 0.9 ? 'glasses' : 'beard'

  // Build leans on position: Centers tend tall, Point Guards tend small.
  const br = rng()
  let build: Build
  if (opts.pos === 'C') build = br < 0.7 ? 'tall' : 'medium'
  else if (opts.pos === 'PF') build = br < 0.5 ? 'tall' : br < 0.85 ? 'medium' : 'small'
  else if (opts.pos === 'PG') build = br < 0.7 ? 'small' : 'medium'
  else if (opts.pos === 'SG') build = br < 0.55 ? 'small' : 'medium'
  else build = br < 0.25 ? 'small' : br < 0.8 ? 'medium' : 'tall'

  return { skinTone, hairStyle, hairColor, accessory, build, jerseyColor: opts.jerseyColor, number: opts.number }
}

/** Random appearance for the preview screen only (varies every mount). */
export function randomAppearance(seed: number, jerseyColor: string, number: number): CharacterAppearance {
  return appearanceFromId(`preview-${seed}`, { jerseyColor, number })
}
