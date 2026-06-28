import { useState } from 'react'
import Button from '../ui/Button'
import { useGame } from '../state/store'
import { sfx } from '../audio/sfx'

export default function Press() {
  const event = useGame((s) => s.pendingEvent)
  const resolve = useGame((s) => s.resolvePressEvent)
  const navigate = useGame((s) => s.navigate)
  // Snapshot once so the card persists after the event is cleared.
  const [snapshot] = useState(event)
  const [result, setResult] = useState<string | null>(null)

  if (!snapshot) return null

  const choose = (i: number) => {
    sfx.confirm()
    setResult(snapshot.choices[i].result)
    resolve(i)
  }

  return (
    <div className="screen press-screen">
      <div className="press-card">
        <div className="press-tag">PRESS ROOM</div>
        <div className="press-speaker">{snapshot.speaker}</div>
        <div className="press-prompt">“{snapshot.prompt}”</div>

        {result === null ? (
          <div className="press-choices">
            {snapshot.choices.map((c, i) => (
              <Button
                key={i}
                variant={i === 0 ? 'primary' : 'secondary'}
                onClick={() => choose(i)}
              >
                {c.label}
              </Button>
            ))}
          </div>
        ) : (
          <div className="press-result">
            <div className="pr-text">{result}</div>
            <Button
              variant="primary"
              onClick={() => {
                sfx.tap()
                navigate('season')
              }}
            >
              CONTINUE ▶
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
