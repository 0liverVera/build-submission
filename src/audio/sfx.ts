/**
 * Synthesized SFX via Web Audio — no audio files, fully offline.
 * Howler.js music loops get layered in during the audio/juice phases.
 */
let ctx: AudioContext | null = null
function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const C =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    if (!C) return null
    ctx = new C()
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

interface ToneOpts {
  freq: number
  dur: number
  type?: OscillatorType
  gain?: number
  slideTo?: number
  delay?: number
}
function tone({ freq, dur, type = 'triangle', gain = 0.1, slideTo, delay = 0 }: ToneOpts) {
  const c = ac()
  if (!c) return
  const t0 = c.currentTime + delay
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t0)
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur)
  g.gain.setValueAtTime(gain, t0)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  o.connect(g).connect(c.destination)
  o.start(t0)
  o.stop(t0 + dur + 0.02)
}

interface NoiseOpts {
  dur: number
  type?: BiquadFilterType
  freq?: number
  sweepTo?: number
  q?: number
  gain?: number
  attack?: number
}
function noise({ dur, type = 'bandpass', freq = 1000, sweepTo, q = 1, gain = 0.15, attack = 0.01 }: NoiseOpts) {
  const c = ac()
  if (!c) return
  const t0 = c.currentTime
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  const src = c.createBufferSource()
  src.buffer = buf
  const f = c.createBiquadFilter()
  f.type = type
  f.frequency.setValueAtTime(freq, t0)
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(1, sweepTo), t0 + dur)
  f.Q.value = q
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  src.connect(f).connect(g).connect(c.destination)
  src.start(t0)
  src.stop(t0 + dur + 0.02)
}

function crowd(intensity = 1) {
  noise({
    dur: 0.4 * intensity,
    type: 'bandpass',
    freq: 760,
    q: 0.5,
    gain: 0.1 * intensity,
    attack: 0.06,
  })
}

export const sfx = {
  tap() {
    tone({ freq: 520, dur: 0.05, type: 'square', gain: 0.06, slideTo: 720 })
  },
  confirm() {
    tone({ freq: 440, dur: 0.09, type: 'triangle', gain: 0.1 })
    tone({ freq: 660, dur: 0.12, type: 'triangle', gain: 0.08, delay: 0.08 })
  },
  dribble() {
    tone({ freq: 150, dur: 0.06, type: 'sine', gain: 0.1, slideTo: 90 })
  },
  pass() {
    tone({ freq: 360, dur: 0.05, type: 'square', gain: 0.07, slideTo: 540 })
  },
  shoot() {
    noise({ dur: 0.16, type: 'highpass', freq: 500, sweepTo: 2000, gain: 0.05 })
  },
  swish() {
    noise({ dur: 0.22, type: 'bandpass', freq: 3600, sweepTo: 1100, q: 0.8, gain: 0.13 })
  },
  rim() {
    tone({ freq: 200, dur: 0.12, type: 'square', gain: 0.1, slideTo: 150 })
    tone({ freq: 260, dur: 0.1, type: 'square', gain: 0.07, slideTo: 200, delay: 0.02 })
  },
  make() {
    tone({ freq: 880, dur: 0.07, type: 'triangle', gain: 0.1 })
    crowd(1)
  },
  three() {
    tone({ freq: 660, dur: 0.08, type: 'triangle', gain: 0.11 })
    tone({ freq: 990, dur: 0.12, type: 'triangle', gain: 0.09, delay: 0.07 })
    crowd(1.6)
  },
  dunk() {
    tone({ freq: 80, dur: 0.26, type: 'sine', gain: 0.22, slideTo: 45 })
    crowd(1.8)
  },
  miss() {
    tone({ freq: 160, dur: 0.16, type: 'sawtooth', gain: 0.08, slideTo: 80 })
    noise({ dur: 0.35, type: 'lowpass', freq: 500, gain: 0.05, attack: 0.08 })
  },
  block() {
    tone({ freq: 120, dur: 0.14, type: 'square', gain: 0.14, slideTo: 70 })
    crowd(1.2)
  },
  buzzer() {
    tone({ freq: 170, dur: 0.5, type: 'square', gain: 0.14, slideTo: 150 })
  },
  deny() {
    tone({ freq: 200, dur: 0.16, type: 'sawtooth', gain: 0.1, slideTo: 110 })
  },
}
