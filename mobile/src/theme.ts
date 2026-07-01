/** Hoop Dynasty palette + type tokens, ported from the web :root variables. */
export const C = {
  bg: '#14182b',
  bg2: '#1f2540',
  panel: '#262c4a',
  panel2: '#2f3658',
  line: '#3a4170',
  orange: '#ff8a3d',
  orangeDeep: '#d9641a',
  teal: '#2dd4bf',
  gold: '#ffcf4a',
  goldDeep: '#9c6b14',
  cream: '#fdf6e3',
  muted: '#9aa3c7',
  ink: '#0b0e1c',
  danger: '#e8503a',
} as const

/** Loaded by expo-font in App.tsx; falls back to monospace until ready. */
export const PIXEL = 'PressStart2P_400Regular'

/** Pixel-font helper — keeps letter-spacing/line-height consistent. */
export const pixel = (size: number, color: string = C.cream) => ({
  fontFamily: PIXEL,
  fontSize: size,
  color,
})

/* ============================================================================
 * PREMIUM UI SYSTEM (Supercell-style) — single source of truth.
 * Curated high-contrast sporty palette, soft shapes, layered depth.
 * ==========================================================================*/

export const T = {
  // accents
  amber: '#E8A33D',
  amberDeep: '#B87420',
  gold: '#F2C94C',
  goldDeep: '#C99A1E',
  // teams
  teamA: '#2D9CDB',
  teamADeep: '#1B6FA8',
  teamB: '#EB5757',
  teamBDeep: '#B23B3B',
  // surfaces
  panel: '#1B2A4A',
  panelRaised: '#27395E',
  panelDeep: '#12203C',
  line: '#3A5183',
  // status / text
  green: '#27AE60',
  greenDeep: '#1C8049',
  white: '#FFFFFF',
  ink: '#0E1B33',
  muted: '#9FB2D6',
  // background gradient stops
  bgTop: '#2A3E68',
  bgMid: '#1B2A4A',
  bgBottom: '#0C1730',
} as const

/** Corner radii — everything soft-cornered. */
export const R = { sm: 12, md: 20, lg: 28, pill: 999 } as const

/** Spacing scale. */
export const SP = { xs: 8, sm: 12, md: 16, lg: 24, xl: 32, xxl: 44 } as const

/** Baloo 2 weights (loaded in App.tsx). */
export const FONT = {
  black: 'Baloo2_800ExtraBold',
  bold: 'Baloo2_700Bold',
  semi: 'Baloo2_600SemiBold',
  medium: 'Baloo2_500Medium',
  regular: 'Baloo2_400Regular',
} as const

/** Thick dark outline + soft shadow for headings/numbers (RN can't stroke text). */
export const OUTLINE = {
  textShadowColor: T.ink,
  textShadowOffset: { width: 0, height: 2 },
  textShadowRadius: 3,
} as const

/** Layered "candy" shadow for panels/buttons. */
export const SHADOW = {
  shadowColor: '#000',
  shadowOpacity: 0.35,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 6 },
  elevation: 8,
} as const
