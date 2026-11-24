/**
 * PocketBudget — browser UI.
 * All data lives in localStorage under STORAGE_KEY. No network calls.
 * Core logic lives in tracker.js (shared with the Node test suite).
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'pocketbudget.v1';
  var state = createState();
  var editingId = null;
  var currentMonth = new Date().toISOString().slice(0, 7);

  var $ = function (id) { return document.getElementById(id); };

  /* ---------- persistence ---------- */

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      showStatus('Could not save: browser storage is full or unavailable.', true);
    }
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.expenses)) {
        state.expenses = parsed.expenses.filter(function (e) {
          return e && typeof e.id === 'string' && typeof e.amount === 'number';
        });
      }
      if (parsed && parsed.budgets && typeof parsed.budgets === 'object') {
        state.budgets = parsed.budgets;
      }
    } catch (e) {
      // Corrupt storage: start fresh rather than crash the page.
      state = createState();
    }
  }

  /* ---------- helpers ---------- */

  function showStatus(msg, isError) {
    var el = $('dataStatus');
    el.textContent = msg;
    el.style.color = isError ? '#b3261e' : '#145c3b';
  }

  function monthExpenses() {
    return expensesForMonth(state.expenses, currentMonth);
  }

  function filteredExpenses() {
    var list = monthExpenses();
    var cat = $('filterSelect').value;
    var q = $('searchInput').value.trim().toLowerCase();
    if (cat) list = list.filter(function (e) { return e.category === cat; });
    if (q) list = list.filter(function (e) { return e.description.toLowerCase().indexOf(q) !== -1; });
    return list.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  }

  /* ---------- rendering ---------- */

  function renderSummary() {
    var list = monthExpenses();
    var summary = budgetSummary(list, state.budgets);
    $('spentValue').textContent = formatINR(summary.spent);
    $('countValue').textContent = String(list.length);
    $('budgetValue').textContent = summary.totalBudget === null ? 'Not set' : formatINR(summary.totalBudget);
    var rem = $('remainingValue');
    if (summary.totalBudget === null) {
      rem.textContent = '—';
      rem.classList.remove('over');
    } else {
      rem.textContent = formatINR(summary.remaining);
      rem.classList.toggle('over', summary.overBudget);
    }
    var wrap = $('progressWrap');
    if (summary.totalBudget === null) {
      wrap.hidden = true;
      $('budgetHint').hidden = false;
    } else {
      wrap.hidden = false;
      $('budgetHint').hidden = true;
      var pct = Math.min(summary.percentUsed, 100);
      $('progressFill').style.width = pct + '%';
      $('progressFill').classList.toggle('over', summary.overBudget);
      $('progressText').textContent = summary.percentUsed + '% of budget used' +
        (summary.overBudget ? ' — over budget by ' + formatINR(-summary.remaining) + '.' : '.');
    }
  }

  function renderChart() {
    var canvas = $('chartCanvas');
    var ctx = canvas.getContext('2d');
    var totals = totalsByCategory(monthExpenses());
    var max = 0;
    CATEGORIES.forEach(function (c) { if (totals[c] > max) max = totals[c]; });
    var W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    if (max === 0) {
      ctx.fillStyle = '#5b6478';
      ctx.font = '16px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No spending in this month yet.', W / 2, H / 2);
      return;
    }
    var barW = 72, gap = (W - barW * CATEGORIES.length) / (CATEGORIES.length + 1);
    var chartTop = 30, chartBottom = H - 44;
    CATEGORIES.forEach(function (c, i) {
      var h = (totals[c] / max) * (chartBottom - chartTop);
      var x = gap + i * (barW + gap);
      var y = chartBottom - h;
      ctx.fillStyle = totals[c] > 0 ? '#1d7a4f' : '#d5dae3';
      ctx.fillRect(x, y, barW, h);
      ctx.fillStyle = '#1c2333';
      ctx.font = '13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      if (totals[c] > 0) ctx.fillText(formatINR(totals[c]), x + barW / 2, y - 8);
      ctx.fillStyle = '#5b6478';
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText(c, x + barW / 2, H - 24);
    });
  }

  function renderCatList() {
    var totals = totalsByCategory(monthExpenses());
    var summary = budgetSummary(monthExpenses(), state.budgets);
    var ul = $('catList');
    ul.innerHTML = '';
    CATEGORIES.forEach(function (c) {
      var li = document.createElement('li');
      var left = document.createElement('span');
      left.textContent = c;
      var right = document.createElement('span');
      var text = formatINR(totals[c]);
      var pc = summary.perCategory[c];
      if (pc.budget !== null) {
        text += ' / ' + formatINR(pc.budget) + ' budget' + (pc.overBudget ? ' — over!' : '');
      }
      right.textContent = text;
      li.appendChild(left);
      li.appendChild(right);
      ul.appendChild(li);
    });
  }

  function renderTable() {
    var list = filteredExpenses();
    var tbody = $('expenseBody');
    tbody.innerHTML = '';
    $('emptyMsg').hidden = list.length > 0;
    list.forEach(function (e) {
      var tr = document.createElement('tr');
      var tdDate = document.createElement('td'); tdDate.textContent = e.date;
      var tdDesc = document.createElement('td'); tdDesc.textContent = e.description;
      var tdCat = document.createElement('td'); tdCat.textContent = e.category;
      var tdAmt = document.createElement('td'); tdAmt.className = 'num'; tdAmt.textContent = formatINR(e.amount);
      var tdAct = document.createElement('td');
      var editBtn = document.createElement('button');
      editBtn.type = 'button'; editBtn.className = 'row-btn'; editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', function () { startEdit(e.id); });
      var delBtn = document.createElement('button');
      delBtn.type = 'button'; delBtn.className = 'row-btn delete'; delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', function () {
        if (window.confirm('Delete "' + e.description + '" (' + formatINR(e.amount) + ')?')) {
          deleteExpense(state, e.id);
          save(); renderAll();
          showStatus('Expense deleted.');
        }
      });
      tdAct.appendChild(editBtn); tdAct.appendChild(delBtn);
      tr.appendChild(tdDate); tr.appendChild(tdDesc); tr.appendChild(tdCat);
      tr.appendChild(tdAmt); tr.appendChild(tdAct);
      tbody.appendChild(tr);
    });
  }

  function renderBudgetsForm() {
    $('totalBudgetInput').value = state.budgets.__total__ != null ? state.budgets.__total__ : '';
    var wrap = $('catBudgetInputs');
    wrap.innerHTML = '';
    CATEGORIES.forEach(function (c) {
      var label = document.createElement('label');
      label.textContent = c + ' (₹)';
      var input = document.createElement('input');
      input.type = 'number'; input.min = '0'; input.step = '1'; input.inputMode = 'decimal';
      input.dataset.category = c;
      input.value = state.budgets[c] != null ? state.budgets[c] : '';
      label.appendChild(input);
      wrap.appendChild(label);
    });
  }

  function renderAll() {
    renderSummary();
    renderChart();
    renderCatList();
    renderTable();
  }

  /* ---------- edit flow ---------- */

  function startEdit(id) {
    var e = state.expenses.find(function (x) { return x.id === id; });
    if (!e) return;
    editingId = id;
    $('descInput').value = e.description;
    $('amountInput').value = e.amount;
    $('categoryInput').value = e.category;
    $('dateInput').value = e.date;
    $('submitBtn').textContent = 'Save changes';
    $('cancelEditBtn').hidden = false;
    $('descInput').focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEdit() {
    editingId = null;
    $('expenseForm').reset();
    $('dateInput').value = new Date().toISOString().slice(0, 10);
    $('submitBtn').textContent = 'Add expense';
    $('cancelEditBtn').hidden = true;
    $('formError').hidden = true;
  }

  /* ---------- sample data ---------- */

  function loadSampleData() {
    var today = new Date();
    var ym = today.toISOString().slice(0, 7);
    var day = function (d) { return ym + '-' + String(d).padStart(2, '0'); };
    var samples = [
      ['Mess lunch', 120, 'Food', day(1)],
      ['Bus pass', 450, 'Transport', day(2)],
      ['Notebook set', 180, 'Study', day(3)],
      ['Chai with friends', 60, 'Food', day(4)],
      ['Movie ticket', 250, 'Entertainment', day(5)],
      ['Groceries', 620, 'Food', day(6)],
      ['Metro card top-up', 200, 'Transport', day(7)],
      ['Python course book', 499, 'Study', day(8)],
      ['Pharmacy', 150, 'Health', day(9)],
      ['Street food', 90, 'Food', day(10)],
    ];
    samples.forEach(function (s) {
      var v = validateExpense({ description: s[0], amount: String(s[1]), category: s[2], date: s[3] });
      if (v.ok) addExpense(state, v.expense);
    });
    if (state.budgets.__total__ == null) state.budgets.__total__ = 5000;
    save(); renderAll(); renderBudgetsForm();
    showStatus('Sample data loaded (10 expenses, ₹5,000 budget). Delete it any time with “Delete all data”.');
  }

  /* ---------- wiring ---------- */

  function init() {
    load();
    $('monthInput').value = currentMonth;
    $('dateInput').value = new Date().toISOString().slice(0, 10);

    var catSel = $('categoryInput');
    CATEGORIES.forEach(function (c) {
      var opt = document.createElement('option'); opt.value = c; opt.textContent = c;
      catSel.appendChild(opt);
    });
    var filterSel = $('filterSelect');
    CATEGORIES.forEach(function (c) {
      var opt = document.createElement('option'); opt.value = c; opt.textContent = c;
      filterSel.appendChild(opt);
    });

    $('monthInput').addEventListener('change', function () {
      currentMonth = $('monthInput').value || new Date().toISOString().slice(0, 7);
      renderAll();
    });
    $('filterSelect').addEventListener('change', renderTable);
    $('searchInput').addEventListener('input', renderTable);

    $('expenseForm').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var input = {
        description: $('descInput').value,
        amount: $('amountInput').value,
        category: $('categoryInput').value,
        date: $('dateInput').value,
      };
      var err = $('formError');
      if (editingId) {
        var res = editExpense(state, editingId, input);
        if (!res.ok) { err.textContent = res.errors.join(' '); err.hidden = false; return; }
        showStatus('Expense updated.');
      } else {
        var v = validateExpense(input);
        if (!v.ok) { err.textContent = v.errors.join(' '); err.hidden = false; return; }
        addExpense(state, v.expense);
        showStatus('Expense added: ' + v.expense.description + ' — ' + formatINR(v.expense.amount) + '.');
      }
      err.hidden = true;
      save();
      cancelEdit();
      renderAll();
    });

    $('cancelEditBtn').addEventListener('click', cancelEdit);

    $('budgetForm').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var err = $('budgetError');
      var total = validateBudget($('totalBudgetInput').value);
      if (!total.ok) { err.textContent = total.error; err.hidden = false; return; }
      var next = {};
      if (total.value !== null) next.__total__ = total.value;
      var bad = null;
      var inputs = $('catBudgetInputs').querySelectorAll('input');
      inputs.forEach(function (input) {
        var r = validateBudget(input.value);
        if (!r.ok) bad = r.error;
        else if (r.value !== null) next[input.dataset.category] = r.value;
      });
      if (bad) { err.textContent = bad; err.hidden = false; return; }
      state.budgets = next;
      save();
      renderAll();
      err.hidden = true;
      showStatus('Budgets saved.');
    });

    $('exportCsvBtn').addEventListener('click', function () {
      download('pocketbudget-' + currentMonth + '.csv', toCSV(monthExpenses()), 'text/csv');
      showStatus('CSV exported for ' + currentMonth + ' (' + monthExpenses().length + ' expenses).');
    });

    $('exportJsonBtn').addEventListener('click', function () {
      download('pocketbudget-backup.json', JSON.stringify(state, null, 2), 'application/json');
      showStatus('JSON backup downloaded.');
    });

    $('importCsvInput').addEventListener('change', function (ev) {
      var file = ev.target.files && ev.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var parsed = fromCSV(String(reader.result));
        if (parsed.expenses.length) {
          parsed.expenses.forEach(function (e) { addExpense(state, e); });
          save(); renderAll();
        }
        if (parsed.ok) {
          showStatus('Imported ' + parsed.expenses.length + ' expenses from CSV.');
        } else {
          showStatus('Imported ' + parsed.expenses.length + ' expenses. Problems: ' + parsed.errors.join(' '), true);
        }
      };
      reader.readAsText(file);
      ev.target.value = '';
    });

    $('sampleBtn').addEventListener('click', function () {
      if (state.expenses.length && !window.confirm('Load 10 sample expenses into the current month? Your existing data stays.')) return;
      loadSampleData();
    });

    $('clearBtn').addEventListener('click', function () {
      if (!window.confirm('Delete ALL PocketBudget data (expenses and budgets)? This cannot be undone.')) return;
      state = createState();
      editingId = null;
      save(); renderAll(); renderBudgetsForm();
      showStatus('All data deleted.');
    });

    renderBudgetsForm();
    renderAll();
  }

  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
