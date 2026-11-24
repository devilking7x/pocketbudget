/**
 * PocketBudget — core expense-tracker logic (pure, no DOM, no storage).
 *
 * This module is shared between the browser UI (app.js, loaded via a
 * <script> tag) and the Node test suite (tests/tracker.test.js).
 * It deliberately has no side effects: all state is passed in and returned.
 */

'use strict';

const CATEGORIES = ['Food', 'Transport', 'Study', 'Entertainment', 'Health', 'Other'];

/** Create a blank state object. */
function createState() {
  return { expenses: [], budgets: {} }; // budgets: { [category]: number, __total__: number }
}

/** Generate a reasonably unique id (timestamp + counter + random). */
let _counter = 0;
function newId() {
  _counter += 1;
  return 'exp_' + Date.now().toString(36) + '_' + _counter + '_' +
    Math.floor(Math.random() * 1e6).toString(36);
}

/**
 * Validate raw form input. Returns { ok, errors, expense }.
 * `input` = { description, amount, category, date } (all strings).
 * Amount must be a finite positive number, description non-empty,
 * category must be one of CATEGORIES, date must be a real YYYY-MM-DD date.
 */
function validateExpense(input) {
  const errors = [];
  const description = typeof input.description === 'string'
    ? input.description.trim() : '';
  if (!description) errors.push('Description is required.');
  if (description.length > 120) errors.push('Description must be 120 characters or fewer.');

  const amount = Number(input.amount);
  if (input.amount === '' || input.amount === null || input.amount === undefined ||
      Number.isNaN(amount) || !Number.isFinite(amount)) {
    errors.push('Amount must be a number.');
  } else if (amount <= 0) {
    errors.push('Amount must be greater than zero.');
  } else if (amount > 10000000) {
    errors.push('Amount is unrealistically large.');
  }

  const category = input.category;
  if (!CATEGORIES.includes(category)) errors.push('Category must be one of: ' + CATEGORIES.join(', ') + '.');

  let date = input.date;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    errors.push('Date must be in YYYY-MM-DD format.');
  } else {
    const d = new Date(date + 'T00:00:00Z');
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== date) {
      errors.push('Date is not a real calendar date.');
    }
  }

  if (errors.length) return { ok: false, errors, expense: null };
  return {
    ok: true,
    errors: [],
    expense: {
      id: newId(),
      description,
      amount: Math.round(amount * 100) / 100, // paise-level precision
      category,
      date,
      createdAt: new Date().toISOString(),
    },
  };
}

/** Add a validated expense to state. Returns the added expense. */
function addExpense(state, expense) {
  state.expenses.push(expense);
  return expense;
}

/** Remove an expense by id. Returns true if something was removed. */
function deleteExpense(state, id) {
  const before = state.expenses.length;
  state.expenses = state.expenses.filter((e) => e.id !== id);
  return state.expenses.length < before;
}

/**
 * Edit an expense: validate the new fields, then replace the entry
 * (keeping its id and createdAt). Returns { ok, errors }.
 */
function editExpense(state, id, input) {
  const found = state.expenses.find((e) => e.id === id);
  if (!found) return { ok: false, errors: ['Expense not found.'] };
  const v = validateExpense(input);
  if (!v.ok) return { ok: false, errors: v.errors };
  const updated = Object.assign({}, v.expense, { id, createdAt: found.createdAt });
  state.expenses = state.expenses.map((e) => (e.id === id ? updated : e));
  return { ok: true, errors: [] };
}

/** Total spent across all expenses in the list. */
function totalSpent(expenses) {
  return expenses.reduce((sum, e) => sum + e.amount, 0);
}

/** Totals per category; every category present, even at 0. */
function totalsByCategory(expenses) {
  const out = {};
  for (const c of CATEGORIES) out[c] = 0;
  for (const e of expenses) {
    if (out[e.category] !== undefined) out[e.category] += e.amount;
  }
  for (const c of CATEGORIES) out[c] = Math.round(out[c] * 100) / 100;
  return out;
}

/** Filter expenses to a month, "YYYY-MM". */
function expensesForMonth(expenses, month) {
  return expenses.filter((e) => typeof e.date === 'string' && e.date.slice(0, 7) === month);
}

/**
 * Budget math for a month. `budgets` = { __total__: number, [category]: number }.
 * Returns { totalBudget, spent, remaining, percentUsed, overBudget,
 *           perCategory: { [category]: { budget, spent, remaining, percentUsed, overBudget } } }
 * A category with no budget set gets budget: null and is skipped in the
 * per-category check.
 */
