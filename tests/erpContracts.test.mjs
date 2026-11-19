import assert from 'node:assert/strict';
import { isValidERPIdentity, isValidERPSourceTimestamp } from '../src/lib/erpContracts.ts';
assert.equal(isValidERPIdentity({ tenantId: 't1', sourceSystemCode: 'ERP-A', entityType: 'INVOICE', externalId: 'INV-1' }), true);
assert.equal(isValidERPIdentity({ tenantId: 't1', sourceSystemCode: 'ERP-A', entityType: 'INVOICE', externalId: ' ' }), false);
assert.equal(isValidERPSourceTimestamp('2026-11-05T10:00:00.000Z'), true);
assert.equal(isValidERPSourceTimestamp('not-a-date'), false);
assert.equal(isValidERPSourceTimestamp(undefined), true);
console.log('erpContracts.test.mjs: PASS (5 assertions)');
