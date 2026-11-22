import { getStateSyncEngine } from '../services/stateSyncRuntime';
import { dataSyncController, useDataSyncStatus } from '../services/dataSyncController';
import { useDeepLinkCreate } from '../hooks/useDeepLinkCreate';
import { BottomSheet } from './ui/BottomSheet';
import { toast } from './ui/Toast';
import { guard } from '../hooks/useCan';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AppState, UserGroup, GroupMessage, Mention, ID, CustomerTask, UserAccount, Attachment } from '../types';
import { generateId } from '../lib/utils';
import { processMessageMentions, processTaskCollaborationEvents } from '../lib/collaboration';
import {
  Users, Send, Building2, CheckSquare, Search, Plus, MessageCircle, Paperclip, Check, CheckCheck, UserPlus, FileText, TrendingUp,
  ShieldAlert, Activity, ArrowDown, ArrowRight, Pin, PinOff, Reply, Pencil, Trash2, X, Download, ListPlus, AtSign, Archive, Bell, BellOff, MoreHorizontal
} from 'lucide-react';
import { Button } from './ui/Button';
import { Input, Select, Textarea, InputControl, Checkbox } from './ui/Input';
import { Modal } from './ui/Modal';
import { Avatar } from './ui/Avatar';
import { EmptyState } from './ui/EmptyState';
import { LoadingState } from './ui/LoadingState';
import { RBACService } from '../lib/rbac';
import { haptics } from '../lib/haptics';
import { playMechanicalTick } from '../lib/sound';
import { useCan } from '../hooks/useCan';
import { cn } from '../lib/utils';
import { searchMentions, createMentionReference, MentionEntity } from '../services/mentionEngine';
import { assignSla, proposeOverflow } from '../services/taskIntelligence';
import { buildChatReferenceScope } from '../lib/chatReferenceScope';
import { smartSearch } from '../lib/smartSearch';
import { OPERATIONS_CONFIG } from '../config/operations';

interface Props { state: AppState; updateState: (updater: (draft: AppState) => AppState | void) => void; setActiveTab?: (tab: Record<string, unknown>) => void }
type Filter = 'ALL' | 'UNREAD' | 'MENTIONS' | 'GROUPS' | 'DIRECT' | 'ARCHIVED';
type EntityType = 'ACCOUNT' | 'TASK' | 'QUOTE' | 'OPPORTUNITY' | 'CASE' | 'REQUEST';
type MessageFile = Pick<Attachment, 'id' | 'fileName' | 'fileType' | 'fileSize' | 'base64Data'>;
type MessageReference = ReturnType<typeof createMentionReference>;
type Reaction = { emoji: string; userIds: string[] };
type ConversationMessage = GroupMessage & {
  attachments?: MessageFile[];
  entityMentions?: MessageReference[];
  reactions?: Reaction[];
};
type LinkableRecord = { id: ID; name?: string; title?: string; subject?: string; number?: string; quoteNumber?: string };

