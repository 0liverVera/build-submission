import { useGameStore } from '../game/store'
import {
  GEM_PACKS,
  SKINS,
  CHAMPION_PACK,
  REMOVE_ADS_PRICE,
  AD_COINS,
} from '../game/store-items'
import TapButton from './TapButton'

/**
 * Mock monetization store (Section 6). Looks like a real Supercell shop, but
 * every "purchase" just grants the item — no payment is processed or collected.
 */
export default function Store() {
  const gems = useGameStore((s) => s.gems)
  const ownedSkins = useGameStore((s) => s.ownedSkins)
  const equippedSkin = useGameStore((s) => s.skin)
  const noAds = useGameStore((s) => s.noAds)
  const championOwned = useGameStore((s) => s.championOwned)
  const adWatching = useGameStore((s) => s.adWatching)

  const close = useGameStore((s) => s.closeStore)
  const buyGems = useGameStore((s) => s.buyGems)
  const buySkin = useGameStore((s) => s.buySkin)
  const equipSkin = useGameStore((s) => s.equipSkin)
  const buyChampionPack = useGameStore((s) => s.buyChampionPack)
  const removeAds = useGameStore((s) => s.removeAds)
  const watchAd = useGameStore((s) => s.watchAd)

  return (
    <div className="store-overlay">
      <div className="store-panel">
        <div className="store-head">
          <span className="store-title">⚔ STORE</span>
          <span className="store-gems">💎 {gems}</span>
          <TapButton className="store-close" onClick={close} aria-label="Close">
            ✕
          </TapButton>
        </div>

        <div className="store-scroll">
          {/* Featured: Champion Pack */}
          <div className="store-section-label">FEATURED</div>
          <div className={`champ-card${championOwned ? ' owned' : ''}`}>
            <div className="champ-tag">BEST VALUE</div>
            <div className="champ-icon">👑</div>
            <div className="champ-info">
              <div className="champ-name">Champion Pack</div>
              <div className="champ-desc">
                💎{CHAMPION_PACK.gems} + Golden Legion skin + Remove Ads
              </div>
            </div>
            <TapButton
              className="buy-btn gold"
              onClick={buyChampionPack}
              disabled={championOwned}
            >
              {championOwned ? 'OWNED' : CHAMPION_PACK.price}
            </TapButton>
          </div>

          {/* Gem packs */}
          <div className="store-section-label">GEMS</div>
          <div className="gem-grid">
            {GEM_PACKS.map((p) => (
              <div key={p.id} className="gem-card">
                {p.tag && <div className="gem-tag">{p.tag}</div>}
                <div className="gem-icon">💎</div>
                <div className="gem-amount">{p.gems}</div>
                {p.bonus && <div className="gem-bonus">{p.bonus}</div>}
                <TapButton className="buy-btn" onClick={() => buyGems(p.id)}>
                  {p.price}
                </TapButton>
              </div>
            ))}
          </div>

          {/* Skins */}
          <div className="store-section-label">GLADIATOR SKINS</div>
          <div className="skin-grid">
            {SKINS.map((sk) => {
              const owned = ownedSkins.includes(sk.id)
              const equipped = equippedSkin === sk.id
              return (
                <div key={sk.id} className={`skin-card${equipped ? ' equipped' : ''}`}>
                  <div className="skin-swatch" style={{ background: sk.base }} />
                  <div className="skin-name">{sk.name}</div>
                  {equipped ? (
                    <div className="skin-state equipped">EQUIPPED</div>
                  ) : owned ? (
                    <TapButton className="buy-btn small" onClick={() => equipSkin(sk.id)}>
                      EQUIP
                    </TapButton>
                  ) : (
                    <TapButton className="buy-btn small gem" onClick={() => buySkin(sk.id)}>
                      💎 {sk.gemCost}
                    </TapButton>
                  )}
                </div>
              )
            })}
          </div>

          {/* Free / extras */}
          <div className="store-section-label">FREE</div>
          <div className="free-row">
            <div className="free-info">
              <div className="free-name">📺 Watch Ad</div>
              <div className="free-desc">Earn {AD_COINS} coins</div>
            </div>
            <TapButton className="buy-btn green" onClick={watchAd} disabled={adWatching}>
              {adWatching ? 'Watching…' : `+${AD_COINS} 🪙`}
            </TapButton>
          </div>
          <div className="free-row">
            <div className="free-info">
              <div className="free-name">🚫 Remove Ads</div>
              <div className="free-desc">One-time unlock</div>
            </div>
            <TapButton
              className="buy-btn"
              onClick={removeAds}
              disabled={noAds}
            >
              {noAds ? 'OWNED' : REMOVE_ADS_PRICE}
            </TapButton>
          </div>

          <div className="store-disclaimer">
            Prototype — mock purchases only. No payment is processed.
          </div>
        </div>
      </div>
    </div>
  )
}
