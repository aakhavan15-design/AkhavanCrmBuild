import { FIFO_COST_METHOD } from './fifoInventory.mjs';

const DAY = 86_400_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const modes = new Set(['cash', 'outflow', 'expense', 'role', 'balance', 'opening', 'review', 'fifo', 'profit']);

function dateValue(value) {
  if (typeof value !== 'string' || !DATE.test(value) || value < '1900-01-01') return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value ? timestamp : null;
}

export function parseMoneyReportQuery(query) {
  const { from, to } = query;
  const start = dateValue(from);
  const end = dateValue(to);
  if (start === null || end === null || to > '9998-12-31') return null;
  const span = (end - start) / DAY + 1;
  if (span < 1 || span > 366) return null;

  const mode = query.mode ?? null;
  const page = typeof query.page === 'string' && /^\d{1,4}$/.test(query.page) ? Number(query.page) : query.page === undefined ? 1 : 0;
  const key = query.key ?? null;
  const search = query.search ?? '';
  const dimension = query.dimension ?? '';
  if ((mode !== null && !modes.has(mode)) || page < 1 || page > 1000 ||
      (key !== null && (typeof key !== 'string' || key.length > 120)) || typeof search !== 'string' || search.length > 100 ||
      !['', 'category', 'center', 'party', 'month'].includes(dimension)) return null;
  return { from, to, mode, key, page, search: search.trim(), dimension,
    priorStart: new Date(start - span * DAY).toISOString().slice(0, 10) };
}

// Use one authorized, explicitly approved ERP history. No historical + opening-document double count.
const profileSql = `
SET NOCOUNT ON;
SELECT s.SourceSystemCode,s.OpeningDate,s.OpeningDocumentTypeCode,s.ClosingDocumentTypes,s.VerifiedThrough,s.ApprovedAtUtc,s.FifoSnapshotUnitsVerified
INTO #profile
FROM analytics.MoneyReportSource s
JOIN core.AppUser approver ON approver.TenantId=s.TenantId AND approver.UserId=s.ApprovedBy
WHERE s.TenantId=@tenantId AND EXISTS
  (SELECT 1 FROM security.fn_RecordReadScope(s.TenantId,N'finance.view',NULL,NULL,NULL,NULL));
`;

