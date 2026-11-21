import { useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, HelpCircle, MessageCircle, Menu, PanelRight, Plus, UserRound, X } from 'lucide-react';
import { useReducedMotion, motion } from 'motion/react';
import { formatCount } from '../../lib/format';
import type { HeaderQuickAction } from '../../lib/headerQuickActions';
import type { AppState } from '../../types';
import { triggerTourMenu } from '../InteractiveTour';
import type { AppNotification } from '../shared/NotificationCenter';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { SyncProgressIndicator } from './SyncProgressIndicator';

type PreviewPanel = 'account' | 'notifications' | 'chat';
const panelLabels: Record<PreviewPanel, string> = {
  account: 'حساب کاربری', notifications: 'اعلان‌ها', chat: 'گفت‌وگوی سازمانی',
};

interface FloatingHeaderProps {
  state?: AppState;
  roleName?: string;
  pageTitle: string;
  quickAction: HeaderQuickAction | null;
  scrolled: boolean;
  navOpen: boolean;
  canChat: boolean;
  notifications: AppNotification[];
  unreadNotificationsCount: number;
  onOpenMenu: () => void;
  onToggleSidebar: () => void;
  onOpenNotifications?: () => void;
  onNotificationClick?: (notification: AppNotification, replace?: boolean) => void;
}

interface ConversationPreview {
  id: string; name: string; avatar?: string; preview: string; updated: string; unread: number;
}

function recentConversations(state: AppState | undefined) {
  const me = state?.currentUserId;
  if (!me || !state) return [];
  const conversations = new Map((state.groups || [])
    .filter(group => me && group.active !== false && group.memberIds?.includes(me) && !group.archivedBy?.includes(me))
    .map((group): [string, ConversationPreview] => {
      const other = group.kind === 'DIRECT'
        ? state?.users.find(user => user.id === group.memberIds.find(id => id !== me))
        : undefined;
      return [group.id, { id: group.id, name: other?.name || group.name || 'گفت‌وگوی مستقیم', avatar: other?.avatar,
        preview: 'هنوز پیامی نیست', updated: '', unread: 0 }];
    }));
  for (const message of state?.messages || []) {
    const conversation = conversations.get(message.groupId);
    if (!conversation || message.deleted) continue;
    if (message.createdAt >= conversation.updated) {
      conversation.updated = message.createdAt;
      conversation.preview = (message.senderId === me ? 'شما: ' : '')
        + (message.content || (message.attachments?.length ? 'فایل پیوست' : 'پیوند به رکورد'));
    }
    if (message.senderId !== me && !message.readBy?.includes(me)) conversation.unread++;
  }
  return [...conversations.values()].sort((a, b) => b.updated.localeCompare(a.updated));
}

