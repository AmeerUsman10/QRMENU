import { useEffect, useRef, useState } from 'react';
import { ref as dbRef, onValue } from 'firebase/database';
import { WifiOff } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { db } from '../lib/firebase';

/**
 * Shows a subtle banner only when the Firebase connection has been lost for
 * more than 3 seconds. This prevents the false-positive flash that occurs on
 * every page load/refresh because Firebase always emits `.info/connected = false`
 * briefly during the initial WebSocket handshake before quickly resolving to true.
 *
 * Behaviour:
 *  - Disconnected < 8s  → banner stays hidden (covers iOS background/resume
 *                          and normal Firebase WebSocket reconnection noise)
 *  - Disconnected ≥ 8s  → banner slides in
 *  - Reconnected         → banner slides out immediately
 */
export function ConnectionBanner() {
  const [showBanner, setShowBanner] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const ref = dbRef(db, '.info/connected');
    const unsub = onValue(ref, (snap) => {
      const isConnected = snap.val() === true;

      if (isConnected) {
        // Reconnected — cancel any pending show and hide immediately
        if (timer.current) { clearTimeout(timer.current); timer.current = null; }
        setShowBanner(false);
      } else {
        // Lost connection — wait 3s before showing the banner so that normal
        // refresh / PWA-open handshake noise never triggers it
        timer.current = setTimeout(() => setShowBanner(true), 8000);
      }
    });

    return () => {
      unsub();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          initial={{ y: -48, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -48, opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          role="status"
          aria-live="polite"
          className="fixed top-0 left-0 right-0 z-[60] bg-gray-800/90 backdrop-blur-sm text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium shadow-lg"
        >
          <WifiOff size={14} className="opacity-70 flex-shrink-0" />
          <span className="opacity-90">Reconnecting…</span>
          <span className="flex gap-0.5 ml-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-1 h-1 rounded-full bg-white opacity-60 animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
