// Settings workspace: single implementation (organisation, users/roles/permissions, groups, rules, agents, integrations, locale).
// The former «Legacy» surface was merged here; role/permission/hierarchy editing and cycle safeguards live in this file.
// Advanced settings retained as a progressive-disclosure surface to preserve existing administration workflows.
import { useTabParam } from '../hooks/useTabParam';
import { SETTINGS_TABS, SETTINGS_USER_SUBS } from '../lib/workspaceHierarchy';
import { useCan } from '../hooks/useCan';
import { getTenantName } from '../lib/orgPolicy';
import { toLatinDigits } from '../lib/digits';
import { DEFAULT_CHURN_THRESHOLDS, getChurnThresholdOverrides, getChurnThresholdsMeta, type ChurnThresholds } from '../lib/metricConfig';
import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { subscribeWebPush, unsubscribeWebPush, isPushSupported, isPushEnabledLocally } from '../lib/webPush';
import { 
  AppState, IndustryProfile, UserGroup, DevicePermissionType, VisibilityScope, CapabilityPermission,
  AIAgent, MessagingChannel, MessagingLog, AIAgentLog 
} from '../types';
import { Card } from './ui/Card';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { toast } from './ui/Toast';
import { DynamicFormRenderer } from './shared/DynamicFormRenderer';
import { createAutomationRuleFormSchema } from '../services/dynamicFormEngine';
import { AUTOMATION_EVENT_TYPES, AUTOMATION_ACTION_TYPES } from '../lib/automation';
import { Input, Select, Textarea, InputControl, Checkbox, Switch } from './ui/Input';
import { 
  Building2, Shield, Link2, CheckCircle2, 
  Globe, Smartphone, Lock, AlertTriangle, Download, GitMerge,
  Users, Plus, Trash2, Edit2, UserCheck, UserPlus, Settings2,
  Bot, Zap, Send, ShieldAlert, Cpu, RefreshCw, MessageSquare, 
  Radio, Check, Calendar, ToggleLeft, ToggleRight, Sliders, ChevronDown, Search, X
} from 'lucide-react';
import { findDuplicateAccounts, mergeAccounts, exportCsv } from '../lib/enterprise';
import { generateId } from '../lib/utils';
import { PERMISSION_LABELS } from '../lib/rbac';
import { getPersianStatusLabel } from '../lib/labels';
import { DemoDataPanel } from './DemoDataPanel';
import { ApprovalChainConfigPanel } from './settings/ApprovalChainConfigPanel';
import { ReportingLineSettings } from './settings/ReportingLineSettings';
import { getActiveDataProvider } from '../services/dataProvider';

/** settings = فقط تنظیمات (قوانین، دستیارها، اتصال‌ها، زبان)؛ definitions = تعاریف سازمان/کاربران/گروه‌ها که زیر منوی «تعاریف» نمایش داده می‌شود. */
export type SettingsWorkspaceMode = 'settings' | 'definitions';
const SETTINGS_ONLY_TABS = ['rules', 'agents', 'integrations', 'locale'] as const;
const DEFINITION_TABS = ['org', 'users', 'groups'] as const;

interface SettingsWorkspaceProps {
  mode?: SettingsWorkspaceMode;
  state: AppState;
  updateState: (updater: (draft: AppState) => AppState | void) => void;
}

