import { useState, useEffect, useRef } from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, UtensilsCrossed, QrCode, Settings, LogOut,
  Plus, Pencil, Trash2, X, Eye, EyeOff, Save, Package, Upload, ImageIcon,
  BarChart2, TrendingUp, ShoppingBag, Star, Clock
} from 'lucide-react';
import QRCode from 'qrcode';
import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword
} from 'firebase/auth';
import { onValue, set, get, update, push, query, orderByChild, equalTo } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL, getBytes } from 'firebase/storage';
import { auth, refs, storage } from '../lib/firebase';
import { useDocumentTitle } from '../lib/useDocumentTitle';
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
            <button
              type="button"
              onClick={() => setShowPass(!showPass)}
              aria-label={showPass ? 'Hide password' : 'Show password'}
              aria-pressed={showPass}
              className="absolute right-3 top-9 p-1 text-gray-400"
            >
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

// ─── Image helpers ────────────────────────────────────────────────────────────

/** Compress an image file to a small base64 data URL (for canvas/QR use, no CORS needed). */
async function compressToDataUrl(file: File, maxPx = 300, quality = 0.85): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(maxPx / img.width, maxPx / img.height, 1);
        const canvas = document.createElement('canvas');
        canvas.width  = Math.round(img.width  * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target!.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// ─── Image Uploader ───────────────────────────────────────────────────────────

function ImageUploader({ value, onChange, onDataUrl, path }: {
  value: string;
  onChange: (url: string) => void;
  onDataUrl?: (dataUrl: string) => void;
  path: string; // e.g. "logos/shakespeare-pub" or "menu-items/abc123"
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) { setError('Please select an image file.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('Image must be under 5 MB.'); return; }
    setError('');
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() ?? 'jpg';
      const sRef = storageRef(storage, `${path}.${ext}`);
      await uploadBytes(sRef, file);
      const url = await getDownloadURL(sRef);
      onChange(url);
      // Also compress and emit data URL (for canvas / QR cards, bypasses CORS)
      if (onDataUrl) {
        try {
          const dataUrl = await compressToDataUrl(file);
          onDataUrl(dataUrl);
        } catch { /* non-fatal */ }
      }
    } catch (e) {
      setError('Upload failed. Please try again.');
    }
    setUploading(false);
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />
      {value ? (
        <div className="relative w-full rounded-2xl overflow-hidden border border-gray-200 bg-gray-50">
          <img src={value} alt="Preview" className="w-full h-40 object-cover" />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="absolute bottom-2 right-2 bg-white/90 backdrop-blur-sm text-gray-700 text-xs font-semibold px-3 py-1.5 rounded-xl shadow flex items-center gap-1.5 hover:bg-white transition-colors"
          >
            <Upload size={13} /> Change
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full border-2 border-dashed border-gray-200 rounded-2xl py-8 flex flex-col items-center gap-2 text-gray-400 hover:border-orange-400 hover:text-orange-400 transition-colors disabled:opacity-50"
        >
          {uploading ? (
            <div className="w-6 h-6 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <ImageIcon size={28} />
          )}
          <span className="text-sm font-medium">{uploading ? 'Uploading…' : 'Click to upload image'}</span>
          <span className="text-xs">PNG, JPG, WEBP · max 5 MB</span>
        </button>
      )}
      {error && <p className="text-red-500 text-xs">{error}</p>}
    </div>
  );
}

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
            <button
              onClick={() => deleteCategory(cat)}
              aria-label={`Delete category ${cat}`}
              className="p-1 text-gray-300 hover:text-red-400"
            >
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
                  <button
                    onClick={() => toggleAvailable(item.id, item.available)}
                    aria-label={item.available ? `Mark ${item.name} as unavailable` : `Mark ${item.name} as available`}
                    aria-pressed={item.available}
                    className={`px-2 py-1 rounded-lg text-xs font-semibold ${item.available ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}
                  >
                    {item.available ? 'On' : 'Off'}
                  </button>
                  <button
                    onClick={() => setEditItem({ id: item.id, name: item.name, price: String(item.price), description: item.description ?? '', category: item.category, image: item.image, available: item.available, popular: item.popular ?? false })}
                    aria-label={`Edit ${item.name}`}
                    className="p-2 text-gray-400 hover:text-gray-700"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => deleteItem(item.id)}
                    aria-label={`Delete ${item.name}`}
                    className="p-2 text-gray-300 hover:text-red-500"
                  >
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
                <button
                  onClick={() => setEditItem(null)}
                  aria-label="Close edit panel"
                  className="p-1"
                >
                  <X size={20} className="text-gray-400" />
                </button>
              </div>
              <div className="space-y-4">
                {[
                  { label: 'Name *', key: 'name', placeholder: 'e.g. Margherita Pizza' },
                  { label: 'Price (€) *', key: 'price', placeholder: '9.50', type: 'number' },
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Image</label>
                  <ImageUploader
                    value={editItem.image}
                    onChange={(url) => setEditItem({ ...editItem, image: url })}
                    path={`menu-items/${restaurant.id}/${editItem.id ?? 'new-' + Date.now()}`}
                  />
                </div>
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

// Load image → HTMLImageElement.
// • data: URLs are used directly (no network, no CORS — the fast path).
// • Firebase Storage URLs: try getBytes() with a 6 s timeout, then fetch fallback.
async function loadImg(src: string): Promise<HTMLImageElement> {
  let dataUrl: string;

  if (src.startsWith('data:')) {
    dataUrl = src;
  } else {
    try {
      const match = src.match(/firebasestorage\.googleapis\.com\/.*\/o\/(.+?)(?:\?|$)/);
      if (!match) throw new Error('Not a Firebase Storage URL');
      const path = decodeURIComponent(match[1]);
      // Race getBytes against a 6-second timeout so it can never hang forever
      const bytes = await Promise.race([
        getBytes(storageRef(storage, path)),
        new Promise<never>((_, r) => setTimeout(() => r(new Error('getBytes timeout')), 6000)),
      ]);
      dataUrl = await new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload  = () => res(reader.result as string);
        reader.onerror = rej;
        reader.readAsDataURL(new Blob([bytes]));
      });
    } catch {
      try {
        const resp = await fetch(src);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const blob = await resp.blob();
        dataUrl = await new Promise<string>((res, rej) => {
          const reader = new FileReader();
          reader.onload  = () => res(reader.result as string);
          reader.onerror = rej;
          reader.readAsDataURL(blob);
        });
      } catch {
        throw new Error(`Failed to load image: ${src}`);
      }
    }
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

async function buildBrandedQR(
  url: string,
  tableLabel: string,
  restaurant: { name: string; logo?: string; logoBase64?: string },
): Promise<string> {
  const S    = 2;                  // retina scale
  const CW   = 500 * S;
  const CH   = 720 * S;

  // ── 1. Generate clean QR (no logo overlay — keeps it crisp & scannable) ──
  const QR_SIZE = 340 * S;
  const qrDataUrl = await QRCode.toDataURL(url, {
    width: QR_SIZE,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#111827', light: '#ffffff' },
  });

  const canvas  = document.createElement('canvas');
  canvas.width  = CW;
  canvas.height = CH;
  const ctx     = canvas.getContext('2d')!;

  // ── 2. Full card: dark gradient background ──
  const bgGrad = ctx.createLinearGradient(0, 0, 0, CH);
  bgGrad.addColorStop(0, '#1c1917');   // warm dark
  bgGrad.addColorStop(1, '#0c0a09');
  ctx.fillStyle = bgGrad;
  roundRect(ctx, 0, 0, CW, CH, 36 * S);
  ctx.fill();

  // ── 3. Subtle orange glow top-center ──
  const glow = ctx.createRadialGradient(CW / 2, 0, 0, CW / 2, 0, 280 * S);
  glow.addColorStop(0, 'rgba(249,115,22,0.18)');
  glow.addColorStop(1, 'rgba(249,115,22,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CW, CH);

  // ── 4. Large logo — prominent, centered at top ──
  const LOGO_R  = 54 * S;   // radius
  const logoCX  = CW / 2;
  const logoCY  = 100 * S;

  // Outer glow ring
  const ringGlow = ctx.createRadialGradient(logoCX, logoCY, LOGO_R, logoCX, logoCY, LOGO_R + 20 * S);
  ringGlow.addColorStop(0, 'rgba(249,115,22,0.5)');
  ringGlow.addColorStop(1, 'rgba(249,115,22,0)');
  ctx.fillStyle = ringGlow;
  ctx.beginPath();
  ctx.arc(logoCX, logoCY, LOGO_R + 20 * S, 0, Math.PI * 2);
  ctx.fill();

  // Orange ring
  ctx.strokeStyle = '#f97316';
  ctx.lineWidth   = 4 * S;
  ctx.beginPath();
  ctx.arc(logoCX, logoCY, LOGO_R + 4 * S, 0, Math.PI * 2);
  ctx.stroke();

  // White circle background for logo
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(logoCX, logoCY, LOGO_R, 0, Math.PI * 2);
  ctx.fill();

  // Logo image — prefer base64 thumbnail (instant, no CORS) over Storage URL
  const logoSrc = restaurant.logoBase64 || restaurant.logo;
  if (logoSrc) {
    try {
      const logoImg = await loadImg(logoSrc);
      ctx.save();
      const clipR = LOGO_R - 2 * S;
      ctx.beginPath();
      ctx.arc(logoCX, logoCY, clipR, 0, Math.PI * 2);
      ctx.clip();
      // object-fit: cover + 1.25× zoom to fill past any internal image padding
      const diam  = clipR * 2;
      const scale = Math.max(diam / logoImg.width, diam / logoImg.height) * 1.25;
      const drawW = logoImg.width  * scale;
      const drawH = logoImg.height * scale;
      ctx.drawImage(logoImg, logoCX - drawW / 2, logoCY - drawH / 2, drawW, drawH);
      ctx.restore();
    } catch {
      // Initials fallback
      ctx.fillStyle = '#f97316';
      ctx.font = `900 ${28 * S}px sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(restaurant.name.charAt(0).toUpperCase(), logoCX, logoCY);
    }
  }

  // ── 5. Restaurant name ──
  ctx.fillStyle    = '#ffffff';
  ctx.font         = `900 ${22 * S}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(restaurant.name.toUpperCase(), CW / 2, 178 * S, CW - 60 * S);

  // ── 6. Thin orange divider line ──
  ctx.strokeStyle = '#f97316';
  ctx.lineWidth   = 1.5 * S;
  ctx.beginPath();
  ctx.moveTo(CW / 2 - 60 * S, 198 * S);
  ctx.lineTo(CW / 2 + 60 * S, 198 * S);
  ctx.stroke();

  // ── 7. QR code on white rounded card ──
  const QR_X    = (CW - QR_SIZE) / 2;
  const QR_Y    = 216 * S;
  const padQR   = 16 * S;

  // White QR background card
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, QR_X - padQR, QR_Y - padQR, QR_SIZE + padQR * 2, QR_SIZE + padQR * 2, 20 * S);
  ctx.fill();

  // Subtle inner shadow on QR card
  ctx.strokeStyle = 'rgba(249,115,22,0.3)';
  ctx.lineWidth   = 2 * S;
  roundRect(ctx, QR_X - padQR, QR_Y - padQR, QR_SIZE + padQR * 2, QR_SIZE + padQR * 2, 20 * S);
  ctx.stroke();

  // Draw QR
  const qrImg = await loadImg(qrDataUrl);
  ctx.drawImage(qrImg, QR_X, QR_Y, QR_SIZE, QR_SIZE);

  // ── 8. Table badge ──
  const badgeW  = 200 * S;
  const badgeH  = 52 * S;
  const badgeX  = (CW - badgeW) / 2;
  const badgeY  = QR_Y + QR_SIZE + padQR * 2 + 20 * S;

  const badgeGrad = ctx.createLinearGradient(badgeX, badgeY, badgeX + badgeW, badgeY);
  badgeGrad.addColorStop(0, '#f97316');
  badgeGrad.addColorStop(1, '#ea580c');
  ctx.fillStyle = badgeGrad;
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 26 * S);
  ctx.fill();

  ctx.fillStyle    = '#ffffff';
  ctx.font         = `900 ${19 * S}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(tableLabel.toUpperCase(), CW / 2, badgeY + badgeH / 2);

  // ── 9. Centered ordering message (2 lines) ──
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.font         = `700 ${13 * S}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.fillStyle    = 'rgba(255,255,255,0.55)';
  ctx.fillText('SKENIRAJTE QR KODO ZA NAROČILO', CW / 2, badgeY + badgeH + 20 * S);
  ctx.fillStyle    = '#f97316';
  ctx.font         = `900 ${14 * S}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.fillText('PIJAČ IN HRANE', CW / 2, badgeY + badgeH + 42 * S);

  // ── 10. Outer card border glow ──
  ctx.strokeStyle = 'rgba(249,115,22,0.25)';
  ctx.lineWidth   = 2 * S;
  roundRect(ctx, 1, 1, CW - 2, CH - 2, 36 * S);
  ctx.stroke();

  return canvas.toDataURL('image/png');
}

