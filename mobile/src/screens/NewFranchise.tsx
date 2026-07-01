import { useState } from 'react'
import { View, Text, Pressable, TextInput, ScrollView, StyleSheet } from 'react-native'
import { Screen, ScreenHeader } from '../ui/Screen'
import Button from '../ui/Button'
import { C, PIXEL } from '../theme'
import { useGame } from '../state/store'
import { sfx } from '../audio/sfx'

const THEMES = [
  { p: '#ff8a3d', s: '#14182b' },
  { p: '#2dd4bf', s: '#0b3b36' },
  { p: '#e8503a', s: '#2a0e0a' },
  { p: '#3a7be8', s: '#0a1a3a' },
  { p: '#b86bff', s: '#2a1050' },
  { p: '#ffcf4a', s: '#4a3608' },
]

export default function NewFranchise() {
  const navigate = useGame((s) => s.navigate)
  const start = useGame((s) => s.startNewFranchise)

  const [coach, setCoach] = useState('')
  const [city, setCity] = useState('')
  const [team, setTeam] = useState('')
  const [theme, setTheme] = useState(0)

  const t = THEMES[theme]
  const crestLetter = (team.trim()[0] || '?').toUpperCase()

  return (
    <Screen>
      <ScreenHeader title="NEW FRANCHISE" onBack={() => navigate('menu')} />

      <View style={styles.body}>
        {/* Left column: crest preview + team colors */}
        <View style={styles.col}>
          <View style={styles.crestPreview}>
            <View style={[styles.crest, { backgroundColor: t.p, borderColor: t.s }]}>
              <Text style={styles.crestLetter}>{crestLetter}</Text>
            </View>
            <Text style={styles.crestName}>
              {(city.trim() || 'Riverside') + ' ' + (team.trim() || 'Hoops')}
            </Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>TEAM COLORS</Text>
            <View style={styles.themeRow}>
              {THEMES.map((th, i) => {
                const on = i === theme
                return (
                  <Pressable
                    key={i}
                    onPress={() => {
                      sfx.tap()
                      setTheme(i)
                    }}
                    style={[
                      styles.swatch,
                      { backgroundColor: th.p },
                      on && styles.swatchOn,
                    ]}
                  />
                )
              })}
            </View>
          </View>
        </View>

        {/* Right column: inputs + create button */}
        <ScrollView
          style={styles.col}
          contentContainerStyle={styles.rightInner}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.field}>
            <Text style={styles.label}>COACH NAME</Text>
            <TextInput
              value={coach}
              onChangeText={setCoach}
              maxLength={16}
              placeholder="Coach"
              placeholderTextColor="#5a628c"
              style={styles.input}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>CITY</Text>
            <TextInput
              value={city}
              onChangeText={setCity}
              maxLength={16}
              placeholder="Riverside"
              placeholderTextColor="#5a628c"
              style={styles.input}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>TEAM NAME</Text>
            <TextInput
              value={team}
              onChangeText={setTeam}
              maxLength={16}
              placeholder="Hoops"
              placeholderTextColor="#5a628c"
              style={styles.input}
            />
          </View>

          <View style={styles.foot}>
            <Button
              variant="primary"
              style={styles.createBtn}
              onPress={() => {
                sfx.confirm()
                start({
                  coachName: coach,
                  city,
                  teamName: team,
                  colorPrimary: t.p,
                  colorSecondary: t.s,
                })
              }}
            >
              CREATE TEAM ▶
            </Button>
          </View>
        </ScrollView>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    flexDirection: 'row',
    gap: 22,
  },
  col: {
    flex: 1,
    gap: 12,
  },
  rightInner: {
    gap: 12,
    justifyContent: 'center',
    flexGrow: 1,
  },
  crestPreview: {
    alignItems: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 18,
    backgroundColor: C.panel,
    borderWidth: 2,
    borderColor: C.line,
  },
  crest: {
    width: 76,
    height: 76,
    borderRadius: 20,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crestLetter: {
    fontFamily: PIXEL,
    fontSize: 30,
    color: C.cream,
  },
  crestName: {
    fontFamily: PIXEL,
    fontSize: 12,
    color: C.cream,
    textAlign: 'center',
  },
  field: {
    gap: 7,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    color: C.muted,
  },
  input: {
    fontSize: 16,
    fontWeight: '600',
    color: C.cream,
    backgroundColor: C.bg,
    borderWidth: 2,
    borderColor: C.line,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  themeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: C.line,
  },
  swatchOn: {
    borderColor: C.cream,
    shadowColor: C.gold,
    shadowOpacity: 0.6,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  foot: {
    paddingTop: 6,
  },
  createBtn: {
    width: '100%',
  },
})