const prepare = `
SELECT e.JournalEntryMirrorId AS journalId,e.SourceSystemCode,e.DocumentDate AS [date],
  e.ExternalJournalId,e.DocumentNumber,e.DocumentTypeCode,e.SyncedAtUtc,
  CAST(CASE WHEN e.DocumentTypeCode=p.OpeningDocumentTypeCode THEN 1 ELSE 0 END AS bit) AS isOpening,
  CAST(CASE WHEN EXISTS(SELECT 1 FROM OPENJSON(p.ClosingDocumentTypes) x WHERE x.type=1 AND x.value=e.DocumentTypeCode)
    AND e.DocumentTypeCode<>p.OpeningDocumentTypeCode THEN 1 ELSE 0 END AS bit) AS isClosing,
  CASE WHEN e.CurrencyCode<>'IRR' THEN 'CURRENCY'
       WHEN sm.ExternalStatusCode IS NULL THEN 'STATUS'
       WHEN NULLIF(LTRIM(RTRIM(e.DocumentNumber)),N'') IS NULL THEN 'NUMBER'
       ELSE NULL END AS issue
INTO #documents
FROM #profile p
JOIN crm.JournalEntryMirror e ON e.TenantId=@tenantId AND e.SourceSystemCode=p.SourceSystemCode
LEFT JOIN crm.JournalStatusMap sm ON sm.TenantId=e.TenantId AND sm.SourceSystemCode=e.SourceSystemCode
  AND sm.ExternalStatusCode=e.StatusCode
WHERE e.IsVoided=0 AND (sm.IncludeInBalance=1 OR sm.ExternalStatusCode IS NULL)
  AND e.DocumentDate>=p.OpeningDate AND e.DocumentDate<=@to
  AND (e.DocumentTypeCode<>p.OpeningDocumentTypeCode OR e.DocumentDate=p.OpeningDate);
CREATE UNIQUE CLUSTERED INDEX IX_documents ON #documents(journalId);

SELECT l.JournalLineMirrorId AS lineId,d.journalId,d.[date],d.isOpening,
  l.ExternalAccountCode AS accountCode,l.ExternalDetailCode AS detailCode,
  l.DebitAmount AS debit,l.CreditAmount AS credit,la.MoneyRoleCode AS role,
  l.RefDocumentTypeCode AS refType,l.RefExternalDocumentId AS refId,
  la.TitleFa AS accountTitle,ec.CategoryCode AS categoryCode,ec.TitleFa AS categoryTitle,
  dim.ExternalDimensionValueCode AS centerCode,dim.DimensionValueTitleFa AS centerTitle,
  l.AccountId AS partyId,a.Name AS partyTitle
INTO #lines
FROM #documents d
JOIN crm.JournalLineMirror l ON l.TenantId=@tenantId AND l.JournalEntryMirrorId=d.journalId
  AND l.SourceSystemCode=d.SourceSystemCode
OUTER APPLY (
  SELECT MAX(CONVERT(char(36),m.LedgerAccountId)) AS targetId
  FROM crm.LedgerAccountSourceMap m
  WHERE m.TenantId=l.TenantId AND m.SourceSystemCode=l.SourceSystemCode AND m.ExternalAccountCode=l.ExternalAccountCode
    AND m.MapStatus='APPROVED' AND m.EffectiveFrom<=d.[date] AND (m.EffectiveTo IS NULL OR m.EffectiveTo>=d.[date])
  HAVING COUNT_BIG(*)=1
) approved
LEFT JOIN crm.LedgerAccount la ON la.TenantId=l.TenantId AND la.LedgerAccountId=TRY_CONVERT(uniqueidentifier,approved.targetId)
LEFT JOIN analytics.ExpenseCategory ec ON ec.TenantId=la.TenantId AND ec.CategoryCode=la.ExpenseCategoryCode
LEFT JOIN crm.JournalLineDimension dim ON dim.TenantId=l.TenantId AND dim.JournalLineMirrorId=l.JournalLineMirrorId AND dim.DimensionCode='COST_CENTER'
LEFT JOIN crm.Account a ON a.TenantId=l.TenantId AND a.AccountId=l.AccountId
WHERE d.issue IS NULL;
CREATE CLUSTERED INDEX IX_lines ON #lines(journalId,lineId);

SELECT d.journalId,d.[date],d.isOpening,d.isClosing,
  CAST(SUM(CASE WHEN l.role='CASH' THEN l.debit ELSE 0 END) AS decimal(32,4)) AS cashDebit,
  CAST(SUM(CASE WHEN l.role='CASH' THEN l.credit ELSE 0 END) AS decimal(32,4)) AS cashCredit,
  SUM(CASE WHEN l.lineId IS NOT NULL AND l.role IS NULL AND (l.debit<>0 OR l.credit<>0) THEN 1 ELSE 0 END) AS unmapped,
  SUM(CASE WHEN l.role<>'CASH' AND (l.debit<>0 OR l.credit<>0) THEN 1 ELSE 0 END) AS otherLines,
  COUNT(DISTINCT CASE WHEN l.role='CASH' AND (l.debit<>0 OR l.credit<>0) THEN
    CONCAT(LEN(l.accountCode),N':',l.accountCode,N':',l.detailCode) END) AS cashAccounts,
  SUM(CASE WHEN l.role<>'CASH' THEN l.credit ELSE 0 END) AS otherCredits,
  CASE WHEN d.issue IS NOT NULL THEN d.issue
       WHEN COUNT_BIG(l.lineId)=0 THEN 'LINES'
       WHEN SUM(l.debit)<>SUM(l.credit) THEN 'UNBALANCED'
       ELSE NULL END AS issue
INTO #journal
FROM #documents d LEFT JOIN #lines l ON l.journalId=d.journalId
GROUP BY d.journalId,d.[date],d.isOpening,d.isClosing,d.issue;
CREATE UNIQUE CLUSTERED INDEX IX_journal ON #journal(journalId);
UPDATE #journal SET issue='MAPPING' WHERE issue IS NULL AND unmapped>0;
UPDATE #journal SET issue='CLOSING_CASH' WHERE issue IS NULL AND isClosing=1 AND (cashDebit<>0 OR cashCredit<>0);

SELECT *,CASE
  WHEN cashDebit>0 AND cashCredit>0 AND cashDebit=cashCredit AND otherLines=0 AND cashAccounts>=2 THEN 'TRANSFER'
  WHEN cashDebit>0 AND cashCredit=0 THEN 'IN'
  WHEN cashCredit>0 AND cashDebit=0 THEN 'OUT'
  WHEN cashDebit>0 OR cashCredit>0 THEN 'MIXED'
  ELSE 'NONE' END AS movement
INTO #cash
FROM #journal WHERE issue IS NULL AND isOpening=0 AND isClosing=0 AND [date]>=@priorStart;

SELECT l.*,
  CASE WHEN @dimension='center' THEN l.centerCode
       WHEN @dimension='party' THEN COALESCE(CONVERT(nvarchar(36),l.partyId),NULLIF(l.detailCode,N''))
       WHEN @dimension='month' THEN calendar.groupCode
       ELSE COALESCE(l.categoryCode,l.role) END AS groupCode,
  CASE WHEN @dimension='center' THEN l.centerTitle
       WHEN @dimension='party' THEN l.partyTitle
       WHEN @dimension='month' THEN calendar.title
       ELSE l.categoryTitle END AS groupTitle,
  CASE WHEN c.movement='OUT' AND c.otherCredits=0 AND l.role<>'CASH' AND l.debit>0 THEN 1 ELSE 0 END AS isAttributed,
  CASE WHEN l.role IN ('PNL_EXPENSE','PNL_NONCASH') AND (l.debit<>0 OR l.credit<>0) THEN 1 ELSE 0 END AS isExpense
INTO #analysis
FROM #cash c JOIN #lines l ON l.journalId=c.journalId
LEFT JOIN OPENJSON(@months) WITH ([date] date,groupCode nvarchar(20),title nvarchar(50)) AS calendar ON calendar.[date]=l.[date];`;

