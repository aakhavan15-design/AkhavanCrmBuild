import type { ReportingLine, ReportingLineChange, TaskRequestApprovalPolicy, TaskRequestCommand, TaskRequestFile, TaskRequestInput, TaskRequestPolicyKind,
  TaskRequestRecord, TaskRequestPage, TaskRequestView, TaskRequestResource } from './taskRequests';
import type { PurchaseCoverageScope, PurchaseCycleAudience, PurchaseCycleResult, PurchaseCycleView, PurchaseProductResult } from './purchaseCycle';
import type { AdvanceAccountingInput, AdvanceAccountingRow, AdvanceAccountingStage, AdvanceDecisionInput, EmploymentProfile, EmploymentStatusInput, OwnPersonnelProfile, PersonnelAdvanceInput, PersonnelAdvanceReceipt } from './personnelProfile';
import type { RecruitmentReviewInput, RecruitmentReviewRow } from './recruitmentReview';
import type { LearningActionInput, LearningAssignmentInput, LearningCatalog, LearningCourseInput, LearningDetail, LearningPage } from './personnelLearning';
import type { 
  AppState, 
  Account, 
  Quote, QuoteDecisionAction,
  Task, 
  Invoice, 
  Payment, 
  PaymentAllocation,
  Cheque, 
  InternalRequest, 
  Payslip, 
  PayrollRun,
  AdvanceRequest,
  GeoZone,
  ZoneAssignment,
  CoaMirror
} from '../types';
import { useAppStore } from '../lib/storage';
import { executePayrollRun as computePayrollRun } from './payrollEngine';
import { AuthService } from './AuthService';
import type { StateSnapshot, StateSyncResult } from './stateSync';
import { RBACService } from '../lib/rbac';
import { hashRecord, policyOf, splitState } from '../lib/stateModel.mjs';
import stateRegistry from '../config/stateCollections.json' with { type: 'json' };
import {
  buildApprovalContext, buildFinancial360, resolveAccountingMapping, recordApprovalSnapshot, stateFromSnapshot,
  type ApprovalContext, type ApprovalRef, type ApprovalSnapshot, type ClassificationInput, type ContextOptions, type FinancialContext, type MappingResolution, type SubjectRef
} from '../lib/financialIntelligence';
import { withViewer } from '../lib/financialAccess';
import { queryJournalLines, buildDetailBalancesResult, type JournalLineFilter, type JournalLinePage, type DetailBalancesResult, type LedgerResultStatus } from '../lib/receivableReconciliation';
import { journalQueryParams } from '../lib/ledgerQueryParams.mjs';
import { readCustomerProposalReceipt, type CustomerProposalReceipt } from '../lib/customerProposal';
import { applyTaskWorkflow, type TaskWorkflowInput } from './taskWorkflow';
import type { LedgerBalanceOptions, LedgerBookFilter, LedgerBookPage, LedgerBookSource } from './officialLedger';
import type { JournalCoverageFilter, JournalCoveragePage, JournalFollowUpEvidence, JournalOperation, MoneyEvidenceFilter, MoneyEvidencePage, MoneyPeriod, MoneyReport } from './moneyIntelligence';

export type TaskWorkflowCommand = Omit<TaskWorkflowInput, 'actorId' | 'at'> & { version: string };
export interface TaskWorkflowRecord { task: Task; version: string }

export interface CreditNoteEvidenceRow {
  id: string;
  externalId: string;
  sourceSystemCode: string;
  issuedOn: string;
  status: 'POSTED' | 'APPROVED';
  evidence: 'LINKED' | 'INVOICE_MISSING' | 'ACCOUNT_MISSING' | 'ACCOUNT_MISMATCH' | 'SOURCE_MISMATCH' | 'INVOICE_VOID';
  invoiceNumber: string | null;
}

export interface CreditNoteEvidence {
  status: 'AVAILABLE' | 'EMPTY' | 'UNAVAILABLE' | 'RESTRICTED';
  items: CreditNoteEvidenceRow[];
  hasMore: boolean;
}

export interface FifoValuationRow {
  runId: string;
  sourceSystemCode: string;
  productId: string;
  warehouseId: string;
  unitCode: string;
  currencyCode: string;
  periodStart: string;
  through: string;
  method: string;
  quantity: string;
  amount: string;
}

export interface FifoValuations {
  status: 'AVAILABLE' | 'EMPTY' | 'UNAVAILABLE' | 'RESTRICTED';
  items: FifoValuationRow[];
  hasMore: boolean;
}

export interface FifoLayerRow {
  layerNo: number;
  consumptionNo?: number;
  returned?: string;
  totalCost?: string;
  layerDocumentId?: string;
  documentId: string;
  lineId: string;
  effectiveAt: string;
  kind: string;
  quantity: string;
  remaining?: string;
  unitCost?: string;
  originConsumptionNo?: number | null;
}

export interface FifoLayerPage {
  status: FifoValuations['status'];
  items: FifoLayerRow[];
  next: number | null;
}

export interface FifoSaleEvidence {
  status: FifoValuations['status'];
  coverage: 'UNVERIFIED';
  items: Array<{
    runId: string;
    through: string;
    productId: string;
    unitCode: string;
    currencyCode: string;
    lineId: string;
    movementId: string;
    consumptionNo: number;
    layerNo: number;
    warehouseId: string;
    quantity: string;
    returned: string;
    unitCost: string;
    originalCost: string;
  }>;
  hasMore: boolean;
}

export interface InvoiceFifoRow {
  lineId: string;
  productId: string | null;
  name: string;
  unit: string | null;
  quantity: string;
  revenue: string;
  coverage: 'MATCHED' | 'UNMAPPED_LINE' | 'NO_CONSUMPTION' | 'OVERLAP' | 'QUANTITY_MISMATCH' | 'RETURN_REVIEW' | 'COST_UNAVAILABLE';
  cost: string | null;
  grossProfit: string | null;
  through: string | null;
}
export interface InvoiceFifoEvidence {
  status: 'AVAILABLE' | 'EMPTY' | 'UNMAPPED' | 'AMBIGUOUS' | 'RESTRICTED' | 'UNAVAILABLE';
  invoice?: { id: string; number: string; date: string; currency: string; source: string; accountId?:string|null };
  rows: InvoiceFifoRow[];
  hasMore?: boolean;
  margin?: {status:'AVAILABLE';net:string;cost:string;profit:string;percent:string|null} |
    {status:'RETURN_REVIEW'|'INCOMPLETE'|'NET_MISMATCH'};
}

export interface ErpSyncConnectorOverview {
  id: string;
  displayName: string;
  sourceSystemCode: string;
  enabled: boolean;
  entityType: string | null;
  batchStatus: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  watermark: string | null;
  received: number | null;
  rejected: number | null;
  inserted: number | null;
  updated: number | null;
}

export interface ErpSyncOverview {
  status: 'AVAILABLE' | 'EMPTY' | 'UNAVAILABLE' | 'RESTRICTED';
  items: ErpSyncConnectorOverview[];
}

export interface StateCollectionCounts {
  collections: Record<string, number>;
  hiddenCollections: string[];
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface LedgerPnlDataResult {
  status: LedgerResultStatus | 'RESTRICTED' | 'PARTIAL';
  source: 'CLIENT_INDEXEDDB' | 'SQLSERVER_BACKEND';
  journalLines: Array<Record<string, unknown>>;
  coaMirror: CoaMirror[];
  reason?: string;
}

export const CASH_FLOW_SOURCES = ['cheques', 'supplierBills', 'expenses', 'treasuryAccounts', 'treasuryTransactions'] as const;
export interface CashFlowDataResult {
  status: 'LIVE' | 'EMPTY' | 'UNAVAILABLE' | 'RESTRICTED' | 'PARTIAL';
  source: 'CLIENT_INDEXEDDB' | 'SQLSERVER_BACKEND';
  cheques: Array<Record<string, unknown>>;
  supplierBills: Array<Record<string, unknown>>;
  expenses: Array<Record<string, unknown>>;
  treasuryAccounts: Array<Record<string, unknown>>;
  treasuryTransactions: Array<Record<string, unknown>>;
  missingSources: string[];
  reason?: string;
  updatedAt?: string | null;
  bankVerification?: 'VERIFIED' | 'NOT_VERIFIED';
  asOf?: string;
  chequeEvidence?: 'ERP_MIRROR' | 'CRM_PLAN';
  unverifiedCheques?: number;
  overlappingBills?: number;
}

export interface AccountDirectoryPage { items: Account[]; page: number; pageSize: number; hasMore: boolean }

export interface CollectionActionInput {
  requestId: string;
  kind: 'FOLLOW_UP' | 'PROMISE';
  assigneeId?: string;
  dueDate: string;
  note?: string;
  promisedAmount?: number;
  contactPerson?: string;
  paymentMethod?: string;
  sayadChequeNumber?: string;
  followUp?: boolean;
}

export interface CollectionReceiptDocument {
  id: string;
  source: string;
  reference: string;
  externalId: string;
  date: string;
  amount: string;
  syncedAt: string;
}
export interface CollectionReceiptPage {
  promiseId: string;
  current: CollectionReceiptDocument | null;
  invalidated: boolean;
  items: CollectionReceiptDocument[];
  page: number;
  hasMore: boolean;
}

export interface PublicRecruitmentConfig {
  company: string;
  requiredDocs: Array<{ key: string; label: string; required: boolean }>;
  requireNationalId: boolean;
  desiredRoles: string[];
}

export interface PublicApplicationSubmission {
  requestId: string;
  fields: Record<string, unknown>;
  documents: Array<{ kind: string; fileName: string; fileType: string; fileSize: number; base64Data: string }>;
}

export interface PublicApplicationReceipt { id: string; status: 'ACCEPTED' }

export interface DataProvider {
  name: 'CLIENT_INDEXEDDB' | 'SQLSERVER_BACKEND';
  
