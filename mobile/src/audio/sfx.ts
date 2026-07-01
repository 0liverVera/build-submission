/**
 * SFX stub for the native build.
 *
 * The web version synthesizes every sound with the Web Audio API, which does
 * not exist in React Native / Expo Go. These no-ops keep the same call sites
 * working; a later pass can play pre-rendered clips via expo-audio.
 */
let _muted = false
export function setSfxMuted(m: boolean) {
  _muted = m
}
export function isSfxMuted() {
  return _muted
}

const noop = () => {}

export const sfx = {
  tap: noop,
  confirm: noop,
  dribble: noop,
  pass: noop,
  shoot: noop,
  swish: noop,
  rim: noop,
  make: noop,
  three: noop,
  dunk: noop,
  miss: noop,
  block: noop,
  buzzer: noop,
  deny: noop,
  aww: noop,
}
