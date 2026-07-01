import React, { useMemo } from 'react'
import { Svg, G, Ellipse, Circle, Rect, Path, Line, Text as SvgText } from 'react-native-svg'
import { FONT } from '../theme'
import { ANCHOR, BH, restPose, type Pose } from './charAnim'
import type { CharacterAppearance, HairStyle, Accessory } from './character'

const A = ANCHOR
const OL = '#21314f' // outline ink, matches the game palette
// Extra headroom ABOVE the body so a jump (rootDY lift) + raised arms (shoot/block)
// are never clipped by the SVG bounds. `size` still maps to the 152-unit body height.
export const VB_TOP = -56
export const VB_H = A.VBH - VB_TOP // 208

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16)
  const c = (v: number) => Math.max(0, Math.min(255, v + amt))
  const r = c((n >> 16) & 255)
  const g = c((n >> 8) & 255)
  const b = c(n & 255)
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

// ---- hair: split into parts drawn BEHIND the head and IN FRONT (over the scalp) ----
function hairParts(style: HairStyle, color: string): { behind: React.ReactNode[]; front: React.ReactNode[] } {
  const behind: React.ReactNode[] = []
  const front: React.ReactNode[] = []
  // cap whose lower (forehead) edge is at `fy` — smaller fy = thinner/higher hairline
  const cap = (fy: number, key: string, op = 1) => (
    <Path key={key} d={`M30 38 A20 20 0 0 1 70 38 Q50 ${fy} 30 38 Z`} fill={color} opacity={op} />
  )
  switch (style) {
    case 'bald':
      break
    case 'buzz':
      front.push(cap(33, 'buzz', 0.9))
      break
    case 'short':
      front.push(cap(45, 'short'))
      break
    case 'flattop':
      front.push(<Rect key="ft" x={29} y={15} width={42} height={11} rx={3} fill={color} />)
      front.push(cap(44, 'ftcap'))
      break
    case 'curly':
      front.push(cap(45, 'curlybase'))
      for (let i = 0; i < 6; i++) {
        const ang = Math.PI + (i / 5) * Math.PI
        front.push(
          <Circle key={`cu${i}`} cx={50 + Math.cos(ang) * 21} cy={32 + Math.sin(ang) * 13} r={5.5} fill={color} />,
        )
      }
      break
    case 'afro':
      behind.push(<Circle key="afro" cx={50} cy={29} r={25} fill={color} />)
      front.push(cap(46, 'afrocap'))
      break
    case 'long':
      behind.push(<Path key="ll" d="M30 34 Q24 56 31 66 L39 64 Q34 48 35 38 Z" fill={color} />)
      behind.push(<Path key="lr" d="M70 34 Q76 56 69 66 L61 64 Q66 48 65 38 Z" fill={color} />)
      front.push(cap(46, 'longcap'))
      break
    case 'ponytail':
      behind.push(<Ellipse key="tail" cx={50} cy={16} rx={7} ry={12} fill={color} />)
      front.push(cap(43, 'pcap'))
      break
  }
  return { behind, front }
}

function Face() {
  return (
    <>
      {/* eyes */}
      <Ellipse cx={43} cy={40} rx={2.4} ry={3.1} fill="#1a1a1a" />
      <Ellipse cx={57} cy={40} rx={2.4} ry={3.1} fill="#1a1a1a" />
      <Circle cx={43.8} cy={39} r={0.9} fill="#fff" />
      <Circle cx={57.8} cy={39} r={0.9} fill="#fff" />
      {/* mouth */}
      <Path d="M44 48 Q50 53 56 48" stroke="#5a3526" strokeWidth={1.6} strokeLinecap="round" fill="none" />
    </>
  )
}

function accessoryBeard(color: string) {
  return <Path d="M31 39 Q33 58 50 62 Q67 58 69 39 Q60 50 50 50 Q40 50 31 39 Z" fill={shade(color, -10)} />
}
function accessoryFront(acc: Accessory, jersey: string) {
  if (acc === 'headband')
    return <Path d="M30 33 Q50 27 70 33 L70 38 Q50 32 30 38 Z" fill={jersey} stroke={OL} strokeWidth={1} />
  if (acc === 'glasses')
    return (
      <>
        <Circle cx={43} cy={40} r={5.4} fill="rgba(180,210,255,0.25)" stroke={OL} strokeWidth={1.8} />
        <Circle cx={57} cy={40} r={5.4} fill="rgba(180,210,255,0.25)" stroke={OL} strokeWidth={1.8} />
        <Line x1={48} y1={40} x2={52} y2={40} stroke={OL} strokeWidth={1.8} />
      </>
    )
  return null
}

