import { createHash } from 'node:crypto';
import { toLatinDigits } from '../src/lib/digits.ts';

const methods = new Set(['TRANSFER', 'SAYAD_CHEQUE', 'CASH_DEPOSIT', 'POS']);
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const clean = value => typeof value === 'string' ? value.trim() : '';
const fail = (status, message) => ({ status, message });

export function createCollectionActions({ sql, run }) {
  return async (auth, accountId, body) => {
    const { requestId, kind, dueDate, followUp, assigneeId } = body || {};
    if (!uuid.test(accountId) || typeof requestId !== 'string' || !uuid.test(requestId)
      || !['FOLLOW_UP', 'PROMISE'].includes(kind)) return fail(400, 'شناسه یا نوع پیگیری معتبر نیست.');
    if (assigneeId !== undefined && (kind !== 'FOLLOW_UP' || typeof assigneeId !== 'string' || !uuid.test(assigneeId))) {
      return fail(400, 'شناسهٔ مسئول پیگیری معتبر نیست.');
    }
    const targetAssignee = assigneeId || auth.userId;
    const day = typeof dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? new Date(`${dueDate}T00:00:00Z`) : null;
    if (!day || !Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== dueDate) {
      return fail(400, 'تاریخ پیگیری یا تعهد معتبر نیست.');
    }

    const note = clean(body.note);
    const contact = clean(body.contactPerson);
    const method = clean(body.paymentMethod);
    const cheque = toLatinDigits(clean(body.sayadChequeNumber));
    const amount = body.promisedAmount;
    if (note.length > 2000 || (kind === 'PROMISE' && (
      !Number.isSafeInteger(amount) || amount < 1000000 || !contact || contact.length > 200 || !methods.has(method)
      || (method === 'SAYAD_CHEQUE' && !/^\d{16}$/.test(cheque))))) {
      return fail(400, 'مبلغ، روش پرداخت یا مشخصات توافق معتبر نیست.');
    }
    const needTask = kind === 'FOLLOW_UP' || followUp === true;
    const collection = kind === 'PROMISE' ? 'collectionPromises' : 'tasks';
    const inputs = { accountId, kind, dueDate, note, contact, method, cheque, amount, needTask };
    const fingerprint = createHash('sha256').update(JSON.stringify(
      targetAssignee.toLowerCase() === auth.userId.toLowerCase() ? inputs : { ...inputs, targetAssignee }
    )).digest('hex');

    return run(auth, async tx => {
      const access = (await new sql.Request(tx).input('tenantId', sql.UniqueIdentifier, auth.tenantId)
        .input('accountId', sql.UniqueIdentifier, accountId)
        .input('requiredPermission', sql.NVarChar(120), kind === 'PROMISE' ? 'finance.manage' : 'finance.view')
        .query(`SELECT account.Name, account.BranchId,account.TerritoryId,account.TeamId
          FROM crm.Account AS account
          CROSS APPLY security.fn_RecordReadScope(account.TenantId,@requiredPermission,account.OwnerUserId,account.BranchId,account.TerritoryId,account.TeamId) AS finance_access
          WHERE account.TenantId=@tenantId AND account.AccountId=@accountId
            AND EXISTS (SELECT 1 FROM security.fn_RecordReadScope(account.TenantId,N'accounts.view',account.OwnerUserId,account.BranchId,account.TerritoryId,account.TeamId))`)).recordset[0];
      if (!access) return fail(403, 'مجوز ثبت پیگیری برای این مشتری را ندارید.');

      if (targetAssignee.toLowerCase() !== auth.userId.toLowerCase()) {
        const assignmentAllowed = (await new sql.Request(tx)
          .input('tenantId', sql.UniqueIdentifier, auth.tenantId)
          .input('assigneeId', sql.UniqueIdentifier, targetAssignee)
          .query(`SELECT TOP (1) 1 AS Allowed FROM core.AppUser AS employee
            CROSS JOIN (VALUES(N'tasks.assign'),(N'internal.manage'),(N'accounts.edit')) AS permission(Code)
            CROSS APPLY security.fn_RecordReadScope(employee.TenantId,permission.Code,
              employee.UserId,employee.BranchId,employee.TerritoryId,employee.TeamId) AS entitlement
            WHERE employee.TenantId=@tenantId AND employee.UserId=@assigneeId AND employee.IsActive=1`)).recordset.length;
        if (!assignmentAllowed) return fail(403, 'ارجاع به این کاربر در محدودهٔ مجوز شما نیست.');
      }

      const now = new Date().toISOString();
      const task = {
        id: kind === 'FOLLOW_UP' ? requestId : `${requestId}-follow-up`,
        title: `پیگیری وصول مطالبات: ${access.Name}`,
        description: note || 'با مشتری تماس بگیرید و وضعیت پیگیری وصول را ثبت کنید.',
        accountId, customerId: accountId, dueDate, type: 'CALL', priority: 'HIGH', status: 'OPEN',
        assigneeType: 'USER', assigneeId: targetAssignee, ownerId: targetAssignee, assignedTo: targetAssignee,
        createdBy: auth.userId, createdAt: now, branchId: access.BranchId, territoryId: access.TerritoryId, teamId: access.TeamId,
      };
      if (needTask) {
        const permitted = (await new sql.Request(tx).input('tenantId', sql.UniqueIdentifier, auth.tenantId)
          .input('task', sql.NVarChar(sql.MAX), JSON.stringify(task))
          .query("SELECT 1 FROM security.fn_TaskEntityScope(@tenantId,@task,'CREATE')")).recordset.length;
        if (!permitted) return fail(403, 'مجوز ایجاد وظیفهٔ پیگیری را ندارید.');
      }

      const previous = (await new sql.Request(tx).input('tenantId', sql.UniqueIdentifier, auth.tenantId)
        .input('collection', sql.NVarChar(80), collection).input('requestId', sql.NVarChar(200), requestId)
        .query(`SELECT JsonDoc, IsDeleted FROM sync.EntityStore WITH (UPDLOCK,HOLDLOCK)
          WHERE TenantId=@tenantId AND CollectionName=@collection AND EntityId=@requestId`)).recordset[0];
      if (previous) {
        const saved = JSON.parse(previous.JsonDoc);
        if (!previous.IsDeleted && saved.submissionHash === fingerprint &&
          (saved.createdById || saved.createdBy) === auth.userId) return { status: 200, id: requestId };
        return fail(409, 'این شناسه برای پیگیری دیگری استفاده شده است.');
      }

      const promise = {
        id: requestId, accountId, accountName: access.Name, promisedAmount: amount, promisedDate: dueDate,
        paymentMethod: method, contactPerson: contact, notes: note,
        sayadChequeNumber: method === 'SAYAD_CHEQUE' ? cheque : undefined,
        status: 'PENDING', createdAt: now, createdById: auth.userId, submissionHash: fingerprint,
      };
      const rows = kind === 'PROMISE' ? [{ c: collection, i: requestId, j: JSON.stringify(promise), d: 0 }] : [];
      if (needTask) rows.push({ c: 'tasks', i: task.id, j: JSON.stringify({ ...task, submissionHash: fingerprint }), d: 0 });
      await new sql.Request(tx).input('tenantId', sql.UniqueIdentifier, auth.tenantId)
        .input('userId', sql.UniqueIdentifier, auth.userId)
        .input('rows', sql.NVarChar(sql.MAX), JSON.stringify(rows)).execute('sync.usp_ApplyEntityChanges');
      return { status: 201, id: requestId };
    });
  };
}
