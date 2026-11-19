import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

test('هر فضای کاری ورودی پایش مغایرت اختصاصی دارد', () => {
  const landing = read('src/lib/moduleLanding.ts');
  const ids = ['home', 'customers', 'sales', 'commerce', 'finance', 'work', 'reports', 'organization'];
  for (const id of ids) {
    assert.match(landing, new RegExp(`id: '${id}'`));
  }
  assert.match(landing, /module\.groups\.push\(\{[\s\S]*?title: 'پایش و کنترل'/);
  assert.match(landing, /`\/audit\?module=\$\{module\.id\}`/);
  assert.match(landing, /tile\([\s\S]*?'پایش مغایرت'/);
});

test('مسیر مرکز پایش به صفحه واقعی متصل است و موتور یگانه کیفیت داده را مصرف می‌کند', () => {
  const app = read('src/App.tsx');
  const page = read('src/components/AuditWorkspace.tsx');
  assert.match(app, /path="\/audit"[\s\S]*?<AuditWorkspace state=\{state\} \/>/);
  assert.match(page, /auditErpDataQuality\(auditState\)/);
  assert.match(page, /result\.notEvaluated/);
  assert.match(page, /DETERMINISTIC/);
  assert.match(page, /HEURISTIC|نیازمند بازبینی انسانی/);
  assert.match(page, /هیچ داده‌ای در ERP اصلاح یا حذف نمی‌شود/);
});

test('حوزه‌های فاقد قانون متصل، به‌عنوان ارزیابی‌نشده معرفی می‌شوند نه سالم یا صفر', () => {
  const page = read('src/components/AuditWorkspace.tsx');
  assert.match(page, /قوانین این حوزه هنوز به داده واقعی متصل نشده‌اند/);
  assert.match(page, /نبود یافته به معنی نبود مغایرت نیست/);
  assert.match(page, /work: \{[\s\S]*?domains: \[\]/);
});
