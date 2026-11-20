import type { AppState, InternalMeeting } from '../types';

export interface MeetingConflictCandidate {
  id?: string;
  date: string;
  startTime: string;
  endTime: string;
  organizerId: string;
  participantIds?: string[];
}

function minutes(value: string): number | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''))) return null;
  const [hours, mins] = value.split(':').map(Number);
  return hours * 60 + mins;
}

/** Returns a validation/conflict message, or null when the proposed slot is valid. */
export function getMeetingConflict(
  meetings: readonly InternalMeeting[],
  candidate: MeetingConflictCandidate,
  excludeMeetingId?: string
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate.date)) return 'تاریخ جلسه معتبر نیست.';
  const date = new Date(`${candidate.date}T12:00:00`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== candidate.date) return 'تاریخ جلسه معتبر نیست.';
  const start = minutes(candidate.startTime);
  const end = minutes(candidate.endTime);
  if (start === null || end === null) return 'ساعت شروع و پایان باید در قالب ساعت معتبر وارد شود.';
  if (end <= start) return 'ساعت پایان باید بعد از ساعت شروع باشد.';
  const people = new Set([candidate.organizerId, ...(candidate.participantIds || [])].filter(Boolean));
  for (const meeting of meetings) {
    if (meeting.id === (excludeMeetingId || candidate.id) || meeting.date !== candidate.date) continue;
    const otherStart = minutes(meeting.startTime);
    const otherEnd = minutes(meeting.endTime);
    if (otherStart === null || otherEnd === null || otherEnd <= otherStart) continue;
    const overlaps = start < otherEnd && end > otherStart;
    if (!overlaps) continue;
    const otherPeople = new Set([meeting.organizerId, ...(meeting.participantIds || [])].filter(Boolean));
    const shared = [...people].filter(id => otherPeople.has(id));
    if (shared.length) return `با جلسه «${meeting.title}» در بازه ${meeting.startTime} تا ${meeting.endTime} برای ${shared.length} شرکت‌کننده تداخل دارد.`;
  }
  return null;
}

export function getVisibleMeetings(state: Pick<AppState, 'internalMeetings' | 'groups' | 'currentUserId'>): InternalMeeting[] {
  const userId = state.currentUserId;
  if (!userId) return [];
  const groupIds = new Set((state.groups || []).filter(group => group.memberIds.includes(userId)).map(group => group.id));
  return (state.internalMeetings || []).filter(meeting =>
    !meeting.deletedAt && (
      meeting.organizerId === userId ||
      meeting.participantIds?.includes(userId) ||
      meeting.groupIds?.some((groupId: string) => groupIds.has(groupId))
    )
  );
}
