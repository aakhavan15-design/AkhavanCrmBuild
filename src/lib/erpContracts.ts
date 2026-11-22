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
  businessCategoryCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  geoAccuracyMeters?: number | null;
  geoSourceCode?: 'ERP' | 'GPS' | 'MANUAL' | null;
  isActive: boolean;
  isDeleted: boolean;
}

/** Extra route-map dimensions are official ERP master fields, not guesses from name. */
export interface ERPProductRouteDimensionsContract extends ERPImportRecord {
  entityType?: 'PRODUCT';
  productName: string;
  supplierExternalId?: string | null;
  brandExternalId?: string | null;
  isActive?: boolean;
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
  tourCode?: string;
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

/** Customer may belong to several routes; each membership is ERP-owned and effective-dated. */
export interface ERPVisitRouteCustomerContract extends ERPRecordIdentity {
  routeExternalId: string;
  externalCustomerId: string;
  subRouteCode?: string | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
  isDeleted?: boolean;
}
/** One route can have several representatives and supervisors. */
export interface ERPVisitRouteStaffContract extends ERPRecordIdentity {
  routeExternalId: string;
  externalStaffId: string;
  staffRoleCode: 'SALES_REP' | 'SUPERVISOR';
  effectiveFrom: string;
  effectiveTo?: string | null;
  isDeleted?: boolean;
}
export interface ERPVisitNoOrderReasonContract extends ERPRecordIdentity {
  reasonCode: string;
  reasonTitleFa: string;
  isActive?: boolean;
}
export interface ERPVisitEventContract extends ERPRecordIdentity {
  externalCustomerId: string;
  externalSalesRepId: string;
  visitedAtUtc: string;
  externalTourId?: string | null;
  outcomeCode?: string | null;
  noOrderReasonCode?: string | null;
  resultingExternalOrderId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  accuracyMeters?: number | null;
  isDeleted?: boolean;
}
export interface ERPRepGpsLogContract extends ERPRecordIdentity {
  externalSalesRepId: string;
  recordedAtUtc: string;
  latitude: number;
  longitude: number;
  accuracyMeters?: number | null;
  isDeleted?: boolean;
}

/** A successful sync timestamp is local integration metadata, not an ERP-authored field. */
export interface ERPSyncReceipt {
  tenantId: string;
  sourceSystemCode: ERPSourceSystemCode;
  entityType: 'SALES_ORDER' | 'INVOICE' | 'PAYMENT' | 'DISPATCH' | 'RETURN' | 'VISIT_ROUTE' | 'VISIT_TOUR';
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
