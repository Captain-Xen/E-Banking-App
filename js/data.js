/* ═══════════════════════════════════════════════════════════════
   BlueMahoe Bank — data.js
   Mock data layer: user, accounts (with lien holds), cards, contacts,
   generated transaction history, investments, bills, FX rates.
   All figures are dummy values for demo purposes.
   ═══════════════════════════════════════════════════════════════ */
window.BM = (function () {
  'use strict';

  const DEMO = { user: 'demo', pass: 'island2026' };

  /* Deterministic PRNG so demo history is stable across reloads */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rnd = mulberry32(20260917);
  const ri = (min, max) => Math.floor(rnd() * (max - min + 1)) + min;
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const jitter = (base, pct) => Math.round(base * (1 + (rnd() * 2 - 1) * pct));

  /* ── Categories ─────────────────────────────────────────── */
  const CATS = {
    food:      { label: 'Food & Dining',    icon: 'i-food',     color: '#f97316' },
    bills:     { label: 'Bills & Utilities', icon: 'i-receipt', color: '#0ea5e9' },
    shopping:  { label: 'Shopping',          icon: 'i-cart',    color: '#ec4899' },
    transport: { label: 'Transport & Fuel',  icon: 'i-car',     color: '#8b5cf6' },
    health:    { label: 'Health & Wellness', icon: 'i-pill',    color: '#14b8a6' },
    fun:       { label: 'Entertainment',     icon: 'i-play',    color: '#eab308' },
    transfers: { label: 'Transfers',         icon: 'i-send',    color: '#06b6d4' },
    salary:    { label: 'Salary',            icon: 'i-case',    color: '#22c55e' },
    fees:      { label: 'Fees & Charges',    icon: 'i-alert',   color: '#64748b' },
    travel:    { label: 'Travel',            icon: 'i-globe',   color: '#f59e0b' },
    invest:    { label: 'Investments',       icon: 'i-trend-up', color: '#10b981' },
    education: { label: 'Education',         icon: 'i-file',    color: '#3b82f6' },
    atm:       { label: 'ATM & Cash',        icon: 'i-wallet',  color: '#6b7280' },
    other:     { label: 'Other',             icon: 'i-list',    color: '#94a3b8' },
  };

  /* ── User ───────────────────────────────────────────────── */
  const user = {
    id: 'BM-884210-A',
    name: 'Marlon Beckford',
    first: 'Marlon',
    email: 'marlon.beckford@mail.jm',
    phone: '+1 (876) 555-0142',
    since: 'March 2019',
    tier: 'Sapphire member',
    branch: 'Liguanea — Kingston 6',
    initials: 'MB',
  };

  /* ── Accounts (balances include lien holds) ─────────────── */
  const accounts = [
    {
      id: 'chk', name: 'Chequing', nickname: 'Everyday Spending',
      number: '•••• 4471', currency: 'JMD', balance: 486213.44,
      lien: { amount: 45000, reason: 'Court-ordered hold', ref: 'JMS-2214', placed: '2 Jul 2026', note: 'Funds held per Supreme Court order. Contact your relationship manager for release details.' },
    },
    {
      id: 'sav', name: 'Savings', nickname: 'Rainy Day Fund',
      number: '•••• 9032', currency: 'JMD', balance: 1268930.10,
      lien: { amount: 150000, reason: 'Loan collateral', ref: 'LN-88231', placed: '15 Jan 2026', note: 'Pledged as security for your auto loan. Amount releases when the loan is closed.' },
    },
    {
      id: 'usd', name: 'USD Savings', nickname: 'Travel Fund',
      number: '•••• 5518', currency: 'USD', balance: 3214.18,
      lien: null,
    },
  ];

  /* ── FX rates (JMD per unit) ────────────────────────────── */
  const fx = {
    USD: { rate: 156.85, chg: 0.14 },
    CAD: { rate: 115.20, chg: -0.08 },
    GBP: { rate: 197.40, chg: 0.22 },
    EUR: { rate: 170.25, chg: 0.31 },
  };

  /* ── Luhn helpers for realistic card numbers ────────────── */
  function luhnCheckDigit(partial) {
    let sum = 0, dbl = true;
    for (let i = partial.length - 1; i >= 0; i--) {
      let d = +partial[i];
      if (dbl) { d *= 2; if (d > 9) d -= 9; }
      sum += d; dbl = !dbl;
    }
    return String((10 - (sum % 10)) % 10);
  }
  function makeCardNum(prefix) {
    let n = prefix;
    while (n.length < 15) n += String(ri(0, 9));
    return n + luhnCheckDigit(n);
  }
  function luhnValid(num) {
    let sum = 0, dbl = false;
    for (let i = num.length - 1; i >= 0; i--) {
      let d = +num[i];
      if (dbl) { d *= 2; if (d > 9) d -= 9; }
      sum += d; dbl = !dbl;
    }
    return sum % 10 === 0;
  }

  /* ── Cards ──────────────────────────────────────────────── */
  const cards = [
    {
      id: 'c1', brand: 'visa', kind: 'debit', tier: 'Platinum',
      num: makeCardNum('45820291'), holder: 'MARLON BECKFORD', exp: '09/29', cvv: '418',
      locked: false, lynk: true, jamdex: false, grad: 'reef',
      limit: 400000, used: 128400, added: '14 Jun 2023',
    },
    {
      id: 'c2', brand: 'mastercard', kind: 'credit', tier: 'World Elite',
      num: makeCardNum('53991234'), holder: 'MARLON BECKFORD', exp: '04/28', cvv: '772',
      locked: true, lynk: false, jamdex: true, grad: 'sunset',
      limit: 350000, used: 96500, added: '20 Jan 2022',
    },
    {
      id: 'c3', brand: 'mastercard', kind: 'debit', tier: 'Standard',
      num: makeCardNum('54127590'), holder: 'MARLON BECKFORD', exp: '11/27', cvv: '305',
      locked: false, lynk: true, jamdex: true, grad: 'lagoon',
      limit: 250000, used: 41200, added: '2 Sep 2024',
    },
  ];

  /* ── Contacts / payees ──────────────────────────────────── */
  const contacts = [
    { id: 'k1', name: 'Shamar Gordon', sub: 'Lynk · 876-402-1188', bank: 'Lynk Wallet', method: 'lynk', color: '#0ea5e9' },
    { id: 'k2', name: 'Alicia Bennett', sub: 'NCB · •••• 6620', bank: 'NCB Jamaica', method: 'bank', color: '#f97316' },
    { id: 'k3', name: 'Kenesha Murphy', sub: 'JN Bank · •••• 1189', bank: 'JN Bank', method: 'bank', color: '#10b981' },
    { id: 'k4', name: 'Devon Cross', sub: 'Scotiabank · •••• 7743', bank: 'Scotiabank JM', method: 'bank', color: '#ef4444' },
    { id: 'k5', name: 'Mom (Dorrett B.)', sub: 'Jam-Dex Wallet', bank: 'Jam-Dex', method: 'jamdex', color: '#eab308' },
    { id: 'k6', name: 'Pinnacle Properties', sub: 'First Global · •••• 3310', bank: 'First Global', method: 'bank', color: '#8b5cf6', tag: 'Rent' },
  ];

  /* ── Billers ────────────────────────────────────────────── */
  const bills = [
    { id: 'b1', name: 'JPS Electricity', sub: 'Account •••• 8842', due: 'Sep 24', est: 17320, color: '#f59e0b' },
    { id: 'b2', name: 'NWC Water', sub: 'Account •••• 3310', due: 'Sep 20', est: 3860, color: '#0ea5e9' },
    { id: 'b3', name: 'Digicel Postpaid', sub: 'Account •••• 7743', due: 'Sep 28', est: 8450, color: '#ef4444' },
    { id: 'b4', name: 'Flow Internet', sub: 'Account •••• 1192', due: 'Sep 22', est: 6999, color: '#8b5cf6' },
    { id: 'b5', name: 'PayMaster', sub: 'Any biller · ref 5580', due: 'Sep 30', est: 4200, color: '#10b981' },
  ];

  /* ── Transaction history generator (13 months) ──────────── */
  const MER = {
    food: ['Island Grill', 'Juici Patties', 'Tastee', 'Hi-Lo Food Store', 'Progressive Grocers', "Domino's Kingston", 'Brewed Awakening Café', 'Chicken Master', 'MegaMart Kingston'],
    shopping: ['Fontana Pharmacy', 'Courts Jamaica', 'PriceSmart', 'Sovereign Centre Stores', 'Mecca Giftland'],
    transport: ['Texaco Fuel — Manor Park', 'Shell — Constant Spring', 'InDrive Kingston', 'Knutsford Express'],
    health: ['Apotexee Drugs', 'Bloom Wellness Clinic', 'Island Gym'],
    fun: ['Carib Cineplex', 'Jamrock Sports Bar', 'Kingston Dub Club'],
  };

  let transactions = [];
  let txnSeq = 0;

  function addTxn(ts, desc, cat, amount, opts) {
    opts = opts || {};
    transactions.push({
      id: 't' + (++txnSeq),
      ts,
      desc,
      cat,
      amount: Math.round(amount * 100) / 100,
      acct: opts.acct || 'chk',
      method: opts.method || 'POS',
      intl: !!opts.intl,
      orig: opts.orig || null,
      status: opts.status || 'completed',
      ref: 'BM' + String(100000 + txnSeq * 7919).slice(0, 6) + (txnSeq % 10),
    });
  }

  (function generate() {
    const now = new Date();
    const D = (y, m, d, h, min) => new Date(y, m, d, h || 12, min || 0, 0).getTime();

    for (let back = 12; back >= 0; back--) {
      const base = new Date(now.getFullYear(), now.getMonth() - back, 1);
      const y = base.getFullYear(), m = base.getMonth();
      const dim = new Date(y, m + 1, 0).getDate();
      const isCurrent = back === 0;
      const today = now.getDate();

      /* Salary — 25th */
      if (!isCurrent || today >= 25) {
        addTxn(D(y, m, 25, 9, 5), 'Salary — Tropic Sun Resorts Ltd', 'salary', 186450 + ri(-15, 25) * 100, { acct: 'chk', method: 'Direct deposit' });
      }
      /* Rent — 1st */
      if (!isCurrent || today >= 1) {
        addTxn(D(y, m, 1, 8, 30), 'Rent — Pinnacle Properties Ltd', 'transfers', -85000, { acct: 'chk', method: 'Bank transfer' });
      }
      /* Bills */
      if (!isCurrent || today >= 14) {
        addTxn(D(y, m, 14, 7, 45), 'JPS eBill — electricity', 'bills', -jitter(17600, 0.18), { acct: 'chk', method: 'Bill pay' });
      }
      if (!isCurrent || today >= 20) {
        addTxn(D(y, m, 20, 7, 45), 'NWC — water & sewerage', 'bills', -jitter(3860, 0.15), { acct: 'chk', method: 'Bill pay' });
      }
      addTxn(D(y, m, Math.min(22, dim), 7, 50), 'Flow broadband — monthly', 'bills', -6999, { acct: 'chk', method: 'Bill pay' });
      /* Subscriptions (international, USD originals) */
      addTxn(D(y, m, 8, 3, 10), 'Netflix — subscription (US$8.99)', 'fun', -jitter(1410, 0.06), { acct: 'c1', method: 'Card — online', intl: true, orig: { cur: 'USD', amt: 8.99 } });
      addTxn(D(y, m, 5, 3, 20), 'Spotify Premium (US$3.99)', 'fun', -jitter(626, 0.05), { acct: 'c1', method: 'Card — online', intl: true, orig: { cur: 'USD', amt: 3.99 } });
      /* Fees & ATM */
      addTxn(D(y, m, 28, 6, 0), 'Monthly account fee', 'fees', -500, { acct: 'chk', method: 'Fee' });
      if (rnd() > 0.35) {
        addTxn(D(y, m, ri(9, 20), 16, 40), 'ATM withdrawal — NCB Half-Way-Tree', 'atm', -(ri(8, 15) * 1000), { acct: 'chk', method: 'ATM' });
      }
      /* FD interest quarterly */
      if (m % 3 === 1) {
        addTxn(D(y, m, 1, 5, 0), 'Fixed Deposit interest — 6.75% p.a.', 'invest', 2812.50, { acct: 'sav', method: 'Interest' });
      }
      /* Mutual fund contribution quarterly */
      if (m % 3 === 0) {
        addTxn(D(y, m, 26, 10, 0), 'Island Growth MF — contribution', 'invest', -50000, { acct: 'chk', method: 'Bank transfer' });
      }
      /* Random everyday spend */
      const n = isCurrent ? Math.min(today, ri(6, 10)) : ri(9, 14);
      for (let i = 0; i < n; i++) {
        const day = isCurrent ? Math.max(1, ri(1, today)) : ri(1, dim);
        const roll = rnd();
        if (roll < 0.30) {
          addTxn(D(y, m, day, ri(8, 21), ri(0, 59)), pick(MER.food), 'food', -jitter(ri(1, 9) * 850 + 400, 0.12), { acct: rnd() > 0.4 ? 'chk' : 'c1', method: rnd() > 0.5 ? 'POS' : 'Card — tap' });
        } else if (roll < 0.46) {
          addTxn(D(y, m, day, ri(9, 20), ri(0, 59)), pick(MER.transport), 'transport', -jitter(ri(1, 8) * 900 + 500, 0.15), { acct: 'chk', method: rnd() > 0.6 ? 'POS' : 'Card — tap' });
        } else if (roll < 0.60) {
          addTxn(D(y, m, day, ri(9, 20), ri(0, 59)), pick(MER.shopping), 'shopping', -jitter(ri(2, 22) * 950 + 800, 0.2), { acct: rnd() > 0.5 ? 'c1' : 'c3', method: 'POS' });
        } else if (roll < 0.70) {
          addTxn(D(y, m, day, ri(10, 22), ri(0, 59)), pick(MER.fun), 'fun', -jitter(ri(8, 35) * 100 + 400, 0.2), { acct: 'c1', method: 'Card — tap' });
        } else if (roll < 0.78) {
          addTxn(D(y, m, day, ri(9, 19), ri(0, 59)), pick(MER.health), 'health', -jitter(ri(15, 80) * 100, 0.15), { acct: 'chk', method: 'POS' });
        } else if (roll < 0.86) {
          addTxn(D(y, m, day, ri(7, 21), ri(0, 59)), 'Digicel top-up', 'bills', -ri(2, 30) * 100, { acct: 'chk', method: 'Bill pay' });
        } else if (roll < 0.93) {
          addTxn(D(y, m, day, ri(9, 21), ri(0, 59)), 'Lynk transfer — ' + pick(['Shamar G.', 'Alicia B.', 'Kenesha M.', 'Devon C.']), 'transfers', -jitter(ri(1, 8) * 1000, 0.2), { acct: 'chk', method: 'Lynk' });
        } else {
          addTxn(D(y, m, day, ri(10, 21), ri(0, 59)), 'Jam-Dex wallet top-up', 'transfers', -ri(3, 8) * 1000, { acct: 'chk', method: 'Jam-Dex' });
        }
      }
      /* Occasional international card spend */
      if (rnd() > 0.55) {
        const usd = ri(12, 90);
        addTxn(D(y, m, ri(3, dim), ri(9, 22), ri(0, 59)), 'Amazon.com order (US$' + usd + '.00)', 'shopping', -Math.round(usd * 156.85), { acct: 'c1', method: 'Card — online', intl: true, orig: { cur: 'USD', amt: usd } });
      }
    }

    /* One-off larger items in specific past months */
    const nowY = new Date().getFullYear(), nowM = new Date().getMonth();
    addTxn(new Date(nowY, nowM - 2, 12, 19, 22).getTime(), 'Sandals Royal Caribbean — weekend (US$549.00)', 'travel', -86116, { acct: 'c2', method: 'Card — online', intl: true, orig: { cur: 'USD', amt: 549 } });
    addTxn(new Date(nowY, nowM - 2, 9, 11, 3).getTime(), 'Caribbean Airlines — KIN ✈ MIA (US$345.00)', 'travel', -54113, { acct: 'c2', method: 'Card — online', intl: true, orig: { cur: 'USD', amt: 345 } });
    addTxn(new Date(nowY, nowM - 4, 18, 10, 41).getTime(), "Marcia's Bookstore — school books", 'education', -32450, { acct: 'chk', method: 'POS' });
    addTxn(new Date(nowY, nowM - 6, 21, 15, 12).getTime(), 'SWIFT transfer — CAD 1,200 to Toronto family', 'transfers', -190464, { acct: 'sav', method: 'SWIFT', intl: true, orig: { cur: 'CAD', amt: 1200 } });
    addTxn(new Date(nowY, nowM - 1, 7, 13, 48).getTime(), 'USD purchase — travel money (US$500)', 'travel', -78425, { acct: 'sav', method: 'FX', intl: true, orig: { cur: 'USD', amt: 500 } });

    /* Today: a couple of fresh items */
    const nowTs = new Date();
    nowTs.setHours(8, 12, 0, 0);
    addTxn(nowTs.getTime(), 'Brewed Awakening Café — morning run', 'food', -1840, { acct: 'c1', method: 'Card — tap' });
    addTxn(Date.now(), 'Digicel top-up', 'bills', -1200, { acct: 'chk', method: 'Bill pay', status: 'pending' });

    transactions.sort((a, b) => b.ts - a.ts);
  })();

  /* ── Investments ────────────────────────────────────────── */
  const holdings = [
    { id: 'mf', name: 'Island Growth Mutual Fund', type: 'Mutual Fund', icon: 'i-trend-up', value: 1053848.30, pct: 45, chg: 9.1, color: '#00b8a9' },
    { id: 'eq', name: 'Caribbean Blue-Chip Equities', type: 'Stocks · NCB, GK, PROVEN', icon: 'i-case', value: 702565.54, pct: 30, chg: 6.8, color: '#0ea5e9' },
    { id: 'us', name: 'US Index Tracker', type: 'Stocks · USD', icon: 'i-globe', value: 351282.77, pct: 15, chg: 12.4, color: '#eab308', intl: true },
    { id: 'bond', name: 'GOJ Bond Ladder 2027', type: 'Bonds', icon: 'i-bank', value: 234188.51, pct: 10, chg: 3.2, color: '#84cc16' },
  ];

  function walk(start, drift, vol, n) {
    const pts = []; let v = start;
    for (let i = 0; i < n; i++) {
      v = v * (1 + drift + (rnd() * 2 - 1) * vol);
      pts.push(Math.round(v));
    }
    return pts;
  }
  /* 13 monthly portfolio values ending at current total */
  const invTotal = holdings.reduce((s, h) => s + h.value, 0);
  const perfRaw = walk(1960000, 0.0135, 0.03, 13);
  perfRaw[perfRaw.length - 1] = Math.round(invTotal);
  const perfLabels = [];
  for (let i = 12; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i);
    perfLabels.push(d.toLocaleString('en', { month: 'short' }));
  }

  const investments = {
    total: invTotal,
    ytd: 8.42,
    cash: 486213.44,
    perf: perfRaw.map((v, i) => ({ label: perfLabels[i], v })),
    holdings,
    deposits: [
      { id: 'fd1', name: 'Fixed Deposit — Supreme Saver', principal: 500000, rate: 6.75, opened: '1 Mar 2026', maturity: '1 Mar 2027', progress: 0.55, payout: 'At maturity' },
      { id: 'fd2', name: 'Fixed Deposit — 90-day roll', principal: 150000, rate: 5.9, opened: '20 Jul 2026', maturity: '18 Oct 2026', progress: 0.62, payout: 'Monthly interest' },
    ],
  };

  /* Sparkline data per holding */
  holdings.forEach(h => { h.spark = walk(h.value * 0.92, 0.004, 0.05, 14); });

  /* ── Public API ─────────────────────────────────────────── */
  return {
    DEMO, CATS, user, accounts, fx, cards, contacts, bills,
    transactions, investments, luhnValid, makeCardNum,
  };
})();
