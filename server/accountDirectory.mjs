import { tokenize } from '../src/lib/persianText.ts';

const sqlSearchText = expression => `LOWER(TRANSLATE(REPLACE(REPLACE(${expression}, NCHAR(8204), N' '), NCHAR(160), N' '),
  N'يىك۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩',N'ییک01234567890123456789'))`;

export function createAccountDirectory({ sql, run, excludeFixtures }) {
  return async (auth, query, requestedPage) => {
    const pageSize = 12;
    const page = Math.max(1, Math.min(1000, Number.parseInt(String(requestedPage), 10) || 1));
    const text = typeof query === 'string' ? query.slice(0, 120) : '';
    const terms = tokenize(text).slice(0, 12);
    if (text.trim().length < 2 || !terms.length) return { items: [], page, pageSize, hasMore: false };
    const result = await run(auth, tx => new sql.Request(tx)
      .input('tenantId', sql.UniqueIdentifier, auth.tenantId)
      .input('terms', sql.NVarChar(sql.MAX), JSON.stringify(terms))
      .input('phrase', sql.NVarChar(120), terms.join(' '))
      .input('offset', sql.Int, (page - 1) * pageSize)
      .input('take', sql.Int, pageSize + 1)
      .input('excludeFixtures', sql.Bit, excludeFixtures)
      .query(`SELECT account.JsonDoc
        FROM sync.EntityStore AS account
        CROSS APPLY (VALUES (JSON_VALUE(account.JsonDoc,'$.name'), JSON_VALUE(account.JsonDoc,'$.code'))) AS fields(DisplayName,AccountCode)
        CROSS APPLY (VALUES (${sqlSearchText("CONCAT(fields.DisplayName,N' ',fields.AccountCode,N' ',JSON_VALUE(account.JsonDoc,'$.erpId'),N' ',JSON_VALUE(account.JsonDoc,'$.mobile'),N' ',JSON_VALUE(account.JsonDoc,'$.phone'),N' ',JSON_VALUE(account.JsonDoc,'$.company'),N' ',JSON_VALUE(account.JsonDoc,'$.address'),N' ',JSON_VALUE(account.JsonDoc,'$.email'),N' ',JSON_QUERY(account.JsonDoc,'$.contacts'))")},
                             ${sqlSearchText("ISNULL(fields.DisplayName,N'')")},
                             ${sqlSearchText("ISNULL(fields.AccountCode,N'')")})) AS search(Combined,Name,Code)
        WHERE account.TenantId=@tenantId AND account.CollectionName=N'accounts' AND account.IsDeleted=0
          AND NULLIF(JSON_VALUE(account.JsonDoc,'$.deletedAt'),N'') IS NULL
          AND ISNULL(JSON_VALUE(account.JsonDoc,'$.isDeleted'),N'false') NOT IN (N'true',N'1')
          AND (@excludeFixtures=0 OR (account.IsDemo=0 AND account.EntityId NOT LIKE N'test-%'
            AND ISNULL(JSON_VALUE(account.JsonDoc,'$.source'),N'') NOT IN (N'LOCAL_TEST',N'DEMO',N'TEST_FIXTURE')
            AND ISNULL(JSON_VALUE(account.JsonDoc,'$.isDemo'),N'false')<>N'true'
            AND ISNULL(JSON_VALUE(account.JsonDoc,'$.enforcement'),N'')<>N'CRM_TEST_ONLY'))
          AND EXISTS (SELECT 1 FROM security.fn_EntityAccountScope(
            account.TenantId,N'accounts.view',account.EntityId,account.JsonDoc,account.UpdatedByUserId))
          AND NOT EXISTS (SELECT 1 FROM OPENJSON(@terms) AS term WHERE CHARINDEX(term.value,search.Combined)=0)
        ORDER BY CASE WHEN search.Name=@phrase THEN 0 WHEN search.Code=@phrase THEN 1
          WHEN CHARINDEX(@phrase,search.Name)=1 THEN 2 ELSE 3 END, fields.DisplayName,account.EntityId
        OFFSET @offset ROWS FETCH NEXT @take ROWS ONLY`));
    return { items: result.recordset.slice(0, pageSize).map(row => JSON.parse(row.JsonDoc)),
      page, pageSize, hasMore: result.recordset.length > pageSize };
  };
}
