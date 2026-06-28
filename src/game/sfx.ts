/**
 * Tiny synthesized sound effects via the Web Audio API — no audio files, so it
 * stays fully offline and copyright-free. Howler.js + richer SFX land in the
 * Phase 7 juice pass; these are punchy placeholders so actions feel responsive.
 */

let ctx: AudioContext | null = null
function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
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

function tone({ freq, dur, type = 'sine', gain = 0.2, slideTo, delay = 0 }: ToneOpts) {
  const c = audio()
  if (!c) return
  const t0 = c.currentTime + delay
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur)
  g.gain.setValueAtTime(gain, t0)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g).connect(c.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

export const sfx = {
  pick() {
    tone({ freq: 440, dur: 0.06, type: 'triangle', gain: 0.1 })
  },
  drop() {
    tone({ freq: 280, dur: 0.08, type: 'sine', gain: 0.12 })
  },
  merge() {
    // bright rising ping + a low thump = satisfying "combine" pop
    tone({ freq: 300, dur: 0.18, type: 'square', gain: 0.14, slideTo: 760 })
    tone({ freq: 110, dur: 0.26, type: 'sine', gain: 0.22, slideTo: 70 })
    tone({ freq: 900, dur: 0.12, type: 'triangle', gain: 0.08, delay: 0.04 })
  },
}
