import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';

admin.initializeApp();
const db = admin.database();

// Set STRIPE_SECRET_KEY in Firebase config:
//   firebase functions:config:set stripe.secret="sk_live_..."

// POST /createCheckoutSession
// Body: { restaurantId, orderId, items, tableNumber, successUrl, cancelUrl }
export const createCheckoutSession = functions.https.onCall(async (data) => {
  const { restaurantId, orderId, items, tableNumber, successUrl, cancelUrl } = data as {
    restaurantId: string;
    orderId: string;
    items: Array<{ name: string; price: number; quantity: number }>;
    tableNumber: number | null;
    successUrl: string;
    cancelUrl: string;
  };

  if (!restaurantId || !orderId || !items?.length) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  // Load restaurant settings to see if they configured a custom Stripe key
  const restaurantSnap = await db.ref(`restaurants/${restaurantId}`).get();
  if (!restaurantSnap.exists()) {
    throw new functions.https.HttpsError('not-found', 'Restaurant not found');
  }
  const restaurant = restaurantSnap.val();

  // Dynamically load the secret key, falling back to the global environment configuration
  const secretKey = restaurant.stripeSecretKey || functions.config().stripe?.secret || process.env.STRIPE_SECRET_KEY || '';
  if (!secretKey) {
    throw new functions.https.HttpsError('failed-precondition', 'Stripe secret key not configured on platform or restaurant');
  }

  const activeStripe = new Stripe(secretKey, {
    apiVersion: '2024-06-20',
  });

  const lineItems = items.map((item) => ({
    price_data: {
      currency: 'eur',
      product_data: {
        name: item.name,
        ...(tableNumber != null ? { description: `Table ${tableNumber}` } : {}),
      },
      unit_amount: Math.round(item.price * 100),
    },
    quantity: item.quantity,
  }));

  const session = await activeStripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: lineItems,
    mode: 'payment',
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: orderId,
    metadata: { restaurantId, tableNumber: String(tableNumber) },
    payment_intent_data: {
      metadata: { restaurantId, tableNumber: String(tableNumber) },
    },
  });

  return { url: session.url, sessionId: session.id };
});

// Stripe webhook — confirms payment and updates order status
export const stripeWebhook = functions.https.onRequest(async (req, res) => {
  const sig = req.headers['stripe-signature'] as string;
  const restaurantId = req.query.r as string | undefined;

  let secretKey = functions.config().stripe?.secret ?? process.env.STRIPE_SECRET_KEY ?? '';
  let webhookSecret = functions.config().stripe?.webhook_secret ?? process.env.STRIPE_WEBHOOK_SECRET ?? '';

  if (restaurantId) {
    try {
      const restaurantSnap = await db.ref(`restaurants/${restaurantId}`).get();
      if (restaurantSnap.exists()) {
        const restaurant = restaurantSnap.val();
        if (restaurant.stripeSecretKey && restaurant.stripeWebhookSecret) {
          secretKey = restaurant.stripeSecretKey;
          webhookSecret = restaurant.stripeWebhookSecret;
        }
      }
    } catch (err) {
      console.error(`Error loading restaurant keys for ID ${restaurantId}:`, err);
    }
  }

  if (!secretKey || !webhookSecret) {
    res.status(400).send('Webhook Error: Stripe credentials are not configured');
    return;
  }

  const activeStripe = new Stripe(secretKey, {
    apiVersion: '2024-06-20',
  });

  let event: Stripe.Event;
  try {
    event = activeStripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
  } catch (err) {
    res.status(400).send(`Webhook Error: ${(err as Error).message}`);
    return;
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = session.client_reference_id;
    if (orderId) {
      await db.ref(`orders/${orderId}`).update({
        paymentStatus: 'paid',
        paidAt: Date.now(),
        status: 'new',
        stripeSessionId: session.id,
      });
    }
  }

  res.json({ received: true });
});
