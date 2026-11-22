/**
 * AKHAVAN CRM — ERP boundary contracts.
 *
 * These are transport contracts only. They do not imply a live ERP connection.
 * Identity fields follow the SQL Server mirror/import model:
 * (TenantId, SourceSystemCode, ExternalId), with source timestamps used for stale-update checks.
 */

export type ERPSourceSystemCode = string;

export interface ERPRecordIdentity {
  tenantId: string;
  sourceSystemCode: ERPSourceSystemCode;
  externalId: string;
  sourceModifiedAtUtc?: string;
}

export interface ERPImportRecord extends ERPRecordIdentity {
  /** Optional aliases accepted from existing ERP adapters during normalization. */
  externalOrderId?: string;
  externalInvoiceId?: string;
  [key: string]: unknown;
}

export interface ERPCustomerMirrorContract extends ERPImportRecord {
  externalAccountId?: string;
  accountCode?: string;
  name: string;
  economicCode?: string | null;
  nationalId?: string | null;
  creditLimit?: number | null;
  balance?: number | null;
  salesRepExternalId?: string | null;
  territoryExternalId?: string | null;
  isActive: boolean;
  isDeleted: boolean;
}

export interface ERPSalesOrderContract extends ERPImportRecord {
  entityType?: 'SALES_ORDER';
  externalOrderId?: string;
  orderNumber?: string;
  externalAccountId?: string;
  orderDate?: string;
  currencyCode?: string;
  netAmount?: number;
  statusCode?: string;
  isVoided?: boolean;
  lines?: Array<{
    externalProductId?: string;
    quantity: number;
    unitPrice: number;
    netLineAmount: number;
  }>;
}

export interface ERPInvoiceMirrorContract extends ERPImportRecord {
  entityType?: 'INVOICE';
  externalInvoiceId?: string;
  externalAccountId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string | null;
  currencyCode: string;
  netAmount: number;
  grossAmount: number;
  statusCode: string;
  isVoided: boolean;
  salesRepExternalId?: string;
  lines?: Array<{
    externalInvoiceLineId: string;
    externalProductId?: string | null;
    quantity: number;
    netUnitPrice: number;
    netLineAmount: number;
    costAmount?: number | null;
  }>;
}

export interface ERPPaymentMirrorContract extends ERPRecordIdentity {
  externalAccountId?: string | null;
  paymentDate: string;
  amount: number;
  currencyCode: string;
  methodCode: string;
  statusCode: string;
  isVoided: boolean;
  referenceNumber?: string | null;
}

export interface ERPDispatchPlanReadContract extends ERPRecordIdentity {
  planNumber: string;
  planDate: string;
  vehicleExternalId: string;
  driverExternalId: string;
  zoneExternalId?: string | null;
  capacityKg?: number | null;
  plannedWeightKg?: number | null;
  statusCode: 'DRAFT' | 'READY' | 'LOADING' | 'DISPATCHED' | 'COMPLETED' | 'CANCELLED' | string;
  lines: Array<{
    externalInvoiceId: string;
    stopSequence: number;
    plannedWeightKg?: number | null;
    deliveryStatusCode: 'PLANNED' | 'LOADED' | 'DISPATCHED' | 'DELIVERED' | 'PARTIAL' | 'FAILED' | 'RETURNED' | string;
  }>;
}

export interface ERPReturnReadContract extends ERPRecordIdentity {
  externalAccountId: string;
  externalInvoiceId?: string | null;
  returnNumber: string;
  returnDate: string;
  totalValue: number;
  currencyCode: string;
  reasonCode: string;
  statusCode: string;
  isVoided: boolean;
}

/** ERP owns route definitions and daily visit tours. CRM treats both as read-only mirrors. */
export interface ERPVisitRouteReadContract extends ERPRecordIdentity {
  entityType?: 'VISIT_ROUTE';
  routeCode: string;
  routeName: string;
  territoryExternalId?: string | null;
  assignedSalesRepExternalId?: string | null;
  statusCode?: string;
  isDeleted?: boolean;
}

export interface ERPVisitTourReadContract extends ERPRecordIdentity {
  entityType?: 'VISIT_TOUR';
  tourDate: string;
  routeExternalId: string;
  salesRepExternalId: string;
  statusCode?: string;
  isDeleted?: boolean;
  stops: Array<{
    externalCustomerId: string;
    stopSequence: number;
    /** A visit outcome is a separate actual event, never implied by the plan. */
  }>;
}

/** A successful sync timestamp is local integration metadata, not an ERP-authored field. */
export interface ERPSyncReceipt {
  tenantId: string;
  sourceSystemCode: ERPSourceSystemCode;
  entityType: 'SALES_ORDER' | 'INVOICE' | 'PAYMENT' | 'DISPATCH' | 'RETURN';
  externalId: string;
  syncedAtUtc: string;
  outcome: 'INSERTED' | 'UPDATED' | 'SKIPPED_STALE' | 'CONFLICT';
}

/** Validates the composite identity required to safely merge an ERP-owned record. */
export function isValidERPIdentity(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  const required = ['tenantId', 'sourceSystemCode', 'entityType', 'externalId'];
  return required.every((key) => typeof record[key] === 'string' && String(record[key]).trim().length > 0);
}

/** Missing timestamps are allowed for legacy feeds; supplied timestamps must be parseable. */
export function isValidERPSourceTimestamp(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  if (typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Date)) return false;
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(timestamp);
}
