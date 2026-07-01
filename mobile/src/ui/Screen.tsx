import { View, Text, Pressable, StyleSheet, type ViewStyle, type StyleProp } from 'react-native'
import { type ReactNode } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { C, PIXEL } from '../theme'
import { sfx } from '../audio/sfx'

/** Full-screen container matching the web `.screen` (safe-area padding + dark bg). */
export function Screen({
  children,
  style,
  center,
  row,
}: {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  center?: boolean
  row?: boolean
}) {
  const insets = useSafeAreaInsets()
  return (
    <View
      style={[
        styles.screen,
        {
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + 12,
          paddingLeft: insets.left + 22,
          paddingRight: insets.right + 22,
        },
        row && { flexDirection: 'row' },
        center && { alignItems: 'center', justifyContent: 'center' },
        style,
      ]}
    >
      {children}
    </View>
  )
}

/** Sub-screen header: ‹ back chevron + pixel title. */
export function ScreenHeader({
  title,
  onBack,
  right,
  style,
}: {
  title: string
  onBack: () => void
  right?: ReactNode
  style?: StyleProp<ViewStyle>
}) {
  return (
    <View style={[styles.head, style]}>
      <Pressable
        onPress={() => {
          sfx.tap()
          onBack()
        }}
        hitSlop={10}
      >
        <Text style={styles.back}>‹</Text>
      </Pressable>
      <Text style={styles.headTitle}>{title}</Text>
      {right}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, flexDirection: 'column', backgroundColor: C.bg },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  back: { fontSize: 30, lineHeight: 32, color: C.cream, paddingRight: 4 },
  headTitle: { fontFamily: PIXEL, fontSize: 15, color: C.cream, letterSpacing: 1 },
})
