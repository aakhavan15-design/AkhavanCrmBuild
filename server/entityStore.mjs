// SQL-first entity store service. Every AppState collection/singleton lands in ONE tenant-isolated table
// (sync.EntityStore, migration 023), so a missing typed table/column can never block a feature:
// data is always persisted, and `profile()` reports which typed columns the product actually needs next.
// Drivers: memory (tests), file (local dev without SQL Server), mssql (production, RLS via SESSION_CONTEXT).
import fs from 'node:fs';
import { CHAT_COLLECTIONS, isConversationMember, canChangeConversation, canChangeConversationMessage } from './conversationScope.mjs';
import path from 'node:path';
import {
  splitState, policyOf, recordId, classify, isMarkedFixture, checkIntegrity, profileCollections, SINGLETON_PREFIX,
} from '../src/lib/stateModel.mjs';

const NAME_RE = /^[A-Za-z][A-Za-z0-9_]{0,79}$/;
export const LIMITS = Object.freeze({ maxRecordBytes: 1_000_000, maxChangeRecords: 5000, maxBootstrapRecords: 50000 });
const PARTY_COLLECTIONS = ['accounts', 'customers'];
const FINANCIAL_PARTY_COLLECTIONS = ['invoices', 'payments', 'cheques', 'paymentallocations', 'creditnotes', 'collectionpromises'];
const sqlCollectionList = names => names.map(name => `N'${name}'`).join(',');
const scopedCollections = new Set([...PARTY_COLLECTIONS, ...FINANCIAL_PARTY_COLLECTIONS]);
const taskWorkflowFields = sqlCollectionList([
  'status', 'result', 'nextAction', 'blockReason', 'blockedAt', 'unblockedAt', 'completedAt', 'activityHistory',
]);
const now = () => new Date().toISOString();
const bytes = (value) => Buffer.byteLength(JSON.stringify(value ?? null), 'utf8');

/* ------------------------------ drivers ------------------------------ */
export class MemoryEntityDriver {
  constructor() { this.tenants = new Map(); this.kind = 'memory'; }
  _t(tenantId) {
    if (!this.tenants.has(tenantId)) this.tenants.set(tenantId, { rows: new Map(), version: 0 });
    return this.tenants.get(tenantId);
  }
  async load(tenantId) {
    const t = this._t(tenantId);
    const collections = {}, singletons = {};
    for (const row of t.rows.values()) {
      if (row.deleted) continue;
      if (row.collection === SINGLETON_PREFIX) singletons[row.id] = row.json;
      else (collections[row.collection] ||= []).push(row.json);
    }
    return { collections, singletons, version: t.version };
  }
  async apply(tenantId, userId, change) {
    const t = this._t(tenantId);
    const stamp = now();
    let upserted = 0, deleted = 0;
    const put = (collection, id, json) => {
      const key = `${collection}\u0000${id}`;
      const prev = t.rows.get(key);
      t.rows.set(key, { collection, id, json: structuredClone(json), deleted: false, version: (prev?.version || 0) + 1, updatedAt: stamp, updatedBy: userId });
      upserted++;
    };
    for (const [name, list] of Object.entries(change.upserts || {})) for (const rec of list) put(name, rec.__id, rec.json);
    for (const [key, value] of Object.entries(change.singletons || {})) put(SINGLETON_PREFIX, key, value);
    for (const [name, ids] of Object.entries(change.deletes || {})) for (const id of ids) {
      const row = t.rows.get(`${name}\u0000${id}`);
      if (row && !row.deleted) { row.deleted = true; row.version++; row.updatedAt = stamp; row.updatedBy = userId; deleted++; }
    }
    t.version++;
    return { upserted, deleted, serverVersion: t.version };
  }
}

export class FileEntityDriver extends MemoryEntityDriver {
  constructor(filePath) {
    super(); this.kind = 'file'; this.filePath = filePath; this._timer = null;
    try {
      if (fs.existsSync(filePath)) {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        for (const [tenant, dump] of Object.entries(raw.tenants || {})) this.tenants.set(tenant, { version: dump.version || 0, rows: new Map(dump.rows || []) });
      }
    } catch (error) { console.error('[ENTITY_STORE] could not read', filePath, error?.message); }
  }
  async apply(tenantId, userId, change) {
    const result = await super.apply(tenantId, userId, change);
    this._flushSoon();
    return result;
  }
  _flushSoon() {
    if (this._timer) return;
    this._timer = setTimeout(() => { this._timer = null; this.flush(); }, 250);
    this._timer.unref?.();
  }
  flush() {
    const dump = { savedAt: now(), tenants: Object.fromEntries([...this.tenants].map(([k, v]) => [k, { version: v.version, rows: [...v.rows] }])) };
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(dump));
    fs.renameSync(tmp, this.filePath);
  }
}

