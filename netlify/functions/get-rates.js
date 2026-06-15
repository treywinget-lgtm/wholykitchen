/* ===== WholyKitchen — Get live USPS shipping rates =====
   Netlify serverless function.
   Receives the cart + destination address, returns the USPS rates we offer.
   The browser uses these only to DISPLAY options; the chosen rate is
   re-validated server-side in create-checkout-session before charging.
*/

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

  try {
    const rates = await getUspsRates({ toAddress: payload.address, items });
    if (!rates.length) {
      return json(502, { error: 'No shipping rates available for that address. Please double-check it.' });
    }
    return json(200, { rates });
  } catch (err) {
    console.error('get-rates error:', err);
    return json(500, { error: err.message || 'Could not get shipping rates. Please try again.' });
  }
};
