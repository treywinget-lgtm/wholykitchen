/* ===== WholyKitchen — create a Shippo Order =====
   Pushes a paid order into Shippo's Orders tab so it's ready to label.
   Uses the Shippo REST API via fetch (no SDK dependency).

   Env var required: SHIPPO_API_TOKEN (same token used for live rates).
*/

function authHeader() {
  return 'ShippoToken ' + (process.env.SHIPPO_API_TOKEN || '');
}

async function createShippoOrder(order) {
  if (!process.env.SHIPPO_API_TOKEN) {
    throw new Error('Server is missing SHIPPO_API_TOKEN.');
  }

  const resp = await fetch('https://api.goshippo.com/orders/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader() },
    body: JSON.stringify(order),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = (data && (data.detail || data.message)) || 'Shippo order create failed.';
    throw new Error(typeof msg === 'string' ? msg : 'Shippo order create failed.');
  }
  return data;
}

module.exports = { createShippoOrder };
