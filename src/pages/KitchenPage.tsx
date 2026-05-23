import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { onValue, get } from 'firebase/database';
import { refs, updateOrderStatus } from '../lib/firebase';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import type { Order, OrderStatus, Restaurant } from '../types';
import { useSearchParams } from 'react-router-dom';

const MASTER_PIN = '0000';
const MUTE_KEY = 'kitchen.muted';
const LANG_KEY = 'kitchen.lang';
const PINNED_KEY = 'kitchen.pinned';

// ─── Restaurant cache (instant logo/name on re-open) ─────────────────────────
function getCachedRestaurant(id: string) {
  try {
    const raw = localStorage.getItem(`kitchen.restaurant.${id}`);
    return raw ? (JSON.parse(raw) as { name: string; logo: string }) : null;
  } catch { return null; }
}
function setCachedRestaurant(id: string, data: { name: string; logo: string }) {
  try { localStorage.setItem(`kitchen.restaurant.${id}`, JSON.stringify(data)); } catch {}
}

// ─── Translations ─────────────────────────────────────────────────────────────

type Lang = 'sl' | 'en';

const T = {
  sl: {
    kitchenDisplay: 'Kuhinja',
    active: '🔥 Aktivno',
    history: '📋 Zgodovina',
    allClear: 'Ni aktivnih naročil',
    allClearSub: 'Nova naročila se bodo pojavila samodejno',
    newOrders: 'Nova naročila',
    preparing: 'V pripravi',
    readyToServe: 'Pripravljeno za serviranje',
    noHistory: 'Ni zgodovine naročil',
    table: 'Miza',
    cash: '💵 Gotovina',
    card: '💳 Kartica',
    note: '⚠ Opomba',
    startPreparing: '▶  Začni pripravo',
    markReady: '✓  Pripravljeno',
    served: '🍽  Postreženo',
    swipeHint: 'povleci desno za začetek priprave',
    lock: 'Zakleni',
    enterPin: 'Vnesite PIN za dostop do naročil',
    enterKitchen: 'Vstopi v kuhinjo',
    checking: 'Preverjam…',
    incorrectPin: 'Napačen PIN',
    restaurantNotFound: 'Restavracija ni najdena',
    noRestaurants: 'Ni najdenih restavracij',
    tapToEnableSound: '🔔 Tapnite kjerkoli za zvočna opozorila',
    muteAlerts: 'Utišaj opozorila',
    unmuteAlerts: 'Vklopi opozorila',
    cancelOrder: 'Prekliči naročilo',
    pinToTop: 'Pripni na vrh',
    unpin: 'Odpni',
    pinned: 'PRIORITETA',
    permissionError: 'Napaka dostopa. Dodajte ?r=id_restavracije v URL.',
    statusDone: 'končano',
    statusCancelled: 'preklicano',
    sAgo: (n: number) => `${n}s nazaj`,
    mAgo: (n: number) => `${n}m nazaj`,
    hmAgo: (h: number, m: number) => `${h}h ${m}m nazaj`,
  },
  en: {
    kitchenDisplay: 'Kitchen Display',
    active: '🔥 Active',
    history: '📋 History',
    allClear: 'All clear — no active orders',
    allClearSub: 'New orders will appear here automatically',
    newOrders: 'New Orders',
    preparing: 'Preparing',
    readyToServe: 'Ready to Serve',
    noHistory: 'No order history yet',
    table: 'Table',
    cash: '💵 Cash',
    card: '💳 Card',
    note: '⚠ Note',
    startPreparing: '▶  Start Preparing',
    markReady: '✓  Mark Ready',
    served: '🍽  Served',
    swipeHint: 'swipe right to start preparing',
    lock: 'Lock',
    enterPin: 'Enter your PIN to access orders',
    enterKitchen: 'Enter Kitchen',
    checking: 'Checking…',
    incorrectPin: 'Incorrect PIN',
    restaurantNotFound: 'Restaurant not found',
    noRestaurants: 'No restaurants found',
    tapToEnableSound: '🔔 Tap anywhere to enable sound alerts',
    muteAlerts: 'Mute alerts',
    unmuteAlerts: 'Unmute alerts',
    cancelOrder: 'Cancel order',
    pinToTop: 'Pin to top',
    unpin: 'Unpin',
    pinned: 'PRIORITY',
    permissionError: 'Permission error. Add ?r=restaurant_id to the URL.',
    statusDone: 'done',
    statusCancelled: 'cancelled',
    sAgo: (n: number) => `${n}s ago`,
    mAgo: (n: number) => `${n}m ago`,
    hmAgo: (h: number, m: number) => `${h}h ${m}m ago`,
  },
};

