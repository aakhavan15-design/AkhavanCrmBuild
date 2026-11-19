import assert from 'node:assert/strict';
import {
  searchRows, applyFilters, facetCounts, sortRows, paginate, toCsv, csvCell, rangeIds, headerCheckState
} from '../src/lib/tableEngine.ts';

const rows = [
  { id: 'a', name: 'یاس', code: 'C-10', phone: '0912', limit: 500, status: 'ACTIVE', linked: true },
  { id: 'b', name: 'ایران', code: 'C-2', phone: '', limit: undefined, status: 'ACTIVE', linked: false },
  { id: 'c', name: 'بهار', code: 'C-1', phone: '0935', limit: 100, status: 'INACTIVE', linked: true },
  { id: 'd', name: '=SUM(A1)', code: 'C-3', phone: '0990', limit: 0, status: 'ACTIVE', linked: false }
];
const cols = [
  { id: 'name', header: 'نام', value: r => r.name, sortable: true },
  { id: 'code', header: 'کد', value: r => r.code, sortable: true },
  { id: 'limit', header: 'سقف', value: r => r.limit, sortable: true },
  { id: 'phone', header: 'تلفن', value: r => r.phone, searchable: false }
];

// search: AND of terms, respects searchable=false, extra text, normalizer
assert.deepEqual(searchRows(rows, 'c-1', cols).map(r => r.id), ['a', 'c']);
assert.deepEqual(searchRows(rows, 'c-1 بهار', cols).map(r => r.id), ['c']);
assert.deepEqual(searchRows(rows, '0912', cols).map(r => r.id), [], 'non-searchable column must not match');
assert.deepEqual(searchRows(rows, '0912', cols, undefined, r => [r.phone]).map(r => r.id), ['a'], 'extraText participates');
assert.equal(searchRows(rows, '   ', cols).length, 4, 'blank query returns all');
const upper = s => s.toUpperCase();
assert.deepEqual(searchRows(rows, 'c-2', cols, upper).map(r => r.id), ['b']);

// filters: OR inside group, AND across groups
const groups = [
  { id: 'status', label: 'وضعیت', options: [{ value: 'ACTIVE', label: 'فعال' }, { value: 'INACTIVE', label: 'غیرفعال' }], predicate: (r, v) => r.status === v },
  { id: 'erp', label: 'ERP', options: [{ value: 'linked', label: 'متصل' }, { value: 'local', label: 'محلی' }], predicate: (r, v) => (v === 'linked') === r.linked }
];
assert.equal(applyFilters(rows, groups, {}).length, 4);
assert.deepEqual(applyFilters(rows, groups, { status: ['ACTIVE', 'INACTIVE'] }).length, 4, 'OR within group');
assert.deepEqual(applyFilters(rows, groups, { status: ['ACTIVE'], erp: ['local'] }).map(r => r.id), ['b', 'd'], 'AND across groups');

// facet counts: each count equals the real result after selecting that option
const counts = facetCounts(rows, groups, { status: ['ACTIVE'] });
assert.equal(counts.erp.linked, applyFilters(rows, groups, { status: ['ACTIVE'], erp: ['linked'] }).length);
assert.equal(counts.erp.local, 2);
assert.equal(counts.status.INACTIVE, 1, 'own group is not constrained by its own selection');

// sort: stable, numeric, fa collation, empty always last in both directions
assert.deepEqual(sortRows(rows, cols, { columnId: 'limit', direction: 'asc' }).map(r => r.id), ['d', 'c', 'a', 'b']);
assert.deepEqual(sortRows(rows, cols, { columnId: 'limit', direction: 'desc' }).map(r => r.id), ['a', 'c', 'd', 'b']);
assert.deepEqual(sortRows(rows, cols, { columnId: 'code', direction: 'asc' }).map(r => r.code), ['C-1', 'C-2', 'C-3', 'C-10'], 'natural numeric order');
assert.deepEqual(sortRows(rows, cols, null).map(r => r.id), ['a', 'b', 'c', 'd']);
assert.deepEqual(sortRows(rows, cols, { columnId: 'phone', direction: 'asc' }).map(r => r.id), ['a', 'c', 'd', 'b'], 'empty phone sorts last');
const locked = [{ id: 'name', header: 'نام', value: r => r.name, sortable: false }];
assert.deepEqual(sortRows(rows, locked, { columnId: 'name', direction: 'desc' }).map(r => r.id), ['a', 'b', 'c', 'd'], 'sortable:false is respected');
assert.deepEqual(sortRows(rows, cols, { columnId: 'unknown', direction: 'asc' }).map(r => r.id), ['a', 'b', 'c', 'd'], 'unknown column is a no-op');
assert.equal(rows[0].id, 'a', 'input must not be mutated');

// paginate
const p = paginate(Array.from({ length: 53 }, (_, i) => i), 3, 25);
assert.deepEqual([p.page, p.pageCount, p.total, p.from, p.to, p.rows.length], [3, 3, 53, 51, 53, 3]);
assert.equal(paginate([1, 2], 9, 25).page, 1, 'page is clamped');
assert.deepEqual(paginate([], 1, 25), { rows: [], page: 1, pageCount: 1, total: 0, from: 0, to: 0 });

// csv: formula injection, quoting, BOM, numbers keep sign
assert.equal(csvCell('=1+1'), "'=1+1");
assert.equal(csvCell('@cmd'), "'@cmd");
assert.equal(csvCell(' \t=cmd'), "' \t=cmd", 'leading whitespace/control characters must not bypass formula protection');
assert.equal(csvCell(-5), '-5', 'real negative numbers are not mangled');
assert.equal(csvCell('a,"b"'), '"a,""b"""');
assert.equal(csvCell(undefined), '');
const csv = toCsv(rows, cols, ['name', 'limit']);
assert.ok(csv.startsWith('\uFEFF'));
const lines = csv.slice(1).split('\r\n');
assert.equal(lines[0], 'نام,سقف');
assert.equal(lines[4], "'=SUM(A1),0");
assert.equal(lines.length, 5);

// selection helpers
const ids = ['a', 'b', 'c', 'd'];
assert.deepEqual(rangeIds(ids, 'b', 'd'), ['b', 'c', 'd']);
assert.deepEqual(rangeIds(ids, 'd', 'b'), ['b', 'c', 'd']);
assert.deepEqual(rangeIds(ids, null, 'c'), ['c']);
assert.deepEqual(rangeIds(ids, 'zzz', 'c'), ['c']);
assert.equal(headerCheckState(ids, new Set()), 'none');
assert.equal(headerCheckState(ids, new Set(['a'])), 'some');
assert.equal(headerCheckState(ids, new Set(ids)), 'all');
assert.equal(headerCheckState([], new Set(['a'])), 'none');

console.log('tableEngine.test.mjs: all assertions passed');