  getPublicRecruitment(): Promise<PublicRecruitmentConfig>;
  submitPublicApplication(input: PublicApplicationSubmission): Promise<PublicApplicationReceipt>;

  // Accounts
  searchAccountDirectory(query: string, page: number): Promise<AccountDirectoryPage | null>;
  getAccounts(filter?: any, pagination?: PaginationParams): Promise<PaginatedResult<Account>>;
  getAccountById(id: string): Promise<Account | null>;
  createAccount(account: Partial<Account>, idempotencyKey?: string): Promise<Account>;
  submitCustomerProposal(draftAccountId: string): Promise<CustomerProposalReceipt>;
  updateAccount(id: string, patch: Partial<Account>): Promise<Account>;
  
  // Quotes & CPQ
  getQuotes(filter?: any, pagination?: PaginationParams): Promise<PaginatedResult<Quote>>;
  getQuoteById(id: string): Promise<Quote | null>;
  createQuote(quote: Partial<Quote>, idempotencyKey?: string): Promise<Quote>;
  updateQuote(id: string, patch: Partial<Quote>): Promise<Quote>;
  decideQuote(id:string,input:{commandId:string;action:QuoteDecisionAction;expectedAt:string;expectedBasis:string}):Promise<{quote:Quote;replayed:boolean}>;
  
  // Tasks
  getTasks(filter?: any, pagination?: PaginationParams): Promise<PaginatedResult<Task>>;
  getTaskById(id: string): Promise<Task | null>;
  createTask(task: Partial<Task>, idempotencyKey?: string): Promise<Task>;
  updateTask(id: string, patch: Partial<Task>): Promise<Task>;
  getTaskWorkflow(id: string): Promise<TaskWorkflowRecord>;
  listTaskRequests(view:TaskRequestView,search:string,page:number): Promise<TaskRequestPage>;
  listTaskRequestFiles(id:string): Promise<{items:TaskRequestFile[]}>;
  getTaskRequestFile(id:string,fileId:string): Promise<TaskRequestFile & {data:string}>;
  uploadTaskRequestFile(id:string,file:File,uploadId:string): Promise<TaskRequestFile>;
  getTaskRequest(id:string): Promise<TaskRequestRecord>;
  submitTaskRequest(input:TaskRequestInput): Promise<TaskRequestRecord>;
  changeTaskRequest(id:string,input:TaskRequestCommand): Promise<TaskRequestRecord | {task:null;version:string}>;
  getTaskRequestDirectory(search:string,context?:'recruitment'): Promise<{items:{id:string;name:string}[]}>;
  getTaskRequestResources(type:TaskRequestResource,accountId:string,search:string): Promise<{items:{id:string;title:string;unit?:string;sku?:string}[]}>;
  getReportingLines(): Promise<{items:ReportingLine[]}>;
  getOwnPersonnelProfile():Promise<OwnPersonnelProfile>;
  listPersonnelLearning(review:boolean,page:number):Promise<LearningPage>;
  getPersonnelLearning(id:string,review:boolean):Promise<LearningDetail>;
  changePersonnelLearning(id:string,input:LearningActionInput):Promise<LearningDetail>;
  getLearningCatalog(search:string,employee?:string):Promise<LearningCatalog>;
  publishLearningCourse(input:LearningCourseInput):Promise<{id:string}>;
  assignLearningCourse(input:LearningAssignmentInput):Promise<{id:string}>;
  getLinkedPersonnelProfile(userId:string):Promise<EmploymentProfile>;
  changeEmploymentStatus(userId:string,input:EmploymentStatusInput):Promise<{userId:string;replayed:boolean}>;
  requestPersonnelAdvance(input:PersonnelAdvanceInput):Promise<PersonnelAdvanceReceipt>;
  decidePersonnelAdvance(id:string,input:AdvanceDecisionInput):Promise<{id:string;replayed:boolean}>;
  listAdvanceAccounting(stage:AdvanceAccountingStage|'',page:number,focus?:string):Promise<{items:AdvanceAccountingRow[];hasMore:boolean}>;
  reviewAdvanceAccounting(id:string,input:AdvanceAccountingInput):Promise<{id:string;replayed:boolean}>;
  listRecruitmentApplications(search:string,status:string,page:number):Promise<{items:RecruitmentReviewRow[];hasMore:boolean}>;
  reviewRecruitmentApplication(id:string,input:RecruitmentReviewInput):Promise<{application:RecruitmentReviewRow;replayed:boolean}>;
  changeReportingLine(userId:string,input:ReportingLineChange): Promise<{changed:boolean;replayed:boolean}>;
  getTaskRequestPolicies(): Promise<{items:(TaskRequestApprovalPolicy & {kind:TaskRequestPolicyKind})[]}>;
  saveTaskRequestPolicy(kind:TaskRequestPolicyKind,policy:TaskRequestApprovalPolicy): Promise<TaskRequestApprovalPolicy>;

  changeTaskWorkflow(id: string, command: TaskWorkflowCommand): Promise<TaskWorkflowRecord>;
  
  // Finance
  getCollectionReceiptEvidence(promiseId: string, page: number): Promise<CollectionReceiptPage>;
  linkCollectionReceipt(promiseId: string, paymentId: string): Promise<CollectionReceiptDocument>;
  submitCollectionAction(accountId: string, input: CollectionActionInput): Promise<{ id: string }>;
  getInvoices(filter?: any, pagination?: PaginationParams): Promise<PaginatedResult<Invoice>>;
  getPayments(filter?: any, pagination?: PaginationParams): Promise<PaginatedResult<Payment>>;
  getCheques(filter?: any, pagination?: PaginationParams): Promise<PaginatedResult<Cheque>>;
  createPayment(payment: Partial<Payment>, idempotencyKey?: string): Promise<Payment>;
  
  // Ledger: گردش و مانده تفکیکی تفصیلی × معین (قانون اساسی §C؛ فقط از این مسیر خوانده شود)
  getJournalLines(filter?: JournalLineFilter, pagination?: PaginationParams): Promise<JournalLinePage>;
  getLedgerSources(): Promise<{ items: LedgerBookSource[] }>;
  getLedgerBooks(filter: LedgerBookFilter): Promise<LedgerBookPage>;
  getDetailSubsidiaryBalances(options?: LedgerBalanceOptions): Promise<DetailBalancesResult>;
  getLedgerPnlData(filter?: Pick<JournalLineFilter, 'fromDate' | 'toDate' | 'periodCode' | 'source' | 'currency'>): Promise<LedgerPnlDataResult>;
  getCashFlowData(): Promise<CashFlowDataResult>;
  getPurchaseCycle(search:string,view:PurchaseCycleView,page:number,scope?:PurchaseCoverageScope,audience?:PurchaseCycleAudience): Promise<PurchaseCycleResult>;
  getPurchaseProductHints(account:string,source:string): Promise<PurchaseProductResult>;
  getMoneyReport(period: MoneyPeriod): Promise<MoneyReport>;
  getJournalCoverage(period: MoneyPeriod, filter: JournalCoverageFilter): Promise<JournalCoveragePage>;
  getJournalFollowUpEvidence(taskId: string): Promise<JournalFollowUpEvidence>;
  createJournalCoverageFollowUp(period: MoneyPeriod, operation: JournalOperation, externalId: string): Promise<{ id: string; replayed: boolean }>;
  getMoneyEvidence(period: MoneyPeriod, filter: MoneyEvidenceFilter): Promise<MoneyEvidencePage>;

  // HR & Payroll
  getPayslips(userId?: string, month?: string): Promise<Payslip[]>;
  getAdvanceRequests(userId?: string): Promise<AdvanceRequest[]>;
  createAdvanceRequest(req: Partial<AdvanceRequest>): Promise<AdvanceRequest>;
  executePayrollRun(month: string, basis: number): Promise<PayrollRun>;
  
  // Geo
  getGeoZones(): Promise<GeoZone[]>;
  saveGeoZone(zone: Partial<GeoZone>): Promise<GeoZone>;
  getZoneAssignments(): Promise<ZoneAssignment[]>;
  getPaymentAllocations(): Promise<PaymentAllocation[]>;
  getCreditNoteEvidence(): Promise<CreditNoteEvidence>;
  getFifoValuations(): Promise<FifoValuations>;
  getFifoLayers(runId: string, warehouseId: string, after?: number, activity?: 'inbound' | 'withdrawals'): Promise<FifoLayerPage>;
  getInvoiceFifoEvidence(invoiceId: string): Promise<InvoiceFifoEvidence>;
  getFifoSaleEvidence(documentId: string, source: string, periodStart: string): Promise<FifoSaleEvidence>;
  
  // Financial Intelligence & Approval Center (Approval Intelligence / Financial 360 / Smart Accounting Classification)
  getApprovalContext(ref: ApprovalRef, opts?: ContextOptions): Promise<ApprovalContext | null>;
  getFinancial360(subject: SubjectRef, opts?: ContextOptions): Promise<FinancialContext>;
  previewAccountingMapping(input: ClassificationInput): Promise<MappingResolution>;
  recordApprovalSnapshot(snapshot: ApprovalSnapshot): Promise<{ ok: boolean; duplicate?: boolean }>;

  // Analytics
  getAnalyticsReport(reportId: number, params?: any): Promise<any>;

