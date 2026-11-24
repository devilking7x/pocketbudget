/**
 * PocketBudget Playwright smoke test.
 * Loads index.html from disk, checks for console errors / failed requests,
 * adds one expense through the real form, and screenshots the result.
 *
 * Run:  node tests/smoke.mjs
 * Requires: playwright-core (installed in /tmp/pwtest) and the Chromium
 * build at ~/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome
 * (falls back to chromium-1243 if 1254 is absent).
 * The screenshot is written to /tmp (this repo is text-only).
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const home = os.homedir();
const candidates = [
  path.join(home, '.cache/ms-playwright/chromium-1254/chrome-linux64/chrome'),
  path.join(home, '.cache/ms-playwright/chromium-1243/chrome-linux64/chrome'),
];
const executablePath = candidates.find((p) => fs.existsSync(p));
if (!executablePath) {
  console.error('No Playwright Chromium found in ~/.cache/ms-playwright');
  process.exit(1);
}

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pageUrl = 'file://' + path.join(root, 'index.html');
const shotPath = '/tmp/pocketbudget-smoke.png';

const browser = await chromium.launch({ executablePath });
const page = await browser.newPage();
const errors = [];
const failedRequests = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});
page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
page.on('requestfailed', (req) => failedRequests.push(req.url() + ' :: ' + (req.failure()?.errorText || '')));

await page.goto(pageUrl, { waitUntil: 'domcontentloaded' });

// App shell renders.
const heading = await page.textContent('h1');
if (!heading.includes('PocketBudget')) throw new Error('H1 missing: ' + heading);

// Add one expense through the real form.
await page.fill('#descInput', 'Smoke test lunch');
await page.fill('#amountInput', '150');
await page.selectOption('#categoryInput', 'Food');
// date defaults to today; leave it.
await page.click('#submitBtn');
await page.waitForSelector('#expenseBody tr', { timeout: 5000 });
const rowText = await page.textContent('#expenseBody');
if (!rowText.includes('Smoke test lunch') || !rowText.includes('₹150.00')) {
  throw new Error('Added expense did not appear in the table: ' + rowText);
}
const spent = await page.textContent('#spentValue');
if (!spent.includes('150.00')) throw new Error('Spent total did not update: ' + spent);

// Set a budget and check the progress UI appears.
await page.fill('#totalBudgetInput', '1000');
await page.click('#budgetForm button[type="submit"]');
await page.waitForFunction(() => !document.getElementById('progressWrap').hidden);
const progress = await page.textContent('#progressText');
if (!progress.includes('15%')) throw new Error('Progress text wrong: ' + progress);

// Bad input must be rejected with a visible error, not a crash.
await page.fill('#descInput', 'Bad one');
await page.fill('#amountInput', '-5');
await page.click('#submitBtn');
await page.waitForFunction(() => !document.getElementById('formError').hidden);
const errText = await page.textContent('#formError');
if (!errText.toLowerCase().includes('greater than zero')) {
  throw new Error('Validation error missing: ' + errText);
}
const rowsAfterBad = await page.$$('#expenseBody tr');
if (rowsAfterBad.length !== 1) throw new Error('Bad expense was added to the table');

await page.screenshot({ path: shotPath, fullPage: true });
await browser.close();

if (errors.length) throw new Error('Console/page errors: ' + errors.join(' | '));
if (failedRequests.length) throw new Error('Failed requests: ' + failedRequests.join(' | '));

console.log('Smoke test PASSED');
console.log('  page: ' + pageUrl);
console.log('  screenshot: ' + shotPath);
console.log('  console errors: 0, failed requests: 0');
