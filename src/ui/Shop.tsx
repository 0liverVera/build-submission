import { useGameStore } from '../game/store'
import { UNIT_DEFS } from '../game/units'
import type { UnitType } from '../game/types'

/** Quick 2D icon per unit for the shop cards (real 3D portraits come later). */
const ICON: Record<UnitType, { emoji: string; color: string }> = {
  brute: { emoji: '🛡️', color: '#8a98a8' },
  legionnaire: { emoji: '⚔️', color: '#c8893f' },
  archer: { emoji: '🏹', color: '#5fa860' },
  spearman: { emoji: '🔱', color: '#3fb6a8' },
  priestess: { emoji: '✨', color: '#e9c75a' },
}

function ShopCard({
  type,
  affordable,
  onBuy,
}: {
  type: UnitType
  affordable: boolean
  onBuy: () => void
}) {
  const def = UNIT_DEFS[type]
  const icon = ICON[type]
  return (
    <button
      type="button"
      className={`shop-card${affordable ? '' : ' broke'}`}
      onClick={onBuy}
    >
      <div className="sc-icon" style={{ background: icon.color }}>
        {icon.emoji}
      </div>
      <div className="sc-name">{def.name}</div>
      <div className="sc-cost">
        <span>🪙</span>
        <span>{def.cost}</span>
      </div>
    </button>
  )
}

export default function Shop() {
  const shop = useGameStore((s) => s.shop)
  const coins = useGameStore((s) => s.coins)
  const rerollCost = useGameStore((s) => s.rerollCost)
  const buyFromShop = useGameStore((s) => s.buyFromShop)
  const reroll = useGameStore((s) => s.reroll)

  return (
    <div className="shop-bar">
      <div className="shop-head">
        <span className="shop-title">RECRUIT</span>
        <button
          type="button"
          className="reroll-btn"
          onClick={reroll}
          disabled={coins < rerollCost}
        >
          🔄 <b>{rerollCost}</b>
        </button>
      </div>

      <div className="shop-row">
        {shop.map((type, i) =>
          type ? (
            <ShopCard
              key={i}
              type={type}
              affordable={coins >= UNIT_DEFS[type].cost}
              onBuy={() => buyFromShop(i)}
            />
          ) : (
            <div key={i} className="shop-slot sold">
              SOLD
            </div>
          ),
        )}
      </div>
    </div>
  )
}