const metadata = `
SELECT CONVERT(char(10),p.OpeningDate,126) AS openingDate,CONVERT(char(10),p.VerifiedThrough,126) AS verifiedThrough,
  p.ApprovedAtUtc AS approvedAt,MAX(d.SyncedAtUtc) AS updatedAt,p.SourceSystemCode AS sourceSystem,
  (SELECT COUNT_BIG(*) FROM #journal WHERE issue IS NOT NULL AND [date]>=@from) AS excludedPeriod,
  (SELECT COUNT_BIG(*) FROM #journal WHERE issue IS NOT NULL AND [date]>=@priorStart AND [date]<@from) AS excludedPrior,
  (SELECT COUNT_BIG(*) FROM #journal WHERE issue IS NOT NULL AND ([date]<@from OR isOpening=1)) AS excludedOpening,
  (SELECT COUNT_BIG(*) FROM #journal WHERE issue IS NULL AND isOpening=1 AND (cashDebit>0 OR cashCredit>0)) AS openingDocuments,
  (SELECT COUNT_BIG(*) FROM #cash WHERE [date]>=@from AND movement='MIXED') AS mixedDocuments
FROM #profile p LEFT JOIN #documents d ON 1=1
GROUP BY p.OpeningDate,p.VerifiedThrough,p.ApprovedAtUtc,p.SourceSystemCode;`;

