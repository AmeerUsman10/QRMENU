import { useEffect, type RefObject } from 'react';

/**
 * CSS selector matching every element that can receive keyboard focus by
 * default. The exclusions guard against disabled controls (which can't be
 * focused) and `tabindex="-1"` (which is explicitly skipped from the tab
 * order — typically used for programmatically-focusable containers).
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

interface Options {
  /** Called when the user presses Escape inside the modal. */
  onClose?: () => void;
}

/**
 * Trap keyboard focus inside a modal-like container while it is mounted.
 *
 * Behaviour:
 *  - On mount: remembers which element had focus, then focuses the first
 *    focusable child inside `containerRef`.
 *  - While mounted: Tab from the last focusable wraps back to the first;
 *    Shift+Tab from the first wraps back to the last. Escape triggers
 *    `onClose` if provided.
 *  - On unmount: restores focus to whatever had it before the modal opened
 *    (the trigger element), so keyboard users don't lose their place.
 *
 * This is the standard "focus trap" pattern required by WCAG 2.1 SC 2.4.3
 * (Focus Order) and 2.1.2 (No Keyboard Trap — paradoxically the right way
 * to avoid a true trap is to provide a working Escape exit).
 *
 * Usage:
 *   const ref = useRef<HTMLDivElement>(null);
 *   useFocusTrap(ref, { onClose });
 *   return <div ref={ref} role="dialog" aria-modal="true">…</div>;
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  { onClose }: Options = {},
): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Focus the first focusable element on mount so keyboard users land
    // inside the modal immediately. If the modal has no focusable controls
    // (rare), make the container itself focusable so screen readers still
    // announce the dialog.
    const focusables = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    if (focusables.length > 0) {
      focusables[0].focus();
    } else if (!container.hasAttribute('tabindex')) {
      container.setAttribute('tabindex', '-1');
      container.focus();
    }

    function handleKey(e: KeyboardEvent) {
      if (!container) return;

      if (e.key === 'Escape' && onClose) {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key !== 'Tab') return;

      // Re-query on every Tab — the focusable set inside a modal can
      // change as users toggle sub-controls, expand sections, etc.
      const list = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (list.length === 0) return;

      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKey);

    return () => {
      document.removeEventListener('keydown', handleKey);
      // Restore focus to the trigger, if it still exists in the DOM.
      // It may not — e.g. a kitchen card that triggered an edit modal
      // could have been removed from the order list while the modal was
      // open. In that case, do nothing; the browser's default focus
      // behaviour applies.
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [containerRef, onClose]);
}
