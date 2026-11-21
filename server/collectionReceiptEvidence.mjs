const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const fail = (status, message) => ({ status, message });

// Both readers use the same rule. ERP receipt evidence does not prove bank deposit or invoice allocation.
export const collectionReceiptMatchesSql = (record = 'promise') => `
  payment.TenantId=${record}.TenantId
  AND payment.AccountId=TRY_CONVERT(uniqueidentifier,JSON_VALUE(${record}.JsonDoc,'$.accountId'))
  AND payment.IsVoided=0 AND payment.StatusCode='CLEARED' AND payment.CurrencyCode='IRR'
  AND payment.Amount>0 AND payment.Amount=TRY_CONVERT(decimal(19,4),JSON_VALUE(${record}.JsonDoc,'$.promisedAmount'))
  AND payment.PaymentDate>=TRY_CONVERT(date,LEFT(JSON_VALUE(${record}.JsonDoc,'$.createdAt'),10))
  AND payment.PaymentDate<=CONVERT(date,SYSUTCDATETIME())
  AND NULLIF(LTRIM(RTRIM(payment.ReferenceNumber)),N'') IS NOT NULL
  AND NULLIF(LTRIM(RTRIM(payment.ExternalPaymentId)),N'') IS NOT NULL
  AND UPPER(payment.SourceSystemCode) NOT IN ('DEMO','TEST','LOCAL_TEST')
`;

const columns = `payment.PaymentMirrorId AS id, payment.SourceSystemCode AS source,
  payment.ReferenceNumber AS reference, payment.ExternalPaymentId AS externalId,
  CONVERT(char(10),payment.PaymentDate,23) AS date, CONVERT(varchar(30),payment.Amount) AS amount,
  payment.SyncedAtUtc AS syncedAt`;

const unused = `NOT EXISTS (
  SELECT 1 FROM sync.EntityStore AS used
  WHERE used.TenantId=promise.TenantId AND used.CollectionName=N'collectionPromises' AND used.IsDeleted=0
    AND used.EntityId<>promise.EntityId
    AND TRY_CONVERT(uniqueidentifier,JSON_VALUE(used.JsonDoc,'$.receiptEvidence.id'))=payment.PaymentMirrorId
)`;

