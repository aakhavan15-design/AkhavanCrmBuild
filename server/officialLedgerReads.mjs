const ledgerSourcesSql = `
SELECT TOP (101) j.SourceSystemCode AS source,j.CurrencyCode AS currency,COALESCE(MAX(c.DisplayName),j.SourceSystemCode) AS title
FROM analytics.vw_FinancialJournalState j
LEFT JOIN integration.Connector c ON c.TenantId=j.TenantId AND c.SystemCode=j.SourceSystemCode AND c.FinancialCompanyKey IS NOT NULL
WHERE j.TenantId=@tenantId AND j.JournalQuality='VALID' AND (@source IS NULL OR j.SourceSystemCode=@source)
  AND (@currency IS NULL OR j.CurrencyCode=@currency)
  AND (EXISTS (SELECT 1 FROM security.fn_RecordReadScope(@tenantId,N'finance.view',NULL,NULL,NULL,NULL))
    OR EXISTS(SELECT 1 FROM crm.JournalLineMirror l WHERE l.TenantId=j.TenantId AND l.SourceSystemCode=j.SourceSystemCode
      AND l.JournalEntryMirrorId=j.JournalEntryMirrorId
      AND EXISTS(SELECT 1 FROM security.fn_LedgerDetailReadScope(l.TenantId,l.SourceSystemCode,l.ExternalDetailCode))))
GROUP BY j.SourceSystemCode,j.CurrencyCode ORDER BY title,source,currency;`;

const approvedScope = `
SELECT s.OpeningDate,s.VerifiedThrough,s.OpeningDocumentTypeCode,s.ClosingDocumentTypes
INTO #approved FROM analytics.MoneyReportSource s
JOIN core.AppUser approver ON approver.TenantId=s.TenantId AND approver.UserId=s.ApprovedBy
WHERE s.TenantId=@tenantId AND s.SourceSystemCode=@source AND @currency='IRR';`;

// The posted article set behind a balance and its drill-down share the same approved window.
export function ledgerBalanceWindow(article, approved) {
  return `(${approved}.OpeningDate IS NULL OR (${article}.AccountingDate BETWEEN ${approved}.OpeningDate AND ${approved}.VerifiedThrough
    AND (${article}.DocumentTypeCode<>${approved}.OpeningDocumentTypeCode OR ${article}.AccountingDate=${approved}.OpeningDate)))`;
}

const officialPnlSql = `
SET NOCOUNT ON;
${approvedScope}
SELECT l.*,CASE WHEN p.OpeningDocumentTypeCode=l.DocumentTypeCode
    OR EXISTS(SELECT 1 FROM OPENJSON(p.ClosingDocumentTypes) c WHERE c.type=1 AND c.value=l.DocumentTypeCode)
    OR purpose.kind IN ('OPENING','CLOSING') THEN 1 ELSE 0 END AS isClosingOrOpening
INTO #classified
FROM analytics.vw_FinancialJournalArticle l
LEFT JOIN #approved p ON 1=1
OUTER APPLY(
  SELECT MAX(m.StandardCode) AS kind FROM integration.CodeMapping m
  WHERE m.TenantId=l.TenantId AND m.SourceSystemCode=l.SourceSystemCode AND m.MappingDomain='JOURNAL_DOC_PURPOSE'
    AND m.ExternalCode=l.DocumentTypeCode AND m.MapStatus='APPROVED' AND m.EffectiveFrom<=l.AccountingDate
    AND (m.EffectiveTo IS NULL OR m.EffectiveTo>=l.AccountingDate)
  HAVING COUNT_BIG(*)=1
) purpose
WHERE l.TenantId=@tenantId AND l.SourceSystemCode=@source AND l.CurrencyCode=@currency
  AND (@from IS NULL OR l.AccountingDate>=@from) AND (@to IS NULL OR l.AccountingDate<=@to)
  AND (@periodCode IS NULL OR l.ExternalPeriodCode=@periodCode)
  AND EXISTS(SELECT 1 FROM security.fn_RecordReadScope(l.TenantId,N'finance.view',NULL,NULL,NULL,NULL));

SELECT TOP (12001) ReportBucketCode AS reportBucketCode,NatureCode AS nature,
  CONVERT(char(10),AccountingDate,126) AS documentDate,
  CONVERT(varchar(48),SUM(DebitAmount)) AS debitAmount,CONVERT(varchar(48),SUM(CreditAmount)) AS creditAmount
FROM #classified WHERE isClosingOrOpening=0 AND ReportBucketCode IN ('GROSS_SALES','SALES_RETURNS','COGS','OPERATING_EXPENSES')
GROUP BY ReportBucketCode,NatureCode,AccountingDate ORDER BY AccountingDate DESC,ReportBucketCode,NatureCode;

SELECT CASE WHEN EXISTS(SELECT 1 FROM #approved p WHERE @from IS NOT NULL AND @to IS NOT NULL
    AND @from>=p.OpeningDate AND @to<=p.VerifiedThrough)
    AND NOT EXISTS(SELECT 1 FROM #classified WHERE isClosingOrOpening=0 AND LedgerAccountId IS NULL AND (DebitAmount>0 OR CreditAmount>0))
    AND NOT EXISTS(SELECT 1 FROM analytics.vw_FinancialJournalState j WHERE j.TenantId=@tenantId AND j.SourceSystemCode=@source
      AND j.JournalQuality NOT IN ('VALID','VOID','PENDING') AND j.AccountingDate BETWEEN @from AND @to)
  THEN 1 ELSE 0 END AS verified;`;