const totals = `
SELECT CONVERT(char(10),[date],126) AS [date],
  CONVERT(varchar(48),SUM(CASE WHEN movement='IN' THEN cashDebit ELSE 0 END)) AS inflow,
  CONVERT(varchar(48),SUM(CASE WHEN movement='OUT' THEN cashCredit ELSE 0 END)) AS outflow,
  CONVERT(varchar(48),SUM(CASE WHEN movement='TRANSFER' THEN cashDebit ELSE 0 END)) AS transfers,
  CONVERT(varchar(48),SUM(CASE WHEN movement='MIXED' THEN cashDebit-cashCredit ELSE 0 END)) AS unresolved,
  CONVERT(varchar(48),SUM(cashDebit-cashCredit)) AS net
FROM #cash WHERE [date]>=@from GROUP BY [date] ORDER BY [date];

SELECT l.role,
  CONVERT(varchar(48),SUM(CASE WHEN l.[date]<@from OR l.isOpening=1 THEN l.debit-l.credit ELSE 0 END)) AS opening,
  CONVERT(varchar(48),SUM(l.debit-l.credit)) AS closing,
  CONVERT(varchar(48),SUM(CASE WHEN l.isOpening=0 AND j.isClosing=0 AND l.[date]>=@from THEN l.credit-l.debit ELSE 0 END)) AS effect
FROM #lines l JOIN #journal j ON j.journalId=l.journalId AND j.issue IS NULL
GROUP BY l.role;

WITH grouped AS (
  SELECT a.groupCode,MAX(a.groupTitle) AS title, t.kind,
    SUM(CASE WHEN a.[date]>=@from THEN t.amount ELSE 0 END) AS amount,
    SUM(CASE WHEN a.[date]<@from THEN t.amount ELSE 0 END) AS priorAmount,
    COUNT(DISTINCT CASE WHEN a.[date]>=@from THEN a.journalId END) AS documents,
    COUNT(DISTINCT CASE WHEN a.[date]<@from THEN a.journalId END) AS priorDocuments
  FROM #analysis a
  CROSS APPLY (VALUES ('outflow',a.isAttributed,a.debit),('expense',a.isExpense,a.debit-a.credit)) t(kind,included,amount)
  WHERE t.included=1
  GROUP BY a.groupCode,t.kind
), ranked AS (
  SELECT *,ROW_NUMBER() OVER(PARTITION BY kind ORDER BY ABS(amount) DESC, groupCode) AS rowNumber,
    COUNT(*) OVER(PARTITION BY kind) AS groupCount
  FROM grouped
)
SELECT kind,groupCode,title,CONVERT(varchar(48),amount) AS amount,CONVERT(varchar(48),priorAmount) AS priorAmount,
  documents,priorDocuments,groupCount,
  CONVERT(varchar(48),CAST(amount AS decimal(32,4))-CAST(priorAmount AS decimal(32,4))) AS difference
FROM ranked WHERE rowNumber<=20 ORDER BY kind,rowNumber;

SELECT COUNT_BIG(*) AS documents,
  CONVERT(varchar(48),SUM(c.cashCredit)) AS amount
FROM #cash c WHERE c.[date]>=@from AND c.movement='OUT' AND c.otherCredits>0;`;

const evidence = `
SELECT d.journalId,d.DocumentNumber AS documentNumber,d.DocumentTypeCode AS documentType,
  d.ExternalJournalId AS externalJournalId,CONVERT(char(10),d.[date],126) AS [date],j.issue,
  l.lineId,l.accountCode,l.accountTitle,l.detailCode,l.partyId,l.partyTitle,l.centerTitle,l.categoryTitle,l.role,l.refType,l.refId,
  CONVERT(varchar(48),l.debit) AS debit,CONVERT(varchar(48),l.credit) AS credit
FROM #documents d JOIN #journal j ON j.journalId=d.journalId
LEFT JOIN #lines l ON l.journalId=d.journalId
LEFT JOIN #cash c ON c.journalId=d.journalId
LEFT JOIN #analysis a ON a.lineId=l.lineId AND (@mode='outflow' OR @mode='expense')
WHERE ((@mode IN ('balance','opening') AND j.issue IS NULL AND l.role=@key
    AND (@mode='balance' OR d.[date]<@from OR d.isOpening=1))
  OR (@mode='review' AND d.[date]>=@from AND (j.issue IS NOT NULL OR c.movement='MIXED' OR (c.movement='OUT' AND c.otherCredits>0)))
  OR (d.[date]>=@from AND d.isOpening=0 AND d.isClosing=0 AND j.issue IS NULL AND
    ((@mode='cash' AND c.movement<>'NONE' AND (@key IS NULL OR c.movement=@key))
     OR (@mode='role' AND l.role=@key)
     OR (@mode='profit' AND l.role IN ('PNL_INCOME','PNL_EXPENSE','PNL_NONCASH'))
     OR (@mode='outflow' AND a.isAttributed=1 AND (@key IS NULL OR COALESCE(a.groupCode,N'')=@key))
     OR (@mode='expense' AND a.isExpense=1 AND (@key IS NULL OR COALESCE(a.groupCode,N'')=@key)))))
  AND (@search='' OR CHARINDEX(@search,d.DocumentNumber)>0 OR CHARINDEX(@search,d.ExternalJournalId)>0
    OR CHARINDEX(@search,l.accountCode)>0 OR CHARINDEX(@search,l.detailCode)>0 OR CHARINDEX(@search,l.refId)>0)
ORDER BY d.[date] DESC,d.journalId,l.lineId
OFFSET @offset ROWS FETCH NEXT 26 ROWS ONLY;`;

