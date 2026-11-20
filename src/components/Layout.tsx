import React, { useState, useMemo, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, PanelLeftClose, PanelLeft, Menu, Plus, MessageCircle, MessageSquare, HelpCircle, X } from 'lucide-react';
import { Avatar } from './ui/Avatar';
import { AppState } from '../types';
import { NavigationDrawer } from './NavigationDrawer';
import { DesktopSidebar } from './DesktopSidebar';
import { BottomNav } from './BottomNav';
import { GlobalFloatingIntakeDrawer } from './shared/GlobalFloatingIntakeDrawer';
import { triggerTourMenu } from './InteractiveTour';
import { RBACService } from '../lib/rbac';
import { makeCanAccess, findActiveNav } from '../lib/navigation';
import { resolveHeaderQuickAction } from '../lib/headerQuickActions';
import { AtmosphereLayer } from './AtmosphereLayer';
import { OfflineBanner } from './shared/OfflineBanner';
import { useSmartIslandHeader } from '../hooks/useSmartIslandHeader';
import { resolveDensity, applyDensityToDocument } from '../lib/uiDensity';
import { motion, useReducedMotion } from 'motion/react';
import { SyncProgressIndicator } from './header/SyncProgressIndicator';
import { cn } from '../lib/utils';

interface LayoutProps {
  children: React.ReactNode;
  onOpenSearch?: () => void;
  unreadNotificationsCount?: number;
  onOpenNotifications?: () => void;
  /** Visible notifications of the current user (newest last); used by the minimal header drop-down. */
  notifications?: Array<{ id: string; title?: string; message?: string; read?: boolean }>;
  onNotificationClick?: (notification: any) => void;
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
  const [panel, setPanel] = useState<'chat' | 'notifications' | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isCockpitMode, setIsCockpitMode] = useState(false);
  const [globalIntakeOpen, setGlobalIntakeOpen] = useState(false);
  const { compact: headerCompact, scrolled: headerScrolled } = useSmartIslandHeader();
  const density = resolveDensity(state?.settings);

  React.useEffect(() => {
    applyDensityToDocument(density);
  }, [density]);

  const recentChatContacts = useMemo(() => {
    const users = (state?.users || []) as Record<string, unknown>[];
    const currId = state?.currentUserId;
    return users
      .filter((u) => u.id !== currId && !u.deletedAt && u.isActive !== false)
      .slice(0, 4)
      .map((u) => ({
        id: u.id as string,
        name: (u.name || u.username || 'کاربر') as string,
        role: (state?.roles?.find((r: Record<string, unknown>) => r.id === u.roleId)?.name || 'همکار') as string,
        avatar: u.avatar as string | undefined,
      }));
  }, [state?.users, state?.currentUserId, state?.roles]);

  useEffect(() => {
    const handleCockpit = (e: CustomEvent<{ active?: boolean }>) => setIsCockpitMode(e.detail?.active ?? false);
    window.addEventListener('akhavan-cockpit', handleCockpit as EventListener);
    return () => window.removeEventListener('akhavan-cockpit', handleCockpit as EventListener);
  }, []);

  useEffect(() => {
    if (!panel) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPanel(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panel]);

  useEffect(() => {
    setPanel(null);
  }, [location.pathname]);

  useEffect(() => {
    document.body.classList.toggle('cockpit-mode-active', isCockpitMode);
    return () => {
      document.body.classList.remove('cockpit-mode-active');
    };
  }, [isCockpitMode]);

  useEffect(() => {
    const viewport = window.visualViewport;
    const updateViewport = () => {
      // A zoom gesture changes visualViewport too. Keep the layout stable while magnified.
      const unzoomedViewport = viewport && Math.abs(viewport.scale - 1) < 0.01 ? viewport : null;
      const height = unzoomedViewport?.height || window.innerHeight;
      const offsetTop = unzoomedViewport?.offsetTop || 0;
      document.documentElement.style.setProperty('--app-viewport-height', `${height}px`);
      document.documentElement.style.setProperty('--app-viewport-offset-top', `${offsetTop}px`);
    };
    updateViewport();
    viewport?.addEventListener('resize', updateViewport);
    viewport?.addEventListener('scroll', updateViewport);
    window.addEventListener('resize', updateViewport);
    return () => {
      viewport?.removeEventListener('resize', updateViewport);
      viewport?.removeEventListener('scroll', updateViewport);
      window.removeEventListener('resize', updateViewport);
      document.documentElement.style.removeProperty('--app-viewport-height');
      document.documentElement.style.removeProperty('--app-viewport-offset-top');
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
  const inChat = location.pathname.startsWith('/groups');

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
    return 'AKHAVAN CRM';
  }, [location.pathname, location.search, isDetailPage]);

  const todayDateStr = useMemo(
    () => new Intl.DateTimeFormat('fa-IR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()),
    []
  );

  const opsBadgeCount = useMemo(() => {
    return (state?.tasks || []).filter(
      (t: Record<string, unknown>) => t.status !== 'COMPLETED' && (t.priority === 'HIGH' || t.slaStatus === 'BREACHED')
    ).length;
  }, [state?.tasks]);

  const handleQuickAdd = () => {
    if (quickAction) {
      navigate(quickAction.path);
    }
  };

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
          {/* Floating island header: right = menu + create capsule, left = separate chat and notification islands */}
          <motion.header
            className="se-floating-header se-island-header sticky top-0 z-40 w-full shrink-0"
            data-compact={headerCompact ? 'true' : 'false'}
            data-scrolled={headerScrolled ? 'true' : 'false'}
            initial={useReducedMotion() ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={useReducedMotion() ? { duration: 0 } : { duration: 0.2, ease: 'easeOut' }}
          >
            <div className="se-island-row">
              {/* RTL right: double capsule — navigation + the single contextual create entry */}
              <div className="se-island se-island-capsule" role="group" aria-label="منو و ایجاد">
                <button
                  id="mb0"
                  type="button"
                  onClick={() => setNavDrawerOpen(true)}
                  className="se-header-icon md:hidden"
                  aria-label="باز کردن منو"
                  title="منو"
                >
                  <Menu size={19} />
                </button>
                <button
                  id="sb0"
                  type="button"
                  onClick={() => setSidebarCollapsed(value => !value)}
                  className="se-header-icon hidden md:grid"
                  aria-label="جمع یا باز کردن نوار کناری"
                  title="نوار کناری"
                >
                  {sidebarCollapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
                </button>
                {quickAction && (
                  <button
                    type="button"
                    onClick={handleQuickAdd}
                    className="se-header-icon se-header-create"
                    aria-label={quickAction.label}
                    title={quickAction.label}
                  >
                    <Plus size={20} strokeWidth={2.2} />
                  </button>
                )}
              </div>

              {/* Center: page title, fades out once the page scrolls */}
              <div className="se-island-title min-w-0 flex-1">
                <h1 id="ttl" className="se-header-title truncate">{activePageLabel}</h1>
                <div className="hidden sm:flex min-w-0 items-center justify-center gap-2">
                  <span className="truncate text-[11px] text-text-secondary">{todayDateStr} · {state?.settings?.companyName || 'گروه بازرگانی اخوان'}</span>
                  <SyncProgressIndicator />
                </div>
              </div>
              <button
                id="tour-help"
                type="button"
                onClick={() => triggerTourMenu()}
                className="se-header-icon se-island-help shrink-0"
                aria-label="راهنمای تعاملی و تور آموزشی"
                title="راهنما"
                tabIndex={headerScrolled ? -1 : 0}
              >
                <HelpCircle size={18} />
              </button>

              {/* Physical left: two separate floating islands */}
              <div className="se-header-actions flex shrink-0 items-center gap-2" dir="ltr">
                <button
                  type="button"
                  onClick={() => setPanel(value => (value === 'notifications' ? null : 'notifications'))}
                  className="se-island se-island-btn relative"
                  aria-label={`اعلان‌ها${unreadNotificationsCount ? `، ${unreadNotificationsCount} خوانده‌نشده` : ''}`}
                  aria-expanded={panel === 'notifications'}
                  title="اعلان‌ها"
                >
                  <Bell size={19} />
                  {unreadNotificationsCount > 0 && <span className="se-header-count">{unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}</span>}
                </button>
                <button
                  type="button"
                  onClick={() => setPanel(value => (value === 'chat' ? null : 'chat'))}
                  className="se-island se-island-btn relative"
                  aria-label="پیام‌ها و گفتگوها"
                  aria-expanded={panel === 'chat'}
                  title="گفتگوها"
                >
                  <MessageCircle size={19} />
                </button>
              </div>
            </div>

            {panel && (
              <>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-hidden="true"
                  className="fixed inset-0 z-0 cursor-default bg-transparent"
                  onClick={() => setPanel(null)}
                />
                <div className="se-island-panel" dir="rtl" role="dialog" aria-label={panel === 'chat' ? 'گفتگوها' : 'اعلان‌ها'}>
                  <div className="flex items-center justify-between pb-2 border-b border-border/70">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-text-main">
                      {panel === 'chat' ? <MessageSquare size={15} className="text-primary" /> : <Bell size={15} className="text-primary" />}
                      <span>{panel === 'chat' ? 'گفتگوها' : 'اعلان‌ها'}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPanel(null)}
                      className="grid h-7 w-7 place-items-center rounded-full text-text-muted hover:bg-canvas hover:text-text-main transition-colors cursor-pointer"
                      aria-label="بستن"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  <div className="py-2 space-y-1 max-h-60 overflow-y-auto no-scrollbar">
                    {panel === 'chat' && recentChatContacts.length === 0 && (
                      <p className="px-2 py-4 text-center text-[11px] text-text-secondary">همکاری برای گفتگو یافت نشد.</p>
                    )}
                    {panel === 'chat' && recentChatContacts.map((contact) => (
                      <button
                        type="button"
                        key={contact.id}
                        onClick={() => { setPanel(null); navigate('/groups'); }}
                        className="flex w-full items-center gap-2.5 p-1.5 rounded-xl hover:bg-canvas transition-colors cursor-pointer text-start"
                      >
                        <Avatar name={contact.name} src={contact.avatar} size="xs" />
                        <div className="min-w-0 flex-1">
                          <span className="block text-xs font-bold text-text-main truncate">{contact.name}</span>
                          <span className="block text-[10px] text-text-secondary truncate">{contact.role}</span>
                        </div>
                      </button>
                    ))}
                    {panel === 'notifications' && notifications.length === 0 && (
                      <p className="px-2 py-4 text-center text-[11px] text-text-secondary">اعلانی وجود ندارد.</p>
                    )}
                    {panel === 'notifications' && notifications.slice(-4).reverse().map((n) => (
                      <button
                        type="button"
                        key={n.id}
                        onClick={() => { setPanel(null); onNotificationClick?.(n); }}
                        className={cn('flex w-full items-start gap-2 p-2 rounded-xl hover:bg-canvas transition-colors cursor-pointer text-start', n.read && 'opacity-70')}
                      >
                        {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="خوانده‌نشده" />}
                        <div className="min-w-0 flex-1">
                          <span className="block text-xs font-bold text-text-main truncate">{n.title}</span>
                          {n.message && <span className="block text-[10px] text-text-secondary truncate">{n.message}</span>}
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="pt-2 border-t border-border/70">
                    <button
                      type="button"
                      onClick={() => {
                        const target = panel;
                        setPanel(null);
                        if (target === 'chat') navigate('/groups');
                        else onOpenNotifications?.();
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-primary text-on-primary text-xs font-bold shadow-xs hover:bg-primary-hover transition-colors cursor-pointer"
                    >
                      {panel === 'chat' ? 'ورود به صفحه چت' : 'ورود به صفحه اعلان‌ها'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </motion.header>

          {/* Local-First Offline Sync status */}
          <OfflineBanner />

          {/* Main Scroll Container with Reserved Paddings */}
          <main
            id="main-scroll-container"
            data-route={location.pathname.split('/').filter(Boolean)[0] || 'home'}
            data-chat={inChat ? 'true' : 'false'}
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
      {!inChat && (
        <BottomNav
          opsBadgeCount={opsBadgeCount}
          canAccess={canAccess}
          onOpenMenu={() => setNavDrawerOpen(true)}
          className="md:hidden"
        />
      )}

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
