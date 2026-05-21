import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';

admin.initializeApp();
const db = admin.database();

// Set STRIPE_SECRET_KEY in Firebase config:
//   firebase functions:config:set stripe.secret="sk_live_..."
const stripe = new Stripe(functions.config().stripe?.secret ?? process.env.STRIPE_SECRET_KEY ?? '', {
  apiVersion: '2024-04-10',
});

// POST /createCheckoutSession
// Body: { restaurantId, orderId (pre-created), items, tableNumber, successUrl, cancelUrl }
export const createCheckoutSession = functions.https.onCall(async (data) => {
  const { restaurantId, items, tableNumber, successUrl, cancelUrl } = data as {
    restaurantId: string;
    items: Array<{ name: string; price: number; quantity: number }>;
    tableNumber: number | null;
    successUrl: string;
    cancelUrl: string;
  };

  if (!restaurantId || !items?.length) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

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

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: lineItems,
    mode: 'payment',
    success_url: successUrl,
    cancel_url: cancelUrl,
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
  const webhookSecret = functions.config().stripe?.webhook_secret ?? process.env.STRIPE_WEBHOOK_SECRET ?? '';

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
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
