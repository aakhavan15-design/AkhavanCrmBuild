import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAppStore, withoutPrivateSnapshot } from './lib/storage';
import { playNotificationSound } from './lib/sound';
import { bridgeInAppToSystem } from './lib/webPush';
import { useWorkflowEngine } from './hooks/useWorkflowEngine';
import { Layout } from './components/Layout';
import { HomeWorkspace } from './components/HomeWorkspace';
import { ModuleLandingWorkspace } from './components/ModuleLandingWorkspace';
import { PlannedModulePage } from './components/PlannedModulePage';
import { CommandPalette } from './components/CommandPalette';
import { OnboardingTour } from './components/OnboardingTour';
import { InteractiveTour } from './components/InteractiveTour';
import { LoginWorkspace } from './components/LoginWorkspace';
import { ApplyPage } from './components/onboarding/ApplyPage';
import { PersonnelFilePage } from './components/onboarding/PersonnelFilePage';
import { getTenantName } from './lib/orgPolicy';
import { computeMissing, getOnboardingConfig, type PersonnelFile } from './lib/onboarding';
import { SideDrawer } from './components/ui/Modal';
import { NotificationCenter, type AppNotification } from './components/shared/NotificationCenter';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LiveAnnouncer } from './components/ui/LiveAnnouncer';
import { RBACService } from './lib/rbac';
import { makeCanAccess } from './lib/navigation';
import { AuthService } from './services/AuthService';
import { stopStateSync } from './services/stateSyncRuntime';
import { dataSyncController } from './services/dataSyncController';
import { ThemeProvider } from './theme/ThemeProvider';
import { ToastProvider } from './components/ui/Toast';
import { LoadingState } from './components/ui/LoadingState';
import { track, AnalyticsEvents } from './lib/analytics';
import { requestDevicePermissions } from './lib/permissions';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { Button } from './components/ui/Button';
import type { NavigationTab } from './types';

// Route-level code splitting: heavy workspaces load on first visit (Home/Login/Landing stay eager)
const CommandCenterWorkspace = lazy(() => import('./components/CommandCenterWorkspace').then(m => ({ default: m.CommandCenterWorkspace })));
const DashboardWorkspace = lazy(() => import('./components/DashboardWorkspace').then(m => ({ default: m.DashboardWorkspace })));
const LeadsWorkspace = lazy(() => import('./components/LeadsWorkspace').then(m => ({ default: m.LeadsWorkspace })));
const CustomersWorkspace = lazy(() => import('./components/CustomersWorkspace').then(m => ({ default: m.CustomersWorkspace })));
const NegotiationsWorkspace = lazy(() => import('./components/NegotiationsWorkspace').then(m => ({ default: m.NegotiationsWorkspace })));
const QuotesWorkspace = lazy(() => import('./components/QuotesWorkspace').then(m => ({ default: m.QuotesWorkspace })));
const TasksWorkspace = lazy(() => import('./components/TasksWorkspace').then(m => ({ default: m.TasksWorkspace })));
const FinanceWorkspace = lazy(() => import('./components/FinanceWorkspace').then(m => ({ default: m.FinanceWorkspace })));
const OperationsControlWorkspace = lazy(() => import('./components/OperationsControlWorkspace').then(m => ({ default: m.OperationsControlWorkspace })));
const GeoIntelligenceWorkspace = lazy(() => import('./components/GeoIntelligenceWorkspace').then(m => ({ default: m.GeoIntelligenceWorkspace })));
const ReportsWorkspace = lazy(() => import('./components/ReportsWorkspace').then(m => ({ default: m.ReportsWorkspace })));
const SettingsWorkspace = lazy(() => import('./components/SettingsWorkspace').then(m => ({ default: m.SettingsWorkspace })));
const SyncCenterWorkspace = lazy(() => import('./components/SyncCenterWorkspace').then(m => ({ default: m.SyncCenterWorkspace })));
const AuditWorkspace = lazy(() => import('./components/AuditWorkspace').then(m => ({ default: m.AuditWorkspace })));
const ActivitiesWorkspace = lazy(() => import('./components/ActivitiesWorkspace').then(m => ({ default: m.ActivitiesWorkspace })));
const CasesWorkspace = lazy(() => import('./components/EnterpriseWorkspaces').then(m => ({ default: m.CasesWorkspace })));
const CampaignsWorkspace = lazy(() => import('./components/EnterpriseWorkspaces').then(m => ({ default: m.CampaignsWorkspace })));
const KnowledgeWorkspace = lazy(() => import('./components/EnterpriseWorkspaces').then(m => ({ default: m.KnowledgeWorkspace })));
const InternalAutomationWorkspace = lazy(() => import('./components/InternalAutomationWorkspace').then(m => ({ default: m.InternalAutomationWorkspace })));
const GroupsWorkspace = lazy(() => import('./components/GroupsWorkspace').then(m => ({ default: m.GroupsWorkspace })));
const CalendarWorkspace = lazy(() => import('./components/CalendarWorkspace').then(m => ({ default: m.CalendarWorkspace })));
const ProfileWorkspace = lazy(() => import('./workspaces/ProfileWorkspace').then(m => ({ default: m.ProfileWorkspace })));
const OnboardingAdminWorkspace = lazy(() => import('./components/onboarding/OnboardingAdminWorkspace').then(m => ({ default: m.OnboardingAdminWorkspace })));
const DesignSystemWorkspace = import.meta.env.DEV
  ? lazy(() => import('./components/DesignSystemWorkspace').then(module => ({ default: module.DesignSystemWorkspace })))
  : null;

