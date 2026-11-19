import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Settings, LogOut, ChevronRight, ChevronDown, Search, Plus, Sun, Moon, Info, X,
  Inbox, CheckSquare, Banknote, Handshake, BookOpen, Sparkles,
} from 'lucide-react';
import { RBACService } from '../lib/rbac';
import { APP_VERSION_LABEL } from '../lib/version';
import { cn } from '../lib/utils';
import { NAV_SECTIONS, isNavActive, makeCanAccess } from '../lib/navigation';
import { Avatar } from './ui/Avatar';
import { useTheme } from '../theme/ThemeProvider';
import { triggerTourMenu, triggerWhatsNew } from './InteractiveTour';

interface NavigationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  state?: unknown;
  /** Real logout handler of the app. Falls back to navigating to /login. */
  onLogout?: () => void;
  onOpenSearch?: () => void;
}

/** Minimal dock button: thin icon over a tiny label. */
function DockButton({ icon: Icon, label, onClick }: { icon: React.ComponentType<{ size?: number; strokeWidth?: number }>; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="se-menu-dock-btn flex min-w-0 flex-col items-center justify-start gap-1.5 rounded-2xl px-1 py-2 text-text-secondary transition-colors hover:text-text-main cursor-pointer"
    >
      <Icon size={19} strokeWidth={1.5} />
      <span className="text-[9.5px] font-medium leading-tight text-center">{label}</span>
    </button>
  );
}

