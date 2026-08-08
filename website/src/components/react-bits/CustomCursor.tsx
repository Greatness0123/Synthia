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
      className="pointer-events-none fixed left-0 top-0 z-[9999] hidden md:block text-ink"
      style={{ x: arrowX, y: arrowY }}
      animate={{
        scale: hovering ? 1.3 : 1,
        color: hovering ? 'var(--teal)' : 'var(--ink)',
      }}
      transition={{ duration: 0.1, ease: [0.25, 0.1, 0.25, 1] }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="28"
        height="28"
        viewBox="0 0 512 512"
        className="-translate-x-1 -translate-y-1"
      >
        <path
          fill="currentColor"
          d="M210.45 59.777c2.566 2.021 5.063 4.105 7.55 6.223l3.164 2.676a2253.27 2253.27 0 0 1 5.02 4.256A368.404 368.404 0 0 0 236 81c4.48 3.549 8.833 7.23 13.184 10.934A371.409 371.409 0 0 0 259 100c4.48 3.549 8.833 7.23 13.184 10.934A371.409 371.409 0 0 0 282 119c3.901 3.09 7.71 6.274 11.5 9.5 4.49 3.82 9.034 7.554 13.652 11.219 9.59 7.682 19.03 15.554 28.386 23.519 3.894 3.305 7.865 6.497 11.868 9.668 3.648 2.945 7.209 5.989 10.778 9.028A371.409 371.409 0 0 0 368 190c4.48 3.549 8.833 7.23 13.184 10.934A371.409 371.409 0 0 0 391 209c4.48 3.549 8.833 7.23 13.184 10.934A371.409 371.409 0 0 0 414 228c4.477 3.547 8.83 7.225 13.177 10.93 3.29 2.795 6.62 5.522 10.01 8.195C450.75 257.979 460.147 268.612 464 286c1.518 17.87-1.596 33.161-12.96 47.469-9.428 10.233-22.647 17.187-36.625 17.81-4.622.124-9.244.139-13.868.132-3.118-.005-6.236.01-9.354.028-6.627.037-13.253.05-19.88.061-7.672.012-15.343.034-23.014.08-3.044.013-6.088.01-9.132.005-22.33.062-41.32 3.479-58.206 19.33-5.997 6.404-10.964 13.78-16.125 20.858-3.838 5.252-7.761 10.434-11.711 15.602l-2.002 2.62-4.051 5.295a4590.504 4590.504 0 0 0-8.547 11.216l-4.034 5.304c-1.827 2.4-3.658 4.796-5.491 7.19l-1.894 2.48-1.848 2.403-1.64 2.137C215.9 455.466 204.01 461.976 192 464c-16.522 1.632-31.7-.376-45-11l-2.074-1.55C133.96 442.697 128.187 429.551 126 416c-.332-3.081-.502-6.156-.638-9.251l-.135-2.653c-.146-2.906-.281-5.812-.416-8.718l-.312-6.294c-.281-5.695-.554-11.39-.824-17.086-.288-6.03-.585-12.058-.88-18.087-.563-11.482-1.117-22.964-1.669-34.446a49235.9 49235.9 0 0 0-1.866-38.458 102635.99 102635.99 0 0 1-3.18-65.654 31088.784 31088.784 0 0 0-2.407-49.302l-.205-4.156c-.156-3.167-.313-6.335-.472-9.503-3.25-64.793-3.25-64.793 13.817-85.204 21.985-23.426 57.89-26.095 83.636-7.41ZM153 88c-6.549 6.9-9 14.152-9 23.608.1 3.063.245 6.12.405 9.18l.168 3.55c.155 3.235.316 6.47.48 9.704.175 3.496.343 6.992.511 10.488.331 6.844.67 13.687 1.01 20.53.397 7.982.787 15.965 1.176 23.947.695 14.255 1.396 28.51 2.101 42.764a72647.093 72647.093 0 0 1 2.664 54.23 205259.245 205259.245 0 0 0 4.27 86.915c.394 8.029.797 16.057 1.215 24.084l.136 2.668c.118 2.266.242 4.532.37 6.797l.197 3.566c.627 6.264 2.73 11.522 7.297 15.969 6.033 4.738 11.453 5.677 19.043 5.36 6.19-.753 11.194-4.13 15.227-8.845a232.178 232.178 0 0 0 4.042-5.452c1.06-1.441 2.122-2.881 3.184-4.32l1.71-2.326c3.176-4.28 6.428-8.5 9.669-12.73a1215.754 1215.754 0 0 0 15.25-20.375C253.197 351.329 272.555 327.29 306 321c11.878-1.82 23.587-2.283 35.59-2.274 2.991 0 5.981-.013 8.972-.03 8.487-.045 16.974-.07 25.462-.077 5.226-.005 10.452-.03 15.678-.065 1.978-.01 3.956-.012 5.934-.007 2.76.007 5.52-.01 8.28-.033l2.439.025c6.517-.095 11.704-2 16.668-6.285l1.352-1.692 1.398-1.683c3.899-5.972 3.914-11.955 3.227-18.879-2.5-10.252-13.488-16.68-21.3-22.836-3.117-2.498-6.16-5.073-9.2-7.664-3.789-3.227-7.599-6.41-11.5-9.5-4.48-3.549-8.833-7.23-13.184-10.934A371.409 371.409 0 0 0 366 231c-4.48-3.549-8.833-7.23-13.184-10.934A371.409 371.409 0 0 0 343 212c-3.901-3.09-7.71-6.274-11.5-9.5a514.716 514.716 0 0 0-13.652-11.219c-9.59-7.682-19.03-15.554-28.386-23.519-3.894-3.305-7.865-6.497-11.868-9.668-3.648-2.945-7.209-5.989-10.778-9.028A371.409 371.409 0 0 0 257 141c-3.901-3.09-7.71-6.274-11.5-9.5a514.716 514.716 0 0 0-13.652-11.219c-3.746-3-7.455-6.044-11.16-9.094l-2.227-1.832a836.02 836.02 0 0 1-11.676-9.801C190.022 85.215 173.618 72.072 153 88Z"
        />
      </svg>
    </motion.div>
  )
}
