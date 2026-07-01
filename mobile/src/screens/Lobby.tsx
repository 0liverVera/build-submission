import { useState } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, { SlideInRight, SlideOutRight } from 'react-native-reanimated'
import { useGame } from '../state/store'
import { standings } from '../game/league'
import { T, FONT, R, SP, OUTLINE, SHADOW } from '../theme'
import { ScreenBG, Panel, CandyButton, StatPill, Heading } from '../ui/kit'
import Roster from './Roster'
import FrontOffice from './FrontOffice'
import Store from './Store'

type Overlay = 'roster' | 'frontoffice' | 'store' | null

/** The single hub: header + next-game + standings, with overlays for the rest. */
export default function Lobby() {
  const f = useGame((s) => s.franchise)
  const navigate = useGame((s) => s.navigate)
  const enterOffseason = useGame((s) => s.enterOffseason)
  const currentOpponent = useGame((s) => s.currentOpponent)
  const [overlay, setOverlay] = useState<Overlay>(null)
  const insets = useSafeAreaInsets()
  if (!f) return null

  const s = f.seasonState
  const opp = currentOpponent()
  const table = standings(
    { abbr: f.teamName.slice(0, 3).toUpperCase(), name: f.teamName, color: f.colorPrimary, w: s.wins, l: s.losses },
    f.league,
  )

  const offseason = s.phase === 'offseason'
  const playoffs = s.phase === 'playoffs'

  return (
    <ScreenBG>
      <View style={{ flex: 1, paddingTop: insets.top + 10, paddingBottom: insets.bottom + 8, paddingHorizontal: insets.left + 16 }}>
        {/* Header bar (team-colored) */}
        <LinearGradient
          colors={[f.colorPrimary, f.colorSecondary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <View style={[styles.crest, { borderColor: f.colorSecondary }]}>
            <Text style={styles.crestTxt}>{f.teamName[0]?.toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Heading size={16}>
              {f.city} {f.teamName}
            </Heading>
            <Text style={styles.sub}>
              Coach {f.coachName} · Season {f.season}
            </Text>
          </View>
          <StatPill label="REC" value={`${f.wins}-${f.losses}`} valueColor={T.white} style={styles.hPill} />
          <StatPill icon="🪙" value={f.credits} style={styles.hPill} />
          <Pressable style={styles.menuBtn} onPress={() => navigate('menu')}>
            <Text style={{ color: T.white, fontSize: 20, fontFamily: FONT.black }}>≡</Text>
          </Pressable>
        </LinearGradient>

        {/* Body: next-game card + standings */}
        <View style={styles.body}>
          <View style={{ flex: 1.25, justifyContent: 'center' }}>
            <Panel padded={false}>
              <View style={styles.nextInner}>
                <View style={styles.goalRow}>
                  <Text style={styles.goalTag}>SEASON GOAL</Text>
                  <Text style={styles.goalTxt}>🎯 {s.goal.label}</Text>
                </View>

                {offseason ? (
                  <>
                    <Heading size={22} color={T.white}>
                      {s.lastResult || 'Season complete'}
                    </Heading>
                    <CandyButton
                      label="ENTER OFFSEASON"
                      icon="→"
                      variant="primary"
                      size="lg"
                      fullWidth
                      onPress={() => {
                        enterOffseason()
                        navigate('offseason')
                      }}
                    />
                  </>
                ) : (
                  <>
                    <Text style={styles.nextLabel}>{playoffs ? (s.playoffRound >= 2 ? 'THE FINALS' : 'SEMIFINAL') : `GAME ${s.game + 1} OF ${s.schedule.length}`}</Text>
                    <View style={styles.vsRow}>
                      <Text style={styles.vs}>vs</Text>
                      <View style={[styles.oppChip, { backgroundColor: opp?.color ?? T.teamB }]}>
                        <Text style={styles.oppAbbr}>{opp?.abbr ?? 'OPP'}</Text>
                      </View>
                      <Heading size={18} color={T.white}>
                        {opp?.city} {opp?.name}
                      </Heading>
                    </View>
                    {!!s.lastResult && <Text style={styles.lastResult}>{s.lastResult}</Text>}
                    <CandyButton
                      label="PLAY"
                      icon="🏀"
                      variant="primary"
                      size="lg"
                      fullWidth
                      onPress={() => navigate('game')}
                    />
                  </>
                )}
              </View>
            </Panel>
          </View>

          <Panel title="Standings" style={{ flex: 1 }} padded={false}>
            <View style={styles.stdWrap}>
              <ScrollView showsVerticalScrollIndicator={false}>
                {table.map((r, i) => (
                  <View key={r.abbr + i} style={[styles.stdRow, i < 4 && styles.stdPlayoff, r.isPlayer && styles.stdMe]}>
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
          </Panel>
        </View>

        {/* Persistent bottom nav */}
        <View style={styles.nav}>
          <CandyButton label="ROSTER" icon="👥" variant="teamA" size="md" fullWidth style={{ flex: 1 }} onPress={() => setOverlay('roster')} />
          <CandyButton label="FRONT OFFICE" icon="🏢" variant="secondary" size="md" fullWidth style={{ flex: 1 }} onPress={() => setOverlay('frontoffice')} />
          <CandyButton label="STORE" icon="🛒" variant="teamB" size="md" fullWidth style={{ flex: 1 }} onPress={() => setOverlay('store')} />
        </View>
      </View>

      {/* Slide-in overlays — open/close without leaving the lobby */}
      {overlay && (
        <Animated.View
          entering={SlideInRight.duration(220)}
          exiting={SlideOutRight.duration(180)}
          style={StyleSheet.absoluteFill}
        >
          {overlay === 'roster' && <Roster onClose={() => setOverlay(null)} />}
          {overlay === 'frontoffice' && <FrontOffice onClose={() => setOverlay(null)} />}
          {overlay === 'store' && <Store onClose={() => setOverlay(null)} />}
        </Animated.View>
      )}
    </ScreenBG>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: R.lg,
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.25)',
    ...SHADOW,
  },
  crest: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crestTxt: { fontFamily: FONT.black, fontSize: 22, color: T.white, ...OUTLINE },
  sub: { fontFamily: FONT.semi, fontSize: 12, color: 'rgba(255,255,255,0.9)', marginTop: 2 },
  hPill: { backgroundColor: 'rgba(0,0,0,0.28)' },
  menuBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  body: { flex: 1, flexDirection: 'row', gap: SP.md, marginTop: SP.md, minHeight: 0 },
  nextInner: { padding: SP.lg, gap: SP.md },
  goalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  goalTag: { fontFamily: FONT.bold, fontSize: 10, letterSpacing: 1.5, color: T.muted },
  goalTxt: { fontFamily: FONT.bold, fontSize: 13, color: T.gold },
  nextLabel: { fontFamily: FONT.black, fontSize: 13, letterSpacing: 1, color: T.amber },
  vsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  vs: { fontFamily: FONT.semi, fontSize: 13, color: T.muted },
  oppChip: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: 8, borderWidth: 2, borderColor: 'rgba(0,0,0,0.25)' },
  oppAbbr: { fontFamily: FONT.black, fontSize: 12, color: T.white, ...OUTLINE },
  lastResult: { fontFamily: FONT.medium, fontSize: 12, color: T.muted },

  stdWrap: { flex: 1, padding: 10, minHeight: 0 },
  stdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 10,
    marginBottom: 3,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  stdPlayoff: { backgroundColor: 'rgba(242,201,76,0.08)' },
  stdMe: { backgroundColor: 'rgba(232,163,61,0.2)', borderColor: T.amber },
  stdRank: { width: 16, fontFamily: FONT.bold, fontSize: 12, color: T.muted, textAlign: 'center' },
  stdDot: { width: 12, height: 12, borderRadius: 4 },
  stdName: { flex: 1, fontFamily: FONT.semi, fontSize: 13, color: T.white },
  stdRec: { fontFamily: FONT.black, fontSize: 12, color: T.white },
  stdFoot: { marginTop: 6, fontFamily: FONT.medium, fontSize: 10, color: T.muted },

  nav: { flexDirection: 'row', gap: SP.sm, marginTop: SP.md },
})
