import { httpsCallable } from 'firebase/functions';
import { firebaseFunctions } from './firebase';

interface CheckoutSessionArgs {
  restaurantId: string;
  orderId: string;
  items: Array<{ name: string; price: number; quantity: number }>;
  tableNumber: number | null;
  successUrl: string;
  cancelUrl: string;
}

interface CheckoutSessionResult {
  url: string;
  sessionId: string;
}

export async function createCheckoutSession(args: CheckoutSessionArgs): Promise<CheckoutSessionResult> {
  const fn = httpsCallable<CheckoutSessionArgs, CheckoutSessionResult>(
    firebaseFunctions,
    'createCheckoutSession',
  );
  const result = await fn(args);
  return result.data;
}