  // SQL-first state layer: every AppState collection/setting goes through these (see services/stateSync.ts)
  getStateSnapshot(view?: 'chat'): Promise<StateSnapshot>;
  getStateCounts(collections: readonly string[]): Promise<StateCollectionCounts>;
  getErpSyncOverview(): Promise<ErpSyncOverview>;
  syncStateChanges(change: { upserts: Record<string, any[]>; deletes: Record<string, string[]>; singletons: Record<string, any> }): Promise<StateSyncResult>;
  bootstrapState(state: any): Promise<{ ok: boolean; upserted: number; rejected: any[]; serverVersion: number }>;
  getStateIntegrity(): Promise<{ collections: Record<string, number>; issueCount: number; issues: any[] }>;
  getStateProfile(): Promise<Record<string, { rows: number; fields: Record<string, { types: string[]; coverage: number }> }>>;
}

const MAX_PNL_JOURNAL_PAGES = 100;

/**
 * 1. پیاده‌سازی ارائه‌دهنده داده سمت کلاینت (IndexedDB / Local-first)
 */
export class ClientStorageDataProvider implements DataProvider {
  async listPersonnelLearning():Promise<LearningPage> { throw new Error('آموزش پرسنل به پایگاه مرکزی نیاز دارد.'); }
  async getPersonnelLearning():Promise<LearningDetail> { throw new Error('آموزش پرسنل به پایگاه مرکزی نیاز دارد.'); }
  async changePersonnelLearning():Promise<LearningDetail> { throw new Error('آموزش پرسنل به پایگاه مرکزی نیاز دارد.'); }
  async getLearningCatalog():Promise<LearningCatalog> { throw new Error('آموزش پرسنل به پایگاه مرکزی نیاز دارد.'); }
  async publishLearningCourse():Promise<{id:string}> { throw new Error('آموزش پرسنل به پایگاه مرکزی نیاز دارد.'); }
  async assignLearningCourse():Promise<{id:string}> { throw new Error('آموزش پرسنل به پایگاه مرکزی نیاز دارد.'); }
  async listAdvanceAccounting():Promise<{items:AdvanceAccountingRow[];hasMore:boolean}> { throw new Error('کارتابل مساعده به پایگاه مرکزی نیاز دارد.'); }
  async reviewAdvanceAccounting():Promise<{id:string;replayed:boolean}> { throw new Error('بررسی حسابداری به پایگاه مرکزی نیاز دارد.'); }
  async listRecruitmentApplications():Promise<{items:RecruitmentReviewRow[];hasMore:boolean}> { return {items:[],hasMore:false}; }
  async reviewRecruitmentApplication():Promise<{application:RecruitmentReviewRow;replayed:boolean}> { throw new Error('بررسی پرونده به پایگاه مرکزی نیاز دارد.'); }
  async getOwnPersonnelProfile():Promise<OwnPersonnelProfile> { throw new Error('پروندهٔ پرسنلی به پایگاه مرکزی نیاز دارد.'); }
  async getLinkedPersonnelProfile():Promise<EmploymentProfile> { throw new Error('پروندهٔ پرسنلی به پایگاه مرکزی نیاز دارد.'); }
  async changeEmploymentStatus():Promise<{userId:string;replayed:boolean}> { throw new Error('تغییر وضعیت پرسنل به پایگاه مرکزی نیاز دارد.'); }
  async requestPersonnelAdvance():Promise<PersonnelAdvanceReceipt> { throw new Error('درخواست مساعده به پایگاه مرکزی نیاز دارد.'); }
  async decidePersonnelAdvance():Promise<{id:string;replayed:boolean}> { throw new Error('تصمیم مساعده به پایگاه مرکزی نیاز دارد.'); }
  async getPurchaseCycle(): Promise<PurchaseCycleResult> { throw new Error('آینهٔ ERP برای گزارش چرخهٔ خرید در دسترس نیست.'); }
  async getPurchaseProductHints(): Promise<PurchaseProductResult> { throw new Error('ردیف فاکتورهای ERP در دسترس نیست.'); }
  async searchAccountDirectory(): Promise<null> { return null; }
  async getCollectionReceiptEvidence(): Promise<CollectionReceiptPage> {
    throw new Error('بررسی سند ERP نیازمند اتصال به سرور است.');
  }
  async linkCollectionReceipt(): Promise<CollectionReceiptDocument> {
    throw new Error('ثبت مدرک وصول نیازمند اتصال به سرور است.');
  }
  async submitCollectionAction(): Promise<{ id: string }> {
    throw new Error('ثبت پیگیری وصول نیازمند اتصال به سرور است.');
  }
  async getPublicRecruitment(): Promise<PublicRecruitmentConfig> {
    throw new Error('دریافت درخواست همکاری نیازمند اتصال به سرور است.');
  }
  async submitPublicApplication(): Promise<PublicApplicationReceipt> {
    throw new Error('درخواست ارسال نشد. اتصال سرور را بررسی کنید.');
  }
  async getInvoiceFifoEvidence(): Promise<InvoiceFifoEvidence> {
    return { status: 'UNAVAILABLE', rows: [] };
  }
  async getFifoSaleEvidence(): Promise<FifoSaleEvidence> {
    return { status: 'UNAVAILABLE', coverage: 'UNVERIFIED', items: [], hasMore: false };
  }
  async getFifoLayers(): Promise<FifoLayerPage> {
    return { status: 'UNAVAILABLE', items: [], next: null };
  }
  async getFifoValuations(): Promise<FifoValuations> {
    return { status: 'UNAVAILABLE', items: [], hasMore: false };
  }
  async getCreditNoteEvidence(): Promise<CreditNoteEvidence> {
    return { status: 'UNAVAILABLE', items: [], hasMore: false };
  }
  name = 'CLIENT_INDEXEDDB' as const;

  private getState(): AppState {
    return useAppStore.getState().state;
  }

  private updateState(updater: (draft: AppState) => void) {
    useAppStore.getState().updateState(updater);
  }

  async getAccounts(filter?: any, pagination?: PaginationParams): Promise<PaginatedResult<Account>> {
    const list = this.getState().accounts || [];
    const filtered = filter ? list.filter(a => !filter.name || a.name.includes(filter.name)) : list;
    const page = pagination?.page || 1;
    const pageSize = pagination?.pageSize || 25;
    const start = (page - 1) * pageSize;
    return {
      items: filtered.slice(start, start + pageSize),
      total: filtered.length,
      page,
      pageSize,
      totalPages: Math.ceil(filtered.length / pageSize) || 1
    };
  }

  async getJournalLines(filter?: JournalLineFilter, pagination?: PaginationParams): Promise<JournalLinePage> {
    return queryJournalLines((this.getState() as any).journalLines, filter, pagination);
  }

  async getLedgerSources(): Promise<{ items: LedgerBookSource[] }> { return { items: [] }; }

  async getLedgerBooks(): Promise<LedgerBookPage> {
    return { status:'UNAVAILABLE',reason:'مرور دفتر رسمی از منبع SQL Server در دسترس است.',items:[],hasMore:false };
  }

  async getDetailSubsidiaryBalances(options?: LedgerBalanceOptions): Promise<DetailBalancesResult> {
    if (options?.role || options?.source || options?.currency) {
      return { status:'UNAVAILABLE',source:this.name,balances:[],reason:'ماندهٔ رسمی از دفتر گواهی‌شدهٔ SQL Server خوانده می‌شود.' };
    }
    return buildDetailBalancesResult((this.getState() as any).journalLines, 'CLIENT_INDEXEDDB', options);
  }

  async getLedgerPnlData(filter?: Pick<JournalLineFilter, 'fromDate' | 'toDate' | 'periodCode' | 'source' | 'currency'>): Promise<LedgerPnlDataResult> {
    const st = this.getState() as unknown as Record<string, unknown>;
    const coaMirror = Array.isArray(st.coaMirror) ? (st.coaMirror as CoaMirror[]) : [];
    const journalLines: Array<Record<string, unknown>> = [];
    const pageSize = 200;
    let page = 1;
    let totalPages = 1;
    do {
      const res = await this.getJournalLines(filter, { page, pageSize });
      if (Array.isArray(res.items)) journalLines.push(...res.items);
      totalPages = Math.max(1, Number(res.totalPages) || 1);
      if (totalPages > MAX_PNL_JOURNAL_PAGES) {
        return {
          status: 'UNAVAILABLE',
          source: this.name,
          journalLines: [],
          coaMirror: [],
          reason: 'حجم سطرهای سند بیش از سقف مجاز دریافت یکجاست؛ گزارش تجمیعی سرور لازم است.'
        };
      }
      page += 1;
    } while (page <= totalPages);

    return {
      status: journalLines.length || coaMirror.length ? 'LIVE' : 'EMPTY',
      source: this.name,
      journalLines,
      coaMirror
    };
  }

  async getAccountById(id: string): Promise<Account | null> {
    return (this.getState().accounts || []).find(a => a.id === id) || null;
  }

  async createAccount(account: Partial<Account>): Promise<Account> {
    const newAccount = { id: account.id || `acc_${Date.now()}`, ...account } as Account;
    this.updateState(d => {
      if (!d.accounts) d.accounts = [];
      d.accounts.unshift(newAccount);
    });
    return newAccount;
  }

  async submitCustomerProposal(): Promise<CustomerProposalReceipt> {
    throw new Error('ثبت پیشنهاد مشتری به اتصال سرور نیاز دارد.');
  }

  async updateAccount(id: string, patch: Partial<Account>): Promise<Account> {
    let updated: Account | null = null;
    this.updateState(d => {
      const idx = (d.accounts || []).findIndex(a => a.id === id);
      if (idx >= 0) {
        d.accounts[idx] = { ...d.accounts[idx], ...patch };
        updated = d.accounts[idx];
      }
    });
    return updated!;
  }

  async getQuotes(filter?: any, pagination?: PaginationParams): Promise<PaginatedResult<Quote>> {
    const list = this.getState().quotes || [];
    const page = pagination?.page || 1;
    const pageSize = pagination?.pageSize || 25;
    const start = (page - 1) * pageSize;
    return {
      items: list.slice(start, start + pageSize),
      total: list.length,
      page,
      pageSize,
      totalPages: Math.ceil(list.length / pageSize) || 1
    };
  }

