import Button from '../ui/Button'
import { useGame } from '../state/store'

/** Mock store (Section 9) — every "purchase" just grants the item. */
const PACKS = [
  { id: 'sm', label: 'Handful', credits: 80, price: '$1.99', tag: '' },
  { id: 'md', label: 'Sack', credits: 260, price: '$4.99', tag: 'POPULAR' },
  { id: 'lg', label: 'Vault', credits: 700, price: '$9.99', tag: 'BEST VALUE' },
]

export default function Store() {
  const f = useGame((s) => s.franchise)
  const navigate = useGame((s) => s.navigate)
  const buyCreditsPack = useGame((s) => s.buyCreditsPack)
  const buyUnlimited = useGame((s) => s.buyUnlimited)
  const watchAdForCredits = useGame((s) => s.watchAdForCredits)
  const buyRetryToken = useGame((s) => s.buyRetryToken)
  const storeAd = useGame((s) => s.storeAd)
  if (!f) return null

  return (
    <div className="screen store-screen">
      <header className="screen-head">
        <Button variant="ghost" className="back" onClick={() => navigate('hub')}>
          ‹
        </Button>
        <h2>STORE</h2>
        <div className="fo-stats">
          <span className="fo-pill gold">🪙 {f.credits}</span>
          <span className="fo-pill">🎟️ {f.retryTokens ?? 0}</span>
        </div>
      </header>

      <div className="store-body">
        {/* Headline: Unlimited unlock */}
        <div className={`unlimited-card${f.unlimited ? ' owned' : ''}`}>
          <div className="ul-tag">★ ONE-TIME</div>
          <div className="ul-left">
            <div className="ul-title">UNLIMITED</div>
            <div className="ul-desc">
              Unlock the <b>Team Editor</b> — rename your team & city, pick custom colors &
              jerseys. Plus a 🪙100 bonus.
            </div>
          </div>
          {f.unlimited ? (
            <Button variant="primary" onClick={() => navigate('teameditor')}>
              ✎ EDIT TEAM
            </Button>
          ) : (
            <Button variant="primary" onClick={buyUnlimited}>
              UNLOCK · $4.99
            </Button>
          )}
        </div>

        <div className="store-cols">
          {/* Credit packs */}
          <div className="store-col">
            <div className="os-label">💰 COACHING CREDITS</div>
            <div className="pack-row">
              {PACKS.map((p) => (
                <div key={p.id} className="pack-card">
                  {p.tag && <div className="pack-tag">{p.tag}</div>}
                  <div className="pack-amt">🪙 {p.credits}</div>
                  <div className="pack-name">{p.label}</div>
                  <Button variant="secondary" className="pack-btn" onClick={() => buyCreditsPack(p.credits)}>
                    {p.price}
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Free + consumables */}
          <div className="store-col">
            <div className="os-label">🎁 MORE</div>
            <div className="free-row">
              <div className="free-info">
                <div className="free-name">📺 Watch Ad</div>
                <div className="free-desc">Earn 15 credits</div>
              </div>
              <Button variant="primary" onClick={watchAdForCredits} disabled={storeAd}>
                {storeAd ? 'Watching…' : '+15 🪙'}
              </Button>
            </div>
            <div className="free-row">
              <div className="free-info">
                <div className="free-name">🎟️ Retry Token</div>
                <div className="free-desc">Saves your job from a firing</div>
              </div>
              <Button variant="secondary" onClick={buyRetryToken}>
                $0.99
              </Button>
            </div>
            <div className="store-disclaimer">Prototype — mock purchases only. No payment is processed.</div>
          </div>
        </div>
      </div>
    </div>
  )
}
