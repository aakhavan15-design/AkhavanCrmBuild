import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const forms = read('src/components/shared/DynamicFormRenderer.tsx');
const finance = read('src/components/FinanceWorkspace.tsx');
const collections = read('src/components/finance/CollectionActionDialog.tsx');
const recruitment = read('src/components/onboarding/ApplyPage.tsx');
const purchasing = read('src/components/OperationsSupplementalTabs.tsx');

assert.match(forms, /submissionLock\.current \|\| submitting/);
assert.match(forms, /if \(await onSubmit\(formValues\) !== false\) clearDraft\(\)/);
assert.match(forms, /submissionError && <p role="alert"/);
assert.doesNotMatch(finance, /تعهد پرداخت با موفقیت ثبت شد/);
assert.match(finance, /<CollectionActionDialog/);
assert.match(collections, /await getActiveDataProvider\(\)\.submitCollectionAction/);
assert.match(collections, /هنوز دریافتی مالی ثبت نشده است/);
assert.match(recruitment, /const receipt = await getActiveDataProvider\(\)\.submitPublicApplication/);
assert.match(recruitment, /setDoneId\(receipt\.id\)/);
assert.doesNotMatch(recruitment, /submitApplication\(draft/);
assert.match(finance, /input\.amount\.toLocaleString\('fa-IR'\).*در صف همگام‌سازی/);

const section = purchasing.slice(purchasing.indexOf('export function PurchasingTab'), purchasing.indexOf('export function CreditTab'));
assert.match(section, /const testing = import\.meta\.env\.DEV/);
assert.match(section, /testing \|\| \(!isMarkedFixture\(request\)/);
assert.match(section, /if \(!testing \|\| !guard/);
assert.match(section, /testing && \([\s\S]*<form/);
