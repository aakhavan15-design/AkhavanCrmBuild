import { createHash } from 'node:crypto';
import { appendTaskActivity } from '../src/services/taskActivity.ts';
import { getMetricThresholds } from '../src/lib/metricConfig.ts';
import { applyRequestCommand, approvals, availableActions, commandInput, isRequestId, kinds, policyInput, requestInput, summarizeOrderMargin, validateOrderPriceAuthorization, uuid } from './taskRequestContract.mjs';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const failure = (status,code,message) => Object.assign(new Error(message),{status,code});
const forbidden = () => failure(403,'REQUEST_PERMISSION_DENIED','مجوز این اقدام یا مشاهدهٔ مرجع درخواست را ندارید.');
const missing = () => failure(404,'REQUEST_NOT_FOUND','درخواست در دسترس نیست.');
const invalid = message => failure(400,'REQUEST_INVALID',message);
const conflict = (message='درخواست تغییر کرده است. نسخهٔ تازه را دریافت کنید.') => failure(409,'REQUEST_VERSION_CONFLICT',message);
const modes = new Set(['ALL','MINE','DECISION','CREATED','WATCHING','TEAM','WAITING','OVERDUE','UNSEEN','BLOCKED','CLOSED']);
const decisionGrant = 'quotes.approve';

const activeUsersSql = `
SELECT u.UserId AS id,u.DisplayName AS name,CAST(CASE WHEN u.UserId=@actor OR u.UserId=v.ManagerUserId
 OR EXISTS(SELECT 1 FROM (VALUES(N'tasks.assign'),(N'internal.manage'),(N'accounts.edit')) g(code)
 CROSS APPLY security.fn_TaskRequestGrant(@tenantId,@actor,g.code,u.UserId,u.BranchId,u.TerritoryId,u.TeamId,1))
 THEN 1 ELSE 0 END AS bit) AS canAssign
FROM core.AppUser u JOIN core.AppUser v ON v.TenantId=u.TenantId AND v.UserId=@actor AND v.IsActive=1
WHERE u.TenantId=@tenantId AND u.IsActive=1
  AND (@target IS NULL OR u.UserId=@target)
  AND (@search IS NULL OR CHARINDEX(@search,u.DisplayName)>0)
  AND (@recruitment=0 OR EXISTS(SELECT 1 FROM security.fn_TaskRequestGrant(@tenantId,u.UserId,N'users.manage',NULL,NULL,NULL,NULL,1)))`;

const rowsSql = `
SELECT task.EntityId AS id,task.JsonDoc,CONVERT(varchar(20),task.Version) AS version,a.*,
  employee.DisplayName AS assigneeName,creator.DisplayName AS creatorName
FROM sync.EntityStore task
CROSS APPLY security.fn_TaskRequestAccess(task.TenantId,@actor,task.JsonDoc) a
LEFT JOIN core.AppUser employee ON employee.TenantId=task.TenantId AND employee.UserId=TRY_CONVERT(uniqueidentifier,JSON_VALUE(task.JsonDoc,'$.assigneeId'))
LEFT JOIN core.AppUser creator ON creator.TenantId=task.TenantId AND creator.UserId=TRY_CONVERT(uniqueidentifier,JSON_VALUE(task.JsonDoc,'$.createdBy'))
WHERE task.TenantId=@tenantId AND task.CollectionName=N'tasks' AND task.IsDeleted=0 AND task.EntityId LIKE N'taskreq-%'`;

const decisionWaitingSql = `a.canDecide=1 AND JSON_VALUE(task.JsonDoc,'$.status')='PENDING_APPROVAL'
  AND EXISTS(SELECT 1 FROM OPENJSON(task.JsonDoc,'$.managedRequest.activeApprovers') p WHERE TRY_CONVERT(uniqueidentifier,p.value)=@actor)
  AND NOT EXISTS(SELECT 1 FROM OPENJSON(task.JsonDoc,'$.managedRequest.decisions')
    WITH(actor uniqueidentifier,step int) d WHERE d.actor=@actor AND d.step=TRY_CONVERT(int,JSON_VALUE(task.JsonDoc,'$.managedRequest.step')))`;

const accountSql = `
SELECT a.AccountId AS id,a.Name AS name,
 CAST(CASE WHEN EXISTS(SELECT 1 FROM security.fn_TaskRequestGrant(@tenantId,@actor,N'tasks.request.costs',a.OwnerUserId,a.BranchId,a.TerritoryId,a.TeamId,0))
 AND EXISTS(SELECT 1 FROM security.fn_TaskRequestGrant(@tenantId,@actor,N'finance.view',a.OwnerUserId,a.BranchId,a.TerritoryId,a.TeamId,0))
 THEN 1 ELSE 0 END AS bit) AS seesCost
FROM crm.Account a
CROSS APPLY security.fn_TaskRequestGrant(@tenantId,@actor,N'accounts.view',a.OwnerUserId,a.BranchId,a.TerritoryId,a.TeamId,0) scope
WHERE a.TenantId=@tenantId AND a.AccountId=@accountId AND a.DeletedAtUtc IS NULL;`;

const financeReferencesSql = `
WITH documentRefs AS (
  SELECT 'INVOICE' AS type,InvoiceMirrorId AS id,InvoiceNumber AS title,InvoiceDate AS [date],SourceSystemCode AS source,IsVoided AS voided
  FROM crm.InvoiceMirror WHERE TenantId=@tenantId AND AccountId=@accountId AND DeletedAtUtc IS NULL
  UNION ALL
  SELECT 'CHEQUE',ChequeMirrorId,ChequeNumber,DueDate,SourceSystemCode,IsVoided
  FROM crm.ChequeMirror WHERE TenantId=@tenantId AND AccountId=@accountId
)
SELECT TOP(60) r.type,r.id,r.title,CONVERT(char(10),r.[date],126) AS [date],r.source,r.voided
FROM documentRefs r JOIN crm.Account a ON a.TenantId=@tenantId AND a.AccountId=@accountId AND a.DeletedAtUtc IS NULL
CROSS APPLY security.fn_TaskRequestGrant(@tenantId,@actor,N'accounts.view',a.OwnerUserId,a.BranchId,a.TerritoryId,a.TeamId,0)
CROSS APPLY security.fn_TaskRequestGrant(@tenantId,@actor,N'finance.view',a.OwnerUserId,a.BranchId,a.TerritoryId,a.TeamId,0)
WHERE (@type IS NULL OR r.type=@type)
  AND (@links IS NULL OR EXISTS(SELECT 1 FROM OPENJSON(@links) WITH(type varchar(20),id uniqueidentifier) l WHERE l.type=r.type AND l.id=r.id))
  AND (@search=N'' OR CHARINDEX(@search,r.title)>0)
ORDER BY r.[date] DESC,r.type,r.id;`;

const orderSql = `
SELECT o.SalesOrderId AS id,o.AccountId AS accountId,o.OrderNumber AS number,o.StatusCode AS status,o.CurrencyCode AS currency,
 o.OrderDate AS [date],CONVERT(varchar(48),o.Subtotal) AS subtotal,CONVERT(varchar(48),o.DiscountTotal) AS discount,
 CONVERT(varchar(48),o.NetAmount) AS total,CONVERT(varchar(18),o.RowVersion,1) AS [version],
 o.SourceSystemCode AS source,o.ExternalOrderId AS externalId,
 CASE WHEN @cost=1 THEN o.ProfitCompletenessCode END AS profitCompleteness
FROM crm.SalesOrder o WITH(HOLDLOCK)
WHERE o.TenantId=@tenantId AND o.AccountId=@accountId AND o.SalesOrderId=@orderId AND o.DeletedAtUtc IS NULL;
SELECT l.LineNumber AS number,l.ExternalProductId AS product,l.ProductNameSnapshot AS title,l.UnitCode AS unit,
 CONVERT(varchar(48),l.Quantity) AS quantity,CONVERT(varchar(48),l.UnitPrice) AS price,
 CONVERT(varchar(48),l.DiscountAmount) AS discount,CONVERT(varchar(48),l.NetLineAmount) AS total,
 CASE WHEN @cost=1 THEN CONVERT(varchar(48),l.CostAmount) END AS cost,
 CASE WHEN @cost=1 THEN CONVERT(varchar(48),l.MarginAmount) END AS margin
FROM crm.SalesOrderLine l WITH(HOLDLOCK)
WHERE l.TenantId=@tenantId AND l.SalesOrderId=@orderId ORDER BY l.LineNumber;`;

function orderFingerprint(order) {
  if (!order) return null;
  const {profitCompleteness:_completeness,...snapshot}=order;
  return digest({...snapshot,lines:order.lines.map(({cost:_cost,margin:_margin,...row}) => row)});
}

