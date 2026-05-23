import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { onValue, get } from 'firebase/database';
import { refs, updateOrderStatus } from '../lib/firebase';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import type { Order, OrderStatus, Restaurant } from '../types';
import { useSearchParams } from 'react-router-dom';

const MASTER_PIN = '0000';

// ─── Audio alert (iOS-safe) ───────────────────────────────────────────────────
// WAV is generated and the Audio element is created at module load time so
// that when primeAlarm() is called inside the PIN-entry tap handler, play()
// fires immediately — iOS Safari requires the call to be synchronous and
// near-instant relative to the user gesture.

function buildAlarmAudio(): HTMLAudioElement {
  const sampleRate = 22050;
  const duration = 1.5;
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
  const pulse = Math.floor(sampleRate * 0.4);
  const gap = Math.floor(sampleRate * 0.1);
  for (let i = 0; i < numSamples; i++) {
    const pos = i % (pulse + gap);
    const sample = pos < pulse
      ? Math.sign(Math.sin(2 * Math.PI * (pos < pulse / 2 ? 1200 : 900) * i / sampleRate)) * 28000
      : 0;
    v.setInt16(44 + i * 2, sample, true);
  }
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const audio = new Audio('data:audio/wav;base64,' + btoa(bin));
  audio.volume = 1.0;
  return audio;
}

// Created eagerly at module load so it's ready before any user interaction.
const alarmAudio = buildAlarmAudio();

function primeAlarm() {
  // Called synchronously inside PIN-entry tap — unlocks audio on iOS Safari.
  alarmAudio.play().then(() => { alarmAudio.pause(); alarmAudio.currentTime = 0; }).catch(() => {});
}
function playAlarm() {
  alarmAudio.currentTime = 0;
  alarmAudio.play().catch(() => {});
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
    new: { label: 'Start preparing', next: 'preparing' },
    preparing: { label: 'Mark ready', next: 'ready' },
    ready: { label: 'Served ✓', next: 'done' },
  };

  const action = nextStatus[order.status];

  const bgColor = {
    new: 'border-l-orange-500 bg-white',
    preparing: 'border-l-blue-500 bg-blue-50',
    ready: 'border-l-green-500 bg-green-50',
    done: 'bg-gray-50',
    cancelled: 'bg-gray-50',
  }[order.status] ?? 'bg-white';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`rounded-2xl border-l-4 shadow-sm p-4 mb-3 ${bgColor}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xl font-black text-gray-900">#{String(order.orderNumber).padStart(3, '0')}</span>
          {order.tableNumber != null && (
            <span className="bg-gray-100 text-gray-600 text-xs font-semibold px-2 py-1 rounded-lg">
              Table {order.tableNumber}
            </span>
          )}
          <span className={`text-xs font-semibold px-2 py-1 rounded-lg capitalize ${
            order.paymentType === 'cash'
              ? 'bg-yellow-100 text-yellow-700'
              : 'bg-blue-100 text-blue-700'
          }`}>
            {order.paymentType}
          </span>
        </div>
        <ElapsedTimer ts={order.timestamp} />
      </div>

      <p className="text-sm text-gray-500 mb-2">{order.customerName}</p>

      <div className="space-y-1 mb-3">
        {items.length > 0 ? items.map((item, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="font-bold text-gray-800 text-sm w-6 flex-shrink-0">{item.quantity}×</span>
            <div>
              <span className="text-gray-800 text-sm">{item.name}</span>
              {item.modifiers && (
                <p className="text-xs text-gray-400">{item.modifiers}</p>
              )}
            </div>
          </div>
        )) : (
          <p className="text-sm text-gray-600">{order.itemsReadable}</p>
        )}
      </div>

      {order.note && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-2 mb-3">
          <p className="text-xs font-semibold text-yellow-700 mb-0.5">Note</p>
          <p className="text-sm text-yellow-800">{order.note}</p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="font-bold text-gray-900">€{order.totalPrice.toFixed(2)}</span>
        {action && (
          <button
            onClick={() => onStatusChange(order.id, action.next)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              order.status === 'new'
                ? 'bg-orange-500 text-white'
                : order.status === 'preparing'
                ? 'bg-blue-500 text-white'
                : 'bg-green-500 text-white'
            }`}
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
}

