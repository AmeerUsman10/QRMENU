import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Plus, Minus, UtensilsCrossed, CheckCircle, Search, ArrowLeft } from 'lucide-react';
import { onValue } from 'firebase/database';
import { refs, placeOrder } from '../lib/firebase';
import { useCartStore } from '../store/cartStore';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { OrderPageSkeleton } from '../components/Skeleton';
import type { Restaurant, MenuItem, CartItem } from '../types';

// ─── Language ─────────────────────────────────────────────────────────────────

type Lang = 'sl' | 'en';
const LANG_KEY = 'menu.lang';

const T = {
  sl: {
    loading: 'Nalaganje menija',
    noRestaurant: 'Ni določene restavracije. Skenirajte veljavno QR kodo.',
    restaurantNotFound: 'Restavracija ni najdena.',
    whichTable: 'Pri kateri mizi sedite?',
    tablePlaceholder: 'Številka mize',
    continueBtn: 'Naprej',
    table: 'Miza',
    popular: 'Priljubljeno',
    unavailable: 'Ni na voljo',
    other: 'Ostalo',
    viewOrder: 'Poglej naročilo',
    yourOrder: 'Vaše naročilo',
    checkout: 'Zaključek',
    total: 'Skupaj',
    name: 'Vaše ime',
    namePlaceholder: 'npr. Matej',
    nameRequired: 'Vnesite vaše ime',
    phone: 'Telefon (neobvezno)',
    phonePlaceholder: '+386 ...',
    note: 'Opomba za kuhinjo (neobvezno)',
    notePlaceholder: 'Alergije, posebne želje…',
    payment: 'Plačilo',
    cash: '💵 Gotovina',
    card: '💳 Kartica',
    cardHint: 'Sprejemamo Apple Pay in Google Pay',
    cardComingSoon: 'Plačilo s kartico še ni aktivirano. Kmalu na voljo.',
    orderSummary: 'Povzetek naročila',
    back: 'Nazaj',
    placeOrder: 'Oddaj naročilo',
    placingOrder: 'Oddajam naročilo…',
    orderPlaced: 'Naročilo oddano!',
    yourOrderNumber: 'Vaša številka naročila je',
    bringToTable: 'Prinesli vam bomo na mizo, ko bo pripravljeno.',
    orderMore: 'Naroči več',
    required: 'Obvezno',
    addToOrder: 'Dodaj v naročilo',
    pleaseSelect: 'Izberite',
    orderError: 'Naročila ni bilo mogoče oddati. Poskusite znova.',
    searchPlaceholder: 'Iščite jedi…',
    noResults: 'Ni rezultatov',
    noResultsSub: 'Poskusite z drugim izrazom',
    searchResultsFor: (n: number, q: string) => `${n} ${n === 1 ? 'rezultat' : 'rezultati'} za "${q}"`,
  },
  en: {
    loading: 'Loading menu',
    noRestaurant: 'No restaurant specified. Scan a valid QR code.',
    restaurantNotFound: 'Restaurant not found.',
    whichTable: 'Which table are you at?',
    tablePlaceholder: 'Table number',
    continueBtn: 'Continue',
    table: 'Table',
    popular: 'Popular',
    unavailable: 'Unavailable',
    other: 'Other',
    viewOrder: 'View order',
    yourOrder: 'Your order',
    checkout: 'Checkout',
    total: 'Total',
    name: 'Your name',
    namePlaceholder: 'e.g. Matej',
    nameRequired: 'Please enter your name',
    phone: 'Phone (optional)',
    phonePlaceholder: '+386 ...',
    note: 'Note for kitchen (optional)',
    notePlaceholder: 'Allergies, extra requests…',
    payment: 'Payment',
    cash: '💵 Cash',
    card: '💳 Card',
    cardHint: 'Apple Pay & Google Pay accepted',
    cardComingSoon: 'Card payment not activated yet. Coming soon.',
    orderSummary: 'Order summary',
    back: 'Back',
    placeOrder: 'Place order',
    placingOrder: 'Placing order…',
    orderPlaced: 'Order placed!',
    yourOrderNumber: 'Your order number is',
    bringToTable: "We'll bring it to your table once it's ready.",
    orderMore: 'Order more',
    required: 'Required',
    addToOrder: 'Add to order',
    pleaseSelect: 'Please select',
    orderError: 'Failed to place order. Please try again.',
    searchPlaceholder: 'Search dishes…',
    noResults: 'No results',
    noResultsSub: 'Try a different search term',
    searchResultsFor: (n: number, q: string) => `${n} result${n !== 1 ? 's' : ''} for "${q}"`,
  },
};

