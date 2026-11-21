type Amount = string | null;

export type MoneyDimension = 'category' | 'center' | 'party' | 'month';
export interface MoneyPeriod { from: string; to: string; dimension: MoneyDimension }
export interface MoneyEvidenceFilter {
  mode: 'cash' | 'outflow' | 'expense' | 'role' | 'balance' | 'opening' | 'review' | 'fifo' | 'profit' | 'bank' | 'cash-accounts' | 'cash-account';
  key?: string;
  detail?: string;
  page: number;
  search?: string;
}
export interface MoneyCashRow {
  date: string;
  inflow: string;
  outflow: string;
  transfers: string;
  unresolved: string;
  net: string;
}
export interface MoneyGroup {
  kind: 'outflow' | 'expense';
  groupCode: string | null;
  title: string | null;
  amount: string;
  priorAmount: Amount;
  difference: Amount;
  documents: number;
  priorDocuments: number;
  groupCount: number;
  unusualDocuments: number | null;
  repeatCount: number;
}
export interface MoneyPosition { opening: Amount; closing: Amount }
export type MoneyReport = {
  status: 'UNAVAILABLE' | 'RESTRICTED';
  reason: string;
} | {
  status: 'AVAILABLE' | 'PARTIAL';
  sourceSystem: string;
  openingDate: string;
  verifiedThrough: string;
  updatedAt: string | null;
  periodCovered: boolean;
  priorCovered: boolean;
  excludedDocuments: number;
  mixedDocuments: number;
  bank: {
    status: 'NOT_VERIFIED' | 'PARTIAL' | 'VERIFIED' | 'MISMATCH';
    closing: Amount;
    unmatched: Amount;
    sourceSystem?: string;
    updatedAt?: string;
  };
  cash: MoneyPosition & { inflow: Amount; outflow: Amount; transfers: Amount; unresolved: Amount; net: Amount };
  trend: MoneyCashRow[];
  netProfit: Amount;
  bridge: { role: string; amount: string }[];
  balances: (MoneyPosition & { role: string })[];
  grouped: MoneyGroup[];
  unallocated: Amount;
  unallocatedDocuments: number;
  fifo: MoneyPosition;
  workingCapital: MoneyPosition & { change: Amount };
};
export interface MoneyJournalLine {
  journalId: string;
  lineId: string | null;
  documentNumber: string;
  documentType: string;
  externalJournalId: string;
  date: string;
  issue: string | null;
  accountCode: string | null;
  accountTitle: string | null;
  detailCode: string | null;
  partyId: string | null;
  partyTitle: string | null;
  centerTitle: string | null;
  categoryTitle: string | null;
  role: string | null;
  refType: string | null;
  refId: string | null;
  debit: Amount;
  credit: Amount;
}
export interface MoneyInventoryPosition {
  runId: string;
  productId: string;
  warehouseId: string;
  unitCode: string;
  quantity: string;
  amount: string;
  date: string;
  sourceProof: string;
}
export interface MoneyBankControl {
  controlId: string;
  batchId: string;
  sourceSystem: string;
  finishedAt: string;
  metric: 'BANK_CLOSING_IRR' | 'BANK_UNMATCHED_GROSS_IRR';
  result: 'MATCHED' | 'MISMATCH' | 'SOURCE_UNAVAILABLE' | 'NOT_COMPARABLE';
  amount: Amount;
  comparisonAmount: Amount;
}
export interface MoneyCashAccount extends MoneyPosition {
  accountCode: string;
  detailCode: string | null;
  accountTitle: string | null;
  partyTitle: string | null;
  periodDebit: string;
  periodCredit: string;
}
export interface MoneyEvidencePage {
  items: (MoneyJournalLine | MoneyInventoryPosition | MoneyBankControl | MoneyCashAccount)[];
  hasMore: boolean;
}
