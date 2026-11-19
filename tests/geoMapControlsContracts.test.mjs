import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../src/components/GeoZoneMapEditor.tsx', import.meta.url), 'utf8');

test('map has go-to-my-location with permission/unsupported handling', () => {
  assert.ok(src.includes('navigator.geolocation.getCurrentPosition'));
  assert.ok(src.includes('رفتن به موقعیت من'));
  assert.ok(src.includes("locState==='denied'") && src.includes("'unsupported'"));
});

test('map has fullscreen toggle with Escape exit and token z-index', () => {
  assert.ok(src.includes('setFullscreen'));
  assert.ok(src.includes("e.key==='Escape'"));
  assert.ok(src.includes('z-(--z-modal)'));
});

test('technical tile template is inside advanced details with plain explanation; tile test kept', () => {
  assert.equal((src.match(/<details/g) || []).length, 1);
  assert.equal((src.match(/<\/details>/g) || []).length, 1);
  assert.ok(src.includes('تنظیمات پیشرفتهٔ منبع نقشه'));
  assert.ok(src.includes('آزمون کاشی'));
});
