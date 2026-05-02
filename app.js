// ── Language ──────────────────────────────────────────────────────
const PRICE = 25; // NZ$25 per team
const PRICE_CURRENCY = 'NZD';

// Promo codes — add/remove as needed (applied in Netlify Function too)
const PROMO_CODES = {
  'TEST94': 94,
};

let lang = 'en';
let promoDiscount = 0; // percent

function setLang(l) {
  lang = l;
  document.documentElement.lang = l === 'tw' ? 'zh-TW' : 'en';
  document.getElementById('lang-toggle').textContent = l === 'tw' ? 'English' : '中文';

  document.querySelectorAll('[data-en]').forEach(el => {
    const text = el.getAttribute(`data-${l}`) || el.getAttribute('data-en');
    if (el.tagName === 'INPUT' || el.tagName === 'BUTTON') {
      el.placeholder = text;
    } else {
      el.innerHTML = text;
    }
  });

  // Update nested spans
  document.querySelectorAll('[data-en] [data-en]').forEach(el => {
    const text = el.getAttribute(`data-${l}`) || el.getAttribute('data-en');
    el.textContent = text;
  });

  updatePriceDisplay();
}

document.getElementById('lang-toggle').addEventListener('click', () => {
  setLang(lang === 'en' ? 'tw' : 'en');
});

// ── Price Display ─────────────────────────────────────────────────
function updatePriceDisplay() {
  const priceEl  = document.getElementById('price-display');
  const totalEl  = document.getElementById('total-display');
  if (!PRICE) {
    priceEl.textContent = 'NZ$ --';
    totalEl.textContent = 'NZ$ --';
    return;
  }
  const final = Math.round(PRICE * (1 - promoDiscount / 100));
  priceEl.textContent = `NZ$ ${PRICE}`;
  totalEl.textContent = promoDiscount > 0 ? `NZ$ ${final} (−${promoDiscount}%)` : `NZ$ ${PRICE}`;
}
updatePriceDisplay();

// ── Promo Code ────────────────────────────────────────────────────
document.getElementById('apply-promo').addEventListener('click', () => {
  const code  = document.getElementById('promo-code').value.trim().toUpperCase();
  const msgEl = document.getElementById('promo-msg');
  msgEl.classList.remove('hidden', 'success', 'error');

  if (!code) {
    msgEl.className = 'promo-msg error';
    msgEl.textContent = lang === 'tw' ? '請輸入優惠碼' : 'Please enter a promo code';
    return;
  }
  if (PROMO_CODES[code] !== undefined) {
    promoDiscount = PROMO_CODES[code];
    msgEl.className = 'promo-msg success';
    msgEl.textContent = lang === 'tw'
      ? `✅ 優惠碼已套用：折扣 ${promoDiscount}%`
      : `✅ Code applied: ${promoDiscount}% off`;
    updatePriceDisplay();
  } else {
    promoDiscount = 0;
    msgEl.className = 'promo-msg error';
    msgEl.textContent = lang === 'tw' ? '❌ 無效的優惠碼' : '❌ Invalid promo code';
    updatePriceDisplay();
  }
});

// ── Booking Form ──────────────────────────────────────────────────
document.getElementById('book-form').addEventListener('submit', async e => {
  e.preventDefault();
  if (!PRICE) {
    alert(lang === 'tw' ? '付款功能即將開放！' : 'Payment coming soon!');
    return;
  }

  const teamName  = document.getElementById('team-name').value.trim();
  const email     = document.getElementById('email').value.trim();
  const promoCode = document.getElementById('promo-code').value.trim().toUpperCase();
  const btn       = document.getElementById('checkout-btn');
  const btnText   = document.getElementById('checkout-btn-text');
  const teamError = document.getElementById('team-error');

  teamError.classList.add('hidden');
  btn.disabled = true;
  btnText.textContent = lang === 'tw' ? '處理中…' : 'Processing…';

  try {
    const res = await fetch('/.netlify/functions/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamName, email, promoCode, lang })
    });
    const data = await res.json();

    if (!res.ok) {
      if (data.code === 'TEAM_EXISTS') {
        teamError.textContent = lang === 'tw'
          ? '這個隊伍名稱已被使用，請換一個'
          : 'This team name is already taken, please choose another';
        teamError.classList.remove('hidden');
      } else {
        alert(data.error || (lang === 'tw' ? '發生錯誤，請重試' : 'An error occurred, please try again'));
      }
      return;
    }
    // Redirect to Stripe Checkout
    window.location.href = data.url;
  } catch {
    alert(lang === 'tw' ? '網路錯誤，請重試' : 'Network error, please try again');
  } finally {
    btn.disabled = false;
    btnText.setAttribute('data-en', 'Proceed to Payment →');
    btnText.setAttribute('data-tw', '前往付款 →');
    btnText.textContent = lang === 'tw' ? '前往付款 →' : 'Proceed to Payment →';
  }
});

// ── Init ──────────────────────────────────────────────────────────
setLang('en');
