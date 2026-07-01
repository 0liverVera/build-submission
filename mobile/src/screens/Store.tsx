import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native'
import { Screen, ScreenHeader } from '../ui/Screen'
import Button from '../ui/Button'
import { useGame } from '../state/store'
import { C, PIXEL } from '../theme'

/** Mock store (Section 9) — every "purchase" just grants the item. */
const PACKS = [
  { id: 'sm', label: 'Handful', credits: 80, price: '$1.99', tag: '' },
  { id: 'md', label: 'Sack', credits: 260, price: '$4.99', tag: 'POPULAR' },
  { id: 'lg', label: 'Vault', credits: 700, price: '$9.99', tag: 'BEST VALUE' },
]

export default function Store({ onClose }: { onClose?: () => void } = {}) {
  const f = useGame((s) => s.franchise)
  const navigate = useGame((s) => s.navigate)
  const buyCreditsPack = useGame((s) => s.buyCreditsPack)
  const buyUnlimited = useGame((s) => s.buyUnlimited)
  const watchAdForCredits = useGame((s) => s.watchAdForCredits)
  const buyRetryToken = useGame((s) => s.buyRetryToken)
  const storeAd = useGame((s) => s.storeAd)
  if (!f) return null

  return (
    <Screen>
      <ScreenHeader
        title="STORE"
        onBack={onClose ?? (() => navigate('lobby'))}
        right={
          <View style={styles.stats}>
            <Text style={[styles.pill, styles.pillGold]}>🪙 {f.credits}</Text>
            <Text style={styles.pill}>🎟️ {f.retryTokens ?? 0}</Text>
          </View>
        }
      />

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {/* Headline: Unlimited unlock */}
        <View style={[styles.unlimitedCard, f.unlimited && styles.unlimitedOwned]}>
          <View style={styles.ulTag}>
            <Text style={styles.ulTagTxt}>★ ONE-TIME</Text>
          </View>
          <View style={styles.ulLeft}>
            <Text style={styles.ulTitle}>UNLIMITED</Text>
            <Text style={styles.ulDesc}>
              Unlock the <Text style={styles.ulBold}>Team Editor</Text> — rename your team & city,
              pick custom colors & jerseys. Plus a 🪙100 bonus.
            </Text>
          </View>
          {f.unlimited ? (
            <Button variant="primary" onPress={() => navigate('teameditor')}>
              ✎ EDIT TEAM
            </Button>
          ) : (
            <Button variant="primary" onPress={buyUnlimited}>
              UNLOCK · $4.99
            </Button>
          )}
        </View>

        {/* Credit packs */}
        <View style={styles.col}>
          <Text style={styles.osLabel}>💰 COACHING CREDITS</Text>
          <View style={styles.packRow}>
            {PACKS.map((p) => (
              <View key={p.id} style={styles.packCard}>
                {!!p.tag && (
                  <View style={styles.packTag}>
                    <Text style={styles.packTagTxt}>{p.tag}</Text>
                  </View>
                )}
                <Text style={styles.packAmt}>🪙 {p.credits}</Text>
                <Text style={styles.packName}>{p.label}</Text>
                <Button
                  variant="secondary"
                  style={styles.packBtn}
                  textStyle={{ fontSize: 12 }}
                  onPress={() => buyCreditsPack(p.credits)}
                >
                  {p.price}
                </Button>
              </View>
            ))}
          </View>
        </View>

        {/* Free + consumables */}
        <View style={styles.col}>
          <Text style={styles.osLabel}>🎁 MORE</Text>
          <View style={styles.freeRow}>
            <View style={styles.freeInfo}>
              <Text style={styles.freeName}>📺 Watch Ad</Text>
              <Text style={styles.freeDesc}>Earn 15 credits</Text>
            </View>
            <Button variant="primary" onPress={watchAdForCredits} disabled={storeAd}>
              {storeAd ? 'Watching…' : '+15 🪙'}
            </Button>
          </View>
          <View style={styles.freeRow}>
            <View style={styles.freeInfo}>
              <Text style={styles.freeName}>🎟️ Retry Token</Text>
              <Text style={styles.freeDesc}>Saves your job from a firing</Text>
            </View>
            <Button variant="secondary" onPress={buyRetryToken}>
              $0.99
            </Button>
          </View>
          <Text style={styles.disclaimer}>
            Prototype — mock purchases only. No payment is processed.
          </Text>
        </View>
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: 8, marginLeft: 'auto', alignItems: 'center' },
  pill: {
    fontFamily: PIXEL,
    fontSize: 11,
    color: C.cream,
    backgroundColor: C.panel,
    borderWidth: 2,
    borderColor: C.line,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
    overflow: 'hidden',
  },
  pillGold: { color: C.gold, borderColor: C.goldDeep },

  body: { flex: 1 },
  bodyContent: { gap: 12, paddingBottom: 8 },

  // Unlimited upsell card
  unlimitedCard: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: C.gold,
    borderWidth: 3,
    borderColor: C.goldDeep,
    borderBottomWidth: 5,
    borderBottomColor: C.goldDeep,
    overflow: 'hidden',
  },
  unlimitedOwned: { opacity: 0.9 },
  ulTag: {
    position: 'absolute',
    top: 12,
    right: -34,
    transform: [{ rotate: '38deg' }],
    backgroundColor: C.ink,
    paddingVertical: 3,
    paddingHorizontal: 38,
  },
  ulTagTxt: { color: C.gold, fontSize: 10, fontWeight: '700' },
  ulLeft: { flex: 1, minWidth: 0 },
  ulTitle: { fontFamily: PIXEL, fontSize: 18, color: C.ink },
  ulDesc: { fontSize: 12, color: '#4a2c10', lineHeight: 17, marginTop: 4 },
  ulBold: { fontWeight: '700', color: C.ink },

  col: { gap: 8 },
  osLabel: { fontFamily: PIXEL, fontSize: 11, color: C.muted, letterSpacing: 0.5 },

  // Credit packs
  packRow: { flexDirection: 'row', gap: 8 },
  packCard: {
    position: 'relative',
    flex: 1,
    alignItems: 'center',
    gap: 5,
    paddingTop: 14,
    paddingBottom: 10,
    paddingHorizontal: 6,
    borderRadius: 14,
    backgroundColor: C.panel,
    borderWidth: 2,
    borderColor: C.line,
  },
  packTag: {
    position: 'absolute',
    top: -8,
    backgroundColor: C.danger,
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 999,
  },
  packTagTxt: { color: '#fff', fontSize: 8, fontWeight: '700', letterSpacing: 0.5 },
  packAmt: { fontFamily: PIXEL, fontSize: 13, color: C.gold },
  packName: { fontSize: 11, color: C.muted },
  packBtn: { width: '100%', paddingVertical: 8, paddingHorizontal: 8 },

  // Free + consumables
  freeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: C.panel,
    borderWidth: 2,
    borderColor: C.line,
  },
  freeInfo: { flex: 1, minWidth: 0 },
  freeName: { fontWeight: '700', fontSize: 14, color: C.cream },
  freeDesc: { fontSize: 11, color: C.muted, marginTop: 2 },
  disclaimer: { fontSize: 10, color: C.muted, textAlign: 'center', marginTop: 4 },
})
