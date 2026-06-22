/* ===== WholyKitchen — Create Stripe Checkout Session =====
   Netlify serverless function.
   Receives a cart, destination address, and the customer's chosen USPS
   service. Re-prices items AND re-fetches the shipping rate server-side
   (anti-tamper), then creates a Stripe Checkout Session.

   Env vars required (Netlify -> Site configuration -> Environment variables):
     STRIPE_SECRET_KEY = sk_test_...    (test key first, swap to live later)
     SHIPPO_API_TOKEN  = shippo_test_...(used to re-validate the shipping rate)

   Shipping config (ship-from, weights, services) lives in ../lib/config.js.
*/

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { CATALOG } = require('../lib/config');
const { getUspsRates } = require('../lib/shippo');

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

function validAddress(a) {
  return a && a.street1 && a.city && a.state && a.zip;
}

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
  if (!validAddress(payload.address)) {
    return json(400, { error: 'Please enter a complete shipping address.' });
  }
  if (!payload.rateService) {
    return json(400, { error: 'Please choose a shipping option.' });
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

  // Re-fetch rates server-side and confirm the chosen service is real and
  // priced exactly as offered — the browser cannot dictate the shipping cost.
  let chosen;
  try {
    const rates = await getUspsRates({ toAddress: payload.address, items });
    chosen = rates.find(r => r.service === payload.rateService);
  } catch (err) {
    console.error('Rate re-validation error:', err);
    return json(502, { error: 'Could not confirm shipping rate. Please try again.' });
  }
  if (!chosen) {
    return json(400, { error: 'That shipping option is no longer available. Please refresh your rates.' });
  }

  const addr = payload.address;
  const origin =
    (event.headers && (event.headers.origin || (event.headers.host && 'https://' + event.headers.host))) ||
    'https://wholykitchen.com';

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: chosen.amountCents, currency: 'usd' },
            display_name: chosen.label,
          },
        },
      ],
      // We already collected the destination address (used for the rate), so
      // attach it to the payment instead of asking again on Stripe's page.
      payment_intent_data: {
        shipping: {
          name: addr.name || 'Customer',
          address: {
            line1: addr.street1,
            line2: addr.street2 || undefined,
            city: addr.city,
            state: addr.state,
            postal_code: addr.zip,
            country: 'US',
          },
        },
      },
      phone_number_collection: { enabled: true },
      // Stash the cart, address, and chosen rate so the stripe-webhook function
      // can push this order into Shippo for fulfillment after payment.
      metadata: {
        cart: JSON.stringify(items.map(function (i) {
          var q = parseInt(i.qty, 10);
          return { id: i.id, qty: (Number.isFinite(q) && q > 0) ? Math.min(q, 99) : 1 };
        })),
        ship_name: addr.name || '',
        ship_street1: addr.street1 || '',
        ship_street2: addr.street2 || '',
        ship_city: addr.city || '',
        ship_state: addr.state || '',
        ship_zip: addr.zip || '',
        rate_service: chosen.service,
        rate_label: chosen.label,
        rate_cents: String(chosen.amountCents),
      },
      success_url: origin + '/success.html?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: origin + '/checkout.html',
    });

    return json(200, { url: session.url });
  } catch (err) {
    console.error('Stripe error:', err);
    return json(500, { error: 'Could not start checkout. Please try again.' });
  }
};
