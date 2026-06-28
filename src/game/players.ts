import type { Player, Position } from '../types'

const FIRST = [
  'Marcus', 'DeShawn', 'Tyrese', 'Andre', 'Cole', 'Jaylen', 'Rashad', 'Trey',
  'Devin', 'Malik', 'Quincy', 'Brock', 'Elias', 'Nikolai', 'Diego', 'Omar',
  'Kai', 'Zion', 'Tobias', 'Lorenzo', 'Hassan', 'Pavel', 'Jrue', 'Bo',
]
const LAST = [
  'Carter', 'Booker', 'Vance', 'Holloway', 'Reyes', 'Okafor', 'Petrov', 'Nash',
  'Sloan', 'Briggs', 'Mensah', 'Caldwell', 'Ferro', 'Dalton', 'Iverson', 'Pope',
  'Reed', 'Salazar', 'Whitfield', 'Donovan', 'Amari', 'Kessler', 'Yates', 'Drake',
]

export const POSITIONS: Position[] = ['PG', 'SG', 'SF', 'PF', 'C']

const rnd = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]
const rRange = (min: number, max: number) =>
  Math.round(min + Math.random() * (max - min))
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

let _pid = 0
const newId = () => 'p' + Date.now().toString(36) + (_pid++).toString(36)

// Rating tendencies by position (guards shoot/run, bigs score inside/defend).
const ARCH: Record<Position, { sh: number; sp: number; in: number; de: number }> = {
  PG: { sh: 6, sp: 8, in: 3, de: 5 },
  SG: { sh: 8, sp: 7, in: 4, de: 5 },
  SF: { sh: 6, sp: 6, in: 6, de: 6 },
  PF: { sh: 4, sp: 4, in: 7, de: 7 },
  C: { sh: 3, sp: 3, in: 8, de: 8 },
}

export function genPlayer(pos: Position): Player {
  const a = ARCH[pos]
  const j = (base: number) => clamp(base + rRange(-2, 2), 1, 10)
  return {
    id: newId(),
    name: `${rnd(FIRST)} ${rnd(LAST)}`,
    pos,
    shooting: j(a.sh),
    speed: j(a.sp),
    inside: j(a.in),
    defense: j(a.de),
    age: rRange(20, 33),
    morale: rRange(58, 86),
  }
}

export function generateRoster(): Player[] {
  const starters = POSITIONS.map((p) => genPlayer(p))
  const benchCount = 3 + Math.floor(Math.random() * 2) // 3–4
  const bench = Array.from({ length: benchCount }, () => genPlayer(rnd(POSITIONS)))
  return [...starters, ...bench]
}

export function overall(p: Player): number {
  return Math.round((p.shooting + p.speed + p.inside + p.defense) / 4)
}

export function moraleFace(m: number): string {
  return m >= 70 ? '😀' : m >= 45 ? '😐' : '😟'
}

export function teamDefense(roster: Player[]): number {
  const starters = roster.slice(0, 5)
  if (!starters.length) return 5
  return starters.reduce((s, p) => s + p.defense, 0) / starters.length
}
