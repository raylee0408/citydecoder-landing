const Stripe = require('stripe');
const admin  = require('firebase-admin');

// Init Firebase Admin (only once)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
  });
}
const db = admin.firestore();

const PRICE_NZD_CENTS = parseInt(process.env.PRICE_NZD_CENTS || '0', 10); // e.g. 3500 = NZ$35.00

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode: 400, body: 'Invalid JSON' }; }

  const { teamName, promoCode, lang } = body;
  const email = (body.email || '').trim().toLowerCase();
  if (!teamName || !email) return { statusCode: 400, body: JSON.stringify({ error: 'Missing fields' }) };

  // Sanitise team name
  const cleanName = teamName.trim().slice(0, 20);
  if (!/^[a-zA-Z0-9 _\-一-鿿㐀-䶿]+$/.test(cleanName)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: lang === 'tw' ? '隊伍名稱含有不支援的字元' : 'Team name contains unsupported characters' })
    };
  }

  // Check if team name already exists
  const existing = await db.collection('teams').where('name', '==', cleanName).limit(1).get();
  if (!existing.empty) {
    return {
      statusCode: 409,
      body: JSON.stringify({ code: 'TEAM_EXISTS', error: 'Team name already taken' })
    };
  }

  // Apply promo code (validate server-side)
  const PROMO_CODES = JSON.parse(process.env.PROMO_CODES || '{}');
  let discountPercent = 0;
  if (promoCode && PROMO_CODES[promoCode.toUpperCase()] !== undefined) {
    discountPercent = PROMO_CODES[promoCode.toUpperCase()];
  }
  const finalCents = Math.round(PRICE_NZD_CENTS * (1 - discountPercent / 100));

  // Create Stripe Checkout session
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: email,
    line_items: [{
      price_data: {
        currency: 'nzd',
        unit_amount: finalCents,
        product_data: {
          name: 'City Decoder — Queen St Explorer',
          description: `Team: ${cleanName} | Auckland, 10 puzzles, ~1 hour`,
        }
      },
      quantity: 1
    }],
    metadata: { teamName: cleanName, email, promoCode: promoCode || '', lang: lang || 'en' },
    success_url: `${process.env.URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${process.env.URL}/#book`,
  });

  return {
    statusCode: 200,
    body: JSON.stringify({ url: session.url })
  };
};
