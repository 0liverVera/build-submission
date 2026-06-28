export type ModifierId = 'none' | 'spikes' | 'blessing' | 'lion' | 'bloodmoon'

export interface ModifierDef {
  id: ModifierId
  name: string
  desc: string
  icon: string
  color: string
}

export const MODIFIERS: Record<ModifierId, ModifierDef> = {
  none: {
    id: 'none',
    name: 'Fair Fight',
    desc: 'No arena effect this round.',
    icon: '⚖️',
    color: '#6b4226',
  },
  spikes: {
    id: 'spikes',
    name: 'Spiked Floor',
    desc: 'Melee units bleed HP every second.',
    icon: '🔺',
    color: '#c0743a',
  },
  blessing: {
    id: 'blessing',
    name: 'Blessing of the Gods',
    desc: 'Ranged units deal +30% damage.',
    icon: '✨',
    color: '#e6b73e',
  },
  lion: {
    id: 'lion',
    name: 'The Lion',
    desc: 'A wild lion roams and mauls the nearest fighter.',
    icon: '🦁',
    color: '#e0a64b',
  },
  bloodmoon: {
    id: 'bloodmoon',
    name: 'Blood Moon',
    desc: 'Everyone: +25% damage, −25% HP.',
    icon: '🌕',
    color: '#b03a4a',
  },
}

const ACTIVE: ModifierId[] = ['spikes', 'blessing', 'lion', 'bloodmoon']

export function rollModifierId(): ModifierId {
  return ACTIVE[Math.floor(Math.random() * ACTIVE.length)]
}