// A published set is usable only when every exact-date ERP inventory position is matched
// by one current FIFO run with the same product, warehouse and quantity.
const fifoPrepare = `
SELECT dates.side,dates.snapshotDate,r.RunId,r.ProductExternalId,r.UnitCode,v.WarehouseExternalId,
  v.Quantity,v.Amount,r.SourceProof
INTO #fifo
FROM #profile p
CROSS APPLY (VALUES ('opening',DATEADD(day,-1,@from)),('closing',@to)) dates(side,snapshotDate)
JOIN analytics.FifoRun r ON r.TenantId=@tenantId AND r.IsCurrent=1 AND r.CurrencyCode='IRR'
  AND r.MethodCode=@fifoMethod AND r.SourceSystemCode=p.SourceSystemCode COLLATE Latin1_General_100_BIN2
  AND r.ThroughUtc=DATEADD(millisecond,-1,DATEADD(day,1,CONVERT(datetime2(3),dates.snapshotDate)))
JOIN analytics.FifoValuation v ON v.TenantId=r.TenantId AND v.RunId=r.RunId
WHERE p.FifoSnapshotUnitsVerified=1 AND dates.snapshotDate<=p.VerifiedThrough;

SELECT dates.side,s.ExternalProductId COLLATE Latin1_General_100_BIN2 AS productId,
  s.WarehouseExternalId COLLATE Latin1_General_100_BIN2 AS warehouseId,s.QuantityOnHand
INTO #stock
FROM #profile p
CROSS APPLY (VALUES ('opening',DATEADD(day,-1,@from)),('closing',@to)) dates(side,snapshotDate)
JOIN crm.InventorySnapshotMirror s ON s.TenantId=@tenantId AND s.SourceSystemCode=p.SourceSystemCode
  AND s.AsOfDate=dates.snapshotDate
WHERE p.FifoSnapshotUnitsVerified=1 AND dates.snapshotDate<=p.VerifiedThrough;

SELECT f.side,CONVERT(varchar(48),SUM(f.Amount)) AS amount,COUNT_BIG(*) AS positions
INTO #fifoTotal
FROM #fifo f
WHERE NOT EXISTS (
  SELECT 1 FROM #fifo x WHERE x.side=f.side
    AND NOT EXISTS (SELECT 1 FROM #stock s WHERE s.side=x.side AND s.productId=x.ProductExternalId
      AND s.warehouseId=x.WarehouseExternalId AND s.QuantityOnHand=x.Quantity)
)
AND NOT EXISTS (
  SELECT 1 FROM #stock s WHERE s.side=f.side
    AND (SELECT COUNT_BIG(*) FROM #fifo x WHERE x.side=s.side AND x.ProductExternalId=s.productId
      AND x.WarehouseExternalId=s.warehouseId AND x.Quantity=s.QuantityOnHand)<>1
)
AND NOT EXISTS (
  SELECT 1 FROM #fifo x WHERE x.side=f.side GROUP BY x.ProductExternalId,x.WarehouseExternalId HAVING COUNT_BIG(*)<>1
)
GROUP BY f.side;`;

