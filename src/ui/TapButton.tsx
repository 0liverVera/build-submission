import { motion, type HTMLMotionProps } from 'framer-motion'
import { sfx } from '../game/sfx'

type Props = HTMLMotionProps<'button'> & { tapScale?: number }

/**
 * Candy button feel: press squishes down, release springs back with overshoot
 * (Section 3.1), plus a click sound. Visuals come from the passed className.
 */
export default function TapButton({
  children,
  onClick,
  tapScale = 0.9,
  ...rest
}: Props) {
  return (
    <motion.button
      whileTap={{ scale: tapScale }}
      transition={{ type: 'spring', stiffness: 600, damping: 14 }}
      onClick={(e) => {
        sfx.tap()
        onClick?.(e)
      }}
      {...rest}
    >
      {children}
    </motion.button>
  )
}
