/* ═══════════════════════════════════════════════════════════════
   BlueMahoe Bank JM — app.js
   State, persistence, routing, rendering, 2-step verification,
   transfers, cards, investments, statements, animations.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const { CATS, DEMO, user, accounts, fx, contacts, bills, transactions, investments } = window.BM;
  const Charts = window.BMCharts;

  /* ═══════════ HELPERS ═══════════ */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const html = (str) => { const t = document.createElement('template'); t.innerHTML = str.trim(); return t.content.firstElementChild; };
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (id, cls) => `<svg class="ic ${cls || ''}"><use href="#${id}"/></svg>`;

  const CUR = { JMD: 'J$', USD: 'US$', CAD: 'CA$', GBP: '£', EUR: '€' };
  const nf = (n, d = 2) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const money = (n, cur = 'JMD', d = 2) => `${CUR[cur] || cur + ' '}${nf(n, d)}`;
  const money0 = (n, cur = 'JMD') => money(n, cur, 0);
  const dateStr = (ts) => new Date(ts).toLocaleDateString('en-JM', { day: 'numeric', month: 'short', year: 'numeric' });
  const timeStr = (ts) => new Date(ts).toLocaleTimeString('en-JM', { hour: 'numeric', minute: '2-digit' });
  const dayLabel = (ts) => {
    const d = new Date(ts), now = new Date();
    const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((day(now) - day(d)) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    return d.toLocaleDateString('en-JM', { weekday: 'short', day: 'numeric', month: 'short' });
  };
  const initials = (name) => name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const maskPhone = (p) => p.replace(/\d(?=\d{4})/g, '•');
  const uid = () => 'u' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
  const ref6 = () => String(Math.floor(100000 + Math.random() * 900000));

  /* ═══════════ STATE & PERSISTENCE ═══════════ */
  const LS_KEY = 'bm_state_v1';
  const defaults = {
    theme: 'light', view: 'paradise', brand: '', reduceMotion: false,
    remember: true, loggedIn: false, seenWelcome: false, lastLogin: null,
    profileEdits: {}, prefs: { biometric: true, alerts: true, digest: false, promo: false, paperless: true, sessionMin: 10 },
    extraCards: [], cardState: {}, extraTxns: [], extraContacts: [],
    balAdj: {}, investAdj: {}, mask: false,
  };
  let state = Object.assign({}, defaults);
  try { state = Object.assign(state, JSON.parse(localStorage.getItem(LS_KEY) || '{}')); } catch (e) { /* fresh */ }
  state.mask = false; /* never persist hidden balances */
  function save() {
    const s = Object.assign({}, state, { mask: undefined });
    try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch (e) { }
  }

  /* Effective user (with profile edits) */
  function me() { return Object.assign({}, user, state.profileEdits, { initials: initials((state.profileEdits.name || user.name)) }); }

  /* Effective balances */
  const acctEff = (a) => a.balance + (state.balAdj[a.id] || 0);
  const acctAvailable = (a) => acctEff(a) - (a.lien ? a.lien.amount : 0);
  function totals() {
    let bal = 0, lien = 0;
    accounts.forEach(a => {
      const v = a.currency === 'USD' ? acctEff(a) * fx.USD.rate : acctEff(a);
      bal += v;
      if (a.lien) lien += a.lien.amount;
    });
    return { bal, avail: bal - lien, lien };
  }
  function allCards() {
    return [...BM.cards, ...state.extraCards].map(c => {
      const o = state.cardState[c.id] || {};
      return Object.assign({}, c, o, {
        locked: o.locked !== undefined ? o.locked : c.locked,
        atmLimit: o.atmLimit !== undefined ? o.atmLimit : 100000,
        onlineLimit: o.onlineLimit !== undefined ? o.onlineLimit : 150000,
        onlineOn: o.onlineOn !== undefined ? o.onlineOn : true,
        intlOn: o.intlOn !== undefined ? o.intlOn : true,
        contactlessOn: o.contactlessOn !== undefined ? o.contactlessOn : true,
      });
    });
  }
  const cardById = (id) => allCards().find(c => c.id === id);
  function allTxns() { return [...state.extraTxns, ...transactions].sort((a, b) => b.ts - a.ts); }
  function allContacts() { return [...contacts, ...state.extraContacts]; }
  function hVal(h) { return h.value + (state.investAdj[h.id] || 0); }
  function invTotals() {
    const vals = investments.holdings.map(hVal);
    return { total: vals.reduce((s, v) => s + v, 0) };
  }

  /* ═══════════ TOASTS ═══════════ */
  function toast(title, msg, type = 'ok', ms = 3800) {
    const icoMap = { ok: 'i-check-circle', err: 'i-alert', info: 'i-info', warn: 'i-alert', sms: 'i-phone' };
    const t = html(`<div class="toast ${type === 'sms' ? 'info' : type}">
      <span class="toast-ico">${icon(icoMap[type] || 'i-info')}</span>
      <div><b>${esc(title)}</b>${msg ? `<p>${esc(msg)}</p>` : ''}</div></div>`);
    $('#toast-root').appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, ms);
  }

  /* ═══════════ MODALS ═══════════ */
  function openModal(contentHtml, opts) {
    opts = opts || {};
    const m = html(`<div class="modal"><div class="modal-card ${opts.cls || ''}" role="dialog" aria-modal="true">${contentHtml}</div></div>`);
    $('#modal-root').appendChild(m);
    const close = () => { m.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    m.addEventListener('click', (e) => { if (e.target === m) close(); });
    document.addEventListener('keydown', onKey);
    $$('[data-close]', m).forEach(b => b.addEventListener('click', close));
    m.close = close;
    if (opts.onMount) opts.onMount(m, close);
    const f = $('input, select, button.btn-primary', m); if (f) setTimeout(() => f.focus(), 60);
    return m;
  }
  const modalHead = (title, sub) => `<div class="modal-head"><div><h3>${title}</h3>${sub ? `<p>${sub}</p>` : ''}</div>
    <button class="modal-close" data-close aria-label="Close">${icon('i-x')}</button></div>`;

  /* ═══════════ CONFETTI (Paradise view ONLY) ═══════════ */
  function confetti() {
    if (document.documentElement.dataset.view !== 'paradise' || state.reduceMotion) return;
    const cv = $('#confetti-canvas'), ctx = cv.getContext('2d');
    cv.width = innerWidth; cv.height = innerHeight;
    const colors = ['#00b8a9', '#0ea5e9', '#84cc16', '#ffc63d', '#ff5d6c', '#ffffff'];
    const parts = Array.from({ length: 130 }, () => ({
      x: Math.random() * cv.width, y: -20 - Math.random() * cv.height * 0.4,
      w: 6 + Math.random() * 7, h: 8 + Math.random() * 8,
      vy: 2.2 + Math.random() * 3.4, vx: (Math.random() - 0.5) * 2.4,
      rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.22,
      c: colors[Math.floor(Math.random() * colors.length)],
    }));
    const t0 = performance.now();
    (function frame(t) {
      ctx.clearRect(0, 0, cv.width, cv.height);
      parts.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.vy += 0.04;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      if (t - t0 < 2000) requestAnimationFrame(frame); else ctx.clearRect(0, 0, cv.width, cv.height);
    })(t0);
  }

  /* ═══════════ COUNT-UP ═══════════ */
  function countUp(el, target, format) {
    if (state.reduceMotion || document.documentElement.dataset.view === 'simple') {
      el.textContent = format(target); return;
    }
    const t0 = performance.now(), dur = 720;
    let done = false;
    const finish = () => { if (!done) { done = true; el.textContent = format(target); } };
    (function step(t) {
      const p = Math.min((t - t0) / dur, 1);
      el.textContent = format(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1 && !done) requestAnimationFrame(step);
      else finish();
    })(t0);
    /* guarantee the final value even if rAF is throttled in background tabs */
    setTimeout(finish, dur + 120);
  }

  /* ═══════════ OTP (2-Step Verification) ═══════════ */
  let otpCtx = null;
  function requestOtp(opts) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    otpCtx = { code, attempts: 0, onSuccess: opts.onSuccess, onCancel: opts.onCancel };
    $('#otp-title').textContent = opts.title || 'Two-step verification';
    $('#otp-sub').textContent = opts.sub || 'Enter the 6-digit code we sent to your phone.';
    const line = $('#otp-line');
    if (opts.line) { line.hidden = false; line.textContent = opts.line; } else line.hidden = true;
    $('#otp-hint').textContent = code;
    $('#otp-error').hidden = true;
    $$('#otp-row .otp-box').forEach(b => { b.value = ''; b.classList.remove('filled', 'ok'); b.disabled = false; });
    $('#otp-overlay').classList.add('show');
    $('#otp-overlay').setAttribute('aria-hidden', 'false');
    setTimeout(() => $('#otp-row .otp-box').focus(), 120);
    toast('BlueMahoe', `Security code ${code.slice(0, 3)} ${code.slice(3)} sent via SMS`, 'sms');
    startResendTimer(30);
  }
  function closeOtp() {
    $('#otp-overlay').classList.remove('show');
    $('#otp-overlay').setAttribute('aria-hidden', 'true');
    clearInterval(otpCtx && otpCtx.timer);
    otpCtx = null;
  }
  function startResendTimer(sec) {
    const btn = $('#otp-resend'), lab = $('#otp-timer');
    btn.disabled = true; let left = sec;
    lab.textContent = `Resend available in ${left}s`;
    clearInterval(otpCtx.timer);
    otpCtx.timer = setInterval(() => {
      left--;
      if (left <= 0) { clearInterval(otpCtx.timer); lab.textContent = 'Didn\'t get it?'; btn.disabled = false; }
      else lab.textContent = `Resend available in ${left}s`;
    }, 1000);
  }
  (function wireOtp() {
    const boxes = $$('#otp-row .otp-box');
    const row = $('#otp-row');
    boxes.forEach((b, i) => {
      b.addEventListener('input', () => {
        b.value = b.value.replace(/\D/g, '').slice(0, 1);
        b.classList.toggle('filled', !!b.value);
        $('#otp-error').hidden = true; row.classList.remove('err');
        if (b.value && i < boxes.length - 1) boxes[i + 1].focus();
      });
      b.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !b.value && i > 0) boxes[i - 1].focus();
      });
      b.addEventListener('paste', (e) => {
        e.preventDefault();
        const digits = (e.clipboardData.getData('text').match(/\d/g) || []).slice(0, 6);
        digits.forEach((d, k) => { if (boxes[k]) { boxes[k].value = d; boxes[k].classList.add('filled'); } });
        boxes[Math.min(digits.length, 5)].focus();
      });
    });
    $('#otp-autofill').addEventListener('click', () => {
      if (!otpCtx) return;
      otpCtx.code.split('').forEach((d, k) => { boxes[k].value = d; boxes[k].classList.add('filled'); });
      boxes[5].focus();
    });
    $('#otp-resend').addEventListener('click', () => {
      if (!otpCtx) return;
      otpCtx.code = String(Math.floor(100000 + Math.random() * 900000));
      $('#otp-hint').textContent = otpCtx.code;
      toast('BlueMahoe', `New code ${otpCtx.code.slice(0, 3)} ${otpCtx.code.slice(3)} sent`, 'sms');
      startResendTimer(30);
    });
    $('#otp-cancel').addEventListener('click', () => {
      const cb = otpCtx && otpCtx.onCancel; closeOtp(); if (cb) cb();
    });
    $('#otp-verify').addEventListener('click', verifyOtp);
    function verifyOtp() {
      if (!otpCtx) return;
      const entered = boxes.map(b => b.value).join('');
      if (entered.length < 6) { showOtpErr('Enter all 6 digits.'); return; }
      const btn = $('#otp-verify');
      btn.classList.add('loading');
      setTimeout(() => {
        btn.classList.remove('loading');
        if (entered === otpCtx.code) {
          boxes.forEach(b => { b.classList.add('ok'); b.disabled = true; });
          const cb = otpCtx.onSuccess;
          setTimeout(() => { closeOtp(); if (cb) cb(); }, 400);
        } else {
          otpCtx.attempts++;
          if (otpCtx.attempts >= 3) {
            toast('Verification failed', 'Too many attempts. Request a new code.', 'err');
            const cb = otpCtx.onCancel; closeOtp(); if (cb) cb();
          } else {
            showOtpErr(`Incorrect code — ${3 - otpCtx.attempts} attempt${3 - otpCtx.attempts > 1 ? 's' : ''} left.`);
            row.classList.add('err');
            setTimeout(() => { row.classList.remove('err'); boxes.forEach(b => { b.value = ''; b.classList.remove('filled'); }); boxes[0].focus(); }, 480);
          }
        }
      }, 450);
    }
    function showOtpErr(msg) { const e = $('#otp-error'); e.textContent = msg; e.hidden = false; }
  })();

  /* ═══════════ THEME / VIEW MODE ═══════════ */
  function applyTheme() {
    document.documentElement.dataset.theme = state.theme;
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.content = state.theme === 'dark' ? '#04222a' : '#00b8a9';
  }
  function applyView() { document.documentElement.dataset.view = state.view; syncViewToggle(); }
  function setTheme(t) { state.theme = t; applyTheme(); save(); }
  function setView(v, announce) {
    state.view = v; applyView(); save();
    if (announce) toast(v === 'paradise' ? 'Paradise View unlocked 🌴' : 'Simple View on', v === 'paradise' ? 'Glass, glow and motion — the full island experience.' : 'Clean, flat and fast. All features still here.', 'ok');
  }
  function syncViewToggle() {
    $$('#view-toggle .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.setView === state.view));
  }

  /* ═══════════ ROUTER ═══════════ */
  const VIEWS = {
    home: { title: 'Home', sel: '#view-home', render: renderHome },
    txns: { title: 'Transactions', sel: '#view-txns', render: renderTxnsView },
    cards: { title: 'Cards', sel: '#view-cards', render: renderCardsView },
    send: { title: 'Send Money', sel: '#view-send', render: renderSendView },
    invest: { title: 'Investments', sel: '#view-invest', render: renderInvestView },
    statements: { title: 'Statements', sel: '#view-statements', render: renderStatementsView },
    settings: { title: 'Settings', sel: '#view-settings', render: renderSettingsView },
  };
  let currentView = 'home';
  function go(name) {
    if (!VIEWS[name]) return;
    currentView = name;
    $$('#side-nav .nav-item, .bn-item').forEach(b => b.classList.toggle('active', b.dataset.nav === name));
    Object.entries(VIEWS).forEach(([k, v]) => { const el = $(v.sel); if (el) el.hidden = k !== name; });
    $('#page-title').textContent = VIEWS[name].title;
    document.body.classList.remove('nav-open');
    $('#nav-backdrop').classList.remove('show');
    $('.view-root').scrollTop = 0; window.scrollTo({ top: 0 });
    VIEWS[name].render();
  }

  /* ═══════════ TXN ROW BUILDER ═══════════ */
  function catStyle(cat) {
    const c = (CATS[cat] || CATS.other).color;
    return `--cat-bg: color-mix(in oklab, ${c}, transparent 86%); --cat-fg: ${c}`;
  }
  function amtHtml(t) {
    const cur = t.orig ? t.orig.cur : 'JMD';
    const sign = t.amount >= 0 ? '+' : '−';
    const cls = t.amount >= 0 ? 'in' : 'out';
    return `<span class="txn-amt ${cls} num"><span class="cur">${CUR[cur] || cur}</span>${sign}${nf(Math.abs(t.amount))}</span>`;
  }
  function txnRow(t, idx) {
    const cat = CATS[t.cat] || CATS.other;
    const pending = t.status === 'pending';
    return `<button class="txn-item" data-txn="${t.id}" style="animation-delay:${Math.min(idx * 45, 400)}ms">
      <span class="txn-ico" style="${catStyle(t.cat)}">${icon(cat.icon)}</span>
      <span class="txn-main">
        <span class="txn-desc">${esc(t.desc)} ${t.intl ? '<span class="intl-badge">INTL</span>' : ''}</span>
        <span class="txn-meta">${dayLabel(t.ts)} · ${timeStr(t.ts)} · ${esc(t.method)} · ${cat.label}</span>
      </span>
      <span class="txn-right">${amtHtml(t)}
        <span class="txn-status ${pending ? '' : 'done'}">${pending ? 'Pending' : 'Done'}</span></span>
    </button>`;
  }

  function openTxnModal(id) {
    const t = allTxns().find(x => x.id === id);
    if (!t) return;
    const cat = CATS[t.cat] || CATS.other;
    openModal(`${modalHead('Transaction details')}
      <div class="receipt-hero">
        <div class="check-burst" style="--c:${cat.color}">${icon(cat.icon)}</div>
        <div class="hero-amount" style="font-size:1.6rem">${amtHtml(t)}</div>
        <span class="badge ${t.status === 'pending' ? 'badge-warn' : 'badge-ok'}">${t.status === 'pending' ? 'Pending — processing' : 'Completed'}</span>
      </div>
      <div class="review-box">
        <div class="review-row"><span>Description</span><b>${esc(t.desc)}</b></div>
        <div class="review-row"><span>Date &amp; time</span><b>${dateStr(t.ts)} · ${timeStr(t.ts)}</b></div>
        <div class="review-row"><span>Category</span><b>${cat.label}</b></div>
        <div class="review-row"><span>Method</span><b>${esc(t.method)}</b></div>
        <div class="review-row"><span>Account</span><b>${esc(acctLabel(t.acct))}</b></div>
        ${t.orig ? `<div class="review-row"><span>Original amount</span><b>${money(Math.abs(t.orig.amt), t.orig.cur)} · FX applied</b></div>` : ''}
        <div class="review-row"><span>Reference</span><b>${esc(t.ref)}</b></div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-soft" id="tx-rep">Report a problem</button>
        <button class="btn btn-primary" id="tx-share">Share receipt</button>
      </div>`);
    $('#tx-rep').addEventListener('click', () => toast('Report opened', 'Our disputes team will reach out within 24h (demo).', 'info'));
    $('#tx-share').addEventListener('click', () => {
      const txt = `BlueMahoe receipt ${t.ref} — ${t.desc} — ${money(Math.abs(t.amount), t.orig ? t.orig.cur : 'JMD')}`;
      copyText(txt);
    });
  }
  function acctLabel(id) {
    const a = accounts.find(x => x.id === id);
    if (a) return `${a.name} ${a.number}`;
    const c = cardById(id);
    return c ? `${c.brand === 'visa' ? 'Visa' : 'Mastercard'} ${c.kind} ••${c.num.slice(-4)}` : 'Account';
  }
  function copyText(txt) {
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => toast('Copied', 'Receipt details copied to clipboard.', 'ok'));
    else toast('Copy failed', 'Clipboard unavailable.', 'warn');
  }

  /* ═══════════ HOME ═══════════ */
  let heroAcct = 'all';
  function renderHome() {
    const m = me();
    const hr = new Date().getHours();
    $('#hero-greet').textContent = hr < 12 ? 'Good morning ☀️' : hr < 18 ? 'Good afternoon 🌴' : 'Good evening 🌙';
    $('#hero-name').textContent = m.first;

    /* FX rate strip — very slow crawl (~9px/s), pauses on hover */
    const fxItems = Object.entries(fx).map(([k, v]) =>
      `<span class="fx-item"><b>${k}/JMD</b> ${nf(v.rate, 2)} <span class="${v.chg >= 0 ? 'up' : 'down'}">${v.chg >= 0 ? '▲' : '▼'} ${Math.abs(v.chg).toFixed(2)}%</span></span>`).join('')
      + `<span class="fx-item">${icon('i-wifi')} <b>Lynk &amp; Jam-Dex transfers</b> free &amp; instant</span>`;
    const fxTrack = $('#fx-track');
    fxTrack.innerHTML = fxItems + fxItems;
    if (fxTrack.scrollWidth > 0) {
      fxTrack.style.setProperty('animation-duration', Math.max(Math.round(fxTrack.scrollWidth / 2 / 9), 90) + 's', 'important');
    }

    /* Account tabs */
    const tabs = [{ id: 'all', label: 'All accounts' }].concat(accounts.map(a => ({ id: a.id, label: a.name })));
    $('#acct-tabs').innerHTML = tabs.map(t =>
      `<button class="acct-tab ${heroAcct === t.id ? 'active' : ''}" data-acct="${t.id}">${t.label}</button>`).join('');
    $$('#acct-tabs .acct-tab').forEach(b => b.addEventListener('click', () => { heroAcct = b.dataset.acct; renderHome(); }));

    

  function openLienModal() {
    const rows = accounts.filter(a => a.lien).map(a => `
      <div class="review-box">
        <div class="review-row"><span>Account</span><b>${a.name} ${a.number}</b></div>
        <div class="review-row"><span>Amount on hold</span><b class="num">${money(a.lien.amount)}</b></div>
        <div class="review-row"><span>Reason</span><b>${esc(a.lien.reason)}</b></div>
        <div class="review-row"><span>Reference</span><b>${esc(a.lien.ref)} · placed ${esc(a.lien.placed)}</b></div>
        <div class="review-row"><span>Note</span><b style="max-width:60%">${esc(a.lien.note)}</b></div>
      </div>`).join('');
    openModal(`${modalHead('Lien holds on your accounts', 'A lien temporarily restricts part of your balance. It remains yours but can\'t be spent until released.')}
      ${rows}
      <div class="review-row" style="padding:10px 4px"><span>Total on hold</span><b class="num" style="color:var(--warn)">${money(totals().lien)}</b></div>
      <div class="modal-foot">
        <button class="btn btn-soft" data-close>Close</button>
        <button class="btn btn-primary" id="lien-crm">${icon('i-phone')} Contact relationship manager</button>
      </div>`);
    $('#lien-crm').addEventListener('click', () => toast('Request sent', 'Your relationship manager will call you today (demo).', 'ok'));
  }

  function renderQuickActions() {
    const qa = [
      { id: 'send', label: 'Send money', icon: 'i-send', cls: '' },
      { id: 'bill', label: 'Pay bills', icon: 'i-receipt', cls: 'alt-1' },
      { id: 'addcard', label: 'Add card', icon: 'i-plus', cls: 'alt-2' },
      { id: 'lock', label: 'Lock cards', icon: 'i-snow', cls: 'alt-3' },
      { id: 'stmt', label: 'Statements', icon: 'i-file', cls: '' },
      { id: 'invest', label: 'Invest', icon: 'i-trend-up', cls: 'alt-1' },
      { id: 'lien', label: 'Lien info', icon: 'i-shield', cls: 'alt-2' },
      { id: 'help', label: 'Help', icon: 'i-help', cls: 'alt-3' },
    ];
    $('#qa-grid').innerHTML = qa.map((q, i) =>
      `<button class="qa" data-qa="${q.id}" style="animation-delay:${i * 45}ms"><span class="qa-ico ${q.cls}">${icon(q.icon)}</span>${q.label}</button>`).join('');
    $$('#qa-grid .qa').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.qa;
      if (id === 'send') go('send');
      else if (id === 'bill') { sendState.mode = 'bill'; sendState.step = 0; go('send'); }
      else if (id === 'addcard') openAddCard();
      else if (id === 'lock') openQuickLock();
      else if (id === 'stmt') go('statements');
      else if (id === 'invest') go('invest');
      else if (id === 'lien') openLienModal();
      else openHelp();
    }));
  }

  function renderMiniCards() {
    const wrap = $('#mini-cards');
    wrap.innerHTML = allCards().map(c => `
      <button class="mcard ${c.locked ? 'is-locked' : ''}" data-card="${c.id}">
        <span class="mcard-swatch g-${c.grad}"></span>
        <span class="mcard-main"><b>${c.brand === 'visa' ? 'Visa' : 'Mastercard'} ${c.kind} · ${c.tier}</b>
          <span>•••• ${c.num.slice(-4)} · exp ${c.exp}</span></span>
        <span class="mcard-lock">${icon(c.locked ? 'i-lock' : 'i-unlock')}</span>
      </button>`).join('');
    $$('#mini-cards .mcard').forEach(b => b.addEventListener('click', () => { selectedCardId = b.dataset.card; go('cards'); }));
  }

  function monthSpend() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const byCat = {};
    allTxns().forEach(t => {
      if (t.ts < start || t.amount >= 0) return;
      byCat[t.cat] = (byCat[t.cat] || 0) + Math.abs(t.amount);
    });
    const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((s, e) => s + e[1], 0);
    return { entries, total };
  }

  function renderSpend() {
    const { entries, total } = monthSpend();
    $('#spend-total').textContent = state.mask ? '••••••' : money0(total);
    const top = entries.slice(0, 5).map(([cat, v]) => ({
      label: (CATS[cat] || CATS.other).label, value: v,
      color: (CATS[cat] || CATS.other).color,
    }));
    const rest = entries.slice(5).reduce((s, e) => s + e[1], 0);
    if (rest > 0) top.push({ label: 'Everything else', value: rest, color: '#94a3b8' });
    if (!top.length) {
      $('#spend-donut').innerHTML = `<div class="txn-empty" style="padding:30px"><p>No spending yet this month 🎉</p></div>`;
      $('#spend-legend').innerHTML = '';
      return;
    }
    Charts.donut($('#spend-donut'), top, { centerLabel: 'This month', centerValue: state.mask ? '••••' : 'J$' + compact(total) });
    $('#spend-legend').innerHTML = top.map((it, i) => {
      const pct = Math.round(it.value / total * 100);
      return `<div class="legend-item" style="animation-delay:${i * 70}ms">
        <span class="swatch" style="background:${it.color}"></span>${esc(it.label)}
        <b class="num">${state.mask ? '••••' : nf(it.value, 0)}</b><span class="pct">${pct}%</span></div>`;
    }).join('');
  }
  const compact = (n) => n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(Math.round(n));

  function renderRecent() {
    $('#txn-preview').innerHTML = allTxns().slice(0, 6).map((t, i) => txnRow(t, i)).join('');
    wireTxnClicks($('#txn-preview'));
  }
  function wireTxnClicks(root) {
    $$('[data-txn]', root).forEach(b => b.addEventListener('click', () => openTxnModal(b.dataset.txn)));
  }

  function renderCashflow() {
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = d.getTime(), end = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
      let inc = 0, sp = 0;
      allTxns().forEach(t => { if (t.ts < start || t.ts >= end) return; if (t.amount > 0) inc += t.amount; else sp += Math.abs(t.amount); });
      months.push({ label: d.toLocaleString('en', { month: 'short' }), income: inc, spend: sp });
    }
    Charts.bars($('#cashflow-bars'), months);
  }

  function renderInvestTeaser() {
    const { total } = invTotals();
    $('#invest-teaser').innerHTML = `
      <div class="invest-teaser">
        <div class="it-main">
          <h4>Investment portfolio</h4>
          <div class="it-val num">${state.mask ? '•••••••' : money(total)}</div>
          <span class="badge badge-ok">${icon('i-trend-up')} +${investments.ytd}% YTD</span>
        </div>
        <div class="it-spark" id="teaser-spark"></div>
        <button class="btn btn-soft" data-nav="invest">View${icon('i-chev-right')}</button>
      </div>`;
    Charts.spark($('#teaser-spark'), investments.perf.slice(-12).map(p => p.v), { color: 'var(--lime)' });
  }

  function openHelp() {
    openModal(`${modalHead('How can we help?')}
      <div class="review-box">
        <div class="review-row"><span>Customer care (24/7)</span><b>888-YES-BLUE</b></div>
        <div class="review-row"><span>Email</span><b>care@bluemahoe.jm</b></div>
        <div class="review-row"><span>Lost or stolen card</span><b>888-937-2583 · option 2</b></div>
        <div class="review-row"><span>Branch</span><b>${esc(user.branch)}</b></div>
      </div>
      <div class="modal-foot"><button class="btn btn-primary" data-close>Got it</button></div>`);
  }

  /* ═══════════ TRANSACTIONS VIEW ═══════════ */
  const txnFilter = { q: '', cat: 'all', period: '90', acct: 'all', shown: 25 };
  function filteredTxns() {
    const now = Date.now();
    const days = txnFilter.period === 'all' ? Infinity : +txnFilter.period;
    const start = now - days * 86400000;
    const q = txnFilter.q.toLowerCase();
    return allTxns().filter(t => {
      if (t.ts < start) return false;
      if (txnFilter.cat !== 'all' && t.cat !== txnFilter.cat) return false;
      if (txnFilter.acct !== 'all' && t.acct !== txnFilter.acct) return false;
      if (q && !(t.desc.toLowerCase().includes(q) || (CATS[t.cat] || CATS.other).label.toLowerCase().includes(q) || t.method.toLowerCase().includes(q))) return false;
      return true;
    });
  }
  function renderTxnsView() {
    /* account filter options */
    const sel = $('#txn-acct');
    if (sel.options.length <= 1) {
      accounts.forEach(a => sel.appendChild(html(`<option value="${a.id}">${a.name} ${a.number}</option>`)));
      allCards().forEach(c => sel.appendChild(html(`<option value="${c.id}">${c.brand === 'visa' ? 'Visa' : 'Mastercard'} ••${c.num.slice(-4)}</option>`)));
    }
    /* category chips */
    const cats = ['all'].concat(Object.keys(CATS));
    $('#txn-cat-chips').innerHTML = cats.map(c =>
      `<button class="chip ${txnFilter.cat === c ? 'active' : ''}" data-cat="${c}">${c === 'all' ? 'All categories' : CATS[c].label}</button>`).join('');
    $$('#txn-cat-chips .chip').forEach(b => b.addEventListener('click', () => { txnFilter.cat = b.dataset.cat; txnFilter.shown = 25; renderTxnsView(); }));

    $('#txn-search').value = txnFilter.q;
    $('#txn-period').value = txnFilter.period;
    sel.value = txnFilter.acct;

    const list = filteredTxns();
    const shown = list.slice(0, txnFilter.shown);
    let out = '', lastDay = '';
    shown.forEach((t, i) => {
      const dl = dayLabel(t.ts);
      if (dl !== lastDay) { out += `<div class="txn-group">${dl}</div>`; lastDay = dl; }
      out += txnRow(t, i);
    });
    $('#txn-list').innerHTML = out;
    wireTxnClicks($('#txn-list'));
    $('#txn-empty').hidden = list.length > 0;
    $('#txn-more').hidden = list.length <= txnFilter.shown;
  }
  function wireTxnFilters() {
    $('#txn-search').addEventListener('input', (e) => { txnFilter.q = e.target.value; txnFilter.shown = 25; renderTxnsView(); });
    $('#txn-period').addEventListener('change', (e) => { txnFilter.period = e.target.value; txnFilter.shown = 25; renderTxnsView(); });
    $('#txn-acct').addEventListener('change', (e) => { txnFilter.acct = e.target.value; txnFilter.shown = 25; renderTxnsView(); });
    $('#txn-more').addEventListener('click', () => { txnFilter.shown += 25; renderTxnsView(); });
    $('#btn-csv').addEventListener('click', exportCsv);
  }
  function exportCsv() {
    const rows = [['Date', 'Description', 'Category', 'Method', 'Account', 'Amount', 'Original', 'Status', 'Reference']];
    filteredTxns().forEach(t => rows.push([
      new Date(t.ts).toISOString().slice(0, 10), t.desc, (CATS[t.cat] || CATS.other).label, t.method,
      acctLabel(t.acct), t.amount, t.orig ? `${t.orig.amt} ${t.orig.cur}` : '', t.status, t.ref,
    ]));
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'bluemahoe-transactions.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Export ready', `${rows.length - 1} transactions downloaded as CSV.`, 'ok');
  }

  /* ═══════════ CARDS VIEW ═══════════ */
  let selectedCardId = 'c1';
  function brandLogo(brand) {
    return brand === 'visa'
      ? `<span class="brand-visa"><span>VISA</span></span>`
      : `<span class="brand-mc"><svg viewBox="0 0 48 30" aria-label="Mastercard"><circle cx="19" cy="15" r="12" fill="#eb001b" opacity=".9"/><circle cx="29" cy="15" r="12" fill="#f79e1b" opacity=".9"/></svg></span>`;
  }
  function cardFront(c) {
    return `<div class="ccard-face ccard-front g-${c.grad}">
      <div class="ccard-top">
        <div class="ccard-bank"><svg><use href="#i-logo"/></svg>BlueMahoe</div>
        <div class="ccard-kind">${esc(c.tier)}<br/>${c.kind}</div>
      </div>
      <div class="ccard-mid"><div class="ccard-chip"></div><svg class="ccard-contactless"><use href="#i-wifi"/></svg></div>
      <div class="ccard-num num">•••• •••• •••• ${c.num.slice(-4)}</div>
      <div class="ccard-holdrow">
        <div class="ccard-hold"><span class="ccard-lab">Card holder</span><span class="ccard-val">${esc(c.holder)}</span></div>
        <div class="ccard-hold"><span class="ccard-lab">Expires</span><span class="ccard-val">${c.exp}</span></div>
        <div>${brandLogo(c.brand)}</div>
      </div>
      <div class="net-badges">
        ${c.lynk ? '<span class="net-badge lynk">Lynk linked</span>' : ''}
        ${c.jamdex ? '<span class="net-badge jamdex">Jam-Dex ready</span>' : ''}
        <span class="net-badge">Contactless</span>
      </div>
      ${c.locked ? lockStamp() : ''}
    </div>`;
  }
  function cardBack(c) {
    return `<div class="ccard-face ccard-back">
      <div class="ccard-bank"><svg><use href="#i-logo"/></svg>BlueMahoe</div>
      <div class="ccard-stripe"></div>
      <div class="ccard-sig"><i></i><span class="ccard-cvv num">CVV ${c.cvv}</span></div>
      <div class="ccard-num num" style="margin:14px 22px 0;font-size:.85rem">${c.num.replace(/(\d{4})(?=\d)/g, '$1 ')}</div>
      <div class="ccard-backfoot">If found, call 888-YES-BLUE · BlueMahoe Bank Ltd · This card is property of the issuing bank (demo).</div>
    </div>`;
  }
  const lockStamp = () => `<div class="lock-stamp"><b>${icon('i-lock')}LOCKED</b></div>`;

  function renderCardsView() {
    if (!cardById(selectedCardId)) selectedCardId = allCards()[0].id;
    const carousel = $('#cards-carousel');
    carousel.innerHTML = allCards().map(c => `
      <div class="card-slide" data-slide="${c.id}">
        <div class="ccard3d ${c.id === selectedCardId ? '' : 'dimmed'}" data-card3d="${c.id}">
          ${cardFront(c)}${cardBack(c)}
        </div>
      </div>`).join('') + `
      <div class="card-slide"><button class="ghost-add" id="ghost-add" style="width:100%;height:100%;min-height:240px">
        ${icon('i-plus')}<span>Add a new card</span><span class="muted" style="font-size:.78rem">Visa or Mastercard · instant issue</span>
      </button></div>`;

    /* dots */
    $('#carousel-dots').innerHTML = allCards().map(c => `<i class="${c.id === selectedCardId ? 'on' : ''}" data-dot="${c.id}"></i>`).join('');
    $$('#carousel-dots i').forEach(d => d.addEventListener('click', () => scrollToCard(d.dataset.dot)));

    /* interactions */
    $$('[data-card3d]', carousel).forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.card3d;
        if (selectedCardId !== id) { selectedCardId = id; renderCardsView(); scrollToCard(id); }
        else el.classList.toggle('flipped');
      });
    });
    $('#ghost-add').addEventListener('click', openAddCard);
    carousel.addEventListener('scroll', () => {
      const slide = $('.card-slide', carousel);
      if (!slide) return;
      const idx = Math.round(carousel.scrollLeft / (slide.offsetWidth + 20));
      const id = allCards()[Math.min(idx, allCards().length - 1)];
      if (id && id.id !== selectedCardId && idx >= 0 && idx < allCards().length) {
        selectedCardId = id.id;
        $$('#carousel-dots i').forEach(d => d.classList.toggle('on', d.dataset.dot === id.id));
        renderCardControls();
      }
    }, { passive: true });

    renderCardControls();
    setTimeout(() => scrollToCard(selectedCardId, true), 60);
  }
  function scrollToCard(id, instant) {
    const slide = $(`.card-slide[data-slide="${id}"]`);
    const car = $('#cards-carousel');
    if (slide && car) car.scrollTo({ left: slide.offsetLeft - 8, behavior: instant || state.reduceMotion ? 'auto' : 'smooth' });
    $$('#carousel-dots i').forEach(d => d.classList.toggle('on', d.dataset.dot === id));
  }

  function renderCardControls() {
    const c = cardById(selectedCardId);
    if (!c) { $('#card-controls').innerHTML = ''; return; }
    const usagePct = Math.min(c.used / c.limit * 100, 100);
    $('#card-controls').innerHTML = `
      <div class="panel">
        <div class="panel-head">
          <h3>${c.brand === 'visa' ? 'Visa' : 'Mastercard'} ${c.kind} · ••${c.num.slice(-4)}
            ${c.locked ? '<span class="badge badge-err">' + icon('i-lock') + ' Locked</span>' : '<span class="badge badge-ok">' + icon('i-check') + ' Active</span>'}</h3>
          <button class="btn btn-soft btn-sm" id="btn-flip">${icon('i-eye')} Flip card</button>
        </div>
        <div class="ctrl-grid">
          <div>
            ${c.kind === 'credit' ? `
              <p class="muted" style="font-size:.85rem;font-weight:600">Credit used this cycle</p>
              <div class="hero-amount num" style="font-size:1.5rem">${money(c.used)} <span class="muted" style="font-size:.85rem">of ${money0(c.limit)}</span></div>
              <div class="usage-bar"><i class="${usagePct > 75 ? 'warn' : ''}" style="width:${usagePct}%"></i></div>
              <p class="muted" style="font-size:.78rem;margin-top:6px">${money0(c.limit - c.used)} credit remaining · due 28 ${new Date().toLocaleString('en', { month: 'long' })}</p>`
        : `
              <p class="muted" style="font-size:.85rem;font-weight:600">Monthly spend on this card</p>
              <div class="hero-amount num" style="font-size:1.5rem">${money0(c.used)} <span class="muted" style="font-size:.85rem">of ${money0(c.limit)} limit</span></div>
              <div class="usage-bar"><i class="${usagePct > 75 ? 'warn' : ''}" style="width:${usagePct}%"></i></div>`}
            <div class="net-badges" style="margin-top:14px">
              <span class="net-badge lynk">Lynk ${c.lynk ? 'linked' : 'off'}</span>
              <span class="net-badge jamdex">Jam-Dex ${c.jamdex ? 'ready' : 'off'}</span>
              <span class="net-badge">Intl ${c.intlOn ? 'on' : 'off'}</span>
              <span class="net-badge">Online ${c.onlineOn ? 'on' : 'off'}</span>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:10px">
            <button class="btn ${c.locked ? 'btn-primary' : 'btn-danger'}" id="btn-lock">${icon(c.locked ? 'i-unlock' : 'i-snow')} ${c.locked ? 'Unlock card' : 'Lock card now'}</button>
            <button class="btn btn-soft" id="btn-limits">${icon('i-sliders')} Spending limits</button>
            <button class="btn btn-soft" id="btn-stolen">${icon('i-alert')} Report lost / stolen</button>
            <p class="muted" style="font-size:.76rem">Locks are instant and free. Any recurring payments on a locked card will be declined.</p>
          </div>
        </div>
      </div>`;
    $('#btn-flip').addEventListener('click', () => $(`.ccard3d[data-card3d="${c.id}"]`).classList.toggle('flipped'));
    $('#btn-lock').addEventListener('click', () => toggleCardLock(c.id));
    $('#btn-limits').addEventListener('click', () => openLimits(c.id));
    $('#btn-stolen').addEventListener('click', () => openStolen(c.id));
  }

  function toggleCardLock(id, silent) {
    const o = state.cardState[id] = state.cardState[id] || {};
    o.locked = !(cardById(id).locked);
    save();
    const c = cardById(id);
    if (currentView === 'cards') { renderCardsView(); }
    if (currentView === 'home') renderHome();
    if (!silent) {
      if (o.locked) toast('Card locked 🔒', `••${c.num.slice(-4)} was frozen instantly. All new payments will be declined.`, 'warn');
      else toast('Card unlocked', `••${c.num.slice(-4)} is active again. Stay safe!`, 'ok');
    }
  }
  function openQuickLock() {
    openModal(`${modalHead('Lock cards', 'Freeze a card instantly if it\'s misplaced, stolen, or you spot unauthorized transactions.')}
      <div id="ql-list">${allCards().map(c => `
        <div class="set-row">
          <div class="sr-main"><b>${c.brand === 'visa' ? 'Visa' : 'Mastercard'} ${c.kind} · ••${c.num.slice(-4)}</b>
            <span>${c.tier} · exp ${c.exp}</span></div>
          <button class="toggle ${c.locked ? 'on' : ''} ${c.locked ? 'err' : ''}" data-ql="${c.id}" aria-label="Toggle lock"></button>
        </div>`).join('')}</div>
      <div class="modal-foot"><button class="btn btn-soft" data-close>Done</button></div>`);
    $$('#ql-list [data-ql]').forEach(b => b.addEventListener('click', () => {
      toggleCardLock(b.dataset.ql);
      b.classList.toggle('on');
      b.classList.toggle('err', b.classList.contains('on'));
    }));
  }
  function openLimits(id) {
    const c = cardById(id);
    openModal(`${modalHead('Spending limits', `Visa ${c.kind} · ••${c.num.slice(-4)}`)}
      <div class="limit-row">
        <label>ATM daily withdrawal <b class="num" id="lv-atm">${money0(c.atmLimit)}</b></label>
        <input type="range" id="lm-atm" min="10000" max="100000" step="5000" value="${c.atmLimit}">
      </div>
      <div class="limit-row">
        <label>Online monthly spend <b class="num" id="lv-on">${money0(c.onlineLimit)}</b></label>
        <input type="range" id="lm-on" min="0" max="200000" step="5000" value="${c.onlineLimit}">
      </div>
      <div class="set-row"><div class="sr-main"><b>Online payments</b><span>e-commerce &amp; subscriptions</span></div>
        <button class="toggle ${c.onlineOn ? 'on' : ''}" id="tg-online"></button></div>
      <div class="set-row"><div class="sr-main"><b>International use</b><span>outside Jamaica</span></div>
        <button class="toggle ${c.intlOn ? 'on' : ''}" id="tg-intl"></button></div>
      <div class="set-row"><div class="sr-main"><b>Contactless</b><span>tap to pay</span></div>
        <button class="toggle ${c.contactlessOn ? 'on' : ''}" id="tg-ct"></button></div>
      <div class="modal-foot">
        <button class="btn btn-soft" data-close>Cancel</button>
        <button class="btn btn-primary" id="lim-save">Save limits</button>
      </div>`);
    $('#lm-atm').addEventListener('input', e => $('#lv-atm').textContent = money0(+e.target.value));
    $('#lm-on').addEventListener('input', e => $('#lv-on').textContent = money0(+e.target.value));
    ['tg-online', 'tg-intl', 'tg-ct'].forEach(tid => $('#' + tid).addEventListener('click', e => e.currentTarget.classList.toggle('on')));
    $('#lim-save').addEventListener('click', () => {
      const o = state.cardState[id] = state.cardState[id] || {};
      o.atmLimit = +$('#lm-atm').value;
      o.onlineLimit = +$('#lm-on').value;
      o.onlineOn = $('#tg-online').classList.contains('on');
      o.intlOn = $('#tg-intl').classList.contains('on');
      o.contactlessOn = $('#tg-ct').classList.contains('on');
      save();
      toast('Limits updated', 'New spending controls are live.', 'ok');
      $('.modal').close();
      if (currentView === 'cards') renderCardsView();
    });
  }
  function openStolen(id) {
    const c = cardById(id);
    openModal(`${modalHead('Report lost or stolen card', 'We\'ll freeze this card immediately and issue a replacement.')}
      <div class="otp-required-note">${icon('i-alert')}
        <span>You\'ll be locking <b>${c.brand === 'visa' ? 'Visa' : 'Mastercard'} ${c.kind} ••${c.num.slice(-4)}</b>. Any unauthorized transactions can be disputed for a refund once reported.</span></div>
      <div class="modal-foot">
        <button class="btn btn-soft" data-close>My card turned up</button>
        <button class="btn btn-danger" id="st-go">Freeze &amp; replace</button>
      </div>`);
    $('#st-go').addEventListener('click', () => {
      state.cardState[id] = state.cardState[id] || {};
      state.cardState[id].locked = true;
      save();
      $('.modal').close();
      if (currentView === 'cards') renderCardsView();
      if (currentView === 'home') renderHome();
      toast('Card frozen & replacement ordered', 'A new card arrives in 3–5 business days. Dispute team will call you.', 'warn', 5000);
    });
  }

  /* ── Add card flow ── */
  function openAddCard() {
    const draft = { num: '', brand: null, grad: 'tide', kind: 'debit', lynk: false, jamdex: true, holder: (state.profileEdits.name || user.name).toUpperCase(), exp: '', cvv: '' };
    const m = openModal(`${modalHead('Add a new card', 'Virtual card issued instantly once verified.')}
      <div class="ccard3d" id="ac-preview" style="max-width:340px;margin:0 auto 18px;cursor:default">
        <div class="ccard-face ccard-front g-tide">
          <div class="ccard-top"><div class="ccard-bank"><svg><use href="#i-logo"/></svg>BlueMahoe</div><div class="ccard-kind">New<br/>card</div></div>
          <div class="ccard-mid"><div class="ccard-chip"></div></div>
          <div class="ccard-num num" id="ac-num">•••• •••• •••• ••••</div>
          <div class="ccard-holdrow">
            <div class="ccard-hold"><span class="ccard-lab">Card holder</span><span class="ccard-val" id="ac-holder">${esc(draft.holder)}</span></div>
            <div class="ccard-hold"><span class="ccard-lab">Expires</span><span class="ccard-val" id="ac-exp">MM/YY</span></div>
            <div id="ac-brand"></div>
          </div>
          <div class="net-badges" id="ac-badges"><span class="net-badge jamdex">Jam-Dex ready</span></div>
        </div>
      </div>
      <div class="field"><label>Card number</label><div class="input-wrap">${icon('i-card')}
        <input id="ac-num-in" inputmode="numeric" placeholder="1234 5678 9012 3456" maxlength="19"></div></div>
      <div class="field"><label>Cardholder name</label><div class="input-wrap">${icon('i-user')}
        <input id="ac-holder-in" placeholder="NAME ON CARD" maxlength="26"></div></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="field"><label>Expiry (MM/YY)</label><div class="input-wrap">${icon('i-calendar')}
          <input id="ac-exp-in" inputmode="numeric" placeholder="09/29" maxlength="5"></div></div>
        <div class="field"><label>CVV</label><div class="input-wrap">${icon('i-shield')}
          <input id="ac-cvv-in" inputmode="numeric" placeholder="•••" maxlength="4" type="password"></div></div>
      </div>
      <div class="field"><label>Card type</label><div class="seg" style="width:100%" id="ac-kind">
        <button class="seg-btn active" data-kind="debit" style="flex:1;justify-content:center">Debit</button>
        <button class="seg-btn" data-kind="credit" style="flex:1;justify-content:center">Credit</button></div></div>
      <div class="field"><label>Card style</label><div class="brand-swatches">
        ${['reef', 'sunset', 'lagoon', 'tide'].map(g => `<button class="swatch g-${g} ${g === 'tide' ? 'on' : ''}" data-grad="${g}" style="border-radius:10px"></button>`).join('')}
      </div></div>
      <div class="set-row"><div class="sr-main"><b>Link to Lynk</b><span>Pay &amp; receive with your Lynk ID</span></div>
        <button class="toggle" id="ac-lynk"></button></div>
      <div class="set-row"><div class="sr-main"><b>Jam-Dex ready</b><span>Central bank digital wallet</span></div>
        <button class="toggle on" id="ac-jamdex"></button></div>
      <p class="form-error" id="ac-error" hidden></p>
      <div class="modal-foot">
        <button class="btn btn-soft" data-close>Cancel</button>
        <button class="btn btn-primary" id="ac-submit">${icon('i-shield')} Verify &amp; add card</button>
      </div>`);

    const brandFromNum = (n) => n.startsWith('4') ? 'visa' : (n.startsWith('5') || n.startsWith('2')) ? 'mastercard' : null;
    function refresh() {
      $('#ac-num', m).textContent = draft.num ? draft.num.replace(/(\d{4})(?=\d)/g, '$1 ') : '•••• •••• •••• ••••';
      $('#ac-holder', m).textContent = draft.holder || 'YOUR NAME';
      $('#ac-exp', m).textContent = draft.exp || 'MM/YY';
      $('#ac-brand', m).innerHTML = draft.brand ? brandLogo(draft.brand) : '';
      $('#ac-badges', m).innerHTML =
        (draft.lynk ? '<span class="net-badge lynk">Lynk linked</span>' : '') +
        (draft.jamdex ? '<span class="net-badge jamdex">Jam-Dex ready</span>' : '') +
        '<span class="net-badge">Contactless</span>';
      const face = $('#ac-preview .ccard-face', m);
      face.className = `ccard-face ccard-front g-${draft.grad}`;
    }
    $('#ac-num-in', m).addEventListener('input', (e) => {
      const digits = e.target.value.replace(/\D/g, '').slice(0, 16);
      e.target.value = digits.replace(/(\d{4})(?=\d)/g, '$1 ');
      draft.num = digits; draft.brand = digits.length >= 1 ? brandFromNum(digits) : null;
      refresh();
    });
    $('#ac-holder-in', m).addEventListener('input', (e) => { draft.holder = e.target.value.toUpperCase(); refresh(); });
    $('#ac-exp-in', m).addEventListener('input', (e) => {
      let d = e.target.value.replace(/\D/g, '').slice(0, 4);
      if (d.length > 2) d = d.slice(0, 2) + '/' + d.slice(2);
      e.target.value = d; draft.exp = d; refresh();
    });
    $('#ac-cvv-in', m).addEventListener('input', (e) => { draft.cvv = e.target.value.replace(/\D/g, '').slice(0, 4); });
    $$('#ac-kind .seg-btn', m).forEach(b => b.addEventListener('click', () => {
      $$('#ac-kind .seg-btn', m).forEach(x => x.classList.remove('active'));
      b.classList.add('active'); draft.kind = b.dataset.kind;
    }));
    $$('[data-grad]', m).forEach(b => b.addEventListener('click', () => {
      $$('[data-grad]', m).forEach(x => x.classList.remove('on'));
      b.classList.add('on'); draft.grad = b.dataset.grad; refresh();
    }));
    $('#ac-lynk', m).addEventListener('click', e => { e.currentTarget.classList.toggle('on'); draft.lynk = e.currentTarget.classList.contains('on'); });
    $('#ac-jamdex', m).addEventListener('click', e => { e.currentTarget.classList.toggle('on'); draft.jamdex = e.currentTarget.classList.contains('on'); });

    $('#ac-submit', m).addEventListener('click', () => {
      const err = $('#ac-error', m);
      const fail = (msg) => { err.textContent = msg; err.hidden = false; $('.modal-card', m).classList.remove('shake'); void $('.modal-card', m).offsetWidth; $('.modal-card', m).classList.add('shake'); };
      if (draft.num.length !== 16) return fail('Card number must be 16 digits.');
      if (!BM.luhnValid(draft.num)) return fail('That card number failed validation — please check it.');
      if (!draft.brand) return fail('Only Visa and Mastercard are supported.');
      if (!/^\d{2}\/\d{2}$/.test(draft.exp)) return fail('Expiry must be MM/YY.');
      const [mm, yy] = draft.exp.split('/').map(Number);
      if (mm < 1 || mm > 12) return fail('Expiry month must be 01–12.');
      const nowY = new Date().getFullYear() % 100, nowM = new Date().getMonth() + 1;
      if (yy < nowY || (yy === nowY && mm < nowM)) return fail('That card has expired.');
      if (draft.cvv.length < 3) return fail('CVV must be 3–4 digits.');
      err.hidden = true;
      const btn = $('#ac-submit', m);
      btn.classList.add('loading');
      btn.querySelector('.btn-label') && (btn.innerHTML = '<span class="btn-spinner"></span>');
      setTimeout(() => {
        const card = {
          id: uid(), brand: draft.brand, kind: draft.kind, tier: draft.kind === 'credit' ? 'Platinum' : 'Standard',
          num: draft.num, holder: draft.holder, exp: draft.exp, cvv: draft.cvv,
          locked: false, lynk: draft.lynk, jamdex: draft.jamdex, grad: draft.grad,
          limit: draft.kind === 'credit' ? 250000 : 200000, used: 0, added: 'Today',
        };
        state.extraCards.push(card);
        save();
        confetti();
        toast('Card added 💳', `${draft.brand === 'visa' ? 'Visa' : 'Mastercard'} ${draft.kind} ••${draft.num.slice(-4)} is ready to use.`, 'ok');
        selectedCardId = card.id;
        m.close();
        if (currentView === 'cards') renderCardsView();
        if (currentView === 'home') renderHome();
      }, 1050);
    });
    refresh();
  }

  /* ═══════════ SEND MONEY ═══════════ */
  const sendState = { mode: 'local', step: 0, data: {} };
  function resetSend() { sendState.step = 0; sendState.data = { acct: 'chk', cur: 'USD', contact: null, amount: null, note: '' }; }
  const STEP_NAMES = ['Recipient', 'Amount', 'Review'];

  function sendFee(mode, jmd) {
    if (mode === 'intl') return Math.max(Math.round(jmd * 0.0075), 500);
    return 0;
  }

  function renderSendView() {
    $$('#send-tabs .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === sendState.mode));
    $$('#send-tabs .seg-btn').forEach(b => b.onclick = () => { sendState.mode = b.dataset.mode; sendState.step = 0; renderSendView(); });

    $('#send-steps').innerHTML = STEP_NAMES.map((n, i) =>
      `<div class="step ${i === sendState.step ? 'active' : i < sendState.step ? 'done' : ''}"><i>${i < sendState.step ? '✓' : i + 1}</i>${n}</div>` +
      (i < STEP_NAMES.length - 1 ? `<span class="step-line ${i < sendState.step ? 'done' : ''}"></span>` : '')).join('');

    const body = $('#send-body');
    body.className = `send-step-body ${sendState._back ? 'step-body-back' : ''}`;
    sendState._back = false;
    const d = sendState.data;

    if (sendState.mode === 'local') renderLocalStep(body, d);
    else if (sendState.mode === 'intl') renderIntlStep(body, d);
    else renderBillStep(body, d);

    renderSendSide(d);
  }

  function renderLocalStep(body, d) {
    if (sendState.step === 0) {
      body.innerHTML = `
        <h4 style="margin-bottom:12px">Who are you sending to?</h4>
        <div class="contact-grid">${allContacts().map(c => `
          <button class="contact-chip ${d.contact === c.id ? 'sel' : ''}" data-contact="${c.id}">
            <span class="contact-av" style="background:${c.color}">${esc(initials(c.name))}
              ${c.method === 'lynk' ? `<span class="net">${icon('i-wifi')}</span>` : c.method === 'jamdex' ? `<span class="net" style="background:var(--sun)">${icon('i-check')}</span>` : ''}</span>
            <b>${esc(c.name)}</b><span>${esc(c.sub)}</span>
          </button>`).join('')}
        </div>
        <button class="btn btn-soft btn-block" id="sd-new">${icon('i-plus')} New recipient</button>
        <div id="sd-new-form" ${d.newOpen ? '' : 'hidden'} style="margin-top:14px">
          <div class="field"><label>Recipient name</label><div class="input-wrap">${icon('i-user')}<input id="sd-n-name" placeholder="Full name" value="${esc(d.name || '')}"></div></div>
          <div class="field"><label>Destination</label><div class="input-wrap">${icon('i-bank')}
            <select id="sd-n-bank">${['Lynk Wallet', 'Jam-Dex Wallet', 'NCB Jamaica', 'JN Bank', 'Scotiabank JM', 'First Global', 'Sagicor Bank'].map(b => `<option ${d.bank === b ? 'selected' : ''}>${b}</option>`).join('')}</select></div></div>
          <div class="field"><label>Lynk ID / account number</label><div class="input-wrap">${icon('i-card')}<input id="sd-n-acct" placeholder="876-xxx-xxxx or account no." value="${esc(d.acctNo || '')}"></div></div>
          <button class="btn btn-primary btn-block" id="sd-n-save">Save recipient</button>
        </div>`;
      $$('[data-contact]', body).forEach(b => b.addEventListener('click', () => {
        d.contact = b.dataset.contact; d.name = allContacts().find(c => c.id === d.contact).name; renderSendView();
      }));
      $('#sd-new', body).addEventListener('click', () => { d.newOpen = !d.newOpen; renderSendView(); });
      if (d.newOpen) {
        $('#sd-n-save', body).addEventListener('click', () => {
          const name = $('#sd-n-name', body).value.trim();
          if (!name) { toast('Name required', 'Enter the recipient\'s name.', 'warn'); return; }
          const bank = $('#sd-n-bank', body).value;
          const acct = $('#sd-n-acct', body).value.trim();
          if (!acct) { toast('Account required', 'Enter a Lynk ID or account number.', 'warn'); return; }
          const c = { id: uid(), name, sub: `${bank} · ${acct}`, bank, method: bank === 'Lynk Wallet' ? 'lynk' : bank === 'Jam-Dex Wallet' ? 'jamdex' : 'bank', color: ['#0ea5e9', '#f97316', '#10b981', '#8b5cf6', '#ef4444'][Math.floor(Math.random() * 5)] };
          state.extraContacts.push(c); save();
          d.contact = c.id; d.name = name; d.newOpen = false;
          toast('Recipient saved', `${name} added to your payees.`, 'ok');
          renderSendView();
        });
      }
      stepFooter(body, d, true, () => d.contact ? null : 'Choose a recipient to continue');
    } else if (sendState.step === 1) {
      const src = accounts.find(a => a.id === (d.acct || 'chk'));
      body.innerHTML = `
        <div class="amount-hero">
          <div class="amount-input-wrap"><span class="amount-cur">J$</span>
            <input id="sd-amt" inputmode="decimal" placeholder="0" value="${d.amount || ''}"></div>
          <div class="quick-amts">${[1000, 2500, 5000, 10000, 25000].map(v => `<button class="chip" data-q="${v}">${nf(v, 0)}</button>`).join('')}</div>
          <p class="balance-note">From <b>${src.name} ${src.number}</b> · available <b>${money0(acctAvailable(src))}</b></p>
        </div>
        <div class="field" style="margin-top:18px"><label>From account</label><div class="input-wrap">${icon('i-wallet')}
          <select id="sd-acct">${accounts.filter(a => a.currency === 'JMD').map(a => `<option value="${a.id}" ${d.acct === a.id ? 'selected' : ''}>${a.name} ${a.number} · ${money0(acctAvailable(a))}</option>`).join('')}</select></div></div>
        <div class="field"><label>Note (optional)</label><div class="input-wrap">${icon('i-pencil')}
          <input id="sd-note" placeholder="Lunch, rent, thanks 🎁" value="${esc(d.note || '')}" maxlength="40"></div></div>`;
      $('#sd-amt', body).addEventListener('input', e => { d.amount = e.target.value.replace(/[^\d.]/g, ''); });
      $$('[data-q]', body).forEach(b => b.addEventListener('click', () => { d.amount = b.dataset.q; $('#sd-amt', body).value = d.amount; }));
      $('#sd-acct', body).addEventListener('change', e => { d.acct = e.target.value; renderSendView(); });
      $('#sd-note', body).addEventListener('input', e => { d.note = e.target.value; });
      stepFooter(body, d, true, () => (+d.amount > 0 ? null : 'Enter an amount to continue'));
    } else {
      const c = allContacts().find(x => x.id === d.contact) || { name: d.name, sub: d.acctNo || d.bank, method: 'bank' };
      const amt = +d.amount || 0;
      const needOtp = amt > 10000;
      body.innerHTML = `
        ${needOtp ? `<div class="otp-required-note">${icon('i-shield')}<span><b>Over J$10,000</b> — this payment needs 2-step verification before it leaves your account.</span></div>` : ''}
        <div class="review-box">
          <div class="review-row"><span>To</span><b>${esc(c.name)}</b></div>
          <div class="review-row"><span>Destination</span><b>${esc(c.sub || c.bank)}</b></div>
          <div class="review-row"><span>Method</span><b>${c.method === 'lynk' ? 'Lynk · instant' : c.method === 'jamdex' ? 'Jam-Dex · instant' : 'Bank transfer'}</b></div>
          <div class="review-row"><span>From</span><b>${esc(acctLabel(d.acct))}</b></div>
          ${d.note ? `<div class="review-row"><span>Note</span><b>${esc(d.note)}</b></div>` : ''}
          <div class="review-row"><span>Fee</span><b class="up">Free</b></div>
          <div class="review-row total"><span>Total</span><b class="num">${money(amt)}</b></div>
        </div>`;
      stepFooterConfirm(body, d, amt, {
        desc: c.method === 'lynk' ? `Lynk transfer — ${c.name}` : c.method === 'jamdex' ? `Jam-Dex transfer — ${c.name}` : `Transfer to ${c.name}`,
        method: c.method === 'lynk' ? 'Lynk' : c.method === 'jamdex' ? 'Jam-Dex' : 'Bank transfer',
        cat: 'transfers', name: c.name,
      });
    }
  }

  function renderIntlStep(body, d) {
    if (sendState.step === 0) {
      body.innerHTML = `
        <h4 style="margin-bottom:12px">International recipient</h4>
        <div class="field"><label>Beneficiary name</label><div class="input-wrap">${icon('i-user')}<input id="in-name" placeholder="e.g. Sarah Miller" value="${esc(d.name || '')}"></div></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="field"><label>Country</label><div class="input-wrap">${icon('i-globe')}
            <select id="in-country">${['United States', 'United Kingdom', 'Canada', 'Panama', 'Other'].map(x => `<option ${d.country === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div></div>
          <div class="field"><label>Send currency</label><div class="input-wrap">${icon('i-wallet')}
            <select id="in-cur">${Object.keys(fx).map(k => `<option value="${k}" ${d.cur === k ? 'selected' : ''}>${k} · ${nf(fx[k].rate, 2)}</option>`).join('')}</select></div></div>
        </div>
        <div class="field"><label>Bank name</label><div class="input-wrap">${icon('i-bank')}<input id="in-bank" placeholder="e.g. Chase Bank" value="${esc(d.bank || '')}"></div></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="field"><label>SWIFT / BIC</label><div class="input-wrap">${icon('i-globe')}<input id="in-swift" placeholder="CHASUS33" value="${esc(d.swift || '')}" style="text-transform:uppercase"></div></div>
          <div class="field"><label>Account / IBAN</label><div class="input-wrap">${icon('i-card')}<input id="in-acct" placeholder="Account or IBAN" value="${esc(d.acctNo || '')}"></div></div>
        </div>
        <div class="otp-required-note">${icon('i-globe')}<span>International payments are screened and payments over <b>J$10,000</b> require 2-step verification.</span></div>`;
      ['in-name', 'in-country', 'in-cur', 'in-bank', 'in-swift', 'in-acct'].forEach(id => {
        $('#' + id, body).addEventListener('input', e => {
          d[{ 'in-name': 'name', 'in-country': 'country', 'in-cur': 'cur', 'in-bank': 'bank', 'in-swift': 'swift', 'in-acct': 'acctNo' }[id]] = e.target.value;
        });
      });
      stepFooter(body, d, true, null);
    } else if (sendState.step === 1) {
      const cur = d.cur || 'USD';
      const rate = fx[cur].rate;
      body.innerHTML = `
        <div class="amount-hero">
          <div class="amount-input-wrap"><span class="amount-cur">${CUR[cur]}</span>
            <input id="sd-amt" inputmode="decimal" placeholder="0" value="${d.amount || ''}"></div>
          <div class="quick-amts">${[50, 100, 250, 500].map(v => `<button class="chip" data-q="${v}">${CUR[cur]}${v}</button>`).join('')}</div>
          <p class="balance-note"><span class="rate-live"><i></i> Live rate</span> 1 ${cur} = J$${nf(rate, 2)} · you send <b id="sd-jmd">${d.amount ? money0(+d.amount * rate) : 'J$ 0'}</b></p>
        </div>
        <div class="field" style="margin-top:18px"><label>From account (JMD)</label><div class="input-wrap">${icon('i-wallet')}
          <select id="sd-acct">${accounts.filter(a => a.currency === 'JMD').map(a => `<option value="${a.id}" ${d.acct === a.id ? 'selected' : ''}>${a.name} ${a.number} · ${money0(acctAvailable(a))}</option>`).join('')}</select></div></div>
        <div class="field"><label>Purpose of payment</label><div class="input-wrap">${icon('i-file')}
          <select id="in-purpose">${['Family support', 'Education', 'Travel', 'Business invoice', 'Investment'].map(p => `<option ${d.purpose === p ? 'selected' : ''}>${p}</option>`).join('')}</select></div></div>`;
      $('#sd-amt', body).addEventListener('input', e => {
        d.amount = e.target.value.replace(/[^\d.]/g, '');
        $('#sd-jmd', body).textContent = d.amount ? money0(+d.amount * rate) : 'J$ 0';
      });
      $$('[data-q]', body).forEach(b => b.addEventListener('click', () => { d.amount = b.dataset.q; $('#sd-amt', body).value = d.amount; $('#sd-jmd', body).textContent = money0(+d.amount * rate); }));
      $('#sd-acct', body).addEventListener('change', e => { d.acct = e.target.value; });
      $('#in-purpose', body).addEventListener('change', e => { d.purpose = e.target.value; });
      stepFooter(body, d, true, () => (+d.amount > 0 ? null : 'Enter an amount to continue'));
    } else {
      const cur = d.cur || 'USD', rate = fx[cur].rate;
      const amt = +d.amount || 0, jmd = amt * rate, fee = sendFee('intl', jmd), total = jmd + fee;
      const needOtp = total > 10000;
      body.innerHTML = `
        ${needOtp ? `<div class="otp-required-note">${icon('i-shield')}<span><b>Enhanced security:</b> international payment over J$10,000 — 2-step verification required.</span></div>` : ''}
        <div class="review-box">
          <div class="review-row"><span>Beneficiary</span><b>${esc(d.name || '—')}</b></div>
          <div class="review-row"><span>Bank / SWIFT</span><b>${esc(d.bank || '—')} · ${esc((d.swift || '—').toUpperCase())}</b></div>
          <div class="review-row"><span>Country</span><b>${esc(d.country || '—')}</b></div>
          <div class="review-row"><span>You send exactly</span><b class="num">${money(amt, cur)}</b></div>
          <div class="review-row"><span>Rate</span><b class="num">1 ${cur} = J$${nf(rate, 2)}</b></div>
          <div class="review-row"><span>Transfer fee (0.75%, min J$500)</span><b class="num">${money(fee)}</b></div>
          <div class="review-row"><span>From</span><b>${esc(acctLabel(d.acct))}</b></div>
          <div class="review-row"><span>Purpose</span><b>${esc(d.purpose || 'Family support')}</b></div>
          <div class="review-row total"><span>Total debited</span><b class="num">${money(total)}</b></div>
        </div>`;
      stepFooterConfirm(body, d, total, {
        desc: `SWIFT transfer — ${cur} ${nf(amt, 2)} to ${(d.name || 'beneficiary').split(' ')[0]}`,
        method: 'SWIFT', cat: 'transfers', intl: true, orig: { cur, amt }, name: d.name || 'international beneficiary',
      });
    }
  }

  function renderBillStep(body, d) {
    if (sendState.step === 0) {
      body.innerHTML = `
        <h4 style="margin-bottom:12px">Pick a biller</h4>
        <div class="contact-grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">
          ${bills.map(b => `
            <button class="contact-chip ${d.biller === b.id ? 'sel' : ''}" data-bill="${b.id}">
              <span class="contact-av" style="background:${b.color}">${icon('i-receipt')}</span>
              <b>${esc(b.name)}</b><span>${esc(b.sub)}</span>
              <span class="badge badge-warn" style="font-size:.66rem">Due ${b.due}</span>
            </button>`).join('')}
        </div>`;
      $$('[data-bill]', body).forEach(b => b.addEventListener('click', () => {
        d.biller = b.dataset.bill;
        const bill = bills.find(x => x.id === d.biller);
        d.amount = String(bill.est); d.name = bill.name;
        renderSendView();
      }));
      stepFooter(body, d, true, () => d.biller ? null : 'Choose a biller to continue');
    } else if (sendState.step === 1) {
      const bill = bills.find(x => x.id === d.biller);
      body.innerHTML = `
        <div class="amount-hero">
          <div class="amount-input-wrap"><span class="amount-cur">J$</span>
            <input id="sd-amt" inputmode="decimal" placeholder="0" value="${d.amount || ''}"></div>
          <p class="balance-note"><b>${esc(bill.name)}</b> · ${esc(bill.sub)} · due <b>${bill.due}</b> · suggested ${money0(bill.est)}</p>
        </div>
        <div class="field" style="margin-top:18px"><label>From account</label><div class="input-wrap">${icon('i-wallet')}
          <select id="sd-acct">${accounts.filter(a => a.currency === 'JMD').map(a => `<option value="${a.id}" ${d.acct === a.id ? 'selected' : ''}>${a.name} ${a.number} · ${money0(acctAvailable(a))}</option>`).join('')}</select></div></div>`;
      $('#sd-amt', body).addEventListener('input', e => { d.amount = e.target.value.replace(/[^\d.]/g, ''); });
      $('#sd-acct', body).addEventListener('change', e => { d.acct = e.target.value; });
      stepFooter(body, d, true, () => (+d.amount > 0 ? null : 'Enter an amount to continue'));
    } else {
      const bill = bills.find(x => x.id === d.biller);
      const amt = +d.amount || 0;
      const needOtp = amt > 10000;
      body.innerHTML = `
        ${needOtp ? `<div class="otp-required-note">${icon('i-shield')}<span><b>Over J$10,000</b> — this bill payment needs 2-step verification.</span></div>` : ''}
        <div class="review-box">
          <div class="review-row"><span>Biller</span><b>${esc(bill.name)}</b></div>
          <div class="review-row"><span>Account</span><b>${esc(bill.sub)}</b></div>
          <div class="review-row"><span>Due date</span><b>${bill.due}</b></div>
          <div class="review-row"><span>From</span><b>${esc(acctLabel(d.acct))}</b></div>
          <div class="review-row"><span>Fee</span><b class="up">Free</b></div>
          <div class="review-row total"><span>Total</span><b class="num">${money(amt)}</b></div>
        </div>`;
      stepFooterConfirm(body, d, amt, {
        desc: `${bill.name} — bill payment`, method: 'Bill pay', cat: 'bills', name: bill.name,
      });
    }
  }

  function stepFooter(body, d, hasBack, guardMsg) {
    const f = html(`<div class="send-actions">
      ${hasBack && sendState.step > 0 ? '<button class="btn btn-soft" id="sd-back">Back</button>' : ''}
      <button class="btn btn-primary btn-lg" id="sd-next">Continue ${icon('i-chev-right')}</button>
    </div>`);
    body.appendChild(f);
    $('#sd-next', f).addEventListener('click', () => {
      const gm = typeof guardMsg === 'function' ? guardMsg() : guardMsg;
      if (gm) { toast('Hold on', gm, 'warn'); return; }
      if (sendState.step === 1) {
        const amt = +d.amount || 0;
        if (!amt) { toast('Amount required', 'Enter how much to send.', 'warn'); return; }
        const src = accounts.find(a => a.id === d.acct);
        const total = sendState.mode === 'intl' ? amt * fx[d.cur].rate + sendFee('intl', amt * fx[d.cur].rate) : amt;
        if (total > acctAvailable(src)) {
          toast('Insufficient available funds', `Available after lien holds: ${money0(acctAvailable(src))}.`, 'err');
          return;
        }
      }
      sendState.step++; renderSendView();
    });
    const back = $('#sd-back', f);
    if (back) back.addEventListener('click', () => { sendState.step--; sendState._back = true; renderSendView(); });
  }

  function stepFooterConfirm(body, d, amtJmd, txnMeta) {
    const f = html(`<div class="send-actions">
      <button class="btn btn-soft" id="sd-back">Back</button>
      <button class="btn btn-primary btn-lg" id="sd-confirm">${icon('i-shield')} Confirm &amp; pay ${money0(amtJmd)}</button>
    </div>`);
    body.appendChild(f);
    $('#sd-back', f).addEventListener('click', () => { sendState.step--; sendState._back = true; renderSendView(); });
    $('#sd-confirm', f).addEventListener('click', () => {
      const src = accounts.find(a => a.id === d.acct);
      if (amtJmd > acctAvailable(src)) { toast('Insufficient available funds', `Available: ${money0(acctAvailable(src))}`, 'err'); return; }
      const proceed = () => executeTransfer(d, amtJmd, txnMeta);
      const needOtp = amtJmd > 10000;
      if (needOtp) {
        requestOtp({
          title: 'Confirm this payment',
          sub: `${money0(amtJmd)} to ${txnMeta.name || txnMeta.desc}`,
          line: `${txnMeta.intl ? 'International payment' : 'High-value payment'} · 2-step verification`,
          onSuccess: proceed,
        });
      } else {
        /* low-value: quick confirm modal */
        const m = openModal(`${modalHead('Confirm payment', txnMeta.desc)}
          <div class="review-row total" style="border:1.5px solid var(--line);border-radius:14px;padding:16px"><span>Amount</span><b class="num" style="font-size:1.3rem;color:var(--brand)">${money(amtJmd)}</b></div>
          <div class="modal-foot">
            <button class="btn btn-soft" data-close>Cancel</button>
            <button class="btn btn-primary" id="sd-go">Send now</button>
          </div>`);
        $('#sd-go', m).addEventListener('click', () => { m.close(); proceed(); });
      }
    });
  }

  function executeTransfer(d, amtJmd, txnMeta) {
    state.balAdj[d.acct] = (state.balAdj[d.acct] || 0) - amtJmd;
    const txn = {
      id: uid(), ts: Date.now(), desc: txnMeta.desc, cat: txnMeta.cat,
      amount: -amtJmd, acct: d.acct, method: txnMeta.method,
      intl: !!txnMeta.intl, orig: txnMeta.orig || null, status: txnMeta.intl ? 'pending' : 'completed',
      ref: 'BM' + ref6(),
    };
    state.extraTxns.unshift(txn);
    save();
    confetti();
    if (currentView === 'send') { resetSend(); renderSendView(); }
    else if (currentView === 'home') renderHome();
    openReceipt(txn);
  }

  function openReceipt(t) {
    openModal(`
      <div class="receipt-hero">
        <div class="check-burst">${icon('i-check')}</div>
        <h3 style="font-size:1.4rem">${t.intl ? 'Payment initiated!' : 'Money sent!'}</h3>
        <p class="muted" style="font-weight:600">${t.intl ? 'Funds usually arrive in 1–2 business days.' : 'Delivered instantly.'}</p>
        <div class="hero-amount num" style="font-size:1.8rem;margin-top:8px">${money(t.orig ? t.orig.amt : Math.abs(t.amount), t.orig ? t.orig.cur : 'JMD')}</div>
        <p class="receipt-ref">Ref ${t.ref} · ${dateStr(t.ts)} ${timeStr(t.ts)}</p>
      </div>
      <div class="review-box">
        <div class="review-row"><span>To</span><b>${esc(t.desc)}</b></div>
        <div class="review-row"><span>Method</span><b>${esc(t.method)}</b></div>
        ${t.orig ? `<div class="review-row"><span>Debited</span><b class="num">${money(Math.abs(t.amount))} (incl. fee)</b></div>` : ''}
        <div class="review-row"><span>From</span><b>${esc(acctLabel(t.acct))}</b></div>
        <div class="review-row"><span>Status</span><b>${t.intl ? 'Processing' : 'Completed'}</b></div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-soft" id="rc-share">${icon('i-copy')} Share receipt</button>
        <button class="btn btn-primary" data-close>Done</button>
      </div>`);
    $('#rc-share').addEventListener('click', () => copyText(`BlueMahoe receipt ${t.ref} — ${t.desc} — ${money(Math.abs(t.amount))}`));
  }

  function renderSendSide(d) {
    const side = $('#send-side');
    if (sendState.mode === 'intl') {
      const cur = d.cur || 'USD', rate = fx[cur].rate;
      side.innerHTML = `
        <div class="panel">
          <div class="panel-head"><h3>Today's rate</h3><span class="rate-live"><i></i> Live</span></div>
          <div class="side-stat"><span>1 ${cur}</span><b>= J$${nf(rate, 2)}</b></div>
          <div class="side-stat"><span>Transfer fee</span><b>0.75% · min J$500</b></div>
          <div class="side-stat"><span>Arrival</span><b>1–2 business days</b></div>
          <div class="side-stat"><span>Screening</span><b>BOJ &amp; FIU compliant</b></div>
        </div>
        <div class="panel"><div class="panel-head"><h3>Good to know</h3></div>
          <p class="muted" style="font-size:.85rem">SWIFT payments over <b>J$10,000</b> always require 2-step verification. Beneficiary names must match their bank records exactly.</p></div>`;
    } else if (sendState.mode === 'bill') {
      side.innerHTML = `
        <div class="panel"><div class="panel-head"><h3>Upcoming bills</h3></div>
          ${bills.map(b => `<div class="side-stat"><span>${esc(b.name)}</span><b>${money0(b.est)} · ${b.due}</b></div>`).join('')}
        </div>
        <div class="panel"><div class="panel-head"><h3>Auto-pay</h3></div>
          <p class="muted" style="font-size:.85rem">Never miss a due date — turn on auto-pay from the biller card after paying once (demo).</p></div>`;
    } else {
      const src = accounts.find(a => a.id === (d.acct || 'chk'));
      side.innerHTML = `
        <div class="panel"><div class="panel-head"><h3>Your available balance</h3></div>
          <div class="side-stat"><span>${src.name} ${src.number}</span><b class="num">${money0(acctAvailable(src))}</b></div>
          ${src.lien ? `<div class="side-stat"><span>Lien hold</span><b class="num">− ${money0(src.lien.amount)}</b></div>` : ''}
          <div class="side-stat"><span>Lynk &amp; Jam-Dex</span><b class="up">Free · instant</b></div>
          <div class="side-stat"><span>Bank transfer</span><b class="up">Free · instant</b></div>
        </div>
        <div class="panel"><div class="panel-head"><h3>2-step verification</h3></div>
          <p class="muted" style="font-size:.85rem">Transfers over <b>J$10,000</b> need an SMS code — keeping your money safe, island style. 🛡️</p></div>`;
    }
  }

  /* ═══════════ INVESTMENTS VIEW ═══════════ */
  let perfRange = 6;
  function renderInvestView() {
    const { total } = invTotals();
    $('#invest-hero').innerHTML = `
      <div class="ih-top">
        <div>
          <h4>Total portfolio value</h4>
          <div class="ih-value num" id="inv-total">${money(total)}</div>
        </div>
        <span class="badge badge-ok" style="font-size:.9rem">${icon('i-trend-up')} +${investments.ytd}% YTD</span>
      </div>
      <div class="ih-stats">
        <div class="ih-stat"><span>Holdings</span><b>${investments.holdings.length} funds</b></div>
        <div class="ih-stat"><span>Fixed deposits</span><b>${investments.deposits.length}</b></div>
        <div class="ih-stat"><span>Top performer</span><b class="up">US Index +12.4%</b></div>
        <div class="ih-stat"><span>Cash available</span><b>${money0(acctAvailable(accounts[0]))}</b></div>
      </div>`;
    countUp($('#inv-total'), total, v => money(v));

    const alloc = investments.holdings.map(h => ({ label: h.name, value: hVal(h), color: h.color }));
    Charts.donut($('#alloc-donut'), alloc, { centerLabel: 'Allocated', centerValue: '100%' });
    $('#alloc-legend').innerHTML = alloc.map((it, i) => `
      <div class="legend-item" style="animation-delay:${i * 70}ms">
        <span class="swatch" style="background:${it.color}"></span>${esc(it.label)}
        <b class="num">${Math.round(it.value / alloc.reduce((s, x) => s + x.value, 0) * 100)}%</b>
        <span class="pct num">${state.mask ? '••••' : compact(it.value)}</span></div>`).join('');

    $$('#perf-range .seg-btn').forEach(b => {
      b.classList.toggle('active', +b.dataset.range === perfRange);
      b.onclick = () => { perfRange = +b.dataset.range; renderInvestView(); };
    });
    const pts = investments.perf.slice(-perfRange);
    Charts.line($('#perf-chart'), pts, { height: 230 });

    $('#holdings-list').innerHTML = investments.holdings.map((h, i) => `
      <div class="hold-row" style="animation-delay:${i * 60}ms">
        <span class="txn-ico" style="${catStyle('other')};--cat-bg: color-mix(in oklab, ${h.color}, transparent 86%); --cat-fg: ${h.color}">${icon(h.icon)}</span>
        <div class="hold-main"><b>${esc(h.name)}</b><span>${esc(h.type)} · ${Math.round(hVal(h) / total * 100)}% of portfolio</span></div>
        <div class="hold-spark" id="sp-${h.id}"></div>
        <div class="hold-right"><div class="hold-val num">${state.mask ? '••••' : money(hVal(h), h.intl ? 'USD' : 'JMD')}</div>
          <div class="hold-chg up">+${h.chg}%</div></div>
        <button class="btn btn-soft btn-sm" data-buy="${h.id}">Buy</button>
      </div>`).join('');
    investments.holdings.forEach(h => Charts.spark($('#sp-' + h.id), h.spark, { color: h.color }));
    $$('[data-buy]').forEach(b => b.addEventListener('click', () => openBuy(b.dataset.buy)));

    $('#deposits-list').innerHTML = investments.deposits.map(dp => `
      <div class="deposit-card">
        <div class="dp-top"><b>${esc(dp.name)}</b><span class="dp-rate">${dp.rate}% p.a.</span></div>
        <div class="dp-meta"><span>Principal ${money0(dp.principal)}</span><span>Opened ${dp.opened}</span><span>Matures ${dp.maturity}</span><span>${dp.payout}</span></div>
        <div class="maturity-bar"><i style="width:${Math.round(dp.progress * 100)}%"></i></div>
        <p class="muted" style="font-size:.72rem;margin-top:6px">${Math.round(dp.progress * 100)}% to maturity · est. interest ${money0(dp.principal * dp.rate / 100 * dp.progress)}</p>
      </div>`).join('');
  }

  function openBuy(holdingId) {
    const h = investments.holdings.find(x => x.id === holdingId);
    openModal(`${modalHead(`Buy ${h.name}`, `Current value ${money(hVal(h))} · +${h.chg}%`)}
      <div class="field"><label>Amount (JMD)</label><div class="input-wrap">${icon('i-wallet')}
        <input id="by-amt" inputmode="decimal" placeholder="e.g. 25000"></div></div>
      <div class="field"><label>From account</label><div class="input-wrap">${icon('i-bank')}
        <select id="by-acct">${accounts.filter(a => a.currency === 'JMD').map(a => `<option value="${a.id}">${a.name} · ${money0(acctAvailable(a))}</option>`).join('')}</select></div></div>
      <div class="otp-required-note">${icon('i-shield')}<span>Investments over <b>J$10,000</b> require 2-step verification.</span></div>
      <div class="modal-foot">
        <button class="btn btn-soft" data-close>Cancel</button>
        <button class="btn btn-primary" id="by-go">Review purchase</button>
      </div>`);
    $('#by-go').addEventListener('click', () => {
      const amt = +$('#by-amt').value.replace(/[^\d.]/g, '') || 0;
      const acct = $('#by-acct').value;
      if (!amt) { toast('Amount required', 'Enter how much to invest.', 'warn'); return; }
      const src = accounts.find(a => a.id === acct);
      if (amt > acctAvailable(src)) { toast('Insufficient funds', `Available: ${money0(acctAvailable(src))}`, 'err'); return; }
      const proceed = () => {
        state.balAdj[acct] = (state.balAdj[acct] || 0) - amt;
        state.investAdj[holdingId] = (state.investAdj[holdingId] || 0) + amt;
        state.extraTxns.unshift({
          id: uid(), ts: Date.now(), desc: `${h.name} — purchase`, cat: 'invest', amount: -amt,
          acct, method: 'Bank transfer', intl: false, status: 'completed', ref: 'BM' + ref6(),
        });
        save();
        confetti();
        if (currentView === 'invest') renderInvestView();
        toast('Invested 📈', `${money0(amt)} added to ${h.name}.`, 'ok');
      };
      const needOtp = amt > 10000;
      if (needOtp) {
        requestOtp({
          title: 'Confirm investment', sub: `${money0(amt)} into ${h.name}`,
          line: 'Investment purchase · 2-step verification', onSuccess: proceed,
        });
      } else proceed();
    });
  }

  function openNewInvest() {
    const products = [
      { id: 'mf', name: 'Island Growth Mutual Fund', desc: 'Avg 9.1% · unit trust', min: 10000 },
      { id: 'eq', name: 'Caribbean Blue-Chip Equities', desc: 'Avg 6.8% · dividend stocks', min: 25000 },
      { id: 'bond', name: 'GOJ Bond Ladder 2027', desc: 'Fixed 7.4% · government bonds', min: 50000 },
    ];
    openModal(`${modalHead('Open a new investment', 'Move money from your BlueMahoe accounts in seconds.')}
      ${products.map((p, i) => `
        <button class="contact-chip" data-prod="${p.id}" style="flex-direction:row;justify-content:flex-start;width:100%;text-align:left;margin-bottom:10px;gap:12px">
          <span class="contact-av" style="background:${['#00b8a9', '#0ea5e9', '#84cc16'][i]}">${icon('i-trend-up')}</span>
          <span style="flex:1"><b>${p.name}</b><br><span class="muted" style="font-size:.78rem">${p.desc} · min ${money0(p.min)}</span></span>
          ${icon('i-chev-right')}
        </button>`).join('')}
      <div class="modal-foot"><button class="btn btn-soft" data-close>Maybe later</button></div>`);
    $$('[data-prod]').forEach(b => b.addEventListener('click', () => { $('.modal').close(); openBuy(b.dataset.prod); }));
  }

  /* ═══════════ STATEMENTS VIEW ═══════════ */
  let stAcct = 'chk', stDays = 'month';
  function renderStatementsView() {
    const sel = $('#st-acct');
    if (sel.options.length === 0) {
      accounts.forEach(a => sel.appendChild(html(`<option value="${a.id}">${a.name} ${a.number} (${a.currency})</option>`)));
    }
    sel.value = stAcct;
    $$('#st-periods .chip').forEach(c => c.classList.toggle('active', c.dataset.days === stDays));
    sel.onchange = () => { stAcct = sel.value; renderStatementsView(); };
    $$('#st-periods .chip').forEach(c => c.onclick = () => { stDays = c.dataset.days; renderStatementsView(); });
    $('#btn-print').onclick = printStatement;
    renderStatementSheet();
  }

  function statementData() {
    const a = accounts.find(x => x.id === stAcct);
    const now = new Date();
    let start;
    if (stDays === 'month') start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    else start = now.getTime() - (+stDays) * 86400000;
    const rows = allTxns().filter(t => t.acct === a.id && t.ts >= start && t.ts <= Date.now()).sort((x, y) => x.ts - y.ts);
    const closing = acctEff(a);
    const sum = rows.reduce((s, t) => s + t.amount, 0);
    const credits = rows.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const debits = rows.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
    return { a, rows, opening: closing - sum, closing, credits, debits };
  }

  function statementHtml() {
    const { a, rows, opening, closing, credits, debits } = statementData();
    const periodLbl = stDays === 'month'
      ? `${new Date().toLocaleString('en', { month: 'long' })} ${new Date().getFullYear()} (month to date)`
      : `${dateStr(Date.now() - +stDays * 86400000)} — ${dateStr(Date.now())}`;
    const stId = 'BM-SA-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + ref6();
    let bal = opening;
    const rowsHtml = rows.length ? rows.map(t => {
      bal += t.amount;
      return `<tr>
        <td>${dateStr(t.ts)}<small>${timeStr(t.ts)}</small></td>
        <td>${esc(t.desc)}<small>${esc(t.method)} · Ref ${esc(t.ref)}${t.status === 'pending' ? ' · PENDING' : ''}</small></td>
        <td class="n">${t.orig ? `${nf(t.orig.amt, 2)} ${t.orig.cur}` : '—'}</td>
        <td class="n d">${t.amount < 0 ? nf(Math.abs(t.amount)) : ''}</td>
        <td class="n c">${t.amount > 0 ? nf(t.amount) : ''}</td>
        <td class="n">${nf(bal)}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="6" style="text-align:center;padding:20px;color:#7c9296">No transactions in this period.</td></tr>';

    return `<div class="print-sheet">
      <div class="st-head">
        <div class="st-brand">
          <svg><use href="#i-logo"/></svg>
          <div><b>BlueMahoe Bank</b><span>15 Hope Road, Kingston 10, Jamaica · swift: BMJMJMKN</span></div>
        </div>
        <div class="st-doc"><b>STATEMENT OF ACCOUNT</b><span>${stId}</span></div>
      </div>
      <div class="st-meta">
        <div><span>Account holder</span><b>${esc(state.profileEdits.name || user.name)}</b></div>
        <div><span>Customer ID</span><b>${esc(user.id)}</b></div>
        <div><span>Account</span><b>${a.name} ${a.number} (${a.nickname})</b></div>
        <div><span>Currency</span><b>${a.currency} — ${CUR[a.currency]}</b></div>
        <div><span>Statement period</span><b>${periodLbl}</b></div>
        <div><span>Generated</span><b>${dateStr(Date.now())} · ${timeStr(Date.now())}</b></div>
      </div>
      <div class="st-summary">
        <div class="st-sumbox"><span>Opening balance</span><b>${CUR[a.currency]}${nf(opening)}</b></div>
        <div class="st-sumbox pos"><span>Total credits</span><b>+${CUR[a.currency]}${nf(credits)}</b></div>
        <div class="st-sumbox neg"><span>Total debits</span><b>−${CUR[a.currency]}${nf(debits)}</b></div>
        <div class="st-sumbox"><span>Closing balance</span><b>${CUR[a.currency]}${nf(closing)}</b></div>
      </div>
      ${a.lien ? `<div class="st-lien">⚠ <span><b>Lien hold:</b> ${CUR[a.currency]}${nf(a.lien.amount)} — ${esc(a.lien.reason)} (Ref ${esc(a.lien.ref)}, placed ${esc(a.lien.placed)}). This amount is included in the closing balance but is not available for withdrawal.</span></div>` : ''}
      <table class="st-table">
        <thead><tr><th>Date</th><th>Description</th><th class="n">Original</th><th class="n">Debit (−)</th><th class="n">Credit (+)</th><th class="n">Balance</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <div class="st-foot">
        <span>BlueMahoe Bank Ltd · Bank of Jamaica licence 0042 · This is a computer generated statement — no signature required.</span>
        <span>Customer care 888-YES-BLUE · care@bluemahoe.jm</span>
      </div>
    </div>`;
  }

  function renderStatementSheet() { $('#st-sheet').innerHTML = statementHtml(); }
  function printStatement() {
    $('#print-root').innerHTML = statementHtml();
    toast('Opening print dialog', 'Choose your printer or "Save as PDF".', 'info', 2500);
    setTimeout(() => window.print(), 250);
  }

  /* ═══════════ SETTINGS VIEW ═══════════ */
  function renderSettingsView() {
    const m = me();
    const grid = $('#settings-grid');
    const brandPresets = [
      ['#00b8a9', 'Reef Teal'], ['#0ea5e9', 'Ocean Sky'], ['#84cc16', 'Lime Splash'],
      ['#f59e0b', 'Mango'], ['#f43f5e', 'Coral Fire'], ['#8b5cf6', 'Twilight'],
    ];
    grid.innerHTML = `
      <div class="panel set-profile-card">
        <div class="profile-av">${esc(m.initials)}</div>
        <div style="flex:1;min-width:200px">
          <h3 style="font-size:1.2rem">${esc(m.name)}</h3>
          <p class="muted" style="font-weight:600;font-size:.88rem">${esc(m.tier)} · Customer ${esc(user.id)}</p>
          <p class="muted" style="font-size:.82rem">${esc(m.email)} · ${esc(m.phone)}</p>
          <p class="muted" style="font-size:.82rem">Member since ${esc(user.since)} · ${esc(user.branch)}</p>
        </div>
        <button class="btn btn-primary" id="pf-edit">${icon('i-pencil')} Edit profile</button>
      </div>

      <div class="panel">
        <div class="panel-head"><h3>Appearance</h3></div>
        <div class="set-row"><div class="sr-main"><b>Theme</b><span>Light or dark, anytime</span></div>
          <div class="seg seg-mini-txt" id="set-theme">
            <button class="seg-btn ${state.theme === 'light' ? 'active' : ''}" data-t="light">Light</button>
            <button class="seg-btn ${state.theme === 'dark' ? 'active' : ''}" data-t="dark">Dark</button></div></div>
        <div class="set-row" style="flex-direction:column;align-items:stretch">
          <div class="sr-main" style="margin-bottom:10px"><b>Interface style</b><span>Simple View is compact; Paradise View is the full experience</span></div>
          <div class="chooser-cards">
            <button class="chooser ${state.view === 'simple' ? '' : ''}" data-v="simple" style="${state.view === 'simple' ? 'border-color:var(--brand)' : ''}">
              <span class="mini-preview simple-prev"><i></i><i></i><i></i></span><b>Simple View</b><span>Compact &amp; modern</span></button>
            <button class="chooser" data-v="paradise" style="${state.view === 'paradise' ? 'border-color:var(--brand)' : ''}">
              <span class="mini-preview paradise-prev"><i></i><i></i><i></i></span><b>Paradise View</b><span>The full island experience</span></button>
          </div>
        </div>
        <div class="set-row" style="flex-direction:column;align-items:stretch">
          <div class="sr-main" style="margin-bottom:10px"><b>Brand colour</b><span>Banks: re-skin the whole app to your palette</span></div>
          <div class="brand-swatches">
            ${brandPresets.map(([c, n]) => `<button class="swatch ${state.brand === c ? 'on' : ''}" data-brand="${c}" title="${n}" style="background:${c}"></button>`).join('')}
            <span class="swatch" style="background:conic-gradient(red,yellow,lime,cyan,blue,magenta,red)" title="Custom"><input type="color" id="brand-custom" value="${state.brand || '#00b8a9'}"></span>
            ${state.brand ? '<button class="link" id="brand-reset">Reset</button>' : ''}
          </div>
        </div>
        <div class="set-row"><div class="sr-main"><b>Reduce motion</b><span>Calm animations &amp; no confetti</span></div>
          <button class="toggle ${state.reduceMotion ? 'on' : ''}" id="tg-motion"></button></div>
      </div>

      <div class="panel">
        <div class="panel-head"><h3>Security</h3></div>
        <div class="set-row"><div class="sr-main"><b>Password</b><span>Last changed 3 months ago</span></div>
          <button class="btn btn-soft btn-sm" id="sec-pw">Change</button></div>
        <div class="set-row"><div class="sr-main"><b>2-step verification</b><span>Required for login &amp; payments over J$10,000</span></div>
          <button class="toggle on" disabled></button></div>
        <div class="set-row"><div class="sr-main"><b>Biometric login</b><span>Fingerprint on supported devices</span></div>
          <button class="toggle ${state.prefs.biometric ? 'on' : ''}" id="tg-bio"></button></div>
        <div class="set-row"><div class="sr-main"><b>Trusted devices</b><span>3 devices have access</span></div>
          <button class="btn btn-soft btn-sm" id="sec-dev">Review</button></div>
        <div class="set-row"><div class="sr-main"><b>Auto sign-out</b><span>After inactivity</span></div>
          <div class="input-wrap" style="width:130px"><select id="sec-session">
            ${[5, 10, 15, 30].map(v => `<option value="${v}" ${state.prefs.sessionMin === v ? 'selected' : ''}>${v} min</option>`).join('')}</select></div></div>
      </div>

      <div class="panel">
        <div class="panel-head"><h3>Notifications</h3></div>
        <div class="set-row"><div class="sr-main"><b>Transaction alerts</b><span>Instant push for every payment</span></div>
          <button class="toggle ${state.prefs.alerts ? 'on' : ''}" data-pref="alerts"></button></div>
        <div class="set-row"><div class="sr-main"><b>Monthly digest</b><span>Spending summary email</span></div>
          <button class="toggle ${state.prefs.digest ? 'on' : ''}" data-pref="digest"></button></div>
        <div class="set-row"><div class="sr-main"><b>Offers &amp; promotions</b><span>Island deals from partners</span></div>
          <button class="toggle ${state.prefs.promo ? 'on' : ''}" data-pref="promo"></button></div>
        <div class="set-row"><div class="sr-main"><b>Paperless statements</b><span>Save a tree 🌳</span></div>
          <button class="toggle ${state.prefs.paperless ? 'on' : ''}" data-pref="paperless"></button></div>
      </div>

      <div class="panel">
        <div class="panel-head"><h3>Support</h3></div>
        <div class="set-row"><div class="sr-main"><b>Customer care</b><span>888-YES-BLUE · 24/7</span></div>
          <button class="btn btn-soft btn-sm" id="sup-call">${icon('i-phone')} Call</button></div>
        <div class="set-row"><div class="sr-main"><b>Email</b><span>care@bluemahoe.jm</span></div>
          <button class="btn btn-soft btn-sm" id="sup-mail">Compose</button></div>
        <div class="set-row"><div class="sr-main"><b>Branch</b><span>${esc(user.branch)}</span></div>
          <button class="btn btn-soft btn-sm" id="sup-branch">Hours</button></div>
      </div>

      <div class="panel danger-zone">
        <div class="panel-head"><h3 style="color:var(--coral)">Danger zone</h3></div>
        <div class="set-row"><div class="sr-main"><b>Reset demo data</b><span>Clears saved cards, transfers and preferences</span></div>
          <button class="btn btn-danger btn-sm" id="dz-reset">Reset</button></div>
      </div>`;

    /* wire */
    $$('#set-theme .seg-btn').forEach(b => b.addEventListener('click', () => { setTheme(b.dataset.t); renderSettingsView(); }));
    $$('[data-v]', grid).forEach(b => b.addEventListener('click', () => { setView(b.dataset.v, true); renderSettingsView(); }));
    $$('[data-brand]', grid).forEach(b => b.addEventListener('click', () => {
      state.brand = b.dataset.brand;
      document.documentElement.style.setProperty('--brand', state.brand);
      save(); renderSettingsView();
      toast('Brand colour applied', 'The whole app re-skinned instantly.', 'ok');
    }));
    $('#brand-custom').addEventListener('input', (e) => {
      state.brand = e.target.value;
      document.documentElement.style.setProperty('--brand', state.brand);
      save();
    });
    const br = $('#brand-reset');
    if (br) br.addEventListener('click', () => { state.brand = ''; document.documentElement.style.removeProperty('--brand'); save(); renderSettingsView(); });
    $('#tg-motion').addEventListener('click', () => {
      state.reduceMotion = !state.reduceMotion;
      document.documentElement.classList.toggle('reduce-motion', state.reduceMotion);
      save(); renderSettingsView();
    });
    $('#pf-edit').addEventListener('click', openEditProfile);
    $('#sec-pw').addEventListener('click', openChangePassword);
    $('#sec-dev').addEventListener('click', openDevices);
    $('#sec-session').addEventListener('change', (e) => { state.prefs.sessionMin = +e.target.value; save(); restartSession(); toast('Auto sign-out updated', `Sessions now end after ${e.target.value} minutes idle.`, 'ok'); });
    $('#tg-bio').addEventListener('click', () => { state.prefs.biometric = !state.prefs.biometric; save(); renderSettingsView(); });
    $$('[data-pref]', grid).forEach(b => b.addEventListener('click', () => {
      state.prefs[b.dataset.pref] = !state.prefs[b.dataset.pref]; save(); renderSettingsView();
    }));
    $('#sup-call').addEventListener('click', () => toast('Calling 888-YES-BLUE…', 'Average wait: 42 seconds (demo).', 'info'));
    $('#sup-mail').addEventListener('click', () => toast('Draft opened', 'care@bluemahoe.jm will reply within a day (demo).', 'info'));
    $('#sup-branch').addEventListener('click', () => toast('Liguanea branch', 'Mon–Thu 8:30–4:00 · Fri 8:30–5:00 · Sat 9–1', 'info'));
    $('#dz-reset').addEventListener('click', () => {
      const m2 = openModal(`${modalHead('Reset demo data?', 'This clears all saved preferences, added cards, recipients and transfer history from this browser.')}
        <div class="modal-foot">
          <button class="btn btn-soft" data-close>Keep my data</button>
          <button class="btn btn-danger" id="dz-go">Reset everything</button>
        </div>`);
      $('#dz-go', m2).addEventListener('click', () => { localStorage.removeItem(LS_KEY); location.reload(); });
    });
  }

  function openEditProfile() {
    const m = me();
    openModal(`${modalHead('Edit profile')}
      <div class="field"><label>Full name</label><div class="input-wrap">${icon('i-user')}<input id="ep-name" value="${esc(m.name)}"></div></div>
      <div class="field"><label>Email</label><div class="input-wrap">${icon('i-mail')}<input id="ep-email" type="email" value="${esc(m.email)}"></div></div>
      <div class="field"><label>Phone</label><div class="input-wrap">${icon('i-phone')}<input id="ep-phone" value="${esc(m.phone)}"></div></div>
      <div class="modal-foot">
        <button class="btn btn-soft" data-close>Cancel</button>
        <button class="btn btn-primary" id="ep-save">Save changes</button>
      </div>`);
    $('#ep-save').addEventListener('click', () => {
      const name = $('#ep-name').value.trim(), email = $('#ep-email').value.trim(), phone = $('#ep-phone').value.trim();
      if (!name) { toast('Name required', '', 'warn'); return; }
      state.profileEdits = { name, email: email || m.email, phone: phone || m.phone };
      save();
      $('#avatar-txt').textContent = initials(name);
      $('.modal').close();
      toast('Profile updated', 'Looking sharp, ' + name.split(' ')[0] + '.', 'ok');
      if (currentView === 'settings') renderSettingsView();
      if (currentView === 'home') renderHome();
    });
  }
  function openChangePassword() {
    openModal(`${modalHead('Change password', 'Demo only — nothing is really sent anywhere.')}
      <div class="field"><label>Current password</label><div class="input-wrap">${icon('i-lock')}<input type="password" id="pw-cur" placeholder="••••••••"></div></div>
      <div class="field"><label>New password</label><div class="input-wrap">${icon('i-lock')}<input type="password" id="pw-new" placeholder="At least 8 characters"></div></div>
      <div class="field"><label>Confirm new password</label><div class="input-wrap">${icon('i-lock')}<input type="password" id="pw-cfm" placeholder="Repeat it"></div></div>
      <div class="modal-foot">
        <button class="btn btn-soft" data-close>Cancel</button>
        <button class="btn btn-primary" id="pw-save">Update password</button>
      </div>`);
    $('#pw-save').addEventListener('click', () => {
      if ($('#pw-cur').value !== DEMO.pass) { toast('Wrong current password', 'Hint: it\'s ' + DEMO.pass + ' 😉', 'err'); return; }
      if ($('#pw-new').value.length < 8) { toast('Too short', 'New password needs 8+ characters.', 'warn'); return; }
      if ($('#pw-new').value !== $('#pw-cfm').value) { toast('Passwords don\'t match', '', 'err'); return; }
      $('.modal').close();
      toast('Password changed 🔐', 'Use it next time you log in.', 'ok');
    });
  }
  function openDevices() {
    openModal(`${modalHead('Trusted devices', 'Sign out any device you don\'t recognise.')}
      <div class="review-box">
        <div class="review-row"><span>iPhone 14 · BlueMahoe app</span><b>Kingston · current session</b></div>
        <div class="review-row"><span>Windows PC · Chrome</span><b>Kingston · 2 days ago</b></div>
        <div class="review-row"><span>iPad Air · Safari</span><b>Ocho Rios · 3 weeks ago</b></div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-soft" data-close>Close</button>
        <button class="btn btn-danger" id="dv-out">Sign out other devices</button>
      </div>`);
    $('#dv-out').addEventListener('click', () => { $('.modal').close(); toast('Devices signed out', 'Other sessions ended. This one stays.', 'ok'); });
  }

  /* Notifications modal */
  function openNotifications() {
    $('#bell-dot').hidden = true;
    openModal(`${modalHead('Notifications')}
      <div class="txn-list">
        ${[
          ['i-shield', '2-step verification enabled', 'All high-value payments now require a code.', 'ok'],
          ['i-globe', 'FX alert — USD/JMD', 'Rate crossed J$156.80 — good time to top up travel money.', 'info'],
          ['i-trend-up', 'Portfolio up 8.4% YTD', 'Your investments beat the JSE index this quarter.', 'ok'],
          ['i-lock', 'Card ••7710 was locked', 'Locked from Cards · you can unlock anytime.', 'warn'],
          ['i-calendar', 'Fixed Deposit matures soon', 'Your 90-day FD matures 18 Oct — renewal options available.', 'info'],
        ].map(([ic, t, d, tone], i) => `
          <div class="txn-item" style="cursor:default;animation-delay:${i * 50}ms">
            <span class="txn-ico badge-${tone === 'warn' ? 'warn' : tone === 'ok' ? 'ok' : 'brand'}" style="color:var(--${tone === 'ok' ? 'ok' : tone === 'warn' ? 'warn' : 'brand-2'})">${icon(ic)}</span>
            <span class="txn-main"><span class="txn-desc">${t}</span><span class="txn-meta">${d}</span></span>
          </div>`).join('')}
      </div>
      <div class="modal-foot"><button class="btn btn-primary" data-close>All caught up</button></div>`);
  }

  /* ═══════════ LOGIN / LOGOUT / WELCOME ═══════════ */
  function wireLogin() {
    $('#btn-fill-demo').addEventListener('click', () => {
      $('#login-user').value = DEMO.user; $('#login-pass').value = DEMO.pass;
      $('#login-error').hidden = true;
    });
    $('#btn-peek').addEventListener('click', () => {
      const p = $('#login-pass');
      p.type = p.type === 'password' ? 'text' : 'password';
    });
    $('#btn-forgot').addEventListener('click', () => toast('Password reset', 'A reset link was sent to your email (demo).', 'info'));
    $('#login-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const u = $('#login-user').value.trim(), p = $('#login-pass').value;
      const err = $('#login-error');
      if (!u || !p) { err.textContent = 'Enter your username and password.'; err.hidden = false; $('.auth-card').classList.add('shake'); setTimeout(() => $('.auth-card').classList.remove('shake'), 500); return; }
      if (u !== DEMO.user || p !== DEMO.pass) {
        err.textContent = `Invalid credentials — demo hint: ${DEMO.user} / ${DEMO.pass}`;
        err.hidden = false;
        $('.auth-card').classList.add('shake'); setTimeout(() => $('.auth-card').classList.remove('shake'), 500);
        return;
      }
      err.hidden = true;
      const btn = $('#btn-login');
      btn.classList.add('loading');
      setTimeout(() => {
        btn.classList.remove('loading');
        requestOtp({
          title: 'Almost there',
          sub: `We sent a code to ${maskPhone(me().phone)}`,
          line: 'New login · Kingston, Jamaica · ' + new Date().toLocaleString('en-JM', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
          onSuccess: () => finishLogin(false),
          onCancel: () => toast('Login cancelled', 'No worries — your accounts are safe.', 'info'),
        });
      }, 650);
    });
    $('#btn-biometric').addEventListener('click', () => {
      const ov = $('#biometric-overlay');
      ov.classList.add('show');
      $('#bio-title').textContent = 'Scanning fingerprint…';
      $('#bio-sub').textContent = 'Hold still — verifying it\'s really you.';
      $('.bio-card').classList.remove('ok');
      setTimeout(() => {
        $('.bio-card').classList.add('ok');
        $('#bio-title').textContent = 'Welcome back!';
        $('#bio-sub').textContent = 'Identity confirmed.';
        setTimeout(() => { ov.classList.remove('show'); finishLogin(true); }, 600);
      }, 1300);
    });
  }

  function finishLogin(biometric) {
    state.loggedIn = true;
    state.remember = $('#login-remember').checked;
    state.lastLogin = state.lastLogin || Date.now() - 86400000 * 1.4;
    const prev = state.lastLogin;
    state.lastLogin = Date.now();
    save();
    $('#avatar-txt').textContent = me().initials;
    $('#screen-app').hidden = false;
    $('#screen-login').hidden = true;
    resetSend();
    go('home');
    showWelcome(prev, biometric);
    restartSession();
  }

  function showWelcome(prevTs, biometric) {
    const ov = $('#welcome-overlay');
    const hr = new Date().getHours();
    $('#welcome-greet').textContent =
      (hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening') + ', ' + me().first;
    $('#welcome-sub').textContent = biometric
      ? 'Unlocked with your fingerprint. Your money missed you.'
      : 'Verified and signed in. Your accounts are right where you left them.';
    $('#welcome-last').textContent = 'Last login: ' + (prevTs ? dayLabel(prevTs) + ', ' + timeStr(prevTs) : 'first time — welcome!');
    const chooser = $('#view-chooser');
    const cont = $('#welcome-continue');
    if (!state.seenWelcome) {
      chooser.hidden = false; cont.hidden = true;
      $$('#view-chooser .chooser').forEach(b => b.onclick = () => {
        state.seenWelcome = true;
        setView(b.dataset.pick, true);
        chooser.hidden = true; cont.hidden = false;
        save();
      });
    } else {
      chooser.hidden = true; cont.hidden = false;
    }
    ov.classList.add('show');
    ov.setAttribute('aria-hidden', 'false');
    const done = () => { ov.classList.remove('show'); ov.setAttribute('aria-hidden', 'true'); confetti(); };
    cont.onclick = done;
    clearTimeout(showWelcome._t);
    if (state.seenWelcome) showWelcome._t = setTimeout(done, 2300);
  }

  function logout(reason) {
    const curtain = $('#curtain');
    $('#curtain-msg').textContent = reason === 'expired' ? 'Session expired' : 'Walk good 👋';
    $('#curtain-sub').textContent = reason === 'expired'
      ? 'We signed you out after inactivity. Yardi come back soon!'
      : 'Your accounts are safe. Yardi come back soon!';
    curtain.classList.remove('lift'); void curtain.offsetWidth;
    curtain.classList.add('drop');
    stopSession();
    setTimeout(() => {
      state.loggedIn = false; save();
      $('#screen-app').hidden = true;
      $('#screen-login').hidden = false;
      $('#login-pass').value = '';
      curtain.classList.remove('drop');
      curtain.classList.add('lift');
      setTimeout(() => curtain.classList.remove('lift'), 480);
      if (reason === 'expired') toast('Signed out', 'For your security, idle sessions end automatically.', 'info');
    }, 550);
  }

  /* ═══════════ SESSION TIMER ═══════════ */
  let sessionDeadline = 0, sessionInt = null;
  function sessionMs() { return (state.prefs.sessionMin || 10) * 60000; }
  function restartSession() {
    stopSession();
    if (!state.loggedIn) return;
    sessionDeadline = Date.now() + sessionMs();
    sessionInt = setInterval(() => {
      const left = sessionDeadline - Date.now();
      if (left <= 0) { logout('expired'); return; }
      const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
      $('#session-timer').textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }, 1000);
  }
  function stopSession() { clearInterval(sessionInt); sessionInt = null; }
  ['pointerdown', 'keydown', 'scroll'].forEach(ev =>
    document.addEventListener(ev, () => { if (state.loggedIn && sessionInt) { sessionDeadline = Date.now() + sessionMs(); } }, { passive: true }));

  /* ═══════════ NAV WIRING ═══════════ */
  function wireNav() {
    document.addEventListener('click', (e) => {
      const nav = e.target.closest('[data-nav]');
      if (nav) {
        const m = $('.modal');
        if (m && m.close) m.close();
        go(nav.dataset.nav);
        return;
      }
    });
    $('#btn-menu').addEventListener('click', () => {
      document.body.classList.add('nav-open');
      const bd = $('#nav-backdrop'); bd.hidden = false; requestAnimationFrame(() => bd.classList.add('show'));
    });
    $('#nav-backdrop').addEventListener('click', () => {
      document.body.classList.remove('nav-open');
      const bd = $('#nav-backdrop'); bd.classList.remove('show'); setTimeout(() => bd.hidden = true, 300);
    });
    $('#btn-logout').addEventListener('click', () => logout());
    $('#btn-add-card').addEventListener('click', openAddCard);
    $('#btn-new-invest').addEventListener('click', openNewInvest);
    $('#bn-more').addEventListener('click', () => {
      openModal(`${modalHead('More', 'Everything in your BlueMahoe app')}
        <div class="contact-grid" style="grid-template-columns:repeat(3,1fr)">
          ${[['txns', 'i-list', 'Transactions'], ['statements', 'i-file', 'Statements'], ['settings', 'i-sliders', 'Settings'],
          ['send', 'i-send', 'Send'], ['invest', 'i-trend-up', 'Invest'], ['cards', 'i-card', 'Cards']].map(([id, ic, lab]) => `
            <button class="qa" data-nav="${id}"><span class="qa-ico">${icon(ic)}</span>${lab}</button>`).join('')}
        </div>
        <button class="btn btn-danger btn-block" id="more-logout" style="margin-top:8px">${icon('i-logout')} Log out</button>
        <div class="modal-foot"><button class="btn btn-soft" data-close>Close</button></div>`).addEventListener('click', () => { });
      $('#more-logout').addEventListener('click', () => { $('.modal').close(); logout(); });
    });
    $('#btn-theme').addEventListener('click', () => setTheme(state.theme === 'light' ? 'dark' : 'light'));
    $$('#view-toggle .seg-btn').forEach(b => b.addEventListener('click', () => setView(b.dataset.setView, true)));
    $('#btn-bell').addEventListener('click', openNotifications);
    $('#btn-avatar').addEventListener('click', () => go('settings'));
    $('#global-search').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        txnFilter.q = e.target.value; txnFilter.shown = 25;
        go('txns');
        toast('Search applied', e.target.value ? `Showing results for “${e.target.value}”.` : 'Showing all transactions.', 'info');
      }
    });
    $('#btn-hide-bal').addEventListener('click', () => {
      state.mask = !state.mask;
      $('#btn-hide-bal').innerHTML = icon(state.mask ? 'i-eye-off' : 'i-eye');
      renderHome();
    });
  }

  /* ═══════════ BOOT ═══════════ */
  function init() {
    applyTheme(); applyView();
    document.documentElement.classList.toggle('reduce-motion', state.reduceMotion);
    $('#avatar-txt').textContent = me().initials;

    wireLogin();
    wireNav();
    wireOtpEvents();
    wireTxnFilters();

    /* topbar date */
    $('#topbar-date').textContent = new Date().toLocaleDateString('en-JM', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    /* session resume */
    const resume = state.loggedIn && state.remember;
    if (resume) {
      $('#screen-app').hidden = false;
      $('#screen-login').hidden = true;
      resetSend();
      go('home');
      restartSession();
    }

    /* hide boot splash */
    setTimeout(() => $('#boot').classList.add('hide'), 550);

    if (!resume) setTimeout(() => { if (state.remember) $('#login-user').value = DEMO.user; }, 800);
  }
  function wireOtpEvents() { /* OTP inputs are wired in wireOtp() above */ }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