function getLang(): Lang {
  return (localStorage.getItem(LANG_KEY) as Lang) ?? 'sl';
}
function saveLang(l: Lang) { localStorage.setItem(LANG_KEY, l); }

// ─── Audio alert (iOS-safe) ───────────────────────────────────────────────────

function buildAlarmAudio(): HTMLAudioElement {
  const sampleRate = 44100;
  const duration = 1.4;
  const numSamples = Math.floor(sampleRate * duration);
  const buf = new ArrayBuffer(44 + numSamples * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + numSamples * 2, true);
  w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, numSamples * 2, true);
  const chime = (t: number, freq: number, startT: number) => {
    const dt = t - startT;
    if (dt < 0) return 0;
    const attack = Math.min(dt / 0.005, 1);
    const decay = Math.exp(-dt * 6);
    return attack * decay * (
      Math.sin(2 * Math.PI * freq * dt) +
      0.3 * Math.sin(2 * Math.PI * freq * 2 * dt) +
      0.1 * Math.sin(2 * Math.PI * freq * 3 * dt)
    );
  };
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = (chime(t, 880, 0) + chime(t, 1047, 0.38)) * 26000;
    v.setInt16(44 + i * 2, Math.max(-32767, Math.min(32767, sample)), true);
  }
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const audio = new Audio('data:audio/wav;base64,' + btoa(bin));
  audio.volume = 1.0;
  return audio;
}

const alarmAudio = buildAlarmAudio();
let alarmLoopTimer: ReturnType<typeof setInterval> | null = null;

function isMuted() { return localStorage.getItem(MUTE_KEY) === 'true'; }
function setMuted(v: boolean) { localStorage.setItem(MUTE_KEY, String(v)); }

function primeAlarm() {
  alarmAudio.play().then(() => { alarmAudio.pause(); alarmAudio.currentTime = 0; }).catch(() => {});
}
function playAlarm() {
  if (isMuted()) return;
  alarmAudio.currentTime = 0;
  alarmAudio.play().catch(() => {});
}
function startAlarmLoop() {
  if (alarmLoopTimer) return;
  playAlarm();
  alarmLoopTimer = setInterval(playAlarm, 6000);
}
function stopAlarmLoop() {
  if (alarmLoopTimer) { clearInterval(alarmLoopTimer); alarmLoopTimer = null; }
  alarmAudio.pause();
  alarmAudio.currentTime = 0;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function elapsed(ts: number, t: typeof T['en']) {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return t.sAgo(sec);
  const min = Math.floor(sec / 60);
  if (min < 60) return t.mAgo(min);
  return t.hmAgo(Math.floor(min / 60), min % 60);
}

function ElapsedTimer({ ts, t }: { ts: number; t: typeof T['en'] }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 10000);
    return () => clearInterval(timer);
  }, []);
  const sec = Math.floor((Date.now() - ts) / 1000);
  const urgent = sec > 900;
  const warn = sec > 600;
  return (
    <span className={`text-xs font-bold ${urgent ? 'text-red-500' : warn ? 'text-orange-500' : 'text-gray-400'}`}>
      {elapsed(ts, t)}
    </span>
  );
}

// ─── Order Card ───────────────────────────────────────────────────────────────

interface OrderCardProps {
  order: Order;
  onStatusChange: (id: string, status: OrderStatus) => void;
  onTogglePin: (id: string) => void;
  isPinned: boolean;
  t: typeof T['en'];
}

