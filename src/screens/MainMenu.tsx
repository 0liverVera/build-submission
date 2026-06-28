import Button from '../ui/Button'
import { useGame } from '../state/store'

export default function MainMenu() {
  const hasSave = useGame((s) => s.hasSave)
  const navigate = useGame((s) => s.navigate)
  const continueSave = useGame((s) => s.continueSave)

  return (
    <div className="screen menu-screen">
      <div className="menu-court" aria-hidden />
      <div className="menu-logo">
        <div className="ball">🏀</div>
        <h1 className="title">
          HOOP
          <br />
          DYNASTY
        </h1>
        <p className="tagline">ARCADE HOOPS · FRANCHISE GLORY</p>
      </div>

      <div className="menu-actions">
        {hasSave && (
          <Button variant="primary" onClick={continueSave}>
            ▶ CONTINUE
          </Button>
        )}
        <Button
          variant={hasSave ? 'secondary' : 'primary'}
          onClick={() => navigate('newFranchise')}
        >
          ＋ NEW FRANCHISE
        </Button>
      </div>

      <div className="menu-foot">Offline prototype · v0.1</div>
    </div>
  )
}
