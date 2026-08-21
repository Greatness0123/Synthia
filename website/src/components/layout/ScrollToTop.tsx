import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * ScrollToTop component ensures that whenever a user clicks a link anywhere
 * on the website (especially footer links), the page starts from the very top
 * rather than staying scrolled down at the bottom of the window.
 */
export function ScrollToTop() {
  const { pathname, hash } = useLocation()

  useEffect(() => {
    // If the link includes an explicit anchor hash (e.g. #why-synthia or #model-selector),
    // handle smooth scrolling to that specific section
    if (hash) {
      const targetElement = document.querySelector(hash)
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: 'smooth' })
        return
      }
    }

    // Default route navigation: Reset window scroll position to (0, 0) instantly
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'instant' as ScrollBehavior,
    })
  }, [pathname, hash])

  return null
}
