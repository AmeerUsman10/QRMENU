import { useState, useEffect, useRef, createContext, useContext } from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, UtensilsCrossed, QrCode, Settings, LogOut,
  Plus, Pencil, Trash2, X, Eye, EyeOff, Save, Package, Upload, ImageIcon,
  BarChart2, TrendingUp, ShoppingBag, Star, Clock,
  Boxes, AlertTriangle, CheckCircle2, SlidersHorizontal, ChevronDown,
} from 'lucide-react';
import QRCode from 'qrcode';
import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword
} from 'firebase/auth';
import { onValue, set, get, update, push, remove, query, orderByChild, equalTo } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL, getBytes } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { auth, refs, storage, firebaseFunctions, runTransaction } from '../lib/firebase';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import type { Restaurant, MenuItem, Order, InventoryItem } from '../types';

// ── Admin i18n ────────────────────────────────────────────────────────────────

type AdminLang = 'sl' | 'en';
const AdminLangCtx = createContext<AdminLang>('en');
const useT = () => adminT[useContext(AdminLangCtx)];

const adminT = {
  en: {
    navDashboard: 'Dashboard', navMenu: 'Menu', navInventory: 'Inventory',
    navOrders: 'Orders', navAnalytics: 'Analytics', navQR: 'QR', navSettings: 'Settings',
    cancel: 'Cancel', save: 'Save item', delete: 'Delete', saving: 'Saving…',
    inventory: 'Inventory', addItem: 'Add Item',
    tabItems: '📦 Items', tabScanBill: '🤖 Scan Bill',
    totalItems: 'Total Items', lowStock: 'Low Stock', outOfStock: 'Out of Stock',
    statusInStock: 'In stock', statusLow: 'Low stock', statusOut: 'Out of stock',
    searchPlaceholder: 'Search items, categories, suppliers…',
    filterAll: 'All', filterLow: 'Low', filterOut: 'Out',
    noItemsYet: 'No inventory items yet', addFirstItem: '+ Add your first item',
    noMatchSearch: 'No items matching',
    catOut: 'out', catLow: 'low', minLabel: 'min:',
    deleteItemTitle: 'Delete Item?',
    deleteItemMsg: 'This will permanently remove the item from your inventory.',
    bulkMinBannerTitle: 'items have no minimum stock set',
    bulkMinBannerSub: 'Tap to set minimums so low-stock alerts work correctly',
    bulkMinTitle: 'Set Minimum Stock', bulkMinSubtitle: 'items with no minimum set',
    bulkMinNote: 'Leave blank to skip. The system alerts you when stock falls below this level.',
    bulkMinSave: 'Save Minimums', inStock: 'in stock',
    uploadTitle: 'Upload Supplier Bill',
    uploadSub: 'Photo or scanned PDF of your delivery note',
    uploadFormats: 'JPG · PNG · WebP · PDF — max 10 MB',
    autoSkippedNote: 'will be auto-skipped from your remembered list',
    recentBills: 'Recent Bills', billAdded: 'added', billSkipped: 'skipped',
    howItWorks: 'How it works',
    hw1: '1. Upload a photo or PDF of your supplier delivery note',
    hw2: '2. AI reads every item and quantity automatically',
    hw3: "3. Review — skip anything you don't want to track",
    hw4: '4. Confirm to add stock to your inventory in one tap',
    billExtracted: 'Bill extracted ✓',
    autoSkippedBanner: 'items auto-skipped from your remembered list',
    reviewFound: 'found — review & confirm',
    createNew: '➕ Create new inventory item',
    include: 'Include', skippedBtn: 'Skipped', autoSkipBtn: '🧠 Auto-skip',
    uploading: 'Uploading bill…', processing: 'Reading bill with AI…',
    processingNote: 'This may take 10–30 seconds',
    doneTitle: 'Done!', doneUpdated: 'updated in inventory',
    learnedNote: 'to skip next time', remembered: 'Remembered',
    backToInventory: 'Back to Inventory', unknownSupplier: 'Unknown supplier',
    confirmBtn: 'Confirm',
    quickAdd: 'Quick Add', currentLabel: 'Current', newLabel: 'New', changeLabel: 'Change',
    adjustTitle: 'Adjust Stock', adjustManual: 'Manual Amount (+ or -)', adjustReason: 'Reason',
    itemName: 'Item Name *', itemPrice: 'Price (€) *', itemDesc: 'Description',
    itemCategory: 'Category', itemAvailable: 'Available', itemPopular: 'Popular',
    itemIngredients: 'Ingredients', itemIngredientsNote: '(auto stock deduction)',
    addIngredient: '+ Add ingredient…',
    stockValue: 'Stock Value', stockValueSub: 'tracked items',
    reorderList: 'Reorder List', reorderEmpty: 'All stock levels are OK! 🎉',
    reorderCopy: 'Copy List', reorderCopied: 'Copied! ✓', reorderClose: 'Close',
    quickMinus: '−', quickPlus: '+',
  },
  sl: {
    navDashboard: 'Nadzorna plošča', navMenu: 'Meni', navInventory: 'Zaloga',
    navOrders: 'Naročila', navAnalytics: 'Analitika', navQR: 'QR kode', navSettings: 'Nastavitve',
    cancel: 'Prekliči', save: 'Shrani artikel', delete: 'Izbriši', saving: 'Shranjujem…',
    inventory: 'Zaloga', addItem: 'Dodaj artikel',
    tabItems: '📦 Artikli', tabScanBill: '🤖 Skeniraj račun',
    totalItems: 'Skupaj artiklov', lowStock: 'Malo na zalogi', outOfStock: 'Ni na zalogi',
    statusInStock: 'Na zalogi', statusLow: 'Malo na zalogi', statusOut: 'Ni na zalogi',
    searchPlaceholder: 'Iščite po artiklih, kategorijah, dobaviteljih…',
    filterAll: 'Vse', filterLow: 'Malo', filterOut: 'Ni',
    noItemsYet: 'Še ni artiklov v zalogi', addFirstItem: '+ Dodaj prvi artikel',
    noMatchSearch: 'Ni zadetkov za',
    catOut: 'ni', catLow: 'malo', minLabel: 'min:',
    deleteItemTitle: 'Izbriši artikel?',
    deleteItemMsg: 'Ta artikel bo trajno odstranjen iz zaloge.',
    bulkMinBannerTitle: 'artiklov brez nastavljene minimalne zaloge',
    bulkMinBannerSub: 'Tapnite za nastavitev minimumov, da opozorila delujejo pravilno',
    bulkMinTitle: 'Nastavi minimalno zalogo', bulkMinSubtitle: 'artiklov brez nastavljenega minimuma',
    bulkMinNote: 'Pustite prazno za preskočitev. Sistem vas opozori, ko zaloga pade pod to vrednost.',
    bulkMinSave: 'Shrani minimume', inStock: 'na zalogi',
    uploadTitle: 'Naloži dobavni račun',
    uploadSub: 'Fotografija ali skeniran PDF dobavnice',
    uploadFormats: 'JPG · PNG · WebP · PDF — največ 10 MB',
    autoSkippedNote: 'bo samodejno preskočenih iz shranjenega seznama',
    recentBills: 'Nedavni računi', billAdded: 'dodano', billSkipped: 'preskočeno',
    howItWorks: 'Kako deluje',
    hw1: '1. Naložite fotografijo ali PDF dobavnice',
    hw2: '2. AI samodejno prebere vsak artikel in količino',
    hw3: '3. Preglejte — preskočite kar ne želite slediti',
    hw4: '4. Potrdite za posodobitev zaloge z enim dotikom',
    billExtracted: 'Račun prebran ✓',
    autoSkippedBanner: 'artiklov samodejno preskočenih',
    reviewFound: 'najdenih — preglejte in potrdite',
    createNew: '➕ Ustvari nov artikel v zalogi',
    include: 'Vključi', skippedBtn: 'Preskočeno', autoSkipBtn: '🧠 Sam. preskok',
    uploading: 'Nalagam račun…', processing: 'Berem račun z AI…',
    processingNote: 'To lahko traja 10–30 sekund',
    doneTitle: 'Končano!', doneUpdated: 'posodobljenih v zalogi',
    learnedNote: 'za naslednjič', remembered: 'Zapomnil sem si',
    backToInventory: 'Nazaj na zalogo', unknownSupplier: 'Neznan dobavitelj',
    confirmBtn: 'Potrdi',
    quickAdd: 'Hitro dodaj', currentLabel: 'Trenutno', newLabel: 'Novo', changeLabel: 'Sprememba',
    adjustTitle: 'Prilagodi zalogo', adjustManual: 'Ročna sprememba (+ ali -)', adjustReason: 'Razlog',
    itemName: 'Ime artikla *', itemPrice: 'Cena (€) *', itemDesc: 'Opis',
    itemCategory: 'Kategorija', itemAvailable: 'Dostopno', itemPopular: 'Priljubljeno',
    itemIngredients: 'Sestavine', itemIngredientsNote: '(samodejni odbitek zaloge)',
    addIngredient: '+ Dodaj sestavino…',
    stockValue: 'Vrednost zaloge', stockValueSub: 'sledenih artiklov',
    reorderList: 'Seznam naročil', reorderEmpty: 'Vse zaloge so v redu! 🎉',
    reorderCopy: 'Kopiraj seznam', reorderCopied: 'Kopirano! ✓', reorderClose: 'Zapri',
    quickMinus: '−', quickPlus: '+',
  },
} as const;

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
  ingredients: Record<string, number>; // inventoryItemId → qty per serving
}

