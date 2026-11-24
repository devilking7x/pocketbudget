# PocketBudget — Student Expense Tracker

A free, offline-first pocket expense tracker for students, built for
[LaunchPad Hacks 2026](https://launchpad-hacks.devpost.com/).

Live demo: https://devilking7x.github.io/pocketbudget/

## What it does

- **Add, edit and delete expenses** — description, amount (₹), category
  (Food, Transport, Study, Entertainment, Health, Other) and date.
- **Monthly view** — switch months to review past spending.
- **Monthly budget** — one total budget plus optional per-category budgets,
  with spent / remaining / % used and a clear over-budget warning.
- **Charts without libraries** — a bar chart drawn on plain `<canvas>`,
  plus a per-category totals list.
- **Search & filter** — filter by category, search by description.
- **CSV export / import** — export the current month as CSV, import a CSV
  back in (malformed rows are reported, not silently dropped). JSON backup
  export too.
- **Sample data** — one click loads 10 clearly-labelled sample expenses so
  you can try the charts immediately; delete everything in one click.
- **Private by design** — everything is stored only in your browser
  (`localStorage`). No account, no server, no tracking, works offline.

## How to run it

No build step, no dependencies, no server needed. Open `index.html` in any
modern browser — or serve the folder with any static server:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## How it works

- `tracker.js` — pure core logic (validation, add/edit/delete, totals,
  budget math, CSV in/out, ₹ formatting). No DOM, no storage, no side
  effects — shared by the browser UI and the Node test suite.
- `app.js` — browser UI: rendering, forms, `localStorage` persistence,
  canvas chart, file download/upload.
- `index.html` / `styles.css` — markup and styling. No frameworks, no
  external libraries, no network requests at all.

## Tests

```sh
node --test tests/tracker.test.js   # 9 core-logic tests, no dependencies
node tests/smoke.mjs                # Playwright smoke test (needs playwright-core:
                                    #   npm install playwright-core)
```

Results on 24 Nov 2026: **9/9 Node tests pass**; Playwright smoke test
passed — page loads from disk with **0 console errors, 0 failed requests**,
adds an expense through the real form, sets a budget, rejects bad input
with a visible error, and screenshots the result.

## Limits (honest)

- Data lives in one browser's `localStorage` — clearing browser data deletes
  it. Use the JSON backup / CSV export before clearing.
- Single-user, single-device: no sync, no shared budgets, no accounts.
- Amounts are in Indian rupees (₹); there is no currency picker.
- Budgets are per selected month in the UI but stored as one current set —
  switching months keeps the same budget values.
- No recurring-expense or bill-reminder features (out of scope for this
  prototype).

## Built with

Plain HTML, CSS and JavaScript. No frameworks, no libraries, no build step.

## Author

Mohd Raja ([devilking7x](https://github.com/devilking7x)) — solo entry,
LaunchPad Hacks 2026.
