import { motion, type HTMLMotionProps } from 'framer-motion'
import { sfx } from '../audio/sfx'

type Props = HTMLMotionProps<'button'> & {
  variant?: 'primary' | 'secondary' | 'ghost'
}

/** Chunky press-feedback button: squish on tap + click sound (Section 7/8). */
export default function Button({
  children,
  onClick,
  variant = 'primary',
  className = '',
  ...rest
}: Props) {
  return (
    <motion.button
      className={`btn ${variant} ${className}`}
      whileTap={{ scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 600, damping: 15 }}
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
