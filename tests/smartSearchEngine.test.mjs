import assert from 'node:assert/strict';
import { normalizeSearchText } from '../src/lib/persianText.ts';
import { smartSearch, highlightRanges } from '../src/lib/smartSearch.ts';

assert.equal(normalizeSearchText('علي'), 'علی');
assert.equal(normalizeSearchText('كتاب'), 'کتاب');
assert.equal(normalizeSearchText('می‌خواهم'), 'می خواهم');
assert.equal(normalizeSearchText('۱۲۳٤٥'), '12345');
assert.equal(normalizeSearchText(null), '');

const items = [{ n: 'شرکت علی‌زاده' }, { n: 'علی' }, { n: 'بازرگانی علیرضا' }, { n: 'محمد' }];
const f = i => [i.n];
const r = smartSearch(items, 'علي', f).map(x => x.item.n);
assert.equal(r[0], 'علی', 'تطابق دقیق اول');
assert.ok(r.includes('شرکت علی‌زاده') && r.includes('بازرگانی علیرضا'));
assert.ok(!r.includes('محمد'));
assert.equal(smartSearch(items, 'علی', f)[0].item.n, 'علی', 'تطابق دقیق بالاتر از بقیه');
assert.equal(smartSearch(items, '', f).length, 4);
assert.equal(smartSearch(items, 'علی', f, { limit: 1 }).length, 1);
assert.deepEqual(smartSearch(items, 'qqq', f), []);
// جستجوی چندواژه‌ای در فیلدهای مختلف
const people = [{ a: 'رضا', b: '09121234567' }];
assert.equal(smartSearch(people, 'رضا ۰۹۱۲', x => [x.a, x.b]).length, 1);
assert.deepEqual(highlightRanges('شرکت علی', 'علي'), [[5, 8]]);
console.log('smartSearchEngine OK');