function OrderCard({ order, onStatusChange, onTogglePin, isPinned, t }: OrderCardProps) {
  let items: { name: string; quantity: number; price?: number; modifiers?: string }[] = [];
  try { items = JSON.parse(order.items); } catch { /* fallback */ }

  const touchStartX = useRef(0);

  const nextStatus: Record<string, { label: string; next: OrderStatus }> = {
    new: { label: t.startPreparing, next: 'preparing' },
    preparing: { label: t.markReady, next: 'ready' },
    ready: { label: t.served, next: 'done' },
  };
  const action = nextStatus[order.status];

  const cardStyle: Record<string, string> = {
    new: 'border-orange-400 bg-white',
    preparing: 'border-blue-400 bg-white',
    ready: 'border-green-400 bg-white',
    done: 'border-gray-200 bg-gray-50',
    cancelled: 'border-gray-200 bg-gray-50',
  };
  const btnStyle: Record<string, string> = {
    new: 'bg-orange-500 hover:bg-orange-600 text-white',
    preparing: 'bg-blue-500 hover:bg-blue-600 text-white',
    ready: 'bg-green-500 hover:bg-green-600 text-white',
  };

  const isNew = order.status === 'new';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        const dx = e.changedTouches[0].clientX - touchStartX.current;
        if (dx > 70 && action) onStatusChange(order.id, action.next);
      }}
      className={`rounded-2xl border-2 mb-3 overflow-hidden ${
        isPinned ? 'border-purple-400 bg-white shadow-purple-100' : cardStyle[order.status] ?? 'border-gray-200 bg-white'
      } shadow-sm`}
    >
      {/* Pinned priority strip */}
      {isPinned && <div className="h-0.5 w-full bg-purple-500" />}
      {/* New order pulse strip (only when not pinned, to avoid double strip) */}
      {isNew && !isPinned && <div className="h-0.5 w-full bg-orange-400 animate-pulse" />}

      {/* ── Top row: order# + elapsed · pin · payment ── */}
      <div className="px-4 pt-3 pb-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-black text-gray-400 tabular-nums">
            #{String(order.orderNumber).padStart(3, '0')}
          </span>
          <span className="text-gray-200 text-xs">·</span>
          <ElapsedTimer ts={order.timestamp} t={t} />
          {isPinned && (
            <span className="text-[9px] font-black tracking-widest text-purple-500 uppercase bg-purple-50 px-1.5 py-0.5 rounded-md">
              {t.pinned}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {/* Pin button — only on active orders */}
          {(order.status === 'new' || order.status === 'preparing' || order.status === 'ready') && (
            <button
              onClick={(e) => { e.stopPropagation(); onTogglePin(order.id); }}
              title={isPinned ? t.unpin : t.pinToTop}
              className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm transition-all ${
                isPinned
                  ? 'bg-purple-100 text-purple-500'
                  : 'text-gray-300 hover:text-purple-400 hover:bg-purple-50'
              }`}
            >
              📌
            </button>
          )}
          <span className={`text-[11px] font-black px-2.5 py-1 rounded-lg uppercase tracking-wide ${
            order.paymentType === 'cash' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
          }`}>
            {order.paymentType === 'cash' ? t.cash : t.card}
          </span>
        </div>
      </div>

      {/* ── Table number — centered hero ── */}
      {order.tableNumber != null && (
        <div className="px-4 pb-3 flex justify-center">
          <div className={`rounded-2xl px-10 py-2.5 text-center border ${
            isNew ? 'bg-orange-50 border-orange-200' :
            order.status === 'preparing' ? 'bg-blue-50 border-blue-200' :
            order.status === 'ready' ? 'bg-green-50 border-green-200' :
            'bg-gray-50 border-gray-200'
          }`}>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-400 leading-none mb-1">
              {t.table}
            </p>
            <p className={`text-5xl font-black leading-none ${
              isNew ? 'text-orange-500' :
              order.status === 'preparing' ? 'text-blue-500' :
              order.status === 'ready' ? 'text-green-600' :
              'text-gray-700'
            }`}>
              {order.tableNumber}
            </p>
          </div>
        </div>
      )}

      {/* ── Items ── */}
      <div className="border-t border-gray-100 mx-3" />
      <div className="px-4 py-2.5 space-y-1.5">
        {items.length > 0 ? items.map((item, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="text-xs font-black text-orange-500 w-6 flex-shrink-0 pt-0.5 tabular-nums">
              ×{item.quantity}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-gray-900 font-semibold text-sm leading-snug">{item.name}</p>
              {item.modifiers && (
                <p className="text-[11px] text-gray-400 mt-0.5 leading-tight">{item.modifiers}</p>
              )}
            </div>
            {item.price != null && (
              <span className="text-xs font-bold text-gray-400 tabular-nums flex-shrink-0 pt-0.5">
                €{(item.price * item.quantity).toFixed(2)}
              </span>
            )}
          </div>
        )) : (
          <p className="text-gray-600 text-sm">{order.itemsReadable}</p>
        )}
      </div>

      {/* ── Note ── */}
      {order.note && (
        <div className="mx-4 mb-2.5 bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-2 flex items-start gap-2">
          <span className="text-yellow-500 text-xs mt-0.5 flex-shrink-0">⚠</span>
          <p className="text-xs text-yellow-800 font-medium leading-snug">{order.note}</p>
        </div>
      )}

      {/* ── Footer: price + action + cancel ── */}
      <div className="border-t border-gray-100 mx-3" />
      <div className="px-4 py-2.5 flex items-center gap-2">
        <span className="text-sm font-black text-gray-700 tabular-nums w-16 flex-shrink-0">
          €{order.totalPrice.toFixed(2)}
        </span>
        <div className="flex-1 flex gap-2">
          {action && (
            <button
              onClick={() => onStatusChange(order.id, action.next)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-black tracking-wide transition-all active:scale-[0.98] ${btnStyle[order.status] ?? ''}`}
            >
              {action.label}
            </button>
          )}
          {(order.status === 'new' || order.status === 'preparing') && (
            <button
              onClick={() => onStatusChange(order.id, 'cancelled')}
              className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-red-100 text-gray-400 hover:text-red-500 font-bold text-sm transition-all flex items-center justify-center flex-shrink-0"
              title={t.cancelOrder}
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── PIN Entry ────────────────────────────────────────────────────────────────

interface PinEntryProps {
  restaurantId: string | null;
  onSuccess: (restaurantId: string | null, restaurantName: string) => void;
  onAudioUnlock: () => void;
  t: typeof T['en'];
}

function PinEntry({ restaurantId, onSuccess, onAudioUnlock, t }: PinEntryProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [visible, setVisible] = useState(false);

  // Initialise instantly from localStorage cache so logo/name show with zero delay
  const cached = restaurantId ? getCachedRestaurant(restaurantId) : null;
  const [logo, setLogo] = useState<string | null>(cached?.logo ?? null);
  const [restaurantName, setRestaurantName] = useState<string | null>(cached?.name ?? null);
  // Only show skeleton if nothing is cached yet (true first-ever load)
  const [logoLoading, setLogoLoading] = useState(!cached && !!restaurantId);

  useEffect(() => {
    // Fade in after the first paint so any layout-settling is invisible
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!restaurantId) return;
    // Fetch fresh data in background — updates cache silently if anything changed
    get(refs.restaurant(restaurantId)).then((snap) => {
      if (snap.exists()) {
        const r = snap.val() as Restaurant;
        if (r.logo) setLogo(r.logo);
        if (r.name) setRestaurantName(r.name);
        if (r.logo && r.name) setCachedRestaurant(restaurantId, { name: r.name, logo: r.logo });
      }
      setLogoLoading(false);
    }).catch(() => { setLogoLoading(false); });
  }, [restaurantId]);

  async function check() {
    if (pin === MASTER_PIN) { onSuccess(null, 'All restaurants'); return; }
    setChecking(true);
    try {
      if (restaurantId) {
        const snap = await get(refs.restaurant(restaurantId));
        if (snap.exists()) {
          const r = snap.val() as Restaurant;
          if (r.kitchenPin === pin) { onSuccess(restaurantId, r.name); }
          else setError(t.incorrectPin);
        } else setError(t.restaurantNotFound);
      } else {
        const snap = await get(refs.restaurants());
        if (snap.exists()) {
          let found = false;
          snap.forEach((child) => {
            const r = child.val() as Restaurant;
            if (r.kitchenPin === pin) { onSuccess(child.key!, r.name); found = true; }
          });
          if (!found) setError(t.incorrectPin);
        } else setError(t.noRestaurants);
      }
    } catch (err: any) {
      setError(t.permissionError);
    }
    setChecking(false);
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-6"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.18s ease',
      }}
    >
      <div className="w-full max-w-xs">
        <div className="flex items-center justify-center mb-6 h-24">
          {logoLoading ? (
            // Skeleton — same size as logo, no food icon flash
            <div className="h-24 w-44 bg-gray-200 rounded-2xl animate-pulse" />
          ) : logo ? (
            <img
              src={logo}
              alt={restaurantName ?? 'Restaurant'}
              className="h-24 w-auto max-w-[200px] object-contain rounded-2xl"
            />
          ) : (
            <div className="w-16 h-16 bg-orange-500 rounded-2xl flex items-center justify-center text-3xl">🍳</div>
          )}
        </div>
        <h1 className="text-gray-900 text-3xl font-black text-center mb-1">
          {restaurantName ?? 'Kitchen'}
        </h1>
        <p className="text-gray-500 text-center text-sm mb-8">{t.enterPin}</p>
        <input
          type="password"
          inputMode="numeric"
          maxLength={6}
          placeholder="● ● ● ●"
          value={pin}
          onChange={(e) => { setPin(e.target.value); setError(''); }}
          onKeyDown={(e) => e.key === 'Enter' && pin && check()}
          className="w-full bg-white text-gray-900 text-center text-3xl font-bold tracking-widest py-5 rounded-2xl outline-none border-2 border-gray-200 focus:border-orange-500 transition-colors mb-4 shadow-sm"
        />
        {error && <p className="text-red-500 text-sm text-center mb-3">{error}</p>}
        <button
          onPointerDown={() => { primeAlarm(); onAudioUnlock(); }}
          onClick={check}
          disabled={!pin || checking}
          className="w-full bg-orange-500 text-white font-black text-lg py-4 rounded-2xl disabled:opacity-40 transition-all active:scale-[0.98] shadow-sm"
        >
          {checking ? t.checking : t.enterKitchen}
        </button>
      </div>
    </div>
  );
}