function budgetSummary(expenses, budgets) {
  const spent = Math.round(totalSpent(expenses) * 100) / 100;
  const totalBudget = budgets && typeof budgets.__total__ === 'number' && budgets.__total__ > 0
    ? budgets.__total__ : null;
  const byCat = totalsByCategory(expenses);
  const perCategory = {};
  for (const c of CATEGORIES) {
    const b = budgets && typeof budgets[c] === 'number' && budgets[c] > 0 ? budgets[c] : null;
    perCategory[c] = {
      budget: b,
      spent: byCat[c],
      remaining: b === null ? null : Math.round((b - byCat[c]) * 100) / 100,
      percentUsed: b === null ? null : Math.round((byCat[c] / b) * 1000) / 10,
      overBudget: b !== null && byCat[c] > b,
    };
  }
  return {
    totalBudget,
    spent,
    remaining: totalBudget === null ? null : Math.round((totalBudget - spent) * 100) / 100,
    percentUsed: totalBudget === null ? null : Math.round((spent / totalBudget) * 1000) / 10,
    overBudget: totalBudget !== null && spent > totalBudget,
    perCategory,
  };
}

/** Escape one CSV field (RFC 4180 quoting). */
function csvEscape(value) {
  const s = String(value);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/** Export expenses to CSV text. Header: date,description,category,amount */
function toCSV(expenses) {
  const lines = ['date,description,category,amount'];
  const sorted = expenses.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  for (const e of sorted) {
    lines.push([
      csvEscape(e.date),
      csvEscape(e.description),
      csvEscape(e.category),
      e.amount.toFixed(2),
    ].join(','));
  }
  return lines.join('\n') + '\n';
}

/**
 * Parse CSV produced by toCSV back into expense-like objects.
 * Returns { ok, expenses, errors }. Malformed rows are reported, not silently dropped.
 */
function fromCSV(text) {
  const expenses = [];
  const errors = [];
  if (typeof text !== 'string' || !text.trim()) {
    return { ok: false, expenses, errors: ['CSV text is empty.'] };
  }
  const rows = parseCsvRows(text);
  if (!rows.length) return { ok: false, expenses, errors: ['No rows found.'] };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const expected = ['date', 'description', 'category', 'amount'];
  if (header.join(',') !== expected.join(',')) {
    return { ok: false, expenses, errors: ['Header must be: ' + expected.join(',')] };
  }
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (row.length === 1 && row[0] === '') continue; // trailing blank line
    if (row.length !== 4) {
      errors.push('Line ' + (i + 1) + ': expected 4 fields, got ' + row.length + '.');
      continue;
    }
    const v = validateExpense({
      description: row[1], amount: row[3], category: row[2], date: row[0],
    });
    if (!v.ok) {
      errors.push('Line ' + (i + 1) + ': ' + v.errors.join(' '));
      continue;
    }
    expenses.push(v.expense);
  }
  return { ok: errors.length === 0, expenses, errors };
}

/** Minimal RFC 4180 row parser (handles quoted fields, embedded commas/quotes/newlines). */
function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n') {
      row.push(field); field = ''; rows.push(row); row = [];
    } else if (ch === '\r') {
      // ignore; \n handles the line end
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** Validate a budget value: empty string clears it; otherwise a positive number. */
function validateBudget(raw) {
  if (raw === '' || raw === null || raw === undefined) return { ok: true, value: null };
  const n = Number(raw);
  if (Number.isNaN(n) || !Number.isFinite(n)) return { ok: false, value: null, error: 'Budget must be a number.' };
  if (n < 0) return { ok: false, value: null, error: 'Budget cannot be negative.' };
  if (n > 100000000) return { ok: false, value: null, error: 'Budget is unrealistically large.' };
  return { ok: true, value: Math.round(n * 100) / 100 };
}

/** Format an amount as Indian rupees (₹) with 2 decimals. */
function formatINR(amount) {
  return '₹' + Number(amount).toLocaleString('en-IN', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CATEGORIES, createState, newId, validateExpense, addExpense, deleteExpense,
    editExpense, totalSpent, totalsByCategory, expensesForMonth, budgetSummary,
    csvEscape, toCSV, fromCSV, parseCsvRows, validateBudget, formatINR,
  };
}
