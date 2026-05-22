import { useEffect, useState } from 'react';
import { ref as dbRef, onValue } from 'firebase/database';
import { WifiOff } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { db } from '../lib/firebase';

/**
 * Sticky banner that surfaces when the Firebase Realtime Database connection
 * is lost. Listens to the special `.info/connected` ref — Firebase emits
 * `false` whenever the WebSocket / long-poll drops, `true` once it reconnects.
 *
 * The banner is positioned `top-0 z-[60]` so it sits above every page's own
 * sticky header. Rendered globally inside <App>, so it applies to every route
 * (admin, kitchen, customer, order tracking) without per-page wiring.
 *
 * On first paint we optimistically assume "connected" so we don't flash an
 * error banner during the initial websocket handshake. Firebase typically
 * resolves `.info/connected` in <500ms.
 */
export function ConnectionBanner() {
  const [connected, setConnected] = useState(true);

  useEffect(() => {
    const ref = dbRef(db, '.info/connected');
    const unsub = onValue(ref, (snap) => {
      setConnected(snap.val() === true);
    });
    return () => unsub();
  }, []);

  return (
    <AnimatePresence>
      {!connected && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          transition={{ type: 'spring', damping: 26, stiffness: 280 }}
          role="status"
          aria-live="polite"
          className="fixed top-0 left-0 right-0 z-[60] bg-amber-500 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-semibold shadow-md"
        >
          <WifiOff size={16} />
          <span>Connection lost — reconnecting…</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
