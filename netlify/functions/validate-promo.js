exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode: 400, body: 'Invalid JSON' }; }

  const code = (body.code || '').trim().toUpperCase();
  if (!code) return { statusCode: 200, body: JSON.stringify({ valid: false }) };

  const PROMO_CODES = JSON.parse(process.env.PROMO_CODES || '{}');
  const discount = PROMO_CODES[code];

  if (discount !== undefined) {
    return { statusCode: 200, body: JSON.stringify({ valid: true, discount }) };
  }
  return { statusCode: 200, body: JSON.stringify({ valid: false }) };
};
