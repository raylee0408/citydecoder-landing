const Stripe = require('stripe');
const admin  = require('firebase-admin');
const { Resend } = require('resend');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
  });
}
const db = admin.firestore();

function generatePassword() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

// Simple SHA-256 for password storage (matching game's admin pattern)
async function sha256(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const sig    = event.headers['stripe-signature'];

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return { statusCode: 400, body: `Webhook error: ${err.message}` };
  }

  if (stripeEvent.type !== 'checkout.session.completed') {
    return { statusCode: 200, body: 'Ignored' };
  }

  const session  = stripeEvent.data.object;
  const teamName = session.metadata.teamName;
  const email    = session.metadata.email;
  const lang     = session.metadata.lang || 'en';
  const sessionId = session.id;

  // Idempotency: skip if already processed
  const existing = await db.collection('teams').where('name', '==', teamName).limit(1).get();
  if (!existing.empty) {
    console.log(`Team ${teamName} already created, skipping`);
    return { statusCode: 200, body: 'Already processed' };
  }

  // Generate 4-digit password
  const password = generatePassword();

  // Create team in Firebase (matching City2 game's team structure)
  await db.collection('teams').add({
    name:      teamName,
    password:  password,
    email:     email,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    stripeSessionId: sessionId,
    route:     'auckland-queen-st'
  });

  // Send email via Resend
  const resend = new Resend(process.env.RESEND_API_KEY);
  const gameUrl = 'https://auckland-decoder.netlify.app/';

  const emailHtml = lang === 'tw' ? `
    <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:24px">
      <h1 style="color:#FF6B35">🗺️ 你的 City Decoder 密碼來了！</h1>
      <p>感謝你預訂 <strong>Queen St Explorer — 奧克蘭</strong>！</p>
      <div style="background:#FFF8F0;border:2px solid #FFD166;border-radius:16px;padding:24px;margin:24px 0;text-align:center">
        <p style="margin:0 0 8px;font-size:0.9rem;color:#666">隊伍名稱</p>
        <h2 style="margin:0 0 16px;font-size:1.8rem;color:#1a1a2e">${teamName}</h2>
        <p style="margin:0 0 8px;font-size:0.9rem;color:#666">密碼</p>
        <h2 style="margin:0;font-size:3rem;color:#FF6B35;letter-spacing:8px">${password}</h2>
      </div>
      <p>準備好了就前往起點：<strong>Ferry Building，Quay Street, Auckland</strong></p>
      <a href="${gameUrl}" style="display:inline-block;background:#FF6B35;color:#fff;padding:14px 28px;border-radius:50px;text-decoration:none;font-weight:bold;margin:16px 0">開始遊戲 →</a>
      <p style="color:#666;font-size:0.85rem">密碼沒有使用期限，隨時可以開始。有問題請聯絡 hello@citydecoder.com</p>
    </div>
  ` : `
    <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:24px">
      <h1 style="color:#FF6B35">🗺️ Your City Decoder is ready!</h1>
      <p>Thanks for booking <strong>Queen St Explorer — Auckland</strong>!</p>
      <div style="background:#FFF8F0;border:2px solid #FFD166;border-radius:16px;padding:24px;margin:24px 0;text-align:center">
        <p style="margin:0 0 8px;font-size:0.9rem;color:#666">Team Name</p>
        <h2 style="margin:0 0 16px;font-size:1.8rem;color:#1a1a2e">${teamName}</h2>
        <p style="margin:0 0 8px;font-size:0.9rem;color:#666">Password</p>
        <h2 style="margin:0;font-size:3rem;color:#FF6B35;letter-spacing:8px">${password}</h2>
      </div>
      <p>Head to the start point: <strong>Ferry Building, Quay Street, Auckland</strong></p>
      <a href="${gameUrl}" style="display:inline-block;background:#FF6B35;color:#fff;padding:14px 28px;border-radius:50px;text-decoration:none;font-weight:bold;margin:16px 0">Start Playing →</a>
      <p style="color:#666;font-size:0.85rem">Your code never expires — play whenever you're ready. Questions? Email hello@citydecoder.com</p>
    </div>
  `;

  await resend.emails.send({
    from:    'City Decoder <hello@citydecoder.com>',
    to:      email,
    subject: lang === 'tw'
      ? `🗺️ 你的 City Decoder 密碼：${teamName}`
      : `🗺️ Your City Decoder password — ${teamName}`,
    html: emailHtml
  });

  console.log(`✅ Team created: ${teamName}, password sent to ${email}`);
  return { statusCode: 200, body: 'OK' };
};