function getLang(): Lang {
  return (localStorage.getItem(LANG_KEY) as Lang) ?? 'sl';
}
function saveLang(l: Lang) { localStorage.setItem(LANG_KEY, l); }

// ─── Utility ──────────────────────────────────────────────────────────────────

function formatPrice(n: number) {
  return `€${n.toFixed(2)}`;
}

// ─── Language Switcher Pill ───────────────────────────────────────────────────

function LangPill({ lang, onChange }: { lang: Lang; onChange: (l: Lang) => void }) {
  return (
    <div className="flex items-center bg-gray-100 rounded-xl p-0.5 border border-gray-200 flex-shrink-0">
      <button
        onClick={() => onChange('sl')}
        className={`px-2.5 py-1.5 rounded-[10px] text-xs font-black transition-all ${
          lang === 'sl' ? 'bg-white text-orange-500 shadow-sm' : 'text-gray-400'
        }`}
      >
        SLO
      </button>
      <button
        onClick={() => onChange('en')}
        className={`px-2.5 py-1.5 rounded-[10px] text-xs font-black transition-all ${
          lang === 'en' ? 'bg-white text-orange-500 shadow-sm' : 'text-gray-400'
        }`}
      >
        ENG
      </button>
    </div>
  );
}

// ─── Highlight matching text ──────────────────────────────────────────────────

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="bg-orange-100 text-orange-700 not-italic rounded-sm px-0.5 font-black">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

// ─── Modifier Sheet ───────────────────────────────────────────────────────────

interface ModifierSheetProps {
  item: MenuItem;
  onClose: () => void;
  onAdd: (cartItem: CartItem) => void;
  t: typeof T['en'];
}

