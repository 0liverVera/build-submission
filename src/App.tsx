import { useGame } from './state/store'
import MainMenu from './screens/MainMenu'
import NewFranchise from './screens/NewFranchise'
import Hub from './screens/Hub'
import Placeholder from './screens/Placeholder'
import CourtGame from './court/CourtGame'
import RotateGate from './ui/RotateGate'

export default function App() {
  const screen = useGame((s) => s.screen)

  return (
    <div className="stage">
      <RotateGate />
      {screen === 'menu' && <MainMenu />}
      {screen === 'newFranchise' && <NewFranchise />}
      {screen === 'hub' && <Hub />}
      {screen === 'game' && <CourtGame />}
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
