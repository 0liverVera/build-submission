import { type ReactNode } from 'react'
import { View, Text, Pressable, StyleSheet, type ViewStyle, type TextStyle, type StyleProp } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withSpring,
  ZoomIn,
} from 'react-native-reanimated'
import { T, R, SP, FONT, OUTLINE, SHADOW } from '../theme'
import { sfx } from '../audio/sfx'

/* ---------------------------------------------------------------------------
 * Premium UI kit — Supercell-style. One palette, one font, one shape language.
 * -------------------------------------------------------------------------*/

/** Full-screen energetic gradient backdrop. */
export function ScreenBG({ children, style }: { children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <LinearGradient colors={[T.bgTop, T.bgMid, T.bgBottom]} style={[{ flex: 1 }, style]}>
      {children}
    </LinearGradient>
  )
}

/** Outlined heading/number text (thick dark outline + soft shadow). */
export function Heading({
  children,
  size = 22,
  color = T.white,
  style,
}: {
  children: ReactNode
  size?: number
  color?: string
  style?: StyleProp<TextStyle>
}) {
  return (
    <Text style={[{ fontFamily: FONT.black, fontSize: size, color, letterSpacing: 0.5 }, OUTLINE, style]}>
      {children}
    </Text>
  )
}

type Variant = 'primary' | 'teamA' | 'teamB' | 'secondary' | 'success'
const VARIANT: Record<Variant, { a: string; b: string; band: string; fg: string }> = {
  primary: { a: '#F8DC86', b: T.amber, band: T.amberDeep, fg: T.ink },
  teamA: { a: '#5CBAF0', b: T.teamA, band: T.teamADeep, fg: T.white },
  teamB: { a: '#F58A8A', b: T.teamB, band: T.teamBDeep, fg: T.white },
  secondary: { a: T.panelRaised, b: T.panel, band: T.panelDeep, fg: T.white },
  success: { a: '#54D78E', b: T.green, band: T.greenDeep, fg: T.white },
}

/** Chunky 3D pressable button with squish→overshoot bounce + click. */
export function CandyButton({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  disabled,
  icon,
  style,
  textStyle,
  fullWidth,
}: {
  label: string
  onPress?: () => void
  variant?: Variant
  size?: 'lg' | 'md' | 'sm'
  disabled?: boolean
  icon?: string
  style?: StyleProp<ViewStyle>
  textStyle?: StyleProp<TextStyle>
  fullWidth?: boolean
}) {
  const scale = useSharedValue(1)
  const ty = useSharedValue(0)
  const v = VARIANT[variant]
  const depth = size === 'lg' ? 7 : size === 'md' ? 6 : 4
  const padV = size === 'lg' ? 16 : size === 'md' ? 12 : 9
  const padH = size === 'lg' ? 28 : size === 'md' ? 20 : 14
  const fontSize = size === 'lg' ? 20 : size === 'md' ? 16 : 13

  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }, { translateY: ty.value }] }))

  return (
    <Pressable
      disabled={disabled}
      onPressIn={() => {
        scale.value = withTiming(0.94, { duration: 70 })
        ty.value = withTiming(depth - 2, { duration: 70 })
      }}
      onPressOut={() => {
        scale.value = withSequence(withTiming(1.06, { duration: 90 }), withSpring(1, { damping: 7, stiffness: 220 }))
        ty.value = withTiming(0, { duration: 110 })
      }}
      onPress={() => {
        sfx.tap()
        onPress?.()
      }}
      style={[fullWidth && { alignSelf: 'stretch' }, style]}
    >
      <Animated.View style={[fullWidth && { width: '100%' }, disabled && { opacity: 0.45 }, aStyle]}>
        <View
          style={{
            borderRadius: R.lg,
            backgroundColor: v.band,
            borderBottomWidth: depth,
            borderBottomColor: v.band,
            ...SHADOW,
          }}
        >
          <LinearGradient
            colors={disabled ? ['#5A6B8C', '#3E4D6E'] : [v.a, v.b]}
            style={{
              borderRadius: R.lg,
              paddingVertical: padV,
              paddingHorizontal: padH,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              borderWidth: 2,
              borderColor: 'rgba(255,255,255,0.35)',
            }}
          >
            {!!icon && <Text style={{ fontSize: fontSize + 2 }}>{icon}</Text>}
            <Text
              style={[
                { fontFamily: FONT.black, fontSize, color: v.fg, letterSpacing: 0.5 },
                v.fg === T.white && OUTLINE,
                textStyle,
              ]}
            >
              {label}
            </Text>
          </LinearGradient>
        </View>
      </Animated.View>
    </Pressable>
  )
}

/** Rounded layered panel with subtle gradient + optional title bar. */
export function Panel({
  children,
  title,
  style,
  padded = true,
}: {
  children?: ReactNode
  title?: string
  style?: StyleProp<ViewStyle>
  padded?: boolean
}) {
  return (
    <View style={[{ borderRadius: R.lg, ...SHADOW }, style]}>
      <LinearGradient
        colors={[T.panelRaised, T.panel]}
        style={{
          borderRadius: R.lg,
          borderWidth: 2,
          borderColor: 'rgba(255,255,255,0.08)',
          overflow: 'hidden',
        }}
      >
        {!!title && (
          <LinearGradient colors={[T.panelDeep, 'rgba(0,0,0,0.1)']} style={styles.titleBar}>
            <Heading size={13} color={T.gold}>
              {title.toUpperCase()}
            </Heading>
          </LinearGradient>
        )}
        <View style={padded ? { padding: SP.md } : undefined}>{children}</View>
      </LinearGradient>
    </View>
  )
}

/** Rounded stat / currency pill: icon + label + bold value. */
export function StatPill({
  icon,
  label,
  value,
  valueColor = T.gold,
  style,
}: {
  icon?: string
  label?: string
  value: string | number
  valueColor?: string
  style?: StyleProp<ViewStyle>
}) {
  return (
    <View style={[styles.pill, style]}>
      {!!icon && <Text style={{ fontSize: 14 }}>{icon}</Text>}
      {!!label && <Text style={styles.pillLabel}>{label}</Text>}
      <Text style={[styles.pillValue, { color: valueColor }]}>{value}</Text>
    </View>
  )
}

/** Small label badge. */
export function Badge({ text, color = T.teamA, style }: { text: string; color?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.badge, { backgroundColor: color }, style]}>
      <Text style={styles.badgeText}>{text}</Text>
    </View>
  )
}

/** Animated floating callout — pops in with overshoot. */
export function PopText({
  children,
  color = T.gold,
  size = 24,
  style,
}: {
  children: ReactNode
  color?: string
  size?: number
  style?: StyleProp<TextStyle>
}) {
  return (
    <Animated.Text
      entering={ZoomIn.springify().damping(10).stiffness(170)}
      style={[{ fontFamily: FONT.black, fontSize: size, color, letterSpacing: 0.5 }, OUTLINE, style]}
    >
      {children}
    </Animated.Text>
  )
}

const styles = StyleSheet.create({
  titleBar: {
    paddingVertical: SP.xs,
    paddingHorizontal: SP.md,
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(0,0,0,0.25)',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: T.panelDeep,
    borderRadius: R.pill,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  pillLabel: { fontFamily: FONT.bold, fontSize: 11, color: T.muted, letterSpacing: 1 },
  pillValue: { fontFamily: FONT.black, fontSize: 15, color: T.gold },
  badge: {
    borderRadius: R.sm,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  badgeText: { fontFamily: FONT.black, fontSize: 11, color: T.white, ...OUTLINE },
})
