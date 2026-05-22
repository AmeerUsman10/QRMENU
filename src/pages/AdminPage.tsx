import { useState, useEffect } from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, UtensilsCrossed, QrCode, Settings, LogOut,
  Plus, Pencil, Trash2, X, Eye, EyeOff, Save, Package
} from 'lucide-react';
import QRCode from 'qrcode';
import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword
} from 'firebase/auth';
import { onValue, set, get, update, push, query, orderByChild, equalTo } from 'firebase/database';
import { auth, refs } from '../lib/firebase';
import type { Restaurant, MenuItem, Order } from '../types';

// ─── Auth Guard ───────────────────────────────────────────────────────────────

function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [isRegister, setIsRegister] = useState(false);
  const [restaurantName, setRestaurantName] = useState('');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [tables, setTables] = useState('6');
  const [kitchenPin, setKitchenPin] = useState('');

  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      if (isRegister) {
        // Validate inputs
        if (!restaurantName.trim() || !kitchenPin.trim() || !tables.trim()) {
          throw new Error('All fields are required');
        }
        if (kitchenPin.trim().length !== 4 || isNaN(Number(kitchenPin.trim()))) {
          throw new Error('Kitchen PIN must be exactly 4 digits');
        }

        // 1. Create Firebase Auth user
        await createUserWithEmailAndPassword(auth, email, pass);

        // 2. Generate a unique search-friendly ID slug from the restaurant name
        const cleanSlug = restaurantName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '');
        const baseId = cleanSlug || 'restaurant';

        // Check if restaurant ID is already taken; if so, append random suffix
        let finalId = baseId;
        const existsSnap = await get(refs.restaurant(finalId));
        if (existsSnap.exists()) {
          const rand = Math.random().toString(36).substring(2, 6);
          finalId = `${baseId}-${rand}`;
        }

        // 3. Provision new restaurant database entry
        await set(refs.restaurant(finalId), {
          name: restaurantName.trim(),
          adminEmail: email.trim(),
          kitchenPin: kitchenPin.trim(),
          tables: parseInt(tables, 10) || 6,
          categories: ['Signature Pizzas', 'Beverages'],
          menu: {}
        });

        onLogin();
      } else {
        await signInWithEmailAndPassword(auth, email, pass);
        onLogin();
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Invalid email or password');
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-lg p-8">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-orange-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <UtensilsCrossed size={28} className="text-orange-500" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">
            {isRegister ? 'Register Restaurant' : 'Restaurant Admin'}
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            {isRegister ? 'Set up your platform in under a minute' : 'Sign in to manage your menu'}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Restaurant Name</label>
              <input
                type="text" required value={restaurantName}
                onChange={(e) => setRestaurantName(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-orange-400 transition-colors"
                placeholder="e.g. Jejmo Bistro"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email" required value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-orange-400 transition-colors"
              placeholder="you@restaurant.com"
            />
          </div>
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type={showPass ? 'text' : 'password'} required value={pass}
              onChange={(e) => setPass(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 pr-12 outline-none focus:border-orange-400 transition-colors"
              placeholder="••••••••"
            />
            <button type="button" onClick={() => setShowPass(!showPass)}
              className="absolute right-3 top-9 p-1 text-gray-400">
              {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {isRegister && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Number of Tables</label>
                <input
                  type="number" required min={1} max={100} value={tables}
                  onChange={(e) => setTables(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-orange-400 transition-colors"
                  placeholder="6"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">4-Digit Kitchen PIN</label>
                <input
                  type="password" required maxLength={4} pattern="[0-9]{4}" value={kitchenPin}
                  onChange={(e) => setKitchenPin(e.target.value.replace(/\D/g, ''))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-orange-400 transition-colors"
                  placeholder="1234"
                />
              </div>
            </div>
          )}
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full bg-orange-500 text-white font-semibold py-3 rounded-xl disabled:opacity-50">
            {loading ? 'Processing...' : isRegister ? 'Register & Set Up' : 'Sign in'}
          </button>
        </form>

        <div className="text-center mt-6">
          <button
            type="button"
            onClick={() => {
              setIsRegister(!isRegister);
              setError('');
            }}
            className="text-orange-500 font-semibold text-sm hover:underline"
          >
            {isRegister ? 'Already have an account? Sign in' : "Don't have a restaurant? Register one"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function useRestaurantForUser(): [Restaurant | null, boolean] {
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) { setLoading(false); return; }
    
    // Query the specific restaurant where adminEmail equals the logged-in user's email
    const q = query(refs.restaurants(), orderByChild('adminEmail'), equalTo(user.email));
    
    const unsub = onValue(q, (snap) => {
      if (snap.exists()) {
        snap.forEach((child) => {
          const r = child.val() as Omit<Restaurant, 'id'>;
          setRestaurant({ id: child.key!, ...r });
        });
      } else {
        setRestaurant(null);
      }
      setLoading(false);
    }, (err) => {
      console.error("Firebase query permission error:", err);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  return [restaurant, loading];
}

function formatPrice(n: number) { return `€${n.toFixed(2)}`; }

function today() {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime();
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard({ restaurant }: { restaurant: Restaurant }) {
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    const unsub = onValue(refs.restaurantOrders(restaurant.id), (snap) => {
      const all: Order[] = [];
      snap.forEach((c) => { all.push({ id: c.key!, ...c.val() }); });
      setOrders(all);
    });
    return () => unsub();
  }, [restaurant.id]);

  const todayOrders = orders.filter((o) => o.timestamp >= today() && o.status !== 'cancelled');
  const activeOrders = orders.filter((o) => ['new', 'preparing', 'ready'].includes(o.status));
  const todayRevenue = todayOrders.reduce((s, o) => s + (o.totalPrice ?? 0), 0);

  const stats = [
    { label: "Today's orders", value: todayOrders.length, color: 'text-orange-500' },
    { label: 'Active now', value: activeOrders.length, color: 'text-blue-500' },
    { label: "Today's revenue", value: formatPrice(todayRevenue), color: 'text-green-500' },
  ];

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-5">Dashboard</h2>
      <div className="grid grid-cols-3 gap-3 mb-6">
        {stats.map((s) => (
          <div key={s.label} className="bg-white rounded-2xl p-4 shadow-sm">
            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-400 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <h3 className="font-semibold text-gray-700 mb-3">Active orders</h3>
      {activeOrders.length === 0 ? (
        <p className="text-gray-400 text-sm">No active orders right now.</p>
      ) : (
        <div className="space-y-2">
          {activeOrders.map((o) => (
            <div key={o.id} className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between">
              <div>
                <span className="font-bold text-gray-900">#{String(o.orderNumber).padStart(3, '0')}</span>
                {o.tableNumber != null && <span className="text-gray-400 text-sm ml-2">Table {o.tableNumber}</span>}
                <p className="text-sm text-gray-600 mt-0.5">{o.itemsReadable}</p>
              </div>
              <span className={`text-xs font-semibold px-2 py-1 rounded-lg capitalize ${
                o.status === 'new' ? 'bg-orange-100 text-orange-600' :
                o.status === 'preparing' ? 'bg-blue-100 text-blue-600' :
                'bg-green-100 text-green-600'
              }`}>{o.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Menu Management ──────────────────────────────────────────────────────────

interface ItemFormData {
  name: string;
  price: string;
  description: string;
  category: string;
  image: string;
  available: boolean;
  popular: boolean;
}

function MenuManager({ restaurant }: { restaurant: Restaurant }) {
  const [editItem, setEditItem] = useState<(ItemFormData & { id?: string }) | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>(restaurant.categories?.[0] ?? '');
  const [newCategory, setNewCategory] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);

  const items: MenuItem[] = Object.entries(restaurant.menu ?? {}).map(([id, item]) => ({
    ...item, id,
  }));

  const categories = restaurant.categories ?? [];

  async function saveItem(data: ItemFormData & { id?: string }) {
    setSaving(true);
    const itemData = {
      name: data.name.trim(),
      price: parseFloat(data.price),
      description: data.description.trim(),
      category: data.category,
      image: data.image.trim(),
      available: data.available,
      popular: data.popular,
    };
    if (data.id) {
      await update(refs.menuItem(restaurant.id, data.id), itemData);
    } else {
      const newRef = push(refs.menu(restaurant.id));
      await set(newRef, itemData);
    }
    setSaving(false);
    setEditItem(null);
  }

  async function deleteItem(id: string) {
    if (!confirm('Delete this item?')) return;
    await set(refs.menuItem(restaurant.id, id), null);
  }

  async function toggleAvailable(id: string, current: boolean) {
    await update(refs.menuItem(restaurant.id, id), { available: !current });
  }

  async function addCategory() {
    if (!newCategory.trim()) return;
    const updated = [...categories, newCategory.trim()];
    await update(refs.restaurant(restaurant.id), { categories: updated });
    setNewCategory('');
    setAddingCategory(false);
  }

  async function deleteCategory(cat: string) {
    if (!confirm(`Delete category "${cat}"? Items in this category won't be deleted.`)) return;
    const updated = categories.filter((c) => c !== cat);
    await update(refs.restaurant(restaurant.id), { categories: updated });
    if (activeCategory === cat) setActiveCategory(updated[0] ?? '');
  }

  const visibleItems = activeCategory
    ? items.filter((i) => i.category === activeCategory)
    : items;

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold text-gray-900">Menu</h2>
        <button
          onClick={() => setEditItem({ name: '', price: '', description: '', category: activeCategory, image: '', available: true, popular: false })}
          className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-xl text-sm font-semibold"
        >
          <Plus size={16} /> Add item
        </button>
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 flex-wrap mb-4">
        {categories.map((cat) => (
          <div key={cat} className="flex items-center gap-1">
            <button
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                activeCategory === cat ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {cat}
            </button>
            <button onClick={() => deleteCategory(cat)} className="p-1 text-gray-300 hover:text-red-400">
              <X size={14} />
            </button>
          </div>
        ))}
        {addingCategory ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addCategory()}
              placeholder="Category name"
              className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm outline-none focus:border-orange-400 w-36"
            />
            <button onClick={addCategory} className="text-orange-500 text-sm font-semibold">Add</button>
            <button onClick={() => setAddingCategory(false)} className="text-gray-400 text-sm">Cancel</button>
          </div>
        ) : (
          <button onClick={() => setAddingCategory(true)}
            className="px-3 py-1.5 rounded-full text-sm text-gray-400 border border-dashed border-gray-300">
            + Category
          </button>
        )}
      </div>

      {/* Item list */}
      <div className="space-y-2">
        {visibleItems.map((item) => (
          <div key={item.id} className={`bg-white rounded-2xl p-3 flex gap-3 shadow-sm ${!item.available ? 'opacity-60' : ''}`}>
            {item.image && (
              <img src={item.image} alt={item.name} className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{item.name}</p>
                  <p className="text-orange-500 font-semibold text-sm">{formatPrice(item.price)}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => toggleAvailable(item.id, item.available)}
                    className={`px-2 py-1 rounded-lg text-xs font-semibold ${item.available ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                    {item.available ? 'On' : 'Off'}
                  </button>
                  <button onClick={() => setEditItem({ id: item.id, name: item.name, price: String(item.price), description: item.description ?? '', category: item.category, image: item.image, available: item.available, popular: item.popular ?? false })}
                    className="p-2 text-gray-400 hover:text-gray-700">
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => deleteItem(item.id)} className="p-2 text-gray-300 hover:text-red-500">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
        {visibleItems.length === 0 && (
          <p className="text-gray-400 text-sm text-center py-8">No items in this category.</p>
        )}
      </div>

      {/* Edit/Add item sheet */}
      <AnimatePresence>
        {editItem && (
          <motion.div
            className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setEditItem(null)}
          >
            <motion.div
              className="bg-white rounded-t-3xl p-5 max-h-[90vh] overflow-y-auto"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-bold text-lg text-gray-900">{editItem.id ? 'Edit item' : 'New item'}</h3>
                <button onClick={() => setEditItem(null)}><X size={20} className="text-gray-400" /></button>
              </div>
              <div className="space-y-4">
                {[
                  { label: 'Name *', key: 'name', placeholder: 'e.g. Margherita Pizza' },
                  { label: 'Price (€) *', key: 'price', placeholder: '9.50', type: 'number' },
                  { label: 'Image URL', key: 'image', placeholder: 'https://...' },
                  { label: 'Description', key: 'description', placeholder: 'Short description...', multiline: true },
                ].map((f) => (
                  <div key={f.key}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
                    {f.multiline ? (
                      <textarea
                        value={(editItem as any)[f.key]}
                        onChange={(e) => setEditItem({ ...editItem, [f.key]: e.target.value })}
                        placeholder={f.placeholder}
                        rows={2}
                        className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-orange-400 resize-none"
                      />
                    ) : (
                      <input
                        type={f.type ?? 'text'}
                        value={(editItem as any)[f.key]}
                        onChange={(e) => setEditItem({ ...editItem, [f.key]: e.target.value })}
                        placeholder={f.placeholder}
                        className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-orange-400"
                      />
                    )}
                  </div>
                ))}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select
                    value={editItem.category}
                    onChange={(e) => setEditItem({ ...editItem, category: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-orange-400 bg-white"
                  >
                    {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="flex gap-4">
                  {[
                    { label: 'Available', key: 'available' },
                    { label: 'Popular', key: 'popular' },
                  ].map((f) => (
                    <label key={f.key} className="flex items-center gap-2 cursor-pointer">
                      <div
                        onClick={() => setEditItem({ ...editItem, [f.key]: !(editItem as any)[f.key] })}
                        className={`w-10 h-6 rounded-full transition-colors relative ${(editItem as any)[f.key] ? 'bg-orange-500' : 'bg-gray-200'}`}
                      >
                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${(editItem as any)[f.key] ? 'left-5' : 'left-1'}`} />
                      </div>
                      <span className="text-sm text-gray-700">{f.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <button
                onClick={() => saveItem(editItem)}
                disabled={saving || !editItem.name || !editItem.price}
                className="w-full mt-6 bg-orange-500 text-white font-semibold py-4 rounded-2xl disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Save size={18} /> {saving ? 'Saving...' : 'Save item'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── QR Generator ─────────────────────────────────────────────────────────────

function QRGenerator({ restaurant }: { restaurant: Restaurant }) {
  const [tableCount, setTableCount] = useState(String(restaurant.tables ?? 6));
  const [qrUrls, setQrUrls] = useState<{ label: string; url: string; dataUrl: string }[]>([]);
  const [generating, setGenerating] = useState(false);
  const baseUrl = `${window.location.origin}/order?r=${restaurant.id}`;

  async function generate() {
    setGenerating(true);
    const count = parseInt(tableCount, 10);
    const results: typeof qrUrls = [];

    // Restaurant-level QR (no table)
    results.push({
      label: 'Restaurant QR (no table)',
      url: baseUrl,
      dataUrl: await QRCode.toDataURL(baseUrl, { width: 400, margin: 2, color: { dark: '#111827' } }),
    });

    // Per-table QRs
    for (let i = 1; i <= count; i++) {
      const url = `${baseUrl}&t=${i}`;
      results.push({
        label: `Table ${i}`,
        url,
        dataUrl: await QRCode.toDataURL(url, { width: 400, margin: 2, color: { dark: '#111827' } }),
      });
    }
    setQrUrls(results);
    setGenerating(false);
  }

  function download(item: typeof qrUrls[0]) {
    const a = document.createElement('a');
    a.href = item.dataUrl;
    a.download = `qr-${item.label.replace(/\s+/g, '-').toLowerCase()}.png`;
    a.click();
  }

  function downloadAll() {
    qrUrls.forEach((item) => download(item));
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-5">QR Codes</h2>
      <div className="bg-white rounded-2xl p-5 shadow-sm mb-5">
        <p className="text-sm text-gray-500 mb-4">
          Generate QR codes for your tables. Each QR code takes customers directly to the menu for that table.
        </p>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Number of tables</label>
            <input
              type="number" min={1} max={100}
              value={tableCount}
              onChange={(e) => setTableCount(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-orange-400"
            />
          </div>
          <button
            onClick={generate}
            disabled={generating || !tableCount}
            className="bg-orange-500 text-white font-semibold px-5 py-3 rounded-xl disabled:opacity-50"
          >
            {generating ? 'Generating...' : 'Generate'}
          </button>
        </div>
      </div>

      {qrUrls.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold text-gray-700">{qrUrls.length} QR codes ready</p>
            <button onClick={downloadAll} className="text-orange-500 text-sm font-semibold">
              Download all
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {qrUrls.map((item) => (
              <div key={item.label} className="bg-white rounded-2xl p-4 shadow-sm text-center">
                <img src={item.dataUrl} alt={item.label} className="w-full rounded-xl mb-2" />
                <p className="text-sm font-semibold text-gray-800 mb-2">{item.label}</p>
                <button
                  onClick={() => download(item)}
                  className="text-xs text-orange-500 font-semibold px-3 py-1.5 bg-orange-50 rounded-lg"
                >
                  Download PNG
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Settings ─────────────────────────────────────────────────────────────────

function SettingsPanel({ restaurant }: { restaurant: Restaurant }) {
  const [form, setForm] = useState({
    name: restaurant.name,
    logo: restaurant.logo ?? '',
    tables: String(restaurant.tables ?? 1),
    kitchenPin: restaurant.kitchenPin ?? '',
    // Customer-facing trust signals — shown on /order header
    coverImage: restaurant.coverImage ?? '',
    description: restaurant.description ?? '',
    address: restaurant.address ?? '',
    phone: restaurant.phone ?? '',
    hours: restaurant.hours ?? '',
    stripeSecretKey: restaurant.stripeSecretKey ?? '',
    stripePublishableKey: restaurant.stripePublishableKey ?? '',
    stripeWebhookSecret: restaurant.stripeWebhookSecret ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    await update(refs.restaurant(restaurant.id), {
      name: form.name.trim(),
      logo: form.logo.trim(),
      tables: parseInt(form.tables, 10),
      kitchenPin: form.kitchenPin.trim(),
      coverImage: form.coverImage.trim() || null,
      description: form.description.trim() || null,
      address: form.address.trim() || null,
      phone: form.phone.trim() || null,
      hours: form.hours.trim() || null,
      stripeSecretKey: form.stripeSecretKey.trim() || null,
      stripePublishableKey: form.stripePublishableKey.trim() || null,
      stripeWebhookSecret: form.stripeWebhookSecret.trim() || null,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const fields = [
    { label: 'Restaurant name', key: 'name', placeholder: 'My Restaurant' },
    { label: 'Logo URL', key: 'logo', placeholder: 'https://...' },
    { label: 'Number of tables', key: 'tables', placeholder: '10', type: 'number' },
    { label: 'Kitchen PIN', key: 'kitchenPin', placeholder: '4-digit PIN', type: 'password' },
  ];

  // Public profile fields — surfaced to customers on the /order page header.
  // All optional; restaurants without these set keep their compact header.
  const publicProfileFields = [
    { label: 'Cover photo URL', key: 'coverImage', placeholder: 'https://… (16:9 photo of your interior or dish)' },
    { label: 'Short description / tagline', key: 'description', placeholder: 'Wood-fired Neapolitan pizza in the heart of Maribor' },
    { label: 'Address', key: 'address', placeholder: 'Glavni trg 5, 2000 Maribor' },
    { label: 'Public phone', key: 'phone', placeholder: '+386 ...' },
    { label: 'Opening hours', key: 'hours', placeholder: 'Mon–Fri 10:00–22:00 · Sat–Sun 11:00–23:00' },
  ];

  const stripeFields = [
    { label: 'Stripe Publishable Key (Optional)', key: 'stripePublishableKey', placeholder: 'pk_live_...' },
    { label: 'Stripe Secret Key (Optional)', key: 'stripeSecretKey', placeholder: 'sk_live_...', type: 'password' },
    { label: 'Stripe Webhook Secret (Optional)', key: 'stripeWebhookSecret', placeholder: 'whsec_...', type: 'password' },
  ];

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-5">Settings</h2>
      
      {/* General Settings */}
      <div className="bg-white rounded-2xl p-5 shadow-sm mb-4">
        <h3 className="font-semibold text-gray-800 mb-4">General Settings</h3>
        <div className="space-y-4">
          {fields.map((f) => (
            <div key={f.key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
              <input
                type={f.type ?? 'text'}
                value={(form as any)[f.key]}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                placeholder={f.placeholder}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-orange-400"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Public Profile — fields surfaced to customers on the /order page. */}
      <div className="bg-white rounded-2xl p-5 shadow-sm mb-4">
        <h3 className="font-semibold text-gray-800 mb-1">Public profile</h3>
        <p className="text-xs text-gray-400 mb-4">
          What customers see when they scan a QR code. All optional — leave blank to hide that row.
        </p>
        <div className="space-y-4">
          {publicProfileFields.map((f) => (
            <div key={f.key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
              {f.key === 'description' ? (
                <textarea
                  rows={2}
                  value={(form as any)[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-orange-400 resize-none"
                />
              ) : (
                <input
                  type="text"
                  value={(form as any)[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-orange-400"
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Stripe Settings */}
      <div className="bg-white rounded-2xl p-5 shadow-sm mb-4">
        <h3 className="font-semibold text-gray-800 mb-1">Direct Stripe Payments (Optional)</h3>
        <p className="text-xs text-gray-400 mb-4">
          Configure your own custom Stripe credentials to receive card payments directly. Leave blank to process transactions using the platform's default account.
        </p>
        <div className="space-y-4">
          {stripeFields.map((f) => (
            <div key={f.key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
              <input
                type={f.type ?? 'text'}
                value={(form as any)[f.key]}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                placeholder={f.placeholder}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-orange-400"
              />
            </div>
          ))}
        </div>

        {form.stripeWebhookSecret.trim() && (
          <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4 mt-4">
            <h4 className="text-xs font-bold text-orange-700 mb-1">Your Custom Stripe Webhook Endpoint</h4>
            <p className="text-xs text-orange-800 mb-2 leading-relaxed">
              Register this webhook in your Stripe merchant dashboard to listen for completed checkout events:
            </p>
            <div className="bg-white border border-orange-200 rounded-xl px-3 py-2 flex items-center justify-between gap-2">
              <p className="text-[10px] text-gray-600 font-mono truncate select-all">
                https://us-central1-qr-menu-9a48b.cloudfunctions.net/stripeWebhook?r={restaurant.id}
              </p>
              <button
                onClick={() => navigator.clipboard.writeText(`https://us-central1-qr-menu-9a48b.cloudfunctions.net/stripeWebhook?r=${restaurant.id}`)}
                className="text-xs text-orange-600 font-bold flex-shrink-0"
              >
                Copy
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl p-5 shadow-sm mb-4">
        <button
          onClick={save}
          disabled={saving}
          className="w-full bg-orange-500 text-white font-semibold py-3.5 rounded-xl disabled:opacity-50"
        >
          {saved ? '✓ Saved!' : saving ? 'Saving...' : 'Save changes'}
        </button>
      </div>

      <div className="bg-white rounded-2xl p-5 shadow-sm mt-4">
        <h3 className="font-semibold text-gray-700 mb-2">Your order page URL</h3>
        <div className="bg-gray-50 rounded-xl px-3 py-2 flex items-center justify-between gap-2">
          <p className="text-xs text-gray-500 truncate">{window.location.origin}/order?r={restaurant.id}</p>
          <button
            onClick={() => navigator.clipboard.writeText(`${window.location.origin}/order?r=${restaurant.id}`)}
            className="text-xs text-orange-500 font-semibold flex-shrink-0"
          >
            Copy
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Orders History ───────────────────────────────────────────────────────────

function OrdersHistory({ restaurant }: { restaurant: Restaurant }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<'all' | 'today'>('today');

  useEffect(() => {
    const unsub = onValue(refs.restaurantOrders(restaurant.id), (snap) => {
      const all: Order[] = [];
      snap.forEach((c) => { all.push({ id: c.key!, ...c.val() }); });
      all.sort((a, b) => b.timestamp - a.timestamp);
      setOrders(all);
    });
    return () => unsub();
  }, [restaurant.id]);

  const visible = filter === 'today'
    ? orders.filter((o) => o.timestamp >= today())
    : orders.slice(0, 100);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900">Orders</h2>
        <div className="flex bg-gray-100 rounded-xl p-1">
          {(['today', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-all ${
                filter === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      {visible.length === 0 ? (
        <p className="text-gray-400 text-center py-8">No orders found.</p>
      ) : (
        <div className="space-y-2">
          {visible.map((o) => (
            <div key={o.id} className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-900">#{String(o.orderNumber).padStart(3, '0')}</span>
                  {o.tableNumber != null && <span className="text-xs text-gray-400">Table {o.tableNumber}</span>}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                    o.paymentType === 'cash' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'
                  }`}>{o.paymentType}</span>
                </div>
                <span className={`text-xs font-semibold px-2 py-1 rounded-lg capitalize ${
                  o.status === 'done' ? 'bg-green-100 text-green-600' :
                  o.status === 'cancelled' ? 'bg-red-100 text-red-400' :
                  'bg-gray-100 text-gray-500'
                }`}>{o.status}</span>
              </div>
              <p className="text-sm text-gray-600">{o.itemsReadable}</p>
              <div className="flex items-center justify-between mt-1">
                <p className="text-sm text-gray-400">{o.customerName}</p>
                <p className="font-bold text-gray-900">€{o.totalPrice.toFixed(2)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Admin Shell ──────────────────────────────────────────────────────────────

const NAV = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '' },
  { icon: UtensilsCrossed, label: 'Menu', path: 'menu' },
  { icon: Package, label: 'Orders', path: 'orders' },
  { icon: QrCode, label: 'QR Codes', path: 'qr' },
  { icon: Settings, label: 'Settings', path: 'settings' },
];

function AdminShell() {
  const [restaurant, loading] = useRestaurantForUser();

  async function handleLogout() {
    await signOut(auth);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!restaurant) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <p className="text-gray-500 mb-4">No restaurant linked to this account.</p>
        <button onClick={handleLogout} className="text-orange-500 font-semibold">Sign out</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {restaurant.logo && (
            <img src={restaurant.logo} alt="" className="w-8 h-8 rounded-lg object-cover" />
          )}
          <span className="font-bold text-gray-900">{restaurant.name}</span>
        </div>
        <button onClick={handleLogout} className="p-2 text-gray-400 hover:text-gray-700">
          <LogOut size={18} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 pb-24 max-w-2xl mx-auto w-full">
        <Routes>
          <Route index element={<Dashboard restaurant={restaurant} />} />
          <Route path="menu" element={<MenuManager restaurant={restaurant} />} />
          <Route path="orders" element={<OrdersHistory restaurant={restaurant} />} />
          <Route path="qr" element={<QRGenerator restaurant={restaurant} />} />
          <Route path="settings" element={<SettingsPanel restaurant={restaurant} />} />
        </Routes>
      </div>

      {/* Bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 flex justify-around px-2 py-2 z-10">
        {NAV.map((item) => (
          <NavLink
            key={item.path}
            to={`/admin/${item.path}`}
            end={item.path === ''}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-colors ${
                isActive ? 'text-orange-500' : 'text-gray-400'
              }`
            }
          >
            <item.icon size={22} />
            <span className="text-xs font-medium">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </div>
  );
}

// ─── Top-level Admin ──────────────────────────────────────────────────────────

export default function AdminPage() {
  const [user, setUser] = useState<null | { email: string }>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u ? { email: u.email ?? '' } : null);
      setChecking(false);
    });
    return () => unsub();
  }, []);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <LoginPage onLogin={() => {}} />;
  return <AdminShell />;
}
