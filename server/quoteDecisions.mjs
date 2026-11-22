import { createHash } from 'node:crypto';
import { uuid } from './taskRequestContract.mjs';
import { quoteDecisionBasis } from '../src/lib/quoteDecisionBasis.mjs';

const transitions = {
  REQUEST_APPROVAL: { from:['DRAFT'], to:'PENDING_APPROVAL', grant:'quotes.create', needsLines:true },
  APPROVE: { from:['DRAFT','PENDING_APPROVAL'], to:'APPROVED', grant:'quotes.approve', needsLines:true },
  ACCEPT: { from:['APPROVED'], to:'ACCEPTED', grant:'quotes.create' },
  REJECT: { from:['PENDING_APPROVAL'], to:'REJECTED', grant:'quotes.approve' },
};

export function quoteDecisionInput(body) {
  if (!uuid(body?.commandId) || !Object.hasOwn(transitions,body.action) || typeof body.expectedAt!=='string'
    || !/^\d{4}-\d{2}-\d{2}T/.test(body.expectedAt) || body.expectedAt.length>50 || !Number.isFinite(Date.parse(body.expectedAt))
    || typeof body.expectedBasis!=='string' || !/^[a-f0-9]{64}$/.test(body.expectedBasis)) return null;
  return { commandId:body.commandId.toLowerCase(),action:body.action,expectedAt:body.expectedAt,expectedBasis:body.expectedBasis };
}

