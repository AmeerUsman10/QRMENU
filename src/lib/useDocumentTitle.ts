import { useEffect } from 'react';

/**
 * Brand name suffix appended to every page title.
 * Keep this string in sync with index.html's <title> and manifest.json's "name".
 */
const APP_NAME = 'QRMENU';

/**
 * React hook that sets `document.title` for the lifetime of a page.
 *
 * Pass a non-empty string to render "<Page Title> · QRMENU" in the browser
 * tab. Pass null/undefined to fall back to just the app name. The previous
 * title is restored on unmount, so navigating between pages without their
 * own useDocumentTitle call won't leak the prior page's title.
 *
 * Examples:
 *   useDocumentTitle('Kitchen · Pizza Planet');  // -> "Kitchen · Pizza Planet · QRMENU"
 *   useDocumentTitle(`Order #${num}`);           // -> "Order #042 · QRMENU"
 *   useDocumentTitle(null);                      // -> "QRMENU"
 */
export function useDocumentTitle(title: string | null | undefined): void {
  useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
