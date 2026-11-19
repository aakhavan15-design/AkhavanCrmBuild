import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/components/OperationsSupplementalTabs.tsx', import.meta.url), 'utf8');
assert.match(source, /can\('finance',\s*'VIEW'\)/, 'finance permission gating present');
assert.match(source, /canOn\('finance',\s*'VIEW'/, 'scoped canOn finance checks');
assert.match(source, /salesReturns/, 'returns collection present');
assert.match(source, /state\.invoices/, 'invoices collection present');
assert.match(source, /expenses/, 'expenses referenced');
console.log('operationsWorkspaceAccessContracts: PASS');
