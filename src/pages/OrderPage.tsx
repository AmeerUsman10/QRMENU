import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Plus, Minus, UtensilsCrossed, CheckCircle } from 'lucide-react';
import { onValue } from 'firebase/database';
import { refs, placeOrder } from '../lib/firebase';
import { createCheckoutSession } from '../lib/stripe';
import { useCartStore } from '../store/cartStore';
import type { Restaurant, MenuItem, CartItem } from '../types';

// ─── Utility ────────────────────────────────────────────────────────────────

function formatPrice(n: number) {
  return `€${n.toFixed(2)}`;
}

// ─── Modifier Sheet ──────────────────────────────────────────────────────────

interface ModifierSheetProps {
  item: MenuItem;
  onClose: () => void;
  onAdd: (cartItem: CartItem) => void;
}

function ModifierSheet({ item, onClose, onAdd }: ModifierSheetProps) {
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
        setError(`Please select ${g.name}`);
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

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="bg-white rounded-t-3xl p-5 max-h-[85vh] overflow-y-auto"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 260 }}
        onClick={(e) => e.stopPropagation()}
      >
        {item.image && (
          <img src={item.image} alt={item.name} className="w-full h-44 object-cover rounded-2xl mb-4" />
        )}
        <h2 className="text-xl font-bold text-gray-900 mb-1">{item.name}</h2>
        {item.description && <p className="text-gray-500 text-sm mb-4">{item.description}</p>}

        {groups.map((g) => (
          <div key={g.id} className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-gray-800">{g.name}</span>
              {g.required && <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">Required</span>}
            </div>
            {g.options.map((opt) => {
              const selected = (selections[g.id] ?? []).includes(opt.id);
              return (
                <button
                  key={opt.id}
                  onClick={() => toggle(g.id, opt.id, g.max)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl mb-2 border transition-all ${
                    selected ? 'border-orange-500 bg-orange-50' : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <span className="text-gray-800">{opt.name}</span>
                  <div className="flex items-center gap-2">
                    {opt.price > 0 && <span className="text-gray-500 text-sm">+{formatPrice(opt.price)}</span>}
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selected ? 'border-orange-500 bg-orange-500' : 'border-gray-300'}`}>
                      {selected && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ))}

        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

        <button
          onClick={handleAdd}
          className="w-full bg-orange-500 text-white font-semibold py-4 rounded-2xl text-base"
        >
          Add to order — {formatPrice(item.price + getModifierPrice())}
        </button>
      </motion.div>
    </motion.div>
  );
}

// ─── Cart Sheet ──────────────────────────────────────────────────────────────

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
}

function CartSheet({ onClose, restaurant, tableNumber, onOrderPlaced: _onOrderPlaced }: CartSheetProps) {
  const { items, changeQty, clearCart, total, totalFormatted, itemsReadable } = useCartStore();
  const [step, setStep] = useState<'cart' | 'checkout'>('cart');
  const [form, setForm] = useState<CheckoutData>({ name: '', phone: '', note: '', payment: 'cash' });
  const [placing, setPlacing] = useState(false);
  const [formError, setFormError] = useState('');

  async function handlePlace() {
    if (!form.name.trim()) { setFormError('Please enter your name'); return; }
    setPlacing(true);
    try {
      const orderPayload = {
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
        tableNumber,
        customerName: form.name.trim(),
        customerPhone: form.phone.trim() || undefined,
        items: JSON.stringify(items),
        itemsReadable: itemsReadable(),
        totalPrice: total(),
        paymentType: form.payment,
        status: 'new' as const,
        note: form.note.trim() || undefined,
        timestamp: Date.now(),
      };

      if (form.payment === 'card') {
        // Pre-create order so we can reference it on success
        const { orderId } = await placeOrder({ ...orderPayload, status: 'new' });
        const successUrl = `${window.location.origin}/order/success?order_id=${orderId}`;
        const cancelUrl = `${window.location.origin}/order?r=${restaurant.id}${tableNumber != null ? `&t=${tableNumber}` : ''}`;
        const { url } = await createCheckoutSession({
          restaurantId: restaurant.id,
          orderId,
          items: items.map((i) => ({ name: i.name, price: i.price, quantity: i.quantity })),
          tableNumber,
          successUrl,
          cancelUrl,
        });
        clearCart();
        window.location.href = url;
        return;
      }

      const { orderId } = await placeOrder(orderPayload);
      clearCart();
      window.location.href = `${window.location.origin}/order/success?order_id=${orderId}`;
    } catch (err) {
      console.error('Order placement error:', err);
      setFormError('Failed to place order. Please try again.');
      setPlacing(false);
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="bg-white rounded-t-3xl max-h-[90vh] flex flex-col"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 260 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">
            {step === 'cart' ? 'Your order' : 'Checkout'}
            {tableNumber != null && <span className="ml-2 text-sm font-normal text-gray-400">Table {tableNumber}</span>}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close cart"
            className="p-2 rounded-full hover:bg-gray-100"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5">
          {step === 'cart' ? (
            <>
              {items.map((item) => (
                <div key={item.id} className="flex items-center gap-3 mb-4">
                  {item.image && <img src={item.image} alt={item.name} className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm">{item.name}</p>
                    {item.modifiers && <p className="text-xs text-gray-400 truncate">{item.modifiers}</p>}
                    <p className="text-orange-500 font-semibold text-sm mt-0.5">{formatPrice(item.price)}</p>
                  </div>
                  <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-1 py-1">
                    <button
                      onClick={() => changeQty(item.id, -1)}
                      aria-label={`Decrease quantity of ${item.name}`}
                      className="p-1 rounded-lg"
                    >
                      <Minus size={16} className="text-gray-600" />
                    </button>
                    <span
                      className="w-6 text-center font-semibold text-gray-900 text-sm"
                      aria-label={`Quantity ${item.quantity}`}
                    >
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => changeQty(item.id, 1)}
                      aria-label={`Increase quantity of ${item.name}`}
                      className="p-1 rounded-lg"
                    >
                      <Plus size={16} className="text-gray-600" />
                    </button>
                  </div>
                </div>
              ))}

              <div className="border-t border-gray-100 pt-4 mt-2 flex items-center justify-between">
                <span className="font-semibold text-gray-700">Total</span>
                <span className="text-xl font-bold text-gray-900">{totalFormatted()}</span>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Your name *</label>
                <input
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 outline-none focus:border-orange-400 transition-colors"
                  placeholder="e.g. Matej"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone (optional)</label>
                <input
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 outline-none focus:border-orange-400 transition-colors"
                  placeholder="+386 ..."
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Note for kitchen (optional)</label>
                <textarea
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 outline-none focus:border-orange-400 transition-colors resize-none"
                  placeholder="Allergies, extra requests..."
                  rows={2}
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Payment</label>
                <div className="grid grid-cols-2 gap-3">
                  {(['cash', 'card'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setForm({ ...form, payment: type })}
                      className={`py-4 rounded-2xl font-semibold text-sm border-2 transition-all ${
                        form.payment === type
                          ? 'border-orange-500 bg-orange-50 text-orange-600'
                          : 'border-gray-200 text-gray-600'
                      }`}
                    >
                      {type === 'cash' ? '💵 Cash' : '💳 Card'}
                    </button>
                  ))}
                </div>
                {form.payment === 'card' && (
                  <p className="text-xs text-gray-400 mt-2 text-center">Apple Pay & Google Pay accepted</p>
                )}
              </div>

              <div className="bg-gray-50 rounded-2xl p-4">
                <p className="text-xs text-gray-500 mb-1">Order summary</p>
                <p className="text-sm text-gray-700">{itemsReadable()}</p>
                <p className="text-lg font-bold text-gray-900 mt-1">{totalFormatted()}</p>
              </div>

              {formError && <p className="text-red-500 text-sm">{formError}</p>}
            </div>
          )}
        </div>

        {/* Footer button */}
        <div className="p-5 border-t border-gray-100">
          {step === 'cart' ? (
            <button
              onClick={() => setStep('checkout')}
              className="w-full bg-orange-500 text-white font-semibold py-4 rounded-2xl text-base"
            >
              Continue — {totalFormatted()}
            </button>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={() => setStep('cart')}
                className="flex-1 border-2 border-gray-200 text-gray-700 font-semibold py-4 rounded-2xl"
              >
                Back
              </button>
              <button
                onClick={handlePlace}
                disabled={placing}
                className="flex-[2] bg-orange-500 text-white font-semibold py-4 rounded-2xl disabled:opacity-50"
              >
                {placing ? 'Placing order...' : 'Place order'}
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Confirmation Screen ─────────────────────────────────────────────────────

function OrderConfirmation({ orderNumber, onDismiss }: { orderNumber: number; onDismiss: () => void }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white px-6 text-center"
      initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
    >
      <CheckCircle size={72} className="text-green-500 mb-4" />
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Order placed!</h2>
      <p className="text-gray-500 mb-1">Your order number is</p>
      <div className="text-6xl font-black text-orange-500 mb-6">#{String(orderNumber).padStart(3, '0')}</div>
      <p className="text-gray-500 text-sm mb-8">We'll bring it to your table once it's ready.</p>
      <button
        onClick={onDismiss}
        className="bg-orange-500 text-white font-semibold px-8 py-3 rounded-2xl"
      >
        Order more
      </button>
    </motion.div>
  );
}

// ─── Main OrderPage ──────────────────────────────────────────────────────────

export default function OrderPage() {
  const [searchParams] = useSearchParams();
  const restaurantId = searchParams.get('r');
  const tableParam = searchParams.get('t');

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tableNumber, setTableNumber] = useState<number | null>(
    tableParam ? parseInt(tableParam, 10) : null,
  );
  const [tableInput, setTableInput] = useState('');
  const [tableConfirmed, setTableConfirmed] = useState(!!tableParam);
  const [activeCategory, setActiveCategory] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [modifierItem, setModifierItem] = useState<MenuItem | null>(null);
  const [confirmedOrder, setConfirmedOrder] = useState<{ id: string; number: number } | null>(null);

  const { addItem, itemCount, totalFormatted, setContext } = useCartStore();
  const categoryRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Load restaurant from Firebase
  useEffect(() => {
    if (!restaurantId) { setError('No restaurant specified. Scan a valid QR code.'); setLoading(false); return; }
    const unsub = onValue(refs.restaurant(restaurantId), (snap) => {
      if (!snap.exists()) { setError('Restaurant not found.'); setLoading(false); return; }
      const data = { id: restaurantId, ...snap.val() } as Restaurant;
      setRestaurant(data);
      if (data.categories?.length) setActiveCategory(data.categories[0]);
      setContext(restaurantId, tableNumber);
      setLoading(false);
    });
    return () => unsub();
  }, [restaurantId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <UtensilsCrossed size={48} className="text-gray-300 mb-4" />
        <p className="text-gray-500">{error}</p>
      </div>
    );
  }

  if (!restaurant) return null;

  // Table selection screen
  if (!tableConfirmed) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-white">
        {restaurant.logo && (
          <img src={restaurant.logo} alt={restaurant.name} className="h-16 object-contain mb-6" />
        )}
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{restaurant.name}</h1>
        <p className="text-gray-500 mb-8">Which table are you at?</p>
        <input
          type="number"
          min={1}
          max={restaurant.tables}
          placeholder="Table number"
          value={tableInput}
          onChange={(e) => setTableInput(e.target.value)}
          className="w-full max-w-xs border-2 border-gray-200 rounded-2xl px-5 py-4 text-center text-2xl font-bold text-gray-900 outline-none focus:border-orange-400 mb-4"
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
          className="w-full max-w-xs bg-orange-500 text-white font-semibold py-4 rounded-2xl disabled:opacity-40"
        >
          Continue
        </button>
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
      {/* Restaurant header */}
      <div className="bg-white px-4 pt-6 pb-4 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          {restaurant.logo && (
            <img src={restaurant.logo} alt={restaurant.name} className="h-10 w-10 rounded-xl object-cover" />
          )}
          <div>
            <h1 className="text-lg font-bold text-gray-900 leading-tight">{restaurant.name}</h1>
            {tableNumber != null && (
              <p className="text-sm text-gray-400">Table {tableNumber}</p>
            )}
          </div>
        </div>

        {/* Category pills */}
        {categories.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-4 px-4">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => scrollToCategory(cat)}
                className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  activeCategory === cat
                    ? 'bg-orange-500 text-white'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Menu */}
      <div className="px-4 pt-4">
        {categories.map((cat) => {
          const catItems = menuItems.filter((i) => i.category === cat);
          if (!catItems.length) return null;
          return (
            <div
              key={cat}
              ref={(el) => { categoryRefs.current[cat] = el; }}
              className="mb-6"
            >
              <h2 className="text-base font-bold text-gray-800 mb-3">{cat}</h2>
              <div className="space-y-3">
                {catItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleItemTap(item)}
                    disabled={!item.available}
                    className={`w-full bg-white rounded-2xl p-3 flex gap-3 text-left shadow-sm transition-all active:scale-[0.98] ${
                      !item.available ? 'opacity-50' : ''
                    }`}
                  >
                    {item.image && (
                      <img
                        src={item.image}
                        alt={item.name}
                        className="w-20 h-20 rounded-xl object-cover flex-shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0 py-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-gray-900 text-sm leading-snug">{item.name}</p>
                        {item.popular && (
                          <span className="flex-shrink-0 text-xs bg-orange-100 text-orange-500 px-2 py-0.5 rounded-full">Popular</span>
                        )}
                      </div>
                      {item.description && (
                        <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{item.description}</p>
                      )}
                      <div className="flex items-center justify-between mt-2">
                        <span className="font-bold text-gray-900 text-sm">{formatPrice(item.price)}</span>
                        {!item.available ? (
                          <span className="text-xs text-gray-400">Unavailable</span>
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-orange-500 flex items-center justify-center">
                            <Plus size={16} className="text-white" />
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}

        {/* Items without category */}
        {(() => {
          const uncategorized = menuItems.filter((i) => !categories.includes(i.category));
          if (!uncategorized.length) return null;
          return (
            <div className="mb-6">
              <h2 className="text-base font-bold text-gray-800 mb-3">Other</h2>
              {uncategorized.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleItemTap(item)}
                  className="w-full bg-white rounded-2xl p-3 flex gap-3 text-left shadow-sm mb-3"
                >
                  {item.image && (
                    <img src={item.image} alt={item.name} className="w-20 h-20 rounded-xl object-cover flex-shrink-0" />
                  )}
                  <div className="flex-1 py-1">
                    <p className="font-semibold text-gray-900 text-sm">{item.name}</p>
                    <p className="font-bold text-gray-900 text-sm mt-1">{formatPrice(item.price)}</p>
                  </div>
                </button>
              ))}
            </div>
          );
        })()}
      </div>

      {/* Floating cart button */}
      <AnimatePresence>
        {itemCount() > 0 && (
          <motion.button
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            onClick={() => setCartOpen(true)}
            className="fixed bottom-6 left-4 right-4 bg-orange-500 text-white flex items-center justify-between px-5 py-4 rounded-2xl shadow-lg z-40"
          >
            <div className="flex items-center gap-2">
              <div className="bg-orange-600 rounded-lg w-7 h-7 flex items-center justify-center text-sm font-bold">
                {itemCount()}
              </div>
              <span className="font-semibold">View order</span>
            </div>
            <span className="font-bold">{totalFormatted()}</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Modifier sheet */}
      <AnimatePresence>
        {modifierItem && (
          <ModifierSheet
            item={modifierItem}
            onClose={() => setModifierItem(null)}
            onAdd={addItem}
          />
        )}
      </AnimatePresence>

      {/* Cart sheet */}
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
          />
        )}
      </AnimatePresence>

      {/* Order confirmation */}
      <AnimatePresence>
        {confirmedOrder && (
          <OrderConfirmation
            orderNumber={confirmedOrder.number}
            onDismiss={() => setConfirmedOrder(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