  async getQuoteById(id: string): Promise<Quote | null> {
    return (this.getState().quotes || []).find(q => q.id === id) || null;
  }

  async createQuote(quote: Partial<Quote>): Promise<Quote> {
    const newQuote = { id: quote.id || `qt_${Date.now()}`, ...quote } as Quote;
    this.updateState(d => {
      if (!d.quotes) d.quotes = [];
      d.quotes.unshift(newQuote);
    });
    return newQuote;
  }

  async updateQuote(id: string, patch: Partial<Quote>): Promise<Quote> {
    let updated: Quote | null = null;
    this.updateState(d => {
      const idx = (d.quotes || []).findIndex(q => q.id === id);
      if (idx >= 0) {
        d.quotes[idx] = { ...d.quotes[idx], ...patch };
        updated = d.quotes[idx];
      }
    });
    return updated!;
  }
  async decideQuote():Promise<{quote:Quote;replayed:boolean}> { throw new Error('ثبت تصمیم فروش به پایگاه مرکزی نیاز دارد.'); }

  async getTasks(filter?: any, pagination?: PaginationParams): Promise<PaginatedResult<Task>> {
    const list = this.getState().tasks || [];
    const page = pagination?.page || 1;
    const pageSize = pagination?.pageSize || 25;
    const start = (page - 1) * pageSize;
    return {
      items: list.slice(start, start + pageSize),
      total: list.length,
      page,
      pageSize,
      totalPages: Math.ceil(list.length / pageSize) || 1
    };
  }

  async getTaskById(id: string): Promise<Task | null> {
    return (this.getState().tasks || []).find(t => t.id === id) || null;
  }

  async listTaskRequests(): Promise<TaskRequestPage> { throw new Error('کارتابل درخواست‌ها به اتصال سرور نیاز دارد.'); }
  async listTaskRequestFiles(): Promise<{items:TaskRequestFile[]}> { return {items:[]}; }
  async getTaskRequestFile(): Promise<TaskRequestFile & {data:string}> { throw new Error('دریافت مدرک به سرور نیاز دارد.'); }
  async uploadTaskRequestFile(): Promise<TaskRequestFile> { throw new Error('ثبت مدرک به سرور نیاز دارد.'); }
  async getTaskRequest(): Promise<TaskRequestRecord> { throw new Error('پروندهٔ درخواست به اتصال سرور نیاز دارد.'); }
  async submitTaskRequest(): Promise<TaskRequestRecord> { throw new Error('ثبت درخواست به اتصال سرور نیاز دارد.'); }
  async changeTaskRequest(): Promise<TaskRequestRecord> { throw new Error('گردش درخواست به اتصال سرور نیاز دارد.'); }
  async getTaskRequestDirectory(): Promise<{items:{id:string;name:string}[]}> { return {items:[]}; }
  async getTaskRequestResources(): Promise<{items:{id:string;title:string;unit?:string;sku?:string}[]}> { return {items:[]}; }
  async getReportingLines(): Promise<{items:ReportingLine[]}> { return {items:[]}; }
  async changeReportingLine(): Promise<{changed:boolean;replayed:boolean}> { throw new Error('ثبت سرپرستی سازمانی به سرور نیاز دارد.'); }
  async getTaskRequestPolicies(): Promise<{items:(TaskRequestApprovalPolicy & {kind:TaskRequestPolicyKind})[]}> { return {items:[]}; }
  async saveTaskRequestPolicy(): Promise<TaskRequestApprovalPolicy> { throw new Error('ثبت سیاست تأیید به اتصال سرور نیاز دارد.'); }

  async getTaskWorkflow(id: string): Promise<TaskWorkflowRecord> {
    const task = await this.getTaskById(id);
    if (!task) throw new Error('وظیفه در دسترس نیست.');
    return { task, version: hashRecord(task) };
  }

  async changeTaskWorkflow(id: string, command: TaskWorkflowCommand): Promise<TaskWorkflowRecord> {
    const state = this.getState();
    const actorId = state.currentUserId;
    const task = state.tasks?.find(row => row.id === id);
    if (!task || !actorId) throw new Error('وظیفه در دسترس نیست.');
    if (hashRecord(task) !== command.version) {
      throw Object.assign(new Error('وظیفه تغییر کرده است. نسخهٔ تازه را دریافت کنید.'), { status: 409 });
    }
    const result = applyTaskWorkflow(task, { ...command, actorId });
    if (!result.ok) throw new Error(result.error);
    await this.updateTask(id, result.task);
    return { task: result.task, version: hashRecord(result.task) };
  }

  async createTask(task: Partial<Task>): Promise<Task> {
    const newTask = { id: task.id || `tsk_${Date.now()}`, ...task } as Task;
    this.updateState(d => {
      if (!d.tasks) d.tasks = [];
      d.tasks.unshift(newTask);
    });
    return newTask;
  }

  async updateTask(id: string, patch: Partial<Task>): Promise<Task> {
    let updated: Task | null = null;
    this.updateState(d => {
      const idx = (d.tasks || []).findIndex(t => t.id === id);
      if (idx >= 0) {
        d.tasks[idx] = { ...d.tasks[idx], ...patch };
        updated = d.tasks[idx];
      }
    });
    return updated!;
  }

  async getInvoices(): Promise<PaginatedResult<Invoice>> {
    const list = this.getState().invoices || [];
    return { items: list, total: list.length, page: 1, pageSize: list.length, totalPages: 1 };
  }

  async getPayments(): Promise<PaginatedResult<Payment>> {
    const list = this.getState().payments || [];
    return { items: list, total: list.length, page: 1, pageSize: list.length, totalPages: 1 };
  }

  async getCheques(): Promise<PaginatedResult<Cheque>> {
    const list = this.getState().cheques || [];
    return { items: list, total: list.length, page: 1, pageSize: list.length, totalPages: 1 };
  }

  async createPayment(payment: Partial<Payment>): Promise<Payment> {
    const newPayment = { id: payment.id || `pay_${Date.now()}`, ...payment } as Payment;
    this.updateState(d => {
      if (!d.payments) d.payments = [];
      d.payments.unshift(newPayment);
    });
    return newPayment;
  }

  async getPayslips(userId?: string, month?: string): Promise<Payslip[]> {
    let list = this.getState().payslips || [];
    if (userId) list = list.filter(p => p.userId === userId);
    if (month) list = list.filter(p => p.month === month);
    return list;
  }

  async getAdvanceRequests(userId?: string): Promise<AdvanceRequest[]> {
    let list = this.getState().advanceRequests || [];
    if (userId) list = list.filter(a => a.userId === userId);
    return list;
  }

  async createAdvanceRequest(req: Partial<AdvanceRequest>): Promise<AdvanceRequest> {
    const newReq = { id: req.id || `adv_${Date.now()}`, ...req } as AdvanceRequest;
    this.updateState(d => {
      if (!d.advanceRequests) d.advanceRequests = [];
      d.advanceRequests.unshift(newReq);
    });
    return newReq;
  }

  async executePayrollRun(month: string, basis: number): Promise<PayrollRun> {
    // محاسبهٔ واقعی با موتور حقوق؛ بدون حقوق ثبت‌شده هیچ دوره‌ای ثبت نمی‌شود (نه جمع صفر با وضعیت COMPLETED).
    const dailyBasis = (basis === 29 || basis === 31 ? basis : 30) as 29 | 30 | 31;
    const existing = (this.getState().payrollRuns || []).find(r => r.periodMonth === month && r.dailyBasis === dailyBasis);
    if (existing) return existing; // idempotent: همان ماه/مبنا دوباره ثبت نمی‌شود
    const executedBy = this.getState().currentUserId || 'admin';
    const { run, payslips, settledAdvanceIds, skippedUserIds } = computePayrollRun(this.getState(), month, executedBy, dailyBasis);
    if (payslips.length === 0) {
      throw new Error(`PAYROLL_NO_ELIGIBLE_EMPLOYEES: هیچ کاربری حقوق ثبت‌شده ندارد (${skippedUserIds.length} نفر کنار ماند)`);
    }
    this.updateState(d => {
      if (!d.payrollRuns) d.payrollRuns = [];
      d.payrollRuns.unshift(run);
      if (!d.payslips) d.payslips = [];
      d.payslips.unshift(...payslips);
      (d.advanceRequests || []).forEach(a => { if (settledAdvanceIds.includes(a.id)) a.status = 'SETTLED'; });
    });
    return run;
  }

  async getJournalFollowUpEvidence(): Promise<JournalFollowUpEvidence> {
    throw new Error('دریافت شاهد مالی به سرور نیاز دارد.');
  }

  async createJournalCoverageFollowUp(): Promise<{ id: string; replayed: boolean }> {
    throw new Error('ثبت پیگیری مالی به سرور نیاز دارد.');
  }

  async getJournalCoverage(): Promise<JournalCoveragePage> {
    return { status: 'UNAVAILABLE', items: [], counts: [], hasMore: false };
  }

  async getMoneyReport(): Promise<MoneyReport> {
    return { status: 'UNAVAILABLE', reason: 'گزارش مالی فقط از آینهٔ مجاز ERP در سرور خوانده می‌شود.' };
  }

  async getMoneyEvidence(): Promise<MoneyEvidencePage> {
    throw new Error('ریز اسناد فقط از سرور در دسترس است.');
  }

