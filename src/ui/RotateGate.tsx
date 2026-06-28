import { useEffect, useState } from 'react'

/** Shows a "rotate your device" prompt when the phone is held in portrait. */
export default function RotateGate() {
  const [portrait, setPortrait] = useState(
    () => typeof window !== 'undefined' && window.innerHeight > window.innerWidth,
  )
  useEffect(() => {
    const onResize = () => setPortrait(window.innerHeight > window.innerWidth)
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [])

  if (!portrait) return null
  return (
    <div className="rotate-gate">
      <div className="rg-phone">📱</div>
      <div className="rg-title">ROTATE YOUR DEVICE</div>
      <div className="rg-sub">Hoop Dynasty is best played in landscape</div>
    </div>
  )
}
