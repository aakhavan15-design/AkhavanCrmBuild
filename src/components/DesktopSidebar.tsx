import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Settings, ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';
import { NAV_SECTIONS, isNavActive } from '../lib/navigation';
import { Avatar } from './ui/Avatar';

interface DesktopSidebarProps {
  user?: { name?: string; username?: string; avatar?: string };
  roleName?: string;
  collapsed: boolean;
  canAccess: (perm: string) => boolean;
}

export function DesktopSidebar({ user, roleName, collapsed, canAccess }: DesktopSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const settingsActive = location.pathname.startsWith('/settings');
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  return (
    <aside
      aria-label="ناوبری اصلی"
      dir="rtl"
      className={cn(
        'hidden md:flex shrink-0 h-full flex-col bg-surface border-l border-border transition-[width] duration-200 z-20 select-none',
        collapsed ? 'w-[68px]' : 'w-[260px]'
      )}
    >
      {/* Brand Header */}
      <div className="h-16 shrink-0 flex items-center gap-3 px-4 border-b border-border/70 bg-surface">
        <div className="w-9 h-9 shrink-0 rounded-2xl bg-primary text-on-primary flex items-center justify-center font-bold text-base shadow-xs ring-1 ring-primary/20">
          ا
        </div>
        {!collapsed && (
          <div className="min-w-0 flex flex-col">
            <span className="font-bold text-[14px] text-text-main tracking-tight leading-tight truncate">
              گروه صنعتی اخوان
            </span>
            <span className="text-[10px] text-text-secondary font-medium tracking-wide">
              سامانه یکپارچه مدیریت کسب‌وکار
            </span>
          </div>
        )}
      </div>

      {/* Navigation Sections */}
      <nav className="flex-1 overflow-y-auto no-scrollbar py-3 px-2.5 space-y-4">
        {NAV_SECTIONS.map((section) => {
          const items = section.items.filter((i) => canAccess(i.perm));
          if (items.length === 0) return null;
          return (
            <div key={section.id} className="space-y-1">
              {collapsed ? (
                <div className="h-px bg-border/60 mx-2 my-2" />
              ) : section.items.length > 1 ? (
                <div className="px-3 pb-1 text-[11px] font-bold text-text-muted tracking-wider">
                  {section.title}
                </div>
              ) : null}
              <div className="space-y-0.5">
                {items.map((item) => {
                  const active = isNavActive(item, location.pathname, location.search);
                  const visibleChildren = (item.children || []).filter(child => canAccess(child.perm));
                  const childActive = visibleChildren.some((child) =>
                    isNavActive(child, location.pathname, location.search)
                  );
                  const expanded = expandedItems[item.id] ?? childActive;
                  const submenuId = `desktop-nav-${item.id}`;
                  const Icon = item.icon;

                  return (
                    <div key={item.id}>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          title={item.label}
                          aria-label={item.label}
                          aria-current={active ? 'page' : undefined}
                          onClick={() => navigate(item.path)}
                          className={cn(
                            'min-w-0 flex-1 flex items-center gap-2.5 rounded-xl text-[13px] font-medium transition-all duration-150 cursor-pointer se-pressable',
                            collapsed ? 'justify-center h-10 w-full' : 'px-3 py-2',
                            active || childActive
                              ? 'bg-primary/10 text-primary font-bold shadow-xs'
                              : 'text-text-main hover:bg-canvas hover:text-primary'
                          )}
                        >
                          <Icon
                            size={18}
                            strokeWidth={active || childActive ? 2.2 : 1.8}
                            className={cn(
                              'shrink-0 transition-colors',
                              active || childActive ? 'text-primary' : 'text-text-secondary'
                            )}
                          />
                          {!collapsed && (
                            <span className="truncate leading-none text-start flex-1">
                              {item.label}
                            </span>
                          )}
                        </button>

                        {!collapsed && visibleChildren.length > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedItems((prev) => ({
                                ...prev,
                                [item.id]: !(prev[item.id] ?? childActive),
                              }))
                            }
                            aria-label={`زیرمنوی ${item.label}`}
                            aria-expanded={expanded}
                            aria-controls={submenuId}
                            className="grid h-8 w-7 shrink-0 place-items-center rounded-lg text-text-secondary hover:bg-canvas hover:text-text-main transition-colors cursor-pointer"
                          >
                            <ChevronDown
                              size={14}
                              className={cn('transition-transform duration-200', expanded && 'rotate-180')}
                            />
                          </button>
                        )}
                      </div>

                      {/* Nested Sub-menu */}
                      {!collapsed && visibleChildren.length > 0 && (
                        <div id={submenuId} hidden={!expanded} className="ms-6 mt-1 mb-1.5 border-s border-border/80 ps-2.5 space-y-1">
                          {visibleChildren.map((child) => {
                              const ChildIcon = child.icon;
                              const childIsActive = isNavActive(
                                child,
                                location.pathname,
                                location.search
                              );
                              return (
                                <button
                                  key={child.id}
                                  type="button"
                                  onClick={() => navigate(child.path)}
                                  aria-current={childIsActive ? 'page' : undefined}
                                  className={cn(
                                    'w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] transition-colors cursor-pointer text-start',
                                    childIsActive
                                      ? 'bg-primary/10 text-primary font-bold'
                                      : 'text-text-secondary hover:text-text-main hover:bg-canvas'
                                  )}
                                >
                                  <ChildIcon size={14} className="shrink-0" />
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
            </div>
          );
        })}
      </nav>

      {/* Footer: Settings & Profile */}
      <div className="shrink-0 border-t border-border/70 p-2 space-y-1 bg-surface">
        {canAccess('settings') && (
          <button
            type="button"
            title="تنظیمات سامانه"
            aria-label="تنظیمات سامانه"
            onClick={() => navigate('/settings')}
            className={cn(
              'w-full flex items-center gap-2.5 rounded-xl text-[13px] font-medium transition-colors cursor-pointer',
              collapsed ? 'justify-center h-10' : 'px-3 py-2',
              settingsActive
                ? 'bg-primary/10 text-primary font-bold'
                : 'text-text-main hover:bg-canvas hover:text-primary'
            )}
          >
            <Settings
              size={18}
              strokeWidth={settingsActive ? 2.2 : 1.8}
              className={settingsActive ? 'text-primary' : 'text-text-secondary'}
            />
            {!collapsed && <span className="truncate">تنظیمات سامانه</span>}
          </button>
        )}

        <button
          type="button"
          onClick={() => navigate('/profile')}
          aria-label="پروفایل کاربر"
          className={cn(
            'w-full flex items-center gap-2.5 rounded-xl hover:bg-canvas transition-colors cursor-pointer text-start',
            collapsed ? 'justify-center h-11' : 'px-2.5 py-2'
          )}
        >
          <Avatar name={user?.name || 'کاربر'} src={user?.avatar} size="sm" />
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-bold text-text-main truncate">
                {user?.name || 'کاربر سیستم'}
              </div>
              <div className="text-[11px] text-text-secondary truncate">
                {roleName || 'مدیر'}
              </div>
            </div>
          )}
        </button>
      </div>
    </aside>
  );
}
