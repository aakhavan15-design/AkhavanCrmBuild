import React, { useState, useMemo, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AppState } from '../types';
import { NavigationDrawer } from './NavigationDrawer';
import { DesktopSidebar } from './DesktopSidebar';
import { BottomNav } from './BottomNav';
import { GlobalFloatingIntakeDrawer } from './shared/GlobalFloatingIntakeDrawer';
import { RBACService } from '../lib/rbac';
import { makeCanAccess, findActiveNav } from '../lib/navigation';
import { resolveHeaderQuickAction } from '../lib/headerQuickActions';
import { AtmosphereLayer } from './AtmosphereLayer';
import { OfflineBanner } from './shared/OfflineBanner';
import { useSmartIslandHeader } from '../hooks/useSmartIslandHeader';
import { resolveDensity, applyDensityToDocument } from '../lib/uiDensity';
import { FloatingHeader } from './header/FloatingHeader';
import type { AppNotification } from './shared/NotificationCenter';
import { cn } from '../lib/utils';

interface LayoutProps {
  children: React.ReactNode;
  onOpenSearch?: () => void;
  unreadNotificationsCount?: number;
  onOpenNotifications?: () => void;
  /** Visible notifications of the current user (newest last); used by the minimal header drop-down. */
  notifications?: AppNotification[];
  onNotificationClick?: (notification: AppNotification, replace?: boolean) => void;
  /** Real logout handler of the app (clears session/token). Falls back to navigating to /login. */
  onLogout?: () => void;
  state?: AppState;
  updateState?: (updater: (draft: AppState) => AppState | void) => void;
}