/** Production driver. `run(claims, work)` must execute `work(transaction)` inside a transaction that already
 *  executed sp_set_session_context(TenantId/UserId) (server/index.mjs withTenantContext). `sql` is the mssql module. */
export class MssqlEntityDriver {
  constructor({ sql, run }) { this.sql = sql; this.run = run; this.kind = 'mssql'; }
  async load(tenantId, userId) {
    const { sql } = this;
    return this.run({ tenantId, userId }, async (tx) => {
      const rows = (await new sql.Request(tx).input('tenantId', sql.UniqueIdentifier, tenantId)
        .query(`SELECT CollectionName, EntityId, JsonDoc FROM sync.EntityStore AS record
          WHERE record.TenantId=@tenantId AND record.IsDeleted=0
            AND (LOWER(record.CollectionName) NOT IN (${sqlCollectionList(PARTY_COLLECTIONS)}) OR EXISTS (
              SELECT 1 FROM security.fn_EntityAccountScope(
                record.TenantId,N'accounts.view',record.EntityId,record.JsonDoc,record.UpdatedByUserId
              )
            ))
            AND (LOWER(record.CollectionName) NOT IN (${sqlCollectionList(FINANCIAL_PARTY_COLLECTIONS)}) OR EXISTS (
              SELECT 1 FROM security.fn_EntityFinancialDocumentScope(
                record.TenantId,LOWER(record.CollectionName),N'finance.view',record.JsonDoc
              )
            ))
            AND (LOWER(record.CollectionName)<>N'tasks' OR EXISTS (
              SELECT 1 FROM security.fn_TaskEntityScope(record.TenantId,record.JsonDoc,'VIEW')
            ))
            AND (LOWER(record.CollectionName) NOT IN (N'groups',N'messages') OR EXISTS (
              SELECT 1 FROM sync.EntityStore AS conversation
              CROSS APPLY OPENJSON(conversation.JsonDoc,'$.memberIds') AS membership
              WHERE conversation.TenantId=record.TenantId AND conversation.CollectionName=N'groups'
                AND conversation.IsDeleted=0
                AND conversation.EntityId=CASE WHEN record.CollectionName=N'groups' THEN record.EntityId ELSE JSON_VALUE(record.JsonDoc,'$.groupId') END
                AND TRY_CONVERT(uniqueidentifier, membership.value)=TRY_CONVERT(uniqueidentifier,SESSION_CONTEXT(N'UserId'))
            ))
            AND (LOWER(record.CollectionName)<>N'attachments' OR
              ISNULL(JSON_VALUE(record.JsonDoc,'$.entityType'),N'')<>N'APPLICATION' OR EXISTS (
                SELECT 1 FROM security.fn_RecordReadScope(record.TenantId,N'users.manage',NULL,NULL,NULL,NULL)
              ))
            AND (LOWER(record.CollectionName)<>N'notifications' OR (
              (LEN(JSON_VALUE(record.JsonDoc,'$.recipientId'))=36
                AND TRY_CONVERT(uniqueidentifier,JSON_VALUE(record.JsonDoc,'$.recipientId'))=TRY_CONVERT(uniqueidentifier,SESSION_CONTEXT(N'UserId')))
              OR (JSON_VALUE(record.JsonDoc,'$.recipientId') IS NULL
                AND JSON_QUERY(record.JsonDoc,'$.taskReminder') IS NULL
                AND NOT (ISNULL(JSON_VALUE(record.JsonDoc,'$.linkTab'),N'')=N'tasks'
                  AND ISNULL(JSON_VALUE(record.JsonDoc,'$.dedupeKey'),N'') LIKE N'%|%|[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]%'))
            ))
          ORDER BY CreatedAtUtc, EntityId`)).recordset;
      const version = (await new sql.Request(tx).input('tenantId', sql.UniqueIdentifier, tenantId)
        .query('SELECT ISNULL(MAX(Version),0) AS V FROM sync.EntityStore WHERE TenantId=@tenantId')).recordset[0]?.V || 0;
      const collections = {}, singletons = {};
      for (const row of rows) {
        const json = JSON.parse(row.JsonDoc);
        if (row.CollectionName === SINGLETON_PREFIX) singletons[row.EntityId] = json;
        else (collections[row.CollectionName] ||= []).push(json);
      }
      collections.tasks ??= [];
      return { collections, singletons, version: Number(version) };
    });
  }
  async apply(tenantId, userId, change) {
    const { sql } = this;
    const rows = [];
    for (const [name, list] of Object.entries(change.upserts || {})) for (const rec of list) rows.push({ c: name, i: rec.__id, j: JSON.stringify(rec.json), d: 0 });
    for (const [key, value] of Object.entries(change.singletons || {})) rows.push({ c: SINGLETON_PREFIX, i: key, j: JSON.stringify(value ?? null), d: 0 });
    for (const [name, ids] of Object.entries(change.deletes || {})) for (const id of ids) rows.push({ c: name, i: id, j: null, d: 1 });
    return this.run({ tenantId, userId }, async (tx) => {
      let upserted = 0, deleted = 0;
      const rejected = [];
      // Link changes run after their source rows are saved and before source rows are removed.
      const isAllocation = row => row.c.toLowerCase() === 'paymentallocations';
      const groupChanges = row => row.c === 'groups';
      if (rows.some(row => CHAT_COLLECTIONS.has(row.c))) {
        await new sql.Request(tx).input('resource', sql.NVarChar(255), `conversation-write:${tenantId}`)
          .query(`DECLARE @result int;
            EXEC @result=sys.sp_getapplock @Resource=@resource,@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=8000;
            IF @result<0 THROW 50409,N'Could not acquire conversation write lock.',1;`);
      }
      let groupAdministration = {};
      if (rows.some(groupChanges)) {
        const permissions = (await new sql.Request(tx).input('tenantId', sql.UniqueIdentifier, tenantId)
          .input('userId', sql.UniqueIdentifier, userId)
          .query(`SELECT DISTINCT privilege.Code
            FROM core.AppUser AS actor
            CROSS JOIN (VALUES(N'groups.create'),(N'groups.edit'),(N'groups.soft_delete'),(N'internal.manage'),(N'settings.manage')) AS privilege(Code)
            CROSS APPLY security.fn_RecordReadScope(actor.TenantId,privilege.Code,actor.UserId,actor.BranchId,actor.TerritoryId,actor.TeamId) AS access
            WHERE actor.TenantId=@tenantId AND actor.UserId=@userId AND actor.IsActive=1`)).recordset;
        const codes = new Set(permissions.map(row => row.Code));
        const admin = codes.has('internal.manage') || codes.has('settings.manage');
        groupAdministration = { create: admin || codes.has('groups.create'), edit: admin || codes.has('groups.edit'),
          remove: admin || codes.has('groups.soft_delete') };
      }
      const partitions = [
        rows.filter(row => isAllocation(row) && row.d),
        rows.filter(row => row.c === 'groups' && !row.d),
        rows.filter(row => row.c !== 'groups' && !isAllocation(row)),
        rows.filter(row => row.c === 'groups' && row.d),
        rows.filter(row => isAllocation(row) && !row.d),
      ];
      for (const partition of partitions) {
        for (let at = 0; at < partition.length; at += 400) {
          let chunk = partition.slice(at, at + 400);
          const reminders = chunk.flatMap((row, index) =>
            row.c.toLowerCase() === 'notifications' && row.i.toLowerCase().startsWith('task-reminder-') ? [{ ...row, index }] : [],
          );
          if (reminders.length) {
            const permission = await new sql.Request(tx)
              .input('tenantId', sql.UniqueIdentifier, tenantId)
              .input('userId', sql.UniqueIdentifier, userId)
              .input('reminders', sql.NVarChar(sql.MAX), JSON.stringify(reminders))
              .query(`SELECT incoming.RowIndex,
                CASE WHEN previous.EntityId IS NOT NULL AND
                  (JSON_VALUE(previous.JsonDoc,'$.read')=N'true' OR JSON_VALUE(incoming.JsonDoc,'$.read')<>N'true')
                  THEN 1 ELSE 0 END AS Unchanged
                FROM OPENJSON(@reminders) WITH (RowIndex int '$.index', CollectionName nvarchar(80) '$.c',
                  EntityId nvarchar(200) '$.i', JsonDoc nvarchar(max) '$.j', IsDelete bit '$.d') AS incoming
                LEFT JOIN sync.EntityStore AS previous WITH (UPDLOCK,HOLDLOCK)
                  ON previous.TenantId=@tenantId AND previous.CollectionName=incoming.CollectionName AND previous.EntityId=incoming.EntityId
                CROSS APPLY (VALUES(JSON_VALUE(incoming.JsonDoc,'$.recipientId'),JSON_VALUE(incoming.JsonDoc,'$.entityId'),
                  JSON_VALUE(incoming.JsonDoc,'$.taskReminder.dueDate'))) AS reminder(RecipientId,TaskId,DueDate)
                WHERE incoming.IsDelete=0 AND LEN(reminder.RecipientId)=36
                  AND TRY_CONVERT(uniqueidentifier,reminder.RecipientId)=@userId
                  AND JSON_VALUE(incoming.JsonDoc,'$.read') IN (N'true',N'false')
                  AND (
                    (previous.EntityId IS NOT NULL AND previous.IsDeleted=0
                      AND JSON_VALUE(previous.JsonDoc,'$.recipientId')=reminder.RecipientId
                      AND JSON_VALUE(previous.JsonDoc,'$.dedupeKey')=JSON_VALUE(incoming.JsonDoc,'$.dedupeKey')
                      AND JSON_VALUE(previous.JsonDoc,'$.entityId')=reminder.TaskId)
                    OR (previous.EntityId IS NULL AND EXISTS (
                      SELECT 1 FROM sync.EntityStore AS task
                      CROSS APPLY security.fn_TaskEntityScope(@tenantId,task.JsonDoc,'VIEW') AS visible
                      WHERE task.TenantId=@tenantId AND task.CollectionName=N'tasks' AND task.EntityId=reminder.TaskId
                        AND task.IsDeleted=0 AND ISNULL(JSON_VALUE(task.JsonDoc,'$.isDeleted'),N'false')<>N'true'
                        AND NULLIF(JSON_VALUE(task.JsonDoc,'$.deletedAt'),N'') IS NULL
                        AND LEFT(JSON_VALUE(task.JsonDoc,'$.dueDate'),10)=reminder.DueDate
                        AND UPPER(ISNULL(JSON_VALUE(task.JsonDoc,'$.status'),N'')) NOT IN (N'COMPLETED',N'CANCELLED',N'CANCELED',N'VOID',N'DELETED')
                    ))
                  )`);
            const allowed = new Map(permission.recordset.map(row => [row.RowIndex, row]));
            const remove = new Set();
            for (const reminder of reminders) {
              const decision = allowed.get(reminder.index);
              if (!decision) rejected.push({ collection: reminder.c, id: reminder.i, reason: 'FORBIDDEN_SCOPE' });
              if (!decision || decision.Unchanged) remove.add(reminder.index);
            }
            chunk = chunk.filter((_, index) => !remove.has(index));
          }
          const tasks = chunk.flatMap((row, index) => row.c.toLowerCase() === 'tasks' ? [{ ...row, index }] : []);
          if (tasks.length) {
            const permissions = await new sql.Request(tx)
              .input('tenantId', sql.UniqueIdentifier, tenantId)
              .input('tasks', sql.NVarChar(sql.MAX), JSON.stringify(tasks))
              .query(`SELECT incoming.RowIndex,
                CASE WHEN incoming.IsDelete=0 AND previous.IsDeleted=0
                  AND previous.JsonDoc COLLATE Latin1_General_100_BIN2=incoming.JsonDoc COLLATE Latin1_General_100_BIN2
                  THEN 1 ELSE 0 END AS Unchanged,
                CASE WHEN incoming.IsDelete=0 AND ISNULL(JSON_VALUE(previous.JsonDoc,'$.taskWorkflowRevision'),N'')
                    <> ISNULL(JSON_VALUE(incoming.JsonDoc,'$.taskWorkflowRevision'),N'')
                  THEN 'TASK_VERSION_CONFLICT'
                WHEN incoming.IsDelete=0 AND JSON_VALUE(previous.JsonDoc,'$.taskWorkflowRevision') IS NOT NULL AND EXISTS (
                  SELECT 1
                  FROM (SELECT [key],[type],[value] FROM OPENJSON(previous.JsonDoc) WHERE [key] IN (${taskWorkflowFields})) AS protected
                  FULL JOIN (SELECT [key],[type],[value] FROM OPENJSON(incoming.JsonDoc) WHERE [key] IN (${taskWorkflowFields})) AS proposed
                    ON protected.[key]=proposed.[key]
                  WHERE protected.[key] IS NULL OR proposed.[key] IS NULL OR protected.[type]<>proposed.[type]
                    OR ISNULL(protected.[value],N'') COLLATE Latin1_General_100_BIN2 <> ISNULL(proposed.[value],N'') COLLATE Latin1_General_100_BIN2
                ) THEN 'TASK_WORKFLOW_REQUIRED' END AS Rejection
                FROM OPENJSON(@tasks) WITH (RowIndex int '$.index', CollectionName nvarchar(80) '$.c',
                  EntityId nvarchar(200) '$.i', JsonDoc nvarchar(max) '$.j', IsDelete bit '$.d') AS incoming
                LEFT JOIN sync.EntityStore AS previous WITH (UPDLOCK,HOLDLOCK)
                  ON previous.TenantId=@tenantId AND previous.CollectionName=incoming.CollectionName AND previous.EntityId=incoming.EntityId
                WHERE (
                  (previous.EntityId IS NULL AND incoming.IsDelete=0)
                  OR EXISTS (SELECT 1 FROM security.fn_TaskEntityScope(@tenantId,previous.JsonDoc,
                    CASE WHEN incoming.IsDelete=1 THEN 'DELETE' ELSE 'EDIT' END))
                ) AND (
                  incoming.IsDelete=1 OR EXISTS (SELECT 1 FROM security.fn_TaskEntityScope(@tenantId,incoming.JsonDoc,
                    CASE WHEN previous.EntityId IS NULL THEN 'CREATE' ELSE 'EDIT' END))
                )`);
            const results = new Map(permissions.recordset.map(row => [row.RowIndex, row]));
            const skipped = new Set();
            for (const task of tasks) {
              const result = results.get(task.index);
              const reason = result ? result.Rejection : 'FORBIDDEN_SCOPE';
              if (reason || result?.Unchanged) skipped.add(task.index);
              if (reason) rejected.push({ collection: task.c, id: task.i, reason });
            }
            chunk = chunk.filter((_, index) => !skipped.has(index));
          }
          const privateRows = chunk.filter(row => CHAT_COLLECTIONS.has(row.c) || row.c === 'attachments');
          if (privateRows.length) {
            const stored = (await new sql.Request(tx).input('tenantId', sql.UniqueIdentifier, tenantId)
              .input('rows', sql.NVarChar(sql.MAX), JSON.stringify(privateRows))
              .query(`WITH incoming AS (
                  SELECT c,i,j FROM OPENJSON(@rows) WITH (c nvarchar(80),i nvarchar(200),j nvarchar(max))
                )
                SELECT record.CollectionName,record.EntityId,record.JsonDoc,record.IsDeleted
                FROM sync.EntityStore AS record WITH (UPDLOCK,HOLDLOCK)
                WHERE record.TenantId=@tenantId AND EXISTS (
                  SELECT 1 FROM incoming AS item
                  LEFT JOIN sync.EntityStore AS message
                    ON message.TenantId=@tenantId AND message.CollectionName=N'messages' AND message.EntityId=item.i
                  WHERE (record.CollectionName=item.c AND record.EntityId=item.i)
                     OR (item.c=N'messages' AND record.CollectionName=N'groups'
                       AND record.EntityId IN (JSON_VALUE(item.j,'$.groupId'),JSON_VALUE(message.JsonDoc,'$.groupId')))
                )`)).recordset;
            const records = new Map(stored.map(row => [`${row.CollectionName}:${row.EntityId}`, {
              json: JSON.parse(row.JsonDoc), deleted: Boolean(row.IsDeleted),
            }]));
            chunk = chunk.filter(row => {
              if (!CHAT_COLLECTIONS.has(row.c) && row.c !== 'attachments') return true;
              const previous = records.get(`${row.c}:${row.i}`);
              const next = row.d ? null : JSON.parse(row.j);
              let allowed;
              if (row.c === 'groups') {
                allowed = !previous?.deleted && canChangeConversation(previous?.json, next, userId, row.d, groupAdministration);
              } else if (row.c === 'messages') {
                const group = records.get(`groups:${previous?.json?.groupId ?? next?.groupId}`);
                allowed = !previous?.deleted && !group?.deleted
                  && canChangeConversationMessage(group?.json, previous?.json, next, userId, row.d);
              } else {
                // Applicant documents are written atomically by the recruitment endpoint.
                allowed = previous?.json?.entityType !== 'APPLICATION' && next?.entityType !== 'APPLICATION';
              }
              if (!allowed) rejected.push({ collection: row.c, id: row.i, reason: 'FORBIDDEN_SCOPE' });
              return allowed;
            });
          }
          const scoped = chunk.flatMap((row, index) =>
            scopedCollections.has(row.c.toLowerCase()) ? [{ ...row, index }] : []
          );
          if (scoped.length) {
            const permissions = await new sql.Request(tx)
              .input('tenantId', sql.UniqueIdentifier, tenantId)
              .input('userId', sql.UniqueIdentifier, userId)
              .input('scoped', sql.NVarChar(sql.MAX), JSON.stringify(scoped))
              .query(`SELECT incoming.RowIndex
                FROM OPENJSON(@scoped) WITH (
                  RowIndex int '$.index', CollectionName nvarchar(80) '$.c',
                  EntityId nvarchar(200) '$.i', JsonDoc nvarchar(max) '$.j', IsDelete bit '$.d'
                ) AS incoming
                LEFT JOIN sync.EntityStore AS previous WITH (UPDLOCK,HOLDLOCK)
                  ON previous.TenantId=@tenantId AND previous.CollectionName=incoming.CollectionName AND previous.EntityId=incoming.EntityId
                CROSS APPLY (VALUES (LOWER(incoming.CollectionName))) AS collection(Name)
                WHERE (
                  (previous.EntityId IS NULL AND incoming.IsDelete=0)
                  OR (collection.Name IN (${sqlCollectionList(PARTY_COLLECTIONS)}) AND EXISTS (
                    SELECT 1 FROM security.fn_EntityAccountScope(
                      @tenantId,N'accounts.edit',previous.EntityId,previous.JsonDoc,previous.UpdatedByUserId
                    )
                  ))
                  OR (collection.Name IN (${sqlCollectionList(FINANCIAL_PARTY_COLLECTIONS)}) AND EXISTS (
                    SELECT 1 FROM security.fn_EntityFinancialDocumentScope(
                      @tenantId,collection.Name,N'finance.manage',previous.JsonDoc
                    )
                  ))
                )
                AND (
                  incoming.IsDelete=1
                  OR (collection.Name IN (${sqlCollectionList(PARTY_COLLECTIONS)}) AND EXISTS (
                    SELECT 1 FROM security.fn_EntityAccountScope(
                      @tenantId,N'accounts.edit',incoming.EntityId,incoming.JsonDoc,@userId
                    )
                  ))
                  OR (collection.Name IN (${sqlCollectionList(FINANCIAL_PARTY_COLLECTIONS)}) AND EXISTS (
                    SELECT 1 FROM security.fn_EntityFinancialDocumentScope(
                      @tenantId,collection.Name,N'finance.manage',incoming.JsonDoc
                    )
                  ))
                )`);
            const allowed = new Set(permissions.recordset.map(row => row.RowIndex));
            const blocked = new Set(scoped.filter(row => !allowed.has(row.index)).map(row => row.index));
            for (const index of blocked) rejected.push({ collection: chunk[index].c, id: chunk[index].i, reason: 'FORBIDDEN_SCOPE' });
            chunk = chunk.filter((_, index) => !blocked.has(index));
          }
          if (!chunk.length) continue;
          await new sql.Request(tx)
            .input('tenantId', sql.UniqueIdentifier, tenantId).input('userId', sql.UniqueIdentifier, userId)
            .input('rows', sql.NVarChar(sql.MAX), JSON.stringify(chunk))
            .execute('sync.usp_ApplyEntityChanges');
          for (const r of chunk) r.d ? deleted++ : upserted++;
        }
      }
      const version = (await new sql.Request(tx).input('tenantId', sql.UniqueIdentifier, tenantId)
        .query('SELECT ISNULL(MAX(Version),0) AS V FROM sync.EntityStore WHERE TenantId=@tenantId')).recordset[0]?.V || 0;
      return { upserted, deleted, serverVersion: Number(version), rejected };
    });
  }
}

