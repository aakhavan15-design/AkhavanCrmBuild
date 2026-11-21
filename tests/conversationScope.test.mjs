import assert from 'node:assert/strict';
import { canChangeConversation, canChangeConversationMessage, isConversationMember } from '../server/conversationScope.mjs';

const conversation = { id: 'group', kind: 'DIRECT', managerId: 'a', memberIds: ['a', 'b'] };
const message = { id: 'message', groupId: 'group', senderId: 'a', createdAt: '2026-11-21', content: 'نمونهٔ آزمون', readBy: ['a'] };

assert.equal(isConversationMember(conversation, 'outsider'), false);
assert.equal(canChangeConversation(conversation, { ...conversation, memberIds: ['a', 'b', 'outsider'] }, 'a', false), false);
assert.equal(canChangeConversation(conversation, { ...conversation, pinnedBy: ['b'] }, 'b', false), true);
assert.equal(canChangeConversation(conversation, { ...conversation, pinnedBy: ['a'] }, 'b', false), false);
assert.equal(canChangeConversation(undefined, { ...conversation, kind: 'TEAM' }, 'a', false), false);
assert.equal(canChangeConversation(undefined, { ...conversation, kind: 'TEAM' }, 'a', false, { create: true }), true);
assert.equal(canChangeConversation(undefined, conversation, 'a', false), true);
assert.equal(canChangeConversationMessage(conversation, undefined, message, 'b', false), false);
assert.equal(canChangeConversationMessage(conversation, undefined, message, 'a', false), true);
assert.equal(canChangeConversationMessage(conversation, message, { ...message, readBy: ['a', 'b'] }, 'b', false), true);
assert.equal(canChangeConversationMessage(conversation, message, { ...message, readBy: ['b'] }, 'b', false), false);
assert.equal(canChangeConversationMessage(conversation, message, { ...message, content: 'تغییر پیام دیگری' }, 'b', false), false);
assert.equal(canChangeConversationMessage(conversation, message, { ...message, groupId: 'other' }, 'a', false), false);
assert.equal(canChangeConversationMessage(conversation, message, { ...message, readBy: ['a', 'b'] }, 'outsider', false), false);
