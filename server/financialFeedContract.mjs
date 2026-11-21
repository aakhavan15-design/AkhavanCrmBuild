import { createHash } from 'node:crypto';

export const JOURNAL_FEED = 'FINANCIAL_JOURNAL';
export const REFERENCE_FEED = 'FINANCIAL_REFERENCE';
export const FIFO_FEED = 'INVENTORY_FIFO';
export const MAX_FEED_BYTES = 12 * 1024 * 1024;
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const day = /^\d{4}-\d{2}-\d{2}$/;
const instant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const amount = /^\d{1,15}(?:\.\d{1,4})?$/;
const rate = /^\d{1,11}(?:\.\d{1,8})?$/;
const total = /^\d{1,34}(?:\.\d{1,4})?$/;
const revision = /^[1-9]\d{0,19}$/;
const currency = /^[A-Z]{3}$/;

export const isFinancialUuid = value => typeof value === 'string' && uuid.test(value);
export const hashFinancialPayload = value => createHash('sha256').update(value).digest();
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const matches = (value, regex) => typeof value === 'string' && regex.test(value);
const text = (value, max) => typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
const memo = value => typeof value === 'string' && value.length<=500 && !/[\u0000\u000b\u000c\u000e-\u001f\u007f]/.test(value);
const optional = (value, check) => value == null || check(value);
const iso = (value, pattern, dateOnly) => matches(value, pattern) && value >= '1900-01-01'
  && value < '9999-01-01' && Number.isFinite(Date.parse(value))
  && (dateOnly ? new Date(value).toISOString().slice(0, 10) : new Date(value).toISOString()) === value;
const date = value => iso(value,day,true);
const timestamp = value => iso(value,instant,false);

export function fixedUnits(value, scale = 4) {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale,'0'));
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export const financialPayloadDigest = value => hashFinancialPayload(stable(value));

class FeedContractError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
function requireField(condition, code, message) {
  if (!condition) throw new FeedContractError(code,message);
}
const errorOf = (externalId, code, message) => ({ externalId, ruleCode: code, severity: 'ERROR', messageFa: message });
const bounded = (value, length) => Array.isArray(value) && value.length <= length;

function envelope(input) {
  requireField(object(input) && [JOURNAL_FEED, REFERENCE_FEED, FIFO_FEED].includes(input.feed) &&
    text(input.batchKey,160) && text(input.companyKey,120) && matches(input.currencyCode,currency)
    && matches(input.batchRevision,revision) && ['FULL','INCREMENTAL','REPLAY'].includes(input.mode),
  'BAD_ENVELOPE','شناسه، شرکت، ارز پایه یا نسخهٔ دستهٔ مالی معتبر نیست.');
  requireField(optional(input.previousCursor,value => text(value,200)) &&
    (input.mode === 'REPLAY' || text(input.nextCursor,200)) &&
    optional(input.watermarkUtc,timestamp),
  'BAD_CURSOR','نقطهٔ ادامهٔ دسته معتبر نیست.');
  requireField((input.windowFrom == null && input.windowTo == null) ||
    (date(input.windowFrom) && date(input.windowTo) && input.windowFrom <= input.windowTo),
  'BAD_WINDOW','محدودهٔ اعلام‌شدهٔ منبع معتبر نیست.');
}

const operationTypes = new Set(['SALES_INVOICE','SALES_RETURN','PURCHASE_INVOICE','PURCHASE_RETURN','PAYMENT','CHEQUE','PAYROLL','INVENTORY']);
function links(items) {
  requireField(bounded(items,50), 'BAD_LINKS','ارجاع‌های عملیاتی سند معتبر نیست.');
  const seen = new Set();
  return items.map(item => {
    requireField(object(item) && operationTypes.has(item.type) && text(item.id,200) && optional(item.number,value => text(value,120)),
      'BAD_LINK','ارجاع عملیات باید نوع و شناسهٔ رسمی ERP داشته باشد.');
    const key = JSON.stringify([item.type,item.id.toUpperCase()]);
    requireField(!seen.has(key),'DUPLICATE_LINK','ارجاع عملیاتی تکراری است.');
    seen.add(key);
    return { type: item.type, id: item.id, number: item.number ?? null };
  });
}

