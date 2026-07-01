import { useEffect } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native'
import { Screen } from '../ui/Screen'
import Button from '../ui/Button'
import { useGame, SALARY_CAP, ROSTER_MAX, capUsed } from '../state/store'
import { overall } from '../game/players'
import { C, PIXEL } from '../theme'
import type { Player } from '../types'

/** Reveal more of a prospect's rating the better your Scouting facility is. */
function scoutOverall(p: Player, scouting: number): string {
  const ov = overall(p)
  if (scouting >= 4) return String(ov)
  const spread = 5 - scouting // lvl1→4, lvl3→2
  return `${Math.max(1, ov - spread)}–${Math.min(10, ov + spread)}`
}

export default function Offseason() {
  const f = useGame((s) => s.franchise)
  const navigate = useGame((s) => s.navigate)
  const enterOffseason = useGame((s) => s.enterOffseason)
  const draftPlayer = useGame((s) => s.draftPlayer)
  const signFreeAgent = useGame((s) => s.signFreeAgent)
  const cutPlayer = useGame((s) => s.cutPlayer)
  const commitNextSeason = useGame((s) => s.commitNextSeason)

  // Prepare the offseason on mount (guarded internally against re-prep).
  useEffect(() => {
    enterOffseason()
  }, [enterOffseason])

  if (!f || !f.offseason) return null

  const os = f.offseason
  const used = capUsed(f.roster)
  const room = SALARY_CAP - used
  const scouting = f.facilities.scouting
  const accent = f.colorPrimary
  const fillPct = Math.min(100, (used / SALARY_CAP) * 100)

  return (
    <Screen>
      <View style={styles.head}>
        <Text style={styles.title}>OFFSEASON · S{f.season}</Text>
        <View style={styles.capMeter}>
          <Text style={styles.capK}>CAP</Text>
          <View style={styles.capBar}>
            <View style={[styles.capFill, { width: `${fillPct}%` }]} />
          </View>
          <Text style={styles.capV}>
            {used}/{SALARY_CAP}
          </Text>
        </View>
        <Button
          variant="primary"
          style={styles.osStart}
          textStyle={{ fontSize: 11 }}
          onPress={() => {
            commitNextSeason()
            navigate('lobby')
          }}
        >
          {`START SEASON ${f.season + 1} ▶`}
        </Button>
      </View>

      {os.retired.length > 0 && (
        <Text style={styles.retired}>👋 Retired: {os.retired.join(', ')}</Text>
      )}

      <View style={styles.body}>
        {/* DRAFT */}
        <View style={styles.col}>
          <Text style={styles.label}>
            🎓 DRAFT {scouting < 4 && <Text style={styles.labelEm}>(scouting: ratings fuzzy)</Text>}
          </Text>
          <ScrollView style={styles.cards} contentContainerStyle={styles.cardsContent}>
            {os.prospects.map((p) => (
              <View key={p.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={[styles.pos, { backgroundColor: accent }]}>{p.pos}</Text>
                  <Text style={styles.name} numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Text style={styles.ov}>{scoutOverall(p, scouting)}</Text>
                </View>
                <Text style={styles.meta}>
                  Age {p.age} · 🪙{p.salary} cap
                </Text>
                <Button
                  variant="secondary"
                  style={styles.cardBtn}
                  textStyle={{ fontSize: 11 }}
                  disabled={os.drafted}
                  onPress={() => draftPlayer(p.id)}
                >
                  {os.drafted ? '—' : 'DRAFT'}
                </Button>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* FREE AGENCY */}
        <View style={styles.col}>
          <Text style={styles.label}>
            ✍️ FREE AGENTS <Text style={styles.labelEm}>(room: {room})</Text>
          </Text>
          <ScrollView style={styles.cards} contentContainerStyle={styles.cardsContent}>
            {os.freeAgents.map((p) => {
              const canSign = f.roster.length < ROSTER_MAX && p.salary <= room
              return (
                <View key={p.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <Text style={[styles.pos, { backgroundColor: accent }]}>{p.pos}</Text>
                    <Text style={styles.name} numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Text style={styles.ov}>{overall(p)}</Text>
                  </View>
                  <Text style={styles.meta}>
                    Age {p.age} · 🪙{p.salary} cap
                  </Text>
                  <Button
                    variant="primary"
                    style={styles.cardBtn}
                    textStyle={{ fontSize: 11 }}
                    disabled={!canSign}
                    onPress={() => signFreeAgent(p.id)}
                  >
                    SIGN
                  </Button>
                </View>
              )
            })}
            {os.freeAgents.length === 0 && <Text style={styles.empty}>All signed.</Text>}
          </ScrollView>
        </View>

        {/* ROSTER (cut to free cap) */}
        <View style={styles.col}>
          <Text style={styles.label}>
            👥 YOUR ROSTER <Text style={styles.labelEm}>({f.roster.length})</Text>
          </Text>
          <ScrollView style={styles.cards} contentContainerStyle={styles.cardsContent}>
            {f.roster.map((p) => {
              const cutDisabled = f.roster.length <= 5
              return (
                <View key={p.id} style={styles.rrow}>
                  <Text style={[styles.pos, { backgroundColor: accent }]}>{p.pos}</Text>
                  <Text style={styles.name} numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Text style={styles.ovSmall}>{overall(p)}</Text>
                  <Text style={styles.sal}>🪙{p.salary}</Text>
                  <Pressable
                    style={[styles.cutBtn, cutDisabled && styles.cutBtnDisabled]}
                    disabled={cutDisabled}
                    onPress={() => cutPlayer(p.id)}
                  >
                    <Text style={styles.cutBtnTxt}>✕</Text>
                  </Pressable>
                </View>
              )
            })}
          </ScrollView>
        </View>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  title: { fontFamily: PIXEL, fontSize: 15, color: C.cream, letterSpacing: 1 },
  capMeter: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 'auto' },
  capK: { fontSize: 10, letterSpacing: 1, color: C.muted },
  capBar: {
    width: 120,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(0,0,0,0.35)',
    overflow: 'hidden',
  },
  capFill: { height: '100%', borderRadius: 5, backgroundColor: C.teal },
  capV: { fontFamily: PIXEL, fontSize: 10, color: C.cream },
  osStart: { marginLeft: 12, paddingVertical: 10, paddingHorizontal: 14 },
  retired: { fontSize: 12, color: C.muted, marginBottom: 8 },
  body: { flex: 1, flexDirection: 'row', gap: 12, minHeight: 0 },
  col: { flex: 1, gap: 6, minWidth: 0 },
  label: { fontSize: 11, letterSpacing: 1, fontWeight: '700', color: C.gold },
  labelEm: { fontSize: 10, fontWeight: '500', color: C.muted },
  cards: { flex: 1 },
  cardsContent: { gap: 6, paddingBottom: 4 },
  card: {
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: C.panel,
    borderWidth: 2,
    borderColor: C.line,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  pos: {
    fontFamily: PIXEL,
    fontSize: 9,
    color: '#fff',
    paddingVertical: 3,
    paddingHorizontal: 5,
    borderRadius: 6,
    overflow: 'hidden',
  },
  name: { flex: 1, fontWeight: '700', fontSize: 13, color: C.cream },
  ov: { fontFamily: PIXEL, fontSize: 13, color: C.gold },
  ovSmall: { fontFamily: PIXEL, fontSize: 11, color: C.gold },
  meta: { fontSize: 10, color: C.muted },
  cardBtn: { width: '100%', paddingVertical: 7 },
  empty: { fontSize: 12, color: C.muted, padding: 8 },
  rrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
  },
  sal: { fontSize: 11, color: C.gold },
  cutBtn: {
    backgroundColor: C.danger,
    width: 24,
    height: 24,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cutBtnDisabled: { opacity: 0.35 },
  cutBtnTxt: { color: '#fff', fontSize: 13 },
})