function Limb({ x1, y1, x2, y2, w, color }: { x1: number; y1: number; x2: number; y2: number; w: number; color: string }) {
  return (
    <>
      <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke={OL} strokeWidth={w + 2.4} strokeLinecap="round" />
      <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={w} strokeLinecap="round" />
    </>
  )
}

function Shoe({ x, color }: { x: number; color: string }) {
  return (
    <Path
      d={`M${x - 7} ${A.SHOE_Y} Q${x - 8} ${A.SHOE_Y - 5} ${x - 1} ${A.SHOE_Y - 5} L${x + 7} ${A.SHOE_Y - 5} Q${x + 12} ${A.SHOE_Y - 5} ${x + 12} ${A.SHOE_Y} Q${x + 12} ${A.SHOE_Y + 2} ${x + 8} ${A.SHOE_Y + 2} L${x - 6} ${A.SHOE_Y + 2} Q${x - 7} ${A.SHOE_Y + 2} ${x - 7} ${A.SHOE_Y} Z`}
      fill="#f3f5fb"
      stroke={OL}
      strokeWidth={1.5}
    />
  )
}

export interface CharacterProps {
  appearance: CharacterAppearance
  size: number // rendered height in px
  pose?: Pose
}

/**
 * Modular cartoon character drawn entirely from shapes. Each limb is an
 * independent transform group rotating around its named pivot (hip/shoulder/neck)
 * so the animation system can pose it. `pose` defaults to a neutral rest stance.
 */
