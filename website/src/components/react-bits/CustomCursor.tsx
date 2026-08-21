import { useEffect, useState } from 'react'
import { motion, useMotionValue, useSpring } from 'framer-motion'

/** Custom cursor: SVG arrow that follows the pointer. Disabled on touch devices. */
export function CustomCursor() {
  const [visible, setVisible] = useState(false)
  const [hovering, setHovering] = useState(false)
  const x = useMotionValue(-100)
  const y = useMotionValue(-100)

  const arrowX = useSpring(x, { stiffness: 2000, damping: 30, mass: 0.1 })
  const arrowY = useSpring(y, { stiffness: 2000, damping: 30, mass: 0.1 })

  useEffect(() => {
    const coarse = window.matchMedia('(pointer: coarse)').matches
    if (coarse) return

    const onMove = (event: MouseEvent) => {
      x.set(event.clientX)
      y.set(event.clientY)
      if (!visible) setVisible(true)
    }

    const onLeave = () => setVisible(false)
    const onEnter = () => setVisible(true)

    const onOver = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      setHovering(!!target?.closest('a, button, [role="button"], input, textarea, select, label'))
    }

    document.documentElement.classList.add('custom-cursor-active')
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseover', onOver)
    document.documentElement.addEventListener('mouseleave', onLeave)
    document.documentElement.addEventListener('mouseenter', onEnter)

    return () => {
      document.documentElement.classList.remove('custom-cursor-active')
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseover', onOver)
      document.documentElement.removeEventListener('mouseleave', onLeave)
      document.documentElement.removeEventListener('mouseenter', onEnter)
    }
  }, [visible, x, y])

  if (!visible) return null

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-[9999] hidden md:block"
      style={{ x: arrowX, y: arrowY, translateX: '-5.5px', translateY: '-3.5px' }}
      animate={{ scale: hovering ? 1.2 : 1 }}
      transition={{ duration: 0.1, ease: [0.25, 0.1, 0.25, 1] }}
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Outer filled arrow shape */}
        <path
          d="M5.5 3.48349C5.5 2.23523 6.93571 1.5331 7.92098 2.29951L21.4353 12.8119C22.5626 13.6887 21.9425 15.4958 20.5143 15.4958H13.6619C13.1574 15.4958 12.6806 15.7267 12.3676 16.1224L8.17661 21.4226C7.2945 22.5382 5.5 21.9145 5.5 20.4923L5.5 3.48349ZM20.5143 13.9958L7 3.48349L7 20.4923L11.191 15.192C11.7884 14.4365 12.6987 13.9958 13.6619 13.9958H20.5143Z"
          fill="#212121"
        />
        {/* Inner fill that appears on hover to fill the hollow center */}
        {hovering && (
          <path
            d="M7 3.48349L20.5143 13.9958H13.6619C12.6987 13.9958 11.7884 14.4365 11.191 15.192L7 20.4923V3.48349Z"
            fill="#212121"
          />
        )}
      </svg>
    </motion.div>
  )
}
