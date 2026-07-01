import { Pressable, Text, StyleSheet, View, type ViewStyle, type StyleProp } from 'react-native'
import { useState, type ReactNode } from 'react'
import { C, PIXEL } from '../theme'
import { sfx } from '../audio/sfx'

type Variant = 'primary' | 'secondary' | 'ghost'

type Props = {
  children: ReactNode
  onPress?: () => void
  variant?: Variant
  disabled?: boolean
  style?: StyleProp<ViewStyle>
  textStyle?: StyleProp<{ fontSize?: number; color?: string }>
}

/**
 * Chunky candy button: gradient-ish fill, a hard bottom edge ("0 5px 0"), and a
 * press squish that drops it onto the edge — the web .btn look in RN.
 */
export default function Button({
  children,
  onPress,
  variant = 'primary',
  disabled,
  style,
  textStyle,
}: Props) {
  const [down, setDown] = useState(false)
  const v = VARIANTS[variant]
  const isGhost = variant === 'ghost'

  return (
    <Pressable
      disabled={disabled}
      onPressIn={() => setDown(true)}
      onPressOut={() => setDown(false)}
      onPress={() => {
        sfx.tap()
        onPress?.()
      }}
      style={[
        styles.base,
        { backgroundColor: v.bg },
        isGhost && styles.ghost,
        !isGhost && {
          // Hard bottom edge becomes thin when pressed (button "drops").
          borderBottomWidth: down ? 2 : 5,
          borderBottomColor: v.edge,
          transform: [{ translateY: down ? 3 : 0 }],
        },
        isGhost && down && { opacity: 0.7, transform: [{ scale: 0.92 }] },
        disabled && { opacity: 0.4 },
        style,
      ]}
    >
      {typeof children === 'string' ? (
        <Text style={[styles.label, { color: v.fg }, textStyle]}>{children}</Text>
      ) : (
        <View>{children}</View>
      )}
    </Pressable>
  )
}

const VARIANTS: Record<Variant, { bg: string; edge: string; fg: string }> = {
  primary: { bg: C.orange, edge: '#a8470f', fg: C.ink },
  secondary: { bg: C.panel, edge: '#161a2e', fg: C.cream },
  ghost: { bg: 'transparent', edge: 'transparent', fg: C.cream },
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghost: { paddingVertical: 8, paddingHorizontal: 12 },
  label: {
    fontFamily: PIXEL,
    fontSize: 13,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
})
