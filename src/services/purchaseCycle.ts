export type PurchaseCycleView = 'all' | 'follow-up';

export interface PurchaseCycleRow {
  accountId:string; source:string; name:string; owner:string|null; territory:string|null;
  purchaseDays:number; daysSince:number; medianGap:number|null; followUp:0|1;
  lastPurchase:string; lastInvoiceCount:number; lastInvoiceNumber:string|null; lastSynced:string;
  observedSales:string; recentSales:string; previousSales:string;
  planned:number; checkedIn:number; latestCheckIn:string|null;
}

export interface PurchaseCycleResult {
  asOf:string;
  configured:boolean;
  rows:PurchaseCycleRow[];
  hasMore:boolean;
  coverage:PurchaseCoverageRow[];
}

export interface PurchaseCoverageScope {territory:string;owner:string}
export interface PurchaseCoverageRow {
  territoryId:string;ownerId:string;territory:string;owner:string;observedCustomers:number;needingFollowUp:number|null;planned:number;checkedIn:number;
  followUpWithoutCheckIn:number|null;
  followUpWithoutVisitEvidence:number|null;
}

export interface PurchaseProductHint {
  productId:string;name:string;sku:string|null;priorDays:number;lastSeen:string;lastInvoiceNumber:string;
}
export interface PurchaseProductResult {asOf:string;rows:PurchaseProductHint[]}