  async getCashFlowData(): Promise<CashFlowDataResult> {
    const state = this.getState() as unknown as Record<string, unknown>;
    const col = (key: string) => Array.isArray(state[key]) ? state[key] as Array<Record<string, unknown>> : [];
    const missingSources = CASH_FLOW_SOURCES.filter(key => !Array.isArray(state[key]));
    const collections = { cheques: col('cheques'), supplierBills: col('supplierBills'), expenses: col('expenses'), treasuryAccounts: col('treasuryAccounts'), treasuryTransactions: col('treasuryTransactions') };
    return { ...collections, status: missingSources.length ? 'PARTIAL' : Object.values(collections).every(a => a.length === 0) ? 'EMPTY' : 'LIVE', source: this.name, missingSources };
  }

  async getGeoZones(): Promise<GeoZone[]> {
    return this.getState().geoZones || [];
  }

  async getZoneAssignments(): Promise<ZoneAssignment[]> {
    return this.getState().zoneAssignments || [];
  }

  async getPaymentAllocations(): Promise<PaymentAllocation[]> {
    return this.getState().paymentAllocations || [];
  }

  async saveGeoZone(zone: Partial<GeoZone>): Promise<GeoZone> {
    const saved = { id: zone.id || `zone_${Date.now()}`, ...zone } as GeoZone;
    this.updateState(d => {
      if (!d.geoZones) d.geoZones = [];
      const idx = d.geoZones.findIndex(z => z.id === saved.id);
      if (idx >= 0) d.geoZones[idx] = saved;
      else d.geoZones.push(saved);
    });
    return saved;
  }

  // --- Financial Intelligence (محاسبه روی داده محلی CRM؛ بدون ساخت داده رسمی) ---
  async getApprovalContext(ref: ApprovalRef, opts?: ContextOptions): Promise<ApprovalContext | null> {
    const st = this.getState(); return buildApprovalContext(st, ref, withViewer(st, opts));
  }
  async getFinancial360(subject: SubjectRef, opts?: ContextOptions): Promise<FinancialContext> {
    const st = this.getState(); return buildFinancial360(st, subject, withViewer(st, opts));
  }
  async previewAccountingMapping(input: ClassificationInput): Promise<MappingResolution> {
    return resolveAccountingMapping(this.getState(), input);
  }
  async recordApprovalSnapshot(snapshot: ApprovalSnapshot): Promise<{ ok: boolean; duplicate?: boolean }> {
    let added = false;
    this.updateState(d => { added = recordApprovalSnapshot(d, snapshot); });
    return { ok: true, duplicate: !added };
  }

  async getAnalyticsReport(reportId: number): Promise<any> {
    return { reportId, status: 'READY', source: 'CLIENT_CACHE', asOf: new Date().toISOString() };
  }

  // --- SQL-first state layer (local provider: the store IS the data, so these are read-only/no-op) ---
  async getStateSnapshot(): Promise<StateSnapshot> {
    const split = splitState(this.getState(), stateRegistry);
    return {
      collections: Object.fromEntries(Object.entries(split.collections).map(([name, map]) => [name, [...map.values()]])),
      singletons: split.singletons,
      serverVersion: 0
    };
  }
  async getErpSyncOverview(): Promise<ErpSyncOverview> {
    return { status: 'UNAVAILABLE', items: [] };
  }
  async getStateCounts(collections: readonly string[]): Promise<StateCollectionCounts> {
    const state = this.getState();
    const rbac = new RBACService(state);
    const split = splitState(state, stateRegistry);
    const counts: StateCollectionCounts = { collections: {}, hiddenCollections: [] };
    for (const name of collections) {
      if (!Object.hasOwn(stateRegistry.collections, name)) continue;
      const permission = policyOf(name, stateRegistry).read;
      if (!rbac.getCurrentUser() || (permission !== 'authenticated' && !rbac.hasPermission(permission))) {
        counts.hiddenCollections.push(name);
      } else if (!Object.hasOwn(split.singletons, name)) {
        counts.collections[name] = split.collections[name]?.size ?? 0;
      }
    }
    return counts;
  }
  async syncStateChanges(): Promise<StateSyncResult> { return { ok: true, upserted: 0, deleted: 0, serverVersion: 0, rejected: [] }; }
  async bootstrapState(): Promise<{ ok: boolean; upserted: number; rejected: any[]; serverVersion: number }> { return { ok: true, upserted: 0, rejected: [], serverVersion: 0 }; }
  async getStateIntegrity() {
    const { checkIntegrity } = await import('../lib/stateModel.mjs');
    const split = splitState(this.getState(), stateRegistry);
    const lists = Object.fromEntries(Object.entries(split.collections).map(([n, m]) => [n, [...m.values()]]));
    const issues = checkIntegrity(lists, stateRegistry);
    return { collections: Object.fromEntries(Object.entries(lists).map(([n, l]) => [n, l.length])), issueCount: issues.length, issues: issues.slice(0, 500) };
  }
  async getStateProfile() {
    const { profileCollections } = await import('../lib/stateModel.mjs');
    const split = splitState(this.getState(), stateRegistry);
    return profileCollections(Object.fromEntries(Object.entries(split.collections).map(([n, m]) => [n, [...m.values()]])));
  }
}

/**
 * 2. پیاده‌سازی ارائه‌دهنده داده مستقیم به Backend سرور و SQL Server
 */
export class HttpBackendDataProvider implements DataProvider {
  async listAdvanceAccounting(stage:AdvanceAccountingStage|'',page:number,focus?:string):Promise<{items:AdvanceAccountingRow[];hasMore:boolean}> {
    const params=new URLSearchParams({stage,page:String(page)});
    if (focus) params.set('focus',focus);
    return this.request(`/finance/personnel-advances?${params}`);
  }
  async reviewAdvanceAccounting(id:string,input:AdvanceAccountingInput):Promise<{id:string;replayed:boolean}> {
    return this.request(`/finance/personnel-advances/${encodeURIComponent(id)}/review`,{method:'POST',body:JSON.stringify(input)});
  }
  async listRecruitmentApplications(search:string,status:string,page:number):Promise<{items:RecruitmentReviewRow[];hasMore:boolean}> {
    return this.request(`/recruitment/applications?${new URLSearchParams({search,status,page:String(page)})}`);
  }
  async reviewRecruitmentApplication(id:string,input:RecruitmentReviewInput):Promise<{application:RecruitmentReviewRow;replayed:boolean}> {
    return this.request(`/recruitment/applications/${encodeURIComponent(id)}/actions`,{method:'POST',body:JSON.stringify(input)});
  }
  async getOwnPersonnelProfile():Promise<OwnPersonnelProfile> { return this.request('/personnel/me'); }
  async listPersonnelLearning(review:boolean,page:number):Promise<LearningPage> {
    return this.request(`/personnel/learning?page=${page}&view=${review ? 'review' : 'own'}`);
  }
  async getPersonnelLearning(id:string,review:boolean):Promise<LearningDetail> {
    return this.request(`/personnel/learning/${encodeURIComponent(id)}?view=${review ? 'review' : 'own'}`);
  }
  async changePersonnelLearning(id:string,input:LearningActionInput):Promise<LearningDetail> {
    return this.request(`/personnel/learning/${encodeURIComponent(id)}/actions`,{method:'POST',body:JSON.stringify(input)});
  }
  async getLearningCatalog(search:string,employee?:string):Promise<LearningCatalog> {
    const params=new URLSearchParams({search});
    if (employee) params.set('employee',employee);
    return this.request(`/personnel/learning/catalog?${params}`);
  }
  async publishLearningCourse(input:LearningCourseInput):Promise<{id:string}> {
    return this.request('/personnel/learning/catalog',{method:'POST',body:JSON.stringify(input)});
  }
  async assignLearningCourse(input:LearningAssignmentInput):Promise<{id:string}> {
    return this.request('/personnel/learning/assignments',{method:'POST',body:JSON.stringify(input)});
  }
  async getLinkedPersonnelProfile(userId:string):Promise<EmploymentProfile> { return this.request(`/personnel/linked-user/${encodeURIComponent(userId)}`); }
  async changeEmploymentStatus(userId:string,input:EmploymentStatusInput):Promise<{userId:string;replayed:boolean}> {
    return this.request(`/personnel/linked-user/${encodeURIComponent(userId)}/status`,{method:'POST',body:JSON.stringify(input)});
  }
  async requestPersonnelAdvance(input:PersonnelAdvanceInput):Promise<PersonnelAdvanceReceipt> {
    return this.request('/personnel/me/advances',{method:'POST',body:JSON.stringify(input)});
  }
  async decidePersonnelAdvance(id:string,input:AdvanceDecisionInput):Promise<{id:string;replayed:boolean}> {
    return this.request(`/personnel/advances/${encodeURIComponent(id)}/decision`,{method:'POST',body:JSON.stringify(input)});
  }
  async getPurchaseCycle(search:string,view:PurchaseCycleView,page:number,scope?:PurchaseCoverageScope,audience?:PurchaseCycleAudience): Promise<PurchaseCycleResult> {
    const params=new URLSearchParams({search,view,page:String(page)});
    if (scope) {params.set('territory',scope.territory);params.set('owner',scope.owner);}
    if (audience) params.set('audience',audience);
    return this.request(`/analytics/purchase-cycle?${params}`);
  }
  async getPurchaseProductHints(account:string,source:string): Promise<PurchaseProductResult> {
    return this.request(`/analytics/purchase-cycle/products?${new URLSearchParams({account,source})}`);
  }
  async searchAccountDirectory(query: string, page: number): Promise<AccountDirectoryPage> {
    return this.request('/accounts/search', { method: 'POST', body: JSON.stringify({ query, page }) });
  }
  async getCollectionReceiptEvidence(promiseId: string, page: number): Promise<CollectionReceiptPage> {
    return this.request(`/finance/collection-promises/${encodeURIComponent(promiseId)}/evidence?page=${page}`);
  }
  async linkCollectionReceipt(promiseId: string, paymentId: string): Promise<CollectionReceiptDocument> {
    const result = await this.request<{ promiseId: string; status: string; payment: CollectionReceiptDocument }>(
      `/finance/collection-promises/${encodeURIComponent(promiseId)}/evidence`, {
        method: 'POST', body: JSON.stringify({ paymentId }),
      });
    if (result?.status !== 'RECORDED' || result.promiseId !== promiseId
      || result.payment?.id?.toLowerCase() !== paymentId.toLowerCase()) {
      throw new Error('تأیید معتبر ثبت مدرک از سرور دریافت نشد.');
    }
    return result.payment;
  }
  async submitCollectionAction(accountId: string, input: CollectionActionInput): Promise<{ id: string }> {
    const receipt = await this.request<{ id: string; status: string }>(`/finance/collections/${encodeURIComponent(accountId)}/actions`, {
      method: 'POST', body: JSON.stringify(input),
    });
    if (receipt?.status !== 'RECORDED' || receipt.id !== input.requestId) {
      throw new Error('تأیید معتبر ثبت دریافت نشد. دوباره تلاش کنید.');
    }
    return receipt;
  }
  async getPublicRecruitment(): Promise<PublicRecruitmentConfig> {
    return this.request('/public/recruitment/config');
  }
  async submitPublicApplication(input: PublicApplicationSubmission): Promise<PublicApplicationReceipt> {
    const receipt = await this.request<PublicApplicationReceipt>('/public/recruitment/applications', {
      method: 'POST', body: JSON.stringify(input),
    });
    if (receipt?.status !== 'ACCEPTED' || receipt.id !== input.requestId) {
      throw new Error('رسید معتبر از سرور دریافت نشد. دوباره تلاش کنید.');
    }
    return receipt;
  }
  async getInvoiceFifoEvidence(invoiceId: string): Promise<InvoiceFifoEvidence> {
    try {
      return await this.request(`/finance/invoices/${encodeURIComponent(invoiceId)}/fifo`);
    } catch (error) {
      const denied = error instanceof Error && 'status' in error && error.status === 403;
      return { status: denied ? 'RESTRICTED' : 'UNAVAILABLE', rows: [] };
    }
  }
  async getFifoSaleEvidence(documentId: string, source: string, periodStart: string): Promise<FifoSaleEvidence> {
    try {
      const query = new URLSearchParams({ source, periodStart });
      const data = await this.request<FifoSaleEvidence>(`/inventory/fifo/sales/${encodeURIComponent(documentId)}/cogs?${query}`);
      if ((data?.status === 'AVAILABLE' || data?.status === 'EMPTY') && data.coverage === 'UNVERIFIED'
        && Array.isArray(data.items) && typeof data.hasMore === 'boolean') return data;
    } catch (error) {
      if (error instanceof Error && 'status' in error && error.status === 403) return { status: 'RESTRICTED', coverage: 'UNVERIFIED', items: [], hasMore: false };
    }
    return { status: 'UNAVAILABLE', coverage: 'UNVERIFIED', items: [], hasMore: false };
  }
  async getFifoLayers(runId: string, warehouseId: string, after = 0, activity: 'inbound' | 'withdrawals' = 'inbound'): Promise<FifoLayerPage> {
    try {
      const query = new URLSearchParams({ runId, warehouseId, after: String(after), activity });
      const data = await this.request<FifoLayerPage>(`/inventory/fifo/layers?${query}`);
      if ((data?.status === 'AVAILABLE' || data?.status === 'EMPTY') && Array.isArray(data.items)
        && (data.next === null || (Number.isInteger(data.next) && data.next > after))) return data;
    } catch (error) {
      if (error instanceof Error && 'status' in error && error.status === 403) return { status: 'RESTRICTED', items: [], next: null };
    }
    return { status: 'UNAVAILABLE', items: [], next: null };
  }
  async getFifoValuations(): Promise<FifoValuations> {
    try {
      const data = await this.request<FifoValuations>('/inventory/fifo/valuation');
      if ((data?.status === 'AVAILABLE' || data?.status === 'EMPTY') && Array.isArray(data.items) && typeof data.hasMore === 'boolean') return data;
    } catch (error) {
      if (error instanceof Error && 'status' in error && error.status === 403) return { status: 'RESTRICTED', items: [], hasMore: false };
    }
    return { status: 'UNAVAILABLE', items: [], hasMore: false };
  }
  async getCreditNoteEvidence(): Promise<CreditNoteEvidence> {
    try {
      const data = await this.request<CreditNoteEvidence>('/ledger/credit-notes');
      if ((data?.status === 'AVAILABLE' || data?.status === 'EMPTY') && Array.isArray(data.items) && typeof data.hasMore === 'boolean') return data;
    } catch (error) {
      if (error instanceof Error && 'status' in error && error.status === 403) return { status: 'RESTRICTED', items: [], hasMore: false };
    }
    return { status: 'UNAVAILABLE', items: [], hasMore: false };
  }
  name = 'SQLSERVER_BACKEND' as const;