export function FloatingHeader({
  state, roleName, pageTitle, quickAction, scrolled, navOpen, canChat, notifications, unreadNotificationsCount,
  onOpenMenu, onToggleSidebar, onOpenNotifications, onNotificationClick,
}: FloatingHeaderProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const routeState = location.state as Record<string, unknown> | null;
  const selected = routeState?.headerPreview;
  const panel = selected === 'account' || selected === 'notifications' || (selected === 'chat' && canChat) ? selected : null;
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const firstPanel = useRef(false);
  const user = state?.users.find(person => person.id === state?.currentUserId);
  const chats = useMemo(() => canChat ? recentConversations(state) : [], [canChat, state?.groups, state?.messages, state?.users, state?.currentUserId]);
  const unreadChats = chats.reduce((sum, chat) => sum + chat.unread, 0);
  const mostRecent = [...notifications].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 4);
  const currentUrl = location.pathname + location.search + location.hash;

  const close = () => { if (panel) navigate(-1); };
  const show = (target: PreviewPanel, trigger: HTMLElement) => {
    if (panel === target) { close(); return; }
    triggerRef.current = trigger;
    navigate(currentUrl, { replace: panel !== null, state: { ...routeState, headerPreview: target }, preventScrollReset: true });
  };
  const go = (path: string) => {
    triggerRef.current = null;
    navigate(path, { replace: panel !== null });
  };
  const openCenter = () => {
    close();
    onOpenNotifications?.();
  };

  useEffect(() => {
    if (!panel) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      navigate(-1);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [navigate, panel]);

  useEffect(() => {
    if (panel) {
      firstPanel.current = true;
      panelRef.current?.focus({ preventScroll: true });
    } else if (firstPanel.current) {
      firstPanel.current = false;
      // A newly opened modal takes focus itself.
      if (!document.querySelector('[aria-modal="true"]')) triggerRef.current?.focus({ preventScroll: true });
    }
  }, [panel]);

  return (
    <header className="se-floating-header se-island-header sticky top-0 z-40 w-full shrink-0"
      data-scrolled={scrolled} aria-label="نوار ابزار اصلی">
      <div className="se-island-row">
        <div className="se-island se-island-capsule" role="group" aria-label="منو و ایجاد">
          <button id="mb0" type="button" onClick={() => { close(); onOpenMenu(); }} className="se-header-icon"
            aria-haspopup="dialog" aria-expanded={navOpen} aria-controls="main-navigation-drawer" aria-label="منوی اصلی" title="منوی اصلی">
            <Menu size={19} aria-hidden />
          </button>
          {quickAction && <button type="button" onClick={() => go(quickAction.path)} className="se-header-icon se-header-create"
            aria-label={quickAction.label} title={quickAction.label}><Plus size={21} aria-hidden /></button>}
        </div>
        <div className="se-island-title min-w-0 flex-1">
          <h1 id="ttl" className="se-header-title truncate" title={pageTitle}>{pageTitle}</h1>
          <span className="hidden justify-center sm:flex"><SyncProgressIndicator /></span>
        </div>
        <div className="se-header-actions flex shrink-0 items-center gap-1.5" role="group" aria-label="حساب و پیام‌ها">
          <button type="button" className="se-island se-island-btn" onClick={event => show('account', event.currentTarget)}
            aria-label="حساب کاربری" aria-expanded={panel === 'account'} aria-controls={panel === 'account' ? 'header-preview' : undefined} aria-haspopup="dialog" title="حساب کاربری">
            {user ? <Avatar name={user.name} src={user.avatar} size="sm" /> : <UserRound size={18} aria-hidden />}
          </button>
          <button type="button" className="se-island se-island-btn relative" onClick={event => show('notifications', event.currentTarget)}
            aria-label={unreadNotificationsCount ? `اعلان‌ها، ${formatCount(unreadNotificationsCount)} خوانده‌نشده` : 'اعلان‌ها'}
            aria-expanded={panel === 'notifications'} aria-controls={panel === 'notifications' ? 'header-preview' : undefined} aria-haspopup="dialog" title="اعلان‌ها">
            <Bell size={18} aria-hidden />
            {unreadNotificationsCount > 0 && <span className="se-header-count" aria-hidden>{formatCount(unreadNotificationsCount)}</span>}
          </button>
          {canChat && <button type="button" className="se-island se-island-btn relative" onClick={event => show('chat', event.currentTarget)}
            aria-label={unreadChats ? `گفت‌وگوها، ${formatCount(unreadChats)} پیام خوانده‌نشده` : 'گفت‌وگوی سازمانی'}
            aria-expanded={panel === 'chat'} aria-controls={panel === 'chat' ? 'header-preview' : undefined} aria-haspopup="dialog" title="گفت‌وگوی سازمانی">
            <MessageCircle size={18} aria-hidden />
            {unreadChats > 0 && <span className="se-header-count" aria-hidden>{formatCount(unreadChats)}</span>}
          </button>}
        </div>
      </div>

      {panel && <div className="se-header-dismiss" aria-hidden="true" onClick={close} />}
      {panel && <motion.div id="header-preview" ref={panelRef} tabIndex={-1} className="se-island-panel"
        role="dialog" aria-labelledby="header-preview-title" dir="rtl"
        initial={reducedMotion ? false : { opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reducedMotion ? 0 : 0.16 }}>
        <div className="flex items-center justify-between border-b border-border pb-1">
          <h2 id="header-preview-title" className="text-sm font-bold text-text-main">{panelLabels[panel]}</h2>
          <button type="button" className="se-header-icon" onClick={close} aria-label="بستن پیش‌نمایش"><X size={17} aria-hidden /></button>
        </div>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain py-2">
          {panel === 'account' && <>
            <div className="flex items-center gap-2 px-2 py-1">
              <Avatar name={user?.name || 'کاربر'} src={user?.avatar} size="md" />
              <div className="min-w-0">
                <p className="wrap-break-word text-sm font-semibold">{user?.name || 'کاربر'}</p>
                {roleName && <p className="wrap-break-word text-caption text-text-secondary">{roleName}</p>}
              </div>
            </div>
            <button type="button" className="se-header-preview-row" id="tour-help" onClick={() => { close(); triggerTourMenu(); }}>
              <HelpCircle size={17} aria-hidden /> راهنمای کار با سامانه
            </button>
            <button type="button" className="se-header-preview-row se-header-sidebar-action" onClick={() => { close(); onToggleSidebar(); }}>
              <PanelRight size={17} aria-hidden /> جمع یا باز کردن نوار کنار
            </button>
          </>}
          {panel === 'notifications' && <>
            {!mostRecent.length && <p className="px-2 py-4 text-center text-caption text-text-secondary">اعلانی دریافت نشده است.</p>}
            {mostRecent.map(notification => (
              <button key={notification.id} type="button" className="se-header-preview-row"
                onClick={() => {
                  if (notification.linkTab) onNotificationClick?.(notification, true);
                  else { close(); onNotificationClick?.(notification); }
                }}>
                {!notification.read && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="خوانده‌نشده" />}
                <span className="min-w-0">
                  <span className="block wrap-break-word text-xs font-semibold">{notification.title || 'اعلان'}</span>
                  {notification.message && <span className="block wrap-break-word text-caption text-text-secondary">{notification.message}</span>}
                </span>
              </button>
            ))}
          </>}
          {panel === 'chat' && <>
            {!chats.length && <p className="px-2 py-4 text-center text-caption text-text-secondary">گفت‌وگوی فعالی ندارید.</p>}
            {chats.slice(0, 4).map(chat => (
              <button type="button" key={chat.id} className="se-header-preview-row" onClick={() => go(`/groups?c=${encodeURIComponent(chat.id)}`)}>
                <Avatar name={chat.name} src={chat.avatar} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block wrap-break-word text-xs font-semibold">{chat.name}</span>
                  <span className="block wrap-break-word text-caption text-text-secondary">{chat.preview}</span>
                </span>
                {chat.unread > 0 && <span aria-label={`${formatCount(chat.unread)} خوانده‌نشده`} className="rounded-full bg-primary-soft px-2 py-0.5 text-caption text-primary">{formatCount(chat.unread)}</span>}
              </button>
            ))}
          </>}
        </div>
        <div className="shrink-0 border-t border-border pt-2">
          <Button variant="outline" className="w-full" onClick={panel === 'notifications' ? openCenter : () => go(panel === 'account' ? '/profile' : '/groups')}>
            {panel === 'notifications' ? 'مشاهده همه اعلان‌ها' : panel === 'account' ? 'مشاهده پروفایل' : 'ورود به چت'}
          </Button>
        </div>
      </motion.div>}
    </header>
  );
}
