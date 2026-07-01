import { useEffect, useState } from 'react'
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useFonts, PressStart2P_400Regular } from '@expo-google-fonts/press-start-2p'
import {
  Baloo2_400Regular,
  Baloo2_500Medium,
  Baloo2_600SemiBold,
  Baloo2_700Bold,
  Baloo2_800ExtraBold,
} from '@expo-google-fonts/baloo-2'
import * as ScreenOrientation from 'expo-screen-orientation'
import AsyncStorage from '@react-native-async-storage/async-storage'

import { useGame } from './src/state/store'
import { C, PIXEL } from './src/theme'
import { setMusicMuted, playTrack } from './src/audio/music'
import { setSfxMuted } from './src/audio/sfx'

import MainMenu from './src/screens/MainMenu'
import NewFranchise from './src/screens/NewFranchise'
import Lobby from './src/screens/Lobby'
import Roster from './src/screens/Roster'
import FrontOffice from './src/screens/FrontOffice'
import Press from './src/screens/Press'
import Offseason from './src/screens/Offseason'
import Store from './src/screens/Store'
import TeamEditor from './src/screens/TeamEditor'
import CharacterAnimTest from './src/screens/CharacterAnimTest'
import Court5v5 from './src/court/Court5v5'

const MUTE_KEY = 'hoop_muted'

function Toast() {
  const toast = useGame((s) => s.toast)
  const clearToast = useGame((s) => s.clearToast)
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(clearToast, 1800)
    return () => clearTimeout(t)
  }, [toast, clearToast])
  if (!toast) return null
  return (
    <View style={styles.toastWrap} pointerEvents="none">
      <Text style={styles.toast}>{toast}</Text>
    </View>
  )
}

function MuteButton() {
  const [muted, setMuted] = useState(false)
  useEffect(() => {
    AsyncStorage.getItem(MUTE_KEY).then((v) => setMuted(v === '1'))
  }, [])
  useEffect(() => {
    setMusicMuted(muted)
    setSfxMuted(muted)
    AsyncStorage.setItem(MUTE_KEY, muted ? '1' : '0').catch(() => {})
  }, [muted])
  return (
    <Pressable style={styles.muteBtn} onPress={() => setMuted((m) => !m)}>
      <Text style={{ fontSize: 15 }}>{muted ? '🔇' : '🔊'}</Text>
    </Pressable>
  )
}

function Router() {
  const screen = useGame((s) => s.screen)
  useEffect(() => {
    playTrack(screen === 'menu' || screen === 'newFranchise' ? 'menu' : 'game')
  }, [screen])

  switch (screen) {
    case 'menu':
      return <MainMenu />
    case 'newFranchise':
      return <NewFranchise />
    // hub + season are folded into the single lobby
    case 'hub':
    case 'season':
    case 'lobby':
      return <Lobby />
    case 'game':
      return <Court5v5 matchMode />
    case 'offseason':
      return <Offseason />
    case 'roster':
      return <Roster />
    case 'frontoffice':
      return <FrontOffice />
    case 'press':
      return <Press />
    case 'store':
      return <Store />
    case 'teameditor':
      return <TeamEditor />
    case 'animtest':
      return <CharacterAnimTest />
    default:
      return <MainMenu />
  }
}

export default function App() {
  const [fontsLoaded] = useFonts({
    [PIXEL]: PressStart2P_400Regular,
    Baloo2_400Regular,
    Baloo2_500Medium,
    Baloo2_600SemiBold,
    Baloo2_700Bold,
    Baloo2_800ExtraBold,
  })
  const hydrate = useGame((s) => s.hydrate)
  const hydrated = useGame((s) => s.hydrated)
  const screen = useGame((s) => s.screen)

  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {})
    hydrate()
  }, [hydrate])

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#0a0c16' }}>
      <SafeAreaProvider>
        <StatusBar hidden />
        {!fontsLoaded || !hydrated ? (
          <View style={styles.boot}>
            <ActivityIndicator color={C.orange} size="large" />
            <Text style={styles.bootText}>HOOP DYNASTY</Text>
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <Router />
            {screen === 'menu' && <MuteButton />}
            <Toast />
          </View>
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    backgroundColor: C.bg,
  },
  bootText: { fontFamily: PIXEL, fontSize: 14, color: C.orange, letterSpacing: 1 },
  muteBtn: {
    position: 'absolute',
    top: 8,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.32)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastWrap: {
    position: 'absolute',
    top: 12,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 130,
  },
  toast: {
    fontWeight: '700',
    fontSize: 14,
    color: C.cream,
    backgroundColor: 'rgba(11,14,28,0.94)',
    borderWidth: 2,
    borderColor: C.gold,
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 999,
    overflow: 'hidden',
  },
})
