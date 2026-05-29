import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';

admin.initializeApp();
const db = admin.database();

// ─── Configuration helpers ────────────────────────────────────────────────────
//
// All secrets are stored in the Firebase Realtime Database (admin SDK reads
// bypass security rules — clients cannot access these paths).
//
// Platform-level keys live at:   /platform/anthropicKey
// Per-restaurant Stripe keys at: /restaurants/{id}/stripeSecretKey  (already there)
//
// To set the Anthropic key, write it to /platform/anthropicKey via the
// Firebase Console → Realtime Database, or use the Admin Settings UI.

async function getAnthropicKey(): Promise<string> {
  const snap = await db.ref('platform/anthropicKey').get();
  return snap.exists() ? String(snap.val()) : '';
}

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ── createCheckoutSession ─────────────────────────────────────────────────────

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

  const restaurantSnap = await db.ref(`restaurants/${restaurantId}`).get();
  if (!restaurantSnap.exists()) {
    throw new functions.https.HttpsError('not-found', 'Restaurant not found');
  }
  const restaurant = restaurantSnap.val() as { stripeSecretKey?: string };

  const secretKey = restaurant.stripeSecretKey ?? '';
  if (!secretKey) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Stripe secret key not configured for this restaurant',
    );
  }

  const activeStripe = new Stripe(secretKey, { apiVersion: '2024-06-20' });

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
    payment_intent_data: { metadata: { restaurantId, tableNumber: String(tableNumber) } },
  });

  return { url: session.url, sessionId: session.id };
});

// ── stripeWebhook ─────────────────────────────────────────────────────────────

export const stripeWebhook = functions.https.onRequest(async (req, res) => {
  const sig = req.headers['stripe-signature'] as string;
  const restaurantId = req.query.r as string | undefined;

  let secretKey = '';
  let webhookSecret = '';

  if (restaurantId) {
    try {
      const restaurantSnap = await db.ref(`restaurants/${restaurantId}`).get();
      if (restaurantSnap.exists()) {
        const r = restaurantSnap.val() as {
          stripeSecretKey?: string;
          stripeWebhookSecret?: string;
        };
        secretKey     = r.stripeSecretKey     ?? '';
        webhookSecret = r.stripeWebhookSecret ?? '';
      }
    } catch (err) {
      console.error(`Error loading restaurant keys for ID ${restaurantId}:`, err);
    }
  }

  if (!secretKey || !webhookSecret) {
    res.status(400).send('Webhook Error: Stripe credentials are not configured for this restaurant');
    return;
  }

  const activeStripe = new Stripe(secretKey, { apiVersion: '2024-06-20' });

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

// ── extractBillItems ──────────────────────────────────────────────────────────
// Reads a supplier invoice (image or PDF) from Firebase Storage using Claude AI
// and returns the parsed list of items + bill metadata.
//
// To enable AI scanning, store your Anthropic API key in the Firebase Realtime
// Database at /platform/anthropicKey  (Firebase Console → Realtime Database).
//
export const extractBillItems = functions
  .runWith({ timeoutSeconds: 120, memory: '512MB' })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }

    const apiKey = await getAnthropicKey();
    if (!apiKey) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Anthropic API key not configured. Add it to /platform/anthropicKey in the Firebase Realtime Database.',
      );
    }

    const { storagePath, mimeType } = data as { storagePath: string; mimeType: string };
    if (!storagePath || !mimeType) {
      throw new functions.https.HttpsError('invalid-argument', 'storagePath and mimeType are required');
    }

    // Download the file from Firebase Storage
    const bucket = admin.storage().bucket();
    const [fileBuffer] = await bucket.file(storagePath).download();
    const base64Data = fileBuffer.toString('base64');

    const isPDF = mimeType === 'application/pdf';
    const fileBlock = isPDF
      ? { type: 'document', source: { type: 'base64', media_type: mimeType, data: base64Data } }
      : { type: 'image',    source: { type: 'base64', media_type: mimeType, data: base64Data } };

    const systemPrompt = `You are an expert at reading supplier delivery notes and invoices.
Extract every line item and return ONLY a valid JSON object — no markdown fences, no explanation.

Required JSON shape:
{
  "supplier": string | null,
  "date": string | null,
  "invoiceNumber": string | null,
  "total": number | null,
  "items": [
    {
      "name": string,
      "quantity": number,
      "unit": string,
      "unitPrice": number | null,
      "totalPrice": number | null
    }
  ]
}

Rules:
- Include EVERY line item, even if some fields are missing.
- quantity and unitPrice must be numbers, never strings.
- Use the original item names from the document.
- If a field is absent, use null.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2048,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: [
              fileBlock,
              { type: 'text', text: 'Extract all items from this supplier bill.' },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Claude API error:', response.status, errText);
      throw new functions.https.HttpsError('internal', `AI service error (${response.status}). Please try again.`);
    }

    const claudeResult = await response.json() as {
      content: Array<{ type: string; text: string }>;
    };
    const rawText = claudeResult.content?.find(c => c.type === 'text')?.text ?? '';

    let parsed: ExtractedBill;
    try {
      const clean = rawText.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim();
      parsed = JSON.parse(clean) as ExtractedBill;
    } catch {
      console.error('Failed to parse Claude response:', rawText);
      throw new functions.https.HttpsError('internal', 'Could not parse AI response. Please try a clearer image.');
    }

    return parsed;
  });