export function createCollectionReceiptEvidence({ sql, run }) {
  const promiseRequest = (tx, auth, id) => new sql.Request(tx)
    .input('tenantId', sql.UniqueIdentifier, auth.tenantId)
    .input('promiseId', sql.NVarChar(200), id);

  async function findPromise(tx, auth, id, write = false) {
    const result = await promiseRequest(tx, auth, id)
      .input('permission', sql.NVarChar(120), write ? 'finance.manage' : 'finance.view')
      .query(`
        SELECT promise.JsonDoc
        FROM sync.EntityStore AS promise ${write ? 'WITH (UPDLOCK,HOLDLOCK)' : ''}
        INNER JOIN crm.Account AS account ON account.TenantId=promise.TenantId
          AND account.AccountId=TRY_CONVERT(uniqueidentifier,JSON_VALUE(promise.JsonDoc,'$.accountId'))
        WHERE promise.TenantId=@tenantId AND promise.CollectionName=N'collectionPromises'
          AND promise.EntityId=@promiseId AND promise.IsDeleted=0
          AND EXISTS (SELECT 1 FROM security.fn_RecordReadScope(account.TenantId,@permission,
            account.OwnerUserId,account.BranchId,account.TerritoryId,account.TeamId))
          AND EXISTS (SELECT 1 FROM security.fn_RecordReadScope(account.TenantId,N'accounts.view',
            account.OwnerUserId,account.BranchId,account.TerritoryId,account.TeamId))`);
    return result.recordset[0] ? JSON.parse(result.recordset[0].JsonDoc) : null;
  }

  async function readPayment(tx, auth, id, paymentId, write = false) {
    if (typeof paymentId !== 'string' || !uuid.test(paymentId)) return null;
    const result = await promiseRequest(tx, auth, id).input('paymentId', sql.UniqueIdentifier, paymentId)
      .query(`SELECT ${columns}
        FROM sync.EntityStore AS promise
        INNER JOIN crm.PaymentMirror AS payment ${write ? 'WITH (UPDLOCK,HOLDLOCK)' : ''} ON ${collectionReceiptMatchesSql()}
        WHERE promise.TenantId=@tenantId AND promise.CollectionName=N'collectionPromises'
          AND promise.EntityId=@promiseId AND promise.IsDeleted=0 AND payment.PaymentMirrorId=@paymentId
          AND ${unused}`);
    return result.recordset[0] || null;
  }

  async function list(auth, id, rawPage) {
    if (typeof id !== 'string' || !uuid.test(id)) return fail(400, 'شناسهٔ تعهد معتبر نیست.');
    const page = Math.min(1000, Math.max(1, Number.parseInt(rawPage, 10) || 1));
    return run(auth, async tx => {
      const promise = await findPromise(tx, auth, id);
      if (!promise) return fail(404, 'تعهدی در محدودهٔ دسترسی یافت نشد.');
      const current = await readPayment(tx, auth, id, promise.receiptEvidence?.id);
      const { recordset } = current ? { recordset: [] } : await promiseRequest(tx, auth, id)
        .input('offset', sql.Int, (page - 1) * 10)
        .query(`SELECT ${columns}
          FROM sync.EntityStore AS promise
          INNER JOIN crm.PaymentMirror AS payment ON ${collectionReceiptMatchesSql()}
          WHERE promise.TenantId=@tenantId AND promise.CollectionName=N'collectionPromises'
            AND promise.EntityId=@promiseId AND promise.IsDeleted=0 AND ${unused}
          ORDER BY payment.PaymentDate DESC,payment.PaymentMirrorId
          OFFSET @offset ROWS FETCH NEXT 11 ROWS ONLY`);
      return { status: 200, body: { promiseId: id, current, invalidated: Boolean(promise.receiptEvidence && !current),
        items: recordset.slice(0, 10), page, hasMore: recordset.length > 10 } };
    });
  }

  async function attach(auth, id, paymentId, correlationId) {
    if (typeof id !== 'string' || !uuid.test(id) || typeof paymentId !== 'string' || !uuid.test(paymentId)) {
      return fail(400, 'شناسهٔ تعهد یا سند معتبر نیست.');
    }
    return run(auth, async tx => {
      await new sql.Request(tx).input('lock', sql.NVarChar(255), `collection-receipts:${auth.tenantId}`)
        .query(`DECLARE @result int;
          EXEC @result=sys.sp_getapplock @Resource=@lock,@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=8000;
          IF @result<0 THROW 50409,N'Could not acquire receipt reconciliation lock.',1;`);
      const promise = await findPromise(tx, auth, id, true);
      if (!promise) return fail(404, 'تعهدی با مجوز ثبت مدرک یافت نشد.');
      const linked = await readPayment(tx, auth, id, promise.receiptEvidence?.id, true);
      if (linked) {
        if (String(linked.id).toLowerCase() !== paymentId.toLowerCase()) return fail(409, 'این تعهد هم‌اکنون سند معتبر دارد.');
        return { status: 200, body: { promiseId: id, status: 'RECORDED', payment: linked } };
      }
      if (!['PENDING', 'BROKEN', 'FULFILLED'].includes(promise.status)) return fail(409, 'وضعیت تعهد اجازهٔ ثبت مدرک نمی‌دهد.');
      const payment = await readPayment(tx, auth, id, paymentId, true);
      if (!payment) return fail(409, 'سند دیگر قابل تطبیق نیست یا قبلاً به تعهد دیگری متصل شده است.');
      const at = new Date().toISOString();
      const evidence = { ...payment, matchedAt: at, matchedBy: auth.userId };
      const previous = promise.receiptEvidence;
      const next = { ...promise, status: 'FULFILLED', receiptEvidence: evidence,
        receiptHistory: [...(Array.isArray(promise.receiptHistory) ? promise.receiptHistory : []), ...(previous ? [previous] : [])] };
      await promiseRequest(tx, auth, id)
        .input('userId', sql.UniqueIdentifier, auth.userId)
        .input('correlationId', sql.NVarChar(100), correlationId)
        .input('json', sql.NVarChar(sql.MAX), JSON.stringify(next))
        .input('audit', sql.NVarChar(sql.MAX), JSON.stringify({ receiptId: payment.id, previousReceiptId: previous?.id }))
        .query(`UPDATE sync.EntityStore SET JsonDoc=@json,UpdatedAtUtc=SYSUTCDATETIME(),UpdatedByUserId=@userId,Version=Version+1
          WHERE TenantId=@tenantId AND CollectionName=N'collectionPromises' AND EntityId=@promiseId AND IsDeleted=0;
          IF @@ROWCOUNT<>1 THROW 50409,N'Collection promise changed.',1;
          INSERT security.AuditEvent(TenantId,ActorUserId,CorrelationId,EventType,EntityType,EntityId,OutcomeCode,DetailsJson)
          VALUES (@tenantId,@userId,@correlationId,N'collection.receipt.linked',N'CollectionPromise',@promiseId,'SUCCESS',@audit);`);
      return { status: 200, body: { promiseId: id, status: 'RECORDED', payment } };
    });
  }
  return { list, attach };
}
