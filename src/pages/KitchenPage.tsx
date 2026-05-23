import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { onValue, get } from 'firebase/database';
import { refs, updateOrderStatus } from '../lib/firebase';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import type { Order, OrderStatus, Restaurant } from '../types';
import { useSearchParams } from 'react-router-dom';

const MASTER_PIN = '0000';

// ─── Audio alert (iOS-safe) ───────────────────────────────────────────────────
// Professional double-chime using sine waves with exponential decay.
// Built eagerly at module load so play() fires instantly on first gesture.
// Loops every 4 s while there are unaccepted new orders.

function buildAlarmAudio(): HTMLAudioElement {
  const sampleRate = 44100;
  // Two chime hits: 880 Hz (A5) at t=0, 1047 Hz (C6) at t=0.35s
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
    // Sine wave with fast attack and smooth exponential decay
    const attack = Math.min(dt / 0.005, 1);
    const decay = Math.exp(-dt * 6);
    return attack * decay * Math.sin(2 * Math.PI * freq * dt)
         + attack * decay * 0.3 * Math.sin(2 * Math.PI * freq * 2 * dt)   // 1st harmonic
         + attack * decay * 0.1 * Math.sin(2 * Math.PI * freq * 3 * dt);  // 2nd harmonic
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

function primeAlarm() {
  alarmAudio.play().then(() => { alarmAudio.pause(); alarmAudio.currentTime = 0; }).catch(() => {});
}
function playAlarm() {
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

function elapsed(ts: number) {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

function ElapsedTimer({ ts }: { ts: number }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 10000);
    return () => clearInterval(t);
  }, []);
  const sec = Math.floor((Date.now() - ts) / 1000);
  const urgent = sec > 900;
  const warn = sec > 600;
  return (
    <span className={`text-sm font-semibold ${urgent ? 'text-red-500' : warn ? 'text-orange-500' : 'text-gray-400'}`}>
      {elapsed(ts)}
    </span>
  );
}

interface OrderCardProps {
  order: Order;
  onStatusChange: (id: string, status: OrderStatus) => void;
}

