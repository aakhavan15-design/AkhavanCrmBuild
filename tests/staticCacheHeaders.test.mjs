import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const server = readFileSync(new URL('../server/index.mjs', import.meta.url), 'utf8');
test('production static assets are immutable while SPA HTML revalidates', () => {
  assert.match(server, /maxAge: process\.env\.NODE_ENV === 'production' \? '1y' : 0/);
  assert.match(server, /immutable: process\.env\.NODE_ENV === 'production'/);
  assert.match(server, /public, max-age=31536000, immutable/);
  assert.match(server, /no-cache, must-revalidate/);
  assert.match(server, /etag: true/);
});