// ─── Main KitchenPage ─────────────────────────────────────────────────────────

export default function KitchenPage() {
  const [searchParams] = useSearchParams();
  const restaurantId = searchParams.get('r');

  const [auth, setAuth] = useState<{ restaurantId: string | null; name: string } | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [history, setHistory] = useState<Order[]>([]);
  const [tab, setTab] = useState<'active' | 'history'>('active');
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [muted, setMutedState] = useState(() => isMuted());
  const [lang, setLangState] = useState<Lang>(getLang);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(PINNED_KEY) ?? '[]')); }
    catch { return new Set(); }
  });
  const prevNewCount = useRef(0);

  function togglePin(id: string) {
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      localStorage.setItem(PINNED_KEY, JSON.stringify([...next]));
      return next;
    });
  }

  // Sort helper: pinned orders float to top, preserving timestamp order within groups
  function withPins(arr: Order[]) {
    return [...arr].sort((a, b) => {
      const pa = pinnedIds.has(a.id) ? 0 : 1;
      const pb = pinnedIds.has(b.id) ? 0 : 1;
      return pa - pb;
    });
  }

  const t = T[lang];

  function unlockAudio() {
    if (audioUnlocked) return;
    primeAlarm();
    setAudioUnlocked(true);
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
    if (!next) {
      primeAlarm();
      setTimeout(playAlarm, 100);
    } else {
      stopAlarmLoop();
    }
  }

  function switchLang(l: Lang) {
    saveLang(l);
    setLangState(l);
  }

  // ── Screen Wake Lock ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!auth) return;
    let sentinel: WakeLockSentinel | null = null;
    async function acquire() {
      try {
        if ('wakeLock' in navigator) sentinel = await (navigator as any).wakeLock.request('screen');
      } catch { /* unsupported */ }
    }
    acquire();
    function onVisible() { if (document.visibilityState === 'visible') acquire(); }
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      sentinel?.release().catch(() => {});
    };
  }, [auth]);

  // ── Orders subscription ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!auth) return;
    const ref = auth.restaurantId ? refs.restaurantOrders(auth.restaurantId) : refs.orders();
    const unsub = onValue(ref, (snap) => {
      const active: Order[] = [];
      const done: Order[] = [];
      snap.forEach((c) => {
        const o = { ...c.val(), id: c.key! } as Order;
        const isPaid = o.paymentType === 'cash' || o.paymentStatus === 'paid';
        if (isPaid) {
          if (['new', 'preparing', 'ready'].includes(o.status)) active.push(o);
          else done.push(o);
        }
      });
      active.sort((a, b) => a.timestamp - b.timestamp);
      done.sort((a, b) => b.timestamp - a.timestamp);
      const nc = active.filter((o) => o.status === 'new').length;
      if (nc > 0) startAlarmLoop(); else stopAlarmLoop();
      prevNewCount.current = nc;
      setOrders(active);
      setHistory(done.slice(0, 50));
    });
    return () => unsub();
  }, [auth]);

  // ── Lock body scroll (must be before early return) ──────────────────────────
  useEffect(() => {
    if (!auth) return;
    const prevBody = document.body.style.cssText;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.height = '100%';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.cssText = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, [auth]);

  const activeCount = orders.length;
  const newCount = orders.filter((o) => o.status === 'new').length;
  const titlePrefix = activeCount > 0 ? `(${activeCount}) ` : '';
  useDocumentTitle(auth ? `${titlePrefix}${t.kitchenDisplay} · ${auth.name}` : t.kitchenDisplay);

  if (!auth) {
    return (
      <PinEntry
        restaurantId={restaurantId}
        onSuccess={(id, name) => setAuth({ restaurantId: id, name })}
        onAudioUnlock={() => setAudioUnlocked(true)}
        t={t}
      />
    );
  }

  const newOrders = withPins(orders.filter((o) => o.status === 'new'));
  const preparingOrders = withPins(orders.filter((o) => o.status === 'preparing'));
  const readyOrders = withPins(orders.filter((o) => o.status === 'ready'));

  return (
    <div
      className="flex flex-col bg-gray-50 text-gray-900"
      style={{ height: '100dvh', overflow: 'hidden' }}
      onPointerDown={unlockAudio}
    >
      {/* Audio unlock banner */}
      {!audioUnlocked && (
        <div className="bg-orange-500 text-white text-sm font-bold text-center py-2 px-4 flex-shrink-0">
          {t.tapToEnableSound}
        </div>
      )}

      {/* ── Header ── */}
      {/* paddingTop: safe-area-inset-top pushes content below the iOS status bar in PWA mode */}
      <div
        className="bg-white border-b border-gray-200 flex-shrink-0 shadow-sm"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div
          className="flex items-center py-3 pl-5"
          style={{ paddingRight: 'max(1.5rem, env(safe-area-inset-right, 1.5rem))' }}
        >
          {/* Left: empty spacer — mirrors right side so name stays centred */}
          <div className="flex-1" />

          {/* Center: restaurant name */}
          <div className="flex-none text-center px-3">
            <h1 className="font-black text-xl leading-tight tracking-tight text-gray-900">{auth.name}</h1>
            <p className="text-orange-500 text-[10px] font-bold uppercase tracking-widest">{t.kitchenDisplay}</p>
          </div>

          {/* Right: lang switcher + bell + lock */}
          <div className="flex-1 flex items-center justify-end gap-2">
            {/* SLO | ENG pill */}
            <div className="flex items-center bg-gray-100 rounded-xl p-0.5 border border-gray-200">
              <button
                onClick={() => switchLang('sl')}
                className={`px-2.5 py-1.5 rounded-[10px] text-xs font-black transition-all ${
                  lang === 'sl' ? 'bg-white text-orange-500 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                SLO
              </button>
              <button
                onClick={() => switchLang('en')}
                className={`px-2.5 py-1.5 rounded-[10px] text-xs font-black transition-all ${
                  lang === 'en' ? 'bg-white text-orange-500 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                ENG
              </button>
            </div>

            {/* Bell */}
            <button
              onClick={toggleMute}
              title={muted ? t.unmuteAlerts : t.muteAlerts}
              className={`h-9 w-9 rounded-xl flex items-center justify-center text-lg transition-colors border ${
                muted
                  ? 'bg-gray-100 border-gray-200 text-gray-400'
                  : 'bg-orange-50 border-orange-200 text-orange-500'
              }`}
            >
              {muted ? '🔕' : '🔔'}
            </button>

            {/* Lock */}
            <button
              onClick={() => { stopAlarmLoop(); setAuth(null); }}
              className="h-9 px-3 rounded-xl bg-gray-100 hover:bg-gray-200 border border-gray-200 text-gray-600 text-xs font-bold transition-colors flex items-center"
            >
              {t.lock}
            </button>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex bg-white border-b border-gray-200 flex-shrink-0">
        <button
          onClick={() => setTab('active')}
          className={`flex-1 py-3 text-sm font-bold transition-colors ${
            tab === 'active' ? 'text-orange-500 border-b-2 border-orange-500' : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          <span className="inline-flex items-center justify-center gap-1.5">
            {t.active}
            {newCount > 0 && (
              <span className="bg-red-500 text-white text-[10px] font-black min-w-[18px] h-[18px] rounded-full inline-flex items-center justify-center px-1 animate-pulse">
                {newCount}
              </span>
            )}
          </span>
        </button>
        <button
          onClick={() => setTab('history')}
          className={`flex-1 py-3 text-sm font-bold transition-colors ${
            tab === 'history' ? 'text-orange-500 border-b-2 border-orange-500' : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          {t.history}
        </button>
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto overscroll-none">
        <div className="p-4 max-w-2xl mx-auto">
          {tab === 'active' ? (
            orders.length === 0 ? (
              <div className="text-center py-24">
                <p className="text-5xl mb-4">🍽</p>
                <p className="text-lg font-bold text-gray-600">{t.allClear}</p>
                <p className="text-sm mt-2 text-gray-400">{t.allClearSub}</p>
              </div>
            ) : (
              <>
                {newOrders.length > 0 && (
                  <div className="mb-5">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse" />
                      <p className="text-xs font-black text-orange-500 uppercase tracking-widest">
                        {t.newOrders} ({newOrders.length})
                      </p>
                    </div>
                    <AnimatePresence>
                      {newOrders.map((o) => (
                        <OrderCard key={o.id} order={o} onStatusChange={updateOrderStatus} onTogglePin={togglePin} isPinned={pinnedIds.has(o.id)} t={t} />
                      ))}
                    </AnimatePresence>
                  </div>
                )}
                {preparingOrders.length > 0 && (
                  <div className="mb-5">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                      <p className="text-xs font-black text-blue-500 uppercase tracking-widest">
                        {t.preparing} ({preparingOrders.length})
                      </p>
                    </div>
                    <AnimatePresence>
                      {preparingOrders.map((o) => (
                        <OrderCard key={o.id} order={o} onStatusChange={updateOrderStatus} onTogglePin={togglePin} isPinned={pinnedIds.has(o.id)} t={t} />
                      ))}
                    </AnimatePresence>
                  </div>
                )}
                {readyOrders.length > 0 && (
                  <div className="mb-5">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                      <p className="text-xs font-black text-green-600 uppercase tracking-widest">
                        {t.readyToServe} ({readyOrders.length})
                      </p>
                    </div>
                    <AnimatePresence>
                      {readyOrders.map((o) => (
                        <OrderCard key={o.id} order={o} onStatusChange={updateOrderStatus} onTogglePin={togglePin} isPinned={pinnedIds.has(o.id)} t={t} />
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </>
            )
          ) : (
            history.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <p className="text-4xl mb-3">📋</p>
                <p className="font-semibold">{t.noHistory}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {history.map((o) => (
                  <div key={o.id} className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-black text-gray-900">#{String(o.orderNumber).padStart(3, '0')}</span>
                        {o.tableNumber != null && (
                          <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2 py-1 rounded-lg">
                            {t.table} {o.tableNumber}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">{formatTime(o.timestamp)}</span>
                        <span className={`text-xs px-2.5 py-1 rounded-lg font-bold uppercase ${
                          o.status === 'done' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                        }`}>
                          {o.status === 'done' ? t.statusDone : t.statusCancelled}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm text-gray-500">{o.itemsReadable}</p>
                    <p className="text-base font-black text-gray-900 mt-1">€{o.totalPrice.toFixed(2)}</p>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