const ledgerBalancesSql = byPeriod => `
SET NOCOUNT ON;
${approvedScope}
SELECT CONVERT(char(10),p.VerifiedThrough,126) AS asOf,CASE WHEN EXISTS(
  SELECT 1 FROM analytics.vw_FinancialJournalState j WHERE j.TenantId=@tenantId AND j.SourceSystemCode=@source AND j.CurrencyCode=@currency
    AND j.AccountingDate=p.OpeningDate AND j.DocumentTypeCode=p.OpeningDocumentTypeCode AND j.JournalQuality='VALID'
) AND NOT EXISTS(
  SELECT 1 FROM analytics.vw_FinancialJournalState j WHERE j.TenantId=@tenantId AND j.SourceSystemCode=@source
    AND j.AccountingDate BETWEEN p.OpeningDate AND p.VerifiedThrough
    AND (j.JournalQuality NOT IN ('VALID','VOID','PENDING') OR j.CurrencyCode<>@currency)
) AND NOT EXISTS(
  SELECT 1 FROM analytics.vw_FinancialJournalArticle a WHERE a.TenantId=@tenantId AND a.SourceSystemCode=@source AND a.CurrencyCode=@currency
    AND a.AccountingDate BETWEEN p.OpeningDate AND p.VerifiedThrough AND a.ExternalDetailCode IS NOT NULL AND a.LedgerAccountId IS NULL
    AND EXISTS(SELECT 1 FROM security.fn_LedgerDetailReadScope(a.TenantId,a.SourceSystemCode,a.ExternalDetailCode))
) THEN 1 ELSE 0 END AS verified
FROM #approved p;

SELECT l.ExternalDetailCode,l.ExternalAccountCode,${byPeriod ? 'l.ExternalPeriodCode' : 'CAST(NULL AS nvarchar(120))'} AS ExternalPeriodCode,
  l.LinkedAccountId,CONVERT(varchar(48),SUM(l.DebitAmount)) AS TotalDebit,CONVERT(varchar(48),SUM(l.CreditAmount)) AS TotalCredit,
  COUNT_BIG(*) AS CountedLineCount,COUNT(CASE WHEN l.LedgerAccountId IS NULL THEN 1 END) AS UnmappedStatusLineCount
FROM analytics.vw_FinancialJournalArticle l LEFT JOIN #approved p ON 1=1
WHERE l.TenantId=@tenantId AND l.SourceSystemCode=@source AND l.CurrencyCode=@currency
  AND ${ledgerBalanceWindow('l','p')}
  AND l.ExternalDetailCode IS NOT NULL AND (@detail IS NULL OR l.ExternalDetailCode=@detail)
  AND (@role IS NULL OR l.MoneyRoleCode=@role)
  AND EXISTS(SELECT 1 FROM security.fn_LedgerDetailReadScope(l.TenantId,l.SourceSystemCode,l.ExternalDetailCode))
GROUP BY l.ExternalDetailCode,l.ExternalAccountCode,l.LinkedAccountId ${byPeriod ? ',l.ExternalPeriodCode' : ''};`;

