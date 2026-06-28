// Mock monetization catalog (Section 6). NOTHING here processes real money or
// collects any info — "buying" simply grants the item so the model can demo.

export interface GemPack {
  id: string
  name: string
  gems: number
  price: string
  tag?: string
  bonus?: string
}

export const GEM_PACKS: GemPack[] = [
  { id: 'small', name: 'Handful', gems: 100, price: '$1.99' },
  { id: 'med', name: 'Sack of Gems', gems: 550, price: '$4.99', tag: 'POPULAR', bonus: '+10%' },
  { id: 'large', name: 'Royal Chest', gems: 1200, price: '$9.99', tag: 'BEST VALUE', bonus: '+20%' },
]

export interface SkinDef {
  id: string
  name: string
  /** Player base-disc color + subtle emissive glow applied to units. */
  base: string
  emissive: string
  gemCost: number
}

export const SKINS: SkinDef[] = [
  { id: 'classic', name: 'Classic Blue', base: '#3a7be8', emissive: '#0a1a3a', gemCost: 0 },
  { id: 'golden', name: 'Golden Legion', base: '#ffd54a', emissive: '#7a5210', gemCost: 250 },
  { id: 'crimson', name: 'Crimson Guard', base: '#e8503a', emissive: '#5a1208', gemCost: 250 },
  { id: 'shadow', name: 'Shadow Order', base: '#8b5cf6', emissive: '#3a1080', gemCost: 400 },
]

export function skinById(id: string): SkinDef {
  return SKINS.find((s) => s.id === id) ?? SKINS[0]
}

export const CHAMPION_PACK = { gems: 500, price: '$4.99', skin: 'golden' }
export const REVIVE_COST = 50
export const AD_COINS = 10
export const REMOVE_ADS_PRICE = '$2.99'
