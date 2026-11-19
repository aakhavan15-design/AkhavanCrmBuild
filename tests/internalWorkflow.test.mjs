import assert from 'node:assert/strict';
import { getMeetingConflict } from '../src/lib/internalWorkflow.ts';

const existing = [{ id: 'm1', title: 'جلسه فروش', date: '2026-11-10', startTime: '10:00', endTime: '11:00', organizerId: 'u1', participantIds: ['u2'] }];
assert.equal(getMeetingConflict(existing, { date: '2026-11-10', startTime: '11:00', endTime: '11:30', organizerId: 'u1', participantIds: [] }), null, 'adjacent meetings do not overlap');
assert.match(getMeetingConflict(existing, { date: '2026-11-10', startTime: '10:30', endTime: '11:30', organizerId: 'u3', participantIds: ['u2'] }) || '', /تداخل/);
assert.equal(getMeetingConflict(existing, { date: '2026-11-10', startTime: '10:30', endTime: '11:30', organizerId: 'u3', participantIds: ['u4'] }), null, 'unrelated attendees may meet concurrently');
assert.match(getMeetingConflict(existing, { date: '2026-11-10', startTime: '12:00', endTime: '11:00', organizerId: 'u1' }) || '', /پایان/);
assert.match(getMeetingConflict(existing, { date: '2026-11-10', startTime: '9:70', endTime: '11:00', organizerId: 'u1' }) || '', /قالب ساعت/);
assert.match(getMeetingConflict(existing, { date: 'bad-date', startTime: '09:00', endTime: '10:00', organizerId: 'u1' }) || '', /تاریخ/);
console.log('internalWorkflow: PASS (6 assertions)');
