/**
 * Music stub for the native build.
 *
 * The web version sequences a chiptune loop with the Web Audio API (absent in
 * React Native / Expo Go). These no-ops preserve the API; a later pass can loop
 * a pre-rendered track via expo-audio.
 */
let muted = false

export function playTrack(_track: 'menu' | 'game') {}
export function setMusicMuted(m: boolean) {
  muted = m
}
export function isMuted() {
  return muted
}