function AppContent() {
  const { state, updateState, error } = useAppStore();
  const location = useLocation();
  const legacyMeetingParams = new URLSearchParams(location.search);
  const legacyMeetingsUrl = legacyMeetingParams.get('tab')?.toLowerCase() === 'meetings'
    ? `/calendar?${legacyMeetingParams}${location.hash}`
    : null;
  const navigate = useNavigate();

  // Funnel: page views (first two path segments only, so record ids never reach telemetry)
  useEffect(() => {
    track(AnalyticsEvents.PAGE_VIEW, { path: '/' + location.pathname.split('/').filter(Boolean).slice(0, 2).join('/') });
  }, [location.pathname]);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  // SQL-first: with the SQL provider active, every collection is hydrated from / persisted to SQL once the user is signed in.
  useEffect(() => {
    if (location.pathname !== '/login' && location.pathname !== '/apply' && AuthService.isAuthenticated()) {
      // یک مالک یگانه برای موتور همگام‌سازی: DataSyncController (initialize نسبت به تکرار امن است)
      dataSyncController.initialize().catch(err => console.error('[AKHAVAN][DATA_SYNC_INIT_FAILED]', err));
    }
  }, [location.pathname]);
  const [permissionsSynced, setPermissionsSynced] = useState(false);

  useWorkflowEngine(state, updateState);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (state?.settings?.locale) {
      document.documentElement.dir = state.settings.locale.rtl ? 'rtl' : 'ltr';
      document.documentElement.lang = state.settings.locale.language;
    }
  }, [state?.settings?.locale?.rtl, state?.settings?.locale?.language]);

  useEffect(() => {
    const root = document.documentElement;
    const scale = state?.settings?.uiScale || 'normal';
    root.style.fontSize = scale === 'large' ? '16px' : scale === 'extra-large' ? '17.5px' : '14px';
    root.dataset.performanceMode = state?.settings?.performanceMode || 'auto';
  }, [state?.settings?.uiScale, state?.settings?.performanceMode]);

  const visibleNotifications = useMemo(() => (state?.notifications || []).filter(n =>
    n.recipientId ? n.recipientId === state?.currentUserId
      : !n.taskReminder && !(n.linkTab === 'tasks' && /\|(D7|D2|D0|OVERDUE|ESCALATION)\|\d{4}-\d{2}-\d{2}/.test(n.dedupeKey ?? ''))
  ), [state?.notifications, state?.currentUserId]);

  useEffect(() => {
    if (!state?.currentUserId || !AuthService.isAuthenticated()) return;
    const storageKey = `notifCount:${state.currentUserId}`;
    const currentCount = visibleNotifications.length;
    const prevCount = parseInt(sessionStorage.getItem(storageKey) || '0', 10);
    
    if (prevCount > 0 && currentCount > prevCount) {
      if (state.settings?.privacy?.soundEnabled) playNotificationSound();
      // وقتی تب در پس‌زمینه است، اعلان سیستمی هم نشان بده
      const newest = [...visibleNotifications].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0];
      if (newest) bridgeInAppToSystem(newest);
    }
    sessionStorage.setItem(storageKey, currentCount.toString());
  }, [state?.currentUserId, state?.settings?.privacy?.soundEnabled, visibleNotifications]);

  useEffect(() => {
    // همگام‌سازی مجوزهای دستگاه؛ با تایم‌اوت تا در پیش‌نمایش/iframe هرگز روی «در حال بارگذاری» گیر نکند
    const withTimeout = <T,>(p: Promise<T>, ms = 1500) => Promise.race<T>([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('permission query timeout')), ms))]);
    const syncPerms = async () => {
      try {
        if (navigator.permissions && navigator.permissions.query) {
          const [geo, notif] = await Promise.allSettled([
            withTimeout(navigator.permissions.query({ name: 'geolocation' })),
            withTimeout(navigator.permissions.query({ name: 'notifications' }))
          ]);
          updateState(draft => {
            if (!draft.grantedDevicePermissions) draft.grantedDevicePermissions = { LOCATION: false, CAMERA: false, MICROPHONE: false, NOTIFICATIONS: false };
            if (geo.status === 'fulfilled') draft.grantedDevicePermissions.LOCATION = geo.value.state === 'granted';
            if (notif.status === 'fulfilled') draft.grantedDevicePermissions.NOTIFICATIONS = notif.value.state === 'granted';
          });
        }
      } catch (e) {
        console.warn('Permission query failed', e);
      } finally {
        setPermissionsSynced(true);
      }
    };
    syncPerms();
  }, [updateState]);

  const handleNotificationClick = (n: AppNotification, replace = false) => {
    if (n.recipientId && n.recipientId !== state?.currentUserId) return;
    updateState(draft => {
      const notif = draft.notifications?.find(x => x.id === n.id && (!x.recipientId || x.recipientId === draft.currentUserId));
      if (notif) notif.read = true;
    });
    setIsNotificationsOpen(false);

    if (n.linkTab) {
      const routeMap: Record<string, string> = {
        home: '/',
        accounts: '/accounts',
        tasks: /^taskreq-[0-9a-f-]{36}$/i.test(n.requestId ?? '') ? `/tasks?request=${encodeURIComponent(n.requestId!)}` : '/tasks',
        quotes: '/quotes',
        finance: '/finance',
        'churn-owner': '/reports?tab=sales&churn=owner',
        'churn-supervisor': '/reports?tab=sales&churn=supervisor',
        'churn-manager': '/reports?tab=sales&churn=manager',
        'finance-advance': n.entityId ? `/finance?tab=requests&advance=${encodeURIComponent(n.entityId)}` : '/finance?tab=requests',
        internal_automation: '/internal_automation',
        'personnel-file': n.entityId ? `/personnel-file?advance=${encodeURIComponent(n.entityId)}` : '/personnel-file',
        groups: n.conversationId ? `/groups?c=${encodeURIComponent(n.conversationId)}` : '/groups'
      };
      navigate(routeMap[n.linkTab] || `/${n.linkTab}`, { replace });
    }
  };

  if (error) return <div className="p-8 text-center text-danger font-bold bg-danger-soft h-screen flex items-center justify-center" dir="rtl">{error}</div>;
  if (!state || !permissionsSynced) return <div className="p-8 text-center text-text-secondary h-screen flex justify-center items-center bg-canvas" dir="rtl">در حال بارگذاری...</div>;
  // صفحه ورود قابل دسترسی است؛ تا اتصال ارائه‌دهنده واقعی، ورود موفق یا عبور امنیتی شبیه‌سازی نمی‌شود.
  // بعد از ورود موفق: پرونده ناقص → فرم تکمیل؛ کامل → داشبورد (ورود واقعی فقط با سرویس احراز هویت فعال می‌شود)
  const onboardingConfig = getOnboardingConfig(state);
  const afterLogin = (u: { id: string }) => {
    stopStateSync();
    updateState(withoutPrivateSnapshot);
    const file = (state.personnelFiles as PersonnelFile[] | undefined)?.find(item => item.userId === u.id);
    navigate(onboardingConfig.enabled && file?.status !== 'APPROVED' && computeMissing(file, onboardingConfig).length ? '/personnel-file' : '/');
  };
  if (location.pathname !== '/login' && location.pathname !== '/apply' && !AuthService.isAuthenticated()) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (location.pathname === '/login') return <div className="crm-workspace" data-ui-density="compact"><LoginWorkspace state={state} tenantName={getTenantName(state)} logoUrl={state.settings?.orgConfig?.logoUrl} applyEnabled={onboardingConfig.enabled} onAuthenticated={afterLogin} /></div>;
  if (location.pathname === '/apply') return <div className="crm-workspace" data-ui-density="compact"><ApplyPage state={state} /></div>;

  const currentUser = state.users?.find(u => u.id === state.currentUserId);
  const currentRole = state.roles?.find(r => r.id === currentUser?.roleId);
  const requiredDevicePerms = currentRole?.requiredDevicePermissions || [];
  // اجباری‌سازی دسترسی‌های دستگاه به‌صورت پیش‌فرض غیرفعال است (تنظیمات ← کاربران و نقش‌ها)؛ قابلیت حذف نشده
  const enforceDevicePerms = state.settings?.enforceDevicePermissions === true;
  const missingPerms = enforceDevicePerms ? requiredDevicePerms.filter(p => !state.grantedDevicePermissions?.[p]) : [];

  if (missingPerms.length > 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-text-main p-6 text-center" dir="rtl">
        <div className="bg-white p-8 rounded-3xl max-w-md w-full shadow-2xl space-y-5">
          <div className="w-16 h-16 bg-danger-soft text-danger rounded-full flex items-center justify-center mx-auto">
            <AlertTriangle size={32} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-text-main">دسترسی‌های الزامی مسدود است</h2>
            <p className="text-sm text-text-secondary mt-2 leading-relaxed">
              با توجه به نقش شما ({currentRole?.name})، اجرای وظایف نیازمند تایید دسترسی‌های زیر است:
            </p>
            <div className="flex flex-wrap gap-2 justify-center my-3">
              {missingPerms.map(p => (
                <span key={p} className="text-xs bg-red-50 text-red-700 px-3 py-1 rounded-xl font-bold border border-red-100">
                  {p === 'LOCATION' ? 'موقعیت مکانی' : p === 'NOTIFICATIONS' ? 'اعلان‌ها' : p === 'CAMERA' ? 'دوربین' : 'میکروفون'}
                </span>
              ))}
            </div>
          </div>
          <div className="space-y-2.5 w-full">
            <Button variant="primary" className="w-full" onClick={async () => { const res = await requestDevicePermissions(missingPerms); updateState(draft => { if (!draft.grantedDevicePermissions) { draft.grantedDevicePermissions = { LOCATION: false, CAMERA: false, MICROPHONE: false, NOTIFICATIONS: false }; } missingPerms.forEach(p => { draft.grantedDevicePermissions![p] = res[p] === true; }); }); }} >
              <ShieldCheck size={20} /> بررسی و تایید دسترسی‌ها
            </Button>
            <p className="text-xs leading-6 text-text-secondary" role="status">
              اگر دسترسی رد شده است، آن را از تنظیمات مرورگر یا سیستم‌عامل فعال کنید و سپس دوباره بررسی کنید. برنامه دسترسی ردشده را به‌صورت خودکار مجاز اعلام نمی‌کند.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const unreadNotificationsCount = visibleNotifications.filter(n => !n.read).length;
  const rbac = new RBACService(state);
  const guard = (tab: NavigationTab, element: React.ReactNode) => rbac.canAccessWorkspace(tab) ? element : <Navigate to="/" replace />;
  const guardAny = (allowed: boolean, element: React.ReactNode) => allowed ? element : <Navigate to="/" replace />;

  return (
    <>
      <LiveAnnouncer />
      <Layout
        onLogout={() => { track(AnalyticsEvents.LOGOUT); stopStateSync(); AuthService.clearSession(); updateState(withoutPrivateSnapshot); navigate('/login', { replace: true }); }}
        onOpenSearch={() => setIsSearchOpen(true)}
        onOpenNotifications={() => setIsNotificationsOpen(true)}
        notifications={visibleNotifications}
        onNotificationClick={handleNotificationClick}
        unreadNotificationsCount={unreadNotificationsCount}
        state={state}
        updateState={updateState}
      >
        <Suspense fallback={<LoadingState label="در حال بارگذاری صفحه" />}>
        <Routes>
          <Route path="/workspace/:moduleId" element={<ModuleLandingWorkspace state={state} />} />
          {DesignSystemWorkspace && <Route path="/design-system" element={guardAny(rbac.hasPermission('settings.manage'), <DesignSystemWorkspace />)} />}
          <Route path="/planned" element={<PlannedModulePage state={state} />} />
          <Route path="/" element={<HomeWorkspace state={state} />} />
          <Route path="/command" element={guardAny(rbac.hasPermission('accounts.view') || rbac.hasPermission('internal.view'), <CommandCenterWorkspace state={state} updateState={updateState} />)} />
          <Route path="/dashboard" element={guard('dashboard', <DashboardWorkspace state={state} />)} />
          <Route path="/leads" element={guard('leads', <LeadsWorkspace state={state} updateState={updateState} setActiveTab={(t: string) => navigate(`/${t}`)} />)} />
          <Route path="/accounts/*" element={guard('accounts', <CustomersWorkspace state={state} updateState={updateState} />)} />
          <Route path="/opportunities" element={guard('leads', <NegotiationsWorkspace state={state} updateState={updateState} />)} />
          <Route path="/quotes" element={guard('quotes', <QuotesWorkspace state={state} updateState={updateState} setActiveTab={(t: string) => navigate(`/${t}`)} />)} />
          <Route path="/activities" element={guard('activities', <ActivitiesWorkspace state={state} updateState={updateState} setActiveTab={(t: string) => navigate(`/${t}`)} />)} />
          <Route path="/tasks" element={guard('tasks', <TasksWorkspace state={state} updateState={updateState} />)} />
          <Route path="/finance" element={guard('finance', <FinanceWorkspace state={state} updateState={updateState} />)} />
          <Route path="/operations" element={guard('operations_control', <OperationsControlWorkspace state={state} updateState={updateState} />)} />
          <Route path="/geo-intelligence" element={guard('geo_intelligence', <GeoIntelligenceWorkspace state={state} updateState={updateState} />)} />
          <Route path="/cases" element={guard('cases', <CasesWorkspace state={state} updateState={updateState} setActiveTab={(t: string) => navigate(`/${t}`)} />)} />
          <Route path="/marketing" element={guard('marketing', <CampaignsWorkspace state={state} updateState={updateState} setActiveTab={(t: string) => navigate(`/${t}`)} />)} />
          <Route path="/knowledge" element={guard('knowledge', <KnowledgeWorkspace state={state} updateState={updateState} setActiveTab={(t: string) => navigate(`/${t}`)} />)} />
          <Route path="/internal_automation" element={legacyMeetingsUrl
            ? <Navigate to={legacyMeetingsUrl} replace />
            : guard('internal_automation', <InternalAutomationWorkspace state={state} updateState={updateState} setActiveTab={(t: string) => navigate(`/${t}`)} />)} />
          <Route path="/groups" element={guardAny(rbac.hasPermission('accounts.view') || rbac.hasPermission('internal.view') || rbac.hasPermission('internal.manage'), <GroupsWorkspace state={state} updateState={updateState} />)} />
          <Route path="/calendar" element={guard('calendar', <CalendarWorkspace state={state} updateState={updateState} />)} />
          <Route path="/reports" element={guard('reports', <ReportsWorkspace state={state} updateState={updateState} setActiveTab={(t: string) => navigate(`/${t}`)} />)} />
          <Route path="/settings" element={guard('settings', <SettingsWorkspace state={state} updateState={updateState} />)} />
          <Route path="/sync-center" element={guard('settings', <SyncCenterWorkspace state={state} />)} />
          <Route path="/audit" element={guardAny(makeCanAccess(rbac)('audit'), <AuditWorkspace state={state} />)} />
          <Route path="/onboarding" element={guard('onboarding', <OnboardingAdminWorkspace state={state} updateState={updateState} />)} />
          <Route path="/personnel-file" element={<PersonnelFilePage state={state} updateState={updateState} />} />
          <Route path="/profile" element={<ProfileWorkspace state={state} updateState={updateState} setActiveTab={(t: string) => navigate(`/${t}`)} />} />
          <Route path="/customers/*" element={<Navigate to={`/accounts${location.pathname.slice(10)}${location.search}${location.hash}`} replace />} />
          <Route path="/operations_control" element={<Navigate to={`/operations${location.search}${location.hash}`} replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </Layout>

      <CommandPalette isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} state={state} updateState={updateState} />

      <SideDrawer isOpen={isNotificationsOpen} onClose={() => setIsNotificationsOpen(false)} title="مرکز اعلان‌ها" subtitle={`${unreadNotificationsCount} اعلان جدید`} width="md">
        <NotificationCenter
          notifications={visibleNotifications}
          onOpen={handleNotificationClick}
          onMarkRead={(id) => updateState(draft => { const x = draft.notifications?.find(k => k.id === id && (!k.recipientId || k.recipientId === draft.currentUserId)); if (x) x.read = true; })}
          onMarkAllRead={() => updateState(draft => { (draft.notifications || []).forEach((x: { read?: boolean; recipientId?: string }) => { if (!x.recipientId || x.recipientId === draft.currentUserId) x.read = true; }); })}
        />
      </SideDrawer>

      <InteractiveTour state={state} updateState={updateState} />
      <OnboardingTour state={state} updateState={updateState} setActiveTab={(t) => navigate(t === 'home' ? '/' : `/${t}`)} />
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <BrowserRouter>
          <AppContent />
          <ToastProvider />
        </BrowserRouter>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
