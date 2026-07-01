import { useEffect, useRef, useState } from 'react'
import { View, Text, Pressable, StyleSheet, type GestureResponderEvent } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useGame } from '../state/store'
import { C, FONT } from '../theme'
import { Character } from '../court/CharacterView'
import {
  computePose,
  lerpPose,
  restPose,
  easeInOut,
  ONESHOT,
  DURATION,
  type AnimState,
  type Pose,
  type PassKind,
} from '../court/charAnim'
import { appearanceFromId, randomAppearance } from '../court/character'

const STATES: AnimState[] = ['idle', 'walk', 'run', 'dribble', 'shoot', 'jump', 'dunk', 'pass', 'land', 'steal']
const PRIMARY = new Set<AnimState>(['idle', 'walk', 'run', 'dribble']) // this round's focus
const TRACK_W = 200
const BLEND = 0.12 // seconds to blend limb angles on a state change

export default function CharacterAnimTest() {
  const navigate = useGame((s) => s.navigate)
  const insets = useSafeAreaInsets()

  const [state, setState] = useState<AnimState>('dribble')
  const [speed, setSpeed] = useState(0.7)
  const [facing, setFacing] = useState<1 | -1>(1)
  const [passKind, setPassKind] = useState<PassKind>('chest')
  const [look, setLook] = useState(() => appearanceFromId('anim-demo', { jerseyColor: '#2D9CDB', number: 7 }))
  const [pose, setPose] = useState<Pose>(restPose())

  // refs the rAF loop reads (avoids re-subscribing the loop every render)
  const stateRef = useRef(state)
  const speedRef = useRef(speed)
  const facingRef = useRef(facing)
  const passKindRef = useRef(passKind)
  const shownRef = useRef<Pose>(restPose())
  const fromRef = useRef<Pose>(restPose())
  const t0Ref = useRef(0)
  const blend0Ref = useRef(-1)
  const changedRef = useRef(true)

  useEffect(() => {
    stateRef.current = state
    changedRef.current = true
  }, [state])
  useEffect(() => {
    speedRef.current = speed
  }, [speed])
  useEffect(() => {
    facingRef.current = facing
  }, [facing])
  useEffect(() => {
    passKindRef.current = passKind
    if (state === 'pass') {
      stateRef.current = 'pass'
      changedRef.current = true // replay the pass with the new distance
    }
  }, [passKind, state])

  useEffect(() => {
    let raf = 0
    const loop = (ms: number) => {
      const now = ms / 1000
      const st = stateRef.current
      if (changedRef.current) {
        changedRef.current = false
        fromRef.current = shownRef.current
        t0Ref.current = now
        blend0Ref.current = now
      }
      let elapsed = now - t0Ref.current
      if (ONESHOT[st] && elapsed > DURATION[st] + 0.4) {
        // loop one-shots with a short pause so they're reviewable
        t0Ref.current = now
        elapsed = 0
      }
      const target = computePose(st, elapsed, {
        speed: speedRef.current,
        facing: facingRef.current,
        passKind: passKindRef.current,
      })
      const bk = Math.min(1, (now - blend0Ref.current) / BLEND)
      const shown = bk >= 1 ? target : lerpPose(fromRef.current, target, easeInOut(bk))
      shownRef.current = shown
      setPose(shown)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  const onTrack = (e: GestureResponderEvent) => {
    const x = e.nativeEvent.locationX
    setSpeed(Math.max(0, Math.min(1, x / TRACK_W)))
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 6, paddingLeft: insets.left + 10, paddingRight: insets.right + 10 }]}>
      <View style={styles.topbar}>
        <Pressable style={styles.back} onPress={() => navigate('menu')}>
          <Text style={styles.backTxt}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>ANIMATION TEST</Text>
        <View style={styles.topRight}>
          <Pressable style={styles.chip} onPress={() => setFacing((f) => (f === 1 ? -1 : 1))}>
            <Text style={styles.chipTxt}>{facing === 1 ? 'FACE ▶' : '◀ FACE'}</Text>
          </Pressable>
          <Pressable
            style={styles.chip}
            onPress={() => setLook(randomAppearance(Math.floor(Math.random() * 1e9), look.jerseyColor, look.number))}
          >
            <Text style={styles.chipTxt}>↻ LOOK</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.body}>
        {/* stage */}
        <View style={styles.stage}>
          <Character appearance={look} size={300} pose={pose} />
          <Text style={styles.stateLabel}>{state.toUpperCase()}</Text>
        </View>

        {/* controls */}
        <View style={styles.controls}>
          <Text style={styles.section}>STATE</Text>
          <View style={styles.btnGrid}>
            {STATES.map((s) => {
              const active = s === state
              return (
                <Pressable
                  key={s}
                  onPress={() => setState(s)}
                  style={[styles.stateBtn, PRIMARY.has(s) && styles.stateBtnPrimary, active && styles.stateBtnActive]}
                >
                  <Text style={[styles.stateBtnTxt, active && styles.stateBtnTxtActive]}>{s}</Text>
                </Pressable>
              )
            })}
          </View>

          {state === 'pass' && (
            <>
              <Text style={styles.section}>PASS DISTANCE</Text>
              <View style={styles.btnGrid}>
                {(['short', 'chest', 'long'] as PassKind[]).map((k) => (
                  <Pressable
                    key={k}
                    onPress={() => setPassKind(k)}
                    style={[styles.stateBtn, styles.stateBtnPrimary, passKind === k && styles.stateBtnActive]}
                  >
                    <Text style={[styles.stateBtnTxt, passKind === k && styles.stateBtnTxtActive]}>{k}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          <Text style={styles.section}>SPEED · {Math.round(speed * 100)}%</Text>
          <View
            style={styles.track}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderGrant={onTrack}
            onResponderMove={onTrack}
          >
            <View style={styles.trackBg} />
            <View style={[styles.trackFill, { width: speed * TRACK_W }]} />
            <View style={[styles.knob, { left: speed * TRACK_W - 9 }]} />
          </View>
          <Text style={styles.hint}>Speed affects walk / run cadence. One-shots loop with a short pause.</Text>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#e9edf5' },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  back: { paddingVertical: 6, paddingHorizontal: 10 },
  backTxt: { fontFamily: FONT.bold, fontSize: 15, color: C.ink },
  title: { fontFamily: FONT.black, fontSize: 16, color: C.ink, letterSpacing: 1 },
  topRight: { flexDirection: 'row', gap: 8 },
  chip: { backgroundColor: '#cdd6e6', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10 },
  chipTxt: { fontFamily: FONT.bold, fontSize: 12, color: C.ink },
  body: { flex: 1, flexDirection: 'row', gap: 12 },
  stage: {
    flex: 1,
    backgroundColor: '#f6f8fc',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#cfd8e8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateLabel: { position: 'absolute', bottom: 8, fontFamily: FONT.black, fontSize: 13, color: '#7c879c', letterSpacing: 2 },
  controls: { width: 280, justifyContent: 'center' },
  section: { fontFamily: FONT.black, fontSize: 12, color: '#5b6b86', marginBottom: 6, marginTop: 6, letterSpacing: 1 },
  btnGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  stateBtn: { backgroundColor: '#d3dbe9', borderRadius: 9, paddingVertical: 8, paddingHorizontal: 11 },
  stateBtnPrimary: { backgroundColor: '#bcd0ec' },
  stateBtnActive: { backgroundColor: C.orange },
  stateBtnTxt: { fontFamily: FONT.bold, fontSize: 13, color: C.ink },
  stateBtnTxtActive: { color: '#fff' },
  track: { width: TRACK_W, height: 26, justifyContent: 'center' },
  trackBg: { position: 'absolute', height: 8, top: 9, width: TRACK_W, borderRadius: 4, backgroundColor: '#cdd6e6' },
  trackFill: { position: 'absolute', height: 8, top: 9, borderRadius: 4, backgroundColor: C.orange },
  knob: { position: 'absolute', width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff', borderWidth: 2, borderColor: C.orange, top: 4 },
  hint: { fontFamily: FONT.medium, fontSize: 11, color: '#7c879c', marginTop: 10, maxWidth: 260 },
})
