/* ===== WholyKitchen — USPS live rates via Shippo =====
   Talks to the Shippo REST API with fetch (no SDK dependency).

   Env var required (Netlify -> Site configuration -> Environment variables):
     SHIPPO_API_TOKEN = shippo_test_... (test token first, swap to shippo_live_... later)
*/

const { CATALOG, SHIP_FROM, BOX, SERVICES } = require('./config');

// Build one parcel for the whole order: fixed box dims, weight = sum of
// item weights + packaging. Shippo wants dimensions/weight as strings.
function parcelFor(items) {
  let weight = BOX.packagingOz;
  for (const it of items) {
    const p = CATALOG[it && it.id];
    if (!p) continue;
    let qty = parseInt(it.qty, 10);
    if (!Number.isFinite(qty) || qty < 1) qty = 1;
    weight += p.weightOz * qty;
  }
  return {
    length: String(BOX.lengthIn),
    width: String(BOX.widthIn),
    height: String(BOX.heightIn),
    distance_unit: 'in',
    weight: String(weight),
    mass_unit: 'oz',
  };
}

function authHeader() {
  // Shippo auth: "Authorization: ShippoToken <token>"
  return 'ShippoToken ' + (process.env.SHIPPO_API_TOKEN || '');
}

// Returns [{ service, label, amountCents, deliveryDays }], cheapest first,
// limited to the services listed in config.SERVICES (matched by Shippo token).
async function getUspsRates({ toAddress, items }) {
  if (!process.env.SHIPPO_API_TOKEN) {
    throw new Error('Server is missing SHIPPO_API_TOKEN.');
  }

  const body = {
    address_from: {
      name:    SHIP_FROM.name,
      street1: SHIP_FROM.street1,
      street2: SHIP_FROM.street2 || '',
      city:    SHIP_FROM.city,
      state:   SHIP_FROM.state,
      zip:     SHIP_FROM.zip,
      country: SHIP_FROM.country || 'US',
      phone:   SHIP_FROM.phone || '',
    },
    address_to: {
      name:    toAddress.name || '',
      street1: toAddress.street1,
      street2: toAddress.street2 || '',
      city:    toAddress.city,
      state:   toAddress.state,
      zip:     toAddress.zip,
      country: 'US',
    },
    parcels: [parcelFor(items)],
    async: false, // return rates inline rather than via webhook
  };

  const resp = await fetch('https://api.goshippo.com/shipments/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader() },
    body: JSON.stringify(body),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = (data && (data.detail || data.message)) || 'Rate lookup failed.';
    throw new Error(typeof msg === 'string' ? msg : 'Rate lookup failed.');
  }

  const allRates = Array.isArray(data.rates) ? data.rates : [];
  const out = [];
  for (const svc of SERVICES) {
    const match = allRates.find(r =>
      r.provider === 'USPS' && r.servicelevel && r.servicelevel.token === svc.service
    );
    if (!match) continue;
    out.push({
      service: svc.service,
      label: svc.label,
      amountCents: Math.round(parseFloat(match.amount) * 100),
      deliveryDays: match.estimated_days || null,
    });
  }
  out.sort((a, b) => a.amountCents - b.amountCents);
  return out;
}

module.exports = { getUspsRates };
