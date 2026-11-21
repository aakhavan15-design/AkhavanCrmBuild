export type TaskRequestKind = 'GENERAL' | 'PRICE_INQUIRY' | 'PRICE_PERMISSION' | 'ORDER_APPROVAL' | 'FINANCE' | 'COLLECTION' | 'COMMERCE' | 'HR';
export type RequestPriority = 'NORMAL' | 'HIGH' | 'URGENT';
export type TaskRequestView = 'ALL' | 'MINE' | 'CREATED' | 'WATCHING' | 'TEAM' | 'WAITING' | 'OVERDUE' | 'CLOSED';
export interface TaskRequestLink { type: 'ORDER' | 'INVOICE' | 'CHEQUE'; id: string }
export interface TaskPriceItem { productId: string; price: string; quantity: string; title?: string; unit?: string }
export interface TaskRequestInput {
  requestId: string; kind: TaskRequestKind; title: string; description: string; priority: RequestPriority;
  assigneeId: string; accountId: string | null; dueDate: string | null; confidential: boolean; watchers: string[];
  links: TaskRequestLink[]; priceItems: TaskPriceItem[];
}
export interface TaskRequestSummary {
  id: string; title: string; status: string; priority: RequestPriority; assigneeId: string; assignee?: string;
  creator?: string; version: string; dueDate?: string; accountId?: string; kind: TaskRequestKind;
  createdBy: string; assignedAt: string; seen: boolean; nextAction?: string; canDecide: boolean; watching: boolean;
}
export interface TaskRequestOrder {
  id: string; number: string; status: string; currency: string; total: string; discount: string;
  lines: { number: number; product: string; title: string; quantity: string; unit?: string; price: string;
    discount: string; total: string; cost?: string | null; margin?: string | null }[];
}
export interface TaskRequestRecord {
  task: {
    id: string; title: string; description: string; status: string; priority: RequestPriority; accountId: string | null;
    nextAction?: string; assigneeId: string; createdBy: string; dueDate?: string | null;
    activityHistory: {id:string; actorId:string; at:string; summary:string; details?:string}[];
    managedRequest: {
      kind: TaskRequestKind; contentRevision: number; confidential: boolean; watchers:string[]; links:TaskRequestLink[];
      seenBy:string[]; priceItems:TaskPriceItem[]; activeApprovers:string[];
      assignedAt:string; condition?: {text:string; evidence?:string | null}; authorization?: {expiresOn:string;maxUses:number;items:TaskPriceItem[]};
    };
  };
  version: string;
  permissions: {canFiles:boolean;canUpload?:boolean;canWatch:boolean;isWatcher:boolean;isManager:boolean;actions:string[]};
  assignee?:string; creator?:string; account?:{id:string;name:string}|null; order?:TaskRequestOrder|null;
  stale?:boolean; approval?:{index:number;total:number;required:number;received:number}|null;
}
export interface TaskRequestCommand {
  commandId:string; version:string; action:string; note:string; nextAction?:string; assigneeId?:string;
  priority?:RequestPriority; watchers?:string[]; condition?:string; revision?:TaskRequestInput;
  priceClass?:string; paymentTerms?:string; expiresOn?:string; maxUses?:number;
  priceItems?:{productId:string;price:string}[];
}
export type TaskRequestPolicyKind = 'PRICE_PERMISSION' | 'ORDER_APPROVAL';
export interface TaskRequestApprovalPolicy { version:number; enabled:boolean; steps:{members:string[];required:number}[] }
export interface TaskRequestFile { id:string; name:string; type:string; size:number }
export const requestKinds = [
  {value:'GENERAL',label:'درخواست کاری'},
  {value:'PRICE_INQUIRY',label:'استعلام قیمت'},
  {value:'PRICE_PERMISSION',label:'مجوز قیمت ویژه'},
  {value:'ORDER_APPROVAL',label:'تأیید سفارش'},
  {value:'FINANCE',label:'مالی و خزانه'},
  {value:'COLLECTION',label:'وصول مطالبات'},
  {value:'COMMERCE',label:'بازرگانی'},
  {value:'HR',label:'منابع انسانی'},
] as const;
export const requestPriorities = [{value:'NORMAL',label:'عادی'},{value:'HIGH',label:'مهم'},{value:'URGENT',label:'بسیار مهم'}] as const;
export const requestStatusLabels:Record<string,string> = {OPEN:'در انتظار اقدام',IN_PROGRESS:'در حال پیگیری',BLOCKED:'متوقف',
  NEEDS_INFO:'در انتظار پاسخ',PENDING_APPROVAL:'در انتظار تأیید',CONDITIONAL:'تأیید مشروط',APPROVED:'تأییدشده',
  REJECTED:'ردشده',COMPLETED:'تکمیل‌شده',CANCELLED:'لغوشده'};