function journal(input, baseCurrency) {
  requireField(object(input) && text(input.id,200) && matches(input.revision,revision) && text(input.number,100)
    && date(input.date) && optional(input.postingDate,date) && text(input.periodCode,120)
    && text(input.type,40) && text(input.status,30) && typeof input.voided === 'boolean'
    && optional(input.description,memo) && optional(input.reference,value => text(value,200))
    && optional(input.createdAt,timestamp) && optional(input.modifiedAt,timestamp),
  'BAD_JOURNAL','هویت، تاریخ، دوره، وضعیت یا شمارهٔ سند معتبر نیست.');
  requireField(bounded(input.lines,2000) && (input.voided || input.lines.length>=2),
    'BAD_LINES','سند مؤثر باید مجموعهٔ کامل آرتیکل‌ها را داشته باشد.');

  const ids = new Set();
  const positions = new Set();
  let debit = 0n;
  let credit = 0n;
  const rows = input.lines.map(line => {
    requireField(object(line) && text(line.id,200) && Number.isInteger(line.number) && line.number>0 && line.number<=2147483647
      && text(line.accountCode,120) && optional(line.detailCode,value => text(value,120))
      && optional(line.description,memo)
      && matches(line.debit,amount) && matches(line.credit,amount), 'BAD_ARTICLE','هویت، کد حساب یا مبالغ آرتیکل معتبر نیست.');
    requireField(!positions.has(line.number) && !ids.has(line.id.toUpperCase()),'DUPLICATE_ARTICLE','شماره یا شناسهٔ آرتیکل تکراری است.');
    ids.add(line.id.toUpperCase());
    positions.add(line.number);
    const dr = fixedUnits(line.debit), cr = fixedUnits(line.credit);
    requireField(dr===0n || cr===0n,'TWO_SIDED_ARTICLE','یک آرتیکل نمی‌تواند هم‌زمان بدهکار و بستانکار باشد.');
    debit += dr;
    credit += cr;
    const originalCurrency = line.originalCurrency ?? baseCurrency;
    requireField(matches(originalCurrency,currency),'BAD_CURRENCY','ارز آرتیکل معتبر نیست.');
    const hasConversion = originalCurrency!==baseCurrency || line.originalAmount != null || line.exchangeRate != null;
    if (hasConversion) {
      requireField(matches(line.originalAmount,amount) && matches(line.exchangeRate,rate),'MISSING_FX','اصل مبلغ یا نرخ تبدیل معتبر نیست.');
      const conversion = fixedUnits(line.exchangeRate,8);
      requireField(conversion>0n && (originalCurrency!==baseCurrency || conversion===100000000n) &&
        (fixedUnits(line.originalAmount)*conversion+50000000n)/100000000n===dr+cr,
      'FX_MISMATCH','مبلغ آرتیکل با مبلغ پایه و نرخ اعلام‌شده تطبیق ندارد.');
    }
    const dimensions = line.dimensions ?? [];
    requireField(bounded(dimensions,32),'BAD_DIMENSIONS','ابعاد آرتیکل معتبر نیست.');
    const dimensionKeys = new Set();
    for (const item of dimensions) {
      requireField(object(item) && matches(item.key,/^[A-Za-z0-9_.:-]{1,40}$/) &&
        text(item.value,120) && optional(item.title,value => text(value,250)) &&
        optional(item.level,value => Number.isInteger(value) && value>0 && value<=32767),
      'BAD_DIMENSION','کلید یا مقدار بعد آرتیکل معتبر نیست.');
      requireField(!dimensionKeys.has(item.key.toUpperCase()),'DUPLICATE_DIMENSION','کلید بعد در آرتیکل تکراری است.');
      dimensionKeys.add(item.key.toUpperCase());
    }
    return { id: line.id, number: line.number, accountCode: line.accountCode, detailCode: line.detailCode ?? null,
      debit: line.debit, credit: line.credit, description: line.description ?? null, originalCurrency,
      originalAmount: line.originalAmount ?? null, exchangeRate: line.exchangeRate ?? null,
      dimensions: dimensions.map(({key,value,title,level}) => ({ key,value,title: title ?? null,level: level ?? null })),
      links: links(line.links ?? []) };
  });
  requireField(debit===credit,'UNBALANCED','جمع بدهکار و بستانکار سند در ارز پایه برابر نیست.');
  const result = { id: input.id, revision: input.revision, number: input.number, date: input.date,
    periodCode: input.periodCode, type: input.type, status: input.status, voided: input.voided,
    postingDate: input.postingDate ?? null, description: input.description ?? null, reference: input.reference ?? null,
    createdAt: input.createdAt ?? null, modifiedAt: input.modifiedAt ?? null, lines: rows, links: links(input.links ?? []) };
  return { result: { ...result, hash: financialPayloadDigest(result).toString('hex') }, debit, credit };
}

