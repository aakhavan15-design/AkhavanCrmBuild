import { createHash, randomUUID } from 'node:crypto';
import { applicationKey, getOnboardingConfig, submitApplication } from '../src/lib/onboarding.ts';

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const MAX_FILE = 3 * 1024 * 1024;
const limits = { firstName: 100, lastName: 100, mobile: 32, nationalId: 24, desiredRole: 120, notes: 2000 };
const signatures = {
  'image/jpeg': buffer => buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  'image/png': buffer => buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  'image/webp': buffer => buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP',
  'application/pdf': buffer => buffer.toString('ascii', 0, 5) === '%PDF-',
};
const fail = (status, message) => ({ status, message });

function readFile(entry, permitted) {
  const { kind, fileName, fileType, base64Data } = entry || {};
  if (!permitted.has(kind) || typeof fileName !== 'string' || fileName.length > 180 || !fileName.trim()
    || /[\u0000-\u001f\u007f/\\]/.test(fileName) || !Object.hasOwn(signatures, fileType)
    || typeof base64Data !== 'string' || base64Data.length > MAX_FILE * 4 / 3 + 80) return null;
  const prefix = `data:${fileType};base64,`;
  if (!base64Data.startsWith(prefix)) return null;
  const encoded = base64Data.slice(prefix.length);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4) return null;
  const buffer = Buffer.from(encoded, 'base64');
  if (buffer.length > MAX_FILE || !signatures[fileType](buffer)) return null;
  return { kind, fileName: fileName.trim(), fileType, fileSize: buffer.length, base64Data };
}

