export type OrderStatus = 'new' | 'preparing' | 'ready' | 'done' | 'cancelled';
export type PaymentType = 'cash' | 'card';

export interface ModifierOption {
  id: string;
  name: string;
  price: number;
}

export interface ModifierGroup {
  id: string;
  name: string;
  required: boolean;
  min: number;
  max: number;
  options: Record<string, Omit<ModifierOption, 'id'>>;
}

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  image: string;
  available: boolean;
  description?: string;
  category: string;
  popular?: boolean;
  modifierGroups?: Record<string, Omit<ModifierGroup, 'id'>>;
}

export interface Restaurant {
  id: string;
  name: string;
  logo: string;
  active: boolean;
  tables: number;
  kitchenPin: string;
  adminEmail: string;
  categories: string[];
  menu: Record<string, Omit<MenuItem, 'id'>>;
  stripeSecretKey?: string;
  stripePublishableKey?: string;
  stripeWebhookSecret?: string;

  // ─── Customer-facing trust signals (all optional; existing data unaffected)
  /** Hero cover photo shown at the top of the customer order page. */
  coverImage?: string;
  /** Short tagline / pitch line shown under the restaurant name. 1-2 sentences. */
  description?: string;
  /** Street address — rendered as a "map" link to the user's default maps app. */
  address?: string;
  /** Public phone — rendered as a "tap to call" link. Distinct from kitchenPin. */
  phone?: string;
  /** Free-form opening hours, e.g. "Mon-Fri 10:00-22:00 · Sat-Sun 11:00-23:00". */
  hours?: string;
}

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image: string;
  modifiers?: string;
}

export interface Order {
  id: string;
  restaurantId: string;
  restaurantName: string;
  tableNumber: number | null;
  customerName: string;
  customerPhone?: string;
  items: string;
  itemsReadable: string;
  totalPrice: number;
  paymentType: PaymentType;
  status: OrderStatus;
  orderNumber: number;
  note?: string;
  timestamp: number;
  stripeSessionId?: string;
  paymentStatus?: string;
  paidAt?: number;
}