function MenuManager({ restaurant }: { restaurant: Restaurant }) {
  const [editItem, setEditItem] = useState<(ItemFormData & { id?: string }) | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>(restaurant.categories?.[0] ?? '');
  const [newCategory, setNewCategory] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [invItems, setInvItems] = useState<InventoryItem[]>([]);

  useEffect(() => {
    const unsub = onValue(refs.inventoryItems(restaurant.id), snap => {
      if (snap.exists()) {
        setInvItems(Object.entries(snap.val() as Record<string, Omit<InventoryItem, 'id'>>)
          .map(([id, v]) => ({ ...v, id }))
          .sort((a, b) => a.name.localeCompare(b.name)));
      } else {
        setInvItems([]);
      }
    }, () => setInvItems([]));
    return () => unsub();
  }, [restaurant.id]);

  const items: MenuItem[] = Object.entries(restaurant.menu ?? {}).map(([id, item]) => ({
    ...item, id,
  }));

  const categories = restaurant.categories ?? [];

  async function saveItem(data: ItemFormData & { id?: string }) {
    setSaving(true);
    const itemData: Record<string, unknown> = {
      name: data.name.trim(),
      price: parseFloat(data.price),
      description: data.description.trim(),
      category: data.category,
      image: data.image.trim(),
      available: data.available,
      popular: data.popular,
    };
    // Only save non-empty ingredients map
    const ing = Object.fromEntries(Object.entries(data.ingredients).filter(([, v]) => v > 0));
    if (Object.keys(ing).length > 0) itemData.ingredients = ing;
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
          onClick={() => setEditItem({ name: '', price: '', description: '', category: activeCategory, image: '', available: true, popular: false, ingredients: {} })}
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
                    onClick={() => setEditItem({ id: item.id, name: item.name, price: String(item.price), description: item.description ?? '', category: item.category, image: item.image, available: item.available, popular: item.popular ?? false, ingredients: item.ingredients ?? {} })}
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
                {/* Ingredients for auto stock deduction */}
                {invItems.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Ingredients <span className="text-gray-400 font-normal">(auto stock deduction)</span>
                    </label>
                    <div className="space-y-2">
                      {Object.entries(editItem.ingredients).map(([invId, qty]) => {
                        const inv = invItems.find(i => i.id === invId);
                        if (!inv) return null;
                        return (
                          <div key={invId} className="flex items-center gap-2 bg-orange-50 rounded-xl px-3 py-2">
                            <span className="flex-1 text-sm font-medium text-gray-800 truncate">{inv.name}</span>
                            <input
                              type="number"
                              min={0}
                              step="any"
                              value={qty}
                              onChange={e => setEditItem({ ...editItem, ingredients: { ...editItem.ingredients, [invId]: parseFloat(e.target.value) || 0 } })}
                              className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-sm text-right outline-none focus:border-orange-400"
                            />
                            <span className="text-xs text-gray-400 w-8">{inv.unit}</span>
                            <button
                              onClick={() => {
                                const next = { ...editItem.ingredients };
                                delete next[invId];
                                setEditItem({ ...editItem, ingredients: next });
                              }}
                              className="text-gray-300 hover:text-red-400 transition-colors"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        );
                      })}
                      <select
                        value=""
                        onChange={e => {
                          if (!e.target.value) return;
                          setEditItem({ ...editItem, ingredients: { ...editItem.ingredients, [e.target.value]: 1 } });
                          e.target.value = '';
                        }}
                        className="w-full border border-dashed border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-500 bg-white outline-none focus:border-orange-400"
                      >
                        <option value="">+ Add ingredient…</option>
                        {invItems
                          .filter(i => !editItem.ingredients[i.id])
                          .map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)
                        }
                      </select>
                    </div>
                  </div>
                )}
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

// ─── Inventory Manager ───────────────────────────────────────────────────────

const INV_UNITS = ['kg', 'g', 'L', 'mL', 'pcs', 'bottles', 'boxes', 'bags', 'cans', 'portions'];
const INV_CATEGORIES = ['Produce', 'Dairy', 'Meat & Poultry', 'Seafood', 'Dry Goods', 'Beverages', 'Condiments & Sauces', 'Bakery', 'Frozen', 'Cleaning & Hygiene', 'Other'];
const ADJUST_REASONS = ['Delivery received', 'Used in production', 'Waste / spoilage', 'Inventory correction', 'Other'];

