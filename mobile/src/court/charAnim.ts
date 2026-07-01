// ============================================================================
// Procedural character animation core.
// `computePose(state, t, opts)` is a PURE function: given an animation state, a
// phase clock `t` (seconds), and movement speed/facing, it returns a Pose — the
// rotation (around each part's pivot), root offset, and squash/stretch for every
// part. The renderer (Character.tsx) just applies the Pose. No sprite sheets.
// ============================================================================

export type AnimState =
  | 'idle'
  | 'walk'
  | 'run'
  | 'dribble'
  | 'shoot'
  | 'jump'
  | 'dunk'
  | 'pass'
  | 'land'
  | 'steal'

// Local drawing space (viewBox). All anchors/pivots live here so the animator and
// the renderer agree on where the shoulder/hip/neck pivots are.
export const ANCHOR = {
  VBW: 100,
  VBH: 152,
  CX: 50,
  FEET_Y: 138,
  HEAD_CY: 38,
  HEAD_R: 20,
  NECK_Y: 58, // head pivots here
  SHOULDER_Y: 66,
  SH_L: 32, // left shoulder pivot
  SH_R: 68, // right shoulder pivot
  HIP_Y: 98,
  HIP_L: 42, // left hip pivot
  HIP_R: 58, // right hip pivot
  ANKLE_Y: 126,
  SHOE_Y: 131,
  HAND_Y: 92,
} as const

// Body height used for amplitude fractions (head-top → feet).
export const BH = ANCHOR.FEET_Y - 18

export interface Pose {
  rootDY: number // px; negative = airborne (up)
  bodyScaleX: number
  bodyScaleY: number
  lean: number // deg, whole-body lean (pivots at hips)
  head: number // deg at neck
  leftArm: number // deg at shoulder (positive = swing toward facing-forward)
  rightArm: number
  leftLeg: number // deg at hip
  rightLeg: number
  ballVisible: boolean
  ballX: number // local coords
  ballY: number
  shadowScale: number
  shadowOpacity: number
  facing: 1 | -1 // horizontal mirror
}

// Which states loop vs play once; durations are cycle period (loop) or total (one-shot).
export const ONESHOT: Record<AnimState, boolean> = {
  idle: false,
  walk: false,
  run: false,
  dribble: false,
  shoot: true,
  jump: true,
  dunk: true,
  pass: true,
  land: true,
  steal: true,
}
export const DURATION: Record<AnimState, number> = {
  idle: 1.5,
  walk: 1,
  run: 1,
  dribble: 0.52,
  shoot: 0.6,
  jump: 0.85,
  dunk: 0.95,
  pass: 0.35,
  land: 0.25,
  steal: 0.5,
}

const TAU = Math.PI * 2
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
export const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2)
export const easeOutBack = (x: number) => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2)
}
const lerp = (a: number, b: number, k: number) => a + (b - a) * k

export function restPose(): Pose {
  return {
    rootDY: 0,
    bodyScaleX: 1,
    bodyScaleY: 1,
    lean: 0,
    head: 0,
    leftArm: 6,
    rightArm: -6,
    leftLeg: 0,
    rightLeg: 0,
    ballVisible: false,
    ballX: ANCHOR.CX + 17,
    ballY: ANCHOR.FEET_Y - 8,
    shadowScale: 1,
    shadowOpacity: 0.24,
    facing: 1,
  }
}

// shadow shrinks + lightens with airborne height (rootDY is negative when up)
function applyShadow(p: Pose) {
  const lift = Math.max(0, -p.rootDY) / (0.3 * BH) // 0..1-ish
  p.shadowScale = clamp(1 - lift * 0.55, 0.4, 1)
  p.shadowOpacity = clamp(0.24 * (1 - lift * 0.7), 0.05, 0.24)
}

export type PassKind = 'short' | 'chest' | 'long'
export interface PoseOpts {
  speed?: number // 0..1, drives walk/run cadence
  facing?: 1 | -1
  passKind?: PassKind // distance bucket for the 'pass' animation
}

