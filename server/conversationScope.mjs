import { isDeepStrictEqual } from 'node:util';

export const CHAT_COLLECTIONS = new Set(['groups', 'messages']);
const members = group => Array.isArray(group?.memberIds) ? group.memberIds : [];
export const isConversationMember = (group, userId) => Boolean(userId && members(group).includes(userId));

function sameOtherUsers(before = [], after = [], userId) {
  if (!Array.isArray(before) || !Array.isArray(after)) return false;
  return isDeepStrictEqual(before.filter(id => id !== userId).sort(), after.filter(id => id !== userId).sort());
}

function onlyChanged(before, after, fields) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].every(key =>
    fields.includes(key) || isDeepStrictEqual(before[key], after[key]));
}

export function canChangeConversation(previous, next, userId, deleting) {
  if (!previous) {
    return !deleting && next?.managerId === userId && isConversationMember(next, userId)
      && members(next).every(id => typeof id === 'string' && id.length > 0)
      && (next.kind !== 'DIRECT' || new Set(members(next)).size === 2);
  }
  if (!isConversationMember(previous, userId)) return false;
  const manager = previous.managerId === userId && previous.kind !== 'DIRECT';
  if (deleting) return manager;
  if (!next || next.managerId !== previous.managerId || next.kind !== previous.kind) return false;
  const personal = ['pinnedBy', 'mutedBy', 'archivedBy'];
  if (manager) return isConversationMember(next, userId) && members(next).every(id => typeof id === 'string' && id.length > 0)
    && personal.every(key => sameOtherUsers(previous[key], next[key], userId));
  return onlyChanged(previous, next, personal)
    && personal.every(key => sameOtherUsers(previous[key], next[key], userId));
}

function otherReactions(reactions = [], userId) {
  if (!Array.isArray(reactions)) return null;
  const pairs = [];
  for (const item of reactions) {
    if (typeof item?.emoji !== 'string' || !Array.isArray(item.userIds)) return null;
    for (const id of item.userIds) if (id !== userId) pairs.push(JSON.stringify([item.emoji, id]));
  }
  return pairs.sort();
}

export function canChangeConversationMessage(group, previous, next, userId, deleting) {
  if (!isConversationMember(group, userId) || group.active === false) return false;
  if (deleting) return previous?.senderId === userId || group.managerId === userId;
  if (!next || next.groupId !== group.id || (previous && (next.senderId !== previous.senderId || next.groupId !== previous.groupId))) return false;
  if (!sameOtherUsers(previous?.readBy, next.readBy, userId)) return false;
  const reactions = otherReactions(next.reactions, userId);
  if (!reactions || !isDeepStrictEqual(otherReactions(previous?.reactions, userId), reactions)) return false;
  if (!previous) return next.senderId === userId;
  const shared = ['readBy', 'reactions'];
  if (group.managerId === userId && !previous.deleted && next.deleted === true && next.deletedBy === userId
    && next.content === '' && !next.attachments && !next.relatedEntity && !next.mentions?.length) {
    shared.push('deleted', 'deletedAt', 'deletedBy', 'content', 'attachments', 'relatedEntity', 'mentions');
  }
  if (!previous.taskId && typeof next.taskId === 'string') shared.push('taskId');
  return previous.senderId === userId
    ? next.createdAt === previous.createdAt && (!previous.deleted || next.deleted === true)
    : onlyChanged(previous, next, shared);
}