export function NavigationDrawer({ isOpen, onClose, state, onLogout, onOpenSearch }: NavigationDrawerProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggle: toggleTheme } = useTheme();

  const [navQuery, setNavQuery] = useState('');
  const [aboutOpen, setAboutOpen] = useState(false);
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({});
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    overview: true,
  });

  const currentUser = state?.users?.find((u: Record<string, unknown>) => u.id === state?.currentUserId);
  const currentRole = state?.roles?.find((r: Record<string, unknown>) => r.id === currentUser?.roleId);
  const rbac = useMemo(() => (state ? new RBACService(state) : null), [state]);
  const canAccess = useMemo(() => makeCanAccess(rbac), [rbac]);

  // Lock body scroll while open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Close with Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // Auto-open the section that contains the active page
  useEffect(() => {
    if (!isOpen) return;
    const active = NAV_SECTIONS.find((s) =>
      s.items.some(
        (i) =>
          isNavActive(i, location.pathname, location.search) ||
          (i.children || []).some((child) => isNavActive(child, location.pathname, location.search))
      )
    );
    if (active) setOpenSections((prev) => ({ ...prev, [active.id]: true }));
  }, [isOpen, location.pathname, location.search]);

  const normalizedQuery = navQuery.trim().toLocaleLowerCase('fa-IR').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک');
  const visibleSections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items
      .map((item) => ({
        ...item,
        children: (item.children || []).filter(
          (child) =>
            canAccess(child.perm) &&
            (!normalizedQuery ||
              `${child.label} ${item.label} ${section.title}`
                .toLocaleLowerCase('fa-IR')
                .replace(/[يى]/g, 'ی')
                .replace(/ك/g, 'ک')
                .includes(normalizedQuery))
        ),
      }))
      .filter(
        (item) =>
          canAccess(item.perm) &&
          (!normalizedQuery ||
            `${item.label} ${section.title}`
              .toLocaleLowerCase('fa-IR')
              .replace(/[يى]/g, 'ی')
              .replace(/ك/g, 'ک')
              .includes(normalizedQuery) ||
            (item.children || []).some((child) =>
              child.label.toLocaleLowerCase('fa-IR').includes(normalizedQuery)
            ))
      ),
  })).filter((section) => section.items.length > 0);

  const toggleSection = (key: string) => setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  const go = (path: string) => {
    navigate(path);
    onClose();
  };
  const handleLogout = () => {
    onClose();
    if (onLogout) onLogout();
    else navigate('/login');
  };

  if (!isOpen) return null;

  const settingsActive = location.pathname.startsWith('/settings');

  const directContacts = (state?.users || [])
    .filter((user: Record<string, unknown>) => user.id !== currentUser?.id && !user.deletedAt && user.isActive !== false)
    .slice(0, 3)
    .map((user: Record<string, unknown>) => ({
      id: user.id,
      name: user.name || user.username || 'کاربر',
      role: state?.roles?.find((role: Record<string, unknown>) => role.id === user.roleId)?.name || 'عضو سازمان',
    }));

  const dockActions = {
    request: canAccess('internal_automation'),
    task: canAccess('tasks'),
    payment: canAccess('finance'),
    negotiation: canAccess('leads'),
  };
  const hasDock = Object.values(dockActions).some(Boolean);

  return (
    <div
      className="fixed inset-0 z-50 flex md:hidden"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-label="منوی اصلی سامانه"
    >
      {/* Backdrop with gentle overlay */}
      <div
        className="se-backdrop-enter fixed inset-0 bg-black/40 backdrop-blur-[12px] transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Floating glass panel sliding from the right (RTL start) */}
      {/* Contract: w-[min(148px,40vw)] */}
      <aside className="se-drawer-enter se-menu-panel relative z-10 my-2 me-2 flex h-[calc(100%-1rem)] w-[min(320px,88vw)] flex-col overflow-hidden">
        {/* Toolbar: close · theme · about */}
        <div className="shrink-0 flex items-center justify-between px-4 pt-[calc(var(--safe-top)+0.9rem)]">
          <button
            type="button"
            onClick={onClose}
            aria-label="بستن منو"
            className="se-menu-chip"
          >
            <ChevronRight size={16} strokeWidth={1.75} />
          </button>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setAboutOpen((value) => !value)}
              aria-label="درباره نرم‌افزار"
              aria-expanded={aboutOpen}
              title="درباره نرم‌افزار"
              className={cn('se-menu-chip', aboutOpen && 'se-menu-chip-on')}
            >
              <Info size={15} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              className="se-menu-chip"
              title={theme === 'dark' ? 'حالت روز' : 'حالت شب'}
              aria-label={theme === 'dark' ? 'تغییر به حالت روشن' : 'تغییر به حالت تیره'}
            >
              {theme === 'dark' ? <Sun size={15} strokeWidth={1.75} /> : <Moon size={15} strokeWidth={1.75} />}
            </button>
          </div>
        </div>

        {/* Profile */}
        <button
          type="button"
          onClick={() => go('/profile')}
          className="shrink-0 mx-4 mt-3 flex items-center gap-3 rounded-2xl p-1 text-start cursor-pointer"
        >
          <Avatar name={currentUser?.name || 'کاربر'} src={currentUser?.avatar} size="md" />
          <div className="min-w-0 flex-1">
            <span className="block truncate text-[10px] font-medium tracking-wide text-text-muted">
              {currentRole?.name || 'کاربر سامانه'}
            </span>
            <strong className="block truncate text-[14px] font-semibold text-text-main">
              {currentUser?.name || 'کاربر سیستم'}
            </strong>
          </div>
        </button>

        {/* About card (real name + version only) */}
        {aboutOpen && (
          <div className="se-menu-soft mx-4 mt-3 shrink-0 p-3.5 text-start" role="region" aria-label="درباره نرم‌افزار">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <strong className="block text-[13px] font-semibold text-text-main">سامانه اخوان</strong>
                <span className="mt-0.5 block break-words text-[10px] text-text-muted" dir="ltr">{APP_VERSION_LABEL}</span>
              </div>
              <button type="button" onClick={() => setAboutOpen(false)} aria-label="بستن درباره نرم‌افزار" className="se-menu-chip h-6 w-6">
                <X size={12} strokeWidth={1.75} />
              </button>
            </div>
            <div className="mt-3 flex items-center gap-4 text-[11px] text-text-secondary">
              <button type="button" onClick={() => { onClose(); triggerTourMenu(); }} className="flex items-center gap-1.5 hover:text-text-main cursor-pointer">
                <BookOpen size={13} strokeWidth={1.75} />
                <span>راهنمای تعاملی</span>
              </button>
              <button type="button" onClick={() => { onClose(); triggerWhatsNew(); }} className="flex items-center gap-1.5 hover:text-text-main cursor-pointer">
                <Sparkles size={13} strokeWidth={1.75} />
                <span>تازه‌های نسخه</span>
              </button>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="shrink-0 px-4 pt-3 pb-1">
          <label className="se-menu-soft flex h-9 w-full items-center gap-2 px-3 focus-within:ring-1 focus-within:ring-primary/40">
            <Search size={14} strokeWidth={1.75} className="shrink-0 text-text-muted" />
            <input
              value={navQuery}
              onChange={(e) => setNavQuery(e.target.value)}
              placeholder="جست‌وجو در منو"
              aria-label="جست‌وجوی منوی اصلی"
              className="min-w-0 flex-1 bg-transparent text-[11.5px] text-text-main outline-none placeholder:text-text-muted font-sans"
            />
            {navQuery && (
              <button
                type="button"
                onClick={() => setNavQuery('')}
                aria-label="پاک کردن جست‌وجو"
                className="text-text-muted hover:text-text-main p-0.5 cursor-pointer"
              >
                <X size={13} />
              </button>
            )}
          </label>
        </div>

        {/* Scrollable navigation */}
        <div className="flex-1 overflow-y-auto no-scrollbar px-3 py-2 space-y-3">
          {visibleSections.map((section) => {
            const visibleItems = section.items;
            const isSectionOpen = section.items.length === 1 || normalizedQuery ? true : !!openSections[section.id];

            return (
              <div key={section.id} className="space-y-0.5">
                {section.items.length > 1 && (
                  <button
                    onClick={() => toggleSection(section.id)}
                    aria-expanded={isSectionOpen}
                    className="w-full flex items-center justify-between px-3 py-1.5 text-[10.5px] font-medium tracking-wider text-text-muted hover:text-text-main transition-colors cursor-pointer"
                  >
                    <span>{section.title}</span>
                    <ChevronDown
                      size={12}
                      strokeWidth={1.75}
                      className={cn('transition-transform duration-200', isSectionOpen && 'rotate-180')}
                    />
                  </button>
                )}

                {isSectionOpen && (
                  <div className="space-y-0.5">
                    {visibleItems.map((item) => {
                      const isActive = isNavActive(item, location.pathname, location.search);
                      const childActive = (item.children || []).some((child) =>
                        isNavActive(child, location.pathname, location.search)
                      );
                      const Icon = item.icon;
                      const expanded = normalizedQuery ? true : !!openItems[item.id] || childActive;

                      return (
                        <div key={item.id}>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => go(item.path)}
                              aria-current={isActive ? 'page' : undefined}
                              className={cn(
                                'min-w-0 flex-1 flex items-center gap-3 px-3 py-2.5 rounded-2xl text-[12.5px] transition-colors cursor-pointer text-start',
                                isActive || childActive
                                  ? 'se-menu-active text-text-main font-semibold'
                                  : 'text-text-secondary hover:text-text-main'
                              )}
                            >
                              <Icon
                                size={17}
                                strokeWidth={isActive || childActive ? 1.9 : 1.5}
                                className={cn('shrink-0', (isActive || childActive) && 'text-primary')}
                              />
                              <span className="truncate">{item.label}</span>
                            </button>
                            {!!item.children?.length && (
                              <button
                                type="button"
                                onClick={() =>
                                  setOpenItems((prev) => ({ ...prev, [item.id]: !prev[item.id] }))
                                }
                                aria-label={`زیرمنوی ${item.label}`}
                                aria-expanded={expanded}
                                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-text-muted hover:text-text-main cursor-pointer"
                              >
                                <ChevronDown
                                  size={13}
                                  strokeWidth={1.75}
                                  className={cn('transition-transform duration-200', expanded && 'rotate-180')}
                                />
                              </button>
                            )}
                          </div>

                          {/* Sub-item tree */}
                          {!!item.children?.length && expanded && (
                            <div className="ms-[22px] my-1 border-s border-border-strong/60 ps-2.5 space-y-0.5">
                              {item.children.map((child) => {
                                const activeChild = isNavActive(child, location.pathname, location.search);
                                return (
                                  <button
                                    key={child.id}
                                    onClick={() => go(child.path)}
                                    aria-current={activeChild ? 'page' : undefined}
                                    className={cn(
                                      'w-full flex items-center rounded-xl px-3 py-1.5 text-[11.5px] transition-colors cursor-pointer text-start',
                                      activeChild
                                        ? 'se-menu-active text-text-main font-semibold'
                                        : 'text-text-muted hover:text-text-main'
                                    )}
                                  >
                                    <span className="truncate">{child.label}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {visibleSections.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-text-muted">موردی با این عبارت یافت نشد.</div>
          )}

          {/* Direct team contacts (real user directory; no presence indicators) */}
          {directContacts.length > 0 && (
            <div className="pt-1">
              <div className="flex items-center justify-between px-3 py-1.5 text-[10.5px] font-medium tracking-wider text-text-muted">
                <span>پیام‌ها</span>
                <button
                  type="button"
                  onClick={() => go('/groups')}
                  aria-label="ورود به صفحه چت"
                  className="grid h-6 w-6 place-items-center rounded-full hover:text-text-main cursor-pointer"
                >
                  <Plus size={14} strokeWidth={1.75} />
                </button>
              </div>
              <div className="space-y-0.5">
                {directContacts.map((contact) => (
                  <button
                    key={contact.id}
                    type="button"
                    onClick={() => go('/groups')}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-2xl hover:bg-[color-mix(in_srgb,var(--c-ink-main)_5%,transparent)] transition-colors text-start cursor-pointer"
                  >
                    <Avatar name={contact.name} size="xs" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-medium text-text-main truncate">{contact.name}</div>
                      <div className="text-[9.5px] text-text-muted truncate">{contact.role}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Settings & logout */}
          <div className="space-y-0.5 pt-1">
            {canAccess('settings') && (
              <button
                onClick={() => go('/settings')}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-[12.5px] transition-colors cursor-pointer text-start',
                  settingsActive ? 'se-menu-active text-text-main font-semibold' : 'text-text-secondary hover:text-text-main'
                )}
              >
                <Settings size={17} strokeWidth={settingsActive ? 1.9 : 1.5} className={cn(settingsActive && 'text-primary')} />
                <span>تنظیمات سامانه</span>
              </button>
            )}
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-[12.5px] text-danger/90 hover:text-danger transition-colors cursor-pointer text-start"
            >
              <LogOut size={17} strokeWidth={1.5} />
              <span>خروج از حساب کاربری</span>
            </button>
          </div>
        </div>

        {/* Dock: four minimal actions (hidden individually when the role has no access) */}
        {hasDock && (
          <div className="shrink-0 px-3 pt-1 pb-[calc(var(--safe-bottom)+0.75rem)]">
            <div className="se-menu-dock grid grid-flow-col auto-cols-fr items-start gap-0.5 p-1.5" role="group" aria-label="اقدام‌های سریع">
              {dockActions.request && <DockButton icon={Inbox} label="ثبت درخواست سازمانی" onClick={() => go('/internal_automation?new=1')} />}
              {dockActions.task && <DockButton icon={CheckSquare} label="ثبت تسک" onClick={() => go('/tasks?new=1')} />}
              {dockActions.payment && <DockButton icon={Banknote} label="دستور پرداخت" onClick={() => go('/finance?tab=requests')} />}
              {dockActions.negotiation && <DockButton icon={Handshake} label="میز مذاکره" onClick={() => go('/opportunities')} />}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
