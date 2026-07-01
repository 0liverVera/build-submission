import { View, Text, ScrollView, StyleSheet } from 'react-native'
import { Screen, ScreenHeader } from '../ui/Screen'
import { useGame } from '../state/store'
import { overall, moraleFace } from '../game/players'
import { C, PIXEL } from '../theme'
import type { Player } from '../types'

function PlayerCard({ p, color }: { p: Player; color: string }) {
  const ov = overall(p)
  const initials = p.name
    .split(' ')
    .map((w) => w[0])
    .join('')
  return (
    <View style={styles.pcard}>
      <View style={styles.pcardTop}>
        <View style={[styles.pavatar, { backgroundColor: color }]}>
          <Text style={styles.pavatarTxt}>{initials}</Text>
          <Text style={styles.pmorale}>{moraleFace(p.morale)}</Text>
        </View>
        <View style={styles.pcardId}>
          <Text style={styles.pname} numberOfLines={1}>
            {p.name}
          </Text>
          <Text style={styles.pmeta}>
            {p.pos} · Age {p.age}
          </Text>
        </View>
        <Text style={styles.povr}>{ov}</Text>
      </View>
      <View style={styles.pstats}>
        <Stat k="SHO" v={p.shooting} />
        <Stat k="SPD" v={p.speed} />
        <Stat k="INS" v={p.inside} />
        <Stat k="DEF" v={p.defense} />
      </View>
    </View>
  )
}

function Stat({ k, v }: { k: string; v: number }) {
  return (
    <View style={styles.pstat}>
      <Text style={styles.psK}>{k}</Text>
      <View style={styles.psBar}>
        <View style={[styles.psFill, { width: `${v * 10}%` }]} />
      </View>
      <Text style={styles.psV}>{v}</Text>
    </View>
  )
}

export default function Roster({ onClose }: { onClose?: () => void } = {}) {
  const f = useGame((s) => s.franchise)
  const navigate = useGame((s) => s.navigate)
  if (!f) return null
  const starters = f.roster.slice(0, 5)
  const bench = f.roster.slice(5)
  const color = f.colorPrimary

  return (
    <Screen>
      <ScreenHeader
        title="ROSTER"
        onBack={onClose ?? (() => navigate('lobby'))}
        right={
          <Text style={styles.sub}>
            {f.city} {f.teamName}
          </Text>
        }
      />

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <Text style={styles.label}>STARTERS</Text>
        {starters.map((p) => (
          <PlayerCard key={p.id} p={p} color={color} />
        ))}
        <Text style={styles.label}>BENCH</Text>
        {bench.map((p) => (
          <PlayerCard key={p.id} p={p} color={color} />
        ))}
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  sub: { marginLeft: 'auto', fontSize: 12, color: C.muted },
  body: { flex: 1 },
  bodyContent: { gap: 6, paddingBottom: 8 },
  label: {
    fontFamily: PIXEL,
    fontSize: 10,
    letterSpacing: 2,
    color: C.gold,
    marginTop: 4,
    marginHorizontal: 2,
    marginBottom: 2,
  },
  pcard: {
    flexDirection: 'column',
    gap: 6,
    padding: 8,
    borderRadius: 12,
    backgroundColor: C.panel,
    borderWidth: 2,
    borderColor: C.line,
  },
  pcardTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pavatar: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.35)',
  },
  pavatarTxt: { fontFamily: PIXEL, fontSize: 9, color: '#fff' },
  pmorale: { position: 'absolute', bottom: -7, right: -7, fontSize: 13 },
  pcardId: { flex: 1, minWidth: 0 },
  pname: { fontSize: 12, fontWeight: '700', color: C.cream },
  pmeta: { fontSize: 10, color: C.muted },
  povr: { fontFamily: PIXEL, fontSize: 14, color: C.gold },
  pstats: { flexDirection: 'column', gap: 3 },
  pstat: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  psK: { width: 26, fontSize: 9, fontWeight: '700', color: C.muted },
  psBar: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(0,0,0,0.3)',
    overflow: 'hidden',
  },
  psFill: { height: '100%', borderRadius: 3, backgroundColor: C.orange },
  psV: { width: 14, textAlign: 'right', fontSize: 10, fontWeight: '700', color: C.cream },
})
