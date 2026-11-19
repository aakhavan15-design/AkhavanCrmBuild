import { create } from 'zustand';
import { persist, type StateStorage, createJSONStorage } from 'zustand/middleware';
import type { AppState } from '../types';
import { idbGet, idbSet, idbDel } from './idb';
import { generateSeedData } from './seed';
import { DEFAULT_COA_MIRROR, DEFAULT_REPORT_BUCKETS, DEFAULT_ACCOUNT_MAP_RULES } from './accountingMapping';
import { createAppStorePort, type DataPort } from './dataPorts';
import { getOfflineQueue, retryFailedOfflineOperations } from './offline';

const STORAGE_VERSION = 19;
const INCLUDE_DEMO_SEED = import.meta.env?.VITE_ENABLE_DEMO_DATA !== 'false';
const STORAGE_NAME = 'akhavan_app_state';
const SYNC_CHANNEL_NAME = 'akhavan_state_sync_channel';

const MAX_LOG_RECORDS = 1000;
const MAX_NOTIFICATIONS = 200;

const idbStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    const value = await idbGet<string>(name);
    return typeof value === 'string' ? value : null;
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await idbSet(name, value);
  },
  removeItem: async (name: string): Promise<void> => {
    await idbDel(name);
  },
};

interface AppStore {
  state: AppState;
  updateState: (updater: (draft: AppState) => void | Partial<AppState>) => void;
  error: string | null;
  getDataPort: () => Promise<DataPort>;
  getPendingOfflineMutations: () => Promise<Array<any>>;
  flushOfflineQueue: () => Promise<void>;
}

const cloneState = (state: AppState): AppState => {
  if (typeof structuredClone === 'function') return structuredClone(state);
  return JSON.parse(JSON.stringify(state)) as AppState;
};

const mergeCollectionIfSmall = <T extends { id?: string }>(existing: T[] | undefined, baseList: T[] | undefined, minThreshold = 10): T[] => {
  const safeExisting = Array.isArray(existing) ? existing : [];
  const safeBase = Array.isArray(baseList) ? baseList : [];
  if (safeExisting.length < minThreshold && safeBase.length >= minThreshold) {
    const existingIds = new Set(safeExisting.map(x => x?.id).filter(Boolean));
    const missing = safeBase.filter(x => x?.id && !existingIds.has(x.id));
    return [...safeExisting, ...missing];
  }
  return safeExisting.length > 0 ? safeExisting : safeBase;
};

