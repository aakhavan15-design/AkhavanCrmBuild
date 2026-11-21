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
}