function ModifierSheet({ item, onClose, onAdd, t }: ModifierSheetProps) {
  const groups = Object.entries(item.modifierGroups ?? {}).map(([id, g]) => ({
    ...g,
    id,
    options: Object.entries(g.options).map(([oid, o]) => ({ ...o, id: oid })),
  }));

  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [error, setError] = useState('');

  function toggle(groupId: string, optId: string, max: number) {
    setSelections((prev) => {
      const cur = prev[groupId] ?? [];
      if (cur.includes(optId)) return { ...prev, [groupId]: cur.filter((x) => x !== optId) };
      if (max === 1) return { ...prev, [groupId]: [optId] };
      if (cur.length >= max) return prev;
      return { ...prev, [groupId]: [...cur, optId] };
    });
  }

  function getModifierPrice() {
    let extra = 0;
    for (const g of groups) {
      for (const optId of selections[g.id] ?? []) {
        const opt = g.options.find((o) => o.id === optId);
        if (opt) extra += opt.price;
      }
    }
    return extra;
  }

  function getModifiersLabel() {
    const parts: string[] = [];
    for (const g of groups) {
      for (const optId of selections[g.id] ?? []) {
        const opt = g.options.find((o) => o.id === optId);
        if (opt) parts.push(opt.price > 0 ? `${opt.name} (+${formatPrice(opt.price)})` : opt.name);
      }
    }
    return parts.join(', ');
  }

  function handleAdd() {
    for (const g of groups) {
      if (g.required && !(selections[g.id]?.length)) {
        setError(`${t.pleaseSelect} ${g.name}`);
        return;
      }
    }
    const modLabel = getModifiersLabel();
    const cartId = `${item.id}__${JSON.stringify(selections)}`;
    onAdd({
      id: cartId,
      name: item.name,
      price: item.price + getModifierPrice(),
      quantity: 1,
      image: item.image,
      modifiers: modLabel || undefined,
    });
    onClose();
  }

  const totalPrice = item.price + getModifierPrice();

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="bg-white rounded-t-3xl max-h-[90vh] flex flex-col overflow-hidden"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 280 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Image header */}
        {item.image && (
          <div className="relative flex-shrink-0">
            <img src={item.image} alt={item.name} className="w-full h-52 object-cover" />
            <button
              onClick={onClose}
              className="absolute top-3 right-3 w-9 h-9 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center"
            >
              <X size={18} className="text-white" />
            </button>
          </div>
        )}

        <div className="overflow-y-auto flex-1 p-5">
          {/* Close button when no image */}
          {!item.image && (
            <div className="flex items-center justify-between mb-4">
              <div />
              <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100">
                <X size={20} className="text-gray-500" />
              </button>
            </div>
          )}

          <h2 className="text-xl font-black text-gray-900 mb-1">{item.name}</h2>
          {item.description && (
            <p className="text-gray-500 text-sm mb-5 leading-relaxed">{item.description}</p>
          )}

          {groups.map((g) => (
            <div key={g.id} className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <span className="font-black text-gray-900">{g.name}</span>
                {g.required && (
                  <span className="text-xs bg-orange-100 text-orange-600 px-2.5 py-1 rounded-full font-bold">
                    {t.required}
                  </span>
                )}
              </div>
              <div className="space-y-2">
                {g.options.map((opt) => {
                  const selected = (selections[g.id] ?? []).includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      onClick={() => toggle(g.id, opt.id, g.max)}
                      className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl border-2 transition-all ${
                        selected
                          ? 'border-orange-500 bg-orange-50'
                          : 'border-gray-100 bg-gray-50'
                      }`}
                    >
                      <span className={`font-medium ${selected ? 'text-orange-700' : 'text-gray-800'}`}>
                        {opt.name}
                      </span>
                      <div className="flex items-center gap-3">
                        {opt.price > 0 && (
                          <span className="text-sm font-bold text-gray-500">+{formatPrice(opt.price)}</span>
                        )}
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                          selected ? 'border-orange-500 bg-orange-500' : 'border-gray-300'
                        }`}>
                          {selected && <div className="w-2 h-2 rounded-full bg-white" />}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {error && (
            <p className="text-red-500 text-sm font-medium mb-3">{error}</p>
          )}
        </div>

        <div className="p-5 border-t border-gray-100 flex-shrink-0">
          <button
            onClick={handleAdd}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black text-base py-4 rounded-2xl transition-all active:scale-[0.98] shadow-sm"
          >
            {t.addToOrder} — {formatPrice(totalPrice)}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Cart Sheet ───────────────────────────────────────────────────────────────

interface CheckoutData {
  name: string;
  phone: string;
  note: string;
  payment: 'cash' | 'card';
}

interface CartSheetProps {
  onClose: () => void;
  restaurant: Restaurant;
  tableNumber: number | null;
  onOrderPlaced: (orderId: string, orderNum: number) => void;
  t: typeof T['en'];
}

function CartSheet({ onClose, restaurant, tableNumber, t }: CartSheetProps) {
  const { items, changeQty, clearCart, total, totalFormatted, itemsReadable } = useCartStore();
  const [step, setStep] = useState<'cart' | 'checkout'>('cart');
  const [form, setForm] = useState<CheckoutData>({ name: '', phone: '', note: '', payment: 'cash' });
  const [placing, setPlacing] = useState(false);
  const [formError, setFormError] = useState('');

  async function handlePlace() {
    if (form.payment === 'card') return; // card not activated — button is disabled
    setPlacing(true);
    try {
      const orderPayload = {
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
        tableNumber,
        customerName: '',
        customerPhone: undefined,
        items: JSON.stringify(items),
        itemsReadable: itemsReadable(),
        totalPrice: total(),
        paymentType: form.payment,
        status: 'new' as const,
        note: form.note.trim() || undefined,
        timestamp: Date.now(),
      };

      const { orderId } = await placeOrder(orderPayload);
      clearCart();
      window.location.href = `${window.location.origin}/order/success?order_id=${orderId}`;
    } catch (err) {
      console.error('Order placement error:', err);
      setFormError(t.orderError);
      setPlacing(false);
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="bg-white rounded-t-3xl max-h-[92vh] flex flex-col"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 280 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-lg font-black text-gray-900">
              {step === 'cart' ? t.yourOrder : t.checkout}
            </h2>
            {tableNumber != null && (
              <p className="text-sm text-gray-400 mt-0.5">{t.table} {tableNumber}</p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center"
          >
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4">
          {step === 'cart' ? (
            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.id} className="flex items-center gap-3 bg-gray-50 rounded-2xl p-3">
                  {item.image && (
                    <img
                      src={item.image}
                      alt={item.name}
                      className="w-14 h-14 rounded-xl object-cover flex-shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 text-sm leading-snug">{item.name}</p>
                    {item.modifiers && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate">{item.modifiers}</p>
                    )}
                    <p className="text-orange-500 font-black text-sm mt-1">{formatPrice(item.price)}</p>
                  </div>
                  <div className="flex items-center gap-1.5 bg-white rounded-xl px-1 py-1 border border-gray-200 flex-shrink-0">
                    <button
                      onClick={() => changeQty(item.id, -1)}
                      aria-label={`Decrease ${item.name}`}
                      className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100"
                    >
                      <Minus size={14} className="text-gray-600" />
                    </button>
                    <span className="w-6 text-center font-black text-gray-900 text-sm">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => changeQty(item.id, 1)}
                      aria-label={`Increase ${item.name}`}
                      className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100"
                    >
                      <Plus size={14} className="text-gray-600" />
                    </button>
                  </div>
                </div>
              ))}

              <div className="flex items-center justify-between pt-3 border-t border-gray-100 mt-2">
                <span className="font-black text-gray-900">{t.total}</span>
                <span className="text-2xl font-black text-gray-900">{totalFormatted()}</span>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Note for kitchen */}
              <div>
                <label className="block text-sm font-black text-gray-700 mb-1.5">{t.note}</label>
                <textarea
                  className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3.5 text-gray-900 outline-none focus:border-orange-400 transition-colors resize-none font-medium"
                  placeholder={t.notePlaceholder}
                  rows={3}
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                />
              </div>

              {/* Payment */}
              <div>
                <label className="block text-sm font-black text-gray-700 mb-2">{t.payment}</label>
                <div className="grid grid-cols-2 gap-3">
                  {(['cash', 'card'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setForm({ ...form, payment: type })}
                      className={`py-4 rounded-2xl font-black text-sm border-2 transition-all ${
                        form.payment === type
                          ? 'border-orange-500 bg-orange-50 text-orange-600'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      {type === 'cash' ? t.cash : t.card}
                    </button>
                  ))}
                </div>
                {/* Card coming soon banner */}
                {form.payment === 'card' && (
                  <div className="mt-3 flex items-center gap-2.5 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
                    <span className="text-amber-500 text-lg flex-shrink-0">⏳</span>
                    <p className="text-sm text-amber-700 font-medium leading-snug">
                      {t.cardComingSoon}
                    </p>
                  </div>
                )}
              </div>

              {/* Order summary */}
              <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">
                  {t.orderSummary}
                </p>
                <p className="text-sm text-gray-700 leading-relaxed">{itemsReadable()}</p>
                <p className="text-xl font-black text-gray-900 mt-2">{totalFormatted()}</p>
              </div>

              {formError && (
                <p className="text-red-500 text-sm font-medium">{formError}</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-6 pt-4 border-t border-gray-100 flex-shrink-0">
          {step === 'cart' ? (
            <button
              onClick={() => setStep('checkout')}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black py-4 rounded-2xl text-base transition-all active:scale-[0.98] shadow-sm"
            >
              {t.continueBtn} — {totalFormatted()}
            </button>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={() => setStep('cart')}
                className="flex-1 border-2 border-gray-200 text-gray-700 font-black py-4 rounded-2xl transition-all hover:border-gray-300"
              >
                {t.back}
              </button>
              <button
                onClick={handlePlace}
                disabled={placing || form.payment === 'card'}
                className="flex-[2] bg-orange-500 hover:bg-orange-600 text-white font-black py-4 rounded-2xl disabled:opacity-40 transition-all active:scale-[0.98]"
              >
                {placing ? t.placingOrder : t.placeOrder}
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Order Confirmation ───────────────────────────────────────────────────────

function OrderConfirmation({ orderNumber, onDismiss, t }: {
  orderNumber: number;
  onDismiss: () => void;
  t: typeof T['en'];
}) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white px-6 text-center"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', damping: 24, stiffness: 280 }}
    >
      <motion.div
        initial={{ scale: 0, rotate: -10 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ delay: 0.1, type: 'spring', damping: 18, stiffness: 300 }}
      >
        <CheckCircle size={80} className="text-green-500 mb-5" />
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <h2 className="text-2xl font-black text-gray-900 mb-2">{t.orderPlaced}</h2>
        <p className="text-gray-500 mb-2">{t.yourOrderNumber}</p>
        <div className="text-7xl font-black text-orange-500 mb-4">
          #{String(orderNumber).padStart(3, '0')}
        </div>
        <p className="text-gray-500 text-sm mb-10">{t.bringToTable}</p>
        <button
          onClick={onDismiss}
          className="bg-orange-500 hover:bg-orange-600 text-white font-black px-10 py-4 rounded-2xl text-base transition-all active:scale-[0.98] shadow-sm"
        >
          {t.orderMore}
        </button>
      </motion.div>
    </motion.div>
  );
}

// ─── Restaurant cache (instant menu on reconnect) ────────────────────────────

function getCachedMenu(id: string): Restaurant | null {
  try {
    const raw = localStorage.getItem(`menu.restaurant.${id}`);
    return raw ? (JSON.parse(raw) as Restaurant) : null;
  } catch { return null; }
}
function setCachedMenu(id: string, data: Restaurant) {
  try { localStorage.setItem(`menu.restaurant.${id}`, JSON.stringify(data)); } catch {}
}

// ─── Main OrderPage ───────────────────────────────────────────────────────────

export default function OrderPage() {
  const [searchParams] = useSearchParams();
  const restaurantId = searchParams.get('r');
  const tableParam = searchParams.get('t');

  const [lang, setLangState] = useState<Lang>(getLang);
  const t = T[lang];

  function switchLang(l: Lang) { saveLang(l); setLangState(l); }

  // Seed from cache so returning visitors never see the skeleton
  const cached = restaurantId ? getCachedMenu(restaurantId) : null;
  const [restaurant, setRestaurant] = useState<Restaurant | null>(cached);
  const [loading, setLoading] = useState(!cached); // skip skeleton if cache hit
  const [error, setError] = useState('');
  const [tableNumber, setTableNumber] = useState<number | null>(
    tableParam ? parseInt(tableParam, 10) : null,
  );
  const [tableInput, setTableInput] = useState('');
  const [tableConfirmed, setTableConfirmed] = useState(!!tableParam);
  const [activeCategory, setActiveCategory] = useState(cached?.categories?.[0] ?? '');
  const [cartOpen, setCartOpen] = useState(false);
  const [modifierItem, setModifierItem] = useState<MenuItem | null>(null);
  const [confirmedOrder, setConfirmedOrder] = useState<{ id: string; number: number } | null>(null);

  const [searchActive, setSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { addItem, itemCount, totalFormatted, setContext } = useCartStore();
  const categoryRefs = useRef<Record<string, HTMLDivElement | null>>({});

  function openSearch() {
    setSearchActive(true);
    setSearchQuery('');
    // Focus after the animation frame so the input is in the DOM
    setTimeout(() => searchInputRef.current?.focus(), 80);
  }
  function closeSearch() {
    setSearchActive(false);
    setSearchQuery('');
  }

  useDocumentTitle(
    error
      ? t.restaurantNotFound
      : restaurant
        ? `${restaurant.name}${tableParam ? ` — ${t.table} ${tableParam}` : ''}`
        : t.loading,
  );

  // Load restaurant
  useEffect(() => {
    if (!restaurantId) {
      setError(t.noRestaurant);
      setLoading(false);
      return;
    }
    const unsub = onValue(refs.restaurant(restaurantId), (snap) => {
      if (!snap.exists()) { setError(t.restaurantNotFound); setLoading(false); return; }
      const data = { id: restaurantId, ...snap.val() } as Restaurant;
      setRestaurant(data);
      setCachedMenu(restaurantId, data); // keep cache fresh for next visit
      if (data.categories?.length) setActiveCategory(data.categories[0]);
      setContext(restaurantId, tableNumber);
      setLoading(false);
    });
    return () => unsub();
  }, [restaurantId]);

  if (loading) return <OrderPageSkeleton />;

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center bg-gray-50">
        <UtensilsCrossed size={48} className="text-gray-300 mb-4" />
        <p className="text-gray-500 font-medium">{error}</p>
      </div>
    );
  }

  if (!restaurant) return null;

  // ── Table selection screen ──────────────────────────────────────────────────
  if (!tableConfirmed) {
    return (
      <div className="min-h-screen flex flex-col bg-white">
        {/* Hero */}
        <div className="bg-gradient-to-b from-orange-500 to-orange-600 flex flex-col items-center justify-center pt-16 pb-12 px-6">
          {restaurant.logo && (
            <div className="w-24 h-24 rounded-3xl overflow-hidden bg-white shadow-2xl mb-5 ring-4 ring-white/30">
              <img src={restaurant.logo} alt={restaurant.name} className="w-full h-full object-cover" />
            </div>
          )}
          <h1 className="text-2xl font-black text-white text-center">{restaurant.name}</h1>
        </div>

        {/* Table input */}
        <div className="flex flex-col items-center justify-center flex-1 px-6 -mt-6">
          <div className="w-full max-w-xs bg-white rounded-3xl shadow-xl p-6">
            <p className="text-center text-gray-600 font-medium mb-5">{t.whichTable}</p>
            <input
              type="number"
              min={1}
              max={restaurant.tables}
              placeholder={t.tablePlaceholder}
              value={tableInput}
              onChange={(e) => setTableInput(e.target.value)}
              className="w-full border-2 border-gray-200 rounded-2xl px-5 py-4 text-center text-3xl font-black text-gray-900 outline-none focus:border-orange-400 transition-colors mb-4"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && tableInput) {
                  setTableNumber(parseInt(tableInput, 10));
                  setTableConfirmed(true);
                }
              }}
            />
            <button
              disabled={!tableInput}
              onClick={() => { setTableNumber(parseInt(tableInput, 10)); setTableConfirmed(true); }}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black py-4 rounded-2xl disabled:opacity-40 transition-all active:scale-[0.98]"
            >
              {t.continueBtn}
            </button>
          </div>

          {/* Lang switcher */}
          <div className="mt-6">
            <LangPill lang={lang} onChange={switchLang} />
          </div>
        </div>
      </div>
    );
  }

  const menuItems: MenuItem[] = Object.entries(restaurant.menu ?? {}).map(([id, item]) => ({
    ...item,
    id,
  }));
  const categories = restaurant.categories ?? [];

  function handleItemTap(item: MenuItem) {
    if (!item.available) return;
    if (item.modifierGroups && Object.keys(item.modifierGroups).length > 0) {
      setModifierItem(item);
    } else {
      addItem({ id: item.id, name: item.name, price: item.price, quantity: 1, image: item.image });
    }
  }

  function scrollToCategory(cat: string) {
    setActiveCategory(cat);
    categoryRefs.current[cat]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-28">

      {/* ── Language switcher — fixed top-right, always visible ── */}
      <div className="fixed top-3 right-4 z-20">
        <LangPill lang={lang} onChange={switchLang} />
      </div>

      {/* ── Hero ── */}
      <div className="bg-white border-b border-gray-100 px-4 pt-10 pb-8 text-center shadow-sm">
        {restaurant.logo && (
          <div className="w-20 h-20 rounded-2xl overflow-hidden bg-gray-100 shadow-md mx-auto mb-4">
            <img src={restaurant.logo} alt={restaurant.name} className="w-full h-full object-cover" />
          </div>
        )}
        <h1 className="text-2xl font-black text-gray-900 leading-tight">{restaurant.name}</h1>
        {tableNumber != null && (
          <div className="inline-flex flex-col items-center mt-4 bg-orange-50 border-2 border-orange-200 rounded-2xl px-8 py-3">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-400 leading-none mb-1">
              {t.table}
            </span>
            <span className="text-4xl font-black text-orange-500 leading-none">{tableNumber}</span>
          </div>
        )}
      </div>

      {/* ── Sticky bar: categories ↔ search ── */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 shadow-sm">
        <AnimatePresence mode="wait" initial={false}>
          {searchActive ? (
            /* ── Search input ── */
            <motion.div
              key="search"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="flex items-center gap-2 px-3 py-2"
            >
              <button
                onClick={closeSearch}
                className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 flex-shrink-0"
              >
                <ArrowLeft size={20} />
              </button>
              <div className="flex-1 flex items-center bg-gray-100 rounded-2xl px-3 gap-2">
                <Search size={15} className="text-gray-400 flex-shrink-0" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t.searchPlaceholder}
                  className="flex-1 bg-transparent py-2.5 text-sm text-gray-900 outline-none font-medium placeholder-gray-400"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="flex-shrink-0 text-gray-400 hover:text-gray-600">
                    <X size={15} />
                  </button>
                )}
              </div>
            </motion.div>
          ) : (
            /* ── Category pills + search icon ── */
            <motion.div
              key="cats"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.18 }}
              className="flex items-center gap-2 px-4 py-2.5"
            >
              <div className="flex gap-2 overflow-x-auto scrollbar-hide flex-1">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => scrollToCategory(cat)}
                    className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-black transition-all ${
                      activeCategory === cat
                        ? 'bg-orange-500 text-white shadow-sm'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              {/* Search trigger */}
              <button
                onClick={openSearch}
                className="flex-shrink-0 w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
                aria-label="Search"
              >
                <Search size={17} className="text-gray-500" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Menu ── */}
      <div className="px-4 pt-5">
        {searchActive ? (
          /* ── Search results ── */
          (() => {
            const q = searchQuery.trim();
            if (!q) return (
              <div className="text-center py-20 text-gray-400">
                <Search size={36} className="mx-auto mb-3 opacity-30" />
                <p className="font-semibold text-sm">{t.searchPlaceholder}</p>
              </div>
            );
            const results = menuItems.filter((i) =>
              i.available && (
                i.name.toLowerCase().includes(q.toLowerCase()) ||
                i.description?.toLowerCase().includes(q.toLowerCase())
              )
            );
            if (!results.length) return (
              <motion.div
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="text-center py-20 text-gray-400"
              >
                <p className="text-4xl mb-3">🔍</p>
                <p className="font-black text-gray-700">{t.noResults}</p>
                <p className="text-sm mt-1">{t.noResultsSub}</p>
              </motion.div>
            );
            return (
              <div>
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">
                  {t.searchResultsFor(results.length, q)}
                </p>
                <div className="space-y-2.5">
                  {results.map((item, idx) => (
                    <motion.button
                      key={item.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.03, duration: 0.2 }}
                      onClick={() => handleItemTap(item)}
                      className="w-full bg-white rounded-2xl overflow-hidden flex text-left border border-gray-100 shadow-sm transition-all active:scale-[0.98] hover:shadow-md"
                    >
                      {item.image && (
                        <div className="w-28 h-28 flex-shrink-0 overflow-hidden">
                          <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0 p-3 flex flex-col justify-between">
                        <div>
                          <div className="flex items-start gap-2 justify-between mb-1">
                            <p className="font-black text-gray-900 text-sm leading-snug flex-1">
                              <Highlight text={item.name} query={q} />
                            </p>
                            {/* Category badge */}
                            <span className="flex-shrink-0 text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-bold">
                              {item.category}
                            </span>
                          </div>
                          {item.description && (
                            <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed">
                              <Highlight text={item.description} query={q} />
                            </p>
                          )}
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <span className="font-black text-gray-900">{formatPrice(item.price)}</span>
                          <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center shadow-sm flex-shrink-0">
                            <Plus size={17} className="text-white" />
                          </div>
                        </div>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </div>
            );
          })()
        ) : (
          /* ── Normal category view ── */
          <>
            {categories.map((cat) => {
              const catItems = menuItems.filter((i) => i.category === cat);
              if (!catItems.length) return null;
              return (
                <div
                  key={cat}
                  ref={(el) => { categoryRefs.current[cat] = el; }}
                  className="mb-7"
                >
                  <h2 className="text-base font-black text-gray-900 mb-3 uppercase tracking-wide">
                    {cat}
                  </h2>
                  <div className="space-y-2.5">
                    {catItems.map((item, idx) => (
                      <motion.button
                        key={item.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.04, duration: 0.25 }}
                        onClick={() => handleItemTap(item)}
                        disabled={!item.available}
                        className={`w-full bg-white rounded-2xl overflow-hidden flex text-left border border-gray-100 shadow-sm transition-all active:scale-[0.98] ${
                          !item.available ? 'opacity-50' : 'hover:shadow-md'
                        }`}
                      >
                        {item.image && (
                          <div className="w-28 h-28 flex-shrink-0 overflow-hidden">
                            <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0 p-3 flex flex-col justify-between">
                          <div>
                            <div className="flex items-start gap-2 justify-between">
                              <p className="font-black text-gray-900 text-sm leading-snug flex-1">{item.name}</p>
                              {item.popular && (
                                <span className="flex-shrink-0 text-[10px] bg-orange-100 text-orange-500 px-2 py-0.5 rounded-full font-black">
                                  {t.popular}
                                </span>
                              )}
                            </div>
                            {item.description && (
                              <p className="text-xs text-gray-400 mt-1 line-clamp-2 leading-relaxed">
                                {item.description}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center justify-between mt-2">
                            <span className="font-black text-gray-900">{formatPrice(item.price)}</span>
                            {!item.available ? (
                              <span className="text-xs text-gray-400 font-medium">{t.unavailable}</span>
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center shadow-sm flex-shrink-0">
                                <Plus size={17} className="text-white" />
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.button>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Uncategorised items */}
            {(() => {
              const uncategorized = menuItems.filter((i) => !categories.includes(i.category));
              if (!uncategorized.length) return null;
              return (
                <div className="mb-7">
                  <h2 className="text-base font-black text-gray-900 mb-3 uppercase tracking-wide">{t.other}</h2>
                  <div className="space-y-2.5">
                    {uncategorized.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => handleItemTap(item)}
                        className="w-full bg-white rounded-2xl overflow-hidden flex text-left border border-gray-100 shadow-sm transition-all active:scale-[0.98] hover:shadow-md"
                      >
                        {item.image && (
                          <div className="w-28 h-28 flex-shrink-0 overflow-hidden">
                            <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                          </div>
                        )}
                        <div className="flex-1 p-3 flex flex-col justify-between">
                          <p className="font-black text-gray-900 text-sm">{item.name}</p>
                          <span className="font-black text-gray-900">{formatPrice(item.price)}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}
          </>
        )}
      </div>

      {/* ── Floating cart button ── */}
      <AnimatePresence>
        {itemCount() > 0 && (
          <motion.button
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
            onClick={() => setCartOpen(true)}
            className="fixed bottom-6 left-4 right-4 bg-orange-500 text-white flex items-center justify-between px-5 py-4 rounded-2xl shadow-xl z-40 active:scale-[0.98] transition-transform"
          >
            <div className="flex items-center gap-2.5">
              <div className="bg-orange-600 rounded-xl w-8 h-8 flex items-center justify-center text-sm font-black">
                {itemCount()}
              </div>
              <span className="font-black text-base">{t.viewOrder}</span>
            </div>
            <span className="font-black text-base">{totalFormatted()}</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Modifier sheet ── */}
      <AnimatePresence>
        {modifierItem && (
          <ModifierSheet
            item={modifierItem}
            onClose={() => setModifierItem(null)}
            onAdd={addItem}
            t={t}
          />
        )}
      </AnimatePresence>

      {/* ── Cart sheet ── */}
      <AnimatePresence>
        {cartOpen && restaurant && (
          <CartSheet
            onClose={() => setCartOpen(false)}
            restaurant={restaurant}
            tableNumber={tableNumber}
            onOrderPlaced={(id, num) => {
              setCartOpen(false);
              setConfirmedOrder({ id, number: num });
            }}
            t={t}
          />
        )}
      </AnimatePresence>

      {/* ── Order confirmation ── */}
      <AnimatePresence>
        {confirmedOrder && (
          <OrderConfirmation
            orderNumber={confirmedOrder.number}
            onDismiss={() => setConfirmedOrder(null)}
            t={t}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