type StockStatus = 'ok' | 'low' | 'out';
function getStockStatus(item: InventoryItem): StockStatus {
  if (item.currentStock <= 0) return 'out';
  if (item.currentStock <= item.minStock) return 'low';
  return 'ok';
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return mins <= 1 ? 'just now' : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ── Item Add/Edit Modal ───────────────────────────────────────────────────────

interface ItemModalProps {
  restaurantId: string;
  item?: InventoryItem;
  onClose: () => void;
}

function ItemModal({ restaurantId, item, onClose }: ItemModalProps) {
  const isEdit = !!item;
  const [form, setForm] = useState({
    name:         item?.name         ?? '',
    category:     item?.category     ?? INV_CATEGORIES[0],
    unit:         item?.unit         ?? INV_UNITS[0],
    currentStock: item?.currentStock != null ? String(item.currentStock) : '',
    minStock:     item?.minStock     != null ? String(item.minStock)     : '',
    unitPrice:    item?.unitPrice    != null ? String(item.unitPrice)    : '',
    supplier:     item?.supplier     ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  async function handleSave() {
    if (!form.name.trim()) { setError('Item name is required'); return; }
    if (form.currentStock === '' || isNaN(Number(form.currentStock))) { setError('Current stock must be a number'); return; }
    if (form.minStock === '' || isNaN(Number(form.minStock))) { setError('Minimum stock must be a number'); return; }
    setSaving(true);
    const payload: Omit<InventoryItem, 'id'> = {
      name:         form.name.trim(),
      category:     form.category,
      unit:         form.unit,
      currentStock: parseFloat(form.currentStock),
      minStock:     parseFloat(form.minStock),
      lastUpdated:  Date.now(),
      ...(form.unitPrice  ? { unitPrice:  parseFloat(form.unitPrice)  } : {}),
      ...(form.supplier.trim() ? { supplier: form.supplier.trim() } : {}),
    };
    try {
      if (isEdit && item) {
        await update(refs.inventoryItem(restaurantId, item.id), payload);
      } else {
        await push(refs.inventoryItems(restaurantId), payload);
      }
      onClose();
    } catch {
      setError('Failed to save. Please try again.');
      setSaving(false);
    }
  }

  return (
    <motion.div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div className="bg-white rounded-t-3xl max-h-[92vh] flex flex-col"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 280 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100">
          <h2 className="text-lg font-black text-gray-900">{isEdit ? 'Edit Item' : 'Add Inventory Item'}</h2>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
            <X size={18} className="text-gray-500" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Item Name *</label>
            <input value={form.name} onChange={f('name')} placeholder="e.g. Tomatoes"
              className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 text-gray-900 font-medium outline-none focus:border-orange-400 transition-colors" />
          </div>
          {/* Category + Unit */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Category *</label>
              <div className="relative">
                <select value={form.category} onChange={f('category')}
                  className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 text-gray-900 font-medium outline-none focus:border-orange-400 appearance-none bg-white">
                  {INV_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
                <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Unit *</label>
              <div className="relative">
                <select value={form.unit} onChange={f('unit')}
                  className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 text-gray-900 font-medium outline-none focus:border-orange-400 appearance-none bg-white">
                  {INV_UNITS.map(u => <option key={u}>{u}</option>)}
                </select>
                <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>
          {/* Current Stock + Min Stock */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Current Stock *</label>
              <input type="number" min={0} value={form.currentStock} onChange={f('currentStock')} placeholder="0"
                className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 text-gray-900 font-medium outline-none focus:border-orange-400 transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Min Stock Level *</label>
              <input type="number" min={0} value={form.minStock} onChange={f('minStock')} placeholder="0"
                className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 text-gray-900 font-medium outline-none focus:border-orange-400 transition-colors" />
            </div>
          </div>
          {/* Unit Price + Supplier */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Unit Price (€)</label>
              <input type="number" min={0} step={0.01} value={form.unitPrice} onChange={f('unitPrice')} placeholder="0.00"
                className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 text-gray-900 font-medium outline-none focus:border-orange-400 transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Supplier</label>
              <input value={form.supplier} onChange={f('supplier')} placeholder="Supplier name"
                className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 text-gray-900 font-medium outline-none focus:border-orange-400 transition-colors" />
            </div>
          </div>
          {error && <p className="text-red-500 text-sm font-medium">{error}</p>}
        </div>
        <div className="px-5 pb-6 pt-4 border-t border-gray-100">
          <button onClick={handleSave} disabled={saving}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black py-4 rounded-2xl transition-all active:scale-[0.98] disabled:opacity-50">
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Item'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Stock Adjust Modal ────────────────────────────────────────────────────────

interface AdjustModalProps {
  restaurantId: string;
  item: InventoryItem;
  onClose: () => void;
}

function AdjustModal({ restaurantId, item, onClose }: AdjustModalProps) {
  const [delta, setDelta]   = useState('');
  const [reason, setReason] = useState(ADJUST_REASONS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const parsedDelta  = parseFloat(delta) || 0;
  const newStock     = Math.max(0, item.currentStock + parsedDelta);
  const deltaDisplay = parsedDelta > 0 ? `+${parsedDelta}` : parsedDelta < 0 ? `${parsedDelta}` : '0';

  function quickAdd(n: number) {
    setDelta(prev => String((parseFloat(prev) || 0) + n));
  }

  async function handleSave() {
    if (delta === '' || isNaN(parsedDelta) || parsedDelta === 0) {
      setError('Enter a non-zero adjustment amount');
      return;
    }
    setSaving(true);
    try {
      await update(refs.inventoryItem(restaurantId, item.id), {
        currentStock: newStock,
        lastUpdated: Date.now(),
      });
      onClose();
    } catch {
      setError('Failed to save. Please try again.');
      setSaving(false);
    }
  }

  return (
    <motion.div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div className="bg-white rounded-t-3xl flex flex-col"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 280 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-black text-gray-900">Adjust Stock</h2>
            <p className="text-sm text-gray-400 mt-0.5">{item.name} · {item.unit}</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
            <X size={18} className="text-gray-500" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {/* Current → New preview */}
          <div className="flex items-center justify-between bg-gray-50 rounded-2xl px-4 py-3">
            <div className="text-center">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Current</p>
              <p className="text-2xl font-black text-gray-900 mt-0.5">{item.currentStock}</p>
            </div>
            <div className="text-gray-300 text-xl">→</div>
            <div className="text-center">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">New</p>
              <p className={`text-2xl font-black mt-0.5 ${newStock <= 0 ? 'text-red-500' : newStock <= item.minStock ? 'text-amber-500' : 'text-green-600'}`}>
                {newStock}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Change</p>
              <p className={`text-2xl font-black mt-0.5 ${parsedDelta > 0 ? 'text-green-600' : parsedDelta < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                {deltaDisplay}
              </p>
            </div>
          </div>
          {/* Quick buttons */}
          <div>
            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Quick Add</p>
            <div className="flex gap-2">
              {[1, 5, 10, 25, 50].map(n => (
                <button key={n} onClick={() => quickAdd(n)}
                  className="flex-1 py-2 rounded-xl bg-green-50 text-green-700 font-black text-sm hover:bg-green-100 transition-colors">
                  +{n}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              {[1, 5, 10, 25, 50].map(n => (
                <button key={n} onClick={() => quickAdd(-n)}
                  className="flex-1 py-2 rounded-xl bg-red-50 text-red-600 font-black text-sm hover:bg-red-100 transition-colors">
                  -{n}
                </button>
              ))}
            </div>
          </div>
          {/* Manual input */}
          <div>
            <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Manual Amount (+ or -)</label>
            <input type="number" value={delta} onChange={e => setDelta(e.target.value)} placeholder="e.g. 20 or -3"
              className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 text-gray-900 font-medium outline-none focus:border-orange-400 transition-colors" />
          </div>
          {/* Reason */}
          <div>
            <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Reason</label>
            <div className="relative">
              <select value={reason} onChange={e => setReason(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 text-gray-900 font-medium outline-none focus:border-orange-400 appearance-none bg-white">
                {ADJUST_REASONS.map(r => <option key={r}>{r}</option>)}
              </select>
              <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>
          {error && <p className="text-red-500 text-sm font-medium">{error}</p>}
        </div>
        <div className="px-5 pb-6 pt-2 border-t border-gray-100">
          <button onClick={handleSave} disabled={saving}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black py-4 rounded-2xl transition-all active:scale-[0.98] disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Adjustment'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Phase 2 — AI Bill Scanning ────────────────────────────────────────────────

interface ExtractedItem {
  name: string;
  quantity: number;
  unit: string;
  unitPrice?: number | null;
  totalPrice?: number | null;
}
interface ExtractedBill {
  supplier?: string | null;
  date?: string | null;
  invoiceNumber?: string | null;
  total?: number | null;
  items: ExtractedItem[];
}
interface ReviewItem extends ExtractedItem {
  matchedId: string | null;
  action: 'add_stock' | 'skip';
  newName: string;
  newUnit: string;
  newCategory: string;
  autoSkipped: boolean; // true if auto-skipped from remembered skip list
}

interface BillHistoryEntry {
  id: string;
  timestamp: number;
  supplier?: string | null;
  date?: string | null;
  invoiceNumber?: string | null;
  total?: number | null;
  itemsProcessed: number;
  itemsSkipped: number;
}

function normalizeSkipKey(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

function findBestMatch(name: string, items: InventoryItem[]): InventoryItem | null {
  const lower = name.toLowerCase();
  const exact = items.find(i => i.name.toLowerCase() === lower);
  if (exact) return exact;
  const partial = items.find(
    i => i.name.toLowerCase().includes(lower) || lower.includes(i.name.toLowerCase()),
  );
  return partial ?? null;
}

// ── BillUpload ────────────────────────────────────────────────────────────────

function BillUpload({
  restaurant,
  inventoryItems,
  onDone,
}: {
  restaurant: Restaurant;
  inventoryItems: InventoryItem[];
  onDone: () => void;
}) {
  const t = useT();
  const [stage, setStage]     = useState<'idle' | 'uploading' | 'processing' | 'review' | 'saving' | 'done'>('idle');
  const [error,   setError]   = useState('');
  const [bill,    setBill]    = useState<ExtractedBill | null>(null);
  const [review,  setReview]  = useState<ReviewItem[]>([]);
  const [saved,   setSaved]   = useState(0);
  const [learned, setLearned] = useState(0);
  const [skipList, setSkipList] = useState<Set<string>>(new Set());
  const [history,  setHistory]  = useState<BillHistoryEntry[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load skip list + bill history on mount
  useEffect(() => {
    const u1 = onValue(refs.billSkipList(restaurant.id), snap => {
      setSkipList(snap.exists() ? new Set(Object.keys(snap.val() as Record<string, boolean>)) : new Set());
    }, () => setSkipList(new Set()));
    const u2 = onValue(refs.billHistory(restaurant.id), snap => {
      if (snap.exists()) {
        const arr = Object.entries(snap.val() as Record<string, Omit<BillHistoryEntry, 'id'>>)
          .map(([id, v]) => ({ ...v, id }))
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, 8);
        setHistory(arr);
      } else {
        setHistory([]);
      }
    }, () => setHistory([]));
    return () => { u1(); u2(); };
  }, [restaurant.id]);

  async function handleFile(file: File) {
    setError('');
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
    if (!allowed.includes(file.type)) { setError('Please upload a JPG, PNG, WebP, or PDF file.'); return; }
    if (file.size > 10 * 1024 * 1024) { setError('File is too large. Maximum size is 10 MB.'); return; }

    try {
      setStage('uploading');
      const path = `bills/${restaurant.id}/${Date.now()}_${file.name}`;
      await uploadBytes(storageRef(storage, path), file);

      setStage('processing');
      const fn = httpsCallable<{ storagePath: string; mimeType: string }, ExtractedBill>(firebaseFunctions, 'extractBillItems');
      const { data } = await fn({ storagePath: path, mimeType: file.type });
      setBill(data);

      const items: ReviewItem[] = (data.items ?? []).map(item => {
        const match       = findBestMatch(item.name, inventoryItems);
        const autoSkipped = skipList.has(normalizeSkipKey(item.name));
        return {
          ...item,
          matchedId:   match?.id       ?? null,
          action:      autoSkipped ? 'skip' : 'add_stock',
          newName:     item.name,
          newUnit:     match?.unit     ?? item.unit     ?? 'pcs',
          newCategory: match?.category ?? INV_CATEGORIES[0],
          autoSkipped,
        };
      });
      setReview(items);
      setStage('review');
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message ?? 'Something went wrong. Please try again.');
      setStage('idle');
    }
  }

  async function handleConfirm() {
    setStage('saving');
    let count = 0;
    const toLearn:   string[] = []; // newly skipped (not auto) → save to skip list
    const toUnlearn: string[] = []; // auto-skipped but user included → remove from skip list

    for (const item of review) {
      if (item.action === 'skip') {
        if (!item.autoSkipped) toLearn.push(normalizeSkipKey(item.name));
        continue;
      }
      if (item.autoSkipped) toUnlearn.push(normalizeSkipKey(item.name));
      try {
        if (item.matchedId) {
          const existing = inventoryItems.find(i => i.id === item.matchedId)!;
          await update(refs.inventoryItem(restaurant.id, item.matchedId), {
            currentStock: existing.currentStock + item.quantity,
            lastUpdated:  Date.now(),
          });
        } else {
          await push(refs.inventoryItems(restaurant.id), {
            name:         item.newName.trim(),
            category:     item.newCategory,
            unit:         item.newUnit,
            currentStock: item.quantity,
            minStock:     0,
            ...(item.unitPrice != null ? { unitPrice: item.unitPrice } : {}),
            lastUpdated:  Date.now(),
          });
        }
        count++;
      } catch { /* skip silently */ }
    }

    // Update skip list
    if (toLearn.length > 0 || toUnlearn.length > 0) {
      const updates: Record<string, boolean | null> = {};
      toLearn.forEach(k   => { updates[k] = true; });
      toUnlearn.forEach(k => { updates[k] = null; });
      try { await update(refs.billSkipList(restaurant.id), updates); } catch {}
    }

    // Save to bill history
    try {
      await push(refs.billHistory(restaurant.id), {
        timestamp:      Date.now(),
        supplier:       bill?.supplier      ?? null,
        date:           bill?.date          ?? null,
        invoiceNumber:  bill?.invoiceNumber ?? null,
        total:          bill?.total         ?? null,
        itemsProcessed: count,
        itemsSkipped:   review.filter(i => i.action === 'skip').length,
      });
    } catch {}

    setLearned(toLearn.length);
    setSaved(count);
    setStage('done');
  }

  /* ── Done ── */
  if (stage === 'done') return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
        <CheckCircle2 size={32} className="text-green-500" />
      </div>
      <p className="text-xl font-black text-gray-900 mb-1">{t.doneTitle}</p>
      <p className="text-gray-400 text-sm">
        {saved} {t.doneUpdated}
      </p>
      {learned > 0 && (
        <p className="text-xs text-blue-500 font-medium mt-1">
          🧠 {t.remembered} {learned} {t.learnedNote}
        </p>
      )}
      <button onClick={onDone}
        className="mt-6 bg-orange-500 hover:bg-orange-600 text-white font-black px-6 py-3 rounded-2xl transition-all active:scale-[0.97]">
        {t.backToInventory}
      </button>
    </div>
  );

  /* ── Review ── */
  if (stage === 'review' && bill) {
    const autoSkippedCount = review.filter(i => i.autoSkipped && i.action === 'skip').length;
    return (
      <div>
        {/* Bill summary */}
        <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4 mb-4">
          <p className="font-black text-gray-900 text-sm mb-1.5">{t.billExtracted}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
            {bill.supplier      && <span>📦 {bill.supplier}</span>}
            {bill.date          && <span>📅 {bill.date}</span>}
            {bill.invoiceNumber && <span>#️⃣ {bill.invoiceNumber}</span>}
            {bill.total != null && <span>💶 €{Number(bill.total).toFixed(2)}</span>}
          </div>
        </div>

        {autoSkippedCount > 0 && (
          <div className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-2.5 mb-3 flex items-center gap-2">
            <span className="text-sm">🧠</span>
            <p className="text-xs text-blue-700 font-medium">
              {autoSkippedCount} {t.autoSkippedBanner}
            </p>
          </div>
        )}

        <p className="text-xs font-black text-gray-500 uppercase tracking-widest mb-3">
          {review.length} {t.reviewFound}
        </p>

        <div className="space-y-2.5 mb-6">
          {review.map((item, idx) => {
            const existing = item.matchedId ? inventoryItems.find(i => i.id === item.matchedId) : null;
            return (
              <div key={idx} className={`bg-white rounded-2xl border p-3.5 transition-opacity ${
                item.action === 'skip' ? 'opacity-40 border-gray-100' : 'border-gray-200'
              }`}>
                {/* Header row */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-gray-900 text-sm truncate">{item.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      +{item.quantity} {item.unit}
                      {item.unitPrice != null && ` · €${Number(item.unitPrice).toFixed(2)}/${item.unit}`}
                      {(item.totalPrice != null || item.unitPrice != null) && (
                        <span className="font-black text-gray-600">
                          {' = €'}{(item.totalPrice != null
                            ? Number(item.totalPrice)
                            : item.quantity * Number(item.unitPrice)
                          ).toFixed(2)}
                        </span>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => setReview(prev => prev.map((r, i) =>
                      i === idx ? { ...r, action: r.action === 'skip' ? 'add_stock' : 'skip' } : r
                    ))}
                    className={`flex-shrink-0 text-xs font-black px-2.5 py-1 rounded-full transition-all ${
                      item.action === 'skip' ? 'bg-gray-100 text-gray-400' : 'bg-orange-100 text-orange-600'
                    }`}>
                    {item.action === 'skip' ? (item.autoSkipped ? t.autoSkipBtn : t.skippedBtn) : t.include}
                  </button>
                </div>

                {/* Manual link dropdown — only when including */}
                {item.action === 'add_stock' && (
                  <div className="space-y-1.5">
                    <div className="relative">
                      <select
                        value={item.matchedId ?? ''}
                        onChange={e => {
                          const newId = e.target.value || null;
                          const inv   = newId ? inventoryItems.find(i => i.id === newId) : null;
                          setReview(prev => prev.map((r, i) =>
                            i === idx ? {
                              ...r,
                              matchedId: newId,
                              newUnit:   inv?.unit     ?? r.newUnit,
                              newCategory: inv?.category ?? r.newCategory,
                            } : r
                          ));
                        }}
                        className="w-full text-xs border border-gray-200 rounded-xl px-3 py-2 bg-white outline-none focus:border-orange-400 appearance-none"
                      >
                        <option value="">{t.createNew}</option>
                        {inventoryItems.map(inv => (
                          <option key={inv.id} value={inv.id}>{inv.name} ({inv.unit})</option>
                        ))}
                      </select>
                      <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                    {/* Editable name / unit / category for new items */}
                    {!existing && (
                      <div className="space-y-1.5">
                        <input
                          value={item.newName}
                          onChange={e => setReview(prev => prev.map((r, i) =>
                            i === idx ? { ...r, newName: e.target.value } : r
                          ))}
                          placeholder="Item name"
                          className="w-full text-xs border border-orange-200 rounded-xl px-3 py-2 bg-orange-50 outline-none focus:border-orange-400 font-medium text-gray-800"
                        />
                        <div className="grid grid-cols-2 gap-1.5">
                          <div className="relative">
                            <select value={item.newUnit}
                              onChange={e => setReview(prev => prev.map((r, i) =>
                                i === idx ? { ...r, newUnit: e.target.value } : r
                              ))}
                              className="w-full text-xs border border-gray-200 rounded-xl px-3 py-2 bg-white outline-none focus:border-orange-400 appearance-none">
                              {INV_UNITS.map(u => <option key={u}>{u}</option>)}
                            </select>
                            <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                          </div>
                          <div className="relative">
                            <select value={item.newCategory}
                              onChange={e => setReview(prev => prev.map((r, i) =>
                                i === idx ? { ...r, newCategory: e.target.value } : r
                              ))}
                              className="w-full text-xs border border-gray-200 rounded-xl px-3 py-2 bg-white outline-none focus:border-orange-400 appearance-none">
                              {INV_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                            </select>
                            <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                          </div>
                        </div>
                      </div>
                    )}
                    <div className={`text-xs rounded-xl px-3 py-2 ${existing ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'}`}>
                      {existing
                        ? `→ "${existing.name}": ${existing.currentStock} + ${item.quantity} = ${existing.currentStock + item.quantity} ${existing.unit}`
                        : `→ New item: "${item.newName}" (${item.newUnit} · ${item.newCategory})`}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex gap-3">
          <button onClick={() => setStage('idle')}
            className="flex-1 border-2 border-gray-200 text-gray-600 font-black py-3 rounded-2xl transition-all">
            {t.cancel}
          </button>
          <button
            onClick={handleConfirm}
            disabled={review.every(i => i.action === 'skip')}
            className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white font-black py-3 rounded-2xl transition-all active:scale-[0.97]">
            {t.confirmBtn} {review.filter(i => i.action === 'add_stock').length}
          </button>
        </div>
      </div>
    );
  }

  /* ── Loading ── */
  if (stage === 'uploading' || stage === 'processing' || stage === 'saving') return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4" />
      <p className="font-black text-gray-900">
        {stage === 'uploading' ? t.uploading : stage === 'processing' ? t.processing : t.saving}
      </p>
      {stage === 'processing' && <p className="text-xs text-gray-400 mt-1">{t.processingNote}</p>}
    </div>
  );

  /* ── Idle / upload ── */
  return (
    <div>
      <div
        onClick={() => fileRef.current?.click()}
        className="border-2 border-dashed border-orange-300 rounded-3xl p-10 flex flex-col items-center text-center cursor-pointer hover:border-orange-400 hover:bg-orange-50/40 transition-all active:scale-[0.98]">
        <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center mb-4">
          <Upload size={28} className="text-orange-500" />
        </div>
        <p className="font-black text-gray-900 text-lg mb-1">{t.uploadTitle}</p>
        <p className="text-gray-400 text-sm">{t.uploadSub}</p>
        <p className="text-xs text-gray-300 mt-2">{t.uploadFormats}</p>
      </div>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />

      {error && (
        <div className="mt-4 bg-red-50 border border-red-100 rounded-2xl px-4 py-3 text-sm text-red-600 font-medium">
          {error}
        </div>
      )}

      {skipList.size > 0 && (
        <div className="mt-4 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-2.5 flex items-center gap-2">
          <span className="text-sm">🧠</span>
          <p className="text-xs text-blue-700 font-medium">
            {skipList.size} {t.autoSkippedNote}
          </p>
        </div>
      )}

      {/* Bill history */}
      {history.length > 0 && (
        <div className="mt-5">
          <p className="font-black text-gray-700 text-sm mb-2.5">{t.recentBills}</p>
          <div className="space-y-2">
            {history.map(h => (
              <div key={h.id} className="bg-white rounded-2xl border border-gray-100 p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-orange-50 flex items-center justify-center flex-shrink-0 text-base">
                  🧾
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-gray-900 truncate">
                    {h.supplier ?? t.unknownSupplier}
                  </p>
                  <p className="text-xs text-gray-400">
                    {h.itemsProcessed} {t.billAdded} · {h.itemsSkipped} {t.billSkipped} · {timeAgo(h.timestamp)}
                  </p>
                </div>
                {h.total != null && (
                  <span className="text-xs font-black text-gray-500 flex-shrink-0">€{Number(h.total).toFixed(2)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 bg-gray-50 rounded-2xl p-4">
        <p className="font-black text-gray-700 text-sm mb-2">{t.howItWorks}</p>
        <ol className="space-y-1.5 text-xs text-gray-500">
          <li>{t.hw1}</li>
          <li>{t.hw2}</li>
          <li>{t.hw3}</li>
          <li>{t.hw4}</li>
        </ol>
      </div>
    </div>
  );
}

// ── Bulk Minimum Stock Setup ──────────────────────────────────────────────────

function BulkMinSetup({ restaurantId, items, onClose }: {
  restaurantId: string;
  items: InventoryItem[];
  onClose: () => void;
}) {
  const t = useT();
  const zeroItems = items.filter(i => i.minStock === 0);
  const [mins, setMins] = useState<Record<string, string>>(() =>
    Object.fromEntries(zeroItems.map(i => [i.id, '']))
  );
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await Promise.all(
      zeroItems
        .filter(i => mins[i.id] !== '' && !isNaN(Number(mins[i.id])))
        .map(i => update(refs.inventoryItem(restaurantId, i.id), {
          minStock: parseFloat(mins[i.id]),
          lastUpdated: Date.now(),
        }))
    );
    setSaving(false);
    onClose();
  }

  return (
    <motion.div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div className="bg-white rounded-t-3xl max-h-[88vh] flex flex-col"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 280 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-black text-gray-900">{t.bulkMinTitle}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{zeroItems.length} {t.bulkMinSubtitle}</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-3">
          <p className="text-xs text-gray-400 mb-3">{t.bulkMinNote}</p>
          <div className="space-y-2">
            {zeroItems.map(item => (
              <div key={item.id} className="flex items-center gap-3 bg-gray-50 rounded-2xl px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-gray-900 truncate">{item.name}</p>
                  <p className="text-xs text-gray-400">{item.category} · {item.currentStock} {item.unit} {t.inStock}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={mins[item.id]}
                    onChange={e => setMins(prev => ({ ...prev, [item.id]: e.target.value }))}
                    placeholder="0"
                    className="w-20 border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-right font-black outline-none focus:border-orange-400 transition-colors"
                  />
                  <span className="text-xs text-gray-400 w-8 truncate">{item.unit}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-black py-4 rounded-2xl transition-all active:scale-[0.97]">
            {saving ? t.saving : t.bulkMinSave}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Main Inventory Component ──────────────────────────────────────────────────

function InventoryManager({ restaurant }: { restaurant: Restaurant }) {
  const t = useT();
  const [items, setItems]           = useState<InventoryItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [tab, setTab]               = useState<'items' | 'upload'>('items');
  const [showAdd, setShowAdd]       = useState(false);
  const [editItem, setEditItem]     = useState<InventoryItem | null>(null);
  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null);
  const [deleteId, setDeleteId]       = useState<string | null>(null);
  const [filter, setFilter]           = useState<'all' | 'low' | 'out'>('all');
  const [search, setSearch]           = useState('');
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());
  const [showMinSetup, setShowMinSetup] = useState(false);
  const [showReorder, setShowReorder]     = useState(false);
  const [reorderCopied, setReorderCopied] = useState(false);

  useEffect(() => {
    const unsub = onValue(refs.inventoryItems(restaurant.id), snap => {
      if (snap.exists()) {
        const arr = Object.entries(snap.val() as Record<string, Omit<InventoryItem, 'id'>>)
          .map(([id, v]) => ({ ...v, id }))
          .sort((a, b) => {
            // Sort: out first, then low, then ok; alphabetically within group
            const order = { out: 0, low: 1, ok: 2 };
            const diff = order[getStockStatus(a)] - order[getStockStatus(b)];
            return diff !== 0 ? diff : a.name.localeCompare(b.name);
          });
        setItems(arr);
      } else {
        setItems([]);
      }
      setLoading(false);
    }, () => {
      // Permission denied or other error — stop spinning
      setLoading(false);
    });
    return () => unsub();
  }, [restaurant.id]);

  const outCount = items.filter(i => getStockStatus(i) === 'out').length;
  const lowCount = items.filter(i => getStockStatus(i) === 'low').length;

  const filtered = items.filter(i => {
    if (filter === 'low' && getStockStatus(i) !== 'low') return false;
    if (filter === 'out' && getStockStatus(i) !== 'out') return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q) || (i.supplier ?? '').toLowerCase().includes(q);
    }
    return true;
  });

  // Group filtered items by category
  const grouped = filtered.reduce<Record<string, InventoryItem[]>>((acc, item) => {
    const cat = item.category || 'Uncategorised';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});
  const sortedCategories = Object.keys(grouped).sort();

  // Stats extras
  const trackedItems = items.filter(i => (i.unitPrice ?? 0) > 0);
  const totalValue   = trackedItems.reduce((sum, i) => sum + i.unitPrice! * i.currentStock, 0);
  const reorderItems = items.filter(i => getStockStatus(i) !== 'ok');

  function toggleCat(cat: string) {
    setCollapsedCats(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  }

  async function quickAdjust(item: InventoryItem, delta: number) {
    const newStock = Math.max(0, item.currentStock + delta);
    await update(refs.inventoryItem(restaurant.id, item.id), {
      currentStock: newStock,
      lastUpdated: Date.now(),
    });
  }

  function copyReorderList() {
    const lines = reorderItems.map(i => {
      const st = getStockStatus(i);
      return `${st === 'out' ? '❌' : '⚠️'} ${i.name} — ${i.currentStock} ${i.unit} (min: ${i.minStock} ${i.unit})`;
    });
    const text = `${t.reorderList}:\n${lines.join('\n')}`;
    navigator.clipboard.writeText(text).catch(() => {});
    setReorderCopied(true);
    setTimeout(() => setReorderCopied(false), 2000);
  }

  async function handleDelete(id: string) {
    await remove(refs.inventoryItem(restaurant.id, id));
    setDeleteId(null);
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-black text-gray-900">{t.inventory}</h1>
        <div className="flex items-center gap-2">
          {tab === 'items' && (
            <div className="flex items-center gap-2">
              {reorderItems.length > 0 && (
                <button onClick={() => setShowReorder(true)}
                  className="flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 font-black px-3 py-2.5 rounded-2xl text-sm transition-all active:scale-[0.97]">
                  📋 {reorderItems.length}
                </button>
              )}
              <button onClick={() => setShowAdd(true)}
                className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white font-black px-4 py-2.5 rounded-2xl text-sm transition-all active:scale-[0.97]">
                <Plus size={16} />
                {t.addItem}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 mb-5 bg-gray-100 p-1 rounded-2xl">
        <button
          onClick={() => setTab('items')}
          className={`flex-1 py-2 rounded-xl text-sm font-black transition-all ${
            tab === 'items' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400'
          }`}>
          {t.tabItems}
        </button>
        <button
          onClick={() => setTab('upload')}
          className={`flex-1 py-2 rounded-xl text-sm font-black transition-all ${
            tab === 'upload' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400'
          }`}>
          {t.tabScanBill}
        </button>
      </div>

      {/* Bill upload tab */}
      {tab === 'upload' && (
        <BillUpload
          restaurant={restaurant}
          inventoryItems={items}
          onDone={() => setTab('items')}
        />
      )}

      {tab === 'items' && (<>

      {/* Stats row — 2×2 grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white rounded-2xl p-3 border border-gray-100 shadow-sm text-center">
          <p className="text-2xl font-black text-gray-900">{items.length}</p>
          <p className="text-xs text-gray-400 font-medium mt-0.5">{t.totalItems}</p>
        </div>
        <div className={`rounded-2xl p-3 border shadow-sm text-center ${totalValue > 0 ? 'bg-purple-50 border-purple-100' : 'bg-white border-gray-100'}`}>
          <p className={`text-2xl font-black ${totalValue > 0 ? 'text-purple-600' : 'text-gray-400'}`}>
            {totalValue > 0 ? `€${totalValue.toFixed(0)}` : '—'}
          </p>
          <p className={`text-xs font-medium mt-0.5 ${totalValue > 0 ? 'text-purple-400' : 'text-gray-400'}`}>
            {t.stockValue}
          </p>
        </div>
        <div className={`rounded-2xl p-3 border shadow-sm text-center ${lowCount > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-100'}`}>
          <p className={`text-2xl font-black ${lowCount > 0 ? 'text-amber-600' : 'text-gray-900'}`}>{lowCount}</p>
          <p className={`text-xs font-medium mt-0.5 ${lowCount > 0 ? 'text-amber-500' : 'text-gray-400'}`}>{t.lowStock}</p>
        </div>
        <div className={`rounded-2xl p-3 border shadow-sm text-center ${outCount > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-100'}`}>
          <p className={`text-2xl font-black ${outCount > 0 ? 'text-red-600' : 'text-gray-900'}`}>{outCount}</p>
          <p className={`text-xs font-medium mt-0.5 ${outCount > 0 ? 'text-red-400' : 'text-gray-400'}`}>{t.outOfStock}</p>
        </div>
      </div>

      {/* Bulk min stock banner */}
      {items.filter(i => i.minStock === 0).length > 0 && (
        <button onClick={() => setShowMinSetup(true)}
          className="w-full mb-4 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center gap-3 text-left hover:bg-amber-100 transition-colors">
          <AlertTriangle size={16} className="text-amber-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-amber-800">
              {items.filter(i => i.minStock === 0).length} {t.bulkMinBannerTitle}
            </p>
            <p className="text-xs text-amber-600">{t.bulkMinBannerSub}</p>
          </div>
          <ChevronDown size={14} className="text-amber-400 flex-shrink-0 -rotate-90" />
        </button>
      )}

      {/* Search bar */}
      <div className="relative mb-3">
        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        </div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t.searchPlaceholder}
          className="w-full bg-white border border-gray-200 rounded-2xl pl-10 pr-4 py-2.5 text-sm text-gray-900 outline-none focus:border-orange-400 transition-colors"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        {(['all', 'low', 'out'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-full text-sm font-black transition-all ${
              filter === f ? 'bg-orange-500 text-white shadow-sm' : 'bg-gray-100 text-gray-500'
            }`}>
            {f === 'all' ? t.filterAll : f === 'low' ? `${t.filterLow}${lowCount > 0 ? ` (${lowCount})` : ''}` : `${t.filterOut}${outCount > 0 ? ` (${outCount})` : ''}`}
          </button>
        ))}
        {search && (
          <span className="ml-auto text-xs text-gray-400 self-center">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="text-center py-16">
          <Boxes size={48} className="mx-auto text-gray-200 mb-3" />
          <p className="font-black text-gray-400">
            {search ? `${t.noMatchSearch} "${search}"` : filter === 'all' ? t.noItemsYet : `${filter === 'low' ? t.statusLow : t.statusOut}`}
          </p>
          {!search && filter === 'all' && (
            <button onClick={() => setShowAdd(true)} className="mt-4 text-orange-500 font-black text-sm">
              {t.addFirstItem}
            </button>
          )}
        </div>
      )}

      {/* Grouped by category */}
      <div className="space-y-3">
        {sortedCategories.map(cat => {
          const catItems = grouped[cat];
          const catLow  = catItems.filter(i => getStockStatus(i) === 'low').length;
          const catOut  = catItems.filter(i => getStockStatus(i) === 'out').length;
          const isCollapsed = collapsedCats.has(cat);

          return (
            <div key={cat} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Category header — tap to collapse */}
              <button
                onClick={() => toggleCat(cat)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                <ChevronDown size={16} className={`text-gray-400 transition-transform flex-shrink-0 ${isCollapsed ? '-rotate-90' : ''}`} />
                <span className="font-black text-gray-800 text-sm flex-1 text-left">{cat}</span>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {catOut > 0 && (
                    <span className="text-[10px] font-black bg-red-50 text-red-600 px-2 py-0.5 rounded-full">
                      {catOut} {t.catOut}
                    </span>
                  )}
                  {catLow > 0 && (
                    <span className="text-[10px] font-black bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full">
                      {catLow} {t.catLow}
                    </span>
                  )}
                  <span className="text-[10px] text-gray-400 font-medium">{catItems.length} item{catItems.length !== 1 ? 's' : ''}</span>
                </div>
              </button>

              {/* Items inside category */}
              {!isCollapsed && (
                <div className="divide-y divide-gray-50">
                  {catItems.map(item => {
                    const status = getStockStatus(item);
                    return (
                      <div key={item.id} className="px-4 py-3">
                        <div className="flex items-start gap-3">
                          <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                            status === 'out' ? 'bg-red-500' : status === 'low' ? 'bg-amber-400' : 'bg-green-500'
                          }`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-black text-gray-900 text-sm truncate">{item.name}</p>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <button onClick={() => setAdjustItem(item)}
                                  className="w-7 h-7 rounded-lg bg-orange-50 flex items-center justify-center hover:bg-orange-100 transition-colors"
                                  title="Adjust stock">
                                  <SlidersHorizontal size={13} className="text-orange-500" />
                                </button>
                                <button onClick={() => setEditItem(item)}
                                  className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
                                  title="Edit item">
                                  <Pencil size={12} className="text-gray-500" />
                                </button>
                                <button onClick={() => setDeleteId(item.id)}
                                  className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-red-50 transition-colors"
                                  title="Delete item">
                                  <Trash2 size={12} className="text-gray-400 hover:text-red-500" />
                                </button>
                              </div>
                            </div>
                            <div className="flex items-center justify-between text-xs mt-1 mb-1.5">
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => quickAdjust(item, -1)}
                                  className="w-5 h-5 rounded-full bg-red-50 text-red-500 font-black flex items-center justify-center hover:bg-red-100 transition-colors leading-none"
                                  title="-1">−</button>
                                <span className={`font-black ${status === 'out' ? 'text-red-500' : status === 'low' ? 'text-amber-500' : 'text-green-600'}`}>
                                  {item.currentStock} {item.unit}
                                </span>
                                <button
                                  onClick={() => quickAdjust(item, +1)}
                                  className="w-5 h-5 rounded-full bg-green-50 text-green-600 font-black flex items-center justify-center hover:bg-green-100 transition-colors leading-none"
                                  title="+1">+</button>
                              </div>
                              <span className="text-gray-400">{t.minLabel} {item.minStock} {item.unit}</span>
                            </div>
                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all ${
                                status === 'out' ? 'bg-red-400' : status === 'low' ? 'bg-amber-400' : 'bg-green-400'
                              }`} style={{
                                width: item.minStock > 0
                                  ? `${Math.min(100, (item.currentStock / (item.minStock * 3)) * 100)}%`
                                  : item.currentStock > 0 ? '100%' : '0%'
                              }} />
                            </div>
                            <div className="flex items-center gap-2 mt-1.5">
                              {status !== 'ok' ? (
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black ${
                                  status === 'out' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
                                }`}>
                                  <AlertTriangle size={8} />
                                  {status === 'out' ? t.statusOut : t.statusLow}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-green-50 text-green-600">
                                  <CheckCircle2 size={8} />
                                  {t.statusInStock}
                                </span>
                              )}
                              <span className="text-[10px] text-gray-400 ml-auto">{timeAgo(item.lastUpdated)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Reorder List modal */}
      <AnimatePresence>
        {showReorder && (
          <motion.div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setShowReorder(false)}
          >
            <motion.div className="bg-white rounded-t-3xl max-h-[88vh] flex flex-col"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 280 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100">
                <div>
                  <h2 className="text-lg font-black text-gray-900">📋 {t.reorderList}</h2>
                  <p className="text-xs text-gray-400 mt-0.5">{reorderItems.length} items</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={copyReorderList}
                    className={`text-xs font-black px-3 py-2 rounded-xl transition-all ${
                      reorderCopied ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}>
                    {reorderCopied ? t.reorderCopied : t.reorderCopy}
                  </button>
                  <button onClick={() => setShowReorder(false)}
                    className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
                    <X size={18} className="text-gray-500" />
                  </button>
                </div>
              </div>
              <div className="overflow-y-auto flex-1 px-5 py-4">
                {reorderItems.length === 0 ? (
                  <p className="text-center text-gray-400 py-10">{t.reorderEmpty}</p>
                ) : (
                  <div className="space-y-2">
                    {reorderItems.map(item => {
                      const st = getStockStatus(item);
                      return (
                        <div key={item.id} className={`flex items-center gap-3 rounded-2xl px-4 py-3 ${
                          st === 'out' ? 'bg-red-50 border border-red-100' : 'bg-amber-50 border border-amber-100'
                        }`}>
                          <span className="text-lg flex-shrink-0">{st === 'out' ? '❌' : '⚠️'}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-black text-gray-900 truncate">{item.name}</p>
                            <p className="text-xs text-gray-500">
                              {item.currentStock} {item.unit} · min: {item.minStock} {item.unit}
                            </p>
                          </div>
                          <div className="flex-shrink-0 text-right">
                            <p className={`text-sm font-black ${st === 'out' ? 'text-red-600' : 'text-amber-600'}`}>
                              {st === 'out' ? t.statusOut : t.statusLow}
                            </p>
                            {item.supplier && (
                              <p className="text-[10px] text-gray-400 truncate max-w-[80px]">{item.supplier}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="px-5 py-4 border-t border-gray-100">
                <button onClick={copyReorderList}
                  className={`w-full font-black py-4 rounded-2xl transition-all active:scale-[0.97] ${
                    reorderCopied ? 'bg-green-500 text-white' : 'bg-orange-500 hover:bg-orange-600 text-white'
                  }`}>
                  {reorderCopied ? t.reorderCopied : `📋 ${t.reorderCopy}`}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete confirm */}
      <AnimatePresence>
        {deleteId && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <motion.div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-xl"
              initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
            >
              <h3 className="text-lg font-black text-gray-900 mb-2">{t.deleteItemTitle}</h3>
              <p className="text-sm text-gray-500 mb-5">{t.deleteItemMsg}</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteId(null)}
                  className="flex-1 border-2 border-gray-200 text-gray-700 font-black py-3 rounded-2xl">
                  {t.cancel}
                </button>
                <button onClick={() => handleDelete(deleteId)}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white font-black py-3 rounded-2xl transition-all">
                  {t.delete}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals */}
      <AnimatePresence>
        {showAdd && (
          <ItemModal restaurantId={restaurant.id} onClose={() => setShowAdd(false)} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {editItem && (
          <ItemModal restaurantId={restaurant.id} item={editItem} onClose={() => setEditItem(null)} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {adjustItem && (
          <AdjustModal restaurantId={restaurant.id} item={adjustItem} onClose={() => setAdjustItem(null)} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showMinSetup && (
          <BulkMinSetup restaurantId={restaurant.id} items={items} onClose={() => setShowMinSetup(false)} />
        )}
      </AnimatePresence>
      </>)}
    </div>
  );
}

// ─── Admin Shell ──────────────────────────────────────────────────────────────

const NAV = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '' },
  { icon: UtensilsCrossed, label: 'Menu',      path: 'menu' },
  { icon: Boxes,           label: 'Inventory', path: 'inventory' },
  { icon: Package,         label: 'Orders',    path: 'orders' },
  { icon: BarChart2,       label: 'Analytics', path: 'analytics' },
  { icon: QrCode,          label: 'QR',        path: 'qr' },
  { icon: Settings,        label: 'Settings',  path: 'settings' },
];

function AdminShell() {
  const [restaurant, loading] = useRestaurantForUser();
  const location = useLocation();
  const processingOrders = useRef(new Set<string>());
  const [lang, setLang] = useState<AdminLang>(() =>
    (localStorage.getItem('admin.lang') as AdminLang) ?? 'en'
  );
  function toggleLang() {
    const next: AdminLang = lang === 'en' ? 'sl' : 'en';
    localStorage.setItem('admin.lang', next);
    setLang(next);
  }
  const t = adminT[lang];

  // ── Auto stock deduction ──────────────────────────────────────────────────
  // Runs in the background: whenever an order reaches "preparing" status and
  // hasn't been deducted yet, subtract the menu item ingredients from inventory.
  useEffect(() => {
    if (!restaurant) return;

    const unsub = onValue(refs.restaurantOrders(restaurant.id), async (snap) => {
      snap.forEach((orderSnap) => {
        const order = { id: orderSnap.key!, ...orderSnap.val() } as Order & { inventoryDeducted?: boolean };
        if (order.status !== 'preparing') return;
        if (order.inventoryDeducted) return;
        if (processingOrders.current.has(order.id)) return;

        processingOrders.current.add(order.id);

        (async () => {
          try {
            const cartItems = JSON.parse(order.items) as Array<{ id: string; quantity: number }>;
            const menuSnap = await get(refs.menu(restaurant.id));
            if (!menuSnap.exists()) return;
            const menu = menuSnap.val() as Record<string, { ingredients?: Record<string, number> }>;

            // Accumulate total deductions across all cart items
            const deductions: Record<string, number> = {};
            for (const cartItem of cartItems) {
              const menuItem = menu[cartItem.id];
              if (!menuItem?.ingredients) continue;
              for (const [invId, qtyPerServing] of Object.entries(menuItem.ingredients)) {
                deductions[invId] = (deductions[invId] ?? 0) + qtyPerServing * cartItem.quantity;
              }
            }

            // Apply deductions atomically
            await Promise.all(
              Object.entries(deductions).map(([invId, totalQty]) =>
                runTransaction(refs.inventoryItem(restaurant.id, invId), (current) => {
                  if (!current) return current;
                  return {
                    ...current,
                    currentStock: Math.max(0, (current.currentStock as number) - totalQty),
                    lastUpdated: Date.now(),
                  };
                }),
              ),
            );

            // Mark order so we never deduct twice
            await update(refs.order(order.id), { inventoryDeducted: true });
          } catch (err) {
            processingOrders.current.delete(order.id); // allow retry next tick
            console.error('[inventory] deduction failed for order', order.id, err);
          }
        })();
      });
    });

    return () => unsub();
  }, [restaurant?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Map the sub-route under /admin to a human-readable section label.
  const SECTION_TITLES: Record<string, string> = {
    '/admin':            'Dashboard',
    '/admin/menu':       'Menu',
    '/admin/inventory':  'Inventory',
    '/admin/orders':     'Orders',
    '/admin/analytics':  'Analytics',
    '/admin/qr':         'QR Codes',
    '/admin/settings':   'Settings',
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
        <div className="flex items-center gap-2">
          <button onClick={toggleLang}
            className="text-xs font-black px-2.5 py-1.5 rounded-full border border-gray-200 text-gray-500 hover:border-orange-300 hover:text-orange-500 transition-colors">
            {lang === 'en' ? '🇸🇮 SLO' : '🇬🇧 ENG'}
          </button>
          <button onClick={handleLogout} aria-label="Sign out" className="p-2 text-gray-400 hover:text-gray-700">
            <LogOut size={18} />
          </button>
        </div>
      </div>

      {/* Content */}
      <AdminLangCtx.Provider value={lang}>
      <div className="flex-1 overflow-y-auto p-4 pb-24 max-w-2xl mx-auto w-full">
        <Routes>
          <Route index element={<Dashboard restaurant={restaurant} />} />
          <Route path="menu"      element={<MenuManager        restaurant={restaurant} />} />
          <Route path="inventory" element={<InventoryManager   restaurant={restaurant} />} />
          <Route path="orders"    element={<OrdersHistory      restaurant={restaurant} />} />
          <Route path="analytics" element={<AnalyticsDashboard restaurant={restaurant} />} />
          <Route path="qr"        element={<QRGenerator        restaurant={restaurant} />} />
          <Route path="settings"  element={<SettingsPanel      restaurant={restaurant} />} />
        </Routes>
      </div>

      {/* Bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 flex justify-around px-2 py-2 z-10">
        {NAV.map((item) => {
          const label = item.path === ''        ? t.navDashboard
                      : item.path === 'menu'     ? t.navMenu
                      : item.path === 'inventory'? t.navInventory
                      : item.path === 'orders'   ? t.navOrders
                      : item.path === 'analytics'? t.navAnalytics
                      : item.path === 'qr'       ? t.navQR
                      : t.navSettings;
          return (
            <NavLink key={item.path} to={`/admin/${item.path}`} end={item.path === ''}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl transition-colors ${isActive ? 'text-orange-500' : 'text-gray-400'}`
              }>
              <item.icon size={20} />
              <span className="text-xs font-medium">{label}</span>
            </NavLink>
          );
        })}
      </div>
      </AdminLangCtx.Provider>
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
