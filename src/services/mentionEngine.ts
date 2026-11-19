import type { AppState } from '../types.ts';
import { OPERATIONS_CONFIG } from '../config/operations.ts';
import { normalizePersianText } from '../lib/utils.ts';

export type MentionEntityType = 'CUSTOMER' | 'STAFF' | 'CHECK' | 'INVOICE' | 'PRODUCT' | 'WAREHOUSE' | 'TASK' | 'QUOTE' | 'OPPORTUNITY' | 'CASE' | 'REQUEST' | 'UNKNOWN';
export interface MentionEntity { entityType: MentionEntityType; entityId: string; displayText: string; subtitle?: string; source: 'CRM' | 'ERP_MIRROR'; metadata?: Record<string, unknown>; }
export interface MentionToken { start: number; end: number; query: string; }
export interface MentionSearchOptions { preferredTypes?: MentionEntityType[]; maxResults?: number; }

export function findMentionToken(text: string, caret = text.length): MentionToken | null {
  const prefix = text.slice(0, Math.max(0, Math.min(caret, text.length)));
  const at = prefix.lastIndexOf('@');
  if (at < 0 || (/\s/.test(prefix.slice(at + 1)) && !prefix.slice(at + 1).trim())) return null;
  const before = at > 0 ? prefix[at - 1] : '';
  if (before && /[\w\u0600-\u06FF]/.test(before)) return null;
  const query = prefix.slice(at + 1);
  if (/[\n\r]/.test(query)) return null;
  return { start: at, end: caret, query };
}

function hasDeleted(item: Record<string, unknown>): boolean { 
  return item?.isDeleted === true || Boolean(item?.deletedAt || item?.DeletedAtUtc); 
}

function pick(item: unknown, keys: string[]): string { 
  for (const key of keys) {
    if (item?.[key] !== undefined && item?.[key] !== null && String(item[key]).trim()) {
      return String(item[key]);
    }
  }
  return ''; 
}

/** جست‌وجوی هوشمند منشن‌ها روی مخزن داده محلی CRM با استفاده از موتور نرمال‌سازی کانونیکال */
export function searchMentions(state: AppState, query: string, options: MentionSearchOptions = {}): MentionEntity[] {
  const q = normalizePersianText(query);
  if (!q) return [];
  const found: MentionEntity[] = [];
  
  const add = (items: unknown[] | undefined, type: MentionEntityType, source: MentionEntity['source'], nameKeys: string[], idKeys = ['id','code','erpId'], subtitleKeys: string[] = []) => {
    for (const item of items || []) {
      if (!item || hasDeleted(item)) continue;
      const name = pick(item, nameKeys); 
      const id = pick(item, idKeys);
      if (!name || !id) continue;
      const haystack = normalizePersianText([name, id, ...subtitleKeys.map(k => item[k])].join(' '));
      if (!haystack.includes(q)) continue;
      found.push({ 
        entityType: type, 
        entityId: id, 
        displayText: name, 
        subtitle: pick(item, subtitleKeys), 
        source, 
        metadata: { code: item.code ?? item.erpCode ?? undefined } 
      });
    }
  };

  add(state.accounts, 'CUSTOMER', 'CRM', ['name','companyName','displayName'], ['id','code','erpCode'], ['code','phone','city']);
  add(state.users, 'STAFF', 'CRM', ['name','fullName','username'], ['id','employeeCode'], ['roleId','phone','territoryId']);
  add(state.cheques as Record<string, unknown>[], 'CHECK', 'ERP_MIRROR', ['number','chequeNumber','displayName','title'], ['id','erpId','number'], ['bankName','status','amount']);
  add(state.invoices as Record<string, unknown>[], 'INVOICE', 'ERP_MIRROR', ['number','invoiceNumber','title','displayName'], ['id','erpId','number'], ['accountName','status','amount']);
  add(state.externalProducts as Record<string, unknown>[], 'PRODUCT', 'ERP_MIRROR', ['name','title','sku','code'], ['id','sku','code'], ['category','brand']);
  add(state.tasks as Record<string, unknown>[], 'TASK', 'CRM', ['title','name'], ['id','code'], ['status','dueDate']);
  add(state.quotes as Record<string, unknown>[], 'QUOTE', 'CRM', ['quoteNumber','number','title','name'], ['id','quoteNumber','number'], ['status','accountId']);
  add((state as Record<string, unknown>).opportunities, 'OPPORTUNITY', 'CRM', ['title','name','number'], ['id','code','number'], ['status','accountName','accountId','stage']);
  add((state as Record<string, unknown>).cases, 'CASE', 'CRM', ['title','subject','name','number'], ['id','code','number'], ['status','priority','accountName','accountId']);
  add((state as Record<string, unknown>).requests ?? (state as Record<string, unknown>).internalRequests ?? (state as Record<string, unknown>).onboardingApplications, 'REQUEST', 'CRM', ['title','subject','name','requestNumber'], ['id','code','requestNumber'], ['status','type','requestType']);
  add((state as Record<string, unknown>).warehouses, 'WAREHOUSE', 'ERP_MIRROR', ['name','title','code','warehouseName'], ['id','code','erpId'], ['code','city','status']);

  const typeRank = (type: MentionEntityType) => options.preferredTypes?.indexOf(type) ?? -1;
  return found.sort((a,b) => {
    const ar = typeRank(a.entityType), br = typeRank(b.entityType);
    if (ar >= 0 || br >= 0) return (ar < 0 ? 999 : ar) - (br < 0 ? 999 : br);
    return Number(normalizePersianText(a.displayText) !== q) - Number(normalizePersianText(b.displayText) !== q) || a.displayText.localeCompare(b.displayText);
  }).slice(0, Math.max(1, options.maxResults || OPERATIONS_CONFIG.mentionMaxResults));
}

export function createMentionReference(entity: MentionEntity): { entityType: MentionEntityType; entityId: string; displayText: string; source: string } {
  return { entityType: entity.entityType, entityId: entity.entityId, displayText: entity.displayText, source: entity.source };
}
