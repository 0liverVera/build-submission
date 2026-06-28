/**
 * Lightweight synthesized SFX via Web Audio — no audio files, fully offline.
 * Richer SFX + Howler.js music loops are wired up in the audio/juice phases.
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
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur)
  g.gain.setValueAtTime(gain, t0)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  o.connect(g).connect(c.destination)
  o.start(t0)
  o.stop(t0 + dur + 0.02)
}

export const sfx = {
  tap() {
    tone({ freq: 520, dur: 0.05, type: 'square', gain: 0.06, slideTo: 720 })
  },
  confirm() {
    tone({ freq: 440, dur: 0.09, type: 'triangle', gain: 0.1 })
    tone({ freq: 660, dur: 0.12, type: 'triangle', gain: 0.08, delay: 0.08 })
  },
}