export function computePose(state: AnimState, t: number, opts: PoseOpts = {}): Pose {
  const speed = clamp(opts.speed ?? 1, 0.12, 1)
  const p = restPose()

  switch (state) {
    case 'idle': {
      const ph = (t / DURATION.idle) * TAU
      p.rootDY = Math.sin(ph) * 0.02 * BH
      p.bodyScaleY = 1 + Math.sin(ph) * 0.015
      p.bodyScaleX = 1 - Math.sin(ph) * 0.01
      p.leftArm = 6 + Math.sin(ph * 1.1) * 3
      p.rightArm = -6 - Math.sin(ph * 1.1) * 3
      p.head = Math.sin(ph * 0.5) * 2
      break
    }
    case 'walk':
    case 'run': {
      const isRun = state === 'run'
      const legAmp = isRun ? 35 : 20
      const armAmp = isRun ? 30 : 15
      const bob = (isRun ? 0.05 : 0.03) * BH
      const lean = isRun ? 12 : 5
      const freq = (isRun ? 2.1 : 1.5) * (0.55 + speed * 0.65)
      const ph = t * freq * TAU
      const s = Math.sin(ph)
      p.leftLeg = s * legAmp
      p.rightLeg = -s * legAmp
      p.leftArm = -s * armAmp // arms oppose legs
      p.rightArm = s * armAmp
      // body bobs at 2× leg frequency; a footfall squash on each plant
      p.rootDY = -Math.abs(Math.sin(ph)) * bob
      const foot = Math.abs(Math.cos(ph))
      p.bodyScaleY = 1 - (1 - foot) * (isRun ? 0.06 : 0.03)
      p.bodyScaleX = 1 + (1 - foot) * (isRun ? 0.05 : 0.025)
      p.lean = lean
      if (isRun) {
        p.leftArm *= 1 // arms already bigger; (bend handled by render rest pose)
      }
      break
    }
    case 'dribble': {
      const period = DURATION.dribble
      const u = (t % period) / period // 0..1
      const arch = Math.sin(u * Math.PI) // 0 at hand, 1 at floor
      p.bodyScaleY = 0.96
      p.bodyScaleX = 1.02
      // ball bounces ~0.3 BH to the side, between hand height and the floor
      const handY = ANCHOR.HAND_Y
      const floorY = ANCHOR.FEET_Y - 5
      p.ballVisible = true
      p.ballX = ANCHOR.CX + 24
      p.ballY = lerp(handY, floorY, arch)
      // ball-side (right) arm pushes down as the ball drops, rises as it returns —
      // calmer swing so the dribble reads smooth, not busy
      p.rightArm = -8 - arch * 22
      p.leftArm = 9
      // subtle bob in rhythm + small leg shuffle when moving
      const ph = (t / period) * TAU
      p.rootDY = -Math.abs(Math.sin(ph)) * 0.02 * BH
      if (speed > 0.2) {
        const sh = Math.sin(t * 3 * TAU)
        p.leftLeg = sh * 8 * speed
        p.rightLeg = -sh * 8 * speed
        p.lean = 4
      }
      break
    }
    case 'shoot': {
      const T = DURATION.shoot
      const x = clamp(t / T, 0, 1)
      if (x < 0.25) {
        // windup: crouch, gather the ball, arms bend back/down
        const k = easeInOut(x / 0.25)
        p.bodyScaleY = lerp(1, 0.92, k)
        p.bodyScaleX = lerp(1, 1.05, k)
        p.leftArm = lerp(6, 40, k)
        p.rightArm = lerp(-6, -40, k)
        p.ballVisible = true
        p.ballX = ANCHOR.CX + 6
        p.ballY = lerp(ANCHOR.HAND_Y, ANCHOR.SHOULDER_Y + 4, k)
      } else if (x < 0.55) {
        // release: small jump, both arms sweep overhead; ball leaves at the apex
        const k = easeInOut((x - 0.25) / 0.3)
        p.bodyScaleY = lerp(0.92, 1.04, k)
        p.rootDY = -Math.sin(k * Math.PI) * 0.16 * BH
        p.leftArm = lerp(40, 165, k)
        p.rightArm = lerp(-40, -165, k)
        p.ballVisible = k < 0.85
        p.ballX = ANCHOR.CX
        p.ballY = lerp(ANCHOR.SHOULDER_Y + 4, ANCHOR.HEAD_CY - 22, k)
      } else {
        // follow-through: hold then ease arms down, land squash
        const k = easeInOut((x - 0.55) / 0.45)
        p.leftArm = lerp(165, 6, k)
        p.rightArm = lerp(-165, -6, k)
        p.bodyScaleY = k > 0.7 ? lerp(1, 0.9, (k - 0.7) / 0.3) : 1
        p.bodyScaleX = k > 0.7 ? lerp(1, 1.08, (k - 0.7) / 0.3) : 1
      }
      break
    }
    case 'jump': {
      const T = DURATION.jump
      const x = clamp(t / T, 0, 1)
      if (x < 0.14) {
        const k = easeInOut(x / 0.14)
        p.bodyScaleY = lerp(1, 0.86, k)
        p.bodyScaleX = lerp(1, 1.1, k)
        p.leftLeg = lerp(0, 12, k)
        p.rightLeg = lerp(0, -12, k)
      } else if (x < 0.8) {
        const k = (x - 0.14) / 0.66
        p.rootDY = -Math.sin(k * Math.PI) * 0.2 * BH
        p.bodyScaleY = 1.04
        // both arms reach straight UP (a slight V) to contest — not crossed
        p.leftArm = 165
        p.rightArm = -165
        p.leftLeg = -8
        p.rightLeg = 8
      } else {
        const k = easeOutBack((x - 0.8) / 0.2)
        p.bodyScaleY = lerp(0.85, 1, k)
        p.bodyScaleX = lerp(1.12, 1, k)
        p.leftArm = lerp(165, 6, k)
        p.rightArm = lerp(-165, -6, k)
      }
      break
    }
    case 'dunk': {
      const T = DURATION.dunk
      const x = clamp(t / T, 0, 1)
      if (x < 0.13) {
        const k = easeInOut(x / 0.13)
        p.bodyScaleY = lerp(1, 0.84, k)
        p.bodyScaleX = lerp(1, 1.12, k)
      } else if (x < 0.62) {
        const k = (x - 0.13) / 0.49
        p.rootDY = -Math.sin(k * Math.PI) * 0.28 * BH // higher than a normal jump
        p.bodyScaleY = 1.06
        p.rightArm = lerp(-30, -175, k) // ball-side arm cocks up overhead
        p.leftArm = -40
        p.ballVisible = true
        p.ballX = ANCHOR.CX + 4
        p.ballY = ANCHOR.HEAD_CY - 26 + Math.sin(k * Math.PI) * -6
      } else if (x < 0.74) {
        // slam down on contact
        const k = easeInOut((x - 0.62) / 0.12)
        p.rootDY = lerp(-0.28 * BH, -0.05 * BH, k)
        p.rightArm = lerp(-175, -70, k)
        p.ballVisible = false
      } else {
        // exaggerated landing squash
        const k = easeOutBack((x - 0.74) / 0.26)
        p.bodyScaleY = lerp(0.8, 1, k)
        p.bodyScaleX = lerp(1.18, 1, k)
        p.rightArm = lerp(-70, -6, k)
        p.leftArm = lerp(-40, 6, k)
      }
      break
    }
    case 'pass': {
      // distance buckets: short push · chest pass · long windup-throw (bigger/stronger)
      const kind = opts.passKind ?? 'chest'
      const sy = ANCHOR.SHOULDER_Y
      if (kind === 'long') {
        const T = 0.35
        const x = clamp(t / T, 0, 1)
        if (x < 0.28) {
          // brief load: cock the ball back, lean away
          const k = easeInOut(x / 0.28)
          p.rightArm = lerp(-6, 34, k)
          p.leftArm = lerp(6, 44, k)
          p.lean = lerp(0, -5, k)
          p.bodyScaleY = lerp(1, 0.96, k)
          p.ballVisible = true
          p.ballX = ANCHOR.CX - 6
          p.ballY = sy + 2
        } else if (x < 0.62) {
          // strong full extension, body leans into the throw
          const k = easeOutBack((x - 0.28) / 0.34)
          p.rightArm = lerp(34, -125, k)
          p.leftArm = lerp(44, -78, k)
          p.lean = lerp(-5, 15, k)
          p.ballVisible = k < 0.85
          p.ballX = lerp(ANCHOR.CX, ANCHOR.CX + 36, k)
          p.ballY = sy - 2
        } else {
          const k = easeInOut((x - 0.62) / 0.38)
          p.rightArm = lerp(-125, -6, k)
          p.leftArm = lerp(-78, 6, k)
          p.lean = lerp(15, 0, k)
        }
      } else if (kind === 'chest') {
        const T = 0.25
        const x = clamp(t / T, 0, 1)
        if (x < 0.5) {
          // both arms push out from the chest
          const k = easeOutBack(x / 0.5)
          p.rightArm = lerp(-6, -92, k)
          p.leftArm = lerp(6, 80, k)
          p.lean = lerp(0, 7, k)
          p.ballVisible = k < 0.9
          p.ballX = lerp(ANCHOR.CX, ANCHOR.CX + 30, k)
          p.ballY = sy + 4
        } else {
          const k = easeInOut((x - 0.5) / 0.5)
          p.rightArm = lerp(-92, -6, k)
          p.leftArm = lerp(80, 6, k)
          p.lean = lerp(7, 0, k)
        }
      } else {
        // short: quick one-arm push
        const T = 0.2
        const x = clamp(t / T, 0, 1)
        if (x < 0.5) {
          const k = easeOutBack(x / 0.5)
          p.rightArm = lerp(-6, -72, k)
          p.lean = lerp(0, 4, k)
          p.ballVisible = k < 0.9
          p.ballX = lerp(ANCHOR.CX + 6, ANCHOR.CX + 26, k)
          p.ballY = sy + 6
        } else {
          const k = easeInOut((x - 0.5) / 0.5)
          p.rightArm = lerp(-72, -6, k)
          p.lean = lerp(4, 0, k)
        }
      }
      break
    }
    case 'land': {
      const T = DURATION.land
      const x = clamp(t / T, 0, 1)
      const k = easeOutBack(x)
      p.bodyScaleY = lerp(0.85, 1, k)
      p.bodyScaleX = lerp(1.1, 1, k)
      break
    }
    case 'steal': {
      const T = DURATION.steal
      const x = clamp(t / T, 0, 1)
      const dart = Math.sin(clamp(x / 0.45, 0, 1) * Math.PI) // out then back
      p.rightArm = -6 - dart * 100 // arm darts toward the ball
      p.lean = dart * 10
      p.bodyScaleX = 1 + dart * 0.04
      break
    }
  }

  p.facing = opts.facing ?? 1
  applyShadow(p)
  return p
}

export function lerpPose(a: Pose, b: Pose, k: number): Pose {
  const m = (x: number, y: number) => x + (y - x) * k
  return {
    rootDY: m(a.rootDY, b.rootDY),
    bodyScaleX: m(a.bodyScaleX, b.bodyScaleX),
    bodyScaleY: m(a.bodyScaleY, b.bodyScaleY),
    lean: m(a.lean, b.lean),
    head: m(a.head, b.head),
    leftArm: m(a.leftArm, b.leftArm),
    rightArm: m(a.rightArm, b.rightArm),
    leftLeg: m(a.leftLeg, b.leftLeg),
    rightLeg: m(a.rightLeg, b.rightLeg),
    // discrete-ish fields snap to the target half-way through the blend
    ballVisible: k < 0.5 ? a.ballVisible : b.ballVisible,
    ballX: m(a.ballX, b.ballX),
    ballY: m(a.ballY, b.ballY),
    shadowScale: m(a.shadowScale, b.shadowScale),
    shadowOpacity: m(a.shadowOpacity, b.shadowOpacity),
    facing: b.facing,
  }
}
