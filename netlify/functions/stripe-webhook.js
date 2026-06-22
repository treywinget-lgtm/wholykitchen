/* ===== WholyKitchen — Stripe webhook → Shippo order =====
   Netlify serverless function.
   Stripe calls this after a customer pays (checkout.session.completed).
   We verify the signature, rebuild the order from the session metadata +
   trusted catalog, and create a Shippo Order so it's ready to label.

   Env vars required (Netlify -> Site configuration -> Environment variables):
     STRIPE_SECRET_KEY     = sk_live_... (or sk_test_ while testing)
     STRIPE_WEBHOOK_SECRET = whsec_...   (from the Stripe webhook endpoint)
     SHIPPO_API_TOKEN      = shippo_live_... (same token used for rates)
*/

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { CATALOG } = require('../lib/config');
const { createShippoOrder } = require('../lib/shippo-orders');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return { statusCode: 500, body: 'Missing STRIPE_WEBHOOK_SECRET' };
  }

  const sig = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];
  // Stripe signature verification needs the EXACT raw body.
  const rawBody = event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body;

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return { statusCode: 400, body: 'Invalid signature' };
  }

  // Only act on completed checkouts; acknowledge everything else.
  if (stripeEvent.type !== 'checkout.session.completed') {
    return { statusCode: 200, body: 'ignored' };
  }

  const session = stripeEvent.data.object;
  const md = session.metadata || {};

  try {
    let cart = [];
    try { cart = JSON.parse(md.cart || '[]'); } catch (e) { cart = []; }

    const line_items = [];
    let subtotalCents = 0;
    let totalWeightOz = 0;
    for (const it of cart) {
      const p = CATALOG[it && it.id];
      if (!p) continue;
      let qty = parseInt(it.qty, 10);
      if (!Number.isFinite(qty) || qty < 1) qty = 1;
      const lineCents = p.price * qty;
      subtotalCents += lineCents;
      totalWeightOz += p.weightOz * qty;
      line_items.push({
        title: p.name,
        sku: it.id,
        quantity: qty,
        total_price: (lineCents / 100).toFixed(2),
        currency: 'USD',
        weight: String(p.weightOz),
        weight_unit: 'oz',
      });
    }

    const cust = session.customer_details || {};
    const rateCents = parseInt(md.rate_cents, 10) || 0;
    const totalCents = subtotalCents + rateCents;
    const placedAt = new Date((session.created ? session.created * 1000 : Date.now())).toISOString();

    const order = {
      to_address: {
        name:    md.ship_name || cust.name || 'Customer',
        street1: md.ship_street1 || '',
        street2: md.ship_street2 || '',
        city:    md.ship_city || '',
        state:   md.ship_state || '',
        zip:     md.ship_zip || '',
        country: 'US',
        email:   cust.email || '',
        phone:   cust.phone || '',
      },
      line_items,
      placed_at: placedAt,
      order_number: session.id,
      order_status: 'PAID',
      shipping_cost: (rateCents / 100).toFixed(2),
      shipping_cost_currency: 'USD',
      shipping_method: md.rate_label || 'Shipping',
      subtotal_price: (subtotalCents / 100).toFixed(2),
      total_price: (totalCents / 100).toFixed(2),
      total_tax: '0.00',
      currency: 'USD',
      weight: String(totalWeightOz),
      weight_unit: 'oz',
    };

    await createShippoOrder(order);
    return { statusCode: 200, body: 'Shippo order created' };
  } catch (err) {
    console.error('Failed to create Shippo order:', err);
    // Return 500 so Stripe retries on transient failures. The payment itself
    // is unaffected — it's safely recorded in Stripe regardless.
    return { statusCode: 500, body: 'Could not create Shippo order' };
  }
};
