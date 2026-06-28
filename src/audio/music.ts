/**
 * Original chiptune music via Web Audio — no files, fully offline.
 * A small lookahead step-sequencer plays a mellow MENU loop and a driving
 * IN-GAME loop (Section 7). Note values are MIDI numbers (0 = rest).
 */
import { getCtx } from './audioctx'

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12)

interface Track {
  bpm: number
  lead: number[]
  bass: number[]
  leadType: OscillatorType
  bassType: OscillatorType
}

// A-minor, calm.
const MENU: Track = {
  bpm: 96,
  leadType: 'triangle',
  bassType: 'sine',
  lead: [76, 0, 72, 0, 74, 0, 72, 0, 69, 0, 72, 0, 76, 0, 74, 0],
  bass: [45, 0, 45, 0, 40, 0, 40, 0, 41, 0, 41, 0, 40, 0, 40, 0],
}

// Driving, energetic.
const GAME: Track = {
  bpm: 140,
  leadType: 'square',
  bassType: 'triangle',
  lead: [69, 72, 76, 72, 74, 77, 74, 72, 69, 72, 76, 79, 77, 76, 74, 72],
  bass: [33, 33, 40, 40, 41, 41, 40, 40, 33, 33, 45, 45, 40, 40, 40, 40],
}

const TRACKS: Record<'menu' | 'game', Track> = { menu: MENU, game: GAME }
const MASTER_VOL = 0.32
const LOOKAHEAD = 0.12
const INTERVAL = 30

let master: GainNode | null = null
let timer: number | null = null
let current: 'menu' | 'game' | null = null
let step = 0
let nextTime = 0
let muted = false

function ensure(): AudioContext | null {
  const ctx = getCtx()
  if (!ctx) return null
  if (!master) {
    master = ctx.createGain()
    master.gain.value = muted ? 0 : MASTER_VOL
    master.connect(ctx.destination)
  }
  return ctx
}

function voice(ctx: AudioContext, time: number, n: number, type: OscillatorType, dur: number, gain: number) {
  if (n <= 0 || !master) return
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = type
  o.frequency.value = midi(n)
  g.gain.setValueAtTime(0.0001, time)
  g.gain.exponentialRampToValueAtTime(gain, time + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur)
  o.connect(g).connect(master)
  o.start(time)
  o.stop(time + dur + 0.02)
}

function tick() {
  const ctx = getCtx()
  if (!ctx || !current) return
  if (ctx.state !== 'running') {
    nextTime = ctx.currentTime + 0.05
    return
  }
  const t = TRACKS[current]
  const stepDur = 60 / t.bpm / 2 // eighth notes
  while (nextTime < ctx.currentTime + LOOKAHEAD) {
    const li = t.lead[step % t.lead.length]
    const bi = t.bass[step % t.bass.length]
    voice(ctx, nextTime, li, t.leadType, stepDur * 0.85, 0.05)
    voice(ctx, nextTime, bi, t.bassType, stepDur * 0.95, 0.07)
    step += 1
    nextTime += stepDur
  }
}

export function playTrack(track: 'menu' | 'game') {
  const ctx = ensure()
  if (!ctx) return
  if (current !== track) {
    current = track
    step = 0
    nextTime = ctx.currentTime + 0.06
  }
  if (timer == null) timer = window.setInterval(tick, INTERVAL)
}

export function setMusicMuted(m: boolean) {
  muted = m
  if (master) master.gain.value = m ? 0 : MASTER_VOL
}

export function isMuted() {
  return muted
}
