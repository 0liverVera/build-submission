import { useGame } from './state/store'
import MainMenu from './screens/MainMenu'
import NewFranchise from './screens/NewFranchise'
import Hub from './screens/Hub'
import Placeholder from './screens/Placeholder'

export default function App() {
  const screen = useGame((s) => s.screen)

  return (
    <div className="stage">
      {screen === 'menu' && <MainMenu />}
      {screen === 'newFranchise' && <NewFranchise />}
      {screen === 'hub' && <Hub />}
      {screen === 'game' && (
        <Placeholder
          title="GAME DAY"
          icon="🏀"
          note="The on-court action — the heart of the game — arrives in Phase 2."
        />
      )}
      {screen === 'roster' && (
        <Placeholder title="ROSTER" icon="👥" note="Players & ratings arrive in Phase 4." />
      )}
      {screen === 'frontoffice' && (
        <Placeholder
          title="FRONT OFFICE"
          icon="🏢"
          note="Facilities, morale & press events arrive in Phase 5."
        />
      )}
      {screen === 'store' && (
        <Placeholder
          title="STORE"
          icon="🛒"
          note="Credit packs & the team editor arrive in Phase 10."
        />
      )}
    </div>
  )
}
