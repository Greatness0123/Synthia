/**
 * Polls the DOM for an element matching the given selector.
 * Returns the element if found within timeout, or null.
 */
export async function waitForElement(
  selector: string,
  timeoutMs = 3000
): Promise<Element | null> {
  const start = performance.now();
  while (performance.now() - start < timeoutMs) {
    const el = document.querySelector(selector);
    if (el) return el;
    await new Promise((r) => requestAnimationFrame(r));
  }
  return null;
}

/**
 * Gets the bounding rect of an element by selector.
 * Returns null if element not found.
 */
export function getElementRect(selector: string): DOMRect | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  return el.getBoundingClientRect();
}
