/* ===== WholyKitchen — shared server-side shipping & catalog config =====
   Used by BOTH Netlify functions (get-rates + create-checkout-session).

   >>> THIS IS THE ONLY FILE YOU NEED TO EDIT to set up live shipping. <<<
   Fill in SHIP_FROM, confirm the per-item weights in CATALOG, and adjust
   BOX if your packaging differs. Everything is marked with TODO.
*/

// Authoritative product catalog.
//   price   = cents (browser never sets this — re-priced here server-side)
//   weightOz = shipped weight of ONE unit (the FILLED bottle/package, not net wt)
const CATALOG = {
  'creamy-peanut-thai': { name: 'Creamy Peanut Thai', price: 1200, weightOz: 8 },
  'sweet-golden-tang':  { name: 'Sweet Golden Tang',  price: 1100, weightOz: 8 },
  'crack':              { name: 'Crack',              price: 750,  weightOz: 8 }, // TODO: confirm — Crack is a dessert, not a jarred sauce; may differ from 8oz
};

// === EDIT ME: the address orders ship FROM (origin) ===
// The ZIP especially drives the rate. Use the real pickup/return address.
const SHIP_FROM = {
  name:    'WholyKitchen',
  street1: '980 W 400 N',
  street2: '',
  city:    'Provo',
  state:   'UT',
  zip:     '84601',
  country: 'US',
  phone:   '',                 // optional but recommended for USPS
};

// === Packaging ===
// One box for the whole order (fine for small multi-bottle orders).
// packagingOz is added on top of product weight (box + padding).
const BOX = {
  lengthIn:    8,   // TODO: confirm box dimensions (inches)
  widthIn:     6,
  heightIn:    4,
  packagingOz: 4,   // TODO: confirm empty box + packing material weight (oz)
};

// USPS services offered at checkout, cheapest first.
// `service` must match Shippo's USPS servicelevel TOKEN exactly
// (e.g. usps_ground_advantage, usps_priority, usps_priority_express).
// To add/remove an option, add/remove a line here — nothing else to change.
const SERVICES = [
  { service: 'usps_ground_advantage', label: 'USPS Ground Advantage' },
  { service: 'usps_priority',         label: 'USPS Priority Mail' },
];

module.exports = { CATALOG, SHIP_FROM, BOX, SERVICES };