function OrderCard({ order, onStatusChange }: OrderCardProps) {
  let items: { name: string; quantity: number; modifiers?: string }[] = [];
  try { items = JSON.parse(order.items); } catch { /* fallback */ }

  const nextStatus: Record<string, { label: string; next: OrderStatus }> = {
    new: { label: '▶ Start Preparing', next: 'preparing' },
    preparing: { label: '✓ Mark Ready', next: 'ready' },
    ready: { label: '🍽 Served', next: 'done' },
  };

  const action = nextStatus[order.status];

  const cardStyle = {
    new: 'border-orange-400 bg-white shadow-orange-100',
    preparing: 'border-blue-400 bg-blue-50 shadow-blue-100',
    ready: 'border-green-400 bg-green-50 shadow-green-100',
    done: 'border-gray-200 bg-gray-50',
    cancelled: 'border-gray-200 bg-gray-50',
  }[order.status] ?? 'border-gray-200 bg-white';

  const actionStyle = {
    new: 'bg-orange-500 hover:bg-orange-600 text-white',
    preparing: 'bg-blue-500 hover:bg-blue-600 text-white',
    ready: 'bg-green-500 hover:bg-green-600 text-white',
  }[order.status] ?? '';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className={`rounded-2xl border-2 shadow-md mb-4 overflow-hidden ${cardStyle}`}
    >
      {/* Card Header */}
      <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3">
        {/* Left: order number + table */}
        <div className="flex items-center gap-3">
          <span className="text-3xl font-black text-gray-900 leading-none">
            #{String(order.orderNumber).padStart(3, '0')}
          </span>
          {order.tableNumber != null && (
            <div className="bg-gray-900 text-white rounded-xl px-3 py-1.5 text-center">
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 leading-none mb-0.5">Table</p>
              <p className="text-2xl font-black leading-none">{order.tableNumber}</p>
            </div>
          )}
        </div>

        {/* Right: payment + timer */}
        <div className="flex flex-col items-end gap-1.5">
          <span className={`text-sm font-black px-3 py-1 rounded-lg uppercase tracking-wide ${
            order.paymentType === 'cash'
              ? 'bg-amber-400 text-amber-900'
              : 'bg-blue-500 text-white'
          }`}>
            {order.paymentType === 'cash' ? '💵 Cash' : '💳 Card'}
          </span>
          <ElapsedTimer ts={order.timestamp} />
        </div>
      </div>

      {/* Divider */}
      <div className="mx-4 border-t border-gray-100" />

      {/* Items */}
      <div className="px-4 py-3 space-y-2">
        {items.length > 0 ? items.map((item, i) => (
          <div key={i} className="flex items-start gap-3">
            <span className="bg-gray-900 text-white text-sm font-black w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0">
              {item.quantity}
            </span>
            <div>
              <p className="text-gray-900 font-semibold text-base leading-tight">{item.name}</p>
              {item.modifiers && <p className="text-xs text-gray-400 mt-0.5">{item.modifiers}</p>}
            </div>
          </div>
        )) : (
          <p className="text-gray-700 text-base">{order.itemsReadable}</p>
        )}
      </div>

      {/* Note */}
      {order.note && (
        <div className="mx-4 mb-3 bg-yellow-50 border border-yellow-300 rounded-xl px-3 py-2">
          <p className="text-xs font-bold text-yellow-700 uppercase tracking-wide mb-0.5">⚠ Note</p>
          <p className="text-sm text-yellow-900 font-medium">{order.note}</p>
        </div>
      )}

      {/* Footer */}
      <div className="px-4 pb-4 flex items-center justify-between gap-3">
        <span className="text-xl font-black text-gray-900">€{order.totalPrice.toFixed(2)}</span>
        {action && (
          <button
            onClick={() => onStatusChange(order.id, action.next)}
            className={`flex-1 py-3.5 rounded-xl text-base font-black tracking-wide transition-all active:scale-[0.98] shadow-sm ${actionStyle}`}
          >
            {action.label}
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ─── PIN Entry ────────────────────────────────────────────────────────────────

interface PinEntryProps {
  restaurantId: string | null;
  onSuccess: (restaurantId: string | null, restaurantName: string) => void;
  onAudioUnlock: () => void;
}

function PinEntry({ restaurantId, onSuccess, onAudioUnlock }: PinEntryProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  async function check() {
    if (pin === MASTER_PIN) {
      onSuccess(null, 'All restaurants');
      return;
    }
    setChecking(true);
    try {
      if (restaurantId) {
        const snap = await get(refs.restaurant(restaurantId));
        if (snap.exists()) {
          const r = snap.val() as Restaurant;
          if (r.kitchenPin === pin) {
            onSuccess(restaurantId, r.name);
          } else {
            setError('Incorrect PIN');
          }
        } else {
          setError('Restaurant not found');
        }
      } else {
        const snap = await get(refs.restaurants());
        if (snap.exists()) {
          let found = false;
          snap.forEach((child) => {
            const r = child.val() as Restaurant;
            if (r.kitchenPin === pin) {
              onSuccess(child.key!, r.name);
              found = true;
            }
          });
          if (!found) setError('Incorrect PIN');
        } else {
          setError('No restaurants found');
        }
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Permission error. Try specifying restaurant ID in URL (e.g. ?r=restaurant_id).');
    }
    setChecking(false);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 px-6">
      <div className="w-full max-w-xs">
        <h1 className="text-white text-2xl font-bold text-center mb-2">Kitchen</h1>
        <p className="text-gray-400 text-center text-sm mb-8">Enter your PIN to access orders</p>
        <input
          type="password"
          inputMode="numeric"
          maxLength={6}
          placeholder="PIN"
          value={pin}
          onChange={(e) => { setPin(e.target.value); setError(''); }}
          onKeyDown={(e) => e.key === 'Enter' && pin && check()}
          className="w-full bg-gray-800 text-white text-center text-3xl font-bold tracking-widest py-4 rounded-2xl outline-none border-2 border-gray-700 focus:border-orange-500 transition-colors mb-4"
        />
        {error && <p className="text-red-400 text-sm text-center mb-3">{error}</p>}
        <button
          onPointerDown={() => { primeAlarm(); onAudioUnlock(); }}
          onClick={check}
          disabled={!pin || checking}
          className="w-full bg-orange-500 text-white font-semibold py-4 rounded-2xl disabled:opacity-40"
        >
          {checking ? 'Checking...' : 'Enter'}
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
  const prevNewCount = useRef(0);

  function unlockAudio() {
    if (audioUnlocked) return;
    primeAlarm();
    setAudioUnlocked(true);
  }

  // ── Screen Wake Lock — keeps display on while kitchen is open ───────────────
  useEffect(() => {
    if (!auth) return;
    let sentinel: WakeLockSentinel | null = null;
    async function acquire() {
      try {
        if ('wakeLock' in navigator) {
          sentinel = await (navigator as any).wakeLock.request('screen');
        }
      } catch { /* device may not support it */ }
    }
    acquire();
    // iOS releases the lock when the app is backgrounded — re-acquire on return
    function onVisible() { if (document.visibilityState === 'visible') acquire(); }
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      sentinel?.release().catch(() => {});
    };
  }, [auth]);

  // Tab-title cue for kitchen staff who keep the page in a background tab:
  // prefix the active-order count so the tab acts like a Gmail-style badge.
  const activeCount = orders.length;
  const titlePrefix = activeCount > 0 ? `(${activeCount}) ` : '';
  useDocumentTitle(auth ? `${titlePrefix}Kitchen · ${auth.name}` : 'Kitchen');

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

      const newCount = active.filter((o) => o.status === 'new').length;
      if (newCount > 0) {
        startAlarmLoop();
      } else {
        stopAlarmLoop();
      }
      prevNewCount.current = newCount;

      setOrders(active);
      setHistory(done.slice(0, 50));
    });
    return () => unsub();
  }, [auth]);

  if (!auth) {
    return <PinEntry restaurantId={restaurantId} onSuccess={(id, name) => setAuth({ restaurantId: id, name })} onAudioUnlock={() => setAudioUnlocked(true)} />;
  }

  const newOrders = orders.filter((o) => o.status === 'new');
  const preparingOrders = orders.filter((o) => o.status === 'preparing');
  const readyOrders = orders.filter((o) => o.status === 'ready');

  return (
    <div className="min-h-screen bg-gray-100" onPointerDown={unlockAudio}>

      {/* iOS audio unlock banner — disappears after first tap */}
      {!audioUnlocked && (
        <div className="bg-orange-500 text-white text-sm font-bold text-center py-2 px-4 cursor-pointer">
          🔔 Tap anywhere to enable sound alerts
        </div>
      )}

      {/* Header */}
      <div className="bg-gray-900 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-orange-500 rounded-xl flex items-center justify-center text-lg">🍳</div>
          <div>
            <h1 className="font-black text-base leading-tight">{auth.name}</h1>
            <p className="text-gray-400 text-xs">Kitchen Display</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {orders.length > 0 && (
            <div className="bg-orange-500 text-white text-sm font-black px-3 py-1.5 rounded-xl">
              {orders.length} active
            </div>
          )}
          <button
            onClick={() => { stopAlarmLoop(); setAuth(null); }}
            className="text-gray-400 text-xs px-3 py-2 rounded-lg hover:bg-gray-800 border border-gray-700"
          >
            Lock
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-gray-800">
        {(['active', 'history'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-3 text-sm font-bold transition-colors ${
              tab === t
                ? 'text-orange-400 border-b-2 border-orange-400 bg-gray-900'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {t === 'active' ? `🔥 Active (${orders.length})` : '📋 History'}
          </button>
        ))}
      </div>

      <div className="p-4 max-w-2xl mx-auto">
        {tab === 'active' ? (
          <>
            {orders.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                <p className="text-5xl mb-4">🍽</p>
                <p className="text-lg font-semibold">All clear — no active orders</p>
                <p className="text-sm mt-1 text-gray-500">New orders will appear here automatically</p>
              </div>
            ) : (
              <>
                {newOrders.length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse" />
                      <p className="text-sm font-black text-orange-500 uppercase tracking-widest">New Orders ({newOrders.length})</p>
                    </div>
                    <AnimatePresence>
                      {newOrders.map((o) => (
                        <OrderCard key={o.id} order={o} onStatusChange={updateOrderStatus} />
                      ))}
                    </AnimatePresence>
                  </div>
                )}
                {preparingOrders.length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                      <p className="text-sm font-black text-blue-500 uppercase tracking-widest">Preparing ({preparingOrders.length})</p>
                    </div>
                    <AnimatePresence>
                      {preparingOrders.map((o) => (
                        <OrderCard key={o.id} order={o} onStatusChange={updateOrderStatus} />
                      ))}
                    </AnimatePresence>
                  </div>
                )}
                {readyOrders.length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                      <p className="text-sm font-black text-green-500 uppercase tracking-widest">Ready to Serve ({readyOrders.length})</p>
                    </div>
                    <AnimatePresence>
                      {readyOrders.map((o) => (
                        <OrderCard key={o.id} order={o} onStatusChange={updateOrderStatus} />
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <>
            {history.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <p className="text-4xl mb-3">📋</p>
                <p>No order history yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {history.map((o) => (
                  <div key={o.id} className="bg-white rounded-2xl p-4 border border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-black text-gray-800">#{String(o.orderNumber).padStart(3, '0')}</span>
                        {o.tableNumber != null && (
                          <span className="bg-gray-100 text-gray-700 text-xs font-bold px-2 py-1 rounded-lg">Table {o.tableNumber}</span>
                        )}
                      </div>
                      <span className={`text-xs px-2.5 py-1 rounded-lg font-bold uppercase ${
                        o.status === 'done' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                      }`}>{o.status}</span>
                    </div>
                    <p className="text-sm text-gray-600">{o.itemsReadable}</p>
                    <p className="text-base font-black text-gray-900 mt-1">€{o.totalPrice.toFixed(2)}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
