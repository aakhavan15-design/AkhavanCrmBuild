import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Users, TrendingUp, CheckSquare, LayoutGrid, Menu, type LucideIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import { pathMatches } from '../lib/navigation';

export interface BottomNavItem {
  id: string;
  path: string;
  label: string;
  icon: LucideIcon;
  perm: string;
  match: string[];
}

export const NAV_ITEMS: ReadonlyArray<BottomNavItem> = [
  { id: 'home', path: '/', label: 'خانه', icon: Home, perm: 'home', match: ['/'] },
  { id: 'accounts', path: '/accounts', label: 'مشتریان', icon: Users, perm: 'accounts', match: ['/customers', '/accounts'] },
  { id: 'sales', path: '/quotes', label: 'فروش', icon: TrendingUp, perm: 'quotes', match: ['/quotes', '/opportunities', '/leads'] },
  { id: 'tasks', path: '/tasks', label: 'پیگیری', icon: CheckSquare, perm: 'tasks', match: ['/tasks', '/groups', '/calendar', '/activities', '/internal_automation', '/cases'] },
  { id: 'operations', path: '/operations', label: 'توزیع', icon: LayoutGrid, perm: 'operations_control', match: ['/operations', '/operations_control', '/geo-intelligence'] },
];

interface BottomNavProps {
  className?: string;
  opsBadgeCount?: number;
  canAccess?: (perm: string) => boolean;
  onOpenMenu?: () => void;
}

export function BottomNav({ className, opsBadgeCount = 0, canAccess, onOpenMenu }: BottomNavProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const activeTabId =
    NAV_ITEMS.find((item) => item.match.some((m) => pathMatches(location.pathname, m)))?.id ?? '';

  const visibleItems = canAccess ? NAV_ITEMS.filter((i) => canAccess(i.perm)) : NAV_ITEMS;

  return (
    <nav
      id="nav"
      aria-label="ناوبری اصلی"
      dir="rtl"
      className={cn(
        'se-bottom-nav fixed bottom-0 inset-x-0 z-[90] pointer-events-auto select-none flex justify-center pb-[max(0.6rem,env(safe-area-inset-bottom,0px))] px-3',
        className
      )}
    >
      {/* داک شناور کپسولی ۵۲ پیکسلی تیره لوکس */}
      <div
        className="w-full max-w-[360px] h-[54px] rounded-full px-2 flex items-center justify-between shadow-2xl backdrop-blur-2xl border border-white/10"
        style={{
          background: 'color-mix(in srgb, var(--c-navy-dark) 96%, black)',
          boxShadow: '0 12px 32px color-mix(in srgb, black 40%, transparent)',
        }}
      >
        <ul className="flex w-full items-center justify-between gap-1">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTabId === item.id;
            const isOps = item.id === 'operations';

            return (
              <li key={item.id} className="relative flex-1 flex justify-center">
                <button
                  type="button"
                  onClick={() => navigate(item.path)}
                  aria-label={isOps && opsBadgeCount > 0 ? `${item.label}، ${opsBadgeCount} مورد باز` : item.label}
                  title={item.label}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'group relative flex items-center justify-center gap-1 min-h-11 min-w-[44px] h-11 transition-all duration-300 ease-out outline-none cursor-pointer active:scale-[0.96] se-pressable',
                    isActive
                      ? 'bg-primary text-on-primary px-3 rounded-full shadow-xs ring-1 ring-white/10'
                      : 'text-white/65 hover:text-primary px-2 rounded-full hover:bg-white/5 active:scale-95'
                  )}
                >
                  {isActive && (
                    <span className="se-dock-pill absolute inset-x-3 -top-1 h-[2px] rounded-full bg-primary" />
                  )}
                  <Icon
                    size={17}
                    strokeWidth={isActive ? 2.25 : 1.75}
                    fill={isActive && item.id === 'home' ? 'currentColor' : 'none'}
                    aria-hidden
                  />
                  
                  {isActive && (
                    <span className="text-[11.5px] font-bold tracking-tight leading-none whitespace-nowrap">
                      {item.label}
                    </span>
                  )}

                  {isOps && opsBadgeCount > 0 && !isActive && (
                    <span className="absolute top-1 right-1 flex h-2 w-2 rounded-full bg-danger ring-1 ring-black" />
                  )}
                </button>
              </li>
            );
          })}
          {onOpenMenu && (
            <li className="relative flex-1 flex justify-center">
              <button
                type="button"
                onClick={onOpenMenu}
                aria-label="منو"
                title="منوی اصلی"
                className="group relative flex items-center justify-center min-h-11 min-w-[44px] h-11 text-white/65 hover:text-white px-2 rounded-full hover:bg-white/5 active:scale-95 transition-all outline-none cursor-pointer"
              >
                <Menu size={16} strokeWidth={1.75} />
              </button>
            </li>
          )}
        </ul>
      </div>
    </nav>
  );
}
