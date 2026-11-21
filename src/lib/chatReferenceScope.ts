import type { AppState } from '../types';
import { RBACService, type PermModule, type RecordScope } from './rbac';

type LinkRecord = RecordScope & {
  id?: string;
  accountId?: string;
  customerId?: string;
  assignedTo?: string;
  assigneeId?: string;
  assigneeType?: string;
  createdBy?: string;
  requestedBy?: string;
  name?: string;
  title?: string;
  subject?: string;
  number?: string;
  quoteNumber?: string;
  invoiceNumber?: string;
  requestNumber?: string;
  chequeNumber?: string;
  code?: string;
  sku?: string;
  erpId?: string;
  erpCode?: string;
};

const access = {
  CUSTOMER: { field: 'accounts', permission: 'accounts', label: 'مشتری' },
  TASK: { field: 'tasks', permission: 'tasks', label: 'وظیفه' },
  QUOTE: { field: 'quotes', permission: 'quotes', label: 'پیش‌فاکتور' },
  OPPORTUNITY: { field: 'opportunities', permission: 'opportunities', label: 'فرصت فروش' },
  CASE: { field: 'cases', permission: 'cases', label: 'پرونده' },
  REQUEST: { field: 'internalRequests', permission: 'internal', label: 'درخواست' },
  CHECK: { field: 'cheques', permission: 'finance', label: 'چک' },
  INVOICE: { field: 'invoices', permission: 'finance', label: 'فاکتور' },
  PRODUCT: { field: 'externalProducts', permission: null, label: 'کالا' },
  WAREHOUSE: { field: 'warehouses', permission: null, label: 'انبار' },
  STAFF: { field: 'users', permission: null, label: 'همکار' },
} as const satisfies Record<string, { field: string; permission: PermModule | null; label: string }>;

export function buildChatReferenceScope(state: AppState, viewer: RBACService) {
  const source = state as Record<string, unknown>;
  const accountById = new Map((state.accounts ?? []).map(account => [account.id, account]));
  const user = viewer.getCurrentUser();
  const scoped: Record<string, unknown> = { ...source };
  const visibleByType = new Map<string, Map<string, { label: string; record: LinkRecord }>>();

  for (const [type, rule] of Object.entries(access)) {
    const collection = type === 'REQUEST' ? source.requests ?? source.internalRequests : source[rule.field];
    const rows = Array.isArray(collection) ? collection as LinkRecord[] : [];
    const visible = rows.filter(record => {
      if (!user || !record || record.isDeleted || record.deletedAt) return false;
      if (type === 'STAFF') return record.id === user.id || viewer.hasPermission('users.manage');
      if (!rule.permission) return viewer.canAccessWorkspace('operations_control');
      const accountId = record.accountId || record.customerId;
      const account = accountId ? accountById.get(accountId) : undefined;
      const ownerId = record.ownerId || (type === 'TASK' && record.assigneeType !== 'GROUP' ? record.assigneeId || record.assignedTo : undefined)
        || record.createdBy || record.requestedBy || account?.ownerId;
      return viewer.canActOnRecord(rule.permission, 'VIEW', {
        ownerId, branchId: record.branchId || account?.branchId,
        territoryId: record.territoryId || account?.territoryId, teamId: record.teamId || account?.teamId,
        tenantId: record.tenantId || account?.tenantId,
      });
    });
    scoped[rule.field] = visible;
    const identifiers = new Map<string, { label: string; record: LinkRecord }>();
    for (const record of visible) {
      const identifier = record.id || record.code || record.erpId || record.erpCode || record.number;
      if (identifier) identifiers.set(identifier, { label: rule.label, record });
    }
    visibleByType.set(type, identifiers);
  }
  // Prevent alternate collections from bypassing the scoped request pool in mentionEngine.
  scoped.requests = scoped.internalRequests;
  const get = (type: string, id: string) => visibleByType.get(type === 'ACCOUNT' ? 'CUSTOMER' : type)?.get(id);
  return { state: scoped as unknown as AppState, get };
}