export function Character({ appearance, size, pose }: CharacterProps) {
  const p = pose ?? restPose()
  const skin = appearance.skinTone
  const skinLo = shade(skin, -26)
  const jersey = appearance.jerseyColor
  const jerseyHi = shade(jersey, 34)
  const jerseyLo = shade(jersey, -46)
  const shorts = shade(jersey, -58)
  const hair = appearance.hairColor
  const { behind, front } = useMemo(() => hairParts(appearance.hairStyle, hair), [appearance.hairStyle, hair])

  const w = (size * A.VBW) / A.VBH
  const hPx = (size * VB_H) / A.VBH // taller than `size` by the headroom
  const facing = p.facing ?? (1 as 1 | -1)
  // ball lives outside the facing-mirror group, so mirror its x manually
  const ballX = facing === 1 ? p.ballX : 2 * A.CX - p.ballX

  return (
    <Svg width={w} height={hPx} viewBox={`0 ${VB_TOP} ${A.VBW} ${VB_H}`}>
      {/* floor shadow — grounded at the feet; shrinks + lightens when airborne */}
      <Ellipse
        cx={A.CX}
        cy={A.FEET_Y + 3}
        rx={22 * p.shadowScale}
        ry={6 * p.shadowScale}
        fill="#000"
        opacity={p.shadowOpacity}
      />
      {/* body lifts on jumps */}
      <G transform={`translate(0 ${p.rootDY})`}>
        {/* whole-body lean pivots at the hips */}
        <G transform={`rotate(${p.lean} ${A.CX} ${A.HIP_Y})`}>
          {/* squash/stretch + facing mirror, both around the feet */}
          <G transform={`translate(${A.CX} ${A.FEET_Y}) scale(${facing * p.bodyScaleX} ${p.bodyScaleY}) translate(${-A.CX} ${-A.FEET_Y})`}>
            {/* legs (pivot at hip) */}
            <G transform={`rotate(${p.leftLeg} ${A.HIP_L} ${A.HIP_Y})`}>
              <Limb x1={A.HIP_L} y1={A.HIP_Y} x2={A.HIP_L} y2={A.ANKLE_Y} w={9} color={skin} />
              <Shoe x={A.HIP_L} color={jerseyLo} />
            </G>
            <G transform={`rotate(${p.rightLeg} ${A.HIP_R} ${A.HIP_Y})`}>
              <Limb x1={A.HIP_R} y1={A.HIP_Y} x2={A.HIP_R} y2={A.ANKLE_Y} w={9} color={skin} />
              <Shoe x={A.HIP_R} color={jerseyLo} />
            </G>

            {/* shorts over the leg tops */}
            <Path
              d={`M33 ${A.HIP_Y - 10} Q33 ${A.HIP_Y - 14} 38 ${A.HIP_Y - 14} L62 ${A.HIP_Y - 14} Q67 ${A.HIP_Y - 14} 67 ${A.HIP_Y - 10} L66 ${A.HIP_Y + 4} L52 ${A.HIP_Y + 4} L50 ${A.HIP_Y} L48 ${A.HIP_Y + 4} L34 ${A.HIP_Y + 4} Z`}
              fill={shorts}
              stroke={OL}
              strokeWidth={1.6}
            />

            {/* torso / jersey */}
            <Path
              d={`M34 70 Q34 63 42 62 L58 62 Q66 63 66 70 L65 ${A.HIP_Y - 8} Q50 ${A.HIP_Y - 3} 35 ${A.HIP_Y - 8} Z`}
              fill={jersey}
              stroke={OL}
              strokeWidth={2}
            />
            <Path d="M40 64 Q50 62 60 64 L59 72 Q50 70 41 72 Z" fill={jerseyHi} opacity={0.55} />
            <Path d={`M37 ${A.HIP_Y - 14} Q50 ${A.HIP_Y - 9} 63 ${A.HIP_Y - 14} L64 ${A.HIP_Y - 8} Q50 ${A.HIP_Y - 3} 36 ${A.HIP_Y - 8} Z`} fill={jerseyLo} opacity={0.5} />
            <SvgText x={A.CX} y={86} fontSize={15} fontFamily={FONT.black} fill="#fff" textAnchor="middle">
              {appearance.number}
            </SvgText>

            {/* arms (pivot at shoulder) */}
            <G transform={`rotate(${p.leftArm} ${A.SH_L} ${A.SHOULDER_Y})`}>
              <Limb x1={A.SH_L} y1={A.SHOULDER_Y} x2={A.SH_L - 4} y2={A.HAND_Y} w={7} color={skin} />
              <Circle cx={A.SH_L - 4} cy={A.HAND_Y} r={4.4} fill={skin} stroke={OL} strokeWidth={1.4} />
            </G>
            <G transform={`rotate(${p.rightArm} ${A.SH_R} ${A.SHOULDER_Y})`}>
              <Limb x1={A.SH_R} y1={A.SHOULDER_Y} x2={A.SH_R + 4} y2={A.HAND_Y} w={7} color={skin} />
              <Circle cx={A.SH_R + 4} cy={A.HAND_Y} r={4.4} fill={skin} stroke={OL} strokeWidth={1.4} />
            </G>

            {/* neck */}
            <Rect x={45} y={52} width={10} height={12} rx={3} fill={skinLo} stroke={OL} strokeWidth={1.4} />

            {/* head (pivot at neck) */}
            <G transform={`rotate(${p.head} ${A.CX} ${A.NECK_Y})`}>
              {behind}
              <Circle cx={A.CX} cy={A.HEAD_CY} r={A.HEAD_R} fill={skin} stroke={OL} strokeWidth={2} />
              <Circle cx={A.CX - 8} cy={A.HEAD_CY + 4} r={3} fill="#fff" opacity={0.1} />
              {appearance.accessory === 'beard' && accessoryBeard(hair)}
              <Face />
              {front}
              {accessoryFront(appearance.accessory, jersey)}
            </G>
          </G>
        </G>

        {/* the (dribble/shot/pass) ball, if the pose is holding one */}
        {p.ballVisible && (
          <G transform={`translate(0 0)`}>
            <Ellipse cx={ballX} cy={A.FEET_Y + 2} rx={5} ry={1.8} fill="#000" opacity={0.14} />
            <Circle cx={ballX} cy={p.ballY} r={6} fill="#ff8a3d" stroke={shade('#ff8a3d', -70)} strokeWidth={1} />
            <Path d={`M${ballX - 6} ${p.ballY} h12 M${ballX} ${p.ballY - 6} v12`} stroke="rgba(80,30,0,0.7)" strokeWidth={1} />
          </G>
        )}
      </G>
    </Svg>
  )
}

export { BH }