export function normalizeJournalFeed(input) {
  envelope(input);
  requireField(input.feed===JOURNAL_FEED && bounded(input.documents,500),'BAD_BATCH_SIZE','دستهٔ اسناد یا تعداد سند معتبر نیست.');
  const control = input.control;
  requireField(object(control) && Number.isInteger(control.documents) && control.documents>=0
    && Number.isInteger(control.lines) && control.lines>=0 && matches(control.debit,total) && matches(control.credit,total),
  'BAD_CONTROL','جمع‌های کنترلی مستقل ERP برای سند و آرتیکل الزامی‌اند.');
  const documents = [];
  const errors = [];
  const ids = new Set();
  const lineIds = new Set();
  let debit = 0n, credit = 0n, count = 0;
  for (const raw of input.documents) {
    const externalId = text(raw?.id,200) ? raw.id : null;
    try {
      const { result, debit: dr, credit: cr } = journal(raw,input.currencyCode);
      requireField(!ids.has(result.id.toUpperCase()) && result.lines.every(line => !lineIds.has(line.id.toUpperCase())),
        'DUPLICATE_SOURCE_ID','شناسهٔ سند یا آرتیکل در محدودهٔ این منبع تکراری است.');
      requireField(!input.windowFrom || (result.date>=input.windowFrom && result.date<=input.windowTo),
        'OUTSIDE_WINDOW','تاریخ سند خارج از بازهٔ اعلامی دسته است.');
      ids.add(result.id.toUpperCase());
      result.lines.forEach(line => lineIds.add(line.id.toUpperCase()));
      count += result.lines.length;
      debit += dr;
      credit += cr;
      documents.push(result);
    } catch (error) {
      if (!(error instanceof FeedContractError)) throw error;
      errors.push(errorOf(externalId,error.code,error.message));
    }
  }
  if (!errors.length && (control.documents!==documents.length || control.lines!==count ||
        fixedUnits(control.debit)!==debit || fixedUnits(control.credit)!==credit)) {
    errors.push(errorOf(null,'CONTROL_TOTAL_MISMATCH','تعداد اسناد، تعداد آرتیکل یا جمع بدهکار و بستانکار با شاهد ERP همخوان نیست.'));
  }
  return { documents, errors, received: input.documents.length, control };
}

const referenceTypes = new Set(['PERIOD','ACCOUNT','DETAIL_GROUP','DETAIL','DETAIL_RELATION']);
export function normalizeReferenceFeed(input) {
  envelope(input);
  requireField(input.feed===REFERENCE_FEED && bounded(input.records,5000)
    && object(input.control) && Number.isInteger(input.control.records) && input.control.records>=0,
  'BAD_REFERENCE_BATCH','دسته یا شمار کنترلی کدینگ معتبر نیست.');
  const errors = [], records = [], ids = new Set();
  for (const row of input.records) {
    const externalId = text(row?.code,120) ? row.code : null;
    try {
      requireField(object(row) && referenceTypes.has(row.kind) && externalId!==null, 'BAD_REFERENCE','نوع یا شناسهٔ تعریف مالی معتبر نیست.');
      let record = { kind: row.kind, code: row.code };
      switch (row.kind) {
        case 'PERIOD':
          requireField(date(row.from) && date(row.to) && row.to>=row.from && ['OPEN','CLOSED','LOCKED','UNKNOWN'].includes(row.status)
            && optional(row.year,value => text(value,40)) && optional(row.title,value => text(value,250)),
          'BAD_PERIOD','تاریخ‌ها یا وضعیت دورهٔ مالی معتبر نیست.');
          record = { ...record, from: row.from, to: row.to, status: row.status, year: row.year, title: row.title };
          break;
        case 'ACCOUNT':
          requireField(text(row.id,200) && text(row.title,250) && date(row.from) && optional(row.to,date)
            && (!row.to || row.to>=row.from) && optional(row.parent,value => text(value,120) && value!==row.code)
            && text(row.hierarchy,60) && Number.isInteger(row.level) && row.level>=1 && row.level<=255
            && ['DEBIT','CREDIT'].includes(row.nature) && typeof row.active==='boolean',
          'BAD_ACCOUNT','کد، سطح، والد، ماهیت یا تاریخ اعتبار حساب معتبر نیست.');
          record = { ...record, id: row.id, title: row.title, from: row.from, to: row.to, parent: row.parent,
            level: row.level, hierarchy: row.hierarchy, nature: row.nature, active: row.active };
          break;
        case 'DETAIL_GROUP':
          requireField(text(row.title,250) && typeof row.active==='boolean' &&
            ['CUSTOMER','SUPPLIER','PERSONNEL','COST_CENTER','PARTNER_CURRENT','BANK','OTHER'].includes(row.groupKind),
          'BAD_DETAIL_GROUP','نوع یا عنوان گروه تفصیلی معتبر نیست.');
          record = { ...record, title: row.title, active: row.active, groupKind: row.groupKind };
          break;
        case 'DETAIL':
          requireField(text(row.title,250) && typeof row.active==='boolean' && optional(row.group,value => text(value,120)),
          'BAD_DETAIL','عنوان یا گروه تفصیلی معتبر نیست.');
          record = { ...record, title: row.title, active: row.active, group: row.group };
          break;
        case 'DETAIL_RELATION':
          requireField(text(row.account,120) && date(row.accountFrom) && date(row.from) && optional(row.to,date)
            && (!row.to || row.to>=row.from) && typeof row.active==='boolean',
          'BAD_RELATION','رابطهٔ معین و تفصیلی یا تاریخ اعتبار آن معتبر نیست.');
          record = { ...record, account: row.account, accountFrom: row.accountFrom, from: row.from, to: row.to, active: row.active };
          break;
      }
      const key = [record.kind,record.code,record.kind==='ACCOUNT' ? record.from : null,record.account,record.accountFrom];
      const fingerprint = JSON.stringify(key).toUpperCase();
      requireField(!ids.has(fingerprint),'DUPLICATE_REFERENCE','کلید تعریف مالی در دسته تکرار شده است.');
      ids.add(fingerprint);
      records.push(record);
    } catch (error) {
      if (!(error instanceof FeedContractError)) throw error;
      errors.push(errorOf(externalId,error.code,error.message));
    }
  }
  if (!errors.length && input.control.records!==records.length) {
    errors.push(errorOf(null,'CONTROL_TOTAL_MISMATCH','شمار کدینگ دریافتی با شمار کنترلی ERP همخوان نیست.'));
  }
  return { records, errors, received: input.records.length, control: input.control };
}


