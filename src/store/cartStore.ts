import { create } from 'zustand';
import type { CartItem } from '../types';

interface CartStore {
  items: CartItem[];
  restaurantId: string | null;
  tableNumber: number | null;
  addItem: (item: CartItem) => void;
  removeItem: (id: string) => void;
  changeQty: (id: string, delta: number) => void;
  clearCart: () => void;
  setContext: (restaurantId: string, tableNumber: number | null) => void;
  total: () => number;
  totalFormatted: () => string;
  itemCount: () => number;
  itemsReadable: () => string;
}

export const useCartStore = create<CartStore>((set, get) => ({
  items: [],
  restaurantId: null,
  tableNumber: null,

  addItem: (item) =>
    set((state) => {
      const existing = state.items.find((i) => i.id === item.id);
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i,
          ),
        };
      }
      return { items: [...state.items, item] };
    }),

  removeItem: (id) =>
    set((state) => ({ items: state.items.filter((i) => i.id !== id) })),

  changeQty: (id, delta) =>
    set((state) => {
      const updated = state.items
        .map((i) => (i.id === id ? { ...i, quantity: i.quantity + delta } : i))
        .filter((i) => i.quantity > 0);
      return { items: updated };
    }),

  clearCart: () => set({ items: [] }),

  setContext: (restaurantId, tableNumber) => set({ restaurantId, tableNumber }),

  total: () => get().items.reduce((sum, i) => sum + i.price * i.quantity, 0),

  totalFormatted: () => `€${get().total().toFixed(2)}`,

  itemCount: () => get().items.reduce((sum, i) => sum + i.quantity, 0),

  itemsReadable: () =>
    get()
      .items.map((i) => `${i.quantity}x ${i.name}`)
      .join(', '),
}));
