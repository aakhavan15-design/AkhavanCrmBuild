import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { generateSeedData, applyDemoSeed, purgeDemoData } from '../src/lib/seed.ts';
import { applyDemoSeedExtended } from '../src/lib/seedExtended.ts';
import { checkIntegrity, splitState } from '../src/lib/stateModel.mjs';

const registry = JSON.parse(fs.readFileSync(new URL('../src/config/stateCollections.json', import.meta.url), 'utf8'));
const NOW = new Date('2026-11-11T10:00:00Z');
const build = () => { const s = generateSeedData({ includeDemo: false }); applyDemoSeed(s, NOW); const rep = applyDemoSeedExtended(s, NOW); return { s, rep }; };
const { s, rep } = build();
const sum = (a) => a.reduce((x, y) => x + y, 0);
const x = (list) => (list || []).filter(r => String(r.id).startsWith('demo-x-'));

test('volumes are enough for every report area', () => {
  const c = rep.created;
  assert.ok(c.users >= 14 && c.customers >= 140 && c.externalProducts >= 28);
  assert.ok(c.invoices >= 150 && c.payments >= 100 && c.expenses >= 300);
  assert.ok(c.treasuryAccounts === 5 && c.treasuryTransactions >= 300);
  assert.ok(c.purchaseOrders >= 60 && c.goodsReceipts >= 40 && c.supplierBills >= 40 && c.stockMovements >= 100);
  assert.ok(c.visits >= 700);
  console.log(JSON.stringify(c));
});

test('visitor / supervisor / general manager hierarchy owns routes', () => {
  const users = x(s.users); const byId = new Map(users.map(u => [u.id, u]));
  const vis = users.filter(u => u.jobTitle === 'ویزیتور بازاریاب'), sup = users.filter(u => u.jobTitle === 'سرپرست فروش'), gm = users.filter(u => u.jobTitle === 'مدیر کل');
  assert.equal(vis.length, 8); assert.equal(sup.length, 2); assert.equal(gm.length, 1);
  assert.ok(vis.every(v => byId.get(v.managerId)?.jobTitle === 'سرپرست فروش'));
  assert.ok(sup.every(v => v.managerId === gm[0].id));
  for (const v of vis) assert.ok(x(s.customers).filter(c => c.ownerId === v.id).length >= 15, 'each visitor has a route');
});

test('12 months of sales documents with arithmetic consistency', () => {
  const inv = x(s.invoices); const months = new Set(inv.map(i => i.date.slice(0, 7)));
  assert.ok(months.size >= 11, `months=${months.size}`);
  for (const i of inv) {
    assert.equal(i.totalAmount, sum(i.lines.map(l => l.lineTotal)), i.id);
    assert.equal(i.balance, i.totalAmount - i.paidAmount, i.id);
    assert.ok(i.balance >= 0);
    assert.equal(i.status, i.balance <= 0 ? 'PAID' : i.paidAmount > 0 ? 'PARTIAL' : (i.dueDate < '2026-11-11' ? 'OVERDUE' : 'UNPAID'));
  }
  const statuses = new Set(inv.map(i => i.status)); for (const st of ['PAID', 'PARTIAL', 'OVERDUE', 'UNPAID']) assert.ok(statuses.has(st), st);
  const allocByInv = new Map(); x(s.paymentAllocations).forEach(a => allocByInv.set(a.invoiceId, (allocByInv.get(a.invoiceId) || 0) + a.amount));
  for (const i of inv) assert.equal(allocByInv.get(i.id) || 0, i.paidAmount, `allocation matches paid ${i.id}`);
  const chq = new Set(x(s.cheques).map(c => c.status)); assert.ok(chq.has('CLEARED') && chq.has('PENDING'));
});

test('treasury: running balances never negative and match transactions', () => {
  for (const a of x(s.treasuryAccounts)) {
    const list = x(s.treasuryTransactions).filter(t => t.accountId === a.id).sort((p, q) => p.date.localeCompare(q.date) || p.id.localeCompare(q.id));
    let bal = a.openingBalance; for (const t of list) { bal += t.direction === 'IN' ? t.amount : -t.amount; assert.equal(t.balanceAfter, bal); assert.ok(bal >= 0, `${a.id} negative on ${t.date}`); }
    assert.equal(a.currentBalance, bal);
  }
  assert.ok(x(s.treasuryTransactions).every(t => t.date <= '2026-11-11'));
});

test('purchasing and stock reconcile; expenses carry accounting codes and flagged items', () => {
  for (const p of x(s.externalProducts)) {
    const q = sum(x(s.stockMovements).filter(m => m.productId === p.id).map(m => m.qty));
    assert.equal(p.stock, q, p.id); assert.ok(p.stock >= 0);
  }
  for (const b of x(s.supplierBills)) assert.ok(b.paidAmount <= b.amount);
  const exp = x(s.expenses); assert.ok(exp.filter(e => e.suspicious).length >= 8);
  assert.ok(exp.filter(e => e.status === 'PAID' && !e.staffId).every(e => e.accountCode && e.subAccountCode));
  assert.ok(exp.some(e => e.status === 'DUE' && e.dueDate > '2026-11-11'));
});

test('referential integrity of the whole demo graph, idempotency and purge', () => {
  const split = splitState(s, registry); const lists = Object.fromEntries(Object.entries(split.collections).map(([n, m]) => [n, [...m.values()]]));
  const demoOnly = checkIntegrity(lists, registry).filter(i => String(i.id).startsWith('demo-x-'));
  assert.deepEqual(demoOnly, []);
  const again = applyDemoSeedExtended(s, NOW); assert.equal(again.total, 0);
  const before = (s.users || []).filter(u => !String(u.id).startsWith('demo-')).length;
  assert.ok(purgeDemoData(s) > 1000);
  assert.equal((s.users || []).filter(u => !String(u.id).startsWith('demo-')).length, before);
});
