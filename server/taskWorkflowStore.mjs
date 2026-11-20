import { createHash, randomUUID } from 'node:crypto';
import { applyTaskWorkflow } from '../src/services/taskWorkflow.ts';
import { isMarkedFixture } from '../src/lib/stateModel.mjs';

export class TaskWorkflowError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const notFound = () => new TaskWorkflowError(404, 'TASK_NOT_FOUND', 'وظیفه در دسترس نیست.');
const conflict = () => new TaskWorkflowError(409, 'TASK_VERSION_CONFLICT', 'وظیفه تغییر کرده است. نسخهٔ تازه را دریافت کنید.');

export function createTaskWorkflowStore({ sql, run, excludeFixtures = false }) {
  async function read(tx, auth, id, forUpdate) {
    const result = await new sql.Request(tx)
      .input('tenantId', sql.UniqueIdentifier, auth.tenantId)
      .input('id', sql.NVarChar(200), id)
      .query(`SELECT task.JsonDoc, CONVERT(varchar(20), task.Version) AS Version
        FROM sync.EntityStore AS task ${forUpdate ? 'WITH (UPDLOCK,HOLDLOCK)' : ''}
        CROSS APPLY security.fn_TaskEntityScope(task.TenantId,task.JsonDoc,'EDIT') AS scope
        WHERE task.TenantId=@tenantId AND task.CollectionName=N'tasks' AND task.EntityId=@id AND task.IsDeleted=0`);
    const row = result.recordset[0];
    if (!row) throw notFound();
    const task = JSON.parse(row.JsonDoc);
    if (!task || task.isDeleted || task.deletedAt || (excludeFixtures && isMarkedFixture(task, id))) throw notFound();
    return { task, version: row.Version };
  }

  return {
    read: (auth, id) => run(auth, tx => read(tx, auth, id, false)),
    change: (auth, id, input, correlationId) => run(auth, async tx => {
      const current = await read(tx, auth, id, true);
      if (current.version !== input.version) throw conflict();
      const result = applyTaskWorkflow(current.task, {
        action: input.action, reason: input.reason, result: input.result, nextAction: input.nextAction,
        actorId: auth.userId,
      });
      if (!result.ok) throw new TaskWorkflowError(422, 'INVALID_TASK_TRANSITION', result.error);
      const task = { ...result.task, taskWorkflowRevision: randomUUID() };
      const updated = await new sql.Request(tx)
        .input('tenantId', sql.UniqueIdentifier, auth.tenantId)
        .input('userId', sql.UniqueIdentifier, auth.userId)
        .input('id', sql.NVarChar(200), id)
        .input('version', sql.VarChar(20), input.version)
        .input('json', sql.NVarChar(sql.MAX), JSON.stringify(task))
        .input('correlationId', sql.NVarChar(100), correlationId)
        .input('auditId', sql.NVarChar(120), id.length <= 120 ? id : `sha256:${createHash('sha256').update(id).digest('hex')}`)
        .input('details', sql.NVarChar(sql.MAX), JSON.stringify({
          taskId: id, action: input.action, beforeStatus: current.task.status, afterStatus: task.status,
          workflowRevision: task.taskWorkflowRevision,
        }))
        .query(`SET NOCOUNT ON;
          DECLARE @updated TABLE(Version bigint NOT NULL);
          UPDATE sync.EntityStore SET JsonDoc=@json, Version=Version+1, UpdatedAtUtc=SYSUTCDATETIME(), UpdatedByUserId=@userId
          OUTPUT inserted.Version INTO @updated
          WHERE TenantId=@tenantId AND CollectionName=N'tasks' AND EntityId=@id AND IsDeleted=0
            AND Version=TRY_CONVERT(bigint,@version);
          IF EXISTS (SELECT 1 FROM @updated)
            INSERT INTO security.AuditEvent
              (TenantId,ActorUserId,CorrelationId,EventType,EntityType,EntityId,OutcomeCode,DetailsJson)
            VALUES (@tenantId,@userId,@correlationId,N'TASK_WORKFLOW_CHANGED',N'TASK',@auditId,'SUCCESS',@details);
          SELECT CONVERT(varchar(20), Version) AS Version FROM @updated;`);
      const version = updated.recordset[0]?.Version;
      if (!version) throw conflict();
      return { task, version };
    }),
  };
}

export function parseTaskWorkflowInput(body) {
  if (!body || !/^[1-9][0-9]{0,18}$/.test(typeof body.version === 'string' ? body.version : '')
      || typeof body.action !== 'string' || body.action.length > 30
      || ['reason', 'result', 'nextAction'].some(key => body[key] != null &&
        (typeof body[key] !== 'string' || body[key].length > 4000))) {
    throw new TaskWorkflowError(400, 'INVALID_TASK_WORKFLOW_INPUT', 'اطلاعات گردش وظیفه معتبر نیست.');
  }
  return { version: body.version, action: body.action, reason: body.reason, result: body.result, nextAction: body.nextAction };
}