const booksSql = `
SET NOCOUNT ON;
${approvedScope}
SELECT CASE WHEN EXISTS(
  SELECT 1 FROM #approved p WHERE @from>=p.OpeningDate AND @to<=p.VerifiedThrough
    AND EXISTS(SELECT 1 FROM analytics.vw_FinancialJournalState j WHERE j.TenantId=@tenantId AND j.SourceSystemCode=@source
      AND j.CurrencyCode=@currency AND j.AccountingDate=p.OpeningDate AND j.DocumentTypeCode=p.OpeningDocumentTypeCode AND j.JournalQuality='VALID')
) AND NOT EXISTS(
  SELECT 1 FROM analytics.vw_FinancialJournalState j JOIN #approved p ON 1=1
  WHERE j.TenantId=@tenantId AND j.SourceSystemCode=@source AND j.AccountingDate BETWEEN p.OpeningDate AND @to
    AND (j.CurrencyCode<>@currency OR j.JournalQuality NOT IN ('VALID','VOID','PENDING'))
) THEN 1 ELSE 0 END AS verified INTO #coverage;

SELECT l.*,
  CASE WHEN p.OpeningDocumentTypeCode=l.DocumentTypeCode AND l.AccountingDate=p.OpeningDate THEN 1 ELSE 0 END AS isOpening
INTO #book FROM analytics.vw_FinancialJournalArticle l
LEFT JOIN #approved p ON 1=1
WHERE l.TenantId=@tenantId AND l.SourceSystemCode=@source AND l.CurrencyCode=@currency AND l.AccountingDate<=@to
  AND (p.OpeningDate IS NULL OR l.AccountingDate>=p.OpeningDate)
  AND (p.OpeningDocumentTypeCode IS NULL OR l.DocumentTypeCode<>p.OpeningDocumentTypeCode OR l.AccountingDate=p.OpeningDate)
  AND (@role IS NULL OR l.MoneyRoleCode=@role)
  AND EXISTS(SELECT 1 FROM security.fn_RecordReadScope(l.TenantId,N'finance.view',NULL,NULL,NULL,NULL));

WITH positions AS (
  SELECT ExternalAccountCode AS accountCode,ExternalDetailCode AS detailCode,
    MAX(ExternalAccountTitle) AS title,MAX(ExternalParentCode) AS parentCode,MAX(ExternalHierarchyKey) AS hierarchy,
    MAX(LinkedAccountName) AS party,COUNT_BIG(*) AS articleCount,
    SUM(CASE WHEN AccountingDate<@from OR isOpening=1 THEN DebitAmount-CreditAmount ELSE 0 END) AS opening,
    SUM(CASE WHEN AccountingDate>=@from AND isOpening=0 THEN DebitAmount ELSE 0 END) AS debit,
    SUM(CASE WHEN AccountingDate>=@from AND isOpening=0 THEN CreditAmount ELSE 0 END) AS credit,
    SUM(DebitAmount-CreditAmount) AS closing
  FROM #book GROUP BY ExternalAccountCode,ExternalDetailCode
)
SELECT accountCode,detailCode,title,parentCode,hierarchy,party,articleCount,
  CASE WHEN verified=1 THEN CONVERT(varchar(48),opening) END AS opening,
  CONVERT(varchar(48),debit) AS debit,CONVERT(varchar(48),credit) AS credit,
  CASE WHEN verified=1 THEN CONVERT(varchar(48),closing) END AS closing
FROM positions CROSS JOIN #coverage
WHERE @search='' OR CHARINDEX(@search,accountCode)>0 OR CHARINDEX(@search,detailCode)>0
  OR CHARINDEX(@search,title)>0 OR CHARINDEX(@search,party)>0 OR CHARINDEX(@search,parentCode)>0
ORDER BY accountCode,detailCode OFFSET @offset ROWS FETCH NEXT 26 ROWS ONLY;

SELECT verified FROM #coverage;
SELECT CONVERT(varchar(48),SUM(CASE WHEN AccountingDate>=@from AND isOpening=0 THEN DebitAmount ELSE 0 END)) AS debit,
  CONVERT(varchar(48),SUM(CASE WHEN AccountingDate>=@from AND isOpening=0 THEN CreditAmount ELSE 0 END)) AS credit,
  CONVERT(varchar(48),SUM(CASE WHEN AccountingDate>=@from AND isOpening=0 THEN DebitAmount-CreditAmount ELSE 0 END)) AS difference
FROM #book;`;

export function parseLedgerSource(query) {
  const source = query.source ?? null, currency = query.currency ?? null;
  if ((source!==null && (typeof source!=='string' || !source.trim() || source.length>40))
      || (currency!==null && (typeof currency!=='string' || !/^[A-Z]{3}$/.test(currency)))) return null;
  return { source, currency };
}

