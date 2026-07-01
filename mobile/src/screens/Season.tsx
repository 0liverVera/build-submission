import { View, Text, ScrollView, StyleSheet } from 'react-native'
import { Screen, ScreenHeader } from '../ui/Screen'
import Button from '../ui/Button'
import { useGame } from '../state/store'
import { standings } from '../game/league'
import { C, PIXEL } from '../theme'

/**
 * Season dashboard (Phase 6): standings, your schedule/goal, and the button to
 * play the next game — or, in the offseason, roll into the next season.
 */
export default function Season() {
  const f = useGame((s) => s.franchise)
  const navigate = useGame((s) => s.navigate)
  const enterOffseason = useGame((s) => s.enterOffseason)
  const currentOpponent = useGame((s) => s.currentOpponent)
  if (!f) return null

  const s = f.seasonState
  const player = {
    abbr: f.teamName.slice(0, 3).toUpperCase(),
    name: f.teamName,
    color: f.colorPrimary,
    w: s.wins,
    l: s.losses,
  }
  const table = standings(player, f.league)
  const opp = currentOpponent()

  let cta: React.ReactNode = null
  if (s.phase === 'regular') {
    cta = (
      <View style={styles.cta}>
        <Text style={styles.scNext}>
          Game {s.game + 1} of {s.schedule.length} · vs{' '}
          <Text style={[styles.scB, { color: opp?.color }]}>
            {opp?.city} {opp?.name}
          </Text>
        </Text>
        <Button variant="primary" onPress={() => navigate('game')}>
          🏀 PLAY NEXT GAME
        </Button>
      </View>
    )
  } else if (s.phase === 'playoffs') {
    cta = (
      <View style={styles.cta}>
        <Text style={[styles.scNext, styles.scNextPlayoff]}>
          {s.playoffRound >= 2 ? '🏆 THE FINALS' : 'SEMIFINAL'} · vs{' '}
          <Text style={[styles.scB, { color: opp?.color }]}>
            {opp?.city} {opp?.name}
          </Text>
        </Text>
        <Button variant="primary" onPress={() => navigate('game')}>
          ⚔ PLAY {s.playoffRound >= 2 ? 'THE FINALS' : 'SEMIFINAL'}
        </Button>
      </View>
    )
  } else {
    cta = (
      <View style={styles.cta}>
        <Text style={styles.scResult}>{s.lastResult || 'Season complete.'}</Text>
        <Button
          variant="primary"
          onPress={() => {
            enterOffseason()
            navigate('offseason')
          }}
        >
          → ENTER OFFSEASON
        </Button>
      </View>
    )
  }

  const recentHof = f.hallOfFame.slice(-3).reverse()

  return (
    <Screen>
      <ScreenHeader
        title={`SEASON ${f.season}`}
        onBack={() => navigate('hub')}
        right={<Text style={styles.goal}>🎯 {s.goal.label}</Text>}
      />

      {!!s.lastResult && s.phase !== 'offseason' && (
        <Text style={styles.banner}>{s.lastResult}</Text>
      )}

      <View style={styles.body}>
        <View style={styles.standings}>
          <Text style={styles.stdTitle}>STANDINGS</Text>
          <ScrollView style={styles.stdScroll} showsVerticalScrollIndicator={false}>
            {table.map((r, i) => (
              <View
                key={r.abbr + i}
                style={[
                  styles.stdRow,
                  i < 4 && styles.stdRowPlayoff,
                  r.isPlayer && styles.stdRowMe,
                ]}
              >
                <Text style={styles.stdRank}>{i + 1}</Text>
                <View style={[styles.stdDot, { backgroundColor: r.color }]} />
                <Text style={styles.stdName} numberOfLines={1}>
                  {r.name}
                </Text>
                <Text style={styles.stdRec}>
                  {r.w}-{r.l}
                </Text>
              </View>
            ))}
          </ScrollView>
          <Text style={styles.stdFoot}>Top 4 make the playoffs</Text>
        </View>

        <View style={styles.side}>
          {cta}
          {recentHof.length > 0 && (
            <View style={styles.hof}>
              <Text style={styles.hofTitle}>🏛️ HALL OF FAME</Text>
              {recentHof.map((h, i) => (
                <View key={i} style={styles.hofRow}>
                  <Text style={styles.hofName}>{h.name}</Text>
                  <Text style={styles.hofMeta}>
                    {h.pos} · OVR {h.overall} · {h.titles}🏆
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  goal: {
    marginLeft: 'auto',
    fontSize: 12,
    fontWeight: '700',
    color: C.gold,
  },
  banner: {
    textAlign: 'center',
    fontFamily: PIXEL,
    fontSize: 12,
    color: C.teal,
    padding: 6,
    marginBottom: 8,
    backgroundColor: 'rgba(45, 212, 191, 0.1)',
    borderRadius: 10,
  },
  body: { flex: 1, flexDirection: 'row', gap: 16, minHeight: 0 },
  standings: {
    flex: 1.1,
    flexDirection: 'column',
    backgroundColor: C.panel,
    borderWidth: 2,
    borderColor: C.line,
    borderRadius: 14,
    padding: 10,
  },
  stdTitle: {
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: '700',
    color: C.muted,
    marginBottom: 4,
  },
  stdScroll: { flex: 1 },
  stdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderRadius: 8,
    marginBottom: 3,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  stdRowPlayoff: { backgroundColor: 'rgba(255, 207, 74, 0.08)' },
  stdRowMe: {
    backgroundColor: 'rgba(255, 138, 61, 0.18)',
    borderColor: C.orange,
  },
  stdRank: {
    width: 16,
    fontWeight: '700',
    color: C.muted,
    textAlign: 'center',
  },
  stdDot: { width: 12, height: 12, borderRadius: 4 },
  stdName: { flex: 1, fontWeight: '600', color: C.cream },
  stdRec: { fontFamily: PIXEL, fontSize: 11, color: C.cream },
  stdFoot: { marginTop: 6, fontSize: 10, color: C.muted, paddingTop: 6 },
  side: { flex: 1, flexDirection: 'column', gap: 12, minWidth: 0 },
  cta: {
    flexDirection: 'column',
    gap: 12,
    padding: 16,
    borderRadius: 14,
    backgroundColor: C.panel2,
    borderWidth: 2,
    borderColor: C.line,
  },
  scNext: { fontSize: 13, color: C.muted, lineHeight: 18 },
  scNextPlayoff: { fontFamily: PIXEL, fontSize: 12, color: C.gold },
  scB: { color: C.cream, fontWeight: '700' },
  scResult: { fontSize: 15, fontWeight: '600', color: C.cream, lineHeight: 21 },
  hof: {
    flexDirection: 'column',
    gap: 5,
    padding: 12,
    borderRadius: 14,
    backgroundColor: C.panel,
    borderWidth: 2,
    borderColor: C.line,
  },
  hofTitle: { fontSize: 10, letterSpacing: 1, fontWeight: '700', color: C.gold },
  hofRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  hofName: { fontSize: 11, fontWeight: '600', color: C.cream },
  hofMeta: { fontSize: 11, color: C.muted },
})
