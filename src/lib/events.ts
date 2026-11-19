import { getPersianBusinessEventTitle } from './labels';
import { AppState } from '../types';
import { generateSecureId } from './secureId';

export function emitBusinessEvent(
  eventType: string,
  entityType: string,
  entityId: string,
  payload: unknown,
  state: AppState,
  updateState: (updater: (draft: AppState) => AppState | void) => void
): void {
  updateState(draft => {
    if (!draft.businessEvents) draft.businessEvents = [];
    draft.businessEvents.push({
      id: generateSecureId('ev'),
      type: eventType,
      title: getPersianBusinessEventTitle(entityType, eventType),
      timestamp: new Date().toISOString(),
      entityId,
      payload,
    });
  });
}
