# BlueMahoe Bank JM

A fully client-side **responsive digital banking demo** — HTML/CSS/JavaScript only, no build step, no dependencies, no backend. Named after the blue mahoe, Jamaica's national tree.

> NOTE: **This is a fictional demo app.** All balances, cards, transactions and rates are dummy data. No real money, no real banking.

## Run it

Just open `index.html` in a browser — or serve the folder:

```bash
python -m http.server 8080
# → http://localhost:8080
```

**Demo login:** username `demo` · password `island2026` (there's a "Fill for me" button).
The 6-digit 2FA code is shown in a demo "SMS" toast and inside the verification dialog (with an Autofill shortcut).

## Feature tour

| Area | What's inside |
|---|---|
| **Login & security** | Login → fake 2FA (6-box OTP with paste, resend timer, 3-attempt lockout), fake biometric fingerprint scan, remember-me session resume, 10-min idle auto sign-out with live session timer |
| **Two UI modes** | **Simple View** (compact, flat, fast) and **Paradise View** (glassmorphism, gradient wash, glow, confetti, FX rate strip). Chosen at first login, switchable from the header or Settings |
| **Light / dark mode** | Full dual theming, works in both view modes, persisted |
| **Dashboard** | Total balance with count-up animation, **available vs. lien holds** (tap the lien chip for a full breakdown), hide-balance eye, quick actions, mini cards, animated spending donut, 6-month cash-flow bars, FX ticker |
| **Transactions** | ~200 generated days of Jamaican merchant history (Hi-Lo, JPS, Digicel, Lynk…), search, category chips, period & account filters, date grouping, load-more, detail modal, **CSV export** |
| **Cards** | Visa / Mastercard visual identity, **Lynk linked & Jam-Dex ready badges**, flip to see CVV, instant lock/unlock with stamp animation, spending-limit sliders, online/international/contactless toggles, report lost/stolen, add a new card with live preview + Luhn validation |
| **Send money** | **Local** (Lynk / Jam-Dex / bank transfer, free & instant), **International** (SWIFT, 4 currencies, live FX conversion, 0.75% fee), **Bill pay** (JPS, NWC, Digicel, Flow, PayMaster). 3-step flow with review, real balance updates, receipts |
| **2FA on payments** | Any transaction over **J$10,000** requires a one-time code — international payments highlight enhanced screening |
| **Investments** | Portfolio value, allocation donut, animated performance chart (6M/1Y), holding sparklines, buy flow (with 2FA over J$10k), fixed deposits with maturity progress |
| **Statements** | Monthly / 3-month / 6-month / 1-year statements with opening/closing balance, lien note and running balance — on-screen paper preview + **Print / Save as PDF** via a dedicated print stylesheet |
| **Settings** | Profile editing, theme, view mode, **live brand-colour re-skin** (for banks adopting the app), reduce-motion, biometric pref, trusted devices, session length, reset demo data |
| **Polish** | Login/logout curtain animations, welcome screen with view chooser, staggered widget entrances, category chip/donut animations, confetti on success, bottom-sheet modals on mobile, bottom tab bar + FAB, keyboard & reduced-motion support |

## Theming for banks

Every colour is a CSS custom property at the top of [`css/styles.css`](css/styles.css):

```css
:root {
  --brand: #00b8a9;   /* primary turquoise  */
  --brand-2: #0ea5e9; /* sky blue           */
  --lime: #84cc16;    /* success / income   */
  --sun: #ffc63d;     /* highlights         */
  --coral: #ff5d6c;   /* alerts / spend     */
}
```

Change the tokens (or use **Settings → Appearance → Brand colour** to re-skin live) and the whole app — buttons, cards, charts, gradients — follows.

## Project layout

```
index.html        app shell, all views, SVG icon sprite
css/styles.css    design system, themes, components, responsive, view modes
css/print.css     statement print layout (A4)
js/data.js        mock data + seeded transaction generator
js/charts.js      dependency-free animated SVG charts
js/app.js         state, routing, flows, 2FA, animations
```

State (theme, view mode, added cards, transfers, recipients) persists in `localStorage` — reset it from **Settings → Danger zone**.
