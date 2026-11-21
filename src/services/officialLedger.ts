export interface LedgerBookScope { source: string; currency: string }
export interface LedgerBookSource extends LedgerBookScope { title: string }
export type LedgerRole = 'RECEIVABLE' | 'PAYABLE';
export type LedgerBalanceOptions = Partial<LedgerBookScope> & { detailKey?: string; byPeriod?: boolean; role?: LedgerRole };
export interface LedgerBookFilter extends Partial<LedgerBookScope> {
  from: string;
  to: string;
  role?: LedgerRole;
  search?: string;
  page: number;
}
export interface LedgerBookRow {
  accountCode: string;
  detailCode: string | null;
  title: string | null;
  parentCode: string | null;
  hierarchy: string | null;
  party: string | null;
  articleCount: number;
  opening: string | null;
  closing: string | null;
  debit: string;
  credit: string;
}
export type LedgerBookPage =
  | { status: 'UNAVAILABLE'; reason: string; items: []; hasMore: false }
  | (LedgerBookSource & { status: 'AVAILABLE' | 'PARTIAL'; items: LedgerBookRow[]; hasMore: boolean;
      totals: { debit: string | null; credit: string | null; difference: string | null } });
