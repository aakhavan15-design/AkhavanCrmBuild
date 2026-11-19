import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const layout = read('../src/components/Layout.tsx');
const app = read('../src/App.tsx');
const css = read('../src/index.css');
const modal = read('../src/components/ui/Modal.tsx');
const input = read('../src/components/ui/Input.tsx');
const button = read('../src/components/ui/Button.tsx');
const card = read('../src/components/ui/Card.tsx');
const toolbar = read('../src/components/ui/PageToolbar.tsx');
const searchable = read('../src/components/ui/SearchableSelect.tsx');

assert.match(layout, /className="crm-workspace" data-ui-density="compact"/,
  'every authenticated routed page must inherit the unified compact design layer');
assert.match(app, /className=\"crm-workspace\" data-ui-density=\"compact\"[\s\S]*LoginWorkspace/ ,
  'login and public application routes must also inherit the unified design layer');
assert.match(css, /\.crm-workspace[\s\S]*@media \(max-width: 767px\)/,
  'workspace design layer must include mobile-first responsive rules');
assert.match(css, /env\(safe-area-inset-bottom/,
  'mobile layout must respect device safe areas');
assert.match(css, /prefers-reduced-motion: reduce/,
  'animations must honor reduced-motion preferences');
assert.match(readFileSync(new URL('../src/theme/colors.css', import.meta.url), 'utf8'), /--font-size-input: 16px;/, 'input token must stay 16px (iOS zoom)');
assert.match(css, /font-size: var\(--font-size-input\) !important/,
  'mobile text inputs must prevent iOS focus zoom');
assert.match(modal, /hasUnsavedChanges/ ,
  'modal and drawer must expose a controlled unsaved-change close guard');
assert.match(modal, /--app-viewport-height/,
  'modal max-height must follow the visual viewport when the virtual keyboard opens');
assert.match(modal, /overflow-y-auto overscroll-contain/,
  'modal content must scroll independently');
assert.match(modal, /safe-area-inset-bottom/,
  'modal footer and content must reserve bottom safe area');
assert.match(input, /min-h-\(--size-input\)/,
  'shared input must use compact enterprise control height');
assert.match(button, /md: "h-10 min-h-10/,
  'shared primary button must use compact control size');
assert.match(card, /p-3\.5/,
  'shared cards must use reduced internal spacing');
assert.match(toolbar, /py-1/,
  'shared page toolbar must use compact vertical density');
assert.match(searchable, /min-h-\(--size-input\)/,
  'searchable select must use compact control height');

console.log('compactUiContracts.test.mjs: all assertions passed');