export function createQuoteDecisions({sql,run}) {
  return (auth,id,input) => run(auth,async tx => {
    const rule=transitions[input.action];
    const request=()=>new sql.Request(tx).input('tenant',sql.UniqueIdentifier,auth.tenantId)
      .input('actor',sql.UniqueIdentifier,auth.userId).input('id',sql.NVarChar(200),id);
    const existing=(await request().input('grant',sql.NVarChar(120),rule.grant).query(`
      SELECT q.JsonDoc FROM sync.EntityStore q WITH(UPDLOCK,HOLDLOCK)
      WHERE q.TenantId=@tenant AND q.CollectionName=N'quotes' AND q.EntityId=@id AND q.IsDeleted=0
        AND EXISTS(SELECT 1 FROM security.fn_EntitySalesDocumentScope(q.TenantId,N'quotes',N'quotes.view',q.JsonDoc))
        AND EXISTS(SELECT 1 FROM security.fn_EntitySalesDocumentScope(q.TenantId,N'quotes',@grant,q.JsonDoc));`)).recordset[0];
    if (!existing) return { status:404,message:'این پیش‌فاکتور برای این اقدام در دسترس نیست.' };
    const quote=JSON.parse(existing.JsonDoc);
    const fingerprint=createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const prior=(await request().input('command',sql.NVarChar(100),input.commandId).query(`
      SELECT a.ActorUserId AS actor,JSON_VALUE(a.DetailsJson,'$.fingerprint') AS fingerprint
      FROM security.AuditEvent a WHERE a.TenantId=@tenant AND a.EntityType=N'QUOTE' AND a.EntityId=@id
        AND a.EventType=N'QUOTE_DECISION' AND a.CorrelationId=@command;`)).recordset[0];
    if (prior) return prior.actor?.toLowerCase()===auth.userId.toLowerCase() && prior.fingerprint===fingerprint
      ? {quote,replayed:true} : {status:409,message:'این شناسهٔ تصمیم قبلاً استفاده شده است.'};
    if ((quote.updatedAt ?? quote.createdAt)!==input.expectedAt || !rule.from.includes(quote.status)
      || await quoteDecisionBasis(quote)!==input.expectedBasis) {
      return {status:409,message:'پیش‌فاکتور تغییر کرده است. نسخهٔ تازه را دریافت کنید.'};
    }
    if (rule.needsLines && (!Array.isArray(quote.lines) || !quote.lines.length)) {
      return {status:422,message:'پیش از تصمیم‌گیری، ردیف‌های پیش‌فاکتور را کامل کنید.'};
    }
    const before=quote.status;
    quote.status=rule.to;
    // Keep the revision strictly increasing even when two updates land in one millisecond.
    quote.updatedAt=new Date(Math.max(Date.now(),Date.parse(input.expectedAt)+1)).toISOString();
    await request().input('owner',sql.UniqueIdentifier,uuid(quote.ownerId) ? quote.ownerId : null)
      .input('notifyManager',sql.Bit,input.action==='REQUEST_APPROVAL')
      .input('json',sql.NVarChar(sql.MAX),JSON.stringify(quote))
      .input('command',sql.NVarChar(100),input.commandId)
      .input('details',sql.NVarChar(sql.MAX),JSON.stringify({action:input.action,before,after:quote.status,fingerprint})).query(`
        UPDATE sync.EntityStore SET JsonDoc=@json,Version=Version+1,UpdatedAtUtc=SYSUTCDATETIME(),UpdatedByUserId=@actor
          WHERE TenantId=@tenant AND CollectionName=N'quotes' AND EntityId=@id;
        INSERT security.AuditEvent(TenantId,ActorUserId,CorrelationId,EventType,EntityType,EntityId,OutcomeCode,DetailsJson)
          VALUES(@tenant,@actor,@command,N'QUOTE_DECISION',N'QUOTE',@id,'SUCCESS',@details);
        DECLARE @recipient uniqueidentifier,@notification nvarchar(120)=CONCAT(N'quote-decision-',
          CONVERT(varchar(64),HASHBYTES('SHA2_256',CONCAT(@id,':',@command)),2));
        SELECT @recipient=CASE WHEN @notifyManager=1 THEN owner.ManagerUserId ELSE owner.UserId END
          FROM core.AppUser owner WHERE owner.TenantId=@tenant AND owner.UserId=@owner AND owner.IsActive=1;
        IF @recipient<>@actor AND EXISTS(
          SELECT 1 FROM crm.Account a JOIN core.AppUser owner ON owner.TenantId=a.TenantId AND owner.UserId=@owner
          CROSS APPLY security.fn_TaskRequestGrant(@tenant,@recipient,N'accounts.view',a.OwnerUserId,a.BranchId,a.TerritoryId,a.TeamId,0) accountAccess
          CROSS APPLY security.fn_TaskRequestGrant(@tenant,@recipient,N'quotes.view',owner.UserId,owner.BranchId,owner.TerritoryId,owner.TeamId,0) quoteAccess
          WHERE a.TenantId=@tenant AND a.AccountId=TRY_CONVERT(uniqueidentifier,COALESCE(JSON_VALUE(@json,'$.accountId'),JSON_VALUE(@json,'$.customerId')))
            AND (@notifyManager=0 OR EXISTS(SELECT 1 FROM security.fn_TaskRequestGrant(@tenant,@recipient,N'quotes.approve',
              owner.UserId,owner.BranchId,owner.TerritoryId,owner.TeamId,1)))
        )
          AND NOT EXISTS(SELECT 1 FROM sync.EntityStore n WITH(UPDLOCK,HOLDLOCK)
            WHERE n.TenantId=@tenant AND n.CollectionName=N'notifications' AND n.EntityId=@notification)
          INSERT sync.EntityStore(TenantId,CollectionName,EntityId,JsonDoc,UpdatedByUserId)
          SELECT @tenant,N'notifications',@notification,
            (SELECT @notification AS id,N'اقدام فروش نیازمند پیگیری' AS title,N'پیشنهادهای قابل مشاهده را در میز مذاکره بررسی کنید.' AS message,
              N'INFO' AS type,CONVERT(bit,0) AS [read],CONVERT(varchar(33),SYSUTCDATETIME(),126)+'Z' AS createdAt,
              N'quotes' AS linkTab,CONVERT(varchar(36),@recipient) AS recipientId FOR JSON PATH,WITHOUT_ARRAY_WRAPPER),@actor;`);
    return {quote,replayed:false};
  });
}
