import { useAppStore } from '../lib/storage';
import { getActiveDataProvider, type DataProvider } from './dataProvider';
import { StateSyncEngine, type StateSnapshot, type StateSyncResult } from './stateSync';
import registry from '../config/stateCollections.json' with { type: 'json' };

export type DataSyncState = 
  | 'idle'                    // آماده و همگام
  | 'syncing'                 // در حال همگام‌سازی دوطرفه
  | 'saving'                  // در حال ذخیره تغییرات محلی در پایگاه دادهٔ مرکزی
  | 'retrieving'              // در حال دریافت داده‌های معتبر از پایگاه دادهٔ مرکزی
  | 'completed'               // همگام‌سازی با موفقیت انجام شد
  | 'failed'                  // خطا در ارتباط با پایگاه دادهٔ مرکزی
  | 'retrying'                // تلاش مجدد با وقفه تصاعدی
  | 'offline';                // اتصال شبکه قطع / سرور در دسترس نیست

export interface DataSyncStatus {
  state: DataSyncState;
  stateLabel: string;
  pendingCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
  retryAttempt: number;
  serverVersion: number;
  rejectedCount: number;
  isSqlActive: boolean;
  activeCollection?: string;
}

export const DATA_SYNC_LABELS: Record<DataSyncState, string> = {
  idle: 'پایگاه‌داده همگام است',
  syncing: 'در حال همگام‌سازی...',
  saving: 'در حال ذخیره در پایگاه دادهٔ مرکزی...',
  retrieving: 'در حال دریافت اطلاعات از سرور...',
  completed: 'همگام‌سازی با موفقیت پایان یافت',
  failed: 'خطا در ارتباط با پایگاه دادهٔ مرکزی',
  retrying: 'در حال تلاش مجدد برای اتصال...',
  offline: 'عدم دسترسی به شبکه (آفلاین)'
};

/**
 * کنترلر متمرکز همگام‌سازی داده‌های سامانه با پایگاه داده SQL Server
 * (Centralized DataSyncController)
 */
export class DataSyncController {
  private static instance: DataSyncController | null = null;

  private state: DataSyncState = 'idle';
  private pendingCount = 0;
  private lastSyncedAt: string | null = null;
  private lastError: string | null = null;
  private retryAttempt = 0;
  private serverVersion = 0;
  private rejectedCount = 0;
  private activeCollection?: string;

  private engine: StateSyncEngine | null = null;
  private unsubscribeStore: (() => void) | null = null;
  private statusListeners = new Set<(status: DataSyncStatus) => void>();
  private completedTimer: ReturnType<typeof setTimeout> | null = null;
  private isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  private constructor() {
    this.setupNetworkListeners();
  }

  public static getInstance(): DataSyncController {
    if (!DataSyncController.instance) {
      DataSyncController.instance = new DataSyncController();
    }
    return DataSyncController.instance;
  }