function QRGenerator({ restaurant }: { restaurant: Restaurant }) {
  const [tableCount, setTableCount] = useState(String(restaurant.tables ?? 6));
  const [qrUrls, setQrUrls] = useState<{ label: string; url: string; dataUrl: string }[]>([]);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [genError, setGenError] = useState('');
  const baseUrl = `${window.location.origin}/order?r=${restaurant.id}`;

  async function generate() {
    setGenerating(true);
    setProgress(0);
    setGenError('');
    const count   = parseInt(tableCount, 10);
    const results: typeof qrUrls = [];
    const total   = count + 1;

    try {
      // Restaurant-level QR (no table)
      results.push({
        label: 'Restavracija QR',
        url:   baseUrl,
        dataUrl: await buildBrandedQR(baseUrl, 'Skeniraj & naroči', restaurant),
      });
      setProgress(Math.round((1 / total) * 100));

      // Per-table QRs
      for (let i = 1; i <= count; i++) {
        const url = `${baseUrl}&t=${i}`;
        results.push({
          label: `Miza ${i}`,
          url,
          dataUrl: await buildBrandedQR(url, `Miza ${i}`, restaurant),
        });
        setProgress(Math.round(((i + 1) / total) * 100));
      }

      setQrUrls(results);
    } catch (err: any) {
      console.error('QR generation failed:', err);
      setGenError(err?.message || 'QR generation failed. Please try again.');
    } finally {
      setGenerating(false);
    }
  }

  function download(item: typeof qrUrls[0]) {
    const a = document.createElement('a');
    a.href     = item.dataUrl;
    a.download = `qr-${item.label.replace(/\s+/g, '-').toLowerCase()}.png`;
    a.click();
  }

  function downloadAll() {
    qrUrls.forEach((item, i) => setTimeout(() => download(item), i * 120));
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-5">QR Codes</h2>
      <div className="bg-white rounded-2xl p-5 shadow-sm mb-5">
        <p className="text-sm text-gray-500 mb-4">
          Ustvarite premium QR kode za vaše mize. Vsaka koda vključuje vaš logotip in stranke popelje neposredno do menija.
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
            className="bg-orange-500 text-white font-semibold px-5 py-3 rounded-xl disabled:opacity-50 min-w-[110px]"
          >
            {generating ? `${progress}%` : 'Generate'}
          </button>
        </div>
        {generating && (
          <div className="mt-3 h-1.5 bg-orange-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-orange-500 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
        {genError && (
          <p className="mt-3 text-sm text-red-500 font-medium">{genError}</p>
        )}
      </div>

      {qrUrls.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold text-gray-700">{qrUrls.length} QR codes ready</p>
            <button onClick={downloadAll} className="text-orange-500 text-sm font-semibold">
              Download all
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {qrUrls.map((item) => (
              <div key={item.label} className="bg-white rounded-2xl p-3 shadow-sm text-center border border-gray-100">
                <img src={item.dataUrl} alt={item.label} className="w-full rounded-xl mb-2" />
                <p className="text-xs font-semibold text-gray-500 mb-2">{item.label}</p>
                <button
                  onClick={() => download(item)}
                  className="text-xs text-orange-500 font-semibold px-3 py-1.5 bg-orange-50 rounded-lg w-full"
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
    heroImage: restaurant.heroImage ?? '',
    tables: String(restaurant.tables ?? 1),
    kitchenPin: restaurant.kitchenPin ?? '',
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
      heroImage: form.heroImage.trim() || null,
      tables: parseInt(form.tables, 10),
      kitchenPin: form.kitchenPin.trim(),
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
    { label: 'Number of tables', key: 'tables', placeholder: '10', type: 'number' },
    { label: 'Kitchen PIN', key: 'kitchenPin', placeholder: '4-digit PIN', type: 'password' },
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Logo</label>
            <ImageUploader
              value={form.logo}
              onChange={(url) => setForm({ ...form, logo: url })}
              onDataUrl={async (dataUrl) => {
                // Save compressed base64 thumbnail to DB immediately — used by QR card canvas (no CORS needed)
                try { await update(refs.restaurant(restaurant.id), { logoBase64: dataUrl }); } catch { /* non-fatal */ }
              }}
              path={`logos/${restaurant.id}`}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Hero Background Image</label>
            <p className="text-xs text-gray-400 mb-2">Displayed as the background behind your logo on the customer menu page.</p>
            <ImageUploader
              value={form.heroImage}
              onChange={(url) => setForm({ ...form, heroImage: url })}
              path={`heroes/${restaurant.id}`}
            />
          </div>
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

// ─── Analytics Dashboard ──────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string; sub: string;
  icon: React.ElementType;
  color: 'orange' | 'blue' | 'green' | 'purple';
}) {
  const palette = {
    orange: { bg: 'bg-orange-50', border: 'border-orange-100', icon: 'text-orange-400', val: 'text-orange-600' },
    blue:   { bg: 'bg-blue-50',   border: 'border-blue-100',   icon: 'text-blue-400',   val: 'text-blue-600'   },
    green:  { bg: 'bg-green-50',  border: 'border-green-100',  icon: 'text-green-400',  val: 'text-green-600'  },
    purple: { bg: 'bg-purple-50', border: 'border-purple-100', icon: 'text-purple-400', val: 'text-purple-600' },
  }[color];
  return (
    <div className={`rounded-2xl p-4 border ${palette.bg} ${palette.border}`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-gray-500">{label}</p>
        <Icon size={16} className={palette.icon} />
      </div>
      <p className={`text-2xl font-black ${palette.val}`}>{value}</p>
      <p className="text-xs text-gray-400 font-medium mt-0.5">{sub}</p>
    </div>
  );
}

function AnalyticsDashboard({ restaurant }: { restaurant: Restaurant }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onValue(refs.restaurantOrders(restaurant.id), (snap) => {
      const data: Order[] = [];
      snap.forEach((child) => { data.push({ id: child.key!, ...child.val() } as Order); });
      setOrders(data.filter((o) => o.status !== 'cancelled'));
      setLoading(false);
    });
    return () => unsub();
  }, [restaurant.id]);

  // ── Time boundaries ────────────────────────────────────────────────────────
  const todayStart  = new Date(); todayStart.setHours(0, 0, 0, 0);
  const weekStart   = new Date(todayStart); weekStart.setDate(weekStart.getDate() - 6);
  const monthStart  = new Date(todayStart); monthStart.setDate(1);

  const todayOrders = orders.filter((o) => o.timestamp >= todayStart.getTime());
  const weekOrders  = orders.filter((o) => o.timestamp >= weekStart.getTime());
  const monthOrders = orders.filter((o) => o.timestamp >= monthStart.getTime());

  const rev = (arr: Order[]) => arr.reduce((s, o) => s + (o.totalPrice ?? 0), 0);
  const revenueToday  = rev(todayOrders);
  const revenueWeek   = rev(weekOrders);
  const revenueMonth  = rev(monthOrders);
  const avgOrderValue = orders.length ? rev(orders) / orders.length : 0;

  // ── Last 7 days bar chart ──────────────────────────────────────────────────
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d    = new Date(todayStart); d.setDate(d.getDate() - (6 - i));
    const next = new Date(d);          next.setDate(next.getDate() + 1);
    const day  = orders.filter((o) => o.timestamp >= d.getTime() && o.timestamp < next.getTime());
    return {
      label:   d.toLocaleDateString('sl-SI', { weekday: 'short' }),
      revenue: rev(day),
      count:   day.length,
    };
  });
  const maxRev = Math.max(...last7.map((d) => d.revenue), 1);

  // ── Top selling items ──────────────────────────────────────────────────────
  const itemMap: Record<string, { name: string; qty: number; revenue: number }> = {};
  orders.forEach((o) => {
    try {
      (JSON.parse(o.items) as import('../types').CartItem[]).forEach((item) => {
        if (!itemMap[item.name]) itemMap[item.name] = { name: item.name, qty: 0, revenue: 0 };
        itemMap[item.name].qty     += item.quantity;
        itemMap[item.name].revenue += item.price * item.quantity;
      });
    } catch { /* unparseable */ }
  });
  const topItems = Object.values(itemMap).sort((a, b) => b.qty - a.qty).slice(0, 5);

  // ── Peak hour ─────────────────────────────────────────────────────────────
  const hourCounts = Array<number>(24).fill(0);
  orders.forEach((o) => { hourCounts[new Date(o.timestamp).getHours()]++; });
  const peakHour = hourCounts.indexOf(Math.max(...hourCounts));

  // ── Avg rating ─────────────────────────────────────────────────────────────
  const rated    = orders.filter((o) => o.review?.rating);
  const avgRating = rated.length ? rated.reduce((s, o) => s + (o.review!.rating), 0) / rated.length : 0;

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-5">Analytics</h2>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <StatCard label="Today's Revenue"  value={`€${revenueToday.toFixed(2)}`}  sub={`${todayOrders.length} orders today`}         icon={TrendingUp}  color="orange" />
        <StatCard label="This Week"        value={`€${revenueWeek.toFixed(2)}`}   sub={`${weekOrders.length} orders (7 days)`}        icon={BarChart2}   color="blue"   />
        <StatCard label="This Month"       value={`€${revenueMonth.toFixed(2)}`}  sub={`${monthOrders.length} orders this month`}     icon={ShoppingBag} color="green"  />
        <StatCard
          label="Avg Order Value"
          value={`€${avgOrderValue.toFixed(2)}`}
          sub={avgRating > 0 ? `★ ${avgRating.toFixed(1)} avg rating (${rated.length})` : `${orders.length} total orders`}
          icon={Star}
          color="purple"
        />
      </div>

      {/* ── 7-day revenue bar chart ── */}
      <div className="bg-white rounded-2xl p-5 shadow-sm mb-4">
        <h3 className="font-bold text-gray-800 mb-1">Revenue — Last 7 Days</h3>
        <p className="text-xs text-gray-400 mb-4">€{revenueWeek.toFixed(2)} this week</p>
        <div className="flex items-end gap-2 h-28">
          {last7.map((d, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              {d.revenue > 0 && (
                <span className="text-[9px] font-bold text-gray-500">€{d.revenue >= 100 ? `${(d.revenue / 100).toFixed(0)}` : d.revenue.toFixed(0)}</span>
              )}
              <div className="w-full flex-1 flex items-end">
                <div
                  className="w-full bg-orange-500 rounded-t-lg transition-all"
                  style={{ height: `${Math.max((d.revenue / maxRev) * 80, d.revenue > 0 ? 6 : 2)}px`, opacity: d.revenue > 0 ? 1 : 0.15 }}
                />
              </div>
              <span className="text-[10px] text-gray-400 font-medium">{d.label}</span>
              {d.count > 0 && <span className="text-[9px] text-gray-300">{d.count}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* ── Top selling items ── */}
      <div className="bg-white rounded-2xl p-5 shadow-sm mb-4">
        <h3 className="font-bold text-gray-800 mb-4">Top Selling Items</h3>
        {topItems.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-4">No order data yet.</p>
        ) : (
          <div className="space-y-3">
            {topItems.map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-600 text-xs font-black flex items-center justify-center flex-shrink-0">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <p className="text-sm font-semibold text-gray-800 truncate">{item.name}</p>
                    <span className="text-sm font-bold text-gray-700 ml-2 flex-shrink-0">€{item.revenue.toFixed(2)}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-orange-400 rounded-full transition-all"
                      style={{ width: `${(item.qty / topItems[0].qty) * 100}%` }}
                    />
                  </div>
                </div>
                <span className="text-xs font-bold text-gray-400 w-8 text-right flex-shrink-0">{item.qty}×</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Peak hour + rating row ── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Clock size={14} className="text-orange-400" />
            <h3 className="font-bold text-gray-800 text-sm">Busiest Hour</h3>
          </div>
          {orders.length > 0 ? (
            <>
              <p className="text-2xl font-black text-orange-500">{String(peakHour).padStart(2,'0')}:00</p>
              <p className="text-xs text-gray-400 mt-1">{hourCounts[peakHour]} orders at this hour</p>
            </>
          ) : (
            <p className="text-sm text-gray-400">No data yet</p>
          )}
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Star size={14} className="text-orange-400" />
            <h3 className="font-bold text-gray-800 text-sm">Customer Rating</h3>
          </div>
          {avgRating > 0 ? (
            <>
              <p className="text-2xl font-black text-orange-500">★ {avgRating.toFixed(1)}</p>
              <p className="text-xs text-gray-400 mt-1">from {rated.length} review{rated.length !== 1 ? 's' : ''}</p>
            </>
          ) : (
            <p className="text-sm text-gray-400">No reviews yet</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Admin Shell ──────────────────────────────────────────────────────────────

const NAV = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '' },
  { icon: UtensilsCrossed, label: 'Menu',      path: 'menu' },
  { icon: Package,         label: 'Orders',    path: 'orders' },
  { icon: BarChart2,       label: 'Analytics', path: 'analytics' },
  { icon: QrCode,          label: 'QR Codes',  path: 'qr' },
  { icon: Settings,        label: 'Settings',  path: 'settings' },
];

function AdminShell() {
  const [restaurant, loading] = useRestaurantForUser();
  const location = useLocation();

  // Map the sub-route under /admin to a human-readable section label.
  const SECTION_TITLES: Record<string, string> = {
    '/admin':           'Dashboard',
    '/admin/menu':      'Menu',
    '/admin/orders':    'Orders',
    '/admin/analytics': 'Analytics',
    '/admin/qr':        'QR Codes',
    '/admin/settings':  'Settings',
  };
  const section = SECTION_TITLES[location.pathname] ?? 'Admin';
  useDocumentTitle(restaurant ? `${section} · ${restaurant.name}` : section);

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
            <img
              src={restaurant.logo}
              alt={`${restaurant.name} logo`}
              className="h-9 w-auto max-w-[120px] rounded-lg object-contain"
            />
          )}
          <span className="font-bold text-gray-900">{restaurant.name}</span>
        </div>
        <button
          onClick={handleLogout}
          aria-label="Sign out"
          className="p-2 text-gray-400 hover:text-gray-700"
        >
          <LogOut size={18} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 pb-24 max-w-2xl mx-auto w-full">
        <Routes>
          <Route index element={<Dashboard restaurant={restaurant} />} />
          <Route path="menu" element={<MenuManager restaurant={restaurant} />} />
          <Route path="orders"    element={<OrdersHistory      restaurant={restaurant} />} />
          <Route path="analytics" element={<AnalyticsDashboard restaurant={restaurant} />} />
          <Route path="qr"        element={<QRGenerator        restaurant={restaurant} />} />
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
