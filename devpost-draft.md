# Devpost draft — LaunchPad Hacks 2026 (DO NOT SUBMIT — draft only)

## Title
PocketBudget — Student Expense Tracker

## Tagline
A free, offline-first pocket expense tracker for students: add expenses, set a monthly budget, see where your money goes — no account, no server, no tracking.

## Description

### The problem
Students live on tight monthly budgets — mess fees, bus passes, books,
chai with friends — but most expense apps want an account, a subscription,
or your bank data. The result: students either don't track spending at all,
or give up after a week of friction.

### The solution
PocketBudget is a pocket expense tracker that does one thing well: it shows
a student exactly where their money went this month, in under a minute,
with zero setup.

- Add, edit and delete expenses (description, amount in ₹, category, date).
- Monthly view — switch months to review past spending.
- Monthly budget — one total budget plus optional per-category budgets,
  with spent / remaining / % used and a clear over-budget warning.
- A bar chart drawn on plain canvas (no libraries) plus per-category totals.
- Search by description, filter by category.
- CSV export and import (malformed rows are reported, not silently dropped),
  plus a JSON backup export.
- One-click sample data (10 clearly-labelled sample expenses) so anyone can
  try the charts immediately; one-click delete-all.
- Private by design: everything is stored only in the browser
  (localStorage). No account, no server, no tracking. Works offline.

### Who it's for
Students — especially first-year students managing a monthly allowance or
pocket money for the first time.

### How I built it
Plain HTML, CSS and JavaScript. No frameworks, no libraries, no build step,
no network requests. The core logic (`tracker.js`) is a pure module with no
DOM or storage dependencies, shared between the browser UI and the Node test
suite — so the same code that runs in the browser is unit-tested.

### What I learned
- Keeping the core logic pure (no DOM, no storage) makes it trivially
  testable in Node while the UI stays thin.
- CSV is deceptively tricky: proper RFC 4180 quoting for commas and quotes
  in descriptions, and honest error reporting on import instead of
  silently dropping bad rows.
- Small scope wins: a focused prototype that does one thing well beats a
  half-built everything-app.

### Challenges
- Making the budget math honest: remaining, % used, and over-budget states
  for both the total budget and each category, including the "no budget set"
  state (no fake numbers shown).
- The Playwright smoke test needed a local Chromium (no `chromium-1248`
  build was present; used the installed `chromium-1254` build instead).

### What's next (if I keep building)
- Recurring expenses / bill reminders, a currency picker, and an optional
  export-to-PDF monthly summary. Sync is deliberately out of scope — the
  privacy story (data never leaves the device) is the point.

## Built with
HTML, CSS, JavaScript (no frameworks, no libraries)

## Try it out
- Live demo: https://devilking7x.github.io/pocketbudget/
- Source code: https://github.com/devilking7x/pocketbudget

## Testing instructions (for judges)
1. Open the live demo link. No sign-up — the app opens straight into the
   empty state.
2. Click **"Load sample data"** — 10 sample expenses and a ₹5,000 budget
   appear, with the chart and budget bar filled in.
3. Add an expense of your own (e.g. "Chai ₹40, Food, today") — totals,
   chart and budget update immediately.
4. Set a total budget of ₹100 in the Monthly budget section and save — the
   page shows the over-budget warning.
5. Try bad input (amount −5 or an empty description) — a clear error
   appears and nothing is added.
6. Export CSV, then delete all data with "Delete all data" and re-import
   the CSV to see the round-trip work.
7. Everything runs offline: disconnect from the network and reload — it
   still works (data is in your browser only).

## Test results (true, run 24 Nov 2026)
- Node core-logic tests: **9/9 pass** (`node --test tests/tracker.test.js`)
- Playwright smoke test: **passed** — page loads from disk with 0 console
  errors and 0 failed requests; adds an expense through the real form,
  sets a budget, rejects bad input, screenshots the result
  (`node tests/smoke.mjs`, Chromium 1254).

## Honest limits
- Data lives in one browser's localStorage — clearing browser data deletes
  it (use JSON backup / CSV export first).
- Single-user, single-device: no sync, no shared budgets, no accounts.
- Amounts are in Indian rupees (₹); no currency picker yet.
- Budgets are stored as one current set and apply to whichever month is
  selected in the UI.
