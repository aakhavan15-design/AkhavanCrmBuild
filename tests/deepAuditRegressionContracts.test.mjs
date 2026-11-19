import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// Dashboard: every permission flag used in scopedState must be defined (previously ReferenceError at render)
const dash = read('src/components/DashboardWorkspace.tsx');
for (const id of ['canViewQuotes', 'canViewFinance', 'canViewCases']) assert.match(dash, new RegExp(`const ${id} = rbac\\.can\\(`), `${id} must be defined`);
assert.doesNotMatch(dash, /stuckTasks/, 'stuckTasks was never defined');
assert.match(dash, /centerValue=\{doneTasks\.length\}/);
assert.match(dash, /doneTasks\.length/);

// Campaign form must offer the segment the submit handler reads
const forms = read('src/services/dynamicFormEngine.ts');
assert.match(forms, /createCampaignFormSchema\(segmentOptions/);
assert.match(forms, /name: 'segmentId'/);

// Global validation switch and attachments are permission-checked
// تغییر الزامی‌بودن فیلدها فقط در تنظیمات و با مجوز ویرایش تنظیمات انجام می‌شود (نوار داخل فرم‌ها حذف شد).
assert.match(read('src/components/SettingsWorkspace.tsx'), /can\('settings','EDIT'\)\)return denied\('تغییر تنظیمات فرم‌ها'/);
assert.doesNotMatch(read('src/components/shared/DynamicFormRenderer.tsx'), /formFieldsMandatory = !formFieldsMandatory/);
const att = read('src/components/ui/AttachmentManager.tsx');
assert.match(att, /requireActiveUser\(state, updateState, 'بارگذاری پیوست'\)/);
assert.match(att, /requireActiveUser\(state, updateState, 'حذف پیوست'\)/);

// Obsolete sidebar (imported a non-existent export) stays removed
assert.ok(!fs.existsSync(new URL('../src/components/Sidebar.tsx', import.meta.url)));
console.log('deepAuditRegressionContracts: PASS');
