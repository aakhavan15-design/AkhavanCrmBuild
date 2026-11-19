import fs from 'node:fs';
import assert from 'node:assert/strict';
const source = fs.readFileSync(new URL('../src/components/GroupsWorkspace.tsx', import.meta.url), 'utf8');
for (const token of ['toggleReaction', 'reactions', 'archivedBy', 'mutedBy', 'ARCHIVED', 'BellOff', 'Archive']) assert.ok(source.includes(token), `missing chat capability: ${token}`);
assert.ok(source.includes('(r.userIds || []).includes(me)'), 'reactions must be user-scoped');
assert.match(source, /g\.memberIds\.includes\(me\)/, 'conversation visibility must remain membership-scoped');
console.log('chatPersonalizationContracts.test.mjs: PASS (9 assertions)');