const MAX_FILE = 1.5 * 1024 * 1024;
const MAX_SQL_ATTACHMENTS = 600 * 1024;
const CHAT_POLL_INTERVAL = 15_000;
const atLatestMessage = (area: HTMLElement) => area.scrollHeight - area.scrollTop - area.clientHeight < 48;
const fa = (n: number) => n.toLocaleString('fa-IR');
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
const dayOf = (iso: string) => new Intl.DateTimeFormat('fa-IR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso));
const sameDay = (a: string, b: string) => new Date(a).toDateString() === new Date(b).toDateString();
const shortWhen = (iso: string) => (sameDay(iso, new Date().toISOString()) ? timeOf(iso) : new Intl.DateTimeFormat('fa-IR', { day: 'numeric', month: 'short' }).format(new Date(iso)));
const ENTITY_ICON: Record<string, React.ElementType> = { ACCOUNT: Building2, CUSTOMER: Building2, STAFF: Users, CHECK: FileText, INVOICE: FileText, PRODUCT: FileText, TASK: CheckSquare, QUOTE: FileText, OPPORTUNITY: TrendingUp, CASE: ShieldAlert, REQUEST: Activity };

export function GroupsWorkspace({ state, updateState }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const syncStatus = useDataSyncStatus();
  const chatReady = !syncStatus.isSqlActive || Boolean(getStateSyncEngine()?.hasSnapshot());
  const connectionOffline = syncStatus.isSqlActive && syncStatus.state === 'offline';
  const [refreshError, setRefreshError] = useState(false);
  const refreshLock = useRef(false);
  const refreshConversations = useCallback(async (manual = false) => {
    if (refreshLock.current || !navigator.onLine) return;
    const engine = getStateSyncEngine();
    if (!manual && !engine?.hasSnapshot()) return;
    refreshLock.current = true;
    try {
      const updated = engine?.hasSnapshot() ? await engine.hydrate('chat') : await dataSyncController.retrieveFromSqlServer();
      if (updated || !engine?.hasSnapshot()) setRefreshError(!updated);
    } catch {
      setRefreshError(true);
    } finally { refreshLock.current = false; }
  }, []);
  useEffect(() => {
    if (!syncStatus.isSqlActive) return;
    const refreshVisible = () => { if (document.visibilityState === 'visible') void refreshConversations(); };
    const timer = window.setInterval(refreshVisible, CHAT_POLL_INTERVAL);
    document.addEventListener('visibilitychange', refreshVisible);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refreshVisible); };
  }, [refreshConversations, syncStatus.isSqlActive]);
  const [retryingMessage, setRetryingMessage] = useState(false);
  async function retrySend() {
    if (retryingMessage) return;
    setRetryingMessage(true);
    try { await syncStatus.syncNow(); } finally { setRetryingMessage(false); }
  }
  const me = state.currentUserId || '';
  const rbac = useMemo(() => new RBACService(state), [state]);
  const { denied } = useCan(state, updateState);
  const referenceScope = useMemo(() => buildChatReferenceScope(state, rbac), [state, rbac]);
  const canCreateGroup = rbac.can('groups', 'CREATE');
  const users = state.users || [];
  const userOf = (id?: string) => users.find(u => u.id === id);

  const [filter, setFilter] = useState<Filter>('ALL');
  const [query, setQuery] = useState('');
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<ConversationMessage | null>(null);
  const [editing, setEditing] = useState<ConversationMessage | null>(null);
  const draftMessage = editing ?? replyTo;
  const [selectedMsg, setSelectedMsg] = useState<string | null>(null);
  const [files, setFiles] = useState<MessageFile[]>([]);
  const [fileError, setFileError] = useState('');
  const [readingFiles, setReadingFiles] = useState(false);
  const fileReadLock = useRef(false);
  const sendLock = useRef(false);
  const [attachedEntity, setAttachedEntity] = useState<{ type: EntityType; id: ID; display: string } | undefined>();
  const [pendingMentions, setPendingMentions] = useState<Mention[]>([]);
  const [pendingEntityMentions, setPendingEntityMentions] = useState<MessageReference[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [modal, setModal] = useState<null | 'create' | 'group' | 'dm' | 'members' | 'record' | 'task' | 'conversation-actions'>(null);
  const [taskFrom, setTaskFrom] = useState<ConversationMessage | null>(null);
  const [taskAssignee, setTaskAssignee] = useState(me);
  const [taskDue, setTaskDue] = useState(new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0]);
  const [taskPriority, setTaskPriority] = useState('NORMAL');
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [pickQuery, setPickQuery] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const logContentRef = useRef<HTMLDivElement>(null);
  const inboxRef = useRef<HTMLUListElement>(null);
  const inboxPosition = useRef(0);
  const threadPositions = useRef(new Map<string, number>());
  const [awayFromLatest, setAwayFromLatest] = useState(false);
  const headerTitleRef = useRef<HTMLHeadingElement>(null);
  const chatAnchor = useRef({ group: null as string | null, atEnd: true });
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const unreadAnchor = useRef<{ id: string; msgId: string | null } | null>(null);

  const activeId = params.get('c');
  const attachmentSession = useRef(0);
  const openConv = (id: string | null) => {
    if (!id && location.state?.chatFromInbox) { navigate(-1); return; }
    const next = new URLSearchParams(params);
    if (id) next.set('c', id); else next.delete('c');
    setParams(next, { replace: !id, state: id && !activeId ? { chatFromInbox: true } : null });
  };
  useLayoutEffect(() => {
    attachmentSession.current++;
    setModal(null);
    setTaskFrom(null);
    setSelectedMsg(null);
    setReplyTo(null);
    setEditing(null);
    setText('');
    setFiles([]);
    fileReadLock.current = false;
    setReadingFiles(false);
    setFileError('');
    setAttachedEntity(undefined);
    setPendingMentions([]);
    setPendingEntityMentions([]);
    setMentionQuery(null);
  }, [activeId]);
  useLayoutEffect(() => {
    if (!activeId && inboxRef.current) inboxRef.current.scrollTop = inboxPosition.current;
    headerTitleRef.current?.focus({ preventScroll: true });
  }, [activeId]);
  useLayoutEffect(() => { sendLock.current = false; }, [activeId, text, files, attachedEntity, editing]);

  useDeepLinkCreate(() => {
    setPickQuery('');
    setModal(canCreateGroup ? 'create' : 'dm');
  }, rbac.canAccessWorkspace('groups'));

  // ---- مجموعه گفتگوهایی که کاربر اجازه دیدن دارد (پیام مستقیم فقط برای طرفین) ----
  const allGroups = state.groups || [];
  // Conversation confidentiality is membership-based. Admin privileges manage groups; they do not grant implicit access to every private conversation.
  const convs = useMemo(() => allGroups.filter(g => Array.isArray(g.memberIds) && g.memberIds.includes(me) && g.active !== false), [allGroups, me]);
  const messagesByGroup = useMemo(() => {
    const groups = new Map<string, ConversationMessage[]>();
    for (const message of state.messages ?? []) {
      const list = groups.get(message.groupId);
      if (list) list.push(message); else groups.set(message.groupId, [message]);
    }
    for (const list of groups.values()) list.sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
    return groups;
  }, [state.messages]);
  const nameOf = (g: UserGroup) => (g.kind === 'DIRECT' ? userOf(g.memberIds.find((i: string) => i !== me) || me)?.name || 'کاربر' : g.name);
  const previewOf = (m: ConversationMessage | null | undefined) => (!m ? 'هنوز پیامی نیست' : m.deleted ? 'پیام حذف شد' : (m.senderId === me ? 'شما: ' : '') + (m.content || (m.attachments?.length ? 'فایل پیوست' : m.relatedEntity ? 'پیوند به رکورد' : '')));
  const rows = useMemo(() => convs.map(g => {
    const ms = messagesByGroup.get(g.id) ?? []; const last = ms[ms.length - 1];
    const unread = ms.filter(m => !m.deleted && m.senderId !== me && !m.readBy?.includes(me));
    const archived = !!g.archivedBy?.includes(me);
    const muted = !!g.mutedBy?.includes(me);
    const mentioned = unread.filter(m => m.mentions?.some((x: Mention) => x.id === me)).length;
    return { g, last, unread: unread.length, mentioned, pinned: !!g.pinnedBy?.includes(me), archived, muted, name: nameOf(g), ms };
  }), [convs, messagesByGroup, users, me]); // eslint-disable-line react-hooks/exhaustive-deps

  const q = query.trim().toLowerCase();
  const visible = rows.filter(r => {
    if (filter === 'ARCHIVED' ? !r.archived : r.archived) return false;
    if (filter === 'UNREAD' && r.unread === 0) return false;
    if (filter === 'MENTIONS' && r.mentioned === 0) return false;
    if (filter === 'GROUPS' && r.g.kind === 'DIRECT') return false;
    if (filter === 'DIRECT' && r.g.kind !== 'DIRECT') return false;
    if (q && !(r.name.toLowerCase().includes(q) || r.ms.some(m => !m.deleted && String(m.content || '').toLowerCase().includes(q)))) return false;
    return true;
  }).sort((a, b) => (+b.pinned - +a.pinned) || (+new Date(b.last?.createdAt || 0) - +new Date(a.last?.createdAt || 0)));

  const active = rows.find(r => r.g.id === activeId);
  const activeGroup = active?.g;
  const messages = active?.ms || [];
  const members = activeGroup?.memberIds.map(userOf).filter((user): user is UserAccount => Boolean(user)) || [];

  // ---- نقطه «پیام‌های جدید» قبل از علامت‌گذاری خوانده‌شده ----
  if (activeGroup && unreadAnchor.current?.id !== activeId) {
    const firstUnread = messages.find(m => !m.deleted && m.senderId !== me && !m.readBy?.includes(me));
    unreadAnchor.current = { id: activeGroup.id, msgId: firstUnread?.id || null };
  }
  useEffect(() => { if (!activeId) unreadAnchor.current = null; }, [activeId]);

  useEffect(() => {
    const area = scrollRef.current;
    if (!area || !activeGroup || !me || typeof IntersectionObserver === 'undefined') return;
    const unread = Array.from(area.querySelectorAll<HTMLElement>('[data-unread-message]'));
    if (!unread.length) return;
    const observer = new IntersectionObserver(entries => {
      if (document.visibilityState !== 'visible') return;
      const seen = new Set(entries.filter(entry => entry.isIntersecting && entry.intersectionRect.height > 0)
        .map(entry => (entry.target as HTMLElement).dataset.unreadMessage));
      if (!seen.size) return;
      updateState(draft => {
        const conversation = draft.groups?.find(group => group.id === activeGroup.id && group.active !== false);
        if (!conversation?.memberIds.includes(me)) return;
        draft.messages?.forEach(message => {
          if (message.groupId === conversation.id && seen.has(message.id) && !message.deleted && message.senderId !== me && !message.readBy?.includes(me)) {
            (message.readBy ??= []).push(me);
          }
        });
      });
    }, {root: area});
    const observe = () => { observer.disconnect(); unread.forEach(element => observer.observe(element)); };
    observe();
    document.addEventListener('visibilitychange', observe);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', observe); };
  }, [activeGroup, messages, me, updateState]);
  useLayoutEffect(() => {
    const area = scrollRef.current;
    if (!area) {
      chatAnchor.current = { group: null, atEnd: true };
      return;
    }
    if (chatAnchor.current.group !== activeId) {
      const saved = activeId ? threadPositions.current.get(activeId) : undefined;
      const firstUnread = area.querySelector<HTMLElement>('[data-first-unread]');
      if (saved !== undefined) area.scrollTop = saved;
      else if (firstUnread) area.scrollTop += firstUnread.getBoundingClientRect().top - area.getBoundingClientRect().top;
      else area.scrollTop = area.scrollHeight;
      chatAnchor.current = { group: activeId, atEnd: atLatestMessage(area) };
      setAwayFromLatest(!chatAnchor.current.atEnd);
    }
    if (chatAnchor.current.atEnd) area.scrollTop = area.scrollHeight;
  }, [messages.length, activeGroup?.id, activeId]);
  useLayoutEffect(() => {
    const area = scrollRef.current;
    if (!area || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (chatAnchor.current.atEnd) area.scrollTop = area.scrollHeight;
    });
    observer.observe(area);
    if (logContentRef.current) observer.observe(logContentRef.current);
    return () => observer.disconnect();
  }, [activeGroup?.id]);
  useLayoutEffect(() => { const el = inputRef.current; if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 112) + 'px'; } }, [text, activeId]);

  // ---- ارسال / ویرایش ----
  const onTextChange = (v: string, caret: number) => {
    setText(v);
    const m = v.slice(0, caret).match(/(?:^|\s)@([^\s@]*)$/);
    setMentionQuery(m ? m[1] : null);
  };
  const mentionOptions = mentionQuery === null ? [] : members.filter(u => u.id !== me && ((u.name || '').toLowerCase().includes(mentionQuery.toLowerCase()) || (u.username || '').toLowerCase().includes(mentionQuery.toLowerCase()))).slice(0, 5);
  const entityMentionOptions: MentionEntity[] = mentionQuery === null ? [] : searchMentions(referenceScope.state, mentionQuery, { maxResults: 8 }).filter(entity => entity.entityType !== 'STAFF').slice(0, 6);
  const pickEntityMention = (entity: MentionEntity) => {
    const el = inputRef.current; const caret = el?.selectionStart ?? text.length; const beforeText = text.slice(0, caret); const at = beforeText.lastIndexOf('@');
    if (at < 0) return; const before = text.slice(0, at); const after = text.slice(caret); const token = `@${entity.displayText}`;
    setText(`${before}${token} ${after}`); setPendingEntityMentions(previous => previous.some(x => x.entityType === entity.entityType && x.entityId === entity.entityId) ? previous : [...previous, createMentionReference(entity)]); setMentionQuery(null); setTimeout(() => el?.focus(), 0);
  };
  const pickMention = (u: UserAccount) => {
    const el = inputRef.current; const caret = el?.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@([^\s@]*)$/, ''); const after = text.slice(caret);
    const token = `@${u.name}`; setText(`${before}${token} ${after}`); setMentionQuery(null);
    setPendingMentions(p => (p.some(x => x.id === u.id) ? p : [...p, { id: u.id, type: 'USER', display: token } as Mention]));
    setTimeout(() => el?.focus(), 0);
  };

  const readFiles = async (list: FileList | null) => {
    if (!list?.length || fileReadLock.current) return;
    setFileError('');
    const session = attachmentSession.current;
    const selected = Array.from(list).slice(0, 4 - files.length);
    if (syncStatus.isSqlActive && [...files, ...selected.map(file => ({ fileSize: file.size }))]
      .reduce((size, file) => size + file.fileSize, 0) > MAX_SQL_ATTACHMENTS) {
      setFileError('مجموع حجم پیوست‌های یک پیام باید کمتر از ۶۰۰ کیلوبایت باشد.');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    if (fileRef.current) fileRef.current.value = '';
    fileReadLock.current = true;
    setReadingFiles(true);
    const results = await Promise.allSettled(selected.map(file => new Promise<MessageFile>((resolve,reject) => {
      if (file.size > MAX_FILE) return reject(new Error(`«${file.name}» بیش از ۱٫۵ مگابایت است.`));
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === 'string'
        ? resolve({id:generateId(),fileName:file.name,fileType:file.type,fileSize:file.size,base64Data:reader.result})
        : reject(new Error(`خواندن «${file.name}» ممکن نشد.`));
      reader.onerror = reader.onabort = () => reject(new Error(`خواندن «${file.name}» ممکن نشد.`));
      reader.readAsDataURL(file);
    })));
    if (session !== attachmentSession.current) return;
    setFiles(previous => [...previous,...results.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])].slice(0,4));
    const failure = results.find(result => result.status === 'rejected');
    if (failure) setFileError(failure.reason instanceof Error ? failure.reason.message : 'خواندن پیوست ممکن نشد.');
    fileReadLock.current = false;
    setReadingFiles(false);
  };

  const send = () => {
    if (sendLock.current || fileReadLock.current) return;
    if (!activeGroup || !rbac.canActOnRecord('messages', 'CREATE', scopeOf(me))) return;
    if (attachedEntity && !referenceScope.get(attachedEntity.type, attachedEntity.id)) return denied('پیوست رکورد خارج از محدوده');
    const content = text.trim();
    playMechanicalTick();
    if (editing) {
      if (!content) return;
      if (!rbac.canActOnRecord('messages', 'EDIT', scopeOf(editing.senderId))) return denied('ویرایش این پیام');
      sendLock.current = true;
      updateState(d => { const m = (d.messages || []).find(x => x.id === editing.id && x.groupId === activeGroup.id); if (m && m.senderId === me && !m.deleted) { m.content = content; m.editedAt = new Date().toISOString(); } });
      setEditing(null); setText(''); haptics.light(); return;
    }
    if (!content && !attachedEntity && files.length === 0) return;
    if (syncStatus.isSqlActive && files.reduce((size, file) => size + file.fileSize, 0) > MAX_SQL_ATTACHMENTS) {
      setFileError('مجموع پیوست‌ها بیش از سقف ۶۰۰ کیلوبایت است.');
      return;
    }
    const mentions = pendingMentions.filter(p => content.includes(p.display) && activeGroup.memberIds.includes(p.id) && (userOf(p.id)?.isActive ?? userOf(p.id)?.active) !== false);
    const msg: ConversationMessage = {
      id: generateId(), groupId: activeGroup.id, senderId: me, content, mentions, entityMentions: pendingEntityMentions.filter(ref => content.includes(`@${ref.displayText}`) && referenceScope.get(ref.entityType, ref.entityId)), relatedEntity: attachedEntity,
      attachments: files.length ? files : undefined, replyToId: replyTo?.id, createdAt: new Date().toISOString(), readBy: [me],
    };
    sendLock.current = true;
    chatAnchor.current.atEnd = true;
    updateState(d => {
      if (!d.messages) d.messages = [];
      d.messages.push(msg);
      processMessageMentions(msg, nameOf(activeGroup), state, d);
      if (activeGroup.kind === 'DIRECT') {
        const other = activeGroup.memberIds.find((i: string) => i !== me);
        if (other && !mentions.some(mention => mention.id === other) && !activeGroup.mutedBy?.includes(other)) { if (!d.notifications) d.notifications = []; d.notifications.push({ id: generateId(), title: 'پیام جدید', message: `${userOf(me)?.name || 'همکار'}: ${(content || 'پیوست').slice(0, 60)}`, type: 'INFO', read: false, createdAt: new Date().toISOString(), linkTab: 'groups', conversationId: activeGroup.id, recipientId: other }); }
      }
    });
    setText(''); setAttachedEntity(undefined); setFiles([]); setReplyTo(null); setPendingMentions([]); setPendingEntityMentions([]); setMentionQuery(null); haptics.selection();
  };
  const removeMsg = (m: ConversationMessage) => { if (!rbac.canActOnRecord('messages', 'SOFT_DELETE', scopeOf(m.senderId))) return denied('حذف این پیام'); updateState(d => { const x = (d.messages || []).find(y => y.id === m.id && y.groupId === activeGroup?.id); if (x && !x.deleted) { x.deletedBy = me; x.deleted = true; x.deletedAt = new Date().toISOString(); x.content = ''; x.attachments = undefined; x.relatedEntity = undefined; x.mentions = []; } }); setSelectedMsg(null); };

  // ---- ایجاد وظیفه از پیام (جلوگیری از تکرار با taskId روی پیام) ----
  const openTaskFrom = (m: ConversationMessage) => { setTaskFrom(m); setTaskAssignee(me); setModal('task'); };
  const createTask = () => {
    if (!taskFrom || taskFrom.taskId) return;
    if (!rbac.can('tasks', 'CREATE')) return denied('ایجاد وظیفه');
    if (taskAssignee !== me && !rbac.can('tasks', 'ASSIGN')) return denied('ارجاع وظیفه به دیگران');
    if (!activeGroup?.memberIds.includes(taskAssignee)) return;
    const mentionedCustomer = (taskFrom.entityMentions || []).find(ref => ref.entityType === 'CUSTOMER');
    const acc = taskFrom.relatedEntity?.type === 'ACCOUNT' ? taskFrom.relatedEntity.id : mentionedCustomer?.entityId;
    const task = assignSla({
      id: generateId(), accountId: acc, customerId: acc, title: String(taskFrom.content || 'پیگیری از گفتگو').slice(0, 80), description: `ایجادشده از پیام گروه «${nameOf(activeGroup)}»`,
      dueDate: taskDue, targetDate: taskDue, status: 'OPEN', priority: taskPriority, slaStatus: 'ON_TRACK', assigneeType: 'USER', assigneeId: taskAssignee,
      mentions: Array.isArray(taskFrom.entityMentions) ? taskFrom.entityMentions : [], sourceMessageId: taskFrom.id, createdAt: new Date().toISOString(),
    }) as CustomerTask;
    const settings = state.settings?.taskWorkloadLimits?.[taskAssignee] || {};
    const capacityProposal = proposeOverflow(state.tasks || [], taskAssignee, taskDue, [task], {
      maxDailyTasks: settings.maxDailyTasks ?? OPERATIONS_CONFIG.defaultDailyTaskCapacity,
      maxDailyScore: settings.maxDailyScore ?? OPERATIONS_CONFIG.defaultDailyScoreCapacity,
      workingDays: settings.workingDays,
    }, (state.users || []).filter(u => (u.isActive ?? u.active) !== false).map(u => u.id));
    if (!capacityProposal.capacity.fits) {
      toast.warning(`ظرفیت روزانه این مسئول تکمیل است. اولین تاریخ پیشنهادی: ${capacityProposal.nextSlot?.date || 'در بازه ۹۰ روزه یافت نشد'}. لطفاً تاریخ را اصلاح کنید یا مسئول دیگری انتخاب کنید.`);
      return;
    }
    updateState(d => {
      // Idempotent: اگر پیام قبلاً وظیفه ساخته (دوبار کلیک/ارسال مجدد)، رکورد دوم ساخته نمی‌شود
      const m = (d.messages || []).find(x => x.id === taskFrom.id);
      if (!m || m.taskId || m.deleted) return;
      m.taskId = task.id;
      if (!d.tasks) d.tasks = []; d.tasks.unshift(task);
      processTaskCollaborationEvents(task, state, d, true);
      if (!d.auditLogs) d.auditLogs = [];
      d.auditLogs.push({ id: generateId(), action: 'TASK_CREATED', entityType: 'TASK', entityId: task.id, details: `وظیفه «${task.title}» از پیام گروهی ساخته شد`, actor: userOf(me)?.name || 'System', createdAt: new Date().toISOString() });
    });
    setModal(null); setTaskFrom(null); haptics.success();
  };

  // ---- گروه / پیام مستقیم / سنجاق ----
  const createGroup = () => {
    if (!guard(state, updateState, 'groups', 'CREATE', 'ایجاد گروه')) return;
    if (!newGroupName.trim()) return;
    const g: UserGroup = { id: generateId(), name: newGroupName.trim(), description: newGroupDesc.trim(), managerId: me, memberIds: [...new Set([...selectedMembers, me])], active: true };
    updateState(d => { if (!d.groups) d.groups = []; d.groups.push(g); });
    setNewGroupName(''); setNewGroupDesc(''); setSelectedMembers([]); setModal(null); openConv(g.id);
  };
  const startDirect = (uid: string) => {
    const ex = allGroups.find(g => g.kind === 'DIRECT' && g.memberIds.length === 2 && g.memberIds.includes(me) && g.memberIds.includes(uid));
    setModal(null); setPickQuery('');
    if (ex) { openConv(ex.id); return; }
    const g: UserGroup = { id: generateId(), name: '', kind: 'DIRECT', memberIds: [me, uid], active: true, managerId: me };
    updateState(d => { if (!d.groups) d.groups = []; d.groups.push(g); });
    openConv(g.id);
  };
  const togglePin = (g: UserGroup) => updateState(d => { const x = (d.groups || []).find(y => y.id === g.id); if (!x) return; const s = new Set<string>(x.pinnedBy || []); s.has(me) ? s.delete(me) : s.add(me); x.pinnedBy = [...s]; });
  const toggleGroupFlag = (g: UserGroup, field: 'archivedBy' | 'mutedBy') => updateState(d => { const x = (d.groups || []).find(y => y.id === g.id); if (!x) return; const s = new Set<string>(x[field] || []); s.has(me) ? s.delete(me) : s.add(me); x[field] = [...s]; });
  const toggleReaction = (message: ConversationMessage, emoji: string) => updateState(d => { const x = (d.messages || []).find(y => y.id === message.id && y.groupId === activeGroup?.id); if (!x || x.deleted) return; const reactions: Reaction[] = Array.isArray(x.reactions) ? [...x.reactions] : []; const index = reactions.findIndex(r => r.emoji === emoji); if (index < 0) reactions.push({ emoji, userIds: [me] }); else { const ids = new Set<string>(reactions[index].userIds || []); ids.has(me) ? ids.delete(me) : ids.add(me); reactions[index] = { ...reactions[index], userIds: [...ids] }; if (!ids.size) reactions.splice(index, 1); } x.reactions = reactions; });
  const toggleMember = (uid: string) => {
    if (!activeGroup || activeGroup.kind === 'DIRECT') return;
    updateState(d => { const g = (d.groups || []).find(x => x.id === activeGroup.id); if (!g) return; if (g.memberIds.includes(uid)) { if (g.memberIds.length > 1) g.memberIds = g.memberIds.filter((i: string) => i !== uid); } else g.memberIds.push(uid); });
  };
  const canManage = !!activeGroup && activeGroup.kind !== 'DIRECT' && rbac.canActOnRecord('groups', 'EDIT', { memberIds: activeGroup.memberIds, managerId: activeGroup.managerId });
  const scopeOf = (ownerId?: string) => ({ memberIds: activeGroup?.memberIds || [], managerId: activeGroup?.managerId, ownerId });

  const goEntity = (e: { type: string; id: ID }) => {
    if (!referenceScope.get(e.type, e.id)) return denied('مشاهدهٔ این رکورد');
    if (e.type === 'ACCOUNT' || e.type === 'CUSTOMER') { updateState(d => { d.activeContextAccountId = e.id; d.activeContextCustomerId = e.id; }); navigate(`/accounts/${encodeURIComponent(e.id)}`); return; }
    const destination: Record<string, string> = { TASK: '/tasks', QUOTE: '/quotes', OPPORTUNITY: '/opportunities', CASE: '/cases', REQUEST: '/internal_automation', STAFF: '/personnel-file', CHECK: '/finance', INVOICE: '/finance', PRODUCT: '/command', WAREHOUSE: '/operations' };
    navigate(destination[e.type] || '/');
  };

  const recordOptions = useMemo(() => {
    const s = referenceScope.state;
    const all: { type: EntityType; id: ID; display: string }[] = [
      ...(s.accounts || []).map((x: LinkableRecord) => ({ type: 'ACCOUNT' as const, id: x.id, display: `مشتری: ${x.name}` })),
      ...(s.tasks || []).map((x: LinkableRecord) => ({ type: 'TASK' as const, id: x.id, display: `وظیفه: ${x.title}` })),
      ...(s.opportunities || []).map((x: LinkableRecord) => ({ type: 'OPPORTUNITY' as const, id: x.id, display: `فرصت: ${x.title}` })),
      ...(s.quotes || []).map((x: LinkableRecord) => ({ type: 'QUOTE' as const, id: x.id, display: `پیش‌فاکتور: ${x.number || x.quoteNumber || x.id}` })),
      ...(s.cases || []).map((x: LinkableRecord) => ({ type: 'CASE' as const, id: x.id, display: `پرونده: ${x.title || x.subject || x.id}` })),
    ];
    return smartSearch(all, pickQuery, option => [option.display, option.id], { limit: 30 }).map(result => result.item);
  }, [referenceScope, pickQuery]);

  // ---- نمایش متن پیام با هایلایت منشن ----
  const renderContent = (m: ConversationMessage, mine: boolean) => {
    let parts: React.ReactNode[] = [m.content]; const mentions: Mention[] = m.mentions || [];
    mentions.forEach(mn => { parts = parts.flatMap((p, i) => (typeof p === 'string' && p.includes(mn.display) ? p.split(mn.display).flatMap((seg, k, arr) => (k < arr.length - 1 ? [seg, <mark key={`${mn.id}-${i}-${k}`} className={cn('rounded px-1 font-bold', mine ? 'bg-white/25 text-white' : 'bg-primary/10 text-primary')}>{mn.display}</mark>] : [seg])) : [p])); });
    return <>{parts}</>;
  };

  const peopleForDM = users.filter(u => u.id !== me && (u.isActive ?? u.active) !== false && (!pickQuery || u.name?.includes(pickQuery) || u.username?.toLowerCase().includes(pickQuery.toLowerCase())));
  const totalUnread = rows.reduce((s, r) => s + r.unread, 0);

  const unavailable = connectionOffline || refreshError || (!chatReady && syncStatus.state === 'failed');
  const startConversation = () => { setPickQuery(''); setModal(canCreateGroup ? 'create' : 'dm'); };
  const recipient = activeGroup?.kind === 'DIRECT' ? userOf(activeGroup.memberIds.find(id => id !== me)) : undefined;
  const canSend = Boolean(activeGroup && rbac.canActOnRecord('messages', 'CREATE', scopeOf(me)));
  const cancelReplyOrEdit = () => {
    if (editing) setText('');
    setReplyTo(null);
    setEditing(null);
    setMentionQuery(null);
  };
  const jumpToLatest = () => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    chatAnchor.current.atEnd = true;
    setAwayFromLatest(false);
  };
  const connectionStatus = unavailable && <div className="flex items-center justify-between gap-2 rounded-xl bg-sunken px-3 py-1 text-caption text-text-secondary">
    <p role="status">{connectionOffline ? 'آفلاین · آخرین دادهٔ دریافت‌شده' : 'دریافت پیام‌های تازه ممکن نشد.'}</p>
    {!connectionOffline && <Button variant="ghost" size="sm" type="button" onClick={() => void refreshConversations(true)}>تلاش دوباره</Button>}
  </div>;

  return (
    <div className="crm-page crm-page-groups h-full min-h-0 min-w-0 bg-canvas text-text-main" dir="rtl">
      {!activeId && <section id="chat-inbox" aria-labelledby="chat-inbox-title" className="crm-chat-screen">
        <header className="crm-chat-rail space-y-2.5 pb-2 pt-2 sm:pt-4">
          <div className="flex min-h-12 items-center gap-2.5">
            <Button type="button" variant="ghost" size="icon" className="size-11 min-h-11 shrink-0 rounded-full"
              aria-label="بازگشت به فضای کار" onClick={() => navigate('/workspace/home')}><ArrowRight size={20} aria-hidden="true" /></Button>
            <h1 id="chat-inbox-title" ref={headerTitleRef} tabIndex={-1} data-tour-heading className="min-w-0 flex-1 text-xl font-extrabold outline-none">پیام‌ها</h1>
            {totalUnread > 0 && <span aria-label={`${fa(totalUnread)} پیام خوانده‌نشده`} className="rounded-full bg-primary/10 px-2.5 py-0.5 text-caption font-bold text-primary">{fa(totalUnread)}</span>}
            <Button type="button" variant="ghost" size="icon" className="size-11 min-h-11 shrink-0 rounded-full"
              aria-label="پیام جدید" aria-haspopup="dialog" title="پیام جدید" onClick={startConversation}><Pencil size={19} aria-hidden="true" /></Button>
          </div>
          <div className="crm-chat-filters">
            <div className="relative min-w-0 flex-1">
              <Search size={17} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-text-secondary" aria-hidden="true" />
              <InputControl type="search" value={query} onChange={event => { setQuery(event.target.value); if (inboxRef.current) inboxRef.current.scrollTop = 0; }}
                placeholder="جست‌وجوی گفتگو و پیام" aria-label="جست‌وجوی گفتگو و پیام" />
            </div>
            <Select value={filter} onChange={event => { setFilter(event.target.value as Filter); if (inboxRef.current) inboxRef.current.scrollTop = 0; }}
              aria-label="فیلتر گفتگوها">
              <option value="ALL">همه</option>
              <option value="UNREAD">خوانده‌نشده</option>
              <option value="MENTIONS">منشن</option>
              <option value="GROUPS">گروه‌ها</option>
              <option value="DIRECT">مستقیم</option>
              <option value="ARCHIVED">بایگانی</option>
            </Select>
          </div>
          {connectionStatus}
        </header>
        <ul ref={inboxRef} onScroll={event => { inboxPosition.current = event.currentTarget.scrollTop; }} className="crm-chat-scroll crm-chat-inbox-list">
          {visible.map(row => {
            const direct = row.g.kind === 'DIRECT';
            const other = direct ? userOf(row.g.memberIds.find(id => id !== me)) : undefined;
            return <li key={row.g.id} className="crm-chat-rail">
              <button type="button" onClick={() => openConv(row.g.id)}
                className="group flex min-h-[4.5rem] w-full items-center gap-3 rounded-xl px-2 py-2 text-start transition-colors hover:bg-sunken focus-visible:outline-2 focus-visible:outline-primary">
                {direct ? <Avatar name={row.name} src={other?.avatar} size="lg" className="shrink-0" /> :
                  <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Users size={20} aria-hidden="true" /></span>}
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5 text-sm font-bold">
                    <bdi className="truncate">{row.name}</bdi>
                    {row.pinned && <Pin size={13} className="shrink-0 text-text-secondary" aria-label="سنجاق‌شده" />}
                    {row.muted && <BellOff size={13} className="shrink-0 text-text-muted" aria-label="بی‌صدا" />}
                  </span>
                  <span className="mt-0.5 flex min-w-0 items-baseline gap-1.5 text-caption text-text-secondary">
                    <bdi className={cn('truncate', row.unread > 0 && 'font-semibold text-text-main')}>{previewOf(row.last)}</bdi>
                    {row.last && <time dateTime={row.last.createdAt} className="shrink-0 text-text-muted">· {shortWhen(row.last.createdAt)}</time>}
                  </span>
                </span>
                <span className="flex min-w-2 shrink-0 items-center gap-1.5">
                  {row.mentioned > 0 && <AtSign size={15} className="text-primary" aria-label="منشن شده‌اید" />}
                  {row.unread > 0 && <><span className="size-2 rounded-full bg-primary" aria-hidden="true" /><span className="sr-only">{fa(row.unread)} پیام خوانده‌نشده</span></>}
                </span>
              </button>
            </li>;
          })}
          {visible.length === 0 && <li className="crm-chat-rail py-10">
            {!chatReady && !unavailable ? <LoadingState label="در حال دریافت گفتگوها" /> :
              <EmptyState surface="chat_inbox" compact title={unavailable && !chatReady ? 'گفتگوها در دسترس نیستند' : convs.length ? 'گفتگویی پیدا نشد' : 'هنوز گفتگویی ندارید'}
                description={unavailable && !chatReady ? 'پس از برقراری اتصال دوباره تلاش کنید.' : convs.length ? 'نام دیگری جست‌وجو کنید یا فیلتر را تغییر دهید.' : 'برای شروع، به یکی از همکاران پیام بدهید.'}
                actionLabel={!unavailable && !convs.length ? 'پیام جدید' : undefined} onAction={startConversation} />}
          </li>}
        </ul>
      </section>}

      {activeId && <section key={activeId} id="chat-conversation" aria-labelledby="chat-thread-title" className="crm-chat-screen">
        <header className="crm-chat-rail space-y-1.5 pb-2 pt-2 sm:pt-4">
          <div className="flex min-h-12 items-center gap-2.5">
            <Button type="button" variant="ghost" size="icon" className="size-11 min-h-11 shrink-0 rounded-full"
              aria-label="بازگشت به صندوق" onClick={() => openConv(null)}><ArrowRight size={20} aria-hidden="true" /></Button>
            {activeGroup && (activeGroup.kind === 'DIRECT' ? <Avatar name={active?.name ?? ''} src={recipient?.avatar} size="md" className="shrink-0" /> :
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Users size={17} aria-hidden="true" /></span>)}
            <div className="min-w-0 flex-1">
              <h1 id="chat-thread-title" ref={headerTitleRef} tabIndex={-1} className="truncate text-base font-extrabold outline-none">{active?.name ?? 'گفتگو'}</h1>
              {activeGroup && <p className="truncate text-caption text-text-secondary">{activeGroup.kind === 'DIRECT'
                ? (recipient?.username ? <bdi>@{recipient.username}</bdi> : 'پیام مستقیم')
                : `${fa(activeGroup.memberIds.length)} عضو${activeGroup.description ? ' · ' + activeGroup.description : ''}`}</p>}
            </div>
            {activeGroup && <Button type="button" variant="ghost" size="icon" className="size-11 min-h-11 shrink-0 rounded-full"
              aria-label="گزینه‌های گفتگو" aria-haspopup="dialog" onClick={() => setModal('conversation-actions')}><MoreHorizontal size={20} /></Button>}
          </div>
          {connectionStatus}
        </header>
        {activeGroup ? <>
          <div className="relative grid min-h-0">
            <div ref={scrollRef} className="crm-chat-scroll" role="log" aria-labelledby="chat-thread-title" aria-live="polite"
              onScroll={event => {
                const area = event.currentTarget;
                threadPositions.current.set(activeGroup.id, area.scrollTop);
                chatAnchor.current.atEnd = atLatestMessage(area);
                setAwayFromLatest(!chatAnchor.current.atEnd);
              }} onClick={() => setSelectedMsg(null)}>
              <div ref={logContentRef} className="crm-chat-rail min-h-full space-y-1.5 pb-3 pt-1">
              {messages.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center text-xs text-text-secondary"><MessageCircle size={38} className="opacity-25" /><p className="font-semibold">هنوز پیامی ثبت نشده است.</p><p className="text-caption">اولین پیام را بنویسید؛ با @ همکاران را منشن کنید.</p></div>
              )}
              {messages.map((m, i) => {
                const mine = m.senderId === me; const sender = userOf(m.senderId); const prev = messages[i - 1];
                const newDay = !prev || !sameDay(prev.createdAt, m.createdAt);
                const grouped = prev && !newDay && prev.senderId === m.senderId && !prev.deleted && !m.deleted
                  && Date.parse(m.createdAt) - Date.parse(prev.createdAt) < 180_000;
                const reply = m.replyToId ? messages.find(x => x.id === m.replyToId) : null;
                const others = activeGroup.memberIds.filter((id: string) => id !== m.senderId);
                const seen = others.filter((id: string) => m.readBy?.includes(id)).length;
                const pending = mine && syncStatus.isSqlActive && !getStateSyncEngine()?.isRecordAcknowledged('messages', m.id);
                const sel = selectedMsg === m.id;
                return (
                  <React.Fragment key={m.id}>
                    {newDay && <div className="py-3 text-center text-caption font-medium text-text-secondary">{dayOf(m.createdAt)}</div>}
                    {unreadAnchor.current?.msgId === m.id && <div data-first-unread className="my-2 flex items-center gap-2 text-caption font-semibold text-primary"><span className="h-px flex-1 bg-border" />پیام‌های جدید<span className="h-px flex-1 bg-border" /></div>}
                    <div data-unread-message={!mine && !m.deleted && !m.readBy?.includes(me) ? m.id : undefined}
                      className={cn('flex items-end gap-2', mine ? 'flex-row-reverse' : 'flex-row', grouped ? 'mt-0.5' : 'mt-2')}>
                      {!mine && (grouped ? <span className="w-8 shrink-0" /> : <Avatar name={sender?.name || 'کاربر'} src={sender?.avatar} size="sm" className="shrink-0" />)}
                      <SwipeReply disabled={!!m.deleted || !canSend} onReply={() => { setReplyTo(m); inputRef.current?.focus(); }} className={cn('crm-chat-bubble flex min-w-0 flex-col', mine ? 'items-end' : 'items-start')}>
                        {!mine && !grouped && activeGroup.kind !== 'DIRECT' && <span className="mb-0.5 px-1 text-micro font-bold text-text-secondary">{sender?.name}</span>}
                        <div onClick={e => { e.stopPropagation(); if (!m.deleted) setSelectedMsg(sel ? null : m.id); }}
                          className={cn('max-w-full rounded-[1.35rem] px-3.5 py-2 text-sm leading-relaxed', !m.deleted && 'cursor-pointer',
                            m.deleted ? 'border border-dashed border-border italic text-text-secondary'
                              : mine ? cn('crm-chat-sent text-white', grouped && 'rounded-te-lg')
                                : cn('bg-surface text-text-main', grouped && 'rounded-ts-lg'))}>
                          {m.deleted ? 'این پیام حذف شد' : (
                            <>
                              {reply && <div className={cn('mb-1.5 rounded-lg border-s-2 px-2 py-1 text-caption', mine ? 'border-white/60 bg-white/15' : 'border-primary bg-primary/[.06]')}><b>{userOf(reply.senderId)?.name}</b><div className="line-clamp-2 opacity-90">{reply.deleted ? 'پیام حذف شد' : reply.content || 'پیوست'}</div></div>}
                              {m.content && <p dir="auto" className="whitespace-pre-wrap wrap-anywhere">{renderContent(m, mine)}</p>}
                              {Array.isArray(m.entityMentions) && m.entityMentions.length > 0 && (
                                <div className="mt-2 grid w-full gap-1.5" aria-label="رکوردهای ارجاع‌شده">
                                  {m.entityMentions.map(ref => {
                                    const entityType = String(ref.entityType || 'UNKNOWN');
                                    const Icon = ENTITY_ICON[entityType] || FileText;
                                    const reference = referenceScope.get(entityType, ref.entityId);
                                    if (!reference) return null;
                                    const subtitle = ref.source === 'ERP_MIRROR' ? 'آینهٔ سامانهٔ مالی' : 'پروندهٔ داخلی';
                                    return <button key={`${entityType}:${ref.entityId}`} type="button" onClick={e => { e.stopPropagation(); goEntity({ type: entityType, id: ref.entityId }); }} className={cn('flex min-h-touch w-full items-center gap-2 rounded-xl border p-2 text-start', mine ? 'border-white/30 bg-white/10 text-white hover:bg-white/15' : 'border-border bg-canvas text-text-main hover:bg-sand')} aria-label={`بازکردن ${ref.displayText || entityType}`}>
                                      <Icon size={15} className="shrink-0" />
                                      <span className="min-w-0 flex-1"><b className="block truncate text-caption">{ref.displayText || ref.entityId}</b><span className="block truncate text-micro opacity-75">{reference.label} · {subtitle}</span></span>
                                      <span className="text-nano opacity-70">{ref.source === 'ERP_MIRROR' ? 'آینهٔ سامانهٔ مالی' : 'سامانهٔ داخلی'}</span>
                                    </button>;
                                  })}
                                </div>
                              )}
                              {(m.attachments || []).map(a => a.fileType?.startsWith('image/') ? (
                                <img key={a.id} src={a.base64Data} alt={a.fileName} className="mt-1.5 max-h-52 max-w-full rounded-xl object-contain" />
                              ) : (
                                <a key={a.id} href={a.base64Data} download={a.fileName} onClick={e => e.stopPropagation()} className={cn('mt-1.5 flex min-h-control items-center gap-2 rounded-xl border px-2.5 py-1.5 text-caption font-bold', mine ? 'border-white/30 bg-white/10 text-white' : 'border-border bg-canvas text-text-main')}><Download size={14} /><span className="truncate" dir="ltr">{a.fileName}</span></a>
                              ))}
                              {m.relatedEntity && referenceScope.get(m.relatedEntity.type, m.relatedEntity.id) && (() => { const I = ENTITY_ICON[m.relatedEntity.type] || FileText; return (
                                <button type="button" onClick={e => { e.stopPropagation(); goEntity(m.relatedEntity); }} className={cn('mt-1.5 flex min-h-control w-full cursor-pointer items-center gap-2 rounded-xl border p-2 text-start text-caption font-bold', mine ? 'border-white/30 bg-white/10 text-white' : 'border-border bg-canvas text-text-main hover:bg-sand')}><I size={14} className="shrink-0" /><span className="truncate">{m.relatedEntity.display}</span></button>); })()}
                              {m.taskId && <button type="button" onClick={e => { e.stopPropagation(); navigate('/tasks'); }} className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-micro font-bold text-success"><CheckSquare size={11} />وظیفه ساخته شد</button>}
                            </>
                          )}
                        </div>
                        {Array.isArray(m.reactions) && m.reactions.some(r => (r.userIds || []).length) && <div className="mt-1 flex flex-wrap gap-1" aria-label="واکنش‌ها">{m.reactions.filter(r => (r.userIds || []).length).map(r => <button key={r.emoji} onClick={e => { e.stopPropagation(); toggleReaction(m, r.emoji); }} aria-pressed={(r.userIds || []).includes(me)} className={cn('rounded-full border px-2 py-0.5 text-caption', (r.userIds || []).includes(me) ? 'border-primary/40 bg-primary/10' : 'border-border bg-surface')}>{r.emoji} {fa(r.userIds.length)}</button>)}</div>}
                        <div className="mt-0.5 flex items-center gap-1.5 px-1 text-micro text-text-secondary">
                          <time dateTime={m.createdAt}>{timeOf(m.createdAt)}</time>{m.editedAt && <span>· ویرایش‌شده</span>}
                          {mine && !m.deleted && (pending
                            ? <><span>{connectionOffline ? 'در صف ارسال پس از اتصال' : syncStatus.lastError ? 'تأیید سرور نرسید' : 'در حال ارسال'}</span>
                              {!connectionOffline && syncStatus.lastError && <Button type="button" variant="ghost" size="xs" disabled={retryingMessage}
                                onClick={() => void retrySend()}>تلاش دوباره</Button>}</>
                            : !syncStatus.isSqlActive ? <span>ذخیرهٔ محلی</span>
                            : seen >= others.length && others.length > 0
                              ? <CheckCheck size={13} className="text-success" aria-label="خوانده شد" />
                              : seen > 0 ? <span className="flex items-center gap-0.5"><CheckCheck size={13} aria-hidden />{fa(seen)}/{fa(others.length)}</span>
                                : <Check size={13} aria-label="ثبت در سرور" />)}
                          {!m.deleted && <button type="button" aria-label="گزینه‌های پیام" aria-expanded={sel}
                            onClick={event => { event.stopPropagation(); setSelectedMsg(sel ? null : m.id); }}
                            className="sr-only focus:not-sr-only focus:min-h-11 focus:min-w-11 focus:rounded-full focus:outline-2 focus:outline-primary"><MoreHorizontal size={16} aria-hidden="true" /></button>}
                        </div>
                        {sel && !m.deleted && (
                          <div className="se-panel-enter mt-1 flex flex-wrap items-center gap-1 rounded-2xl border border-border bg-surface p-1.5 shadow-card" onClick={e => e.stopPropagation()}>
                            {['👍','❤️','😂','👏','🙏'].map(emoji => <button key={emoji} onClick={() => toggleReaction(m, emoji)} aria-label={`واکنش ${emoji}`} className="grid h-8 w-8 place-items-center rounded-full hover:bg-canvas">{emoji}</button>)}
                            <span className="mx-1 h-5 w-px bg-border" />
                            {canSend && <button onClick={() => { setReplyTo(m); setSelectedMsg(null); inputRef.current?.focus(); }} className="se-interactive flex min-h-11 cursor-pointer items-center gap-1 rounded-full px-3 text-caption font-bold text-text-main hover:bg-canvas"><Reply size={13} />پاسخ</button>}
                            {m.content && !m.taskId && <button onClick={() => { openTaskFrom(m); setSelectedMsg(null); }} className="se-interactive flex min-h-control-sm cursor-pointer items-center gap-1 rounded-full px-3 text-caption font-bold text-text-main hover:bg-canvas"><ListPlus size={13} />ساخت وظیفه</button>}
                            {mine && m.content && <button onClick={() => { setEditing(m); setText(m.content); setSelectedMsg(null); inputRef.current?.focus(); }} className="se-interactive flex min-h-control-sm cursor-pointer items-center gap-1 rounded-full px-3 text-caption font-bold text-text-main hover:bg-canvas"><Pencil size={13} />ویرایش</button>}
                            {mine && <button onClick={() => removeMsg(m)} className="se-interactive flex min-h-control-sm cursor-pointer items-center gap-1 rounded-full px-3 text-caption font-bold text-danger hover:bg-danger-soft"><Trash2 size={13} />حذف</button>}
                          </div>
                        )}
                      </SwipeReply>
                    </div>
                  </React.Fragment>
                );
              })}
              </div>
            </div>
            {awayFromLatest && <div className="crm-chat-rail pointer-events-none absolute inset-x-0 bottom-2 flex justify-end">
                <Button type="button" size="icon" variant="secondary" className="pointer-events-auto size-11 min-h-11 rounded-full bg-surface"
                  aria-label="رفتن به آخرین پیام" onClick={jumpToLatest}><ArrowDown size={17} aria-hidden="true" /></Button>
              </div>}
          </div>

            {/* Composer */}
            <div id="chat-composer" className="crm-chat-rail crm-chat-composer relative space-y-2 bg-canvas pt-1.5">
              {(entityMentionOptions.length > 0 || mentionOptions.length > 0) && (
                <div className="se-panel-enter absolute inset-x-3 bottom-full z-10 mb-1 crm-chat-suggestions overflow-y-auto rounded-2xl border border-border bg-surface shadow-raised">
                {mentionOptions.length > 0 && <ul aria-label="منشن همکار">
                  {mentionOptions.map(u => <li key={u.id}><button type="button" onMouseDown={e => e.preventDefault()} onClick={() => pickMention(u)} className="flex min-h-touch w-full cursor-pointer items-center gap-2 px-3 text-start text-xs hover:bg-canvas"><Avatar name={u.name} src={u.avatar} size="sm" /><b className="truncate text-text-main">{u.name}</b><bdi className="truncate text-text-secondary">@{u.username}</bdi></button></li>)}
                </ul>}
                {entityMentionOptions.length > 0 && <ul aria-label="منشن موجودیت‌های سامانه">
                  {entityMentionOptions.map(entity => <li key={`${entity.entityType}:${entity.entityId}`}><button type="button" onMouseDown={e => e.preventDefault()} onClick={() => pickEntityMention(entity)} className="flex min-h-touch w-full cursor-pointer items-center gap-2 px-3 text-start text-xs hover:bg-canvas"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><AtSign size={14} /></span><span className="min-w-0 flex-1"><b className="block truncate text-text-main">{entity.displayText}</b><span className="block truncate text-micro text-text-secondary">{referenceScope.get(entity.entityType, entity.entityId)?.label || 'رکورد'}</span></span><span className="text-micro text-text-secondary">{entity.source === 'ERP_MIRROR' ? 'نمایهٔ سامانهٔ مالی' : 'سامانهٔ داخلی'}</span></button></li>)}
                </ul>}
                </div>
              )}
              {draftMessage && (
                <div className="flex items-center justify-between rounded-xl border-s-2 border-primary bg-primary/[.06] px-3 py-1.5 text-caption">
                  <span className="min-w-0 truncate"><b className="text-primary">{editing ? 'ویرایش پیام' : `پاسخ به ${userOf(draftMessage.senderId)?.name || 'کاربر'}`}</b> · {draftMessage.content || 'پیوست'}</span>
                  <button type="button" aria-label={editing ? 'لغو ویرایش' : 'لغو پاسخ'} onClick={cancelReplyOrEdit} className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-sunken"><X size={15} /></button>
                </div>
              )}
              {attachedEntity && <div className="flex items-center justify-between rounded-xl bg-gold/15 px-3 py-1.5 text-caption font-bold text-text-main"><span className="flex items-center gap-1.5 truncate"><Paperclip size={13} />{attachedEntity.display}</span><button aria-label="حذف رکورد" onClick={() => setAttachedEntity(undefined)} className="grid h-8 w-8 cursor-pointer place-items-center rounded-full hover:bg-ink/10"><X size={14} /></button></div>}
              {files.length > 0 && <ul aria-label="پیش‌نمایش پیوست‌ها" className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto overscroll-contain">
                {files.map(file => <li key={file.id} className="flex min-w-0 items-center gap-1.5 rounded-lg border border-border bg-canvas p-1.5 text-caption">
                  {/^(image\/(jpeg|png|webp|gif))$/.test(file.fileType)
                    ? <img src={file.base64Data} alt="" className="size-9 shrink-0 rounded object-cover" />
                    : <FileText size={15} aria-hidden="true" />}
                  <bdi className="max-w-24 truncate" title={file.fileName}>{file.fileName}</bdi>
                  <Button type="button" size="icon" variant="ghost" aria-label={`حذف پیوست ${file.fileName}`} onClick={() => setFiles(previous => previous.filter(item => item.id !== file.id))}><X size={14} /></Button>
                </li>)}
              </ul>}
              {readingFiles && <p role="status" className="text-caption text-text-secondary">در حال آماده‌سازی پیوست…</p>}
              {fileError && <p role="alert" className="text-caption font-bold text-danger">{fileError}</p>}
              {canSend ? <form onSubmit={event => { event.preventDefault(); send(); }} className="crm-chat-compose-field flex min-w-0 items-end gap-0.5 rounded-[1.65rem] border border-border/70 bg-surface p-1">
                <input ref={fileRef} type="file" multiple hidden onChange={e => void readFiles(e.target.files)} />
                <Button type="button" size="icon" variant="ghost" onClick={() => fileRef.current?.click()} disabled={readingFiles || files.length >= 4 || !!editing} aria-label="پیوست فایل" title={syncStatus.isSqlActive ? 'حداکثر چهار فایل، مجموع ۶۰۰ کیلوبایت' : 'حداکثر چهار فایل، هرکدام ۱٫۵ مگابایت'} className="size-11 min-h-11 shrink-0 rounded-full"><Paperclip size={18} /></Button>
                <Textarea ref={inputRef} rows={1} value={text} aria-label="متن پیام" placeholder="پیام بنویسید…" dir="auto" enterKeyHint="send"
                  onChange={e => onTextChange(e.target.value, e.target.selectionStart)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } if (e.key === 'Escape') cancelReplyOrEdit(); }}
                  className="flex-1" />
                <Button type="button" size="icon" variant="ghost" onClick={() => { setPickQuery(''); setModal('record'); }} disabled={!!editing} aria-label="اتصال رکورد سامانه" title="اتصال رکورد سامانه" className="size-11 min-h-11 shrink-0 rounded-full"><Building2 size={17} /></Button>
                <Button type="submit" size="icon" variant="primary" onMouseDown={event => { if (document.activeElement === inputRef.current) event.preventDefault(); }}
                  disabled={readingFiles || (!text.trim() && (Boolean(editing) || (!attachedEntity && files.length === 0)))}
                  aria-label={editing ? 'ثبت ویرایش' : 'ارسال'} className="crm-chat-sent size-11 min-h-11 shrink-0 rounded-full">
                  {editing ? <Check size={18} aria-hidden="true" /> : <Send size={17} className="-scale-x-100" aria-hidden="true" />}
                </Button>
              </form> : <p className="rounded-xl bg-sunken px-3 py-2 text-center text-caption text-text-secondary">این گفتگو برای شما فقط خواندنی است.</p>}
            </div>
        </> : <div className="crm-chat-scroll">
          <div className="crm-chat-rail py-10">
            {!chatReady && !unavailable ? <LoadingState label="در حال دریافت گفتگو" /> :
              <EmptyState surface="chat_thread" compact title="گفتگو در دسترس نیست"
                description={unavailable ? 'پس از برقراری اتصال دوباره تلاش کنید.' : 'این گفتگو پیدا نشد یا دسترسی شما به آن تغییر کرده است.'} />}
          </div>
        </div>}
      </section>}
      {modal === 'conversation-actions' && activeGroup && active && <BottomSheet isOpen title="گزینه‌های گفتگو" onClose={() => setModal(null)}>
        <div className="grid gap-2">
          <Button type="button" variant="ghost" onClick={() => { toggleGroupFlag(activeGroup, 'mutedBy'); setModal(null); }}
            icon={active.muted ? <BellOff size={18} /> : <Bell size={18} />}>{active.muted ? 'فعال‌کردن اعلان' : 'بی‌صداکردن گفتگو'}</Button>
          <Button type="button" variant="ghost" onClick={() => { togglePin(activeGroup); setModal(null); }}
            icon={active.pinned ? <PinOff size={18} /> : <Pin size={18} />}>{active.pinned ? 'برداشتن سنجاق' : 'سنجاق گفتگو'}</Button>
          <Button type="button" variant="ghost" icon={<Archive size={18} />}
            onClick={() => { toggleGroupFlag(activeGroup, 'archivedBy'); setModal(null); openConv(null); }}>{active.archived ? 'خروج از بایگانی' : 'بایگانی گفتگو'}</Button>
          {activeGroup.kind !== 'DIRECT' && <Button type="button" variant="ghost" icon={<UserPlus size={18} />} onClick={() => setModal('members')}>اعضای گفتگو</Button>}
        </div>
      </BottomSheet>}

      {/* ---------------- Modals ---------------- */}
      <BottomSheet isOpen={modal === 'create'} onClose={() => setModal(null)} title="شروع گفت‌وگو">
        <div className="grid gap-2">
          <Button variant="outline" onClick={() => setModal('dm')}>پیام مستقیم به همکار</Button>
          {canCreateGroup && <Button variant="outline" onClick={() => setModal('group')}>ایجاد گروه کاری</Button>}
        </div>
      </BottomSheet>
      {modal === 'group' && (
        <Modal isOpen onClose={() => setModal(null)} title="ایجاد گروه کاری جدید" footer={<><Button variant="ghost" size="sm" onClick={() => setModal(null)}>انصراف</Button><Button variant="primary" size="sm" onClick={createGroup} disabled={!newGroupName.trim()}>ثبت گروه</Button></>}>
          <div className="space-y-4 text-xs">
            <Input label="نام گروه *" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="مثال: تیم فروش" required />
            <Input label="شرح و هدف گروه" value={newGroupDesc} onChange={e => setNewGroupDesc(e.target.value)} placeholder="توضیحات کوتاه" />
            <fieldset><legend className="mb-1 font-bold text-text-main">انتخاب اعضا</legend>
              <div className="max-h-48 space-y-1 overflow-y-auto">{users.filter(u => u.id !== me).map(u => <label key={u.id} className="flex min-h-touch cursor-pointer items-center gap-2.5 rounded-xl border border-border px-3 hover:bg-canvas"><Checkbox  checked={selectedMembers.includes(u.id)} onChange={e => setSelectedMembers(p => e.target.checked ? [...p, u.id] : p.filter(x => x !== u.id))} /><Avatar name={u.name} src={u.avatar} size="sm" /><span className="font-bold text-text-main">{u.name}</span></label>)}</div>
            </fieldset>
          </div>
        </Modal>
      )}
      {modal === 'dm' && (
        <Modal isOpen onClose={() => setModal(null)} title="پیام مستقیم جدید" footer={<Button variant="ghost" size="sm" onClick={() => setModal(null)}>بستن</Button>}>
          <div className="space-y-3 text-xs">
            <Input label="جستجوی همکار" value={pickQuery} onChange={e => setPickQuery(e.target.value)} placeholder="نام یا نام کاربری" />
            <div className="max-h-72 space-y-1 overflow-y-auto">{peopleForDM.map(u => <button key={u.id} onClick={() => startDirect(u.id)} className="flex min-h-(--size-row) w-full cursor-pointer items-center gap-2.5 rounded-xl border border-border px-3 text-start hover:bg-canvas"><Avatar name={u.name} src={u.avatar} size="sm" /><span><b className="block text-text-main">{u.name}</b><span className="text-micro text-text-secondary" dir="ltr">@{u.username}</span></span></button>)}{peopleForDM.length === 0 && <p className="py-6 text-center text-text-secondary">همکاری پیدا نشد.</p>}</div>
          </div>
        </Modal>
      )}
      {modal === 'members' && activeGroup && (
        <Modal isOpen onClose={() => setModal(null)} title={`اعضای گروه: ${activeGroup.name}`} footer={<Button variant="primary" size="sm" onClick={() => setModal(null)}>بستن</Button>}>
          <div className="max-h-80 space-y-2 overflow-y-auto text-xs">
            {users.map(u => { const isM = activeGroup.memberIds.includes(u.id); return (
              <div key={u.id} className="flex min-h-(--size-row) items-center justify-between rounded-xl border border-border bg-canvas p-2.5">
                <span className="flex items-center gap-2"><Avatar name={u.name} src={u.avatar} size="sm" /><span><b className="block text-text-main">{u.name}</b><span className="text-micro text-text-secondary" dir="ltr">@{u.username}</span></span></span>
                {canManage && <Button size="sm" variant={isM ? 'outline' : 'primary'} onClick={() => toggleMember(u.id)}>{isM ? 'حذف عضویت' : 'افزودن'}</Button>}
                {!canManage && isM && <span className="text-micro font-bold text-success">عضو</span>}
              </div>); })}
          </div>
        </Modal>
      )}
      {modal === 'record' && (
        <Modal isOpen onClose={() => setModal(null)} title="اتصال رکورد سامانه به پیام" footer={<Button variant="ghost" size="sm" onClick={() => setModal(null)}>انصراف</Button>}>
          <div className="space-y-3 text-xs">
            <Input label="جستجو در مشتریان، وظایف، فرصت‌ها، پیش‌فاکتورها و پرونده‌ها" value={pickQuery} onChange={e => setPickQuery(e.target.value)} />
            <div className="max-h-72 space-y-1 overflow-y-auto">{recordOptions.map(o => { const I = ENTITY_ICON[o.type]; return <button key={`${o.type}-${o.id}`} onClick={() => { setAttachedEntity(o); setModal(null); }} className="flex min-h-touch w-full cursor-pointer items-center gap-2 rounded-xl border border-border px-3 text-start hover:bg-canvas"><I size={15} className="shrink-0 text-primary" /><span className="truncate font-bold text-text-main">{o.display}</span></button>; })}{recordOptions.length === 0 && <p className="py-6 text-center text-text-secondary">رکوردی پیدا نشد.</p>}</div>
          </div>
        </Modal>
      )}
      {modal === 'task' && taskFrom && (
        <Modal isOpen onClose={() => setModal(null)} title="ساخت وظیفه از پیام" footer={<><Button variant="ghost" size="sm" onClick={() => setModal(null)}>انصراف</Button><Button variant="primary" size="sm" onClick={createTask}>ثبت وظیفه</Button></>}>
          <div className="space-y-3 text-xs">
            <p className="rounded-xl bg-canvas p-3 text-text-main">{taskFrom.content}</p>
            <label className="block font-bold text-text-main">مسئول انجام<Select value={taskAssignee} onChange={e => setTaskAssignee(e.target.value)} className="mt-1">{(members.length ? members : users).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block font-bold text-text-main">مهلت<InputControl type="date" value={taskDue} onChange={e => setTaskDue(e.target.value)} className="mt-1" /></label>
              <label className="block font-bold text-text-main">اولویت<Select value={taskPriority} onChange={e => setTaskPriority(e.target.value)} className="mt-1"><option value="LOW">کم</option><option value="NORMAL">معمولی</option><option value="HIGH">بالا</option><option value="URGENT">فوری</option></Select></label>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** کشیدن حباب برای پاسخ: فیزیک فنری (رها کردن = برگشت کشسان). فقط transform. */
function SwipeReply({ children, onReply, disabled, className }: { children: React.ReactNode; onReply: () => void; disabled?: boolean; className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null); const start = React.useRef<{ x: number; y: number } | null>(null); const fired = React.useRef(false);
  const set = (dx: number, released = false) => { const el = ref.current; if (!el) return; el.classList.toggle('is-released', released); el.style.transform = dx ? `translateX(${dx}px)` : ''; };
  return (
    <div ref={ref} className={cn('se-swipe', className)}
      onPointerDown={e => { if (disabled || e.pointerType === 'mouse' || (e.target as HTMLElement).closest('button,a,input,textarea')) return; start.current = { x: e.clientX, y: e.clientY }; fired.current = false; set(0, false); }}
      onPointerMove={e => { const s = start.current; if (!s) return; const dx = e.clientX - s.x; if (Math.abs(e.clientY - s.y) > 24 && Math.abs(dx) < 12) { start.current = null; set(0, true); return; } const lim = Math.max(-72, Math.min(72, dx * 0.6)); set(lim); if (Math.abs(lim) > 44 && !fired.current) { fired.current = true; haptics.light(); } }}
      onPointerUp={() => { if (fired.current) onReply(); start.current = null; set(0, true); }} onPointerCancel={() => { start.current = null; set(0, true); }}>
      {children}
    </div>
  );
}
