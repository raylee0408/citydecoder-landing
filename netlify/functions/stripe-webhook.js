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
  const gameUrl = 'https://auckland.playcitydecoder.com/';

  const mapsUrl = 'https://maps.google.com/?q=Ferry+Building,+Quay+Street,+Auckland';
  const emailHtml = lang === 'tw' ? `
    <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:24px">
      <h1 style="color:#FF6B35">🗺️ 你的 City Decoder 密碼來了！</h1>
      <p>感謝你預訂 <strong>Queen St Explorer — 奧克蘭</strong>！把這封信分享給全隊，大家用同一組名稱和密碼登入。</p>
      <div style="background:#FFF8F0;border:2px solid #FFD166;border-radius:16px;padding:24px;margin:24px 0;text-align:center">
        <p style="margin:0 0 8px;font-size:0.9rem;color:#666">隊伍名稱</p>
        <h2 style="margin:0 0 16px;font-size:1.8rem;color:#1a1a2e">${teamName}</h2>
        <p style="margin:0 0 8px;font-size:0.9rem;color:#666">密碼</p>
        <h2 style="margin:0;font-size:3rem;color:#FF6B35;letter-spacing:8px">${password}</h2>
      </div>

      <div style="background:#e8f5e9;border-radius:12px;padding:20px;margin:20px 0">
        <p style="margin:0 0 12px;font-weight:bold;font-size:1rem">🚀 如何開始</p>
        <p style="margin:0 0 8px">1️⃣ 前往 <a href="${gameUrl}" style="color:#FF6B35;font-weight:bold">遊戲網站</a></p>
        <p style="margin:0 0 8px">2️⃣ 輸入上方的隊伍名稱和密碼</p>
        <p style="margin:0">3️⃣ 前往 Ferry Building 集合，點擊「開始遊戲」！</p>
      </div>

      <div style="background:#f0f7ff;border-radius:12px;padding:20px;margin:20px 0">
        <p style="margin:0 0 12px;font-weight:bold;font-size:1rem">📍 遊戲起點</p>
        <p style="margin:0 0 8px"><strong>Ferry Building，Quay Street, Auckland</strong></p>
        <a href="${mapsUrl}" style="color:#0077b6;font-size:0.9rem">在 Google Maps 查看 →</a>
      </div>

      <div style="background:#f9f9f9;border-radius:12px;padding:20px;margin:20px 0">
        <p style="margin:0 0 12px;font-weight:bold;font-size:1rem">📋 注意事項</p>
        <p style="margin:0 0 6px">📱 每位玩家需要一支有網路的手機</p>
        <p style="margin:0 0 6px">👥 建議人數：2–6 人</p>
        <p style="margin:0 0 6px">⏱️ 遊戲時間約 60–90 分鐘</p>
        <p style="margin:0">⚠️ 請注意交通安全，過馬路時小心車輛</p>
      </div>

      <a href="${gameUrl}" style="display:inline-block;background:#FF6B35;color:#fff;padding:14px 28px;border-radius:50px;text-decoration:none;font-weight:bold;margin:16px 0">開始遊戲 →</a>
      <p style="color:#666;font-size:0.85rem">⏳ 密碼在<strong>第一次登入後 48 小時內</strong>有效，準備好再開始。有問題請聯絡 hello@playcitydecoder.com</p>
    </div>
  ` : `
    <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:24px">
      <h1 style="color:#FF6B35">🗺️ Your City Decoder is ready!</h1>
      <p>Thanks for booking <strong>Queen St Explorer — Auckland</strong>! Share this email with your whole team — everyone uses the same team name and password.</p>
      <div style="background:#FFF8F0;border:2px solid #FFD166;border-radius:16px;padding:24px;margin:24px 0;text-align:center">
        <p style="margin:0 0 8px;font-size:0.9rem;color:#666">Team Name</p>
        <h2 style="margin:0 0 16px;font-size:1.8rem;color:#1a1a2e">${teamName}</h2>
        <p style="margin:0 0 8px;font-size:0.9rem;color:#666">Password</p>
        <h2 style="margin:0;font-size:3rem;color:#FF6B35;letter-spacing:8px">${password}</h2>
      </div>

      <div style="background:#e8f5e9;border-radius:12px;padding:20px;margin:20px 0">
        <p style="margin:0 0 12px;font-weight:bold;font-size:1rem">🚀 How to Start</p>
        <p style="margin:0 0 8px">1️⃣ Go to the <a href="${gameUrl}" style="color:#FF6B35;font-weight:bold">game website</a></p>
        <p style="margin:0 0 8px">2️⃣ Enter the team name and password above</p>
        <p style="margin:0">3️⃣ Head to the Ferry Building and tap "Start Game"!</p>
      </div>

      <div style="background:#f0f7ff;border-radius:12px;padding:20px;margin:20px 0">
        <p style="margin:0 0 12px;font-weight:bold;font-size:1rem">📍 Starting Point</p>
        <p style="margin:0 0 8px"><strong>Ferry Building, Quay Street, Auckland</strong></p>
        <a href="${mapsUrl}" style="color:#0077b6;font-size:0.9rem">View on Google Maps →</a>
      </div>

      <div style="background:#f9f9f9;border-radius:12px;padding:20px;margin:20px 0">
        <p style="margin:0 0 12px;font-weight:bold;font-size:1rem">📋 Things to Know</p>
        <p style="margin:0 0 6px">📱 Each player needs a smartphone with internet</p>
        <p style="margin:0 0 6px">👥 Recommended group size: 2–6 people</p>
        <p style="margin:0 0 6px">⏱️ Allow 60–90 minutes to complete</p>
        <p style="margin:0">⚠️ Stay safe — watch out for traffic when crossing roads</p>
      </div>

      <a href="${gameUrl}" style="display:inline-block;background:#FF6B35;color:#fff;padding:14px 28px;border-radius:50px;text-decoration:none;font-weight:bold;margin:16px 0">Start Playing →</a>
      <p style="color:#666;font-size:0.85rem">⏳ Your code is valid for <strong>48 hours from first use</strong> — start when your group is ready. Questions? Email hello@playcitydecoder.com</p>
    </div>
  `;

  await resend.emails.send({
    from:    'City Decoder <hello@playcitydecoder.com>',
    to:      email,
    subject: lang === 'tw'
      ? `🗺️ 你的 City Decoder 密碼：${teamName}`
      : `🗺️ Your City Decoder password — ${teamName}`,
    html: emailHtml
  });

  console.log(`✅ Team created: ${teamName}, password sent to ${email}`);
  return { statusCode: 200, body: 'OK' };
};