export function Layout({
  children,
  onOpenSearch,
  unreadNotificationsCount = 0,
  onOpenNotifications,
  notifications = [],
  onNotificationClick,
  onLogout,
  state,
  updateState,
}: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const [navDrawerOpen, setNavDrawerOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isCockpitMode, setIsCockpitMode] = useState(false);
  const [globalIntakeOpen, setGlobalIntakeOpen] = useState(false);
  const { scrolled: headerScrolled } = useSmartIslandHeader();
  const density = resolveDensity(state?.settings);

  React.useEffect(() => {
    applyDensityToDocument(density);
  }, [density]);

  useEffect(() => {
    const handleCockpit = (e: CustomEvent<{ active?: boolean }>) => setIsCockpitMode(e.detail?.active ?? false);
    window.addEventListener('akhavan-cockpit', handleCockpit as EventListener);
    return () => window.removeEventListener('akhavan-cockpit', handleCockpit as EventListener);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('cockpit-mode-active', isCockpitMode);
    return () => {
      document.body.classList.remove('cockpit-mode-active');
    };
  }, [isCockpitMode]);

  useEffect(() => {
    const viewport = window.visualViewport;
    let frame = 0;
    const updateViewport = () => {
      // A zoom gesture changes visualViewport too. Keep the layout stable while magnified.
      const unzoomedViewport = viewport && Math.abs(viewport.scale - 1) < 0.01 ? viewport : null;
      const height = unzoomedViewport?.height || window.innerHeight;
      const offsetTop = unzoomedViewport?.offsetTop || 0;
      document.documentElement.style.setProperty('--app-viewport-height', `${height}px`);
      document.documentElement.style.setProperty('--app-viewport-offset-top', `${offsetTop}px`);
      document.documentElement.style.setProperty('--app-viewport-bottom-gap', `${Math.max(0, window.innerHeight - height - offsetTop)}px`);
    };
    const scheduleViewport = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateViewport);
    };
    updateViewport();
    viewport?.addEventListener('resize', scheduleViewport);
    viewport?.addEventListener('scroll', scheduleViewport);
    window.addEventListener('resize', scheduleViewport);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener('resize', scheduleViewport);
      viewport?.removeEventListener('scroll', scheduleViewport);
      window.removeEventListener('resize', scheduleViewport);
      document.documentElement.style.removeProperty('--app-viewport-height');
      document.documentElement.style.removeProperty('--app-viewport-offset-top');
      document.documentElement.style.removeProperty('--app-viewport-bottom-gap');
    };
  }, []);

  const currentUser = state?.users?.find((u: Record<string, unknown>) => u.id === state?.currentUserId);
  const currentRole = state?.roles?.find((r: Record<string, unknown>) => r.id === currentUser?.roleId);
  const rbac = useMemo(() => (state ? new RBACService(state) : null), [state]);
  const canAccess = useMemo(() => makeCanAccess(rbac), [rbac]);
  const quickAction = useMemo(
    () => resolveHeaderQuickAction(location.pathname, location.search, rbac),
    [location.pathname, location.search, rbac]
  );

  const isDetailPage = /^\/(customers|accounts|tasks|quotes|operations_control|finance)\/.+/.test(location.pathname);
  const inChat = location.pathname === '/groups';

  // Dynamic Title Resolution in clear Persian
  const activePageLabel = useMemo(() => {
    if (isDetailPage) return 'جزئیات رکورد';
    const p = location.pathname;
    if (p === '/') return 'داشبورد سازمانی';
    if (p.startsWith('/profile')) return 'پروفایل من';
    if (p.startsWith('/personnel-file')) return 'پرونده پرسنلی من';
    if (p.startsWith('/audit')) return 'پایش مغایرت و کیفیت داده';
    if (p.startsWith('/sync-center')) return 'مرکز داده و همگام‌سازی';
    if (p.startsWith('/planned')) return 'وضعیت بخش در دست تکمیل';
    if (p.startsWith('/reports')) return 'گزارش‌ها و تحلیل‌ها';
    const active = findActiveNav(p, location.search);
    if (active) return active.item.label;
    return 'سامانه اخوان';
  }, [location.pathname, location.search, isDetailPage]);

  const opsBadgeCount = useMemo(() => {
    return (state?.tasks || []).filter(
      (t: Record<string, unknown>) => t.status !== 'COMPLETED' && (t.priority === 'HIGH' || t.slaStatus === 'BREACHED')
    ).length;
  }, [state?.tasks]);

  if (inChat) return (
    <main id="main-scroll-container" className="crm-chat-viewport bg-canvas font-sans" data-route="groups" dir="rtl">
      <div id="tour-page" className="crm-workspace h-full" data-ui-density="compact">{children}</div>
    </main>
  );

  return (
    <div
      className="relative isolate h-[var(--app-viewport-height,100dvh)] w-full overflow-hidden bg-canvas font-sans"
      dir="rtl"
    >
      <AtmosphereLayer />

      <div className={cn('app-layout-wrapper relative z-10 flex h-full w-full overflow-hidden', navDrawerOpen && 'app-layout-scaled')}>
        {/* Standard Fixed Desktop Sidebar */}
        <DesktopSidebar
          user={currentUser}
          roleName={currentRole?.name}
          collapsed={sidebarCollapsed}
          canAccess={canAccess}
        />

        {/* Main Content Area */}
        <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          <FloatingHeader
            state={state}
            roleName={currentRole?.name}
            pageTitle={activePageLabel}
            quickAction={quickAction}
            scrolled={headerScrolled}
            navOpen={navDrawerOpen}
            canChat={canAccess('groups')}
            notifications={notifications}
            unreadNotificationsCount={unreadNotificationsCount}
            onOpenMenu={() => setNavDrawerOpen(true)}
            onToggleSidebar={() => setSidebarCollapsed(value => !value)}
            onOpenNotifications={onOpenNotifications}
            onNotificationClick={onNotificationClick}
          />

          {/* Local-First Offline Sync status */}
          <OfflineBanner />

          {/* Main Scroll Container with Reserved Paddings */}
          <main
            id="main-scroll-container"
            data-route={location.pathname.split('/').filter(Boolean)[0] || 'home'}
            className="w-full flex-1 overflow-y-auto main-content-scroll no-scrollbar"
          >
            <div className="se-island-clearance mx-auto min-h-full w-full max-w-7xl px-2.5 pb-4 sm:px-4">
              <div id="tour-page" className="crm-workspace" data-ui-density="compact">
                {children}
              </div>
            </div>
          </main>
        </div>
      </div>

      {/* Floating Bottom Nav (Mobile) */}
      <BottomNav
          opsBadgeCount={opsBadgeCount}
          canAccess={canAccess}
          onOpenMenu={() => setNavDrawerOpen(true)}
          className="md:hidden"
      />

      {/* Mobile Drawer */}
      <NavigationDrawer
        isOpen={navDrawerOpen}
        onClose={() => setNavDrawerOpen(false)}
        state={state}
        onLogout={onLogout}
        onOpenSearch={onOpenSearch}
      />

      {/* Global Intelligent Document Intake Drawer */}
      {state && (
        <GlobalFloatingIntakeDrawer
          isOpen={globalIntakeOpen}
          onClose={() => setGlobalIntakeOpen(false)}
          state={state}
          updateState={updateState}
          onApplyToForm={({ documentType, result, appliedValues }) => {
            const intakePrefill = { documentType, appliedValues, fileName: result.fileName };
            if (documentType === 'BANK_RECEIPT' || documentType === 'PAYMENT_RECEIPT' || documentType === 'CHEQUE') {
              navigate('/finance?tab=payments', { state: { intakePrefill } });
            } else if (documentType === 'INVOICE') {
              navigate('/finance?tab=invoices', { state: { intakePrefill } });
            } else if (documentType === 'EXPENSE') {
              navigate('/internal_automation');
            } else if (documentType === 'PERSONNEL_ID') {
              navigate('/personnel-file');
            }
          }}
        />
      )}
    </div>
  );
}