  private baseUrl = '/api/v1';

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = AuthService.getAccessToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Correlation-ID': crypto.randomUUID(),
      ...(options.headers as Record<string, string> || {})
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers
    });

    if (!response.ok) {
      const errorJson = await response.json().catch(() => ({}));
      throw Object.assign(new Error(errorJson?.error?.message || `HTTP error ${response.status}`), { status: response.status });
    }

    return response.json();
  }

  // گردش و مانده: بدون fallback به داده محلی؛ خطا/نبود Endpoint ⇒ UNAVAILABLE (نه مانده ساختگی)
  async getJournalLines(filter?: JournalLineFilter, pagination?: PaginationParams): Promise<JournalLinePage> {
    return this.request<JournalLinePage>(`/ledger/journal-lines?${journalQueryParams(filter, pagination)}`);
  }

  async getLedgerSources(): Promise<{ items: LedgerBookSource[] }> {
    return this.request<{ items: LedgerBookSource[] }>('/ledger/sources');
  }

  async getLedgerBooks(filter: LedgerBookFilter): Promise<LedgerBookPage> {
    const params = new URLSearchParams({ from:filter.from,to:filter.to,page:String(filter.page) });
    for (const key of ['source','currency','role','search'] as const) {
      const value = filter[key];
      if (value) params.set(key,value);
    }
    return this.request<LedgerBookPage>(`/ledger/books?${params}`);
  }

  async getDetailSubsidiaryBalances(options?: LedgerBalanceOptions): Promise<DetailBalancesResult> {
    try {
      const q = new URLSearchParams();
      if (options?.detailKey) q.set('detailKey', options.detailKey);
      if (options?.byPeriod) q.set('byPeriod', '1');
      if (options?.source) q.set('source',options.source);
      if (options?.currency) q.set('currency',options.currency);
      if (options?.role) q.set('role',options.role);
      return await this.request<DetailBalancesResult>(`/ledger/balances?${q.toString()}`);
    } catch (e) {
      return { status: 'UNAVAILABLE', source: 'SQLSERVER_BACKEND', balances: [], reason: e instanceof Error ? e.message : 'ledger endpoint unavailable' };
    }
  }

  async getLedgerPnlData(filter?: Pick<JournalLineFilter, 'fromDate' | 'toDate' | 'periodCode' | 'source' | 'currency'>): Promise<LedgerPnlDataResult> {
    try {
      const q = new URLSearchParams();
      for (const key of ['fromDate','toDate','periodCode','source','currency'] as const) {
        const value = filter?.[key];
        if (value) q.set(key,value);
      }
      return await this.request<LedgerPnlDataResult>(`/ledger/pnl?${q}`);
    } catch (e) {
      return {
        status: e instanceof Error && 'status' in e && e.status === 403 ? 'RESTRICTED' : 'UNAVAILABLE',
        source: this.name,
        journalLines: [],
        coaMirror: [],
        reason: e instanceof Error ? e.message : 'ledger pnl data unavailable'
      };
    }
  }

  /** REST list endpoints answer { items, total, ... }; some callers want a plain array. */
  private asList<T>(payload: any): T[] { return Array.isArray(payload) ? payload : (payload?.items ?? []); }

  // بدون fallback پنهان به داده محلی: خالی = خالیِ واقعی سرور؛ خطا ⇒ پرتاب می‌شود تا UI وضعیت UNAVAILABLE نشان دهد.
  async getAccounts(filter?: any, pagination?: PaginationParams): Promise<PaginatedResult<Account>> {
    const q = new URLSearchParams();
    if (pagination?.page) q.set('page', String(pagination.page));
    if (pagination?.pageSize) q.set('pageSize', String(pagination.pageSize));
    if (filter?.name) q.set('search', filter.name);
    const res = await this.request<PaginatedResult<Account>>(`/accounts?${q.toString()}`);
    if (res && Array.isArray(res.items)) return res;
    return { items: [], total: 0, page: pagination?.page || 1, pageSize: pagination?.pageSize || 25, totalPages: 0 };
  }

  async getAccountById(id: string): Promise<Account | null> {
    const res = await this.request<Account>(`/accounts/${encodeURIComponent(id)}`);
    return res || null;
  }

  async createAccount(account: Partial<Account>, idempotencyKey?: string): Promise<Account> {
    return this.request<Account>('/accounts', {
      method: 'POST',
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
      body: JSON.stringify(account)
    });
  }

  async submitCustomerProposal(draftAccountId: string): Promise<CustomerProposalReceipt> {
    const response = await this.request<Parameters<typeof readCustomerProposalReceipt>[0]>('/accounts/proposals', {
      method: 'POST',
      body: JSON.stringify({ draftAccountId })
    });
    const receipt = readCustomerProposalReceipt(response);
    if (!receipt) throw new Error('سرور رسید معتبر ثبت پیشنهاد را برنگرداند.');
    return receipt;
  }

  async updateAccount(id: string, patch: Partial<Account>): Promise<Account> {
    return this.request<Account>(`/accounts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(patch)
    });
  }

  async getQuotes(filter?: any, pagination?: PaginationParams): Promise<PaginatedResult<Quote>> {
    return this.request<PaginatedResult<Quote>>(`/quotes?${this.listQuery(filter, pagination)}`);
  }

  async getQuoteById(id: string): Promise<Quote | null> {
    return this.request<Quote>(`/quotes/${id}`);
  }

  async createQuote(quote: Partial<Quote>, idempotencyKey?: string): Promise<Quote> {
    return this.request<Quote>('/quotes', {
      method: 'POST',
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
      body: JSON.stringify(quote)
    });
  }

  async updateQuote(id: string, patch: Partial<Quote>): Promise<Quote> {
    return this.request<Quote>(`/quotes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(patch)
    });
  }
  async decideQuote(id:string,input:{commandId:string;action:QuoteDecisionAction;expectedAt:string;expectedBasis:string}):Promise<{quote:Quote;replayed:boolean}> {
    return this.request(`/quotes/${encodeURIComponent(id)}/decision`,{method:'POST',body:JSON.stringify(input)});
  }

  async getTasks(filter?: any, pagination?: PaginationParams): Promise<PaginatedResult<Task>> {
    return this.request<PaginatedResult<Task>>(`/tasks?${this.listQuery(filter, pagination)}`);
  }

  async getTaskById(id: string): Promise<Task | null> {
    return this.request<Task>(`/tasks/${id}`);
  }

  async listTaskRequests(view:TaskRequestView,search:string,page:number): Promise<TaskRequestPage> {
    return this.request(`/tasks/requests?${new URLSearchParams({view,search,page:String(page)})}`);
  }
  async listTaskRequestFiles(id:string): Promise<{items:TaskRequestFile[]}> { return this.request(`/tasks/requests/${encodeURIComponent(id)}/files`); }
  async getTaskRequestFile(id:string,fileId:string): Promise<TaskRequestFile & {data:string}> {
    return this.request(`/tasks/requests/${encodeURIComponent(id)}/files/${encodeURIComponent(fileId)}`);
  }
  async uploadTaskRequestFile(id:string,file:File,uploadId:string): Promise<TaskRequestFile> {
    const params=new URLSearchParams({name:file.name,type:file.type,uploadId});
    return this.request(`/tasks/requests/${encodeURIComponent(id)}/files?${params}`,{method:'POST',
      headers:{'Content-Type':'application/octet-stream'},body:file});
  }
  async getTaskRequest(id:string): Promise<TaskRequestRecord> {
    return this.request(`/tasks/requests/${encodeURIComponent(id)}`);
  }
  async submitTaskRequest(input:TaskRequestInput): Promise<TaskRequestRecord> {
    return this.request('/tasks/requests',{method:'POST',body:JSON.stringify(input)});
  }
  async changeTaskRequest(id:string,input:TaskRequestCommand): Promise<TaskRequestRecord | {task:null;version:string}> {
    return this.request(`/tasks/requests/${encodeURIComponent(id)}/actions`,{method:'POST',body:JSON.stringify(input)});
  }
  async getTaskRequestDirectory(search:string,context?:'recruitment'): Promise<{items:{id:string;name:string}[]}> {
    const params=new URLSearchParams({search});
    if (context) params.set('context',context);
    return this.request(`/tasks/request-directory?${params}`);
  }
  async getTaskRequestResources(type:TaskRequestResource,accountId:string,search:string): Promise<{items:{id:string;title:string;unit?:string;sku?:string}[]}> {
    return this.request(`/tasks/request-resources?${new URLSearchParams({type,accountId,search})}`);
  }
  async getReportingLines(): Promise<{items:ReportingLine[]}> {
    return this.request('/organization/reporting-lines');
  }
  async changeReportingLine(userId:string,input:ReportingLineChange): Promise<{changed:boolean;replayed:boolean}> {
    return this.request(`/organization/reporting-lines/${encodeURIComponent(userId)}`,{method:'PUT',body:JSON.stringify(input)});
  }
  async getTaskRequestPolicies(): Promise<{items:(TaskRequestApprovalPolicy & {kind:TaskRequestPolicyKind})[]}> {
    return this.request('/tasks/request-policies');
  }
  async saveTaskRequestPolicy(kind:TaskRequestPolicyKind,policy:TaskRequestApprovalPolicy): Promise<TaskRequestApprovalPolicy> {
    return this.request(`/tasks/request-policies/${kind}`,{method:'PUT',body:JSON.stringify(policy)});
  }

  async getTaskWorkflow(id: string): Promise<TaskWorkflowRecord> {
    return this.request<TaskWorkflowRecord>(`/tasks/${encodeURIComponent(id)}/workflow`);
  }

  async changeTaskWorkflow(id: string, command: TaskWorkflowCommand): Promise<TaskWorkflowRecord> {
    return this.request<TaskWorkflowRecord>(`/tasks/${encodeURIComponent(id)}/workflow`, {
      method: 'POST', body: JSON.stringify(command),
    });
  }

  async createTask(task: Partial<Task>, idempotencyKey?: string): Promise<Task> {
    return this.request<Task>('/tasks', {
      method: 'POST',
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
      body: JSON.stringify(task)
    });
  }

  async updateTask(id: string, patch: Partial<Task>): Promise<Task> {
    return this.request<Task>(`/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(patch)
    });
  }

  private listQuery(filter?: any, pagination?: PaginationParams): string {
    const q = new URLSearchParams();
    if (pagination?.page) q.set('page', String(pagination.page));
    q.set('pageSize', String(pagination?.pageSize || 200));
    if (pagination?.sortBy) q.set('sortBy', pagination.sortBy);
    if (pagination?.sortDirection) q.set('sortDirection', pagination.sortDirection);
    for (const [key, value] of Object.entries(filter || {})) if (typeof value === 'string' && value) q.set(key === 'name' ? 'search' : key, value);
    return q.toString();
  }

  async getInvoices(filter?: any, pagination?: PaginationParams): Promise<PaginatedResult<Invoice>> {
    return this.request<PaginatedResult<Invoice>>(`/invoices?${this.listQuery(filter, pagination)}`);
  }

  async getPayments(filter?: any, pagination?: PaginationParams): Promise<PaginatedResult<Payment>> {
    return this.request<PaginatedResult<Payment>>(`/payments?${this.listQuery(filter, pagination)}`);
  }

  async getCheques(filter?: any, pagination?: PaginationParams): Promise<PaginatedResult<Cheque>> {
    return this.request<PaginatedResult<Cheque>>(`/cheques?${this.listQuery(filter, pagination)}`);
  }

  async createPayment(payment: Partial<Payment>, idempotencyKey?: string): Promise<Payment> {
    return this.request<Payment>('/payments', {
      method: 'POST',
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
      body: JSON.stringify(payment)
    });
  }

  async getPayslips(userId?: string, month?: string): Promise<Payslip[]> {
    const q = new URLSearchParams();
    if (userId) q.set('userId', userId);
    if (month) q.set('month', month);
    return this.asList<Payslip>(await this.request<any>(`/payroll/payslips?${q.toString()}&pageSize=200`));
  }

  async getAdvanceRequests(userId?: string): Promise<AdvanceRequest[]> {
    const q = new URLSearchParams();
    if (userId) q.set('userId', userId);
    return this.asList<AdvanceRequest>(await this.request<any>(`/payroll/advances?${q.toString()}&pageSize=200`));
  }

  async createAdvanceRequest(req: Partial<AdvanceRequest>): Promise<AdvanceRequest> {
    return this.request<AdvanceRequest>('/payroll/advances', {
      method: 'POST',
      body: JSON.stringify(req)
    });
  }

  async executePayrollRun(month: string, basis: number): Promise<PayrollRun> {
    return this.request<PayrollRun>('/payroll/runs', {
      method: 'POST',
      body: JSON.stringify({ periodMonth: month, dailyBasis: basis })
    });
  }

  async getJournalFollowUpEvidence(taskId: string): Promise<JournalFollowUpEvidence> {
    return this.request<JournalFollowUpEvidence>(`/finance/journal-coverage/follow-up/${encodeURIComponent(taskId)}`);
  }

  async createJournalCoverageFollowUp(period: MoneyPeriod, operation: JournalOperation, externalId: string): Promise<{ id: string; replayed: boolean }> {
    return this.request<{ id: string; replayed: boolean }>('/finance/journal-coverage/follow-up',{
      method:'POST',body:JSON.stringify({from:period.from,to:period.to,operation,externalId}),
    });
  }

  async getJournalCoverage(period: MoneyPeriod, filter: JournalCoverageFilter): Promise<JournalCoveragePage> {
    const params = new URLSearchParams({ from: period.from, to: period.to, page: String(filter.page) });
    if (filter.state) params.set('state',filter.state);
    if (filter.operation) params.set('operation',filter.operation);
    if (filter.returnReason!==undefined) params.set('returnReason',filter.returnReason);
    if (filter.search) params.set('search',filter.search);
    return this.request<JournalCoveragePage>(`/finance/journal-coverage?${params}`);
  }

  async getMoneyReport(period: MoneyPeriod): Promise<MoneyReport> {
    try {
      const params = new URLSearchParams({ ...period });
      return await this.request<MoneyReport>(`/finance/money-intelligence?${params}`);
    } catch (error) {
      if (error instanceof Error && 'status' in error && error.status === 403) {
        return { status: 'RESTRICTED', reason: 'مشاهدهٔ گزارش تلفیقی به مجوز مالی در سطح سازمان نیاز دارد.' };
      }
      throw error;
    }
  }

  async getMoneyEvidence(period: MoneyPeriod, filter: MoneyEvidenceFilter): Promise<MoneyEvidencePage> {
    const params = new URLSearchParams({ ...period, mode: filter.mode, page: String(filter.page) });
    if (filter.key !== undefined) params.set('key', filter.key);
    if (filter.detail !== undefined) params.set('detail', filter.detail);
    if (filter.signal) params.set('signal', filter.signal);
    if (filter.search) params.set('search', filter.search);
    return this.request<MoneyEvidencePage>(`/finance/money-intelligence?${params}`);
  }

  async getCashFlowData(): Promise<CashFlowDataResult> {
    const empty = { cheques: [], supplierBills: [], expenses: [], treasuryAccounts: [], treasuryTransactions: [] };
    try {
      return await this.request<CashFlowDataResult>('/finance/cash-flow');
    } catch (error) {
      const restricted = error instanceof Error && 'status' in error && error.status === 403;
      return { ...empty, status: restricted ? 'RESTRICTED' : 'UNAVAILABLE', source: this.name,
        missingSources: [...CASH_FLOW_SOURCES], bankVerification: 'NOT_VERIFIED',
        reason: restricted ? 'پیش‌بینی خزانه به مجوز مالی در سطح سازمان نیاز دارد.'
          : 'داده‌های خزانه از سرور در دسترس نیست.' };
    }
  }

  async getGeoZones(): Promise<GeoZone[]> {
    return this.asList<GeoZone>(await this.request<any>('/geo/zones?pageSize=200'));
  }

  async saveGeoZone(zone: Partial<GeoZone>): Promise<GeoZone> {
    return this.request<GeoZone>('/geo/zones', {
      method: 'POST',
      body: JSON.stringify(zone)
    });
  }

  async getZoneAssignments(): Promise<ZoneAssignment[]> {
    return this.readSnapshotCollection<ZoneAssignment>('zoneAssignments', 'انتساب زون‌ها');
  }

  async getPaymentAllocations(): Promise<PaymentAllocation[]> {
    return this.readSnapshotCollection<PaymentAllocation>('paymentAllocations', 'تخصیص دریافت‌ها');
  }

  private async readSnapshotCollection<T>(name: 'zoneAssignments' | 'paymentAllocations', label: string): Promise<T[]> {
    const snapshot = await this.request<StateSnapshot>(`/state/snapshot?includeEmpty=${name}`);
    if (snapshot.hiddenCollections?.includes(name)) {
      throw new Error(`مجوز مشاهدهٔ ${label} وجود ندارد.`);
    }
    const records = snapshot.collections?.[name];
    if (!Array.isArray(records)) {
      throw new Error(`منبع ${label} در پاسخ سرور موجود نیست.`);
    }
    return records as unknown as T[];
  }

  // --- Financial Intelligence: داده از اسنپ‌شات سرور (مجوز/پروفایل دسترسی سمت سرور اعمال می‌شود) و همان موتور مشترک ---
  private async scopedState(): Promise<{ state: any; hidden: string[] }> {
    const snap = await this.getStateSnapshot();
    return stateFromSnapshot(snap, { currentUserId: useAppStore.getState().state.currentUserId });
  }
  async getApprovalContext(ref: ApprovalRef, opts?: ContextOptions): Promise<ApprovalContext | null> {
    const { state, hidden } = await this.scopedState();
    return buildApprovalContext(state, ref, withViewer(state, { ...opts, hiddenCollections: [...hidden, ...(opts?.hiddenCollections || [])] }));
  }
  async getFinancial360(subject: SubjectRef, opts?: ContextOptions): Promise<FinancialContext> {
    const { state, hidden } = await this.scopedState();
    return buildFinancial360(state, subject, withViewer(state, { ...opts, hiddenCollections: [...hidden, ...(opts?.hiddenCollections || [])] }));
  }
  async previewAccountingMapping(input: ClassificationInput): Promise<MappingResolution> {
    const { state } = await this.scopedState();
    return resolveAccountingMapping(state, input);
  }
  async recordApprovalSnapshot(snapshot: ApprovalSnapshot): Promise<{ ok: boolean; duplicate?: boolean }> {
    const r = await this.syncStateChanges({ upserts: { approvalSnapshots: [snapshot] }, deletes: {}, singletons: {} });
    return { ok: r.ok && r.rejected.length === 0 };
  }

  async getAnalyticsReport(reportId: number): Promise<any> {
    return this.request<any>(`/analytics/reports/${reportId}`);
  }

  // --- SQL-first state layer ---
  async getStateSnapshot(view?: 'chat'): Promise<StateSnapshot> {
    return this.request<StateSnapshot>(view === 'chat' ? '/state/snapshot?view=chat' : '/state/snapshot');
  }
  async syncStateChanges(change: { upserts: Record<string, any[]>; deletes: Record<string, string[]>; singletons: Record<string, any> }): Promise<StateSyncResult> {
    // Large change-sets (first connection, mass import) are posted in slices of ~150k characters (server cap is 1 MB/request).
    const slices: Array<typeof change> = [];
    let current: typeof change = { upserts: {}, deletes: {}, singletons: {} }; let size = 0;
    const push = () => { if (size > 0) { slices.push(current); current = { upserts: {}, deletes: {}, singletons: {} }; size = 0; } };
    for (const [name, list] of Object.entries(change.upserts)) for (const rec of list) {
      const n = JSON.stringify(rec).length;
      if (size + n > 150_000) push();
      (current.upserts[name] ||= []).push(rec); size += n;
    }
    for (const [name, ids] of Object.entries(change.deletes)) for (const id of ids) { (current.deletes[name] ||= []).push(id); size += id.length + 4; if (size > 150_000) push(); }
    for (const [key, value] of Object.entries(change.singletons)) {
      const n = JSON.stringify(value ?? null).length;
      if (size + n > 150_000) push();
      current.singletons[key] = value; size += n;
    }
    push();
    const total: StateSyncResult = { ok: true, upserted: 0, deleted: 0, serverVersion: 0, rejected: [] };
    for (const slice of slices.length ? slices : [change]) {
      const r = await this.request<StateSyncResult>('/state/sync', { method: 'POST', body: JSON.stringify(slice) });
      total.upserted += r.upserted; total.deleted += r.deleted; total.serverVersion = r.serverVersion; total.rejected.push(...r.rejected);
    }
    return total;
  }
  async bootstrapState(state: any): Promise<{ ok: boolean; upserted: number; rejected: any[]; serverVersion: number }> {
    // send collection-by-collection slices so no request exceeds the server body limit (256 KB per request is enforced server-side)
    const split = splitState(state, stateRegistry);
    let upserted = 0; let serverVersion = 0; const rejected: any[] = [];
    const flush = async (slice: Record<string, any>) => {
      const r = await this.request<any>('/state/bootstrap', { method: 'POST', body: JSON.stringify({ state: slice }) });
      upserted += r.upserted || 0; serverVersion = r.serverVersion || serverVersion; rejected.push(...(r.rejected || []));
    };
    let slice: Record<string, any> = {}; let size = 0;
    const entries: Array<[string, any]> = [...Object.entries(split.collections).map(([n, m]) => [n, [...m.values()]] as [string, any]), ...Object.entries(split.singletons)];
    for (const [name, value] of entries) {
      const items: any[] = Array.isArray(value) && split.collections[name] ? value : [value];
      const isCollection = Boolean(split.collections[name]);
      let part: any[] = []; let partSize = 0;
      for (const item of items) {
        const itemSize = JSON.stringify(item).length;
        if (size + partSize + itemSize > 150_000 && (part.length || Object.keys(slice).length)) {
          if (part.length) slice[name] = isCollection ? part : part[0];
          await flush(slice); slice = {}; size = 0; part = []; partSize = 0;
        }
        part.push(item); partSize += itemSize;
      }
      if (part.length) { slice[name] = isCollection ? part : part[0]; size += partSize; }
    }
    if (Object.keys(slice).length) await flush(slice);
    return { ok: true, upserted, rejected, serverVersion };
  }
  async getErpSyncOverview(): Promise<ErpSyncOverview> {
    try {
      const result = await this.request<ErpSyncOverview>('/integrations/erp/sync-overview');
      if ((result?.status === 'AVAILABLE' || result?.status === 'EMPTY') && Array.isArray(result.items)) return result;
      return { status: 'UNAVAILABLE', items: [] };
    } catch (error) {
      return { status: error instanceof Error && 'status' in error && error.status === 403 ? 'RESTRICTED' : 'UNAVAILABLE', items: [] };
    }
  }
  async getStateCounts(collections: readonly string[]): Promise<StateCollectionCounts> {
    const params = new URLSearchParams({ includeEmpty: collections.join(',') });
    const result = await this.request<StateCollectionCounts>(`/state/counts?${params}`);
    if (!result?.collections || !Array.isArray(result.hiddenCollections)) {
      throw new Error('قالب پاسخ شمارش مجموعه‌ها معتبر نیست.');
    }
    return result;
  }
  async getStateIntegrity() { return this.request<any>('/state/integrity'); }
  async getStateProfile() { return this.request<any>('/state/profile'); }
}

/**
 * متد مرجع انتخاب ارائه‌دهنده داده فعال در سامانه
 */
export function getActiveDataProvider(): DataProvider {
  const providerType = import.meta.env?.VITE_DATA_PROVIDER || (typeof window !== 'undefined' ? localStorage.getItem('akhavan_data_provider') : null);
  if (providerType === 'client' || providerType === 'CLIENT_INDEXEDDB') {
    return new ClientStorageDataProvider();
  }
  return new HttpBackendDataProvider();
}
