import { View, Text, Pressable, StyleSheet } from 'react-native'
import { Screen } from '../ui/Screen'
import { useGame } from '../state/store'
import { sfx } from '../audio/sfx'
import { C, PIXEL } from '../theme'
import type { Screen as ScreenName } from '../types'

export default function Hub() {
  const f = useGame((s) => s.franchise)
  const navigate = useGame((s) => s.navigate)
  if (!f) return null

  const go = (screen: ScreenName) => {
    sfx.tap()
    navigate(screen)
  }

  return (
    <Screen>
      <View style={[styles.head, { backgroundColor: f.colorPrimary }]}>
        <View style={[styles.crest, { backgroundColor: f.colorPrimary, borderColor: f.colorSecondary }]}>
          <Text style={styles.crestTxt}>{f.teamName[0].toUpperCase()}</Text>
        </View>
        <View style={styles.id}>
          <Text style={styles.team}>
            {f.city} {f.teamName}
          </Text>
          <Text style={styles.sub}>
            Coach {f.coachName} · Season {f.season}
          </Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statK}>RECORD</Text>
          <Text style={styles.statV}>
            {f.wins}-{f.losses}
          </Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statK}>CREDITS</Text>
          <Text style={[styles.statV, { color: C.gold }]}>🪙 {f.credits}</Text>
        </View>
        <Pressable style={styles.menuBtn} onPress={() => go('menu')}>
          <Text style={{ color: C.cream, fontSize: 20 }}>≡</Text>
        </Pressable>
      </View>

      <View style={styles.nav}>
        <NavCard flex={1.4} variant="play" icon="🏀" label="PLAY GAME" onPress={() => go('season')} />
        <NavCard icon="👥" label="ROSTER" onPress={() => go('roster')} />
        <NavCard icon="🏢" label="FRONT OFFICE" onPress={() => go('frontoffice')} />
        <NavCard icon="🛒" label="STORE" onPress={() => go('store')} />
      </View>
    </Screen>
  )
}

function NavCard({
  icon,
  label,
  onPress,
  variant,
  flex = 1,
}: {
  icon: string
  label: string
  onPress: () => void
  variant?: 'play'
  flex?: number
}) {
  const play = variant === 'play'
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { flex },
        play && styles.cardPlay,
        pressed && { transform: [{ translateY: 2 }] },
      ]}
    >
      <Text style={styles.cardIc}>{icon}</Text>
      <Text style={[styles.cardLbl, play && { color: C.ink }]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.3)',
    borderBottomWidth: 5,
    borderBottomColor: 'rgba(0,0,0,0.35)',
  },
  crest: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crestTxt: { fontFamily: PIXEL, fontSize: 20, color: C.cream },
  id: { flex: 1, minWidth: 0 },
  team: {
    fontFamily: PIXEL,
    fontSize: 13,
    color: C.cream,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 2, height: 2 },
    lineHeight: 18,
  },
  sub: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 4 },
  stat: {
    gap: 3,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  statK: { fontSize: 9, letterSpacing: 1.5, color: 'rgba(255,255,255,0.8)' },
  statV: { fontFamily: PIXEL, fontSize: 14, color: C.cream },
  menuBtn: {
    backgroundColor: 'rgba(0,0,0,0.25)',
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nav: { flex: 1, flexDirection: 'row', gap: 14, marginTop: 14 },
  card: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderWidth: 2,
    borderColor: C.line,
    borderRadius: 18,
    backgroundColor: C.panel2,
    borderBottomWidth: 4,
    borderBottomColor: '#161a2e',
  },
  cardPlay: {
    backgroundColor: C.orange,
    borderColor: C.orangeDeep,
    borderBottomColor: '#a8470f',
  },
  cardIc: { fontSize: 40 },
  cardLbl: { fontFamily: PIXEL, fontSize: 10, letterSpacing: 0.5, color: C.cream, textAlign: 'center' },
})
