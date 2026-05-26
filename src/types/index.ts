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
  tags?: string[];   // dietary flags: 'vegetarian'|'vegan'|'spicy'|'gluten-free'|'dairy-free'|'halal'
  modifierGroups?: Record<string, Omit<ModifierGroup, 'id'>>;
}

export interface Restaurant {
  id: string;
  name: string;
  logo: string;
  logoBase64?: string;   // compressed thumbnail data URL, used for canvas/QR cards
  heroImage?: string;
  active: boolean;
  tables: number;
  kitchenPin: string;
  adminEmail: string;
  categories: string[];
  menu: Record<string, Omit<MenuItem, 'id'>>;
  stripeSecretKey?: string;
  stripePublishableKey?: string;
  stripeWebhookSecret?: string;
}

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image: string;
  modifiers?: string;
  note?: string;     // per-item kitchen note
}

export interface OrderReview {
  rating: number;   // 1–5
  comment: string;
  timestamp: number;
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
  review?: OrderReview;
}