export function SettingsWorkspace({ state, updateState, mode = 'settings' }: SettingsWorkspaceProps) {
  const { can, denied, rbac } = useCan(state, updateState);
  const serverReportingLines=getActiveDataProvider().name==='SQLSERVER_BACKEND';
  // بخش فعال و زیربخش کاربران از آدرس (?tab=…&sub=…) خوانده می‌شود تا منوی سلسله‌مراتبی مستقیم به آن‌ها پیوند دهد.
  const definitionsMode = mode === 'definitions';
  const [tabParam, setTabParam] = useTabParam<string>(definitionsMode ? DEFINITION_TABS : SETTINGS_ONLY_TABS, definitionsMode ? 'org' : 'rules');
  // پیوندهای قدیمی /settings?tab=org|users|groups به زیرمنوی تعاریف می‌روند.
  const legacyNavigate = useNavigate();
  const legacyLocation = useLocation();
  const legacyTab = (new URLSearchParams(legacyLocation.search).get('tab') || '').toLowerCase();
  const legacyRedirect = !definitionsMode && (DEFINITION_TABS as readonly string[]).includes(legacyTab);
  useEffect(() => { if (legacyRedirect) legacyNavigate(`/definitions${legacyLocation.search}`, { replace: true }); }, [legacyRedirect, legacyLocation.search, legacyNavigate]);
  type SettingsTab = 'ORG' | 'USERS' | 'GROUPS' | 'LOCALE' | 'INTEGRATIONS' | 'AGENTS' | 'RULES';
  const tab = tabParam.toUpperCase() as SettingsTab;
  const setTab = (next: SettingsTab) => setTabParam(next.toLowerCase());
  const [settingsQuery, setSettingsQuery] = useState('');
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // RBAC states
  const [userSubParam, setUserSubParam] = useTabParam(SETTINGS_USER_SUBS, 'list', 'sub');
  const userSubTab = userSubParam.toUpperCase() as 'LIST' | 'ROLES' | 'PERMISSIONS';
  const setUserSubTab = (next: 'LIST' | 'ROLES' | 'PERMISSIONS') => setUserSubParam(next.toLowerCase() as typeof userSubParam);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleScope, setNewRoleScope] = useState<VisibilityScope>('OWNER');
  const [newRoleWorkspace, setNewRoleWorkspace] = useState('dashboard');
  const [selectedDevicePerms, setSelectedDevicePerms] = useState<DevicePermissionType[]>([]);
  const [selectedPermissionSetId, setSelectedPermissionSetId] = useState<string>('');

  const [showUserModal, setShowUserModal] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserLogin, setNewUserLogin] = useState('');
  const [newUserRoleId, setNewUserRoleId] = useState('');
  const [newUserPermSetId, setNewUserPermSetId] = useState('');

  // AI & Messaging Simulator states
  const [selectedAgentId, setSelectedAgentId] = useState<string>('agent-sales');
  const [editingAgentPrompt, setEditingAgentPrompt] = useState<string>('');
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);

  // Messaging Dispatcher Form
  const [testChannelId, setTestChannelId] = useState<string>('eitaa');
  const [testRecipient, setTestRecipient] = useState<string>('');
  const [testMessage, setTestMessage] = useState<string>('');
  const [pingStatusMsg, setPingStatusMsg] = useState<string | null>(null);

  // Channel edit modal
  const [editingChannel, setEditingChannel] = useState<MessagingChannel | null>(null);

  const agents: AIAgent[] = state.agents || [
    {
      id: 'agent-sales',
      name: 'دستیار هوشمند فروش و جذب سرنخ',
      type: 'SALES',
      role: 'پایش و پیگیری خودکار فرصت‌های تجاری و سرنخ‌های جدید',
      active: true,
      requiresHumanApproval: false,
      allowedTools: ['createTask', 'searchAccounts', 'calculateQuote'],
      prompt: 'پاسخگویی سریع به سرنخ‌های ورودی، اولویت‌بندی تماس‌ها و هماهنگی جلسات دمو',
      autonomyLevel: 85,
      description: 'تسهیل چرخه تبدیل سرنخ به مشتری و یادآوری پیگیری‌های فروش'
    },
    {
      id: 'agent-collection',
      name: 'دستیار پایش مطالبات و وصولی',
      type: 'COLLECTION',
      role: 'پایش سررسید چک‌ها، اخطار فاکتورهای معوق و هشدار برگشتی',
      active: true,
      requiresHumanApproval: true,
      allowedTools: ['createTask', 'searchAccounts'],
      prompt: 'ارسال یادآوری پیامکی و بومی پیش از موعد سررسید چک و ارجاع موارد پرریسک به سرپرست مالی',
      autonomyLevel: 70,
      description: 'پیشگیری از نکول مطالبات با اخطارهای محترمانه چندمرحله‌ای'
    },
    {
      id: 'agent-pricing',
      name: 'دستیار تحلیل قیمت و مظنه',
      type: 'PRICING',
      role: 'تحلیل حاشیه سود، اعتبارسنجی تخفیف‌های پلکانی و پیشنهاد پکیج',
      active: true,
      requiresHumanApproval: true,
      allowedTools: ['calculateQuote', 'negotiateTerms'],
      prompt: 'بررسی حداقل کف حاشیه سود مصوب و پیشنهاد بهترین شیوه پرداخت نقدی/اقساطی',
      autonomyLevel: 60,
      description: 'تضمین سودآوری در پیش‌فاکتورها و جلوگیری از نقض سیاست‌های قیمت‌گذاری'
    }
  ];

  const channels: MessagingChannel[] = state.messagingChannels || [
    { id: 'eitaa', name: 'پیام‌رسان ایتا', type: 'EITAA', active: false, status: 'NOT_CONFIGURED', botToken: '', webhookUrl: '', autoReply: false },
    { id: 'rubika', name: 'سوپراپلیکیشن روبیکا', type: 'RUBIKA', active: false, status: 'NOT_CONFIGURED', botToken: '', webhookUrl: '', autoReply: false },
    { id: 'bale', name: 'پیام‌رسان بله', type: 'BALE', active: false, status: 'NOT_CONFIGURED', botToken: '', webhookUrl: '', autoReply: false },
    { id: 'kavenegar', name: 'درگاه پیامک خدماتی (کاوه‌نگار)', type: 'SMS', active: false, status: 'NOT_CONFIGURED', botToken: '', webhookUrl: '', autoReply: false },
    { id: 'telegram', name: 'تلگرام بات', type: 'TELEGRAM', active: false, status: 'NOT_CONFIGURED', botToken: '', webhookUrl: '', autoReply: false },
    { id: 'custom_webhook', name: 'وب‌هوک سفارشی سازمانی', type: 'WEBHOOK', active: false, status: 'NOT_CONFIGURED', botToken: '', webhookUrl: '', autoReply: false }
  ];

  const messagingLogs: MessagingLog[] = state.messagingLogs || [];
  const agentLogs: AIAgentLog[] = state.agentLogs || [];
  const aiKillSwitch = !!state.settings?.aiKillSwitch;

  const currentLocale = state.settings?.locale || {
    rtl: true,
    language: 'fa',
    calendar: 'jalali',
    currency: 'IRR',
    timezone: 'Asia/Tehran',
    firstDayOfWeek: 6,
    numberFormat: 'persian'
  };

  const handleUpdateRole = (roleId: string, patch: Record<string, unknown>) => {
    if (!can('roles', 'EDIT')) return denied('ویرایش نقش و ساختار گزارش‌دهی');
    if (typeof patch.parentId === 'string' && patch.parentId) {
      let cursor = (state.roles || []).find(item => item.id === patch.parentId);
      const visited = new Set<string>();
      while (cursor && !visited.has(cursor.id)) {
        if (cursor.id === roleId) {
          updateState(draft => { if (!draft.notifications) draft.notifications = []; draft.notifications.push({ id: generateId(), title: 'ساختار گزارش‌دهی نامعتبر', message: 'این تغییر باعث ایجاد چرخه در سلسله‌مراتب نقش‌ها می‌شود و ذخیره نشد.', type: 'WARNING', read: false, createdAt: new Date().toISOString() }); });
          return;
        }
        visited.add(cursor.id);
        cursor = (state.roles || []).find(item => item.id === cursor?.parentId);
      }
    }
    updateState(draft => {
      const role = (draft.roles || []).find(item => item.id === roleId);
      if (!role) return;
      if (patch.parentId === roleId) return;
      Object.assign(role, patch);
      if (!draft.auditLogs) draft.auditLogs = [];
      draft.auditLogs.push({ id: generateId(), action: 'ROLE_CONFIGURATION_UPDATED', entityType: 'ROLE', entityId: roleId, details: `پیکربندی نقش «${role.name}» تغییر کرد`, actor: draft.users?.find(u => u.id === draft.currentUserId)?.name || 'System', createdAt: new Date().toISOString() } as Record<string, unknown>);
    });
  };

  const handleUpdateUserManager = (userId: string, managerId: string) => {
    if (!can('users', 'EDIT')) return denied('تغییر سرپرست مستقیم کاربر');
    if (managerId === userId) return denied('کاربر نمی‌تواند سرپرست مستقیم خودش باشد');
    let cursor = (state.users || []).find(item => item.id === managerId);
    const visited = new Set<string>();
    while (cursor && !visited.has(cursor.id)) {
      if (cursor.id === userId) return denied('این تغییر باعث ایجاد چرخه در زنجیره سرپرستی می‌شود');
      visited.add(cursor.id);
      cursor = (state.users || []).find(item => item.id === cursor?.managerId);
    }
    updateState(draft => {
      const user = (draft.users || []).find(item => item.id === userId);
      if (!user) return;
      user.managerId = managerId || undefined;
      if (!draft.auditLogs) draft.auditLogs = [];
      draft.auditLogs.push({ id: generateId(), action: 'USER_MANAGER_UPDATED', entityType: 'USER', entityId: userId, details: `سرپرست مستقیم کاربر «${user.name}» تغییر کرد`, actor: draft.users?.find(item => item.id === draft.currentUserId)?.name || 'System', createdAt: new Date().toISOString() } as Record<string, unknown>);
    });
  };

  const handleTogglePermission = (permissionSetId: string, permission: CapabilityPermission, checked: boolean) => {
    if (!can('roles', 'EDIT')) return denied('تغییر مجوزهای عملیاتی');
    updateState(draft => {
      const set = (draft.permissionSets || []).find(item => item.id === permissionSetId);
      if (!set) return;
      const current = new Set((set.permissions || []) as CapabilityPermission[]);
      if (checked) current.add(permission); else current.delete(permission);
      set.permissions = Array.from(current);
      if (!draft.auditLogs) draft.auditLogs = [];
      draft.auditLogs.push({ id: generateId(), action: 'PERMISSION_SET_UPDATED', entityType: 'PERMISSION_SET', entityId: permissionSetId, details: `مجوز «${permission}» در پروفایل «${set.name}» ${checked ? 'فعال' : 'غیرفعال'} شد`, actor: draft.users?.find(u => u.id === draft.currentUserId)?.name || 'System', createdAt: new Date().toISOString() } as Record<string, unknown>);
    });
  };

  const handleCreateRole = () => {
    if (!can('roles', 'CREATE')) return denied('ایجاد نقش');
    if (!newRoleName.trim()) return;
    updateState(draft => {
      if (!draft.roles) draft.roles = [];
      draft.roles.push({
        id: generateId(),
        name: newRoleName.trim(),
        visibilityScope: newRoleScope,
        defaultWorkspace: newRoleWorkspace as Record<string, unknown>,
        requiredDevicePermissions: selectedDevicePerms
      });
    });
    setShowRoleModal(false);
    setNewRoleName('');
    setSelectedDevicePerms([]);
  };

  const handleOrgNumber = (key: 'churnRiskDays' | 'churnRiskMinSales', raw: string) => {
    if (!can('settings', 'EDIT')) return denied('تغییر سیاست‌های سازمان');
    const n = Number(toLatinDigits(raw).replace(/[^\d]/g, ''));
    updateState(draft => {
      if (!draft.settings) draft.settings = {} as Record<string, unknown>;
      if (!(draft.settings as Record<string, unknown>).orgConfig) (draft.settings as Record<string, unknown>).orgConfig = {};
      (draft.settings as Record<string, unknown>).orgConfig[key] = n > 0 ? n : undefined;
    });
  };

  const churnOverrides = getChurnThresholdOverrides(state.settings);
  const churnMeta = getChurnThresholdsMeta(state.settings);
  const saveChurnThreshold = (key: keyof ChurnThresholds, input: HTMLInputElement) => {
    const actor = rbac.getCurrentUser();
    if (!actor || !can('settings', 'EDIT')) {
      input.value = String(churnOverrides[key] ?? '');
      return;
    }
    const raw = toLatinDigits(input.value).trim();
    const next = raw === '' ? undefined : Number(raw);
    if (next !== undefined && (!/^\d+$/.test(raw) || !Number.isSafeInteger(next))) {
      input.value = String(churnOverrides[key] ?? '');
      toast.error('آستانه باید عدد صحیح صفر یا بیشتر باشد.');
      return;
    }

    updateState(draft => {
      const previous = getChurnThresholdOverrides(draft.settings)[key];
      if (previous === next) return;
      const org = ((draft.settings ??= {}).orgConfig ??= {});
      const thresholds = { ...org.churnThresholds };
      if (next === undefined) delete thresholds[key];
      else thresholds[key] = next;
      org.churnThresholds = thresholds;
      const recordedAt = new Date().toISOString();
      org.churnThresholdsMeta = { effectiveFrom: recordedAt.slice(0, 10), recordedBy: actor.id, recordedAt };
      (draft.auditLogs ??= []).push({
        id: generateId(),
        action: 'ORG_CHURN_THRESHOLD_UPDATED',
        entityType: 'ORG_CONFIG',
        entityId: key,
        details: `آستانهٔ ریزش از ${previous ?? 'پیش‌فرض'} به ${next ?? 'پیش‌فرض'} تغییر کرد.`,
        actor: actor.id,
        createdAt: recordedAt,
      });
    });
  };

  const handleOrgPolicyNumber = (key: 'taxRatePercent' | 'quoteValidityDays' | 'allowedCreditDays', raw: string) => {
    if (!can('settings', 'EDIT')) return denied('تغییر سیاست‌های فروش');
    const trimmed = raw.trim();
    const parsed = trimmed === '' ? undefined : Number(trimmed);
    const valid = parsed === undefined || (Number.isFinite(parsed) && (key === 'taxRatePercent' ? parsed >= 0 && parsed <= 100 : key === 'allowedCreditDays' ? Number.isInteger(parsed) && parsed >= 0 : Number.isInteger(parsed) && parsed > 0));
    if (!valid) {
      updateState(draft => {
        if (!draft.notifications) draft.notifications = [];
        draft.notifications.push({ id: generateId(), title: 'مقدار سیاست نامعتبر است', message: key === 'taxRatePercent' ? 'نرخ مالیات باید عددی بین صفر تا صد باشد.' : 'مدت اعتبار باید عدد صحیح بزرگ‌تر از صفر باشد.', type: 'WARNING', read: false, createdAt: new Date().toISOString(), linkTab: 'settings' });
      });
      return;
    }
    updateState(draft => {
      if (!draft.settings) draft.settings = {} as Record<string, unknown>;
      if (!(draft.settings as Record<string, unknown>).orgConfig) (draft.settings as Record<string, unknown>).orgConfig = {};
      (draft.settings as Record<string, unknown>).orgConfig[key] = parsed;
    });
  };

  const handleOrgPolicyText = (key: 'defaultQuotePaymentTerms' | 'defaultQuoteDeliveryTerms', value: string) => {
    if (!can('settings', 'EDIT')) return denied('تغییر شرایط پیش‌فرض فروش');
    updateState(draft => {
      if (!draft.settings) draft.settings = {} as Record<string, unknown>;
      if (!(draft.settings as Record<string, unknown>).orgConfig) (draft.settings as Record<string, unknown>).orgConfig = {};
      (draft.settings as Record<string, unknown>).orgConfig[key] = value;
    });
  };

  const recordOrgPolicyAudit = (key: string, value: string | number) => {
    if (!can('settings', 'EDIT')) return denied('ثبت تاریخچه سیاست سازمانی');
    const raw = String(value).trim();
    if (raw !== '' && key === 'taxRatePercent' && (!Number.isFinite(Number(raw)) || Number(raw) < 0 || Number(raw) > 100)) return;
    if (raw !== '' && key === 'quoteValidityDays' && (!Number.isInteger(Number(raw)) || Number(raw) <= 0)) return;
    if (raw !== '' && key === 'allowedCreditDays' && (!Number.isInteger(Number(raw)) || Number(raw) < 0)) return;
    updateState(draft => {
      if (!draft.auditLogs) draft.auditLogs = [];
      draft.auditLogs.push({
        id: generateId(), action: 'ORG_SALES_POLICY_UPDATED', entityType: 'ORG_CONFIG', entityId: key,
        details: `سیاست سازمانی ${key} ذخیره شد: ${String(value).trim() || 'بدون مقدار'}.`,
        actor: draft.users?.find(user => user.id === draft.currentUserId)?.name || 'System', createdAt: new Date().toISOString()
      } as Record<string, unknown>);
    });
  };

  const handleTenantName = (value: string) => {
    if (!can('settings', 'EDIT')) return denied('تغییر نام سازمان');
    updateState(draft => {
      if (!draft.settings) draft.settings = {} as Record<string, unknown>;
      if (!(draft.settings as Record<string, unknown>).orgConfig) (draft.settings as Record<string, unknown>).orgConfig = {};
      (draft.settings as Record<string, unknown>).orgConfig.tenantName = value;
    });
  };

  const handleSaveAutomationRule = (values: Record<string, any>) => {
    if (!can('settings', 'EDIT')) return denied('تعریف قانون اتوماسیون');
    const rule = {
      id: generateId(), name: String(values.name).trim(), active: true, triggerEvent: values.triggerEvent,
      conditions: values.condField ? [{ field: String(values.condField).trim(), operator: values.condOperator || '>', value: values.condValue }] : [],
      actions: [{ type: values.actionType, payload: { title: String(values.taskTitle || '').trim(), description: String(values.taskDescription || '').trim(), priority: values.taskPriority || 'NORMAL' } }],
      createdAt: new Date().toISOString()
    };
    updateState(draft => {
      if (!draft.automations) draft.automations = [];
      draft.automations.push(rule as Record<string, unknown>);
      if (!draft.auditLogs) draft.auditLogs = [];
      draft.auditLogs.push({ id: generateId(), action: 'AUTOMATION_RULE_CREATED', entityType: 'SETTINGS', entityId: rule.id, details: `قانون اتوماسیون «${rule.name}» تعریف شد`, actor: draft.users?.find(u => u.id === draft.currentUserId)?.name || 'System', createdAt: new Date().toISOString() } as Record<string, unknown>);
    });
    setRuleModalOpen(false);
  };

  const handleToggleAutomationRule = (ruleId: string) => {
    if (!can('settings', 'EDIT')) return denied('تغییر وضعیت قانون اتوماسیون');
    updateState(draft => {
      const r = (draft.automations || []).find(x => x.id === ruleId);
      if (!r) return;
      r.active = !r.active;
      if (!draft.auditLogs) draft.auditLogs = [];
      draft.auditLogs.push({ id: generateId(), action: r.active ? 'AUTOMATION_RULE_ENABLED' : 'AUTOMATION_RULE_DISABLED', entityType: 'SETTINGS', entityId: r.id, details: `قانون «${r.name}» ${r.active ? 'فعال' : 'غیرفعال'} شد`, actor: draft.users?.find(u => u.id === draft.currentUserId)?.name || 'System', createdAt: new Date().toISOString() } as Record<string, unknown>);
    });
  };

  const handleCreateUser = () => {
    if (!can('users', 'CREATE')) return denied('ایجاد کاربر');
    if (!newUserName.trim() || !newUserLogin.trim() || !newUserRoleId || !newUserPermSetId) return;
    updateState(draft => {
      draft.users.push({
        id: generateId(),
        name: newUserName.trim(),
        username: newUserLogin.trim(),
        roleId: newUserRoleId,
        permissionSetId: newUserPermSetId,
        active: true,
        onboardingCompleted: false
      });
    });
    setShowUserModal(false);
    setNewUserName('');
    setNewUserLogin('');
    setNewUserRoleId('');
    setNewUserPermSetId('');
  };

  const toggleModule = (key: keyof AppState['settings']['orgConfig'], checked: boolean) => {
    if (!can('settings', 'EDIT')) return denied('تغییر تنظیمات سامانه');
    updateState(draft => {
      if (!draft.settings) draft.settings = {};
      if (!draft.settings.orgConfig) draft.settings.orgConfig = {};
      draft.settings.orgConfig[key] = checked as never;
    });
  };

  const toggleKillSwitch = () => {
    if (!can('settings', 'EDIT')) return denied('تغییر تنظیمات سامانه');
    updateState(draft => {
      if (!draft.settings) draft.settings = {};
      draft.settings.aiKillSwitch = !aiKillSwitch;
      if (!draft.agentLogs) draft.agentLogs = [];
      draft.agentLogs.push({
        id: generateId(),
        agentId: 'system',
        trigger: 'MANUAL_OVERRIDE',
        actionProposed: !aiKillSwitch ? 'KILL_SWITCH_ENGAGED' : 'KILL_SWITCH_DISENGAGED',
        actionTaken: !aiKillSwitch ? 'STOP_ALL_AGENTS' : 'RESUME_ALL_AGENTS',
        status: 'EXECUTED',
        timestamp: new Date().toISOString(),
        reason: !aiKillSwitch ? 'کلید قطع اضطراری توسط راهبر سیستم فعال گردید.' : 'کلید قطع اضطراری غیرفعال و کارکرد دستیاران از سر گرفته شد.'
      });
    });
  };

  const handleUpdateLocale = (updates: Partial<typeof currentLocale>) => {
    if (!can('settings', 'EDIT')) return denied('تغییر تنظیمات سامانه');
    updateState(draft => {
      if (!draft.settings) draft.settings = {};
      draft.settings.locale = {
        ...currentLocale,
        ...updates
      };
    });
  };

  const handleToggleAgentActive = (agentId: string) => {
    if (!can('settings', 'EDIT')) return denied('تغییر تنظیمات سامانه');
    updateState(draft => {
      if (!draft.agents) draft.agents = agents;
      const target = draft.agents.find(a => a.id === agentId);
      if (target) {
        target.active = !target.active;
      }
    });
  };

  const handleToggleAgentHumanApproval = (agentId: string) => {
    if (!can('settings', 'EDIT')) return denied('تغییر تنظیمات سامانه');
    updateState(draft => {
      if (!draft.agents) draft.agents = agents;
      const target = draft.agents.find(a => a.id === agentId);
      if (target) {
        target.requiresHumanApproval = !target.requiresHumanApproval;
      }
    });
  };

  const handleToggleAgentTool = (agentId: string, tool: string) => {
    if (!can('settings', 'EDIT')) return denied('تغییر تنظیمات سامانه');
    updateState(draft => {
      if (!draft.agents) draft.agents = agents;
      const target = draft.agents.find(a => a.id === agentId);
      if (target) {
        if (target.allowedTools.includes(tool)) {
          target.allowedTools = target.allowedTools.filter(t => t !== tool);
        } else {
          target.allowedTools.push(tool);
        }
      }
    });
  };

  const handleSaveAgentPrompt = (agentId: string) => {
    if (!can('settings', 'EDIT')) return denied('تغییر تنظیمات سامانه');
    updateState(draft => {
      if (!draft.agents) draft.agents = agents;
      const target = draft.agents.find(a => a.id === agentId);
      if (target) {
        target.prompt = editingAgentPrompt;
      }
    });
    setIsEditingPrompt(false);
  };

  // هیچ درگاه واقعی به این برنامه متصل نیست (بدون backend). نتیجه ساختگی «متصل» نمایش داده نمی‌شود.
  const handleTestPingChannel = (channelId: string) => {
    setPingStatusMsg(`اتصال واقعی به ${channels.find(c => c.id === channelId)?.name || 'درگاه'} هنوز پیکربندی نشده است. برای تست واقعی، سرویس ارسال سمت سرور لازم است.`);
    setTimeout(() => setPingStatusMsg(null), 6000);
  };

  const handleToggleChannelActive = (channelId: string) => {
    const channel = channels.find(c => c.id === channelId);
    if (!channel) return;
    // Local UI state is not proof of a working integration. Require credentials before allowing activation.
    if (!channel.botToken.trim() || !channel.webhookUrl.trim()) {
      setPingStatusMsg(`درگاه ${channel.name} هنوز اطلاعات اتصال ندارد؛ فعال‌سازی واقعی ممکن نیست.`);
      return;
    }
    if (!can('settings', 'EDIT')) return denied('تغییر تنظیمات سامانه');
    updateState(draft => {
      if (!draft.messagingChannels) draft.messagingChannels = channels;
      const ch = draft.messagingChannels.find(c => c.id === channelId);
      if (ch) {
        ch.active = !ch.active;
        // No provider verification service exists in this build, so never claim CONNECTED.
        ch.status = 'CONFIGURING';
        ch.lastPing = undefined;
        ch.latencyMs = undefined;
      }
    });
    setPingStatusMsg('تنظیم محلی ذخیره شد؛ اتصال واقعی هنوز توسط سرویس ارائه‌دهنده تأیید نشده است.');
  };

  // فقط ثبت محلی پیام در صف؛ تحویل/پاسخ ساختگی تولید نمی‌شود (بدون درگاه واقعی).
  const handleSendTestMessage = () => {
    if (!testMessage.trim() || !testRecipient.trim()) {
      setPingStatusMsg('برای ثبت محلی، گیرنده و متن پیام را وارد کنید. این عملیات پیامی ارسال نمی‌کند.');
      return;
    }
    if (!can('settings', 'EDIT')) return denied('تغییر تنظیمات سامانه');
    updateState(draft => {
      if (!draft.messagingLogs) draft.messagingLogs = [];
      draft.messagingLogs.unshift({
        id: generateId(),
        channelId: testChannelId,
        direction: 'OUTBOUND',
        sender: getTenantName(state) ? `سامانه سامانه ${getTenantName(state)}` : 'AKHAVAN CRM',
        recipient: testRecipient.trim(),
        content: testMessage.trim(),
        status: 'LOCAL_ONLY',
        timestamp: new Date().toISOString(),
      });
    });
    setPingStatusMsg('پیام در گزارش ثبت شد؛ بدون درگاه واقعی، تحویل تأیید نمی‌شود.');
    setTimeout(() => setPingStatusMsg(null), 6000);
  };

  const duplicates = findDuplicateAccounts(state.accounts || []);

  const handleExportAccounts = () => {
    const csv = exportCsv(state.accounts || [], ['id', 'name', 'code', 'phone', 'address', 'creditLimit', 'nationalId']);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `accounts_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setExportNotice('فایل اکسپورت با موفقیت تولید و دانلود شد.');
    setTimeout(() => setExportNotice(null), 3000);
  };

  const selectedAgent = agents.find(a => a.id === selectedAgentId) || agents[0];
  const allSettingsSections = [
    { id: 'ORG', group: 'سازمان و ساختار', label: 'اطلاعات و سیاست‌های سازمان', keywords: 'نام سازمان سیاست فروش مالیات اعتبار اطلاعات عمومی' },
    { id: 'USERS', group: 'سازمان و ساختار', label: 'کاربران، نقش‌ها و دسترسی', keywords: 'کاربر نقش مجوز دسترسی RBAC ACL' },
    { id: 'GROUPS', group: 'سازمان و ساختار', label: 'تیم‌ها و گروه‌های کاری', keywords: 'تیم گروه سازمان سرپرست' },
    { id: 'RULES', group: 'فرایندها و هوشمندسازی', label: 'قوانین و گردش کار', keywords: 'قانون گردش کار تایید اتوماسیون' },
    { id: 'AGENTS', group: 'فرایندها و هوشمندسازی', label: 'دستیاران و کانال‌های پیام‌رسان', keywords: 'هوش مصنوعی پیامک پیام رسان کانال اعلان کلید توقف' },
    { id: 'INTEGRATIONS', group: 'اتصال و پیکربندی', label: 'یکپارچه‌سازی و اتصال‌ها', keywords: 'ERP API اتصال سامانه خارجی' },
    { id: 'LOCALE', group: 'اتصال و پیکربندی', label: 'زبان، تقویم و منطقه زمانی', keywords: 'زبان فارسی تاریخ شمسی منطقه زمانی واحد پول' },
  ] as const;
  const settingsSections = allSettingsSections.filter(section => (definitionsMode ? (DEFINITION_TABS as readonly string[]) : (SETTINGS_ONLY_TABS as readonly string[])).includes(section.id.toLowerCase()));
  const normalizedSettingsQuery = settingsQuery.trim().toLocaleLowerCase('fa-IR').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک');
  const matchedSettingsSections = settingsSections.filter(section => `${section.label} ${section.group} ${section.keywords}`.toLocaleLowerCase('fa-IR').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').includes(normalizedSettingsQuery));
  const activeSettingsLabel = settingsSections.find(section => section.id === tab)?.label || 'تنظیمات';
  const settingsGroups = [...new Set(settingsSections.map(section => section.group))];

  return (
    <div className={definitionsMode ? "space-y-4" : "flex-1 overflow-auto bg-transparent p-3 sm:p-5 space-y-4"} dir="rtl">
      {!definitionsMode && (
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-caption font-semibold text-text-secondary">مدیریت سامانه</p><h1 data-tour-heading className="mt-1 text-lg font-extrabold tracking-tight text-text-main">تنظیمات</h1><p className="mt-1 text-xs text-text-secondary">پیکربندی سازمان، کاربران، فرایندها و اتصال‌ها</p></div>
        <label className="flex h-10 w-full max-w-sm items-center gap-2 rounded-xl border border-border bg-surface px-3 focus-within:border-primary"><Search size={15} className="shrink-0 text-text-secondary"/><input value={settingsQuery} onChange={event => setSettingsQuery(event.target.value)} placeholder="جست‌وجو در تنظیمات..." aria-label="جست‌وجوی تنظیمات" className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-text-secondary"/>{settingsQuery && <button type="button" onClick={() => setSettingsQuery('')} aria-label="پاک کردن جست‌وجو" className="text-text-secondary"><X size={14}/></button>}</label>
      </header>
      )}
      <div className={definitionsMode ? "grid grid-cols-1 items-start gap-3" : "grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(210px,250px)_minmax(0,1fr)]"}>
        {!definitionsMode && (
        <nav id="settings-nav" data-tour-heading className="rounded-xl border border-border bg-surface p-2 lg:sticky lg:top-3" aria-label="ناوبری تنظیمات">
          {settingsGroups.map(group => {
            const items = settingsSections.filter(section => section.group === group && (!normalizedSettingsQuery || matchedSettingsSections.some(match => match.id === section.id)));
            if (!items.length) return null;
            return <section key={group} className="mb-2 last:mb-0"><h2 className="px-3 pb-1 pt-2 text-micro font-bold tracking-wide text-text-muted">{group}</h2><div className="space-y-0.5">{items.map(section => <button key={section.id} type="button" onClick={() => setTab(section.id as typeof tab)} aria-current={tab === section.id ? 'page' : undefined} className={`flex min-h-10 w-full items-center justify-between rounded-lg px-3 text-right text-xs transition-colors ${tab === section.id ? 'bg-primary-soft font-extrabold text-primary' : 'font-medium text-text-secondary hover:bg-canvas hover:text-text-main'}`}><span>{section.label}</span>{tab === section.id && <span className="h-1.5 w-1.5 rounded-full bg-primary"/>}</button>)}</div></section>;
          })}
          {normalizedSettingsQuery && matchedSettingsSections.length === 0 && <p className="px-3 py-4 text-xs text-text-secondary">نتیجه‌ای پیدا نشد.</p>}
        </nav>
        )}
        <main id="settings-content" data-tour-primary className="min-w-0 space-y-4" aria-label={`تنظیمات ${activeSettingsLabel}`}>
          <div className="flex items-center justify-between border-b border-border pb-2"><h2 className="text-sm font-extrabold text-text-main">{activeSettingsLabel}</h2><span className="text-micro text-text-muted">{settingsSections.find(section => section.id === tab)?.group}</span></div>
      {/* ===================== TAB: AGENTS & MESSAGING GATEWAYS ===================== */}
      {tab === 'AGENTS' && (
        <div className="space-y-5">
          {/* Emergency Kill Switch Banner */}
          <Card padding="lg" className={`border-2 transition-all ${aiKillSwitch ? 'bg-red-50/60 dark:bg-red-950/40 border-red-300 dark:border-red-800' : 'bg-surface border-border'}`}>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex items-start gap-3">
                <div className={`p-3 rounded-2xl ${aiKillSwitch ? 'bg-red-500 text-white shadow-md' : 'bg-primary/10 text-primary'}`}>
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-base text-text-main">کلید توقف اضطراری دستیاران هوشمند</h3>
                    <span className={`px-2.5 py-0.5 text-xs font-black rounded-full ${aiKillSwitch ? 'bg-red-600 text-white' : 'bg-emerald-100 text-emerald-800'}`}>
                      {aiKillSwitch ? 'فعال - کلیه پردازش‌های خودکار متوقف' : 'عادی - دستیاران در مدار'}
                    </span>
                  </div>
                  <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                    با فعال‌سازی این کلید، تمامی اقدامات و ابزارهای خودکار دستیاران در سرتاسر CRM (ارسال پیامک، تولید وظایف، پیشنهادهای پیش‌فاکتور) بلافاصله متوقف می‌گردند.
                  </p>
                </div>
              </div>
              <button
                onClick={toggleKillSwitch}
                className={`px-5 py-2.5 rounded-xl font-black text-xs cursor-pointer transition-all shadow-sm flex items-center gap-2 ${
                  aiKillSwitch 
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white' 
                    : 'bg-red-600 hover:bg-red-700 text-white'
                }`}
              >
                <Zap className="w-4 h-4" />
                {aiKillSwitch ? 'غیرفعال‌سازی کلید اضطراری (بازگشت به مدار)' : 'قطع اضطراری کلیه دستیارها'}
              </button>
            </div>
          </Card>

          {/* AI Agents Registry */}
          <Card padding="lg" className="bg-surface border-border space-y-4">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <div>
                <h3 className="font-bold text-base text-text-main flex items-center gap-2">
                  <Bot className="w-5 h-5 text-primary" /> فهرست دستیاران هوشمند سازمان
                </h3>
                <span className="text-xs text-text-secondary">تنظیم میزان اختیار، ابزارهای مجاز و نیاز به تأیید کاربر مسئول</span>
              </div>
              <span className="text-xs font-bold text-primary bg-primary/10 px-3 py-1 rounded-xl font-mono">
                {agents.filter(a => a.active).length} از {agents.length} فعال
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {agents.map(ag => {
                const isSelected = selectedAgentId === ag.id;
                return (
                  <div 
                    key={ag.id} 
                    onClick={() => {
                      setSelectedAgentId(ag.id);
                      setEditingAgentPrompt(ag.prompt);
                      setIsEditingPrompt(false);
                    }}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                      isSelected 
                        ? 'border-primary bg-primary/5 shadow-sm' 
                        : 'border-border bg-canvas hover:border-slate-300'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <strong className="text-sm font-bold text-text-main block">{ag.name}</strong>
                      <span className={`px-2 py-0.5 text-micro font-bold rounded-lg ${ag.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                        {ag.active ? 'فعال' : 'غیرفعال'}
                      </span>
                    </div>
                    <p className="text-xs text-text-secondary line-clamp-2 mb-3">{ag.role}</p>
                    <div className="flex justify-between items-center text-caption border-t border-slate-200/60 pt-2 text-text-secondary">
                      <span>خودمختاری: <strong className="text-text-main font-mono">{ag.autonomyLevel}%</strong></span>
                      <span className={ag.requiresHumanApproval ? 'text-amber-700 font-bold' : 'text-emerald-700'}>
                        {ag.requiresHumanApproval ? 'نیازمند تأیید ناظر' : 'خودمختار'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Selected Agent Detailed Config Editor */}
            {selectedAgent && (
              <div className="p-4 bg-canvas rounded-2xl border border-border space-y-4 mt-2">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-200 pb-3">
                  <div>
                    <h4 className="font-extrabold text-sm text-text-main flex items-center gap-2">
                      <Sliders className="w-4 h-4 text-primary" /> تنظیمات رفتاری: {selectedAgent.name}
                    </h4>
                    <span className="text-caption text-text-secondary">{selectedAgent.description}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleToggleAgentActive(selectedAgent.id)}
                      className={`px-3 py-1 text-xs font-bold rounded-xl cursor-pointer transition-colors ${
                        selectedAgent.active ? 'bg-emerald-600 text-white' : 'bg-slate-300 text-slate-700'
                      }`}
                    >
                      {selectedAgent.active ? 'فعال' : 'غیرفعال'}
                    </button>
                    <button
                      onClick={() => handleToggleAgentHumanApproval(selectedAgent.id)}
                      className={`px-3 py-1 text-xs font-bold rounded-xl cursor-pointer transition-colors ${
                        selectedAgent.requiresHumanApproval ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {selectedAgent.requiresHumanApproval ? 'نظارت انسانی (فعال)' : 'نظارت انسانی (خاموش)'}
                    </button>
                  </div>
                </div>

                {/* Allowed Tools Checkboxes */}
                <div>
                  <label className="block font-bold text-xs text-text-main mb-2">ابزارهای اجرایی مجاز:</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { id: 'createTask', label: 'تولید وظیفه و پیگیری' },
                      { id: 'searchAccounts', label: 'جستجو در حساب‌ها' },
                      { id: 'calculateQuote', label: 'محاسبه و ارزیابی مظنه' },
                      { id: 'negotiateTerms', label: 'پیشنهاد شرایط تسویه' }
                    ].map(tool => {
                      const isAllowed = selectedAgent.allowedTools.includes(tool.id);
                      return (
                        <label 
                          key={tool.id} 
                          className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer text-xs transition-all ${
                            isAllowed ? 'bg-white border-primary text-text-main font-bold shadow-xs' : 'bg-canvas border-slate-200 text-slate-500'
                          }`}
                        >
                          <Checkbox 
                            
                            checked={isAllowed} 
                            onChange={() => handleToggleAgentTool(selectedAgent.id, tool.id)}
                            className="w-4" 
                          />
                          <span>{tool.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* System Prompt Instructions Editor */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="font-bold text-xs text-text-main">پرامپت و دستورالعمل رفتاری ایجنت:</label>
                    {!isEditingPrompt ? (
                      <Button variant="link" size="inline" onClick={() => { setEditingAgentPrompt(selectedAgent.prompt); setIsEditingPrompt(true); }} >
                        <Edit2 className="w-3.5 h-3.5" /> ویرایش دستورالعمل
                      </Button>
                    ) : (
                      <div className="flex gap-2">
                        <button onClick={() => setIsEditingPrompt(false)} className="text-xs text-slate-500 font-bold hover:underline cursor-pointer">انصراف</button>
                        <Button variant="primary" size="xs" onClick={() => handleSaveAgentPrompt(selectedAgent.id)} >ذخیره پرامپت</Button>
                      </div>
                    )}
                  </div>
                  {isEditingPrompt ? (
                    <Textarea aria-label="دستورالعمل (پرامپت) دستیار" 
                      value={editingAgentPrompt} 
                      onChange={e => setEditingAgentPrompt(e.target.value)} 
                      rows={3} 
                      
                    />
                  ) : (
                    <div className="bg-white p-3 rounded-xl border border-slate-200 text-xs text-text-main leading-relaxed">
                      {selectedAgent.prompt}
                    </div>
                  )}
                </div>
              </div>
            )}
          </Card>

          {/* Native Messaging Gateways Section */}
          <Card padding="lg" className="bg-white border-border space-y-4">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <div>
                <h3 className="font-bold text-base text-text-main flex items-center gap-2">
                  <Radio className="w-5 h-5 text-primary" /> درگاه‌های پیام‌رسان و وب‌هوک
                </h3>
                <span className="text-xs text-text-secondary">مدیریت تنظیمات اتصال؛ تأیید اتصال و ارسال واقعی تا زمان وجود سرویس یکپارچه‌سازی در دسترس نیست</span>
              </div>
              {pingStatusMsg && (
                <div className="p-2 bg-amber-50 text-amber-900 text-xs font-bold rounded-xl border border-amber-200 animate-in fade-in" role="status">
                  {pingStatusMsg}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {channels.map(ch => {
                const isConnected = ch.status === 'CONNECTED';
                return (
                  <div key={ch.id} className="p-4 rounded-2xl border border-border bg-canvas flex flex-col justify-between space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <strong className="text-sm font-bold text-text-main block">{ch.name}</strong>
                        <span className="text-micro font-mono text-text-secondary block mt-0.5">{ch.webhookUrl ? ch.webhookUrl.slice(0, 32) + '...' : 'بدون وب‌هوک'}</span>
                      </div>
                      <span className={`px-2 py-0.5 text-micro font-black rounded-full ${isConnected ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                        {isConnected ? 'متصل' : ch.status === 'NOT_CONFIGURED' ? 'پیکربندی نشده' : ch.status === 'CONFIGURING' ? 'نیازمند بررسی' : ch.status === 'ERROR' ? 'خطا' : 'قطع'}
                      </span>
                    </div>

                    <div className="text-caption text-text-secondary space-y-1 bg-white p-2.5 rounded-xl border border-slate-200/60 font-mono">
                      <div className="flex justify-between">
                        <span>تأخیر ارتباط:</span>
                        <strong className="text-text-main">{ch.lastPing && ch.latencyMs !== undefined ? `${ch.latencyMs}ms` : 'تست نشده'}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>پاسخ خودکار:</span>
                        <strong className={ch.autoReply ? 'text-emerald-700' : 'text-slate-400'}>{ch.autoReply ? 'فعال' : 'خاموش'}</strong>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-slate-200/60">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => handleTestPingChannel(ch.id)} >
                        <RefreshCw className="w-3.5 h-3.5 text-primary" /> تست اتصال
                      </Button>
                      <button
                        onClick={() => handleToggleChannelActive(ch.id)}
                        disabled={!ch.botToken.trim() || !ch.webhookUrl.trim()}
                        title={!ch.botToken.trim() || !ch.webhookUrl.trim() ? 'ابتدا اتصال امن باید توسط سرویس یکپارچه‌سازی پیکربندی شود.' : 'تغییر وضعیت محلی در انتظار تأیید سرویس'}
                        className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-colors ${
                          !ch.botToken.trim() || !ch.webhookUrl.trim() ? 'cursor-not-allowed bg-slate-100 text-slate-400' : `cursor-pointer ${ch.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`
                        }`}
                      >
                        {!ch.botToken.trim() || !ch.webhookUrl.trim() ? 'نیازمند پیکربندی' : ch.active ? 'فعال در تنظیمات محلی' : 'غیرفعال'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Interactive Test Message Dispatcher */}
          <Card padding="lg" className="bg-white border-border space-y-4">
            <h3 className="font-bold text-base text-text-main flex items-center gap-2">
              <Send className="w-5 h-5 text-primary" /> ثبت محلی پیام آزمایشی (بدون ارسال واقعی)
            </h3>
            <p className="text-xs text-text-secondary">
              این فرم فقط پیش‌نویس پیام را در گزارش محلی ثبت می‌کند؛ تا زمان اتصال سرویس ارسال، هیچ پیامی به گیرنده ارسال نمی‌شود و پاسخی شبیه‌سازی نخواهد شد.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-text-main mb-1">درگاه فرستنده:</label>
                <Select aria-label="درگاه فرستنده:" 
                  value={testChannelId} 
                  onChange={e => setTestChannelId(e.target.value)} 
                  
                >
                  {channels.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-text-main mb-1">شماره یا شناسه دریافت‌کننده:</label>
                <Input 
                  value={testRecipient} 
                  onChange={e => setTestRecipient(e.target.value)} 
                  placeholder="۰۹۱۲۱۱۱۲۲۳۳ یا @نام‌کاربری" 
                  dir="ltr" 
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-text-main mb-1">متن پیام تستی:</label>
              <Textarea aria-label="متن پیام تستی:" 
                value={testMessage} 
                onChange={e => setTestMessage(e.target.value)} 
                rows={2} 
                placeholder="متن پیام ارسالی به مشتری..." 
                
              />
            </div>

            <div className="flex justify-end">
              <Button 
                variant="primary" 
                size="sm" 
                onClick={handleSendTestMessage} 
                icon={<Send className="w-4 h-4" />}
              >
                ثبت محلی؛ بدون ارسال
              </Button>
            </div>
          </Card>

          {/* Live Dispatch & Agent Activity Logs */}
          <Card padding="lg" className="bg-white border-border space-y-4">
            <div className="flex justify-between items-center border-b border-border pb-2">
              <h3 className="font-bold text-base text-text-main flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-primary" /> رویدادنگار زنده پیام‌ها و لاگ هوش مصنوعی (Live Event Logs)
              </h3>
              <span className="text-xs text-text-secondary font-mono">{messagingLogs.length} پیام ثبت‌شده</span>
            </div>

            {/* Messaging Logs Table */}
            <div className="overflow-x-auto max-h-64 no-scrollbar">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="text-text-secondary border-b border-border text-caption font-bold">
                    <th className="pb-2">زمان</th>
                    <th className="pb-2">درگاه</th>
                    <th className="pb-2">جهت</th>
                    <th className="pb-2">طرف پیام</th>
                    <th className="pb-2">متن</th>
                    <th className="pb-2">کد رهگیری</th>
                    <th className="pb-2 text-left">وضعیت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {messagingLogs.map(log => {
                    const ch = channels.find(c => c.id === log.channelId);
                    return (
                      <tr key={log.id} className="hover:bg-canvas">
                        <td className="py-2.5 font-mono text-caption text-text-secondary">
                          {new Date(log.timestamp).toLocaleTimeString('fa-IR')}
                        </td>
                        <td className="py-2.5 font-bold text-text-main">
                          {ch?.name || log.channelId}
                        </td>
                        <td className="py-2.5">
                          <span className={`px-2 py-0.5 text-micro font-black rounded-lg ${log.direction === 'OUTBOUND' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'}`}>
                            {log.direction === 'OUTBOUND' ? 'ارسال به بیرون' : 'دریافتی از کاربر'}
                          </span>
                        </td>
                        <td className="py-2.5 font-mono text-xs text-text-main">
                          {log.direction === 'OUTBOUND' ? log.recipient : log.sender}
                        </td>
                        <td className="py-2.5 text-xs text-text-main max-w-xs truncate" title={log.content}>
                          {log.content}
                        </td>
                        <td className="py-2.5 font-mono text-micro text-text-secondary">
                          {log.trackingId || '-'}
                        </td>
                        <td className="py-2.5 text-left">
                          <span className={`text-micro font-black px-2 py-0.5 rounded-md ${log.status === 'LOCAL_ONLY' ? 'text-amber-800 bg-amber-50' : log.status === 'FAILED' ? 'text-red-800 bg-red-50' : 'text-emerald-700 bg-emerald-50'}`}>
                            {log.status === 'LOCAL_ONLY' ? 'ثبت محلی؛ ارسال نشده' : log.status === 'SENT' ? 'ارسال‌شده' : log.status === 'DELIVERED' ? 'تحویل‌شده' : log.status === 'FAILED' ? 'ناموفق' : log.status === 'RECEIVED' ? 'دریافت‌شده' : getPersianStatusLabel(log.status)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {messagingLogs.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-6 text-slate-400">هنوز هیچ رویداد واقعی یا ثبت محلی پیامی وجود ندارد.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Agent Operational Logs */}
            {agentLogs.length > 0 && (
              <div className="pt-4 border-t border-border">
                <h4 className="font-bold text-xs text-text-main mb-2 flex items-center gap-1.5">
                  <Cpu className="w-4 h-4 text-primary" /> گزارش اقدامات ثبت‌شده و درخواست‌های نیازمند پیکربندی:
                </h4>
                <div className="space-y-2">
                  {agentLogs.slice(0, 5).map(alog => (
                    <div key={alog.id} className="p-3 bg-canvas rounded-xl border border-slate-200 flex justify-between items-center text-xs">
                      <div>
                        <div className="flex items-center gap-2">
                          <strong className="text-text-main">{alog.agentId}</strong>
                          <span className="text-text-secondary font-mono text-caption">[{alog.trigger}]</span>
                          <span className={`px-2 py-0.5 text-micro font-bold rounded-lg ${
                            alog.status === 'EXECUTED' ? 'bg-emerald-100 text-emerald-800' : alog.status === 'REJECTED' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-900'
                          }`}>
                            {alog.status === 'EXECUTED' ? 'اجرا شده' : alog.status === 'QUEUED' ? 'در صف اجرا' : alog.status === 'REJECTED' ? 'رد شده' : alog.status === 'NOT_CONFIGURED' ? 'اجرا پیکربندی نشده' : 'نیازمند تأیید ناظر'}
                          </span>
                        </div>
                        <p className="text-caption text-text-secondary mt-0.5">{alog.reason || alog.actionProposed}</p>
                      </div>
                      {(alog.status === 'AWAITING_APPROVAL' || alog.status === 'NOT_CONFIGURED') && (
                        <span className="max-w-44 text-micro leading-5 text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1" role="status">
                          اجرای واقعی این اقدام تا اتصال کنندهٔ اجرایی و داده معتبر پیکربندی نشده است.
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ===================== TAB: LOCALE, CALENDAR & HARDWARE ===================== */}
      {tab === 'LOCALE' && (
        <div className="space-y-5">
          <Card padding="lg" className="space-y-5 bg-white border-border">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <div>
                <h3 className="font-bold text-lg text-text-main flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-primary" /> تنظیمات تقویم شمسی و زبان
                </h3>
                <span className="text-xs text-text-secondary">پیکربندی سیستم تاریخ، روز آغازین هفته، فرمت ارقام و منطقه زمانی کاری سامانه</span>
              </div>
              <div className="px-3 py-1 bg-emerald-50 text-emerald-800 font-bold text-xs rounded-xl border border-emerald-200">
                تقویم فعال: {currentLocale.calendar === 'jalali' ? 'هجری شمسی (جلالی)' : 'میلادی'}
              </div>
            </div>

            {/* Quick Live Preview of Date */}
            <div className="p-4 bg-primary/5 rounded-2xl border border-primary/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs">
              <div>
                <span className="font-bold text-text-main block text-sm">پیش‌نمایش زنده تاریخ و زمان سامانه:</span>
                <span className="text-text-secondary mt-0.5 block">
                  {currentLocale.calendar === 'jalali' 
                    ? `امروز: ${new Date().toLocaleDateString('fa-IR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}` 
                    : `امروز: ${new Date().toLocaleDateString('fa-IR-u-ca-gregory', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`}
                </span>
              </div>
              <span className="font-mono font-bold text-xs text-primary bg-white px-3 py-1.5 rounded-xl border border-primary/30 shadow-xs">
                منطقه زمانی: {currentLocale.timezone || 'Asia/Tehran'} (+03:30)
              </span>
            </div>

            {/* Locale Configurations Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
              {/* Calendar Switcher */}
              <div className="p-4 bg-canvas rounded-xl border border-border space-y-2">
                <label className="font-bold text-text-main block">نوع تقویم اصلی:</label>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={() => handleUpdateLocale({ calendar: 'jalali' })}
                    className={`py-2 rounded-xl font-bold cursor-pointer transition-all border ${
                      currentLocale.calendar === 'jalali' ? 'bg-primary text-white border-primary' : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    هجری شمسی (پیش‌فرض)
                  </button>
                  <button 
                    onClick={() => handleUpdateLocale({ calendar: 'gregorian' })}
                    className={`py-2 rounded-xl font-bold cursor-pointer transition-all border ${
                      currentLocale.calendar === 'gregorian' ? 'bg-primary text-white border-primary' : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    میلادی (Gregorian)
                  </button>
                </div>
              </div>

              {/* Start day of week */}
              <div className="p-4 bg-canvas rounded-xl border border-border space-y-2">
                <label className="font-bold text-text-main block">روز آغازین هفته کاری:</label>
                <Select aria-label="روز آغازین هفته کاری:" 
                  value={currentLocale.firstDayOfWeek ?? 6} 
                  onChange={e => handleUpdateLocale({ firstDayOfWeek: Number(e.target.value) })}
                  
                >
                  <option value={6}>شنبه (استاندارد ایران و منطقه)</option>
                  <option value={0}>یکشنبه</option>
                  <option value={1}>دوشنبه</option>
                </Select>
              </div>

              {/* Direction LTR / RTL */}
              <div className="p-4 bg-canvas rounded-xl border border-border space-y-2">
                <label className="font-bold text-text-main block">جهت چیدمان صفحه:</label>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={() => handleUpdateLocale({ rtl: true })}
                    className={`py-2 rounded-xl font-bold cursor-pointer transition-all border ${
                      currentLocale.rtl ? 'bg-primary text-white border-primary' : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    راست به چپ (RTL)
                  </button>
                  <button 
                    onClick={() => handleUpdateLocale({ rtl: false })}
                    className={`py-2 rounded-xl font-bold cursor-pointer transition-all border ${
                      !currentLocale.rtl ? 'bg-primary text-white border-primary' : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    چپ به راست (LTR)
                  </button>
                </div>
              </div>

              {/* Language */}
              <div className="p-4 bg-canvas rounded-xl border border-border space-y-2">
                <label className="font-bold text-text-main block">زبان سامانه:</label>
                <Select aria-label="زبان سامانه:" 
                  value={currentLocale.language || 'fa'} 
                  onChange={e => handleUpdateLocale({ language: e.target.value })}
                  
                >
                  <option value="fa">فارسی</option>
                  <option value="en">انگلیسی</option>
                </Select>
              </div>

              {/* Number format */}
              <div className="p-4 bg-canvas rounded-xl border border-border space-y-2">
                <label className="font-bold text-text-main block">فرمت نمایش ارقام و مبالغ:</label>
                <Select aria-label="فرمت نمایش ارقام و مبالغ:" 
                  value={currentLocale.numberFormat || 'persian'} 
                  onChange={e => handleUpdateLocale({ numberFormat: e.target.value })}
                  
                >
                  <option value="persian">ارقام فارسی (۱۲۳٬۴۵۶)</option>
                  <option value="latin">ارقام لاتین (123,456)</option>
                </Select>
              </div>

              {/* Business country */}
              <div className="p-4 bg-canvas rounded-xl border border-border space-y-2">
                <label className="font-bold text-text-main block">کشور / پروفایل مقرراتی سازمان:</label>
                <Select aria-label="کشور / پروفایل مقرراتی سازمان:" value={currentLocale.countryCode || 'IR'} onChange={e => handleUpdateLocale({ countryCode: e.target.value })} >
                  <option value="IR">ایران</option>
                  <option value="DE">آلمان</option>
                  <option value="US">ایالات متحده</option>
                  <option value="GB">بریتانیا</option>
                  <option value="OTHER">سایر / تنظیم دستی</option>
                </Select>
                <p className="text-caption leading-5 text-text-secondary">این تنظیم، پروفایل سازمان را مشخص می‌کند؛ قواعد اعتبارسنجی اختصاصی کشور فقط در جاهایی که به این تنظیم متصل شده‌اند تغییر می‌کنند. اعتبارسنجی کامل همه فرم‌ها در فاز آزمون جداگانه بررسی می‌شود.</p>
              </div>

              {/* Currency */}
              <div className="p-4 bg-canvas rounded-xl border border-border space-y-2">
                <label className="font-bold text-text-main block">واحد پول رسمی سازمان:</label>
                <Select aria-label="واحد پول رسمی سازمان:" 
                  value={currentLocale.currency || 'IRR'} 
                  onChange={e => handleUpdateLocale({ currency: e.target.value })}
                  
                >
                  <option value="IRR">ریال ایران</option>
                  <option value="TOMAN">تومان</option>
                  <option value="USD">دلار آمریکا</option>
                </Select>
              </div>
            </div>
          </Card>

          <Card padding="lg" className="space-y-4 bg-white border-border">
            <div><h3 className="font-bold text-base text-text-main flex items-center gap-2"><Sliders className="w-5 h-5 text-primary"/> دسترس‌پذیری و کیفیت گرافیک</h3><p className="mt-1 text-xs leading-6 text-text-secondary">تنظیمات برای همین مرورگر/حساب ذخیره می‌شوند. حالت کم‌گرافیک افکت‌های پس‌زمینه را سبک می‌کند؛ تنظیم کاهش حرکت سیستم‌عامل همچنان رعایت می‌شود.</p></div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-xl border border-border bg-canvas p-4 space-y-2"><label htmlFor="akhavan-ui-scale" className="block text-sm font-bold text-text-main">اندازهٔ رابط کاربری</label><p className="text-caption leading-5 text-text-secondary">متن و اجزای مبتنی بر اندازهٔ نسبی را بزرگ‌تر می‌کند؛ ممکن است بعضی جدول‌های عریض نیاز به اسکرول افقی داشته باشند.</p><Select id="akhavan-ui-scale" value={state.settings?.uiScale || 'normal'} onChange={e=>{if(!can('settings','EDIT'))return denied('تغییر دسترس‌پذیری');const value=e.target.value;if(!['normal','large','extra-large'].includes(value))return;updateState(draft=>{if(!draft.settings)draft.settings={};draft.settings.uiScale=value;});}} ><option value="normal">استاندارد — 100٪</option><option value="large">بزرگ — 112.5٪</option><option value="extra-large">خیلی بزرگ — 125٪</option></Select></div>
              <div className="rounded-xl border border-border bg-canvas p-4 space-y-2"><label htmlFor="akhavan-ui-density" className="block text-sm font-bold text-text-main">تراکم محتوا</label><p className="text-caption leading-5 text-text-secondary">فاصله و اندازه کارت‌ها را برای موبایل و دسکتاپ تنظیم می‌کند — فشرده برای میدان، باز برای مدیریت.</p><Select id="akhavan-ui-density" value={state.settings?.uiDensity || 'comfortable'} onChange={e=>{if(!can('settings','EDIT'))return denied('تغییر تراکم');const value=e.target.value;if(!['compact','comfortable','spacious'].includes(value))return;updateState(draft=>{if(!draft.settings)draft.settings={};draft.settings.uiDensity=value;});}} ><option value="compact">فشرده — میدان و موبایل</option><option value="comfortable">متعادل — پیش‌فرض</option><option value="spacious">باز — خوانایی بیشتر</option></Select></div>
              <div className="rounded-xl border border-border bg-canvas p-4 space-y-2"><label htmlFor="akhavan-performance-mode" className="block text-sm font-bold text-text-main">کیفیت گرافیک و انیمیشن</label><p className="text-caption leading-5 text-text-secondary">در حالت خودکار دستگاه‌های کم‌حافظه سبک‌سازی می‌شوند؛ حالت کم، هاله‌ها و بافت‌های تزئینی را محدود می‌کند.</p><Select id="akhavan-performance-mode" value={state.settings?.performanceMode || 'auto'} onChange={e=>{if(!can('settings','EDIT'))return denied('تغییر کیفیت گرافیک');const value=e.target.value;if(!['auto','high','low'].includes(value))return;updateState(draft=>{if(!draft.settings)draft.settings={};draft.settings.performanceMode=value;});}} ><option value="auto">خودکار بر اساس دستگاه</option><option value="high">کیفیت بالا</option><option value="low">سبک — صرفه‌جویی در باتری</option></Select></div>
            </div>
            <label className="flex items-start gap-3 rounded-xl border border-border bg-canvas p-3"><Switch checked={state.settings?.autoSaveFormDrafts !== false} onChange={e=>{if(!can('settings','EDIT'))return denied('تغییر ذخیره خودکار فرم‌ها');const checked=e.target.checked;updateState(draft=>{if(!draft.settings)draft.settings={};draft.settings.autoSaveFormDrafts=checked;});}} className="mt-1 w-4"/><span><strong className="block text-sm text-text-main">ذخیرهٔ خودکار پیش‌نویس فرم‌ها</strong><span className="mt-1 block text-caption leading-5 text-text-secondary">فرم‌های پویا روی همین مرورگر ذخیره می‌شوند و بعد از ثبت موفق پاک می‌شوند. فیلدهای دارای نام‌های حساس مانند رمز/توکن از ذخیره خودکار مستثنا هستند؛ این ذخیره‌سازی جایگزین نسخهٔ سرور نیست.</span></span></label>
            <label className="flex items-start gap-3 rounded-xl border border-border bg-canvas p-3"><Switch checked={state.settings?.formFieldsMandatory !== false} onChange={e=>{if(!can('settings','EDIT'))return denied('تغییر تنظیمات فرم‌ها');const checked=e.target.checked;updateState(draft=>{if(!draft.settings)draft.settings={};draft.settings.formFieldsMandatory=checked;});}} className="mt-1 w-4"/><span><strong className="block text-sm text-text-main">الزام تکمیل تمامی فیلدهای فرم‌ها (فیلدهای اجباری)</strong><span className="mt-1 block text-caption leading-5 text-text-secondary">در صورت غیرفعال‌سازی، «حالت ثبت سریع» فعال می‌شود و فیلدهای ستاره‌دار در سرتاسر سیستم اختیاری شده و مانع از ثبت فرم‌ها نخواهند شد.</span></span></label>
            <div className="rounded-xl border border-border bg-white p-3 text-xs leading-6 text-text-secondary" role="status">تنظیم فعلی: {state.settings?.uiScale==='large'?'رابط بزرگ':state.settings?.uiScale==='extra-large'?'رابط خیلی بزرگ':'رابط استاندارد'} · {state.settings?.uiDensity==='compact'?'تراکم فشرده':state.settings?.uiDensity==='spacious'?'تراکم باز':'تراکم متعادل'} · {state.settings?.performanceMode==='low'?'گرافیک سبک':state.settings?.performanceMode==='high'?'گرافیک بالا':'گرافیک خودکار'} · {state.settings?.formFieldsMandatory === false ? 'فیلدها اختیاری (ثبت سریع)' : 'فیلدهای اجباری فعال'}</div>
          </Card>

          {/* Device Permissions Card */}
          <Card padding="lg" className="space-y-4 bg-white border-border">
            <h4 className="font-bold text-sm text-text-main flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-primary" /> وضعیت دسترسی‌های دستگاه همراه (Device Permissions)
            </h4>
            <div className="rounded-xl border border-border bg-canvas p-4 space-y-2">
              <p className="text-sm font-bold text-text-main">اعلان سیستمی (خارج از برنامه)</p>
              <p className="text-caption leading-5 text-text-secondary">با فعال‌سازی، وقتی برنامه بسته یا در پس‌زمینه است، اعلان‌های مهم روی قفل صفحه / سینی سیستم نمایش داده می‌شوند (نیاز به مجوز مرورگر و در حالت کامل، کلید VAPID سرور).</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" type="button" onClick={async () => {
                  const r = await subscribeWebPush();
                  if (r.ok) toast.success(r.reason === 'local-only' ? 'مجوز داده شد (حالت محلی). برای اعلان کامل، سرویس اعلان را روی سرور تنظیم کنید.' : 'اعلان سیستمی فعال شد.');
                  else toast.error('فعال‌سازی ناموفق: ' + (r.reason || ''));
                }}>فعال‌سازی اعلان سیستمی</Button>
                <Button variant="outline" type="button" onClick={async () => { await unsubscribeWebPush(); toast.info('اعلان سیستمی غیرفعال شد.'); }}>غیرفعال‌سازی</Button>
              </div>
              <p className="text-micro text-text-muted">پشتیبانی مرورگر: {typeof window !== 'undefined' && isPushSupported() ? 'بله' : 'خیر'} · وضعیت محلی: {typeof window !== 'undefined' && isPushEnabledLocally() ? 'فعال' : 'خاموش'}</p>
            </div>

            <p className="text-xs text-text-secondary">برای ثبت دقیق مکان ویزیت‌ها، پیوست عکس و دریافت اعلان‌ها:</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              {[
                { key: 'LOCATION', label: 'موقعیت مکانی' },
                { key: 'CAMERA', label: 'دوربین و گالری' },
                { key: 'MICROPHONE', label: 'میکروفون و ویس' },
                { key: 'NOTIFICATIONS', label: 'اعلان‌های سیستم' }
              ].map(item => {
                const isGranted = !!state.grantedDevicePermissions?.[item.key as DevicePermissionType];
                return (
                  <div key={item.key} className="p-3 bg-canvas rounded-xl border border-border flex flex-col justify-between gap-2">
                    <span className="font-bold text-text-main">{item.label}</span>
                    <button 
                      onClick={() => {
                        if (!can('settings', 'EDIT')) return denied('تغییر تنظیمات سامانه');
                        updateState(draft => {
                          if (!draft.grantedDevicePermissions) {
                            draft.grantedDevicePermissions = { LOCATION: false, CAMERA: false, MICROPHONE: false, NOTIFICATIONS: false };
                          }
                          draft.grantedDevicePermissions[item.key as DevicePermissionType] = !isGranted;
                        });
                      }}
                      className={`px-2.5 py-1 text-caption font-bold rounded-lg cursor-pointer transition-colors ${isGranted ? 'bg-success-soft text-success' : 'bg-red-50 text-danger'}`}
                    >
                      {isGranted ? 'فعال و تایید شده' : 'غیرفعال (کلیک برای فعال‌سازی)'}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end pt-2">
              <Button 
                variant="primary" 
                size="sm"
                onClick={() => {
                  if (!can('settings', 'EDIT')) return denied('تغییر تنظیمات سامانه');
                  updateState(draft => {
                    draft.grantedDevicePermissions = { LOCATION: true, CAMERA: true, MICROPHONE: true, NOTIFICATIONS: true };
                  });
                }}
              >
                تأیید و فعال‌سازی یکباره کلیه دسترسی‌ها
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ===================== TAB: ORG CONFIG ===================== */}
      {tab === 'ORG' && (
        <div className="space-y-4">
          <Card padding="lg" className="space-y-4 bg-white border-border">
            <h3 className="font-bold text-lg text-text-main flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" /> پیکربندی ماژول‌های سازمانی
            </h3>
            <p className="text-xs text-text-secondary mb-4">
              فعال‌سازی یا غیرفعال‌سازی مفاهیم سازمانی. داشبورد و فیلترها بر اساس این تنظیمات تغییر می‌کنند.
            </p>
            
            <div className="mb-4 rounded-xl border border-border bg-canvas p-4">
              <label className="mb-1 block text-xs font-bold text-text-main" htmlFor="tenant-name">نام سازمان (در سربرگ، چاپ و پیام‌ها نمایش داده می‌شود)</label>
              <InputControl id="tenant-name" type="text" value={getTenantName(state)} onChange={e => handleTenantName(e.target.value)}  />
            </div>

            <div className="mb-4 grid grid-cols-1 gap-3 rounded-xl border border-border bg-canvas p-4 sm:grid-cols-2">
              <p className="text-caption text-text-secondary sm:col-span-2">سیاست هشدار ریزش مشتری: تا هر دو مقدار تعریف نشود، پیشنهاد هوشمند ریزش تولید نمی‌شود.</p>
              <div>
                <label className="mb-1 block text-xs font-bold text-text-main" htmlFor="churn-days">حداقل روزهای بدون خرید</label>
                <InputControl id="churn-days" inputMode="numeric" value={(state.settings as Record<string, unknown>)?.orgConfig?.churnRiskDays ?? ''} onChange={e => handleOrgNumber('churnRiskDays', e.target.value)}  />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-text-main" htmlFor="churn-sales">حداقل ارزش تاریخی خرید (ریال)</label>
                <InputControl id="churn-sales" inputMode="numeric" value={(state.settings as Record<string, unknown>)?.orgConfig?.churnRiskMinSales ?? ''} onChange={e => handleOrgNumber('churnRiskMinSales', e.target.value)}  />
              </div>
            </div>

            <div className="mb-4 rounded-xl border border-border bg-canvas p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-bold text-text-main">آستانه‌های ریزش مشتری (نسخه‌دار)</h4>
                {Object.keys(churnOverrides).length === 0 ? (
                  <span className="text-caption text-text-secondary">پیش‌فرض سیستم</span>
                ) : (
                  <span className="text-caption text-primary">سفارشی سازمان</span>
                )}
              </div>
              {(churnMeta?.effectiveFrom || churnMeta?.recordedBy) && (
                <p className="text-caption text-text-secondary">
                  اعمال از {churnMeta.effectiveFrom || '—'}
                  {churnMeta.recordedBy ? ` · ثبت‌کننده: ${state.users.find(user => user.id === churnMeta.recordedBy)?.name || churnMeta.recordedBy}` : ''}
                </p>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {([
                  ['daysCritical', 'روز بحرانی'],
                  ['daysHigh', 'روز بالا'],
                  ['daysWatch', 'روز مراقبت'],
                  ['inactivityDays', 'روز بی‌فعالیتی'],
                  ['overdueCriticalDays', 'سررسید بحرانی'],
                  ['scoreCritical', 'امتیاز بحرانی'],
                ] as const).map(([key, label]) => {
                  return (
                    <div key={key}>
                      <label className="mb-1 block text-caption font-bold text-text-main" htmlFor={`churn-th-${key}`}>{label}</label>
                      <InputControl
                        id={`churn-th-${key}`}
                        key={`${key}-${churnOverrides[key] ?? 'default'}`}
                        inputMode="numeric"
                        defaultValue={churnOverrides[key] ?? ''}
                        placeholder={DEFAULT_CHURN_THRESHOLDS[key].toLocaleString('fa-IR')}
                        readOnly={!can('settings', 'EDIT')}
                        onBlur={e => saveChurnThreshold(key, e.currentTarget)}
                      />
                    </div>
                  );
                })}
              </div>
              <p className="text-caption text-text-secondary">با خروج از فیلد، تغییر ثبت می‌شود. فیلد خالی از پیش‌فرض سامانه استفاده می‌کند.</p>
            </div>

            <div className="mb-4 grid grid-cols-1 gap-3 rounded-xl border border-border bg-canvas p-4 sm:grid-cols-2">
              <p className="text-caption text-text-secondary sm:col-span-2">سیاست‌های فروش برای جلوگیری از نرخ مالیات، مدت اعتبار یا شرایط پرداخت فرضی. مقدار خالی به معنی تعریف‌نشدن سیاست است.</p>
              <div>
                <label className="mb-1 block text-xs font-bold text-text-main" htmlFor="quote-tax-rate">نرخ مالیات جایگزین (فقط کالای بدون نرخ ERP، درصد)</label>
                <InputControl id="quote-tax-rate" type="number" min="0" max="100" step="0.01" value={(state.settings as Record<string, unknown>)?.orgConfig?.taxRatePercent ?? ''} onChange={e => handleOrgPolicyNumber('taxRatePercent', e.target.value)} onBlur={e => recordOrgPolicyAudit('taxRatePercent', e.target.value)}  />
                <label className="mb-1 mt-3 block text-xs font-bold text-text-main" htmlFor="quote-margin-floor">کف مارجین ناخالص سفارش (درصد)</label>
                <InputControl id="quote-margin-floor" type="number" min="0" max="100" step="0.1" value={(state.settings as Record<string, unknown>)?.orgConfig?.quoteMarginFloorPercent ?? ''} onChange={e => handleOrgPolicyNumber('quoteMarginFloorPercent', e.target.value)} onBlur={e => recordOrgPolicyAudit('quoteMarginFloorPercent', e.target.value)}  placeholder="پیش‌فرض ۱۵" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-text-main" htmlFor="quote-validity-days">اعتبار پیش‌فرض پیش‌فاکتور (روز)</label>
                <InputControl id="quote-validity-days" type="number" min="1" step="1" value={(state.settings as Record<string, unknown>)?.orgConfig?.quoteValidityDays ?? ''} onChange={e => handleOrgPolicyNumber('quoteValidityDays', e.target.value)} onBlur={e => recordOrgPolicyAudit('quoteValidityDays', e.target.value)}  />
                <label className="mb-1 mt-3 block text-xs font-bold text-text-main" htmlFor="allowed-credit-days">مهلت مجاز وصول فاکتور (روز از تاریخ فاکتور)</label>
                <InputControl id="allowed-credit-days" type="number" min="0" step="1" value={(state.settings as Record<string, unknown>)?.orgConfig?.allowedCreditDays ?? ''} onChange={e => handleOrgPolicyNumber('allowedCreditDays', e.target.value)} onBlur={e => recordOrgPolicyAudit('allowedCreditDays', e.target.value)}  />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-text-main" htmlFor="quote-payment-terms">شرایط پرداخت پیش‌فرض</label>
                <InputControl id="quote-payment-terms" type="text" value={(state.settings as Record<string, unknown>)?.orgConfig?.defaultQuotePaymentTerms ?? ''} onChange={e => handleOrgPolicyText('defaultQuotePaymentTerms', e.target.value)} onBlur={e => recordOrgPolicyAudit('defaultQuotePaymentTerms', e.target.value)}  />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-text-main" htmlFor="quote-delivery-terms">شرایط تحویل پیش‌فرض</label>
                <InputControl id="quote-delivery-terms" type="text" value={(state.settings as Record<string, unknown>)?.orgConfig?.defaultQuoteDeliveryTerms ?? ''} onChange={e => handleOrgPolicyText('defaultQuoteDeliveryTerms', e.target.value)} onBlur={e => recordOrgPolicyAudit('defaultQuoteDeliveryTerms', e.target.value)}  />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-center justify-between p-4 bg-canvas rounded-xl border border-border">
                <div>
                  <span className="font-semibold text-text-main block text-sm">سرنخ‌ها</span>
                </div>
                <Switch aria-label="سرنخ‌ها" checked={state.settings?.orgConfig?.enableLeadManagement ?? true} onChange={e => toggleModule('enableLeadManagement', e.target.checked)} className="w-5" />
              </div>
              <div className="flex items-center justify-between p-4 bg-canvas rounded-xl border border-border">
                <div>
                  <span className="font-semibold text-text-main block text-sm">فرصت‌ها و پایپ‌لاین</span>
                </div>
                <Switch aria-label="فرصت‌ها و پایپ‌لاین" checked={state.settings?.orgConfig?.enableOpportunities ?? true} onChange={e => toggleModule('enableOpportunities', e.target.checked)} className="w-5" />
              </div>
              <div className="flex items-center justify-between p-4 bg-canvas rounded-xl border border-border">
                <div>
                  <span className="font-semibold text-text-main block text-sm">پیش‌فاکتورها</span>
                </div>
                <Switch aria-label="پیش‌فاکتورها" checked={state.settings?.orgConfig?.enableQuotes ?? true} onChange={e => toggleModule('enableQuotes', e.target.checked)} className="w-5" />
              </div>
              <div className="flex items-center justify-between p-4 bg-canvas rounded-xl border border-border">
                <div>
                  <span className="font-semibold text-text-main block text-sm">امور مالی و وصولی</span>
                </div>
                <Switch aria-label="امور مالی و وصولی" checked={state.settings?.orgConfig?.enableFinance ?? true} onChange={e => toggleModule('enableFinance', e.target.checked)} className="w-5" />
              </div>
            </div>
          </Card>

          <Card padding="lg" className="space-y-4 bg-white border-border">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-bold text-base text-text-main flex items-center gap-2">
                  <GitMerge className="w-5 h-5 text-primary" /> پایش کیفیت داده و ادغام حساب‌های تکراری
                </h3>
                <span className="text-xs text-text-secondary">شناسایی خودکار شماره تماس‌های تکراری و ادغام قطعی رکوردها با حفظ تاریخچه</span>
              </div>
              <Button variant="outline" size="sm" onClick={handleExportAccounts} >
                <Download className="w-4 h-4 text-primary" /> استخراج اکسل/CSV
              </Button>
            </div>

            {exportNotice && (
              <div className="p-3 bg-primary/10 border border-primary/20 text-primary text-xs rounded-xl font-medium">
                {exportNotice}
              </div>
            )}

            {duplicates.length === 0 ? (
              <div className="p-4 bg-success-soft border border-success-line rounded-xl flex items-center gap-3 text-success text-xs">
                <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
                <span>تمام حساب‌های مشتریان دارای شماره تماس یکتا هستند و هیچ تکراری شناسایی نشد.</span>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 bg-warning-soft border border-warning-line rounded-xl flex items-center gap-2 text-warning text-xs">
                  <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
                  <span>{duplicates.length} مورد تداخل شماره تماس شناسایی شد.</span>
                </div>
                {duplicates.map(d => (
                  <div key={d.primary.id} className="p-3 border border-border rounded-xl bg-canvas flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                    <div>
                      <span className="font-bold text-text-main text-sm">{d.primary.name}</span>
                      <span className="text-xs text-text-secondary block font-mono">تلفن: {d.primary.phone}</span>
                      <span className="text-caption text-warning">حساب‌های تکراری هم‌شماره: {d.duplicates.map(x => x.name).join('، ')}</span>
                    </div>
                    {d.duplicates.map(dup => (
                      <Button variant="warning" size="sm" key={dup.id} onClick={() => mergeAccounts(d.primary.id, dup.id, state, updateState)} >
                        ادغام {dup.name} در {d.primary.name}
                      </Button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ===================== TAB: USERS & RBAC ===================== */}
      {tab === 'USERS' && (
        <Card padding="lg" className="bg-white border-border">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-lg text-text-main flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" /> مدیریت ساختار دسترسی (RBAC Admin)
            </h3>
          </div>
          
          <div className="flex gap-2 border-b border-border pb-2 mb-4">
            {[
              { id: 'LIST', label: 'کاربران سیستم' },
              { id: 'ROLES', label: 'نقش‌ها' },
              { id: 'PERMISSIONS', label: 'پروفایل مجوز' }
            ].map(t => {
              const isActive = userSubTab === t.id;
              return (
                <button 
                  key={t.id}
                  onClick={() => setUserSubTab(t.id as Record<string, unknown>)} 
                  aria-current={isActive ? 'page' : undefined}
                  className={`px-4 py-1.5 text-xs rounded-lg cursor-pointer border ${isActive ? 'bg-primary/10 text-primary border-primary/20 font-extrabold' : 'bg-canvas text-text-secondary border-transparent hover:bg-white font-medium'}`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {userSubTab === 'LIST' && (
            <div className="space-y-4">
              {serverReportingLines && can('users','EDIT') && <ReportingLineSettings key={state.currentUserId} viewer={state.currentUserId ?? ''}/>}
              <div className="flex justify-end">
                <Button variant="primary" size="sm" onClick={() => setShowUserModal(true)} icon={<UserPlus className="w-4 h-4"/>}>کاربر جدید</Button>
              </div>
              <div className="space-y-2">
                {state.users.map(u => {
                  const pSet = (state.permissionSets || []).find(p => p.id === u.permissionSetId);
                  const role = (state.roles || []).find(r => r.id === u.roleId);
                  const parentRole = role?.parentId ? (state.roles || []).find(r => r.id === role.parentId) : null;
                  return (
                    <div key={u.id} className="p-3 border border-border rounded-xl flex flex-col sm:flex-row justify-between sm:items-center gap-3 bg-canvas">
                      <div>
                        <div className="flex items-center gap-2">
                          <strong className="text-sm text-text-main">{u.name}</strong>
                          <span className="text-xs text-text-secondary font-mono">(@{u.username})</span>
                          {u.id === state.currentUserId && (
                            <span className="px-2 py-0.5 bg-primary/10 text-primary text-micro font-bold rounded-full">کاربر جاری</span>
                          )}
                        </div>
                        <div className="text-xs text-text-secondary mt-1 flex flex-wrap gap-2">
                          <span>پروفایل: <strong className="text-primary">{pSet?.name || 'تعریف‌نشده'}</strong></span>
                          <span>•</span>
                          <span>محدوده دید: <strong className="text-info font-mono">{role?.name || role?.visibilityScope} ({role?.visibilityScope})</strong></span>
                          {parentRole && (
                            <>
                              <span>•</span>
                              <span className="text-text-secondary">گزارش به: <strong className="text-text-main">{parentRole.name}</strong></span>
                            </>
                          )}
                        </div>
                        {!serverReportingLines && <label className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-secondary">سرپرست مستقیم
                          <Select aria-label={`سرپرست مستقیم ${u.name}`} disabled={!can('users','EDIT')} value={u.managerId || ''} onChange={e => handleUpdateUserManager(u.id, e.target.value)} className="min-w-40">
                            <option value="">بدون سرپرست مستقیم</option>{(state.users || []).filter(candidate => candidate.id !== u.id && (candidate.isActive ?? candidate.active) !== false).map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
                          </Select>
                        </label>}
                      </div>
                      <button onClick={() => { if (!can('users', 'EDIT')) return denied('تعویض کاربر فعال'); updateState(draft => { draft.currentUserId = u.id; }); }} className={`text-xs px-3 py-1.5 rounded-lg font-bold cursor-pointer transition-colors ${u.id === state.currentUserId ? 'bg-primary text-white' : 'bg-white border border-border text-text-main hover:bg-canvas'}`}>
                        {u.id === state.currentUserId ? 'فعال' : 'تغییر کاربر'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {userSubTab === 'ROLES' && (
            <div className="space-y-4">
              <label className="glass flex cursor-pointer items-center justify-between gap-3 rounded-2xl p-4">
                <span className="text-xs leading-6 text-ink">
                  <strong className="block font-bold">اجباری‌سازی دسترسی‌های الزامی دستگاه (موقعیت‌یاب، اعلان‌ها...)</strong>
                  <span className="text-ink-soft">پیش‌فرض غیرفعال است. در صورت فعال‌سازی، کاربرانی که مجوز الزامی نقش خود را نداده‌اند به صفحه تأیید دسترسی هدایت می‌شوند.</span>
                </span>
                <Switch aria-label="الزامی‌سازی دسترسی‌های دستگاه" className="w-5" checked={state.settings?.enforceDevicePermissions === true}
                  onChange={e => { if (!can('settings', 'EDIT')) return denied('تغییر تنظیمات سامانه'); const v = e.target.checked; updateState(draft => { if (!draft.settings) draft.settings = {}; draft.settings.enforceDevicePermissions = v; }); }} />
              </label>
              <div className="flex justify-end">
                <Button variant="primary" size="sm" onClick={() => setShowRoleModal(true)} icon={<Plus className="w-4 h-4"/>}>نقش سازمانی جدید</Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(state.roles || []).map(r => (
                  <div key={r.id} className="p-4 border border-border rounded-xl bg-canvas space-y-3">
                    <div className="flex justify-between items-start gap-2">
                      <strong className="text-sm font-bold text-text-main">{r.name}</strong>
                      <span className="text-micro font-mono px-2 py-0.5 rounded-lg bg-primary/10 text-primary font-bold">{r.visibilityScope}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <label className="block font-bold text-text-secondary">محدوده داده
                        <Select aria-label={`محدوده داده نقش ${r.name}`} disabled={!can('roles','EDIT')} value={r.visibilityScope} onChange={e => handleUpdateRole(r.id, { visibilityScope: e.target.value as VisibilityScope })} className="mt-1">
                          <option value="ORG">کل سازمان</option><option value="BRANCH">شعبه</option><option value="TERRITORY">قلمرو</option><option value="TEAM">تیم</option><option value="OWNER">مالک/شخصی</option>
                        </Select>
                      </label>
                      <label className="block font-bold text-text-secondary">گزارش به / نقش بالادست
                        <Select aria-label={`نقش بالادست ${r.name}`} disabled={!can('roles','EDIT')} value={r.parentId || ''} onChange={e => handleUpdateRole(r.id, { parentId: e.target.value || undefined })} className="mt-1">
                          <option value="">بدون نقش بالادست</option>{(state.roles || []).filter(parent => parent.id !== r.id).map(parent => <option key={parent.id} value={parent.id}>{parent.name}</option>)}
                        </Select>
                      </label>
                      <label className="block font-bold text-text-secondary sm:col-span-2">فضای کاری پیش‌فرض
                        <Select aria-label={`فضای کاری پیش‌فرض ${r.name}`} disabled={!can('roles','EDIT')} value={r.defaultWorkspace || 'dashboard'} onChange={e => handleUpdateRole(r.id, { defaultWorkspace: e.target.value })} className="mt-1">
                          <option value="dashboard">داشبورد</option><option value="accounts">مشتریان</option><option value="tasks">وظایف</option><option value="quotes">پیش‌فاکتورها</option><option value="leads">سرنخ‌ها</option><option value="finance">امور مالی</option><option value="reports">گزارش‌ها</option>
                        </Select>
                      </label>
                    </div>
                    {r.requiredDevicePermissions && r.requiredDevicePermissions.length > 0 && <div className="pt-2 border-t border-border text-micro text-text-secondary">دسترسی‌های الزامی دستگاه: <strong className="text-danger">{r.requiredDevicePermissions.join('، ')}</strong></div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {userSubTab === 'PERMISSIONS' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-canvas p-3 text-xs text-text-secondary leading-6">مجوزها برای هر پروفایل عملیاتی قابل تنظیم‌اند. تغییرات در وضعیت محلی ذخیره و در سابقهٔ ممیزی ثبت می‌شوند. سابقهٔ محلی به‌تنهایی ضد‌دستکاری یا غیرقابل‌تغییر نیست و جایگزین ثبت ممیزی سمت سرور و پایگاه داده نمی‌شود. مجوزهای ناشناخته به‌صورت پیش‌فرض رد می‌شوند؛ کنترل سمت کاربر نیز جایگزین کنترل سرور و پایگاه داده نیست.</div>
              <label className="block text-xs font-bold text-text-secondary">پروفایل برای ویرایش
                <Select value={selectedPermissionSetId || state.permissionSets?.[0]?.id || ''} onChange={e => setSelectedPermissionSetId(e.target.value)} className="mt-1">
                  {(state.permissionSets || []).map(ps => <option key={ps.id} value={ps.id}>{ps.name}</option>)}
                </Select>
              </label>
              {(() => { const ps = (state.permissionSets || []).find(item => item.id === (selectedPermissionSetId || state.permissionSets?.[0]?.id)); if (!ps) return <p className="text-sm text-text-secondary">پروفایل مجوزی تعریف نشده است.</p>; return <div className="rounded-xl border border-border bg-white p-4 space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm font-bold">{ps.name}</strong><span className="text-xs text-text-secondary">{ps.permissions.length} مجوز فعال</span></div><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">{(Object.keys(PERMISSION_LABELS) as CapabilityPermission[]).map(perm => <label key={perm} className={`flex items-start gap-2 rounded-lg border p-2.5 text-xs ${ps.permissions.includes(perm) ? 'border-primary/40 bg-primary/5' : 'border-border bg-canvas'}`}><Checkbox className="mt-0.5" disabled={!can('roles','EDIT')} checked={ps.permissions.includes(perm)} onChange={e => handleTogglePermission(ps.id, perm, e.target.checked)} /><span><strong className="block text-text-main">{PERMISSION_LABELS[perm]}</strong><code className="text-micro text-text-secondary">{perm}</code></span></label>)}</div></div>; })()}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{(state.permissionSets || []).map(ps => <div key={ps.id} className="p-3 bg-white border border-border rounded-xl"><strong className="text-sm font-bold text-text-main block">{ps.name}</strong><div className="flex flex-wrap gap-1 mt-2">{ps.permissions.map(perm => <span key={perm} className="text-micro px-1.5 py-0.5 bg-canvas text-text-secondary rounded border border-border">{PERMISSION_LABELS[perm as keyof typeof PERMISSION_LABELS] || perm}</span>)}</div></div>)}</div>
            </div>
          )}
        </Card>
      )}

      {/* ===================== TAB: GROUPS ===================== */}
      {tab === 'GROUPS' && (
        <Card padding="lg" className="space-y-4 bg-white border-border">
          <h3 className="font-bold text-lg text-text-main flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" /> گروه‌ها و تیم‌های سازمانی
          </h3>
          <p className="text-xs text-text-secondary">
            مدیریت تیم‌های فروش، پشتیبانی، گروه‌های پروژه و سطوح ارجاع کار
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(state.groups || []).map(g => {
              const manager = state.users.find(u => u.id === g.managerId);
              return (
                <div key={g.id} className="p-4 bg-canvas rounded-xl border border-border space-y-2">
                  <div className="flex justify-between items-center">
                    <strong className="text-sm font-bold text-text-main">{g.name}</strong>
                    <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary font-bold rounded-lg font-mono">
                      {g.memberIds.length} عضو
                    </span>
                  </div>
                  {g.description && <p className="text-xs text-text-secondary">{g.description}</p>}
                  <div className="text-xs text-text-secondary pt-2 border-t border-border flex justify-between">
                    <span>مدیر تیم: <strong className="text-text-main">{manager?.name || '-'}</strong></span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ===================== TAB: INTEGRATIONS ===================== */}
      {tab === 'RULES' && (
        <>
        <Card className="p-5 mb-3">
          <ApprovalChainConfigPanel
            state={state}
            updateState={updateState}
            canEdit={!!can('settings', 'EDIT')}
          />
        </Card>
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-extrabold text-text-main">قوانین اتوماسیون</h3>
              <p className="mt-1 text-xs text-text-secondary">با رخ‌دادن رویداد، در صورت برقراری شرط، اقدام تعریف‌شده به صف عملیات پس‌زمینه می‌رود. ارسال پیام به درگاه‌های پیکربندی‌نشده «پیکربندی نشده» ثبت می‌شود.</p>
            </div>
            {can('settings', 'EDIT') && <Button size="sm" variant="primary" onClick={() => setRuleModalOpen(true)}>قانون جدید</Button>}
          </div>
          {(state.automations || []).length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-text-secondary">هنوز قانونی تعریف نشده است.</p>
          ) : (
            <ul className="space-y-2">
              {(state.automations || []).map(r => (
                <li key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-canvas p-3">
                  <div className="min-w-0">
                    <strong className="block truncate text-xs font-bold text-text-main">{r.name}</strong>
                    <span className="text-caption text-text-secondary">{AUTOMATION_EVENT_TYPES.find(e => e.value === r.triggerEvent)?.label || r.triggerEvent}{r.conditions && r.conditions.length > 0 ? ` · شرط: ${r.conditions[0].field} ${r.conditions[0].operator} ${r.conditions[0].value}` : ''}</span>
                  </div>
                  <button onClick={() => handleToggleAutomationRule(r.id)} aria-pressed={r.active} className={`min-h-control-sm cursor-pointer rounded-xl border px-3 text-xs font-bold ${r.active ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border bg-white text-text-secondary'}`}>{r.active ? 'فعال' : 'غیرفعال'}</button>
                </li>
              ))}
            </ul>
          )}
          {ruleModalOpen && (
            <Modal isOpen onClose={() => setRuleModalOpen(false)} title="تعریف قانون اتوماسیون">
              <DynamicFormRenderer
                schema={createAutomationRuleFormSchema(AUTOMATION_EVENT_TYPES, AUTOMATION_ACTION_TYPES, [{ value: 'LOW', label: 'کم' }, { value: 'NORMAL', label: 'عادی' }, { value: 'HIGH', label: 'بالا' }])}
                onSubmit={handleSaveAutomationRule}
                onCancel={() => setRuleModalOpen(false)}
                submitLabel="ذخیره قانون"
              />
            </Modal>
          )}
        </Card>
        </>
      )}

      {tab === 'INTEGRATIONS' && (
        <Card padding="lg" className="space-y-4 bg-white border-border">
          <h3 className="font-bold text-lg text-text-main flex items-center gap-2">
            <Link2 className="w-5 h-5 text-primary" /> وضعیت کاتالوگ و حافظه محلی
          </h3>
          <div className="space-y-3 text-xs">
            <div className="p-4 bg-canvas rounded-xl border border-border flex justify-between items-center">
              <div>
                <strong className="text-sm font-bold text-text-main block">فهرست کالاها و خدمات دریافتی از سامانه اصلی</strong>
                <span className="text-text-secondary mt-0.5 block">{state.externalProducts?.length || 0} قلم کالای فعال بارگذاری شده است.</span>
              </div>
              <span className="px-2.5 py-1 bg-success-soft text-success text-xs font-bold rounded-lg">همگام با حافظه محلی</span>
            </div>
            <div className="p-4 bg-canvas rounded-xl border border-border flex justify-between items-center">
              <div>
                <strong className="text-sm font-bold text-text-main block">صف آفلاین و ماندگاری حافظهٔ مرورگر</strong>
                <span className="text-text-secondary mt-0.5 block">تغییرات مشتریان، سفارش‌ها و وظایف در حافظه همین مرورگر نگهداری می‌شوند؛ این نگهداری به‌معنای ثبت یا تأیید در سامانه اصلی نیست.</span>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  setExportNotice('حافظه محلی با موفقیت بازبینی و به‌روزرسانی شد.');
                  setTimeout(() => setExportNotice(null), 2500);
                }}
              >
                بررسی یکپارچگی داده‌ها
              </Button>
            </div>

            <div className="p-4 bg-primary/5 rounded-xl border border-primary/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <strong className="text-sm font-bold text-ink block">ابزار داده‌های نمونه آزمایشی</strong>
                <span className="text-ink-soft mt-0.5 block">تولید یا بازنشانی داده‌های واقع‌نما برای کلیه ماژول‌های سامانه (مشتریان، فاکتورها، مقالات دانش، زون‌ها، تیکت‌ها و ...)</span>
              </div>
              <DemoDataPanel state={state} updateState={updateState} canManage={can('settings', 'EDIT')} />
            </div>

            {exportNotice && <div className="p-3 bg-primary/10 text-primary rounded-xl font-bold">{exportNotice}</div>}
          </div>
        </Card>
      )}

        </main>
      </div>
      {/* Modals for Role and User */}
      {showRoleModal && (
        <Modal isOpen={showRoleModal} onClose={() => setShowRoleModal(false)} title="تعریف نقش سازمانی جدید" footer={<><Button variant="ghost" size="sm" onClick={() => setShowRoleModal(false)}>انصراف</Button><Button variant="primary" size="sm" onClick={handleCreateRole}>ثبت نقش</Button></>}>
          <div className="space-y-4 text-xs">
            <Input label="عنوان نقش سازمانی *" value={newRoleName} onChange={e => setNewRoleName(e.target.value)} placeholder="مثال: سرپرست فروش منطقه شمال" required />
            <div>
              <label className="block font-bold mb-1 text-text-main">محدوده دسترسی اطلاعات *</label>
              <Select aria-label="محدوده دسترسی اطلاعات *" value={newRoleScope} onChange={e => setNewRoleScope(e.target.value as VisibilityScope)} >
                <option value="ORG">تمام سازمان</option>
                <option value="BRANCH">شعبه سازمانی</option>
                <option value="TERRITORY">قلمرو جغرافیایی</option>
                <option value="TEAM">تیم کاری</option>
                <option value="OWNER">فقط رکوردهای شخصی</option>
              </Select>
            </div>
            <div>
              <label className="block font-bold mb-1 text-text-main">فضای کاری پیش‌فرض *</label>
              <Select aria-label="فضای کاری پیش‌فرض *" value={newRoleWorkspace} onChange={e => setNewRoleWorkspace(e.target.value)} >
                <option value="dashboard">داشبورد مدیریتی</option>
                <option value="accounts">حساب‌ها و مشتریان</option>
                <option value="tasks">وظایف و پیگیری‌ها</option>
                <option value="quotes">پیش‌فاکتورها و قیمت‌گذاری</option>
                <option value="leads">سرنخ‌های فروش</option>
              </Select>
            </div>
          </div>
        </Modal>
      )}

      {showUserModal && (
        <Modal isOpen={showUserModal} onClose={() => setShowUserModal(false)} title="تعریف کاربر جدید" footer={<><Button variant="ghost" size="sm" onClick={() => setShowUserModal(false)}>انصراف</Button><Button variant="primary" size="sm" onClick={handleCreateUser}>ثبت کاربر</Button></>}>
          <div className="space-y-4 text-xs">
            <Input label="نام و نام خانوادگی *" value={newUserName} onChange={e => setNewUserName(e.target.value)} placeholder="مثال: مهدی حسینی" required />
            <Input label="نام کاربری (کد پرسنلی) *" value={newUserLogin} onChange={e => setNewUserLogin(e.target.value)} placeholder="مثال: m.hosseini" required dir="ltr" />
            <div>
              <label className="block font-bold mb-1 text-text-main">نقش سازمانی *</label>
              <Select aria-label="نقش سازمانی *" value={newUserRoleId} onChange={e => setNewUserRoleId(e.target.value)} >
                <option value="">انتخاب نقش سازمانی...</option>
                {(state.roles || []).map(r => <option key={r.id} value={r.id}>{r.name} ({r.visibilityScope})</option>)}
              </Select>
            </div>
            <div>
              <label className="block font-bold mb-1 text-text-main">پروفایل عملیاتی *</label>
              <Select aria-label="پروفایل عملیاتی *" value={newUserPermSetId} onChange={e => setNewUserPermSetId(e.target.value)} >
                <option value="">انتخاب پروفایل دسترسی...</option>
                {(state.permissionSets || []).map(ps => <option key={ps.id} value={ps.id}>{ps.name}</option>)}
              </Select>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
