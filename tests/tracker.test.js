/**
 * PocketBudget core-logic tests.
 * Run:  node --test tests/tracker.test.js
 * No dependencies — uses the Node built-in test runner.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../tracker.js');

const good = (over = {}) => Object.assign(
  { description: 'Mess lunch', amount: '120', category: 'Food', date: '2026-11-03' },
  over,
);

test('validateExpense accepts a good expense', () => {
  const v = T.validateExpense(good());
  assert.equal(v.ok, true);
  assert.equal(v.expense.description, 'Mess lunch');
  assert.equal(v.expense.amount, 120);
  assert.equal(v.expense.category, 'Food');
  assert.equal(v.expense.date, '2026-11-03');
  assert.ok(v.expense.id.startsWith('exp_'));
});

test('validateExpense rejects bad input', () => {
  const cases = [
    [good({ description: '   ' }), 'empty description'],
    [good({ description: 'x'.repeat(121) }), 'over-long description'],
    [good({ amount: '' }), 'empty amount'],
    [good({ amount: 'abc' }), 'non-numeric amount'],
    [good({ amount: '0' }), 'zero amount'],
    [good({ amount: '-50' }), 'negative amount'],
    [good({ amount: 'Infinity' }), 'infinite amount'],
    [good({ category: 'Travel' }), 'unknown category'],
    [good({ date: '2026-13-01' }), 'impossible month'],
    [good({ date: '2026-02-30' }), 'impossible day'],
    [good({ date: '03-11-2026' }), 'wrong date format'],
  ];
  for (const [input, why] of cases) {
    const v = T.validateExpense(input);
    assert.equal(v.ok, false, 'should reject: ' + why);
    assert.ok(v.errors.length > 0, 'should explain: ' + why);
    assert.equal(v.expense, null);
  }
});

test('add / edit / delete round-trip', () => {
  const state = T.createState();
  const v = T.validateExpense(good());
  T.addExpense(state, v.expense);
  assert.equal(state.expenses.length, 1);

  const edited = T.editExpense(state, v.expense.id, good({ amount: '250', description: 'Mess dinner' }));
  assert.equal(edited.ok, true);
  assert.equal(state.expenses[0].amount, 250);
  assert.equal(state.expenses[0].description, 'Mess dinner');
  assert.equal(state.expenses[0].id, v.expense.id, 'id is preserved on edit');

  const badEdit = T.editExpense(state, v.expense.id, good({ amount: '-1' }));
  assert.equal(badEdit.ok, false);
  assert.equal(state.expenses[0].amount, 250, 'failed edit leaves the entry untouched');

  assert.equal(T.editExpense(state, 'nope', good()).ok, false);
  assert.equal(T.deleteExpense(state, 'nope'), false);
  assert.equal(T.deleteExpense(state, v.expense.id), true);
  assert.equal(state.expenses.length, 0);
});

test('totals by category and by month', () => {
  const state = T.createState();
  const rows = [
    ['A', 100, 'Food', '2026-11-01'],
    ['B', 200, 'Food', '2026-11-15'],
    ['C', 50, 'Transport', '2026-11-20'],
    ['D', 999, 'Food', '2026-10-31'],
  ];
  for (const [d, a, c, dt] of rows) {
    const v = T.validateExpense({ description: d, amount: String(a), category: c, date: dt });
    assert.equal(v.ok, true);
    T.addExpense(state, v.expense);
  }
  assert.equal(T.totalSpent(state.expenses), 1349);
  const nov = T.expensesForMonth(state.expenses, '2026-11');
  assert.equal(nov.length, 3);
  assert.equal(T.totalSpent(nov), 350);
  const byCat = T.totalsByCategory(nov);
  assert.equal(byCat.Food, 300);
  assert.equal(byCat.Transport, 50);
  assert.equal(byCat.Study, 0, 'unused categories report 0');
  assert.equal(T.expensesForMonth(state.expenses, '2026-12').length, 0);
});

test('budget math: remaining, percent, over-budget, per-category', () => {
  const list = [
    { amount: 300, category: 'Food' },
    { amount: 150, category: 'Transport' },
  ];
  const s = T.budgetSummary(list, { __total__: 1000, Food: 250 });
  assert.equal(s.spent, 450);
  assert.equal(s.remaining, 550);
  assert.equal(s.percentUsed, 45);
  assert.equal(s.overBudget, false);
  assert.equal(s.perCategory.Food.spent, 300);
  assert.equal(s.perCategory.Food.remaining, -50);
  assert.equal(s.perCategory.Food.percentUsed, 120);
  assert.equal(s.perCategory.Food.overBudget, true);
  assert.equal(s.perCategory.Transport.budget, null);
  assert.equal(s.perCategory.Transport.overBudget, false);

  const noBudget = T.budgetSummary(list, {});
  assert.equal(noBudget.totalBudget, null);
  assert.equal(noBudget.remaining, null);
  assert.equal(noBudget.percentUsed, null);
  assert.equal(noBudget.overBudget, false);

  const over = T.budgetSummary(list, { __total__: 400 });
  assert.equal(over.overBudget, true);
  assert.equal(over.remaining, -50);
});

test('CSV export format and round-trip import', () => {
  const state = T.createState();
  const rows = [
    ['Lunch, with "friends"', 120.5, 'Food', '2026-11-03'],
    ['Bus', 50, 'Transport', '2026-11-01'],
  ];
  for (const [d, a, c, dt] of rows) {
    const v = T.validateExpense({ description: d, amount: String(a), category: c, date: dt });
    T.addExpense(state, v.expense);
  }
  const csv = T.toCSV(state.expenses);
  const lines = csv.trim().split('\n');
  assert.equal(lines[0], 'date,description,category,amount');
  assert.equal(lines[1], '2026-11-01,Bus,Transport,50.00', 'sorted by date');
  assert.equal(lines[2], '2026-11-03,"Lunch, with ""friends""",Food,120.50', 'comma+quote escaped');

  const back = T.fromCSV(csv);
  assert.equal(back.ok, true);
  assert.equal(back.expenses.length, 2);
  assert.equal(back.expenses[1].description, 'Lunch, with "friends"');
  assert.equal(back.expenses[1].amount, 120.5);

  const empty = T.toCSV([]);
  assert.equal(empty, 'date,description,category,amount\n');
  const emptyBack = T.fromCSV(empty);
  assert.equal(emptyBack.ok, true);
  assert.equal(emptyBack.expenses.length, 0);
});

test('CSV import reports malformed rows instead of crashing', () => {
  const bad = [
    'date,description,category,amount',
    '2026-11-01,Bus,Transport,50.00',
    'not-a-date,Bus,Transport,50.00',
    '2026-11-02,Bus,Nope,50.00',
    '2026-11-03,Bus,Transport,-5',
    '2026-11-04,Only three fields,Food',
  ].join('\n');
  const parsed = T.fromCSV(bad);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.expenses.length, 1, 'only the one good row is kept');
  assert.equal(parsed.errors.length, 4);

  assert.equal(T.fromCSV('').ok, false);
  assert.equal(T.fromCSV('a,b,c\n1,2,3').ok, false, 'wrong header rejected');
});

test('validateBudget accepts blank (clear) and positive numbers only', () => {
  assert.deepEqual(T.validateBudget(''), { ok: true, value: null });
  assert.deepEqual(T.validateBudget('5000'), { ok: true, value: 5000 });
  assert.equal(T.validateBudget('-10').ok, false);
  assert.equal(T.validateBudget('abc').ok, false);
  assert.equal(T.validateBudget('Infinity').ok, false);
});

test('formatINR renders rupees with Indian grouping', () => {
  assert.equal(T.formatINR(0), '₹0.00');
  assert.equal(T.formatINR(120.5), '₹120.50');
  assert.equal(T.formatINR(123456.78), '₹1,23,456.78');
});
