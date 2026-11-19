/* Universal CRM permission catalog. This seeds definitions only; it grants no role access.
   Tenant-specific RolePermission assignments remain an explicit administrator action. */
SET XACT_ABORT ON;
GO
DECLARE @Catalog TABLE (PermissionCode nvarchar(120) NOT NULL PRIMARY KEY, Description nvarchar(300) NOT NULL);
INSERT INTO @Catalog (PermissionCode, Description) VALUES
 (N'accounts.view', N'مشاهده پرونده‌ها و اطلاعات مشتریان'),
 (N'accounts.create', N'ثبت پیشنهاد ایجاد مشتری برای بررسی ERP'),
 (N'accounts.edit', N'ویرایش اطلاعات مجاز پرونده مشتری'),
 (N'accounts.delete', N'حذف یا بایگانی پرونده مشتری طبق سیاست سامانه'),
 (N'leads.view', N'مشاهده سرنخ‌های فروش'),
 (N'leads.edit', N'مدیریت سرنخ‌های فروش'),
 (N'quotes.view', N'مشاهده پیشنهادها و پیش‌فاکتورها'),
 (N'quotes.create', N'ایجاد پیشنهاد فروش'),
 (N'quotes.approve', N'تأیید پیشنهاد فروش در CRM'),
 (N'finance.view', N'مشاهده تحلیل‌های مالی و مطالبات'),
 (N'finance.manage', N'مدیریت پیگیری‌های مالی در CRM'),
 (N'settings.manage', N'مدیریت تنظیمات سامانه'),
 (N'cases.view', N'مشاهده پرونده‌های پیگیری'),
 (N'cases.edit', N'مدیریت پرونده‌های پیگیری'),
 (N'marketing.manage', N'مدیریت فعالیت‌های بازاریابی'),
 (N'knowledge.manage', N'مدیریت محتوای پایگاه دانش'),
 (N'agents.manage', N'مدیریت دستیارها و عامل‌های هوشمند'),
 (N'automation.manage', N'مدیریت گردش‌کارها و خودکارسازی'),
 (N'users.manage', N'مدیریت کاربران'),
 (N'roles.manage', N'مدیریت نقش‌ها و مجوزها'),
 (N'internal.view', N'مشاهده درخواست‌ها و عملیات داخلی'),
 (N'internal.manage', N'مدیریت درخواست‌ها و عملیات داخلی'),
 (N'geo.view', N'مشاهده تحلیل‌های مکانی'),
 (N'geo.manage', N'مدیریت محدوده‌ها و تخصیص‌های مکانی');

INSERT INTO core.Permission (PermissionCode, Description)
SELECT c.PermissionCode, c.Description
FROM @Catalog c
WHERE NOT EXISTS (
  SELECT 1 FROM core.Permission p WHERE p.PermissionCode=c.PermissionCode
);
GO
