import { useState } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { Screen } from '../ui/Screen'
import Button from '../ui/Button'
import { useGame } from '../state/store'
import { sfx } from '../audio/sfx'
import { C, PIXEL } from '../theme'

export default function Press() {
  const event = useGame((s) => s.pendingEvent)
  const resolve = useGame((s) => s.resolvePressEvent)
  const navigate = useGame((s) => s.navigate)
  // Snapshot once so the card persists after the event is cleared.
  const [snapshot] = useState(event)
  const [result, setResult] = useState<string | null>(null)
  const [reaction, setReaction] = useState('😐')

  if (!snapshot) return null

  const choose = (i: number) => {
    sfx.confirm()
    const eff = snapshot.choices[i].effect
    const net =
      (eff.teamMorale ?? 0) + (eff.starMorale ?? 0) + (eff.othersMorale ?? 0) + (eff.fanInterest ?? 0)
    setReaction(net > 2 ? '😀' : net < -2 ? '😟' : '😐')
    setResult(snapshot.choices[i].result)
    resolve(i)
  }

  return (
    <Screen center>
      <View style={styles.card}>
        <Text style={styles.tag}>PRESS ROOM</Text>
        <Text style={styles.speaker}>{snapshot.speaker}</Text>
        <Text style={styles.prompt}>“{snapshot.prompt}”</Text>

        {result === null ? (
          <View style={styles.choices}>
            {snapshot.choices.map((c, i) => (
              <Button
                key={i}
                variant={i === 0 ? 'primary' : 'secondary'}
                onPress={() => choose(i)}
                style={styles.choiceBtn}
              >
                {c.label}
              </Button>
            ))}
          </View>
        ) : (
          <View style={styles.resultBox}>
            <Text style={styles.reaction}>{reaction}</Text>
            <Text style={styles.resultText}>{result}</Text>
            <Button
              variant="primary"
              style={styles.continueBtn}
              onPress={() => {
                sfx.tap()
                navigate('lobby')
              }}
            >
              CONTINUE ▶
            </Button>
          </View>
        )}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: 560,
    flexDirection: 'column',
    gap: 14,
    padding: 22,
    borderRadius: 18,
    backgroundColor: C.panel2,
    borderWidth: 3,
    borderColor: C.line,
  },
  tag: {
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: '700',
    color: C.orange,
  },
  speaker: {
    fontFamily: PIXEL,
    fontSize: 14,
    color: C.gold,
  },
  prompt: {
    fontSize: 17,
    lineHeight: 24,
    color: C.cream,
  },
  choices: {
    flexDirection: 'column',
    gap: 10,
  },
  choiceBtn: { width: '100%' },
  resultBox: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
  },
  reaction: { fontSize: 46 },
  resultText: {
    fontSize: 16,
    color: C.teal,
    lineHeight: 22,
    textAlign: 'center',
  },
  continueBtn: { width: '100%' },
})
