import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('record task action is a shared toolbar action, not a per-row control', () => {
  const table = read('src/components/ui/DataTable.tsx');
  const action = read('src/components/shared/RecordTaskAction.tsx');
  const customers = read('src/components/CustomersWorkspace.tsx');
  assert.match(table, /renderTaskAction\?: \(selectedRows: readonly T\[\]\) => React\.ReactNode/);
  assert.match(table, /props\.renderTaskAction\?\.\(selectedRows\)/);
  assert.match(table, /actions=\{composedToolbarActions\}/);
  assert.match(customers, /renderTaskAction=\{selectedRows =>/);
  assert.match(customers, /viewMode === 'minimal' && <RecordTaskAction/);
  assert.doesNotMatch(action, /<tr|<td|map\(.*row/);
});

test('record task creation preserves RBAC, active-user, task workflow, source link and durable queue', () => {
  const action = read('src/components/shared/RecordTaskAction.tsx');
  assert.match(action, /can\('tasks', 'CREATE'\)/);
  assert.match(action, /requireActiveUser\(state, updateState, 'ایجاد وظیفه'\)/);
  assert.match(action, /canCreateCrossDepartmentTask/);
  assert.match(action, /canOn\('tasks', 'CREATE', taskScope\)/);
  assert.match(action, /processTaskCollaborationEvents\(task, state, draft, true\)/);
  assert.match(action, /relatedEntity: \{ type: link\.type, id: link\.id, display: link\.display \}/);
  assert.match(action, /relatedEntityType: link\.type, relatedEntityId: link\.id/);
  assert.match(action, /enqueueOptimisticMutation\(\{ action: 'CREATE', entityType: 'tasks'/);
  assert.match(action, /emitBusinessEvent\('TASK_CREATED'/);
});

test('phase one customer task action leaves the global header and page plus untouched', () => {
  const layout = read('src/components/Layout.tsx');
  const drawer = read('src/components/NavigationDrawer.tsx');
  assert.match(layout, /<Header|Header/);
  assert.match(drawer, /dockActions/);
  assert.match(read('src/components/CustomersWorkspace.tsx'), /RecordTaskAction/);
  const customer360 = read('src/components/Customer360.tsx');
  assert.match(customer360, /RecordTaskAction/);
  assert.doesNotMatch(customer360, /createTaskFormSchema/);
});
