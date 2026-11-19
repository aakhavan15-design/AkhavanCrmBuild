// نمای سازگار روی DataSyncController. دقیقاً یک StateSyncEngine در برنامه وجود دارد و مالک آن
// `dataSyncController` است؛ این ماژول موتور موازی نمی‌سازد (F0-04).
import { getActiveDataProvider } from './dataProvider';
import { dataSyncController } from './dataSyncController';
import type { StateSyncEngine, SyncStatus } from './stateSync';

export function isSqlProviderActive(): boolean { return getActiveDataProvider().name === 'SQLSERVER_BACKEND'; }

export function getStateSyncEngine(): StateSyncEngine | null { return dataSyncController.getEngine(); }

export async function ensureStateSyncStarted(): Promise<StateSyncEngine | null> {
  if (!isSqlProviderActive()) return null;
  await dataSyncController.initialize();
  return dataSyncController.getEngine();
}

export function stopStateSync(): void { dataSyncController.stop(); }

export type { SyncStatus };