const fifoEvidence = `
SELECT f.RunId AS runId,f.ProductExternalId AS productId,f.UnitCode AS unitCode,f.WarehouseExternalId AS warehouseId,
  CONVERT(varchar(48),f.Quantity) AS quantity,CONVERT(varchar(48),f.Amount) AS amount,
  CONVERT(char(10),f.snapshotDate,126) AS [date],f.SourceProof AS sourceProof
FROM #fifo f JOIN #fifoTotal t ON t.side=f.side
WHERE f.side=@key AND (@search='' OR CHARINDEX(@search,f.ProductExternalId)>0 OR CHARINDEX(@search,f.WarehouseExternalId)>0)
ORDER BY f.ProductExternalId,f.WarehouseExternalId,f.RunId
OFFSET @offset ROWS FETCH NEXT 26 ROWS ONLY;`;

const SCALE = 14;
const denominator = 10n ** BigInt(SCALE);
const parseAmount = value => {
  const [whole, fraction = ''] = String(value).replace(/^-/, '').split('.');
  return (String(value).startsWith('-') ? -1n : 1n) * (BigInt(whole) * denominator + BigInt(fraction.padEnd(SCALE, '0')));
};
function decimal(value) {
  const magnitude = value < 0n ? -value : value;
  return `${value < 0n ? '-' : ''}${magnitude / denominator}.${String(magnitude % denominator).padStart(SCALE, '0')}`;
}
const sum = (rows, field) => rows.reduce((value, row) => value + parseAmount(row[field]), 0n);
const consumption = ['RECEIVABLE', 'CHEQUES_RECEIVABLE', 'PREPAYMENT', 'PAYABLE'];
const monthCode = new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', { year: 'numeric', month: '2-digit', timeZone: 'UTC' });
const monthTitle = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: 'long', timeZone: 'UTC' });
function expenseCalendar(filter) {
  if (filter.dimension !== 'month') return '[]';
  const days = [];
  for (let time = Date.parse(filter.from); time <= Date.parse(filter.to); time += DAY) {
    const date = new Date(time);
    const parts = monthCode.formatToParts(date);
    const year = parts.find(part => part.type === 'year').value;
    const month = parts.find(part => part.type === 'month').value;
    days.push({ date: date.toISOString().slice(0, 10), groupCode: `${year}-${month}`, title: monthTitle.format(date) });
  }
  return JSON.stringify(days);
}
const profitRoles = new Set(['PNL_INCOME', 'PNL_EXPENSE', 'PNL_NONCASH']);