const stockQuantity = /^\d{1,22}(?:\.\d{1,6})?$/;
export function normalizeFifoFeed(input) {
  envelope(input);
  requireField(input.feed===FIFO_FEED && input.mode!=='INCREMENTAL' && bounded(input.products,50),
    'BAD_FIFO_BATCH','FIFO به تصویر کامل گردش همان کالا در پنجرهٔ مصوب نیاز دارد.');
  const products = [], errors = [], known = new Set();
  for (const product of input.products) {
    const externalId = text(product?.productExternalId,200) ? product.productExternalId : null;
    try {
      requireField(object(product) && externalId && text(product.unitCode,40) && text(product.sourceProof,200)
        && timestamp(product.periodStartUtc) && timestamp(product.throughUtc) && product.periodStartUtc<=product.throughUtc
        && bounded(product.movements,50000) && bounded(product.openingWarehouses,1000) && product.openingWarehouses.length>0,
      'BAD_FIFO_WINDOW','کالا، واحد، مرجع، پنجرهٔ اثر و گردش کامل FIFO الزامی‌اند.');
      const key = JSON.stringify([product.productExternalId.toUpperCase(),product.unitCode.toUpperCase(),product.periodStartUtc]);
      requireField(!known.has(key),'DUPLICATE_FIFO_PRODUCT','پارتیشن همان کالا و دوره در دسته تکرار شده است.');
      const { control } = product;
      requireField(object(control) && control.movementCount===product.movements.length &&
        bounded(control.opening,1000) && bounded(control.closing,1000) &&
        control.opening.length===product.openingWarehouses.length && control.closing.length===product.openingWarehouses.length,
      'FIFO_CONTROL_MISSING','کنترل تعداد گردش و مقدار ابتدا و پایان برای همهٔ انبارها الزامی‌اند.');
      const allowed = new Set(product.openingWarehouses);
      for (const positions of [control.opening,control.closing]) {
        const controlIds = new Set();
        for (const position of positions) {
          requireField(object(position) && allowed.has(position.warehouseId) && !controlIds.has(position.warehouseId)
            && matches(position.quantity,stockQuantity),'BAD_FIFO_CONTROL','مقدار یا انبار کنترل موجودی معتبر نیست.');
          controlIds.add(position.warehouseId);
        }
      }
      const actualOpening = new Map();
      for (const movement of product.movements) {
        if (movement?.kind!=='OPENING') continue;
        requireField(matches(movement.quantity,stockQuantity),'BAD_FIFO_CONTROL','مقدار لایهٔ افتتاحیه معتبر نیست.');
        const current = actualOpening.get(movement.warehouseId) ?? 0n;
        actualOpening.set(movement.warehouseId,current+fixedUnits(movement.quantity,6));
      }
      requireField(control.opening.every(row => fixedUnits(row.quantity,6)===(actualOpening.get(row.warehouseId) ?? 0n)),
        'FIFO_OPENING_UNRECONCILED','لایه‌های افتتاحیه با مقدار مستقل ERP سازگار نیستند.');
      known.add(key);
      products.push(product);
    } catch (error) {
      if (!(error instanceof FeedContractError)) throw error;
      errors.push(errorOf(externalId,error.code,error.message));
    }
  }
  return { products, errors, received: input.products.length };
}
