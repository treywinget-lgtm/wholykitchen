/* ===== WholyKitchen - Create Stripe Checkout Session =====
   Netlify serverless function.
   Receives a cart, re-prices it server-side from a trusted catalog,
   attaches shipping, and creates a Stripe Checkout Session.

   Env var required (set in Netlify -> Site configuration -> Environment variables):
     STRIPE_SECRET_KEY = sk_test_... (use test key first, swap to live later)

   STAGE 1: shipping is a flat rate (FLAT_SHIPPING_CENTS below).
   STAGE 2 will replace this with a live EasyPost rate chosen on the checkout page.
*/

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Authoritative catalog. Prices in cents. The browser never sets the price.
const CATALOG = {
  'creamy-peanut-thai': { name: 'Creamy Peanut Thai', price: 1200 },
  'sweet-golden-tang':  { name: 'Sweet Golden Tang',  price: 1100 },
  'crack':              { name: 'Crack',              price: 750 },
};

// Placeholder flat shipping — replaced by real carrier rates in Stage 2.
const FLAT_SHIPPING_CENTS = 800; // $8.00

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    return json(500, { error: 'Server is missing STRIPE_SECRET_KEY.' });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return json(400, { error: 'Invalid request body.' });
  }

  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) {
    return json(400, { error: 'Your cart is empty.' });
  }

  // Build line items from the trusted catalog only.
  const line_items = [];
  for (const item of items) {
    const product = CATALOG[item && item.id];
    if (!product) {
      return json(400, { error: 'Unknown product: ' + (item && item.id) });
    }
    let qty = parseInt(item.qty, 10);
    if (!Number.isFinite(qty) || qty < 1) qty = 1;
    qty = Math.min(qty, 99);

    line_items.push({
      quantity: qty,
      price_data: {
        currency: 'usd',
        unit_amount: product.price,
        product_data: { name: product.name },
      },
    });
  }

  // Base URL for redirects, derived from the incoming request so it works on
  // any domain (netlify.app preview or wholykitchen.com).
  const origin =
    (event.headers && (event.headers.origin || (event.headers.host && 'https://' + event.headers.host))) ||
    'https://wholykitchen.com';

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      shipping_address_collection: { allowed_countries: ['US'] },
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: FLAT_SHIPPING_CENTS, currency: 'usd' },
            display_name: 'Standard shipping',
          },
        },
      ],
      phone_number_collection: { enabled: true },
      success_url: origin + '/success.html?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: origin + '/checkout.html',
    });

    return json(200, { url: session.url });
  } catch (err) {
    console.error('Stripe error:', err);
    return json(500, { error: 'Could not start checkout. Please try again.' });
  }
};