export function projectMoneyReport(result, filter) {
  const [metadataRows, trend, balances, grouped, unallocatedRows, fifoRows] = result;
  const meta = metadataRows[0];
  if (!meta) return { status: 'UNAVAILABLE', reason: 'منبع دفتر کل و پوشش تأییدشده برای این گزارش تنظیم نشده است.' };

  const observed = trend.length > 0;
  const openingKnown = filter.from >= meta.openingDate && filter.from <= meta.verifiedThrough &&
    Number(meta.openingDocuments) > 0 && Number(meta.excludedOpening) === 0;
  const periodCovered = filter.from >= meta.openingDate && filter.to <= meta.verifiedThrough && Number(meta.excludedPeriod) === 0;
  const priorCovered = filter.priorStart >= meta.openingDate && filter.from <= meta.verifiedThrough && Number(meta.excludedPrior) === 0;
  const roles = new Map(balances.map(row => [row.role,row]));
  const fifo = Object.fromEntries(fifoRows.map(row => [row.side,row]));
  const movement = field => observed || periodCovered ? decimal(sum(trend, field)) : null;
  const closingKnown = openingKnown && periodCovered;
  const cash = roles.get('CASH');
  const mixed = Number(meta.mixedDocuments);
  const netProfit = periodCovered ? decimal(sum(balances.filter(row => profitRoles.has(row.role)), 'effect')) : null;

  // A balance-sensitive KPI never substitutes an accounting stock value for FIFO.
  function workingCapital(side, known) {
    if (!known || !fifo[side]) return null;
    const workingBalances = consumption.map(role => roles.get(role)?.[side] ?? '0');
    return decimal(workingBalances.reduce((value, balance) => value + parseAmount(balance), parseAmount(fifo[side].amount)));
  }
  const workingOpening = workingCapital('opening', openingKnown);
  const workingClosing = workingCapital('closing', closingKnown);

  return {
    status: closingKnown && !mixed ? 'AVAILABLE' : 'PARTIAL',
    sourceSystem: meta.sourceSystem, openingDate: meta.openingDate, verifiedThrough: meta.verifiedThrough,
    updatedAt: meta.updatedAt, periodCovered, priorCovered,
    excludedDocuments: Number(meta.excludedPeriod), mixedDocuments: mixed,
    // Bank statements and transaction matches are distinct evidence. Journal certification never verifies them.
    bank: { status: 'NOT_VERIFIED', closing: null, unmatched: null },
    cash: {
      opening: openingKnown ? cash?.opening ?? '0' : null,
      closing: closingKnown ? cash?.closing ?? '0' : null,
      inflow: movement('inflow'), outflow: movement('outflow'), transfers: movement('transfers'),
      unresolved: movement('unresolved'), net: movement('net'),
    },
    trend,
    netProfit,
    bridge: periodCovered ? balances.filter(row => row.role !== 'CASH' && !profitRoles.has(row.role) && parseAmount(row.effect) !== 0n)
      .map(row => ({ role: row.role, amount: row.effect })) : [],
    balances: balances.filter(row => row.role !== 'CASH' && !profitRoles.has(row.role)).map(row => ({
      role: row.role, opening: openingKnown ? row.opening : null, closing: closingKnown ? row.closing : null,
    })),
    grouped: grouped.map(row => ({ ...row, priorAmount: priorCovered && filter.dimension !== 'month' ? row.priorAmount : null,
      difference: periodCovered && priorCovered && filter.dimension !== 'month' ? row.difference : null })),
    unallocated: unallocatedRows[0]?.amount ?? (periodCovered ? '0' : null),
    unallocatedDocuments: Number(unallocatedRows[0]?.documents ?? 0),
    fifo: { opening: fifo.opening?.amount ?? null, closing: fifo.closing?.amount ?? null },
    workingCapital: {
      opening: workingOpening, closing: workingClosing,
      change: workingOpening !== null && workingClosing !== null ? decimal(parseAmount(workingClosing) - parseAmount(workingOpening)) : null,
    },
  };
}

export function createMoneyIntelligenceReader({ sql, run }) {
  return (auth, filter) => run(auth, async tx => {
    const request = new sql.Request(tx)
      .input('tenantId', sql.UniqueIdentifier, auth.tenantId)
      .input('from', sql.Date, new Date(filter.from))
      .input('to', sql.Date, new Date(filter.to))
      .input('priorStart', sql.Date, new Date(filter.priorStart))
      .input('dimension', sql.VarChar(12), filter.dimension || 'category')
      .input('fifoMethod', sql.VarChar(25), FIFO_COST_METHOD)
      .input('months', sql.NVarChar(sql.MAX), expenseCalendar(filter));
    if (filter.mode) {
      request.input('mode', sql.VarChar(12), filter.mode)
        .input('key', sql.NVarChar(120), filter.key)
        .input('search', sql.NVarChar(100), filter.search)
        .input('offset', sql.Int, (filter.page - 1) * 25);
      const result = await request.query(filter.mode === 'fifo'
        ? `${profileSql}${fifoPrepare}${fifoEvidence}`
        : `${profileSql}${prepare}${evidence}`);
      return { items: result.recordset.slice(0, 25), hasMore: filter.page < 1000 && result.recordset.length > 25 };
    }
    const result = await request.query(`${profileSql}${prepare}${metadata}${totals}${fifoPrepare}SELECT side,amount FROM #fifoTotal;`);
    return projectMoneyReport(result.recordsets, filter);
  });
}
