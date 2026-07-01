import { View, Text, StyleSheet } from 'react-native'
import { Screen, ScreenHeader } from '../ui/Screen'
import Button from '../ui/Button'
import { useGame, FACILITY_COST } from '../state/store'
import { C, PIXEL } from '../theme'
import type { FacilityKey } from '../types'

const FACS: { key: FacilityKey; name: string; icon: string; effect: string }[] = [
  { key: 'training', name: 'Training', icon: '🏋️', effect: 'Player growth & morale' },
  { key: 'medical', name: 'Medical', icon: '🏥', effect: 'Faster injury recovery' },
  { key: 'scouting', name: 'Scouting', icon: '🔭', effect: 'Better draft intel' },
  { key: 'stadium', name: 'Stadium', icon: '🏟️', effect: 'More fans & credit income' },
]

export default function FrontOffice({ onClose }: { onClose?: () => void } = {}) {
  const f = useGame((s) => s.franchise)
  const navigate = useGame((s) => s.navigate)
  const upgrade = useGame((s) => s.upgradeFacility)
  if (!f) return null

  const avgMorale = Math.round(
    f.roster.reduce((s, p) => s + p.morale, 0) / Math.max(1, f.roster.length),
  )

  return (
    <Screen>
      <ScreenHeader
        title="FRONT OFFICE"
        onBack={onClose ?? (() => navigate('lobby'))}
        right={
          <View style={styles.stats}>
            <View style={styles.pill}>
              <Text style={[styles.pillTxt, { color: C.gold }]}>🪙 {f.credits}</Text>
            </View>
            <View style={styles.pill}>
              <Text style={styles.pillTxt}>📣 {f.fanInterest}</Text>
            </View>
            <View style={styles.pill}>
              <Text style={styles.pillTxt}>😊 {avgMorale}</Text>
            </View>
          </View>
        }
      />

      <View style={styles.grid}>
        {FACS.map((fac) => {
          const level = f.facilities[fac.key]
          const max = level >= 5
          const cost = FACILITY_COST(level)
          const afford = f.credits >= cost
          return (
            <View key={fac.key} style={styles.card}>
              <Text style={styles.ic}>{fac.icon}</Text>
              <Text style={styles.name}>{fac.name}</Text>
              <View style={styles.dots}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <View key={n} style={[styles.dot, n <= level && styles.dotOn]} />
                ))}
              </View>
              <Text style={styles.effect}>{fac.effect}</Text>
              <Button
                variant={max ? 'secondary' : 'primary'}
                style={styles.up}
                textStyle={{ fontSize: 12 }}
                disabled={max || !afford}
                onPress={() => upgrade(fac.key)}
              >
                {max ? 'MAX' : `▲ 🪙${cost}`}
              </Button>
            </View>
          )
        })}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  stats: { marginLeft: 'auto', flexDirection: 'row', gap: 8 },
  pill: {
    backgroundColor: C.panel,
    borderWidth: 2,
    borderColor: C.line,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  pillTxt: { fontSize: 13, fontWeight: '700', color: C.cream },
  grid: { flex: 1, flexDirection: 'row', gap: 12 },
  card: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: C.panel2,
    borderWidth: 2,
    borderColor: C.line,
  },
  ic: { fontSize: 40 },
  name: { fontFamily: PIXEL, fontSize: 12, color: C.cream, textAlign: 'center' },
  dots: { flexDirection: 'row', gap: 5 },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 3,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1,
    borderColor: C.line,
  },
  dotOn: { backgroundColor: C.gold, borderColor: C.goldDeep },
  effect: { flex: 1, textAlign: 'center', fontSize: 11, color: C.muted, lineHeight: 14 },
  up: { width: '100%', paddingVertical: 11, paddingHorizontal: 10 },
})
