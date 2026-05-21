import { initializeApp } from 'firebase/app';
import { getDatabase, ref, push, set, get, update, onValue, runTransaction, query, orderByChild, equalTo } from 'firebase/database';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';
import type { Order, Restaurant } from '../types';

// Replace with your Firebase project config
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const firebaseFunctions = getFunctions(app);

export const refs = {
  restaurants: () => ref(db, 'restaurants'),
  restaurant: (id: string) => ref(db, `restaurants/${id}`),
  menu: (restaurantId: string) => ref(db, `restaurants/${restaurantId}/menu`),
  menuItem: (restaurantId: string, itemId: string) => ref(db, `restaurants/${restaurantId}/menu/${itemId}`),
  orders: () => ref(db, 'orders'),
  order: (id: string) => ref(db, `orders/${id}`),
  orderField: (id: string, field: string) => ref(db, `orders/${id}/${field}`),
  restaurantOrders: (restaurantId: string) => query(ref(db, 'orders'), orderByChild('restaurantId'), equalTo(restaurantId)),
  restaurantCounter: (restaurantId: string) => ref(db, `restaurant_counters/${restaurantId}`),
};

export async function placeOrder(
  order: Omit<Order, 'id' | 'orderNumber'>,
): Promise<{ orderId: string; orderNumber: number }> {
  const counterRef = refs.restaurantCounter(order.restaurantId);
  const result = await runTransaction(counterRef, (current) => ((current ?? 0) % 999) + 1);
  const orderNumber = result.snapshot.val() as number;

  const orderId = push(refs.orders()).key!;
  await set(ref(db, `orders/${orderId}`), { ...order, id: orderId, orderNumber });
  return { orderId, orderNumber };
}

export async function updateOrderStatus(orderId: string, status: Order['status']) {
  await update(ref(db, `orders/${orderId}`), { status });
}

export async function getRestaurant(id: string): Promise<Restaurant | null> {
  const snap = await get(refs.restaurant(id));
  if (!snap.exists()) return null;
  return { id, ...snap.val() } as Restaurant;
}

export { onValue, get, set, update, push, ref, runTransaction };