  private setupNetworkListeners() {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', () => {
      this.isOnline = true;
      this.notifyStatus();
      void this.syncNow();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.setState('offline', 'اتصال شبکه قطع گردید.');
    });

    // بازگشت تمرکز به تب: ارسال تغییرات معلق و دریافت مجدد (فقط وقتی موتور فعال است)
    window.addEventListener('focus', () => {
      const engine = this.engine;
      if (!engine || !this.isOnline) return;
      void engine.flush().then(() => engine.hydrate()).catch(() => undefined);
    });
  }

  /** تنها نمونهٔ StateSyncEngine برنامه؛ مصرف‌کنندگان بیرونی (مثل DemoDataPanel) از همین‌جا می‌گیرند. */
  public getEngine(): StateSyncEngine | null {
    return this.engine;
  }

  public getStatus(): DataSyncStatus {
    const isSql = getActiveDataProvider().name === 'SQLSERVER_BACKEND';
    return {
      state: this.state,
      stateLabel: DATA_SYNC_LABELS[this.state] || 'وضعیت نامشخص',
      pendingCount: this.pendingCount,
      lastSyncedAt: this.lastSyncedAt,
      lastError: this.lastError,
      retryAttempt: this.retryAttempt,
      serverVersion: this.serverVersion,
      rejectedCount: this.rejectedCount,
      isSqlActive: isSql,
      activeCollection: this.activeCollection
    };
  }

  public subscribe(listener: (status: DataSyncStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.getStatus());
    return () => this.statusListeners.delete(listener);
  }

  private notifyStatus() {
    const current = this.getStatus();
    this.statusListeners.forEach(listener => {
      try {
        listener(current);
      } catch (e) {
        console.error('[DATASYNC CONTROLLER] Listener error', e);
      }
    });
  }

  private setState(nextState: DataSyncState, errorMsg?: string | null) {
    if (this.completedTimer) {
      clearTimeout(this.completedTimer);
      this.completedTimer = null;
    }

    this.state = nextState;
    if (errorMsg !== undefined) {
      this.lastError = errorMsg;
    }

    if (nextState === 'completed') {
      // وضعیت completed پس از ۲.۵ ثانیه به idle برمی‌گردد
      this.completedTimer = setTimeout(() => {
        if (this.state === 'completed') {
          this.state = 'idle';
          this.notifyStatus();
        }
      }, 2500);
    }

    this.notifyStatus();
  }

  /**
   * راه‌اندازی و اتصال موتور به استور مرکزی AppStore
   */
  public async initialize(): Promise<void> {
    const provider = getActiveDataProvider();
    if (provider.name !== 'SQLSERVER_BACKEND') {
      this.setState('idle');
      return;
    }

    if (this.engine) return;

    this.engine = new StateSyncEngine(
      useAppStore as unknown as any,
      provider as unknown as any,
      registry,
      { debounceMs: 600, maxBackoffMs: 30000 }
    );

    // گوش دادن به تغییرات وضعیت موتور سطح پایین
    this.engine.onStatus((engineStatus) => {
      this.pendingCount = engineStatus.pending;
      this.serverVersion = engineStatus.serverVersion;
      this.rejectedCount = engineStatus.rejected;
      if (engineStatus.lastSyncedAt) this.lastSyncedAt = engineStatus.lastSyncedAt;

      if (!this.isOnline) {
        this.setState('offline');
        return;
      }

      switch (engineStatus.phase) {
        case 'hydrating':
          this.setState('retrieving');
          break;
        case 'syncing':
          this.setState(engineStatus.pending > 0 ? 'saving' : 'syncing');
          break;
        case 'error':
          if (this.retryAttempt > 0) {
            this.setState('retrying', engineStatus.lastError);
          } else {
            this.setState('failed', engineStatus.lastError);
          }
          break;
        case 'pending':
          this.setState('saving');
          break;
        case 'idle':
          if (this.state === 'saving' || this.state === 'syncing' || this.state === 'retrieving') {
            this.setState('completed');
          } else if (this.state !== 'completed') {
            this.setState('idle');
          }
          break;
      }
    });

    try {
      this.setState('retrieving');
      await this.engine.start();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'خطا در بارگذاری اولیه داده‌های پایگاه دادهٔ مرکزی';
      this.setState('failed', msg);
    }
  }

  /**
   * اجرای آنی همگام‌سازی (Push local changes to SQL Server)
   */
  public async syncNow(): Promise<boolean> {
    if (!this.isOnline) {
      this.setState('offline', 'امکان همگام‌سازی در حالت آفلاین وجود ندارد.');
      return false;
    }

    const provider = getActiveDataProvider();
    if (provider.name !== 'SQLSERVER_BACKEND') return true;

    if (!this.engine) {
      await this.initialize();
    }

    try {
      this.setState('saving');
      await this.engine?.flush();
      this.retryAttempt = 0;
      this.setState('completed');
      return true;
    } catch (err: unknown) {
      this.retryAttempt++;
      const msg = err instanceof Error ? err.message : 'خطا در ارسال تغییرات به سرور';
      this.setState('failed', msg);
      return false;
    }
  }

  /**
   * دریافت مجدد داده‌های رسمی و به‌روز از پایگاه داده SQL Server (Pull authoritative records)
   */
  public async retrieveFromSqlServer(): Promise<boolean> {
    if (!this.isOnline) {
      this.setState('offline', 'امکان دریافت اطلاعات در حالت آفلاین وجود ندارد.');
      return false;
    }

    const provider = getActiveDataProvider();
    if (provider.name !== 'SQLSERVER_BACKEND') return true;

    try {
      this.setState('retrieving');
      if (!this.engine) {
        await this.initialize();
      } else {
        await this.engine.hydrate();
      }
      this.lastSyncedAt = new Date().toISOString();
      this.setState('completed');
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'خطا در بازیابی رکوردهای سرور';
      this.setState('failed', msg);
      return false;
    }
  }

  /**
   * تلاش مجدد برای برقراری ارتباط پس از بروز خطا
   */
  public async retry(): Promise<void> {
    this.retryAttempt++;
    this.setState('retrying');
    await new Promise(r => setTimeout(r, 600));
    await this.syncNow();
  }

  public stop(): void {
    this.engine?.stop();
    this.engine = null;
    this.unsubscribeStore?.();
    this.unsubscribeStore = null;
    this.setState('idle');
  }
}

/**
 * ایجاد و نمونه‌سازی کنترلر واحد
 */
export const dataSyncController = DataSyncController.getInstance();

import { useState, useEffect } from 'react';

/**
 * هوک ری‌اکت اختصاصی برای کامپوننت‌های رابط کاربری جهت دسترسی به وضعیت همگام‌سازی زنده
 */
export function useDataSyncStatus(): DataSyncStatus & {
  syncNow: () => Promise<boolean>;
  retrieveNow: () => Promise<boolean>;
  retry: () => Promise<void>;
} {
  const [status, setStatus] = useState<DataSyncStatus>(dataSyncController.getStatus());

  useEffect(() => {
    return dataSyncController.subscribe(next => setStatus(next));
  }, []);

  return {
    ...status,
    syncNow: () => dataSyncController.syncNow(),
    retrieveNow: () => dataSyncController.retrieveFromSqlServer(),
    retry: () => dataSyncController.retry()
  };
}
