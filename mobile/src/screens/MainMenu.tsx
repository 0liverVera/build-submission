import { useEffect } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, {
  FadeInDown,
  FadeInUp,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated'
import { ScreenBG, CandyButton, Heading } from '../ui/kit'
import { useGame } from '../state/store'
import { T, FONT } from '../theme'

export default function MainMenu() {
  const hasSave = useGame((s) => s.hasSave)
  const navigate = useGame((s) => s.navigate)
  const continueSave = useGame((s) => s.continueSave)

  // gentle idle bob on the logo ball
  const bob = useSharedValue(0)
  useEffect(() => {
    bob.value = withRepeat(
      withSequence(
        withTiming(-12, { duration: 720, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 720, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    )
  }, [bob])
  const ballStyle = useAnimatedStyle(() => ({ transform: [{ translateY: bob.value }] }))

  return (
    <ScreenBG>
      {/* ambient team-color glows */}
      <View style={[styles.glow, { backgroundColor: T.teamA, top: -120, left: -90 }]} pointerEvents="none" />
      <View style={[styles.glow, { backgroundColor: T.teamB, bottom: -130, right: -90 }]} pointerEvents="none" />

      <View style={styles.row}>
        {/* Logo lockup */}
        <Animated.View entering={FadeInUp.springify().damping(13)} style={styles.logoCol}>
          <Animated.View style={[styles.badge, ballStyle]}>
            <Text style={styles.ball}>🏀</Text>
          </Animated.View>
          <View style={styles.titleWrap}>
            <Heading size={50} color={T.gold} style={styles.title}>
              HOOP
            </Heading>
            <Heading size={44} color={T.amber} style={styles.title}>
              DYNASTY
            </Heading>
          </View>
          <View style={styles.accentRow}>
            <View style={[styles.accent, { backgroundColor: T.teamA }]} />
            <Text style={styles.tagline}>ARCADE HOOPS · FRANCHISE GLORY</Text>
            <View style={[styles.accent, { backgroundColor: T.teamB }]} />
          </View>
        </Animated.View>

        {/* Actions */}
        <View style={styles.actions}>
          {hasSave && (
            <Animated.View entering={FadeInDown.delay(120).springify().damping(12)}>
              <CandyButton label="PLAY" icon="▶" variant="primary" size="lg" fullWidth onPress={continueSave} />
            </Animated.View>
          )}
          <Animated.View entering={FadeInDown.delay(hasSave ? 220 : 120).springify().damping(12)}>
            <CandyButton
              label="NEW FRANCHISE"
              icon="＋"
              variant={hasSave ? 'secondary' : 'primary'}
              size="lg"
              fullWidth
              onPress={() => navigate('newFranchise')}
            />
          </Animated.View>
          <Animated.View entering={FadeInDown.delay(hasSave ? 320 : 220).springify().damping(12)}>
            <View style={styles.miniRow}>
              <CandyButton
                label="ROSTER"
                variant="teamA"
                size="sm"
                disabled={!hasSave}
                onPress={() => hasSave && (continueSave(), navigate('roster'))}
                style={{ flex: 1 }}
                fullWidth
              />
              <CandyButton
                label="STORE"
                variant="teamB"
                size="sm"
                disabled={!hasSave}
                onPress={() => hasSave && (continueSave(), navigate('store'))}
                style={{ flex: 1 }}
                fullWidth
              />
            </View>
          </Animated.View>
          {/* TEMP: animation review screen — remove after approval */}
          <Animated.View entering={FadeInDown.delay(hasSave ? 420 : 320).springify().damping(12)}>
            <CandyButton label="ANIM TEST" variant="success" size="sm" fullWidth onPress={() => navigate('animtest')} />
          </Animated.View>
        </View>
      </View>

      <Text style={styles.foot}>Offline prototype · v0.1</Text>
    </ScreenBG>
  )
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 48,
    paddingHorizontal: 32,
  },
  glow: { position: 'absolute', width: 280, height: 280, borderRadius: 140, opacity: 0.18 },
  logoCol: { alignItems: 'center' },
  badge: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: T.panel,
    borderWidth: 4,
    borderColor: T.gold,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
    marginBottom: 10,
  },
  ball: { fontSize: 58 },
  titleWrap: { alignItems: 'center' },
  title: { lineHeight: 50, textAlign: 'center' },
  accentRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  accent: { width: 18, height: 4, borderRadius: 2 },
  tagline: { fontFamily: FONT.bold, fontSize: 10, letterSpacing: 1.5, color: T.muted },
  actions: { width: 300, gap: 14 },
  miniRow: { flexDirection: 'row', gap: 12 },
  foot: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    fontFamily: FONT.semi,
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
  },
})