export function createOfficialLedgerReader({ sql, run }) {
  const request = (tx,auth) => new sql.Request(tx).input('tenantId',sql.UniqueIdentifier,auth.tenantId);
  const bind = (req,source) => req.input('source',sql.VarChar(40),source.source)
    .input('currency',sql.Char(3),source.currency);
  const scope = async (tx,auth,source) => (await bind(request(tx,auth),source).query(ledgerSourcesSql)).recordset;
  const plan = sources => {
    if (!sources.length) return { status:'UNAVAILABLE',reason:'سند معتبر برای شرکت و ارز انتخابی در دسترس نیست.' };
    if (sources.length!==1) return { status:'UNAVAILABLE',reason:'برای گزارش مالی، یک شرکت و ارز پایه را انتخاب کنید.' };
    return null;
  };
  return {
    sources: (auth,filter) => run(auth,async tx => ({ items: (await scope(tx,auth,filter)).slice(0,100) })),
    pnl: (auth,filter) => run(auth,async tx => {
      const scopes = await scope(tx,auth,filter);
      const blocked = plan(scopes);
      if (blocked || scopes[0].currency!=='IRR') {
        return { ...(blocked ?? { status:'UNAVAILABLE',reason:'نمای جاری سود و زیان فقط دفتر ریالی را نمایش می‌دهد.' }),
          source:'SQLSERVER_BACKEND',journalLines:[],coaMirror:[] };
      }
      const data = await bind(request(tx,auth),scopes[0])
        .input('from',sql.Date,filter.fromDate ? new Date(filter.fromDate) : null)
        .input('to',sql.Date,filter.toDate ? new Date(filter.toDate) : null)
        .input('periodCode',sql.NVarChar(120),filter.periodCode ?? null)
        .query(officialPnlSql);
      const [rows,quality] = data.recordsets;
      if (rows.length>12000) {
        return { status:'UNAVAILABLE',reason:'بازهٔ کوتاه‌تری برای مشاهدهٔ سود و زیان انتخاب کنید.',
          source:'SQLSERVER_BACKEND',journalLines:[],coaMirror:[] };
      }
      const status = quality[0]?.verified===1 ? (rows.length ? 'LIVE' : 'EMPTY') : 'PARTIAL';
      return { status, source:'SQLSERVER_BACKEND', sourceSystem:scopes[0].source, journalLines:rows, coaMirror:[] };
    }),
    balances: (auth,filter) => run(auth,async tx => {
      const scopes = await scope(tx,auth,filter);
      const blocked = plan(scopes);
      if (blocked || scopes[0].currency!=='IRR') return { blocked: blocked ?? { status:'UNAVAILABLE',reason:'ماندهٔ این نما به دفتر ریالی نیاز دارد.' } };
      const result = await bind(request(tx,auth),scopes[0]).input('detail',sql.NVarChar(120),filter.detailKey)
        .input('role',sql.VarChar(32),filter.role).query(ledgerBalancesSql(filter.byPeriod));
      const [coverage,rows] = result.recordsets;
      if (filter.role && coverage[0]?.verified!==1) return { blocked: {
        status:'UNAVAILABLE', reason:'ماندهٔ رسمی مطالبات یا بدهی به افتتاحیه، پوشش معتبر و کدینگ تأییدشدهٔ دفتر نیاز دارد.',
      } };
      return { rows, source:{...scopes[0], role:filter.role, asOf:coverage[0]?.asOf ?? null, verified:coverage[0]?.verified===1 } };
    }),
    books: (auth,filter) => run(auth,async tx => {
      const scopes = await scope(tx,auth,filter);
      const blocked = plan(scopes);
      if (blocked) return { ...blocked,items:[],hasMore:false };
      const result = await bind(request(tx,auth),scopes[0])
        .input('from',sql.Date,new Date(filter.from)).input('to',sql.Date,new Date(filter.to))
        .input('role',sql.VarChar(32),filter.role).input('search',sql.NVarChar(100),filter.search)
        .input('offset',sql.Int,(filter.page-1)*25).query(booksSql);
      const [rows,coverage,totals] = result.recordsets;
      return { status:coverage[0]?.verified===1 ? 'AVAILABLE' : 'PARTIAL', ...scopes[0],
        items:rows.slice(0,25),hasMore:filter.page<1000 && rows.length>25,totals:totals[0] };
    }),
  };
}
