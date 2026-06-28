import Button from '../ui/Button'
import { useGame } from '../state/store'

/** Shell for sections that arrive in later phases. */
export default function Placeholder({
  title,
  icon,
  note,
}: {
  title: string
  icon: string
  note: string
}) {
  const navigate = useGame((s) => s.navigate)
  return (
    <div className="screen ph-screen">
      <header className="screen-head">
        <Button variant="ghost" className="back" onClick={() => navigate('hub')}>
          ‹
        </Button>
        <h2>{title}</h2>
      </header>
      <div className="ph-body">
        <div className="ph-icon">{icon}</div>
        <div className="ph-note">{note}</div>
      </div>
    </div>
  )
}