const ensureStateIntegrity = (state: AppState): AppState => {
  const base = generateSeedData({ includeDemo: INCLUDE_DEMO_SEED });
  
  const safeAuditLogs = Array.isArray(state?.auditLogs) ? state.auditLogs.slice(-MAX_LOG_RECORDS) : [];
  const safeNotifications = Array.isArray(state?.notifications) ? state.notifications.slice(-MAX_NOTIFICATIONS) : [];
  const safeBusinessEvents = Array.isArray(state?.businessEvents) ? state.businessEvents.slice(-MAX_LOG_RECORDS) : [];

  // Remove only known placeholder gateway credentials from earlier demo seeds. Never expose them as live integrations.
  const placeholderTokens = new Set(['bot_eitaa_akhavan_9921', 'rubika_auth_882194', 'bot_bale_crm_34807', 'kav_api_771829', 'wh_secret_8912']);
  const safeMessagingChannels = (Array.isArray(state?.messagingChannels) ? state.messagingChannels : (base.messagingChannels || [])).map((channel: Record<string, unknown>) => {
    const isPlaceholder = placeholderTokens.has(channel?.botToken || '');
    if (isPlaceholder) {
      return { ...channel, active: false, status: 'NOT_CONFIGURED', botToken: '', webhookUrl: '', autoReply: false, lastPing: undefined, latencyMs: undefined };
    }
    // This client has no verified provider connection service; a local flag alone cannot prove connectivity.
    if (channel?.status === 'CONNECTED') return { ...channel, status: 'CONFIGURING' };
    return channel;
  });
  const safeMessagingLogs = (Array.isArray(state?.messagingLogs) ? state.messagingLogs : []).filter((log: Record<string, unknown>) => !['msg-1', 'msg-2', 'msg-3'].includes(log?.id));
  const safeAgentLogs = (Array.isArray(state?.agentLogs) ? state.agentLogs : []).filter((log: Record<string, unknown>) => !['alog-1', 'alog-2'].includes(log?.id));

  return {
    ...base,
    ...state,
    accounts: mergeCollectionIfSmall(state?.accounts, base?.accounts, 10),
    customers: mergeCollectionIfSmall(state?.customers, base?.customers, 10),
    quotes: mergeCollectionIfSmall(state?.quotes, base?.quotes, 10),
    invoices: mergeCollectionIfSmall(state?.invoices, base?.invoices, 10),
    payments: mergeCollectionIfSmall(state?.payments, base?.payments, 10),
    cheques: mergeCollectionIfSmall(state?.cheques, base?.cheques, 10),
    tasks: mergeCollectionIfSmall(state?.tasks, base?.tasks, 10),
    opportunities: mergeCollectionIfSmall(state?.opportunities, base?.opportunities, 5),
    schemaVersion: typeof state?.schemaVersion === 'number' ? state.schemaVersion : STORAGE_VERSION,
    auditLogs: safeAuditLogs,
    notifications: safeNotifications,
    businessEvents: safeBusinessEvents,
    paymentAllocations: Array.isArray(state?.paymentAllocations) ? state.paymentAllocations : [],
    geoZones: Array.isArray(state?.geoZones) && state.geoZones.length > 0 ? state.geoZones : (base as Record<string, unknown>).geoZones || [],
    zoneGeometryVersions: Array.isArray(state?.zoneGeometryVersions) && state.zoneGeometryVersions.length > 0 ? state.zoneGeometryVersions : (base as Record<string, unknown>).zoneGeometryVersions || [],
    zoneAssignments: Array.isArray(state?.zoneAssignments) && state.zoneAssignments.length > 0 ? state.zoneAssignments : (base as Record<string, unknown>).zoneAssignments || [],
    geoMetricDefinitions: Array.isArray(state?.geoMetricDefinitions) ? state.geoMetricDefinitions : [],
    zoneMetricSnapshots: Array.isArray(state?.zoneMetricSnapshots) ? state.zoneMetricSnapshots : [],
    suppliers: Array.isArray(state?.suppliers) ? state.suppliers : (base as Record<string, unknown>).suppliers || [],
    purchaseRequests: Array.isArray(state?.purchaseRequests) ? state.purchaseRequests : (base as Record<string, unknown>).purchaseRequests || [],
    salesOrders: Array.isArray(state?.salesOrders) ? state.salesOrders : (base as Record<string, unknown>).salesOrders || [],
    dispatchPlans: Array.isArray(state?.dispatchPlans) ? state.dispatchPlans : (base as Record<string, unknown>).dispatchPlans || [],
    salesReturns: Array.isArray(state?.salesReturns) ? state.salesReturns : (base as Record<string, unknown>).salesReturns || [],
    commercialPolicies: Array.isArray(state?.commercialPolicies) ? state.commercialPolicies : (base as Record<string, unknown>).commercialPolicies || [],
    reconciliationCases: Array.isArray(state?.reconciliationCases) ? state.reconciliationCases : (base as Record<string, unknown>).reconciliationCases || [],
    seedMetadata: state?.seedMetadata || (base as Record<string, unknown>).seedMetadata,
    articles: Array.isArray(state?.articles) && state.articles.length > 0 ? state.articles : (base as Record<string, unknown>).articles || [],
    cases: Array.isArray(state?.cases) && state.cases.length > 0 ? state.cases : (base as Record<string, unknown>).cases || [],
    campaigns: Array.isArray(state?.campaigns) && state.campaigns.length > 0 ? state.campaigns : (base as Record<string, unknown>).campaigns || [],
    creditNotes: Array.isArray(state?.creditNotes) && state.creditNotes.length > 0 ? state.creditNotes : (base as Record<string, unknown>).creditNotes || [],
    financeRequests: Array.isArray(state?.financeRequests) && state.financeRequests.length > 0 ? state.financeRequests : (base as Record<string, unknown>).financeRequests || [],
    coaMirror: Array.isArray(state?.coaMirror) && state.coaMirror.length > 0 ? state.coaMirror : DEFAULT_COA_MIRROR,
    reportBuckets: Array.isArray(state?.reportBuckets) && state.reportBuckets.length > 0 ? state.reportBuckets : DEFAULT_REPORT_BUCKETS,
    accountMapRules: Array.isArray(state?.accountMapRules) && state.accountMapRules.length > 0 ? state.accountMapRules : DEFAULT_ACCOUNT_MAP_RULES,
    bankMaps: Array.isArray(state?.bankMaps) ? state.bankMaps : [],
    cashboxMaps: Array.isArray(state?.cashboxMaps) ? state.cashboxMaps : [],
    outbox: Array.isArray(state?.outbox) ? state.outbox : [],
    onboardingApplications: Array.isArray(state?.onboardingApplications) && state.onboardingApplications.length > 0 ? state.onboardingApplications : (base as Record<string, unknown>).onboardingApplications || [],
    personnelFiles: Array.isArray(state?.personnelFiles) && state.personnelFiles.length > 0 ? state.personnelFiles : (base as Record<string, unknown>).personnelFiles || [],
    salaryProfiles: Array.isArray(state?.salaryProfiles) && state.salaryProfiles.length > 0 ? state.salaryProfiles : (base as Record<string, unknown>).salaryProfiles || [],
    advanceRequests: Array.isArray(state?.advanceRequests) ? state.advanceRequests : (base as Record<string, unknown>).advanceRequests || [],
    salesTargets: Array.isArray(state?.salesTargets) ? state.salesTargets : (base as Record<string, unknown>).salesTargets || [],
    commissionPlans: Array.isArray(state?.commissionPlans) ? state.commissionPlans : (base as Record<string, unknown>).commissionPlans || [],
    payrollRuns: Array.isArray(state?.payrollRuns) ? state.payrollRuns : [],
    payslips: Array.isArray(state?.payslips) ? state.payslips : [],
    internalRequests: Array.isArray(state?.internalRequests) && state.internalRequests.length > 0 ? state.internalRequests : (base as Record<string, unknown>).internalRequests || [],
    internalMeetings: Array.isArray(state?.internalMeetings) && state.internalMeetings.length > 0 ? state.internalMeetings : (base as Record<string, unknown>).internalMeetings || [],
    attachments: Array.isArray(state?.attachments) ? state.attachments : [],
    agents: Array.isArray(state?.agents) && state.agents.length > 0 ? state.agents : base.agents,
    agentLogs: safeAgentLogs,
    messagingChannels: safeMessagingChannels,
    messagingLogs: safeMessagingLogs,
    settings: {
      ...base.settings,
      ...(state?.settings || {}),
      locale: {
        ...(base.settings?.locale || {}),
        ...(state?.settings?.locale || {})
      }
    }
  };
};