export function createTaskRequests({sql,run}) {
  const input = (tx,auth) => new sql.Request(tx)
    .input('tenantId',sql.UniqueIdentifier,auth.tenantId).input('actor',sql.UniqueIdentifier,auth.userId);
  const requestById = (tx,auth,id) => input(tx,auth).input('id',sql.NVarChar(120),id);
  const actorId = auth => String(auth.userId).toLowerCase();
  const grant = async (tx,auth,permission,write=true) => (await input(tx,auth).input('permission',sql.NVarChar(120),permission).input('write',sql.Bit,write).query(`
    SELECT 1 FROM core.AppUser u CROSS APPLY security.fn_TaskRequestGrant(@tenantId,@actor,@permission,u.UserId,u.BranchId,u.TerritoryId,u.TeamId,@write)
    WHERE u.TenantId=@tenantId AND u.UserId=@actor AND u.IsActive=1;`)).recordset.length>0;

  async function access(tx,auth,task,viewer = auth.userId) {
    return (await input(tx,auth).input('viewer',sql.UniqueIdentifier,viewer).input('task',sql.NVarChar(sql.MAX),JSON.stringify(task))
      .query('SELECT * FROM security.fn_TaskRequestAccess(@tenantId,@viewer,@task);')).recordset[0];
  }

  async function get(tx,auth,id,lock=false) {
    if (!isRequestId(id)) throw missing();
    const query = lock ? rowsSql.replace('FROM sync.EntityStore task','FROM sync.EntityStore task WITH(UPDLOCK,HOLDLOCK)') : rowsSql;
    const row = (await requestById(tx,auth,id).query(`${query} AND task.EntityId=@id;`)).recordset[0];
    if (!row) throw missing();
    return {...row,task:JSON.parse(row.JsonDoc)};
  }

  async function assignee(tx,auth,id,recruitment=false) {
    const row = (await input(tx,auth).input('target',sql.UniqueIdentifier,id).input('search',sql.NVarChar(80),null)
      .input('recruitment',sql.Bit,recruitment)
      .query(activeUsersSql)).recordset[0];
    if (!row?.canAssign) throw forbidden();
    return row;
  }

  async function verifyWatchers(tx,auth,task) {
    const approverIds = task.managedRequest.policy?.steps.flatMap(step => step.members) ?? [];
    for (const watcher of task.managedRequest.watchers) {
      if (watcher===task.assigneeId || watcher===task.managedRequest.policy?.accountingUserId || approverIds.includes(watcher)) {
        throw invalid('مسئول یا تصمیم‌گیر همین درخواست نمی‌تواند ناظر آن باشد.');
      }
      const permissions = await access(tx,auth,task,watcher);
      if (!permissions?.isWatcher) throw failure(403,'WATCHER_NOT_ALLOWED','یک ناظر انتخاب‌شده مجوز مشاهده و نظارت بر این نوع درخواست را ندارد.');
    }
  }

  async function approvedPolicy(tx,auth,kind) {
    if (!approvals.has(kind)) return null;
    const record = (await input(tx,auth).input('code',sql.NVarChar(100),`TASK_REQUEST:${kind}`).query(`
      SELECT WorkflowId AS id,Version AS version,DefinitionJson AS spec FROM crm.WorkflowDefinition
      WHERE TenantId=@tenantId AND WorkflowCode=@code AND TriggerCode='TASK_REQUEST' AND IsEnabled=1;`)).recordset[0];
    const policy = record ? policyInput(JSON.parse(record.spec)) : null;
    if (!policy || (kind==='ORDER_APPROVAL' && !policy.accountingUserId)) {
      throw failure(422,'APPROVAL_POLICY_UNAVAILABLE','سیاست تأیید معتبر و مسئول مالی سفارش در تنظیمات گردش‌کار ثبت نشده است.');
    }
    return {...policy,id:record.id,version:record.version};
  }

  async function readOrder(tx,auth,task,cost=false) {
    const link = task.managedRequest.links.find(item => item.type==='ORDER');
    if (!link) return null;
    const result = await input(tx,auth).input('orderId',sql.UniqueIdentifier,link.id)
      .input('accountId',sql.UniqueIdentifier,task.accountId).input('cost',sql.Bit,cost).query(orderSql);
    if (!result.recordsets[0]?.length) return null;
    return {...result.recordsets[0][0],lines:result.recordsets[1]};
  }

  async function financeReferences(tx,auth,accountId,{type=null,search='',links=null}={}) {
    const result=await input(tx,auth).input('accountId',sql.UniqueIdentifier,accountId)
      .input('type',sql.VarChar(20),type).input('search',sql.NVarChar(80),search)
      .input('links',sql.NVarChar(sql.MAX),links ? JSON.stringify(links) : null).query(financeReferencesSql);
    return result.recordset;
  }

  async function checkPriceAuthorization(tx,auth,task,forUse,commandId) {
    const grantId=task.managedRequest.priceAuthorizationId;
    const grant=await get(tx,auth,grantId,forUse);
    const permission=grant.task.managedRequest;
    const authorization=permission.authorization;
    if (grant.task.status!=='APPROVED' || permission.kind!=='PRICE_PERMISSION' || authorization?.revision!==permission.contentRevision) {
      throw invalid('مجوز قیمت فعلی و تأییدشده در دسترس نیست.');
    }
    const sourcePolicy=await approvedPolicy(tx,auth,'PRICE_PERMISSION');
    if (sourcePolicy.id!==permission.policy?.id || sourcePolicy.version!==permission.policy?.version) {
      throw conflict('نسخهٔ سیاست مجوز قیمت تغییر کرده است.');
    }
    const order=await readOrder(tx,auth,task);
    const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const problem=validateOrderPriceAuthorization(order,authorization,today);
    if (problem) throw invalid(problem);
    if (!forUse || authorization.usedOrders?.includes(order.id)) return;
    const usedOrders=[...(authorization.usedOrders ?? []),order.id];
    const updated=appendTaskActivity({...grant.task,managedRequest:{...permission,authorization:{...authorization,usedOrders}}},
      {id:commandId,action:'PRICE_USED',actorId:actorId(auth),summary:'مصرف مجوز در تأیید سفارش ثبت شد'});
    const persisted=await requestById(tx,auth,grantId).input('version',sql.VarChar(20),grant.version)
      .input('task',sql.NVarChar(sql.MAX),JSON.stringify(updated)).query(`
        UPDATE sync.EntityStore SET JsonDoc=@task,Version=Version+1,UpdatedAtUtc=SYSUTCDATETIME(),UpdatedByUserId=@actor
        OUTPUT inserted.EntityId WHERE TenantId=@tenantId AND CollectionName=N'tasks' AND EntityId=@id
          AND IsDeleted=0 AND Version=TRY_CONVERT(bigint,@version);`);
    if (persisted.recordset.length!==1) throw conflict('مجوز قیمت هم‌زمان تغییر کرده است.');
    await writeAudit(tx,auth,grantId,commandId,'TASK_REQUEST_PRICE_USED',digest([grantId,order.id,permission.contentRevision]),
      {orderId:order.id,orderRequestId:task.id,priceRevision:permission.contentRevision,uses:usedOrders.length});
  }

  async function verifyContent(tx,auth,value,task) {
    if (value.accountId) {
      const account = (await input(tx,auth).input('accountId',sql.UniqueIdentifier,value.accountId).query(accountSql)).recordset[0];
      if (!account) throw forbidden();
    } else if (value.links.length) throw invalid('برای پیوند رکورد مالی یا فروش، ابتدا مشتری را مشخص کنید.');
    const links=value.links.filter(item => item.type!=='ORDER');
    if (links.length) {
      if (!['FINANCE','COLLECTION','ORDER_APPROVAL'].includes(value.kind)) throw invalid('این نوع درخواست پیوند سند مالی نمی‌پذیرد.');
      const refs=await financeReferences(tx,auth,value.accountId,{links});
      if (refs.length!==links.length) throw forbidden();
    }
    if (value.links.some(item => item.type==='ORDER')) {
      if (value.kind!=='ORDER_APPROVAL') throw invalid('پیوند رسمی سفارش در درخواست تأیید سفارش ثبت می‌شود.');
      const order = await readOrder(tx,auth,task);
      if (!order || !order.lines.length || ['CANCELLED','REJECTED','SENT_TO_ERP','CONFIRMED'].includes(order.status)) throw invalid('سفارش معتبرِ آمادهٔ بررسی یافت نشد.');
      task.managedRequest.orderFingerprint=orderFingerprint(order);
    }
    if (value.priceItems.length) {
      const result = await input(tx,auth).input('items',sql.NVarChar(sql.MAX),JSON.stringify(value.priceItems)).query(`
        SELECT CONVERT(varchar(36),p.ExternalProductKey) AS id,p.ProductName AS title,p.BaseUnitCode AS unit,p.SourceSystemCode AS source,p.ExternalProductId AS externalId
        FROM OPENJSON(@items) WITH(productId uniqueidentifier) item
        JOIN crm.ExternalProduct p ON p.TenantId=@tenantId AND p.ExternalProductKey=item.productId AND p.IsActive=1;`);
      if (result.recordset.length!==value.priceItems.length) throw invalid('یک کالا در کاتالوگ معتبر ERP یافت نشد.');
      const sources=[...new Set(result.recordset.map(item => item.source))];
      if (sources.length!==1) throw invalid('همهٔ اقلام یک مجوز باید به یک کاتالوگ ERP تعلق داشته باشند.');
      task.managedRequest.priceSource=sources[0];
      const products = new Map(result.recordset.map(p => [p.id.toLowerCase(),p]));
      task.managedRequest.priceItems=value.priceItems.map(item => ({...item,title:products.get(item.productId).title,unit:products.get(item.productId).unit,externalId:products.get(item.productId).externalId}));
    }
  }

  async function accountant(tx,auth,task,viewer) {
    if (!viewer) return null;
    const result=await input(tx,auth).input('viewer',sql.UniqueIdentifier,viewer).input('accountId',sql.UniqueIdentifier,task.accountId)
      .input('request',sql.NVarChar(sql.MAX),JSON.stringify({...task,status:'APPROVED',assigneeId:viewer})).query(`
        SELECT u.DisplayName AS name FROM core.AppUser u JOIN crm.Account a ON a.TenantId=u.TenantId AND a.AccountId=@accountId
        CROSS APPLY security.fn_TaskRequestGrant(@tenantId,u.UserId,N'finance.manage',a.OwnerUserId,a.BranchId,a.TerritoryId,a.TeamId,1)
        CROSS APPLY security.fn_TaskRequestAccess(@tenantId,u.UserId,@request)
        WHERE u.TenantId=@tenantId AND u.UserId=@viewer AND u.IsActive=1;`);
    return result.recordset[0]?.name ?? null;
  }

  async function invoiceEvidence(tx,auth,task) {
    const order=await readOrder(tx,auth,task);
    if (!order?.source || !order.externalId) return null;
    const result=await input(tx,auth).input('source',sql.VarChar(40),order.source)
      .input('externalOrder',sql.NVarChar(200),order.externalId).input('accountId',sql.UniqueIdentifier,task.accountId)
      .query(`SELECT TOP(2) i.InvoiceMirrorId AS id,i.InvoiceNumber AS number,i.InvoiceDate AS [date],i.SourceSystemCode AS source
        FROM crm.InvoiceMirror i JOIN crm.Account a ON a.TenantId=i.TenantId AND a.AccountId=i.AccountId
        CROSS APPLY security.fn_TaskRequestGrant(@tenantId,@actor,N'finance.manage',a.OwnerUserId,a.BranchId,a.TerritoryId,a.TeamId,1)
        CROSS APPLY (
          SELECT MAX(m.StandardCode) AS status FROM integration.CodeMapping m
          WHERE m.TenantId=@tenantId AND m.SourceSystemCode=i.SourceSystemCode AND m.MappingDomain='INVOICE_STATUS'
            AND m.ExternalCode=i.StatusCode AND m.MapStatus='APPROVED' AND m.EffectiveFrom<=i.InvoiceDate
            AND (m.EffectiveTo IS NULL OR m.EffectiveTo>=i.InvoiceDate)
          HAVING COUNT_BIG(*)=1
        ) state
        WHERE i.TenantId=@tenantId AND i.SourceSystemCode=@source AND i.ExternalSourceOrderId=@externalOrder
          AND i.AccountId=@accountId AND i.DeletedAtUtc IS NULL AND i.IsVoided=0 AND state.status IN('POSTED','FINAL');`);
    return result.recordset.length===1 ? result.recordset[0] : null;
  }

  async function customerContext(tx,auth,task) {
    if (!task.accountId) return null;
    const result=await input(tx,auth).input('accountId',sql.UniqueIdentifier,task.accountId).query(`
      SELECT CONVERT(varchar(48),a.CreditLimit) AS creditLimit,a.CurrencyCode AS currency
      FROM crm.Account a
      CROSS APPLY security.fn_TaskRequestGrant(@tenantId,@actor,N'finance.view',a.OwnerUserId,a.BranchId,a.TerritoryId,a.TeamId,0)
      WHERE a.TenantId=@tenantId AND a.AccountId=@accountId;

      SELECT TOP(5) o.OrderNumber AS number,CONVERT(char(10),o.OrderDate,126) AS [date],
        o.CurrencyCode AS currency,CONVERT(varchar(48),o.NetAmount) AS amount
      FROM crm.SalesOrder o JOIN crm.Account a ON a.TenantId=o.TenantId AND a.AccountId=o.AccountId
      CROSS APPLY security.fn_TaskRequestGrant(@tenantId,@actor,N'quotes.view',a.OwnerUserId,a.BranchId,a.TerritoryId,a.TeamId,0)
      WHERE o.TenantId=@tenantId AND o.AccountId=@accountId AND o.DeletedAtUtc IS NULL AND o.StatusCode NOT IN('DRAFT','CANCELLED')
      ORDER BY o.OrderDate DESC,o.SalesOrderId;

      SELECT TOP(5) c.ChequeNumber AS number,CONVERT(char(10),c.DueDate,126) AS dueDate,c.IsBounced AS bounced,
        mapping.status AS sourceState
      FROM crm.ChequeMirror c JOIN crm.Account a ON a.TenantId=c.TenantId AND a.AccountId=c.AccountId
      CROSS APPLY security.fn_TaskRequestGrant(@tenantId,@actor,N'finance.view',a.OwnerUserId,a.BranchId,a.TerritoryId,a.TeamId,0)
      OUTER APPLY(
        SELECT MAX(m.StandardCode) AS status FROM integration.CodeMapping m
        WHERE m.TenantId=c.TenantId AND m.SourceSystemCode=c.SourceSystemCode AND m.MappingDomain='CHEQUE_STATUS'
          AND m.ExternalCode=c.StatusCode AND m.MapStatus='APPROVED' AND m.EffectiveFrom<=CONVERT(date,SYSUTCDATETIME())
          AND (m.EffectiveTo IS NULL OR m.EffectiveTo>=CONVERT(date,SYSUTCDATETIME()))
        HAVING COUNT_BIG(*)=1
      ) mapping WHERE c.TenantId=@tenantId AND c.AccountId=@accountId AND c.DirectionCode='RECEIVED'
        AND c.IsVoided=0 AND c.IsGuarantee=0 ORDER BY c.DueDate DESC,c.ChequeMirrorId;

      SELECT TOP(5) TRY_CONVERT(date,JSON_VALUE(p.JsonDoc,'$.promisedDate')) AS dueDate,JSON_VALUE(p.JsonDoc,'$.status') AS status
      FROM sync.EntityStore p JOIN crm.Account a ON a.TenantId=p.TenantId AND a.AccountId=@accountId
      CROSS APPLY security.fn_TaskRequestGrant(@tenantId,@actor,N'finance.view',a.OwnerUserId,a.BranchId,a.TerritoryId,a.TeamId,0)
      WHERE p.TenantId=@tenantId AND p.CollectionName=N'collectionPromises' AND p.IsDeleted=0
        AND TRY_CONVERT(uniqueidentifier,JSON_VALUE(p.JsonDoc,'$.accountId'))=@accountId
      ORDER BY TRY_CONVERT(date,JSON_VALUE(p.JsonDoc,'$.promisedDate')) DESC,p.EntityId;`);
    return { finance:result.recordsets[0]?.[0] ?? null, orders:result.recordsets[1] ?? [],
      cheques:result.recordsets[2] ?? [], promises:result.recordsets[3] ?? [] };
  }

  async function construct(tx,auth,value,now,previous) {
    const approverPolicy = await approvedPolicy(tx,auth,value.kind);
    const creator = previous?.createdBy ?? actorId(auth);
    const owner = await assignee(tx,auth,value.assigneeId);
    const task = {
      id:previous?.id ?? `taskreq-${value.requestId}`,title:value.title,description:value.description,priority:value.priority,
      accountId:value.accountId,customerId:value.accountId,assigneeType:'USER',assigneeId:value.assigneeId,assignedTo:value.assigneeId,
      ownerId:value.assigneeId,createdBy:creator,createdAt:previous?.createdAt ?? now,dueDate:value.dueDate,
      status:approverPolicy ? 'PENDING_APPROVAL' : 'OPEN', type:'REQUEST',result:'',completedAt:null,
      nextAction:approverPolicy ? 'بررسی و تصمیم مرحلهٔ جاری' : 'رسیدگی به درخواست و ثبت پاسخ',
      activityHistory:previous?.activityHistory ?? [],
      managedRequest:{ kind:value.kind,priceAuthorizationId:value.priceAuthorizationId,confidential:value.confidential,watchers:value.watchers,links:value.links,
        priceItems:value.priceItems,assigneeName:owner.name,assignedAt:now,contentRevision:(previous?.managedRequest.contentRevision ?? 0)+1,
        policy:approverPolicy,step:0,activeApprovers:approverPolicy?.steps[0].members ?? [],seenBy:[],decisions:[],condition:null,authorization:null },
    };
    await verifyContent(tx,auth,value,task);
    const rights = await access(tx,auth,task);
    if (!rights || (value.watchers.length && !rights.canWatch) || !(await access(tx,auth,task,value.assigneeId))) throw forbidden();
    if (approverPolicy?.steps.some(step => step.members.includes(creator))) {
      throw invalid('ایجادکننده نمی‌تواند در سیاست تأیید همین درخواست تصمیم‌گیر باشد.');
    }
    await verifyWatchers(tx,auth,task);
    if (task.managedRequest.priceAuthorizationId) await checkPriceAuthorization(tx,auth,task,false);
    return task;
  }

  async function writeAudit(tx,auth,taskId,commandId,action,fingerprint,details) {
    await requestById(tx,auth,taskId).input('command',sql.NVarChar(100),commandId).input('action',sql.NVarChar(120),action)
      .input('evidence',sql.NVarChar(sql.MAX),JSON.stringify({...details,fingerprint})).query(`
        INSERT security.AuditEvent(TenantId,ActorUserId,CorrelationId,EventType,EntityType,EntityId,OutcomeCode,DetailsJson)
        VALUES(@tenantId,@actor,@command,@action,N'TASK',@id,'SUCCESS',@evidence);`);
  }

  async function notify(tx,auth,task,commandId,extra=[],overdue=false) {
    const recipients = [...new Set([task.createdBy,task.assigneeId,...task.managedRequest.watchers,...task.managedRequest.activeApprovers,...extra])]
      .filter(id => id && id!==actorId(auth));
    if (!recipients.length) return;
    await input(tx,auth).input('targets',sql.NVarChar(sql.MAX),JSON.stringify(recipients))
      .input('payload',sql.NVarChar(sql.MAX),JSON.stringify(task)).input('command',sql.NVarChar(100),commandId)
      .input('taskId',sql.NVarChar(120),task.id)
      .input('notice',sql.NVarChar(200),overdue ? 'مهلت یک درخواست کاری گذشته است' : 'درخواست کاری به‌روزرسانی شد').query(`
      INSERT sync.EntityStore(TenantId,CollectionName,EntityId,JsonDoc,UpdatedByUserId)
      SELECT @tenantId,N'notifications',notification.id,
        (SELECT notification.id,@notice AS title,N'برای مشاهدهٔ جزئیات به کارتابل مراجعه کنید.' AS message,
          'INFO' AS type,CAST(0 AS bit) AS [read],CONVERT(varchar(33),SYSUTCDATETIME(),126)+'Z' AS createdAt,
          'tasks' AS linkTab,@taskId AS requestId,CONVERT(varchar(36),people.viewer) AS recipientId
          FOR JSON PATH,WITHOUT_ARRAY_WRAPPER),@actor
      FROM OPENJSON(@targets) WITH(viewer uniqueidentifier '$') people
      CROSS APPLY security.fn_TaskRequestAccess(@tenantId,people.viewer,@payload) scope
      CROSS APPLY(SELECT CONCAT('task-update-',CONVERT(varchar(64),HASHBYTES('SHA2_256',CONCAT(@taskId,':',@command,':',people.viewer)),2)) AS id) notification
      WHERE NOT EXISTS(SELECT 1 FROM sync.EntityStore existing WHERE existing.TenantId=@tenantId AND existing.CollectionName=N'notifications'
        AND existing.EntityId=notification.id);`);
  }

  function present(row,auth) {
    const {task} = row;
    const {policy:_policy,...record} = task.managedRequest;
    const member = actorId(auth);
    const step = task.managedRequest.policy?.steps[task.managedRequest.step];
    return { task:{...task,managedRequest:record},version:row.version,
      permissions:{ canFiles:row.canFiles,canUpload:row.canUpload,canWatch:row.canWatch,isWatcher:row.isWatcher,isManager:row.isManager,
        actions:availableActions(task,row,member) },
      assignee:row.assigneeName,creator:row.creatorName,
      approval:step ? {index:task.managedRequest.step+1,total:task.managedRequest.policy.steps.length,required:step.required,
        received:task.managedRequest.decisions.filter(x => x.step===task.managedRequest.step).length} : null };
  }

  const attachmentName = name => typeof name==='string' && name.trim().length>0 && name.length<=180 &&
    !/[\u0000-\u001f\u007f/\\]/.test(name) ? name.trim() : null;
  const contentTypes = {
    'image/png': bytes => bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),
    'image/jpeg': bytes => bytes.subarray(0,3).equals(Buffer.from([255,216,255])),
    'image/webp': bytes => bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP',
    'application/pdf': bytes => bytes.toString('ascii',0,5)==='%PDF-',
  };

  async function createInTransaction(tx,auth,body) {
    const value=requestInput(body);
    if (!value) throw invalid('عنوان، مسئول، نوع یا اطلاعات ضروری درخواست معتبر نیست.');
    const id=`taskreq-${value.requestId}`;
    const existing=(await requestById(tx,auth,id).query(`
      SELECT JSON_VALUE(JsonDoc,'$.createFingerprint') AS fingerprint,JSON_VALUE(JsonDoc,'$.createdBy') AS creator,IsDeleted
      FROM sync.EntityStore WITH(UPDLOCK,HOLDLOCK) WHERE TenantId=@tenantId AND CollectionName=N'tasks' AND EntityId=@id;`)).recordset[0];
    const fingerprint=digest(value);
    if (existing) {
      if (existing.IsDeleted || existing.creator!==actorId(auth) || existing.fingerprint!==fingerprint) throw conflict();
      return {...present(await get(tx,auth,id),auth),replayed:true};
    }
    if (!(await grant(tx,auth,'tasks.create') || await grant(tx,auth,'tasks.edit') ||
          await grant(tx,auth,'accounts.edit') || await grant(tx,auth,'internal.manage'))) throw forbidden();
    const now=new Date().toISOString();
    let task = await construct(tx,auth,value,now);
    task=appendTaskActivity({...task,createFingerprint:fingerprint},
      {id:value.requestId,action:'CREATED',actorId:actorId(auth),at:now,summary:'درخواست ثبت و ارجاع شد'});
    await requestById(tx,auth,id).input('task',sql.NVarChar(sql.MAX),JSON.stringify(task)).query(`
      INSERT sync.EntityStore(TenantId,CollectionName,EntityId,JsonDoc,UpdatedByUserId) VALUES(@tenantId,N'tasks',@id,@task,@actor);`);
    await writeAudit(tx,auth,id,value.requestId,'TASK_REQUEST_CREATED',fingerprint,{after:task.status,contentRevision:1});
    await notify(tx,auth,task,value.requestId);
    return {...present(await get(tx,auth,id),auth),replayed:false};
  }

  return {
    reportingLines: auth => run(auth,async tx => {
      const result=await input(tx,auth).query(`SELECT CONVERT(varchar(36),UserId) AS id,DisplayName AS name,
        CONVERT(varchar(36),ManagerUserId) AS managerId FROM core.AppUser
        WHERE TenantId=@tenantId AND IsActive=1 ORDER BY DisplayName,UserId;`);
      return {items:result.recordset};
    }),

    changeReportingLine(auth,userId,body) {
      if (!uuid(userId) || !uuid(body?.commandId) || !(body.managerId===null || uuid(body.managerId)) ||
          !(body.expectedManagerId===null || uuid(body.expectedManagerId))) throw invalid('شناسه یا نسخهٔ سرپرستی معتبر نیست.');
      const reason=typeof body.reason==='string' ? body.reason.trim() : '';
      if (!reason || reason.length>600) throw invalid('دلیل تغییر سرپرست را وارد کنید.');
      return run(auth,async tx => {
        const result=await input(tx,auth).input('user',sql.UniqueIdentifier,userId).input('manager',sql.UniqueIdentifier,body.managerId)
          .input('expected',sql.UniqueIdentifier,body.expectedManagerId).input('command',sql.NVarChar(100),body.commandId.toLowerCase())
          .input('fingerprint',sql.VarChar(64),digest([userId.toLowerCase(),body.managerId?.toLowerCase(),body.expectedManagerId?.toLowerCase(),reason]))
          .input('reason',sql.NVarChar(600),reason).query(`
            DECLARE @lockStatus int,@lockResource nvarchar(100)=CONCAT('organization-reporting-lines:',@tenantId);
            EXEC @lockStatus=sys.sp_getapplock @Resource=@lockResource,@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=5000;
            IF @lockStatus<0 BEGIN SELECT 'BUSY' AS outcome; RETURN; END;
            IF NOT EXISTS(SELECT 1 FROM security.fn_TaskRequestGrant(@tenantId,@actor,N'users.manage',NULL,NULL,NULL,NULL,1))
              BEGIN SELECT 'FORBIDDEN' AS outcome; RETURN; END;

            DECLARE @entityId nvarchar(120)=LOWER(CONVERT(nvarchar(36),@user)),@prior varchar(64),@priorActor uniqueidentifier;
            SELECT @prior=JSON_VALUE(DetailsJson,'$.fingerprint'),@priorActor=ActorUserId FROM security.AuditEvent
              WHERE TenantId=@tenantId AND EventType=N'USER_MANAGER_UPDATED' AND EntityId=@entityId AND CorrelationId=@command;
            IF @prior IS NOT NULL
              BEGIN SELECT CASE WHEN @prior=@fingerprint AND @priorActor=@actor THEN 'REPLAY' ELSE 'STALE' END AS outcome; RETURN; END;

            DECLARE @current uniqueidentifier,@found bit=0;
            SELECT @current=ManagerUserId,@found=1 FROM core.AppUser WITH(UPDLOCK,HOLDLOCK)
              WHERE TenantId=@tenantId AND UserId=@user AND IsActive=1;
            IF @found=0 OR (@manager IS NOT NULL AND NOT EXISTS(SELECT 1 FROM core.AppUser
              WHERE TenantId=@tenantId AND UserId=@manager AND IsActive=1))
              BEGIN SELECT 'UNKNOWN' AS outcome; RETURN; END;
            IF @current<>@expected OR (@current IS NULL AND @expected IS NOT NULL) OR (@current IS NOT NULL AND @expected IS NULL)
              BEGIN SELECT 'STALE' AS outcome; RETURN; END;
            IF @current=@manager OR (@current IS NULL AND @manager IS NULL)
              BEGIN SELECT 'UNCHANGED' AS outcome; RETURN; END;

            DECLARE @seen TABLE (UserId uniqueidentifier PRIMARY KEY);
            DECLARE @next uniqueidentifier=@manager;
            WHILE @next IS NOT NULL
            BEGIN
              IF @next=@user OR EXISTS(SELECT 1 FROM @seen WHERE UserId=@next)
                BEGIN SELECT 'CYCLE' AS outcome; RETURN; END;
              INSERT @seen(UserId) VALUES(@next);
              SET @next=(SELECT ManagerUserId FROM core.AppUser WHERE TenantId=@tenantId AND UserId=@next);
            END;

            UPDATE core.AppUser SET ManagerUserId=@manager WHERE TenantId=@tenantId AND UserId=@user;
            DECLARE @details nvarchar(max)=(SELECT @current AS previousManagerId,@manager AS managerId,@reason AS reason,@fingerprint AS fingerprint
              FOR JSON PATH,INCLUDE_NULL_VALUES,WITHOUT_ARRAY_WRAPPER);
            INSERT security.AuditEvent(TenantId,ActorUserId,CorrelationId,EventType,EntityType,EntityId,OutcomeCode,DetailsJson)
              VALUES(@tenantId,@actor,@command,N'USER_MANAGER_UPDATED',N'USER',@entityId,'SUCCESS',@details);
            SELECT 'UPDATED' AS outcome;`);
        const outcome=result.recordset[0]?.outcome;
        if (outcome==='FORBIDDEN') throw forbidden();
        if (outcome==='UNKNOWN') throw invalid('کاربر یا سرپرست فعال در همین سازمان پیدا نشد.');
        if (outcome==='CYCLE') throw invalid('این تغییر باعث ایجاد چرخه در زنجیرهٔ سرپرستی می‌شود.');
        if (outcome!=='UPDATED' && outcome!=='REPLAY' && outcome!=='UNCHANGED') throw conflict('سرپرستی هم‌زمان تغییر کرده است. وضعیت تازه را دریافت کنید.');
        return {replayed:outcome==='REPLAY',changed:outcome==='UPDATED'};
      });
    },

    createInTransaction,
    eligibleInterviewer: (tx,auth,id) => assignee(tx,auth,id,true),
    create: (auth,body) => run(auth,tx=>createInTransaction(tx,auth,body)),

    read: (auth,id) => run(auth,async tx => {
      const row=await get(tx,auth,id);
      const account = row.task.accountId ? (await input(tx,auth).input('accountId',sql.UniqueIdentifier,row.task.accountId).query(accountSql)).recordset[0] : null;
      const order=await readOrder(tx,auth,row.task,Boolean(account?.seesCost));
      const stale=row.task.managedRequest.kind==='ORDER_APPROVAL' && orderFingerprint(order)!==row.task.managedRequest.orderFingerprint;
      const request=row.task.managedRequest;
      const identities=[row.task.createdBy,row.task.assigneeId,...request.activeApprovers,...request.watchers,
        ...row.task.activityHistory.map(event => event.actorId)].filter(uuid);
      const participants=await input(tx,auth).input('identities',sql.NVarChar(sql.MAX),JSON.stringify([...new Set(identities)]))
        .query(`SELECT CONVERT(varchar(36),u.UserId) AS id,u.DisplayName AS name
          FROM core.AppUser u WHERE u.TenantId=@tenantId AND EXISTS(SELECT 1 FROM OPENJSON(@identities) members
            WHERE TRY_CONVERT(uniqueidentifier,members.value)=u.UserId);`);
      const customer=await customerContext(tx,auth,row.task);
      const links=request.links.filter(item=>item.type!=='ORDER');
      const linkedDocuments=links.length ? await financeReferences(tx,auth,row.task.accountId,{links}) : [];
      let orderMargin=null;
      if (order && account?.seesCost) {
        const settings=(await input(tx,auth).query(`SELECT ISNULL(JSON_QUERY(JsonDoc,'$.orgConfig'),'{}') AS orgConfig
          FROM sync.EntityStore WHERE TenantId=@tenantId AND CollectionName=N'__singleton__' AND EntityId=N'settings' AND IsDeleted=0;`)).recordset[0];
        orderMargin=summarizeOrderMargin(order,getMetricThresholds({orgConfig:JSON.parse(settings?.orgConfig ?? '{}')}).quoteMarginFloorPercent);
      }
      return {...present(row,auth),account:account ? {id:account.id,name:account.name}:null,order,orderMargin,stale,customer,linkedDocuments,
        participants:Object.fromEntries(participants.recordset.map(p => [p.id.toLowerCase(),p.name]))};
    }),

    runReminders: (auth,today) => run(auth,async tx => {
      const lock=await input(tx,auth).query(`DECLARE @lock int;
        DECLARE @resource nvarchar(100)=CONCAT('task-request-reminders:',@tenantId);
        EXEC @lock=sys.sp_getapplock @Resource=@resource,@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=0;
        SELECT @lock AS status;`);
      if (Number(lock.recordset[0]?.status)<0) return {processed:0};
      const overdue=await input(tx,auth).input('today',sql.Date,new Date(today)).query(`
        SELECT TOP(50) task.EntityId AS id,task.JsonDoc,u.ManagerUserId AS manager,reminder.command
        FROM sync.EntityStore task WITH(UPDLOCK,HOLDLOCK)
        LEFT JOIN core.AppUser u ON u.TenantId=task.TenantId AND u.IsActive=1
          AND u.UserId=TRY_CONVERT(uniqueidentifier,JSON_VALUE(task.JsonDoc,'$.assigneeId'))
        CROSS APPLY(SELECT CONCAT('due:',JSON_VALUE(task.JsonDoc,'$.dueDate'),':',JSON_VALUE(task.JsonDoc,'$.managedRequest.assignedAt')) AS command) reminder
        WHERE task.TenantId=@tenantId AND task.CollectionName=N'tasks' AND task.EntityId LIKE N'taskreq-%' AND task.IsDeleted=0
          AND JSON_VALUE(task.JsonDoc,'$.status') NOT IN('COMPLETED','REJECTED','CANCELLED')
          AND TRY_CONVERT(date,JSON_VALUE(task.JsonDoc,'$.dueDate'))<@today
          AND NOT EXISTS(SELECT 1 FROM security.AuditEvent e WHERE e.TenantId=task.TenantId AND e.EventType=N'TASK_REQUEST_OVERDUE'
            AND e.EntityId=task.EntityId AND e.CorrelationId=reminder.command)
        ORDER BY TRY_CONVERT(date,JSON_VALUE(task.JsonDoc,'$.dueDate')),task.EntityId;`);
      for (const row of overdue.recordset) {
        const task=appendTaskActivity(JSON.parse(row.JsonDoc),{id:`${row.id}:${row.command}`,action:'OVERDUE',
          actorId:actorId(auth),summary:'گذشت مهلت ثبت شد'});
        await requestById(tx,auth,row.id).input('task',sql.NVarChar(sql.MAX),JSON.stringify(task))
          .query(`UPDATE sync.EntityStore SET JsonDoc=@task,Version=Version+1,UpdatedAtUtc=SYSUTCDATETIME(),UpdatedByUserId=@actor
            WHERE TenantId=@tenantId AND CollectionName=N'tasks' AND EntityId=@id AND IsDeleted=0;`);
        await writeAudit(tx,auth,row.id,row.command,'TASK_REQUEST_OVERDUE',digest([row.id,row.command]),{dueDate:task.dueDate,assigneeId:task.assigneeId});
        await notify(tx,auth,task,row.command,[row.manager],true);
      }
      return {processed:overdue.recordset.length};
    }),

    list: (auth,filter) => {
      const view=filter.view ?? 'ALL', search=filter.search ?? '', page=Number(filter.page ?? '1');
      if (!modes.has(view) || typeof search!=='string' || search.length>100 || !Number.isInteger(page) || page<1 || page>500) throw invalid('فیلتر کارتابل معتبر نیست.');
      return run(auth,async tx => {
        const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
        const result=await input(tx,auth).input('view',sql.VarChar(20),view).input('search',sql.NVarChar(100),search.trim())
          .input('today',sql.Date,new Date(today))
          .input('offset',sql.Int,(page-1)*25).query(`${rowsSql}
            AND (@search=N'' OR CHARINDEX(@search,JSON_VALUE(task.JsonDoc,'$.title'))>0)
            AND (@view='ALL' OR (@view='DECISION' AND ${decisionWaitingSql})
               OR (@view='MINE' AND (
                 (a.isAssignee=1 AND a.canAct=1 AND JSON_VALUE(task.JsonDoc,'$.status') NOT IN('NEEDS_INFO','COMPLETED','REJECTED','CANCELLED'))
                 OR (a.isCreator=1 AND JSON_VALUE(task.JsonDoc,'$.status')='NEEDS_INFO') OR (${decisionWaitingSql})))
               OR (@view='WATCHING' AND a.isWatcher=1) OR (@view='CREATED' AND a.isCreator=1)
               OR (@view='TEAM' AND a.isManager=1) OR (@view='WAITING' AND JSON_VALUE(task.JsonDoc,'$.status') IN('NEEDS_INFO','PENDING_APPROVAL','CONDITIONAL'))
               OR (@view='BLOCKED' AND JSON_VALUE(task.JsonDoc,'$.status')='BLOCKED')
               OR (@view='UNSEEN' AND JSON_VALUE(task.JsonDoc,'$.status') NOT IN('COMPLETED','REJECTED','CANCELLED')
                 AND NOT EXISTS(SELECT 1 FROM OPENJSON(task.JsonDoc,'$.managedRequest.seenBy') s
                   WHERE TRY_CONVERT(uniqueidentifier,s.value)=TRY_CONVERT(uniqueidentifier,JSON_VALUE(task.JsonDoc,'$.assigneeId'))))
               OR (@view='CLOSED' AND JSON_VALUE(task.JsonDoc,'$.status') IN('COMPLETED','REJECTED','CANCELLED'))
               OR (@view='OVERDUE' AND JSON_VALUE(task.JsonDoc,'$.status') NOT IN('COMPLETED','REJECTED','CANCELLED')
                 AND TRY_CONVERT(date,JSON_VALUE(task.JsonDoc,'$.dueDate'))<@today))
            ORDER BY task.UpdatedAtUtc DESC,task.EntityId OFFSET @offset ROWS FETCH NEXT 26 ROWS ONLY;
            WITH visible AS (
              SELECT JSON_VALUE(task.JsonDoc,'$.status') AS status, JSON_VALUE(task.JsonDoc,'$.priority') AS priority,
                TRY_CONVERT(date,JSON_VALUE(task.JsonDoc,'$.dueDate')) AS due,
                TRY_CONVERT(datetime2(3),JSON_VALUE(task.JsonDoc,'$.createdAt')) AS createdAt,
                TRY_CONVERT(datetime2(3),JSON_VALUE(task.JsonDoc,'$.completedAt')) AS completedAt
              FROM sync.EntityStore task CROSS APPLY security.fn_TaskRequestAccess(task.TenantId,@actor,task.JsonDoc)
              WHERE task.TenantId=@tenantId AND task.CollectionName=N'tasks' AND task.IsDeleted=0 AND task.EntityId LIKE N'taskreq-%'
            )
            SELECT COUNT_BIG(CASE WHEN status NOT IN('COMPLETED','REJECTED','CANCELLED') THEN 1 END) AS openCount,
              COUNT_BIG(CASE WHEN status IN('NEEDS_INFO','PENDING_APPROVAL','CONDITIONAL') THEN 1 END) AS waitingCount,
              COUNT_BIG(CASE WHEN status NOT IN('COMPLETED','REJECTED','CANCELLED') AND due<@today AND priority IN('HIGH','URGENT') THEN 1 END) AS importantLate,
              AVG(CASE WHEN status='COMPLETED' AND completedAt>=createdAt THEN CONVERT(float,DATEDIFF_BIG(minute,createdAt,completedAt)) END) AS meanMinutes
            FROM visible;`);
        return { items:result.recordset.slice(0,25).map(row => {
          const {task,version,permissions,assignee,creator}=present({...row,task:JSON.parse(row.JsonDoc)},auth);
          return { id:task.id,title:task.title,status:task.status,priority:task.priority,assigneeId:task.assigneeId,assignee,creator,
            version,dueDate:task.dueDate,createdBy:task.createdBy,accountId:task.accountId,kind:task.managedRequest.kind,
            assignedAt:task.managedRequest.assignedAt,seen:task.managedRequest.seenBy.includes(task.assigneeId),
            nextAction:task.nextAction,canDecide:permissions.actions.includes('APPROVE'),watching:permissions.isWatcher };
        }),hasMore:page<500 && result.recordset.length>25,metrics:result.recordsets[1]?.[0] };
      });
    },

    change(auth,id,body) {
      const command=commandInput(body);
      if (!command) throw invalid('اقدام، توضیح یا نسخهٔ درخواست معتبر نیست.');
      return run(auth,async tx => {
        const current=await get(tx,auth,id,true);
        const fingerprint=digest(command);
        const prior=(await requestById(tx,auth,id).input('command',sql.NVarChar(100),command.commandId).query(`
          SELECT ActorUserId AS actor,JSON_VALUE(DetailsJson,'$.fingerprint') AS fingerprint
          FROM security.AuditEvent WHERE TenantId=@tenantId AND EventType=N'TASK_REQUEST_ACTION' AND EntityId=@id AND CorrelationId=@command;`)).recordset[0];
        if (prior) {
          if (String(prior.actor).toLowerCase()!==actorId(auth) || prior.fingerprint!==fingerprint) throw conflict();
          return {...present(current,auth),replayed:true};
        }
        if (command.action==='VIEW' && current.task.managedRequest.seenBy.includes(actorId(auth))) return {...present(current,auth),replayed:true};
        if (current.version!==command.version) throw conflict();
        const now=new Date().toISOString();
        const context={};
        if (command.action==='REVISE') {
          if (command.revision.kind!==current.task.managedRequest.kind || command.revision.accountId!==current.task.accountId) {
            throw invalid('نوع و مشتری درخواست در اصلاح نسخه تغییر نمی‌کنند.');
          }
          context.revised=await construct(tx,auth,command.revision,now,current.task);
        }
        if (command.action==='REFER') {
          const target=await assignee(tx,auth,command.assigneeId);
          context.assigneeName=target.name;
          const recipientTask={...current.task,assigneeId:command.assigneeId,assignedTo:command.assigneeId};
          if (!(await access(tx,auth,recipientTask,command.assigneeId))) throw forbidden();
          await verifyWatchers(tx,auth,recipientTask);
        }
        if (['APPROVE','CONDITION','SATISFY'].includes(command.action) && current.task.managedRequest.kind==='ORDER_APPROVAL' &&
          orderFingerprint(await readOrder(tx,auth,current.task))!==current.task.managedRequest.orderFingerprint) {
          throw conflict('مبلغ، اقلام یا وضعیت سفارش تغییر کرده است. نسخهٔ جدید ثبت کنید.');
        }
        if (command.action==='APPROVE' && current.task.managedRequest.kind==='ORDER_APPROVAL') {
          context.accountingName=await accountant(tx,auth,current.task,current.task.managedRequest.policy?.accountingUserId);
        }
        if (command.action==='ERP_INVOICE') context.invoice=await invoiceEvidence(tx,auth,current.task);
        if (['APPROVE','CONDITION','SATISFY','REJECT'].includes(command.action)) {
          const active=await approvedPolicy(tx,auth,current.task.managedRequest.kind);
          const bound=current.task.managedRequest.policy;
          if (!active || active.id!==bound?.id || active.version!==bound?.version) {
            throw conflict('سیاست تأیید تغییر کرده است. نسخهٔ درخواست باید بازبینی شود.');
          }
        }
        if (command.priceClass && ['APPROVE','REPLY'].includes(command.action)) {
          const classResult=await input(tx,auth).input('code',sql.NVarChar(120),command.priceClass)
            .input('source',sql.VarChar(40),current.task.managedRequest.priceSource ?? null)
            .query(`SELECT TOP(2) m.SourceSystemCode FROM integration.CodeMapping m
              WHERE m.TenantId=@tenantId AND m.MappingDomain='PRICE_CLASS' AND m.StandardCode=@code AND m.MapStatus='APPROVED'
                AND (@source IS NULL OR m.SourceSystemCode=@source)
                AND m.EffectiveFrom<=CONVERT(date,SYSUTCDATETIME())
                AND (m.EffectiveTo IS NULL OR m.EffectiveTo>=CONVERT(date,SYSUTCDATETIME()))
              GROUP BY m.SourceSystemCode HAVING COUNT_BIG(*)=1;`);
          if (classResult.recordset.length!==1) throw invalid('کلاس قیمت با کد یکتا و مصوب ERP یافت نشد.');
        }
        const active=current.task.managedRequest;
        if (command.action==='APPROVE' && active.kind==='ORDER_APPROVAL' && active.priceAuthorizationId) {
          if (!availableActions(current.task,current,actorId(auth)).includes('APPROVE')) throw forbidden();
          const step=active.policy.steps[active.step];
          const last=active.step+1===active.policy.steps.length &&
            active.decisions.filter(item=>item.step===active.step).length+1>=step.required;
          await checkPriceAuthorization(tx,auth,current.task,last,command.commandId);
          context.priceAuthorizationChecked=true;
        }
        const applied=applyRequestCommand(current.task,current,command,actorId(auth),now,context);
        if (!applied.ok) throw failure(422,'REQUEST_TRANSITION_REJECTED',applied.error);
        const task={...applied.task,createFingerprint:current.task.createFingerprint};
        if (command.action==='WATCHERS') await verifyWatchers(tx,auth,task);
        if (context.assigneeName) task.managedRequest.assigneeName=context.assigneeName;

        const write=await requestById(tx,auth,id).input('version',sql.VarChar(20),current.version)
          .input('task',sql.NVarChar(sql.MAX),JSON.stringify(task)).query(`UPDATE sync.EntityStore
            SET JsonDoc=@task,Version=Version+1,UpdatedByUserId=@actor,UpdatedAtUtc=SYSUTCDATETIME()
            OUTPUT CONVERT(varchar(20),inserted.Version) AS version
            WHERE TenantId=@tenantId AND CollectionName=N'tasks' AND EntityId=@id AND IsDeleted=0 AND Version=TRY_CONVERT(bigint,@version);`);
        if (!write.recordset[0]) throw conflict();
        await writeAudit(tx,auth,id,command.commandId,'TASK_REQUEST_ACTION',fingerprint,
          {action:command.action,before:current.task.status,after:task.status,note:command.note,contentRevision:task.managedRequest.contentRevision,
            beforeOwner:current.task.assigneeId,afterOwner:task.assigneeId,priority:task.priority,
            ...(command.action==='DUE_DATE' ? {beforeDueDate:current.task.dueDate ?? null,afterDueDate:task.dueDate} : {})});
        if (!['VIEW','COMMENT'].includes(command.action)) await notify(tx,auth,task,command.commandId);
        const rights=await access(tx,auth,task);
        return rights ? {...present({...current,...rights,task,version:write.recordset[0].version,assigneeName:task.managedRequest.assigneeName},auth),replayed:false}
          : {task:null,version:write.recordset[0].version,replayed:false};
      });
    },

    users: (auth,search,context='') => {
      if (typeof search!=='string' || search.length>80 || !['','recruitment'].includes(context)) throw invalid('جست‌وجو معتبر نیست.');
      return run(auth,async tx => {
        const recruitment=context==='recruitment';
        const allowed=recruitment ? await grant(tx,auth,'users.manage') : await grant(tx,auth,'tasks.view',false) || await grant(tx,auth,'accounts.view',false)
          || await grant(tx,auth,'internal.view',false) || await grant(tx,auth,'internal.manage',false)
          || await grant(tx,auth,'settings.manage',false);
        if (!allowed) throw forbidden();
        const result=await input(tx,auth).input('target',sql.UniqueIdentifier,null).input('search',sql.NVarChar(80),search.trim()||null)
          .input('recruitment',sql.Bit,recruitment)
          .query(`SELECT TOP(60) d.id,d.name FROM (${activeUsersSql}) d WHERE d.canAssign=1 ORDER BY d.name,d.id;`);
        return {items:result.recordset};
      });
    },

    files: (auth,id) => run(auth,async tx => {
      const task=await get(tx,auth,id);
      if (!task.canFiles) throw forbidden();
      const result=await requestById(tx,auth,id).query(`SELECT TOP(8) EntityId AS id,JSON_VALUE(JsonDoc,'$.fileName') AS name,
        JSON_VALUE(JsonDoc,'$.mimeType') AS type,TRY_CONVERT(int,JSON_VALUE(JsonDoc,'$.size')) AS size
        FROM sync.EntityStore WHERE TenantId=@tenantId AND CollectionName=N'attachments' AND IsDeleted=0
         AND EntityId LIKE N'request-file-%' AND JSON_VALUE(JsonDoc,'$.entityId')=@id
        ORDER BY CreatedAtUtc,EntityId;`);
      return {items:result.recordset};
    }),

    file: (auth,id,attachmentId) => run(auth,async tx => {
      const task=await get(tx,auth,id);
      if (!task.canFiles) throw forbidden();
      if (typeof attachmentId!=='string' || !attachmentId.startsWith('request-file-') || !uuid(attachmentId.slice(13))) throw missing();
      const saved=(await requestById(tx,auth,id).input('file',sql.NVarChar(120),attachmentId).query(`
        SELECT JsonDoc FROM sync.EntityStore WHERE TenantId=@tenantId AND CollectionName=N'attachments'
          AND EntityId=@file AND IsDeleted=0 AND JSON_VALUE(JsonDoc,'$.entityId')=@id;`)).recordset[0];
      if (!saved) throw missing();
      const doc=JSON.parse(saved.JsonDoc);
      return { id:attachmentId,name:doc.fileName,type:doc.mimeType,size:doc.size,data:doc.data };
    }),

    attach: (auth,id,query,bytes) => {
      const name=attachmentName(query.name), type=query.type;
      if (!uuid(query.uploadId) || !name || !Buffer.isBuffer(bytes) || !bytes.length || bytes.length>5*1024*1024
         || typeof type!=='string' || !Object.hasOwn(contentTypes,type) || !contentTypes[type](bytes)) {
        throw invalid('فایل باید PDF، JPEG، PNG یا WebP معتبر و حداکثر ۵ مگابایت باشد.');
      }
      const attachmentId=`request-file-${query.uploadId.toLowerCase()}`;
      return run(auth,async tx => {
        const current=await get(tx,auth,id,true);
        const actor=actorId(auth);
        if (!current.canUpload || !(current.isCreator || current.canAct ||
          (current.canDecide && current.task.managedRequest.activeApprovers.includes(actor)))) throw forbidden();
        const checksum=createHash('sha256').update(bytes).digest('hex');
        const file={id:attachmentId,entityId:id,entityType:'TASK_REQUEST',fileName:name,mimeType:type,size:bytes.length,
          data:bytes.toString('base64'),sha256:checksum,uploadedBy:actor};
        const existing=(await requestById(tx,auth,id).input('file',sql.NVarChar(120),attachmentId).query(`
          SELECT JSON_VALUE(JsonDoc,'$.sha256') AS checksum,JSON_VALUE(JsonDoc,'$.entityId') AS taskId,
            JSON_VALUE(JsonDoc,'$.fileName') AS name,JSON_VALUE(JsonDoc,'$.mimeType') AS type,IsDeleted
          FROM sync.EntityStore WITH(UPDLOCK,HOLDLOCK)
          WHERE TenantId=@tenantId AND CollectionName=N'attachments' AND EntityId=@file;`)).recordset[0];
        const metadata={id:attachmentId,name,type,size:bytes.length};
        if (existing) {
          if (existing.IsDeleted || existing.taskId!==id || existing.checksum!==checksum || existing.name!==name || existing.type!==type) throw conflict();
          return {...metadata,replayed:true};
        }
        const found=(await requestById(tx,auth,id).query(`SELECT COUNT(*) AS amount FROM sync.EntityStore
          WHERE TenantId=@tenantId AND CollectionName=N'attachments' AND EntityId LIKE N'request-file-%'
            AND IsDeleted=0 AND JSON_VALUE(JsonDoc,'$.entityId')=@id;`)).recordset[0]?.amount ?? 0;
        if (found>=8) throw invalid('حداکثر ۸ پیوست برای هر درخواست مجاز است.');
        const task=appendTaskActivity(current.task,{ id:query.uploadId.toLowerCase(),action:'ATTACHED',actorId:actor,
          summary:'مدرک دارای دسترسی ثبت شد' });
        await requestById(tx,auth,id).input('file',sql.NVarChar(120),attachmentId)
          .input('document',sql.NVarChar(sql.MAX),JSON.stringify(file)).input('task',sql.NVarChar(sql.MAX),JSON.stringify(task)).query(`
            INSERT sync.EntityStore(TenantId,CollectionName,EntityId,JsonDoc,UpdatedByUserId) VALUES(@tenantId,N'attachments',@file,@document,@actor);
            UPDATE sync.EntityStore SET JsonDoc=@task,Version=Version+1,UpdatedAtUtc=SYSUTCDATETIME(),UpdatedByUserId=@actor
              WHERE TenantId=@tenantId AND CollectionName=N'tasks' AND EntityId=@id;`);
        await writeAudit(tx,auth,id,query.uploadId,'TASK_REQUEST_ATTACHMENT',checksum,{attachmentId,name,type,size:bytes.length});
        await notify(tx,auth,task,query.uploadId);
        return {...metadata,replayed:false};
      });
    },

    resources: (auth,query) => {
      if (!['ORDER','PRODUCT','PRICE_AUTHORIZATION','INVOICE','CHEQUE'].includes(query.type) || !uuid(query.accountId)
         || (query.search!==undefined && (typeof query.search!=='string' || query.search.length>80))) throw invalid('مرجع انتخاب معتبر نیست.');
      return run(auth,async tx => {
        const access=(await input(tx,auth).input('accountId',sql.UniqueIdentifier,query.accountId).query(accountSql)).recordset[0];
        if (!access) throw forbidden();
        const type=query.type;
        if (type==='INVOICE' || type==='CHEQUE') {
          return {items:await financeReferences(tx,auth,query.accountId,{type,search:query.search?.trim() ?? ''})};
        }
        if (type==='PRICE_AUTHORIZATION') {
          const result=await input(tx,auth).input('accountId',sql.UniqueIdentifier,query.accountId)
            .input('search',sql.NVarChar(80),query.search?.trim() ?? '').query(`SELECT TOP(60) task.EntityId AS id,JSON_VALUE(task.JsonDoc,'$.title') AS title
              FROM sync.EntityStore task CROSS APPLY security.fn_TaskRequestAccess(task.TenantId,@actor,task.JsonDoc)
              WHERE task.TenantId=@tenantId AND task.CollectionName=N'tasks' AND task.EntityId LIKE N'taskreq-%' AND task.IsDeleted=0
                AND TRY_CONVERT(uniqueidentifier,JSON_VALUE(task.JsonDoc,'$.accountId'))=@accountId
                AND JSON_VALUE(task.JsonDoc,'$.status')='APPROVED'
                AND JSON_VALUE(task.JsonDoc,'$.managedRequest.kind')='PRICE_PERMISSION'
                AND (@search=N'' OR CHARINDEX(@search,JSON_VALUE(task.JsonDoc,'$.title'))>0)
              ORDER BY task.UpdatedAtUtc DESC,task.EntityId;`);
          return {items:result.recordset};
        }
        const statement=type==='ORDER' ? `SELECT TOP(60) o.SalesOrderId AS id,o.OrderNumber AS title,o.OrderDate AS [date]
          FROM crm.SalesOrder o JOIN crm.Account a ON a.TenantId=o.TenantId AND a.AccountId=o.AccountId
          CROSS APPLY security.fn_TaskRequestGrant(@tenantId,@actor,N'quotes.view',a.OwnerUserId,a.BranchId,a.TerritoryId,a.TeamId,0)
          WHERE o.TenantId=@tenantId AND o.AccountId=@accountId AND o.DeletedAtUtc IS NULL AND o.StatusCode NOT IN('CANCELLED','REJECTED','SENT_TO_ERP','CONFIRMED')
            AND (@search=N'' OR CHARINDEX(@search,o.OrderNumber)>0)
          ORDER BY o.OrderDate DESC,o.SalesOrderId;`
        : `SELECT TOP(60) p.ExternalProductKey AS id,p.ProductName AS title,p.BaseUnitCode AS unit,p.SKU AS sku
          FROM crm.ExternalProduct p JOIN crm.Account a ON a.TenantId=p.TenantId AND a.AccountId=@accountId
          CROSS APPLY security.fn_TaskRequestGrant(@tenantId,@actor,N'quotes.view',a.OwnerUserId,a.BranchId,a.TerritoryId,a.TeamId,0)
          WHERE p.TenantId=@tenantId AND p.IsActive=1 AND (@search=N'' OR CHARINDEX(@search,p.ProductName)>0 OR CHARINDEX(@search,p.SKU)>0)
          ORDER BY p.ProductName,p.ExternalProductKey;`;
        const result=await input(tx,auth).input('accountId',sql.UniqueIdentifier,query.accountId)
          .input('search',sql.NVarChar(80),query.search?.trim() ?? '').query(statement);
        return {items:result.recordset};
      });
    },

    savePolicy(auth,kind,body) {
      const policy=policyInput(body);
      if (!approvals.has(kind) || !policy || (kind==='ORDER_APPROVAL' && !policy.accountingUserId) || typeof body.enabled!=='boolean' ||
        !Number.isInteger(body.version) || body.version<0) throw invalid('تعریف و نسخهٔ سیاست تأیید معتبر نیست.');
      return run(auth,async tx => {
        const code=`TASK_REQUEST:${kind}`;
        const request=()=>input(tx,auth).input('code',sql.NVarChar(100),code);
        const now=(await request().query(`SELECT Version FROM crm.WorkflowDefinition WITH(UPDLOCK,HOLDLOCK)
          WHERE TenantId=@tenantId AND WorkflowCode=@code AND TriggerCode='TASK_REQUEST';`)).recordset[0];
        if ((now?.Version ?? 0)!==body.version) throw conflict('سیاست تأیید تغییر کرده است.');
        for (const id of policy.steps.flatMap(step => step.members)) {
          const valid=(await input(tx,auth).input('member',sql.UniqueIdentifier,id).input('permission',sql.NVarChar(120),decisionGrant)
            .query(`SELECT 1 FROM core.AppUser u JOIN core.UserRole ur ON ur.UserId=u.UserId AND ur.TenantId=u.TenantId
              JOIN core.RolePermission rp ON rp.RoleId=ur.RoleId AND rp.TenantId=ur.TenantId
              WHERE u.TenantId=@tenantId AND u.UserId=@member AND u.IsActive=1 AND rp.PermissionCode=@permission
                AND rp.FieldAccess='DO' AND rp.FieldCode=N'' AND ur.ValidFromUtc<=SYSUTCDATETIME()
                AND (ur.ValidToUtc IS NULL OR ur.ValidToUtc>SYSUTCDATETIME());`)).recordset.length;
          if (!valid) throw invalid('عضو مرحله باید کاربر فعال دارای مجوز تصمیم فروش باشد.');
        }
        const next=body.version+1;
        const saved=await request().input('definition',sql.NVarChar(sql.MAX),JSON.stringify(policy)).input('enabled',sql.Bit,body.enabled)
          .input('next',sql.Int,next).query(now ? `UPDATE crm.WorkflowDefinition SET DefinitionJson=@definition,IsEnabled=@enabled,Version=@next,UpdatedAtUtc=SYSUTCDATETIME()
              OUTPUT CONVERT(varchar(36),inserted.WorkflowId) AS id WHERE TenantId=@tenantId AND WorkflowCode=@code AND TriggerCode='TASK_REQUEST';`
            : `INSERT crm.WorkflowDefinition(TenantId,WorkflowCode,Name,TriggerCode,DefinitionJson,IsEnabled,Version)
              OUTPUT CONVERT(varchar(36),inserted.WorkflowId) AS id VALUES(@tenantId,@code,N'سیاست تأیید درخواست','TASK_REQUEST',@definition,@enabled,@next);`);
        const id=saved.recordset[0]?.id;
        if (!id) throw conflict();
        await writeAudit(tx,auth,id,`policy-${next}`,'TASK_REQUEST_POLICY',digest(policy),{kind,version:next,enabled:body.enabled,policy});
        return {id,version:next,enabled:body.enabled,...policy};
      });
    },

    readPolicies: auth => run(auth,async tx => {
      const rows=await input(tx,auth).query(`SELECT WorkflowCode AS code,Version AS version,IsEnabled AS enabled,DefinitionJson AS definition
        FROM crm.WorkflowDefinition WHERE TenantId=@tenantId AND TriggerCode='TASK_REQUEST';`);
      return {items:rows.recordset.map(row => ({kind:row.code.slice(13),version:row.version,enabled:row.enabled,...policyInput(JSON.parse(row.definition))}))};
    }),
  };
}