/* ------------------------------ service ------------------------------ */
export function createEntityService({ driver, registry, hasPermission, excludeFixtures = false }) {
  const can = async (auth, code) => code === 'authenticated' || Boolean(await hasPermission(auth, code));
  const readableCache = async (auth) => {
    const memo = new Map();
    return async (name) => {
      const code = policyOf(name, registry).read;
      if (!memo.has(code)) memo.set(code, await can(auth, code));
      return memo.get(code);
    };
  };

  async function snapshot(auth, { includeEmptyCollections = [] } = {}) {
    const full = await driver.load(auth.tenantId, auth.userId);
    const canRead = await readableCache(auth);
    const collections = {};
    const hidden = [];
    // Preserve the distinction between a permitted empty collection and a hidden source.
    const visibleGroups = (full.collections.groups || []).filter(group =>
      isConversationMember(group, auth.userId) && (!excludeFixtures || !isMarkedFixture(group)));
    const visibleGroupIds = new Set(visibleGroups.map(group => group.id));
    const mayReadApplications = await can(auth, 'users.manage');
    const storedCollections = {
      ...Object.fromEntries(Object.entries(full.collections).filter(([name]) =>
        !['groups', 'messages', 'attachments', 'notifications', 'onboardingapplications', 'collectionpromises'].includes(name.toLowerCase()))),
      onboardingApplications: full.collections.onboardingApplications || [],
      collectionPromises: full.collections.collectionPromises || [],
      groups: visibleGroups,
      messages: (full.collections.messages || []).filter(message => visibleGroupIds.has(message.groupId)),
      notifications: (full.collections.notifications || []).flatMap(item => {
        if (item.recipientId && item.recipientId !== auth.userId) return [];
        if (item.linkTab !== 'groups') return [item];
        if (item.recipientId !== auth.userId) return [];
        if (item.conversationId) return visibleGroupIds.has(item.conversationId) ? [item] : [];
        return [{ ...item, title: 'اعلان گفت‌وگو', message: 'برای مشاهدهٔ گفت‌وگوهای مجاز وارد چت شوید.' }];
      }),
      attachments: (full.collections.attachments || []).filter(item =>
        item.entityType !== 'APPLICATION' || mayReadApplications),
    };
    for (const name of includeEmptyCollections) storedCollections[name] ??= [];
    for (const [name, list] of Object.entries(storedCollections)) {
      if (await canRead(name)) {
        collections[name] = excludeFixtures ? list.filter(row => !isMarkedFixture(row, recordId(row, name, registry))) : list;
      } else hidden.push(name);
    }
    const singletons = excludeFixtures
      ? Object.fromEntries(Object.entries(full.singletons).filter(([key, value]) =>
          !isMarkedFixture(value, key) && !(Array.isArray(value) && value.some(row => isMarkedFixture(row)))
        ))
      : full.singletons;
    for (const name of Object.keys(singletons)) if (CHAT_COLLECTIONS.has(name.toLowerCase()) || name.toLowerCase() === 'attachments'
      || name.toLowerCase() === 'onboardingapplications') delete singletons[name];
    return { collections, singletons, serverVersion: full.version, hiddenCollections: hidden, generatedAt: now() };
  }

  /** change = { upserts: {name:[record]}, deletes: {name:[id]}, singletons: {key:value} } (client format) */
  async function sync(auth, change, { allowDeletes = true } = {}) {
    const upserts = {}, deletes = {}, singletons = {};
    const rejected = [];
    let total = 0;
    const writable = new Map();
    const privateNames = new Map(['groups', 'messages', 'attachments', 'onboardingApplications', 'collectionPromises'].map(name => [name.toLowerCase(), name]));
    const canonical = name => !privateNames.has(name.toLowerCase()) || privateNames.get(name.toLowerCase()) === name;
    const canWrite = async (name) => {
      const code = policyOf(name, registry).write;
      if (!writable.has(code)) writable.set(code, await can(auth, code));
      return writable.get(code);
    };
    for (const [name, list] of Object.entries(change?.upserts || {})) {
      if (name.toLowerCase() === 'collectionpromises') { rejected.push({ collection: name, reason: 'FORBIDDEN_CONTRACT' }); continue; }
      if (!NAME_RE.test(name) || !canonical(name) || !Array.isArray(list)) { rejected.push({ collection: name, reason: 'INVALID_COLLECTION' }); continue; }
      if (!(await canWrite(name))) { rejected.push({ collection: name, reason: 'FORBIDDEN', count: list.length }); continue; }
      for (const rec of list) {
        const id = recordId(rec, name, registry);
        if (!id) { rejected.push({ collection: name, reason: 'MISSING_ID' }); continue; }
        if (excludeFixtures && isMarkedFixture(rec, id)) { rejected.push({ collection: name, id, reason: 'TEST_DATA_FORBIDDEN' }); continue; }
        if (bytes(rec) > LIMITS.maxRecordBytes) { rejected.push({ collection: name, id, reason: 'RECORD_TOO_LARGE' }); continue; }
        (upserts[name] ||= []).push({ __id: id, json: rec }); total++;
      }
    }
    for (const [name, ids] of Object.entries(allowDeletes ? (change?.deletes || {}) : {})) {
      if (name.toLowerCase() === 'collectionpromises') { rejected.push({ collection: name, reason: 'FORBIDDEN_CONTRACT' }); continue; }
      if (!NAME_RE.test(name) || !canonical(name) || !Array.isArray(ids)) { rejected.push({ collection: name, reason: 'INVALID_COLLECTION' }); continue; }
      if (!(await canWrite(name))) { rejected.push({ collection: name, reason: 'FORBIDDEN', count: ids.length }); continue; }
      deletes[name] = ids.filter((id) => typeof id === 'string' && id.length > 0 && id.length <= 200); total += deletes[name].length;
    }
    for (const [key, value] of Object.entries(change?.singletons || {})) {
      if (!NAME_RE.test(key) || privateNames.has(key.toLowerCase())) { rejected.push({ collection: key, reason: 'INVALID_SINGLETON' }); continue; }
      const code = policyOf(key, registry).write;
      // singletons (settings, locale, flags) follow the strictest write rule: settings.manage
      const needed = code === 'authenticated' ? 'authenticated' : code;
      if (!(await can(auth, needed === 'authenticated' ? 'settings.manage' : needed))) { rejected.push({ collection: key, reason: 'FORBIDDEN' }); continue; }
      if (excludeFixtures && (isMarkedFixture(value, key) || (Array.isArray(value) && value.some(row => isMarkedFixture(row))))) {
        rejected.push({ collection: key, reason: 'TEST_DATA_FORBIDDEN' }); continue;
      }
      if (bytes(value) > LIMITS.maxRecordBytes) { rejected.push({ collection: key, reason: 'RECORD_TOO_LARGE' }); continue; }
      singletons[key] = value; total++;
    }
    if (total > LIMITS.maxChangeRecords) return { ok: false, error: 'CHANGE_TOO_LARGE', limit: LIMITS.maxChangeRecords };
    const result = total ? await driver.apply(auth.tenantId, auth.userId, { upserts, deletes, singletons }) : { upserted: 0, deleted: 0, serverVersion: (await driver.load(auth.tenantId, auth.userId)).version };
    return { ok: true, ...result, rejected: [...rejected, ...(result.rejected || [])] };
  }

  /** Upload a full client state (incl. demo seed): merge-only, never deletes server rows. Sent in batches by the client. */
  async function bootstrap(auth, state) {
    const split = splitState(state, registry);
    const change = { upserts: {}, deletes: {}, singletons: {} };
    let n = 0;
    for (const [name, map] of Object.entries(split.collections)) { change.upserts[name] = [...map.values()]; n += map.size; }
    change.singletons = split.singletons;
    if (n > LIMITS.maxBootstrapRecords) return { ok: false, error: 'BOOTSTRAP_TOO_LARGE', limit: LIMITS.maxBootstrapRecords };
    // apply in slices so a single request never exceeds the per-change limit
    const summary = { upserted: 0, deleted: 0, rejected: [], serverVersion: 0 };
    for (const [name, list] of Object.entries(change.upserts)) {
      for (let at = 0; at < list.length; at += LIMITS.maxChangeRecords) {
        const r = await sync(auth, { upserts: { [name]: list.slice(at, at + LIMITS.maxChangeRecords) } }, { allowDeletes: false });
        if (!r.ok) return r;
        summary.upserted += r.upserted; summary.rejected.push(...r.rejected); summary.serverVersion = r.serverVersion;
      }
    }
    const r = await sync(auth, { singletons: change.singletons }, { allowDeletes: false });
    if (!r.ok) return r;
    summary.upserted += r.upserted; summary.rejected.push(...r.rejected); summary.serverVersion = r.serverVersion;
    return { ok: true, collections: Object.keys(change.upserts).length, ...summary };
  }

  async function integrity(auth) {
    const snap = await snapshot(auth);
    const issues = checkIntegrity(snap.collections, registry);
    return { collections: Object.fromEntries(Object.entries(snap.collections).map(([k, v]) => [k, v.length])), issueCount: issues.length, issues: issues.slice(0, 500) };
  }
  async function profile(auth) { return profileCollections((await snapshot(auth)).collections); }
  async function counts(auth, options) {
    const snap = await snapshot(auth, options);
    return { driver: driver.kind, serverVersion: snap.serverVersion, collections: Object.fromEntries(Object.entries(snap.collections).map(([k, v]) => [k, v.length])), singletons: Object.keys(snap.singletons), hiddenCollections: snap.hiddenCollections };
  }
  return { snapshot, sync, bootstrap, integrity, profile, counts, classify: (k, v) => classify(k, v, registry) };
}