const broadcastChannel = typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(SYNC_CHANNEL_NAME) : null;

export const useAppStore = create<AppStore>()(
  persist(
    (set) => {
      if (broadcastChannel) {
        broadcastChannel.onmessage = (event) => {
          if (event.data && event.data.type === 'STATE_UPDATED') {
            idbGet(STORAGE_NAME).then((persistedStr) => {
              if (persistedStr) {
                const parsed = JSON.parse(persistedStr);
                set({ state: ensureStateIntegrity(parsed.state), error: null });
              }
            }).catch((err) => {
              // داده‌ی خراب یا خطای IDB در همگام‌سازی بین تب‌ها نباید به Unhandled Rejection تبدیل شود؛ وضعیت فعلی حفظ می‌شود.
              console.error('[AKHAVAN][CROSS_TAB_SYNC_FAILED]', err);
            });
          }
        };
      }

      return {
        state: ensureStateIntegrity(generateSeedData({ includeDemo: INCLUDE_DEMO_SEED })),
        error: null as string | null,
        getDataPort: async () => createAppStorePort(),
        getPendingOfflineMutations: async () => getOfflineQueue(),
        flushOfflineQueue: async () => retryFailedOfflineOperations(),
        updateState: (updater: (draft: AppState) => void | Partial<AppState>) =>
          set((prev: AppStore) => {
            try {
              const newState = cloneState(prev.state);
              const result = updater(newState);
              const finalState = ensureStateIntegrity(result ? { ...newState, ...result } : newState);
              
              if (broadcastChannel) {
                broadcastChannel.postMessage({ type: 'STATE_UPDATED', timestamp: Date.now() });
              }

              return { state: finalState, error: null };
            } catch (err: any) {
              console.error('[AKHAVAN][STATE_UPDATE_FAILED]', err);
              return { ...prev, error: err?.message || 'خطا در بروزرسانی اطلاعات سامانه.' };
            }
          }),
      };
    },
    {
      name: STORAGE_NAME,
      storage: createJSONStorage(() => idbStorage),
      version: STORAGE_VERSION,
      // Migrate older persisted local states by filling newly introduced seed-backed collections without replacing user data.
      merge: (persistedState: unknown, currentState: AppStore): AppStore => {
        const persisted = (persistedState || {}) as Partial<AppStore>;
        const persistedAppState = (persisted as Record<string, unknown>).state as AppState | undefined;
        return { ...currentState, ...persisted, state: ensureStateIntegrity(persistedAppState || currentState.state) };
      },
    }
  )
);
