import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const forms = read('src/components/shared/DynamicFormRenderer.tsx');
const finance = read('src/components/FinanceWorkspace.tsx');
const purchasing = read('src/components/OperationsSupplementalTabs.tsx');

assert.match(forms, /submissionLock\.current \|\| submitting/);
assert.match(forms, /if \(await onSubmit\(formValues\) !== false\) clearDraft\(\)/);
assert.match(forms, /submissionError && <p role="alert"/);
assert.doesNotMatch(finance, /تعهد پرداخت با موفقیت ثبت شد/);
assert.match(finance, /ثبت تعهد پرداخت برای این مشتری در حال حاضر در دسترس نیست/);
assert.match(finance, /input\.amount\.toLocaleString\('fa-IR'\).*در صف همگام‌سازی/);

const section = purchasing.slice(purchasing.indexOf('export function PurchasingTab'), purchasing.indexOf('export function CreditTab'));
assert.match(section, /const testing = import\.meta\.env\.DEV/);
assert.match(section, /testing \|\| \(!isMarkedFixture\(request\)/);
assert.match(section, /if \(!testing \|\| !guard/);
assert.match(section, /testing && \([\s\S]*<form/);