function PinEntry({ restaurantId, onSuccess }: PinEntryProps) {
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
          onPointerDown={primeAlarm}
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
  const prevNewCount = useRef(0);

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
      if (newCount > prevNewCount.current) {
        playAlarm();
      }
      prevNewCount.current = newCount;

      setOrders(active);
      setHistory(done.slice(0, 50));
    });
    return () => unsub();
  }, [auth]);

  if (!auth) {
    return <PinEntry restaurantId={restaurantId} onSuccess={(id, name) => setAuth({ restaurantId: id, name })} />;
  }

  const newOrders = orders.filter((o) => o.status === 'new');
  const preparingOrders = orders.filter((o) => o.status === 'preparing');
  const readyOrders = orders.filter((o) => o.status === 'ready');

  return (
    <div className="min-h-screen bg-gray-100">

      {/* Header */}
      <div className="bg-gray-900 text-white px-4 py-4 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-lg">{auth.name}</h1>
          <p className="text-gray-400 text-xs">Kitchen view</p>
        </div>
        <div className="flex items-center gap-3">
          {orders.length > 0 && (
            <div className="bg-orange-500 text-white text-sm font-bold px-3 py-1 rounded-full">
              {orders.length} active
            </div>
          )}
          <button
            onClick={() => setAuth(null)}
            className="text-gray-400 text-xs px-3 py-2 rounded-lg hover:bg-gray-800"
          >
            Lock
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 bg-white">
        {(['active', 'history'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-3 text-sm font-semibold capitalize transition-colors ${
              tab === t ? 'text-orange-500 border-b-2 border-orange-500' : 'text-gray-500'
            }`}
          >
            {t === 'active' ? `Active (${orders.length})` : 'History'}
          </button>
        ))}
      </div>

      <div className="p-4 max-w-2xl mx-auto">
        {tab === 'active' ? (
          <>
            {orders.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <p className="text-4xl mb-3">🍽</p>
                <p>No active orders</p>
              </div>
            ) : (
              <>
                {newOrders.length > 0 && (
                  <div className="mb-2">
                    <p className="text-xs font-bold text-orange-500 uppercase tracking-wide mb-2">New ({newOrders.length})</p>
                    <AnimatePresence>
                      {newOrders.map((o) => (
                        <OrderCard key={o.id} order={o} onStatusChange={updateOrderStatus} />
                      ))}
                    </AnimatePresence>
                  </div>
                )}
                {preparingOrders.length > 0 && (
                  <div className="mb-2">
                    <p className="text-xs font-bold text-blue-500 uppercase tracking-wide mb-2">Preparing ({preparingOrders.length})</p>
                    <AnimatePresence>
                      {preparingOrders.map((o) => (
                        <OrderCard key={o.id} order={o} onStatusChange={updateOrderStatus} />
                      ))}
                    </AnimatePresence>
                  </div>
                )}
                {readyOrders.length > 0 && (
                  <div className="mb-2">
                    <p className="text-xs font-bold text-green-500 uppercase tracking-wide mb-2">Ready ({readyOrders.length})</p>
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
                <p>No order history</p>
              </div>
            ) : (
              <div>
                {history.map((o) => (
                  <div key={o.id} className="bg-white rounded-2xl p-4 mb-3 opacity-70">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-gray-700">#{String(o.orderNumber).padStart(3, '0')}</span>
                      <span className={`text-xs px-2 py-1 rounded-lg font-semibold ${
                        o.status === 'done' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-500'
                      }`}>{o.status}</span>
                    </div>
                    {o.tableNumber != null && <p className="text-xs text-gray-400">Table {o.tableNumber}</p>}
                    <p className="text-sm text-gray-600 mt-1">{o.itemsReadable}</p>
                    <p className="text-sm font-semibold text-gray-800 mt-1">€{o.totalPrice.toFixed(2)}</p>
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