export function createPublicRecruitment({ sql, run, tenantId }) {
  const tenant = typeof tenantId === 'string' && uuid.test(tenantId) ? tenantId : null;
  const execute = (tx, work) => new sql.Request(tx).input('tenantId', sql.UniqueIdentifier, tenant).query(work);
  const context = async (tx) => {
    const { recordset } = await execute(tx, `SELECT tenant.DisplayName, settings.JsonDoc
      FROM core.Tenant AS tenant LEFT JOIN sync.EntityStore AS settings
        ON settings.TenantId=tenant.TenantId AND settings.CollectionName=N'__singleton__'
        AND settings.EntityId=N'settings' AND settings.IsDeleted=0
      WHERE tenant.TenantId=@tenantId AND tenant.IsActive=1`);
    if (!recordset.length) return null;
    const settings = recordset[0].JsonDoc ? JSON.parse(recordset[0].JsonDoc) : {};
    const config = getOnboardingConfig({ settings });
    if (!config.enabled) return null;
    return { settings, config, company: recordset[0].DisplayName };
  };

  async function config() {
    if (!tenant) return null;
    return run({ tenantId: tenant, userId: null }, async tx => {
      const entry = await context(tx);
      if (!entry) return null;
      const { requiredDocs, requireNationalId, desiredRoles } = entry.config;
      return { company: entry.company, requiredDocs, requireNationalId, desiredRoles };
    });
  }

  async function submit(body) {
    if (!tenant) return fail(503, 'دریافت درخواست همکاری در حال حاضر در دسترس نیست.');
    const { requestId, fields, documents } = body || {};
    if (typeof requestId !== 'string' || !uuid.test(requestId) || !fields || typeof fields !== 'object'
      || !Array.isArray(documents) || documents.length > 12) return fail(400, 'اطلاعات درخواست معتبر نیست.');
    const input = {};
    for (const [name, max] of Object.entries(limits)) {
      if (fields[name] === undefined) continue;
      if (typeof fields[name] !== 'string' || fields[name].length > max) return fail(400, 'طول یا قالب یکی از فیلدها معتبر نیست.');
      input[name] = fields[name].trim();
    }
    return run({ tenantId: tenant, userId: null }, async tx => {
      const entry = await context(tx);
      if (!entry) return fail(503, 'ثبت درخواست همکاری در حال حاضر فعال نیست.');
      const { requiredDocs, desiredRoles } = entry.config;
      if (desiredRoles.length && !desiredRoles.includes(input.desiredRole)) return fail(400, 'شغل را از فهرست انتخاب کنید.');
      const permitted = new Set(requiredDocs.map(doc => doc.key));
      const files = documents.map(doc => readFile(doc, permitted));
      if (files.some(file => !file) || new Set(files.map(file => file.kind)).size !== files.length
        || files.reduce((total, file) => total + file.fileSize, 0) > 10 * 1024 * 1024) {
        return fail(400, 'مدارک تکراری، نامعتبر یا بیش از سقف حجم هستند. تصویر JPEG، PNG، WebP و PDF پذیرفته می‌شود.');
      }
      files.sort((a, b) => a.kind.localeCompare(b.kind));
      const key = applicationKey(input);
      const hash = createHash('sha256').update(JSON.stringify({ input, files })).digest('hex');
      const request = new sql.Request(tx).input('tenantId', sql.UniqueIdentifier, tenant)
        .input('requestId', sql.NVarChar(200), requestId)
        .input('key', sql.NVarChar(300), key)
        .input('requestLock', sql.NVarChar(255), `recruitment-request:${tenant}:${requestId.toLowerCase()}`)
        .input('lock', sql.NVarChar(255), `recruitment:${tenant}:${createHash('sha256').update(key).digest('hex')}`);
      const existing = (await request.query(`DECLARE @result int;
        EXEC @result=sys.sp_getapplock @Resource=@requestLock,@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=8000;
        IF @result<0 THROW 50409,N'Could not acquire recruitment request lock.',1;
        EXEC @result=sys.sp_getapplock @Resource=@lock,@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=8000;
        IF @result<0 THROW 50409,N'Could not acquire recruitment write lock.',1;
        SELECT EntityId,JsonDoc,IsDeleted FROM sync.EntityStore WITH (UPDLOCK,HOLDLOCK)
        WHERE TenantId=@tenantId AND CollectionName=N'onboardingApplications' AND (
          EntityId=@requestId OR (IsDeleted=0 AND JSON_VALUE(JsonDoc,'$.idempotencyKey')=@key
            AND JSON_VALUE(JsonDoc,'$.status') IN (N'SUBMITTED',N'UNDER_REVIEW',N'NEEDS_INFORMATION'))
        );`)).recordset;
      const previous = existing.find(row => row.EntityId.toLowerCase() === requestId.toLowerCase());
      if (previous) {
        const record = JSON.parse(previous.JsonDoc);
        if (!previous.IsDeleted && record.submissionHash === hash) return { status: 200, receipt: { id: previous.EntityId, status: 'ACCEPTED' } };
        return fail(409, 'این شناسهٔ ارسال برای درخواست دیگری استفاده شده است.');
      }
      if (existing.length) return fail(409, 'درخواست فعالی با همین مشخصات وجود دارد.');
      const draft = { settings: entry.settings };
      const attachments = files.map(({ kind, ...file }) => ({
        kind, ...file, id: randomUUID(), entityId: requestId, entityType: 'APPLICATION', createdAt: new Date().toISOString(),
      }));
      const result = submitApplication(draft, input, requestId, new Date(),
        attachments.map(file => ({ kind: file.kind, attachmentId: file.id })));
      if (!result.ok) return fail(400, result.errors.join(' '));
      const application = { ...draft.onboardingApplications[0], transport: 'SQLSERVER', submissionHash: hash };
      const rows = [
        { c: 'onboardingApplications', i: requestId, j: JSON.stringify(application), d: 0 },
        ...attachments.map(file => ({ c: 'attachments', i: file.id, j: JSON.stringify(file), d: 0 })),
      ];
      await new sql.Request(tx).input('tenantId', sql.UniqueIdentifier, tenant).input('userId', sql.UniqueIdentifier, null)
        .input('rows', sql.NVarChar(sql.MAX), JSON.stringify(rows)).execute('sync.usp_ApplyEntityChanges');
      return { status: 201, receipt: { id: requestId, status: 'ACCEPTED' } };
    });
  }
  return { config, submit };
}
