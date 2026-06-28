import { useGame } from './state/store'
import MainMenu from './screens/MainMenu'
import NewFranchise from './screens/NewFranchise'
import Hub from './screens/Hub'
import Placeholder from './screens/Placeholder'
import Roster from './screens/Roster'
import FrontOffice from './screens/FrontOffice'
import Press from './screens/Press'
import GameScreen from './court/GameScreen'
import RotateGate from './ui/RotateGate'

export default function App() {
  const screen = useGame((s) => s.screen)

  return (
    <div className="stage">
      <RotateGate />
      {screen === 'menu' && <MainMenu />}
      {screen === 'newFranchise' && <NewFranchise />}
      {screen === 'hub' && <Hub />}
      {screen === 'game' && <GameScreen />}
      {screen === 'roster' && <Roster />}
      {screen === 'frontoffice' && <FrontOffice />}
      {screen === 'press' && <Press />}
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
