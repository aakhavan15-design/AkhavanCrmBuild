import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createTaskWorkflowStore, parseTaskWorkflowInput } from '../server/taskWorkflowStore.mjs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const workspace = read('src/components/TasksWorkspace.tsx');
const workflow = read('src/services/taskWorkflow.ts');
const provider = read('src/services/dataProvider.ts');
const server = read('server/index.mjs');

assert.equal((workspace.match(/const \[workflowTaskId, setWorkflowTaskId\]/g) || []).length, 1);
assert.equal((workspace.match(/onWorkflow=\{\(\) =>/g) || []).length, 1);
assert.equal((workspace.match(/<Modal isOpen=\{!!workflowTaskId\}/g) || []).length, 1);
for (const action of ['BLOCK', 'UNBLOCK', 'COMPLETE', 'REOPEN', 'RECORD_RESULT']) {
  assert.ok(workspace.includes(`applyWorkflowAction('${action}')`));
}
assert.match(workspace, /getActiveDataProvider\(\).getTaskWorkflow/);
assert.match(workspace, /getActiveDataProvider\(\).changeTaskWorkflow/);
assert.match(workspace, /error.status === 409/);
assert.match(workspace, /onClose=\{\(\) => \{\s*if \(workflowBusy && workflowRecord\) return;/);
assert.match(workspace, /fresh.blockReason \|\|/);
assert.match(workspace, /activityHistory/);
assert.match(provider, /encodeURIComponent\(id\)\}\/workflow/);
assert.match(server, /route\('\/api\/v1\/tasks\/:id\/workflow'\).all\(authenticate\)/);
assert.ok(workflow.includes("input.action === 'BLOCK' && !input.reason?.trim()"));
assert.ok(workflow.includes("input.action === 'COMPLETE' && !input.result?.trim()"));
assert.ok(workflow.includes('مهلت نامعتبر'));
assert.ok(workflow.includes("'بدون مسئول'"));
assert.ok(read('scripts/tests.manifest.json').includes('taskWorkflowWorkspaceContracts.test.mjs'));

const scope = read('database/sqlserver/v1/034_task_entity_scope.sql');
assert.match(scope, /security.fn_RecordReadScope/);
assert.match(scope, /crm.GroupMember AS member/);
assert.match(scope, /member.TenantId=@TenantId/);
assert.match(scope, /employee.IsActive=1/);
assert.doesNotMatch(scope, /\$\.(branchId|teamId|territoryId)/);

function workflowHarness() {
  const auth = { tenantId: 'tenant-a', userId: 'actual-actor' };
  let task = { id: 'task1', status: 'IN_PROGRESS', title: 'عنوان محفوظ' };
  let version = 5;
  const audit = [];
  let predecessor = Promise.resolve();
  class Request {
    constructor(tx) { this.tx = tx; this.params = {}; }
    input(name, _type, value) { this.params[name] = value; return this; }
    async query(text) {
      assert.equal(this.params.tenantId, this.tx.tenantId);
      if (text.includes('SELECT task.JsonDoc')) {
        assert.match(text, /fn_TaskEntityScope\(task.TenantId,task.JsonDoc,'EDIT'\)/);
        if (this.tx.lockExpected) assert.match(text, /UPDLOCK,HOLDLOCK/);
        const visible = this.tx.tenantId === auth.tenantId && this.tx.userId === auth.userId;
        return { recordset: visible && task.id === this.params.id ? [{ JsonDoc: JSON.stringify(task), Version: String(version) }] : [] };
      }
      assert.match(text, /UPDATE sync.EntityStore/);
      assert.match(text, /AND Version=TRY_CONVERT\(bigint,@version\)/);
      assert.match(text, /INSERT INTO security.AuditEvent/);
      assert.equal(this.params.version, String(version));
      assert.equal(this.params.userId, this.tx.userId);
      const event = JSON.parse(this.params.details);
      audit.push(event);
      task = JSON.parse(this.params.json);
      return { recordset: [{ Version: String(++version) }] };
    }
  }
  const sql = { Request, UniqueIdentifier: 'uuid', VarChar: () => 'string', NVarChar: () => 'string' };
  const store = createTaskWorkflowStore({ sql, run: (claims, run) => {
    const transaction = predecessor.then(() => run(claims));
    predecessor = transaction.catch(() => {});
    return transaction;
  } });
  return { auth, store, audit };
}

test('serial transaction tests allow one completion and reject a stale concurrent follow-up', async () => {
  const { auth, store, audit } = workflowHarness();
  const { version } = await store.read(auth, 'task1');
  const request = parseTaskWorkflowInput({ version, action: 'COMPLETE', result: 'نتیجه معتبر', actorId: 'untrusted', at: '2000-01-01' });
  const [accepted, stale] = await Promise.allSettled([
    store.change({ ...auth, lockExpected: true }, 'task1', request, 'corr1'),
    store.change({ ...auth, lockExpected: true }, 'task1', { ...request, action: 'RECORD_RESULT' }, 'corr2')
  ]);
  assert.equal(accepted.status, 'fulfilled');
  assert.equal(accepted.value.version, '6');
  assert.equal(accepted.value.task.title, 'عنوان محفوظ');
  assert.equal(accepted.value.task.status, 'COMPLETED');
  assert.equal(accepted.value.task.activityHistory[0].actorId, auth.userId);
  assert.equal(accepted.value.task.activityHistory[0].at, accepted.value.task.completedAt);
  assert.match(accepted.value.task.taskWorkflowRevision, /^[\da-f-]{36}$/);
  assert.equal(stale.reason.status, 409);
  assert.equal(audit.length, 1);
  assert.equal(audit[0].action, 'COMPLETE');
});

test('invalid content, unknown action and inaccessible task do not write or audit', async () => {
  const { auth, store, audit } = workflowHarness();
  assert.throws(() => parseTaskWorkflowInput({ version: '5', action: 'COMPLETE', result: [] }), { status: 400 });
  assert.throws(() => parseTaskWorkflowInput({ version: 5, action: 'COMPLETE' }), { status: 400 });
  await assert.rejects(store.change(auth, 'task1', { version: '5', action: 'COMPLETE' }, 'invalid'), { status: 422 });
  await assert.rejects(store.change(auth, 'task1', { version: '5', action: 'constructor' }, 'invalid'), { status: 422 });
  await assert.rejects(store.read({ ...auth, tenantId: 'tenant-b' }, 'task1'), { status: 404 });
  await assert.rejects(store.change({ ...auth, userId: 'other-user' }, 'task1', { version: '5', action: 'COMPLETE' }, 'denied'), { status: 404 });
  assert.equal((await store.read(auth, 'task1')).task.status, 'IN_PROGRESS');
  assert.deepEqual(audit, []);
});
