// ─────────────────────────────────────────────────────────────────────────────
// Tour Target Resolver
// Resolves a step's target string to a live DOM element.
// First tries [data-tour="<target>"], then falls back to the raw string
// as a CSS selector. Supports async polling for elements that render late.
// ─────────────────────────────────────────────────────────────────────────────

const DEV = import.meta.env.DEV;

function log(msg: string) {
  if (DEV) console.debug("[TourTargetResolver]", msg);
}

/**
 * Resolves a target string to a DOM element (synchronous).
 * Returns null if not found — never throws.
 */
export function resolveTarget(target: string): Element | null {
  try {
    // Prefer data-tour attribute first
    const byAttribute = document.querySelector(`[data-tour="${target}"]`);
    if (byAttribute) return byAttribute;

    // Fallback: treat target as a raw CSS selector
    const bySelector = document.querySelector(target);
    if (bySelector) return bySelector;

    log(`Target not found: "${target}"`);
    return null;
  } catch (err) {
    log(`Invalid selector "${target}": ${String(err)}`);
    return null;
  }
}

/**
 * Waits up to `timeoutMs` for a target to appear in the DOM.
 * Uses exponential back-off polling (50ms → 100ms → 200ms …).
 * Returns null if the timeout is exceeded — never throws.
 */
export function waitForTarget(
  target: string,
  timeoutMs = 2000
): Promise<Element | null> {
  return new Promise((resolve) => {
    const found = resolveTarget(target);
    if (found) return resolve(found);

    const deadline = Date.now() + timeoutMs;
    let delay = 50;

    function poll() {
      const el = resolveTarget(target);
      if (el) return resolve(el);

      if (Date.now() >= deadline) {
        log(`Timed out waiting for target: "${target}" (${timeoutMs}ms)`);
        return resolve(null);
      }

      delay = Math.min(delay * 2, 400);
      setTimeout(poll, delay);
    }

    setTimeout(poll, delay);
  });
}
