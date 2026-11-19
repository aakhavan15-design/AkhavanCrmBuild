## ثبت اجرای ۲۰۲۶-۱۱-۱۹ — قرارداد اشتراک و ارسال Push

- **F4-07 / F10-02 [~]** — ثبت و حذف اشتراک و ارسال از مرورگر هویت را از جلسهٔ سرور می‌گیرند. اشتراک‌ها با مستأجر و کاربر جدا می‌شوند، پیش‌نمایش سیستم جزئیات محتوای اعلان را نشان نمی‌دهد، و محیط تولید بدون کلید VAPID وارد حالت آزمایشی نمی‌شود.
- **PASS** — `backendSecurityContracts` (جداسازی اشتراک با ذخیرهٔ موقت)، `notificationCenterWiring`، `wiredModulesContracts`، Build و بررسی نحو سرور. TypeScript در کل پروژه ۷۷۷ خطا دارد.
- **NOT VERIFIED** — ارسال به سرویس Push واقعی، دوام چندنمونه‌ای ذخیرهٔ اشتراک و ارسال گردش‌های سازمانی به گیرنده از Worker دارای مجوز. گام بعد: کاهش خطاهای نوع و تکمیل گزارش‌های عملیات در F0-02.

## ثبت اجرای ۲۰۲۶-۱۱-۱۹ — محدودهٔ اعلان در برنامه و خطاهای نوع نقطهٔ ورود

- **F0-02 / F4-07 [~]** — خطاهای نوع `App.tsx` رفع شدند. بررسی مجوز اعلان و مکان مستقل است و خرابی یکی نتیجهٔ دیگری را از بین نمی‌برد. اعلان سیستمیِ درون برنامه و علامت خوانده‌شدن از همان مجموعهٔ مجاز برای کاربر جاری استفاده می‌کنند و شمارندهٔ مرورگر به کاربر وابسته است.
- **PASS** — `notificationCenterWiring`، `tourCoverageContracts`، `workspaceRedesignContracts`، Build و آزمون Chromium مسیر ورود تا مطالبه در ۳۹۰ و ۱۴۴۰ پیکسل. TypeScript در کل پروژه هنوز ۷۷۷ خطا دارد.
- **باز** — احراز هویت و جداسازی ثبت اشتراک و ارسال Push سمت سرور، تست نقش/محدوده در محیط واقعی، و بقیهٔ خطاهای نوع.

## ثبت اجرای ۲۰۲۶-۱۱-۱۹ — اجرای Build عملیاتی بدون دادهٔ نمونه

- **F0-02 [~]** — در Build تولید، تولید دادهٔ نمونه فقط با پرچم صریح مجاز است. محیط توسعه همچنان نمونه دارد و می‌توان آن را با پرچم غیرفعال کرد. ارجاع به فایل فونت غایب برداشته شد و ترتیب فونت‌های موجود حفظ شد.
- **PASS** — `productionSeedSafety`، `wiredModulesContracts`، `customerProposalContract` و Build استاندارد بدون پرچم. هشدار فایل فونت رفع شد. مسیر پیشنهاد مشتری در Chromium با همین Build دوباره پاس شد. آخرین بررسی TypeScript ۷۹۲ خطا داشت و شمار آزمون جامع ۱۳۴ موفق و ۱۵ ناموفق بود.
- **باز** — خطاهای نوع و آزمون‌های جامع، قراردادهای اعلان و بررسی Build در شرایط استقرار واقعی.

## ثبت اجرای ۲۰۲۶-۱۱-۱۹ — F0-07، پیشنهاد مشتری از پرونده

- **F0-07 [~]** — مالکِ دارای مجوز می‌تواند پیش‌نویس همگام‌شده را از پرونده به صف پیشنهاد ERP بفرستد. API پیش‌نویس را در محدودهٔ مستأجر و مالک می‌خواند و از Outbox و قرارداد تکرارناپذیری موجود استفاده می‌کند. UI فقط پس از رسید معتبرِ صف، وضعیت و شناسه‌های پیشنهاد را ثبت می‌کند. صدور کد رسمی همچنان در اختیار ERP است.
- **PASS** — `customerProposalContract`، `backendSecurityContracts`، `customerBalanceView` و Build با دادهٔ آزمایشی غیرفعال. Chromium در عرض ۳۹۰ رد رسید ناسازگار، تلاش مجدد، پذیرش رسید معتبر و خالی‌ماندن کد ERP را با API آزمایشی تأیید کرد.
- **NOT VERIFIED** — اجرای تراکنش و Outbox روی SQL Server زنده، ارسال Worker، قرارداد پاسخ تأیید/رد ERP و همگام‌سازی کد رسمی. گام بعد: کنترل پیش‌فرض Seed در Build عملیاتی و ادامهٔ خطاهای TypeScript در F0-02.

## ثبت اجرای ۲۰۲۶-۱۱-۱۹ — پیش‌نیاز احراز هویت و آمادگی API در F10-02

- **F10-02 [~]** — در محیط تولید، API بدون تنظیم اتصال SQL و کلید احراز هویت یا با درایور آزمایشی پاسخ «سرویس آماده نیست» می‌دهد. ایجاد دادهٔ نمونه و احراز هویت آزمایشی به محیط غیرتولیدی با پیکربندی ناقص محدود شد. کلید حالت آزمایشی در زمان اجرا ساخته می‌شود.
- **PASS** — `backendSecurityContracts`، `wiredModulesContracts`، بررسی نحو سرور و آزمون HTTP تولید بدون پیکربندی روی loopback. بررسی سلامت سرویس ۲۰۰ و آمادگی و API کاربردی ۵۰۳ بودند.
- **NOT VERIFIED** — اتصال SQL Server، احراز هویت با دادهٔ واقعی و مجوزهای RLS در محیط استقرار. گام بعد: ادامهٔ مسیر پیشنهاد مشتری در F0-07.

## ثبت اجرای ۲۰۲۶-۱۱-۱۹ — F0-14، انتساب مشتریان به زون

- **F0-14 [~]** — تب عملیات مکانی انتساب‌ها را از Provider می‌خواند. API موجود مجموعهٔ خالیِ مجاز را از مجموعهٔ پنهان متمایز می‌کند. نبود منبع، شمارنده را نامشخص و عملیات را غیرفعال می‌کند. به‌روزرسانی فقط به انتساب مشتریان قابل‌مشاهده دست می‌زند و وضعیت ثبت سمت سرور تا همگام‌سازی در صف گزارش می‌شود.
- **PASS** — `geoAssignmentSyncContracts`، `geoWorkspaceContracts`، `sqlFirstStateLayer` و Build. آزمون مرورگر ۳۹۰ پیکسل ورود به تب عملیات، غیرفعال‌شدن عملیات در قطع منبع و بازگشت پس از تلاش مجدد را با API آزمایشی تأیید کرد.
- **NOT VERIFIED** — همگام‌سازی زنده و بازخوانی انتساب/هندسه در SQL Server، رقابت چند کاربر، انتقال خواندن زون و هندسه و سایر مصرف‌کنندگان مستقیم State. نقطهٔ ادامه: آمادگی API برای استقرار، سپس قرارداد ارسال پیشنهاد مشتری F0-07.

## ثبت اجرای ۲۰۲۶-۱۱-۱۹ — F0-12، آستانه‌های ریزش در تنظیمات

- **F0-12 [~]** — خطای بارگذاری کنترل‌های آستانه رفع شد. ثبت با خروج از فیلد انجام می‌شود، ارقام فارسی پذیرفته می‌شود و پاک‌کردن override به پیش‌فرض معتبر برمی‌گردد. مقدار نامعتبر از تنظیمات به صفر تبدیل نمی‌شود. تغییر معتبر با شناسهٔ کاربر، زمان، مقدار قبل و بعد در رویداد ممیزی ذخیره می‌شود و تنظیمات و ممیزی از مسیر همگام‌سازی موجود ارسال می‌شوند.
- **PASS** — `churnErpInvoiceSource`، `churnPredictionService`، `collectionDeterminism` و Build. آزمون Chromium در عرض ۳۹۰ ثبت عدد فارسی، ارسال تنظیم و رویداد ممیزی به API آزمایشی، و پاک‌کردن override را تأیید کرد. TypeScript هنوز ۷۹۵ خطا دارد.
- **NOT VERIFIED** — نسخه‌گذاری سمت سرور در F4-01، رقابت هم‌زمان و نگهداری تنظیم و ممیزی روی SQL Server/ERP زنده. ادامهٔ مستقل: خواندن انتساب‌های مکانی از DataProvider در F0-14.

## ثبت اجرای ۲۰۲۶-۱۱-۱۹ — اتصال گزارش مطالبات در مسیر فعال

- **F0-13 / F0-16 [~]** — زبانهٔ `/reports?tab=receivables` پنل موجود سنی مطالبات را با دادهٔ دفتر کل و محدودهٔ مجوز مشتری و فاکتور نمایش می‌دهد. نتیجهٔ ناقص کنار گذاشته می‌شود، خطا امکان تلاش مجدد دارد و ردیف فاکتور به پروندهٔ مجاز مشتری می‌رود. بررسی تخصیص دریافت جدا از برآورد دفتری نمایش داده می‌شود. مانده با اولویت شناسهٔ تفصیلی، کد ERP، کد حساب و شناسهٔ داخلی انتخاب می‌شود و ترتیب پاسخ API اولویت را عوض نمی‌کند.
- **PASS** — آزمون‌های `customerBalanceView`، `reportReceivablesLedgerOnly` و `invoiceLifoRemaining`، Build و آزمون مسیر واقعی با Chromium در عرض ۳۹۰ و ۱۴۴۰، RTL، بدون سرریز افقی و بازیابی پس از خطا در ۳۹۰. آزمون مرورگر از پاسخ‌های آزمایشی API استفاده کرد. بررسی TypeScript به ۷۹۹ خطا رسید و باز است.
- **NOT VERIFIED** — SQL Server و ERP زنده، سایر گزارش‌ها و بقیه عرض‌های ماتریس F13. گام بعد: رفع خطای بارگذاری آستانه‌های ریزش در تنظیمات (F0-12)، سپس ادامهٔ Geo (F0-14).

## ثبت اجرای ۲۰۲۶-۱۱-۱۹ — میز اعتبار عملیات و خط مبنای انتشار

- **F0-14 / F0-16 [~]** — میز اعتبار عملیات مانده را از `getDetailSubsidiaryBalances` و نمونه‌های تخصیص را از `getPaymentAllocations` می‌خواند. تفکیک معین، نامشخص‌بودن ماندهٔ ناقص، تلاش مجدد پس از خطا و محدودهٔ مشاهدهٔ مشتری/فاکتور/دریافت به گزارش وصل شدند. تعداد فاکتورهای سررسیدگذشته از سنی تخمینی دفتر کل به دست می‌آید.
- **F0-02 [~]** — نصب ۳۱۵ وابستگی با npm و کش قابل‌نوشتن موفق بود. `npm run build` موفق بود و هشدار اندازهٔ chunk و مسیر فونت حل‌نشده داشت. اجرای `tsc --noEmit` با ۸۰۷ خطای TypeScript پایان یافت. پس از ثبت `reportPrimitivesContracts` در Manifest و حذف اجرای فرایند تو‌در‌تو از `sourceSurfaceAudit`، `npm test` به ۱۳۴ فایل موفق، ۱۵ فایل ناموفق و صفر فایل خارج از Manifest رسید. آزمون ممیزی دیگر فایل گزارش Git را بازنویسی نمی‌کند. سه آزمون هدفمند میز اعتبار نیز پاس شدند.
- **API آزمایشی — PASS** — HTTP روی loopback با `NODE_ENV=test ENTITY_STORE_DRIVER=memory`: `/health/live` پاسخ ۲۰۰، `/health/ready` در نبود پیکربندی SQL پاسخ ۵۰۳، و Snapshot تخصیص مجازِ خالی پاسخ ۲۰۰ با آرایهٔ خالی داد.
- **F0-03 [B]** — گزارش یا ZIP ممیزی نسخهٔ `customer_sync` در فایل‌های Git یافت نشد. بستن این ردیف نیازمند خود فهرست یافته‌های تاریخی است. کار مستقل ادامه دارد.
- **NOT VERIFIED** — اجرای بصری و موبایل، SQL Server/ERP زنده. نقطهٔ ادامه: ترمیم اجرای جامع آزمون‌ها در F0-02، ادامهٔ F0-14 برای دادهٔ Geo و تکمیل اعتبارسنجی مانده تفصیلی در F0-13.

## ثبت اجرای ۲۰۲۶-۱۱-۱۹ — F0-14، منبع تخصیص دریافت‌ها در گزارش مطالبات

- **F0-14 [~]** — گزارش مطالبات تخصیص‌ها را از `DataProvider.getPaymentAllocations` می‌گیرد و فقط پیوندهای فاکتور و دریافت قابل‌مشاهده را بررسی می‌کند. API موجود با مجوز سمت سرور و محدودهٔ مستأجر، مجموعهٔ خالی مجاز را از منبع پنهان متمایز می‌کند. خطای دریافت در گزارش قابل مشاهده و قابل تلاش مجدد است. ادعای تطبیق کامل حذف شد. مانده و سنی مطالبات همچنان از مسیر دفتر کل می‌آیند و خواندن بلااستفادهٔ تخصیص‌ها در فضای مالی حذف شد.
- **PASS** — `node --experimental-strip-types --import ./scripts/register-ts-resolver.mjs --test tests/sqlFirstStateLayer.test.mjs tests/reportReceivablesLedgerOnly.test.mjs tests/receivableReconciliation.test.mjs`؛ سه فایل آزمون پاس شدند. تمایز مجموعهٔ خالی، پُر و محدودشده با درایور حافظه و محدودهٔ مستأجر آزمایش شد. بررسی نحو دو فایل سرور و `git diff --check` موفق بود.
- **NOT VERIFIED** — مرورگر، build، TypeScript، HTTP/RBAC با SQL Server زنده و ERP. گزارش ممیزی نسخهٔ `customer_sync` در سورس این کامیت یافت نشد و تطبیق کل F0-03 باز است. ادامهٔ F0-14 شامل مصرف‌کنندگان Operations و Geo است.

## اولویت تازه مالک — ۲۰۲۶-۱۱-۱۹ (مطالبات، تسک، نقدینگی، سود و هزینه)
- مشخصات اجرایی و معیار پذیرش در `docs/MASTER_SPEC_FA.md` §۱۷ ثبت شد؛ این ثبت **فقط مستندسازی است، نه پیاده‌سازی**. هیچ ردیف جدیدی PASS نشده و همه موارد زیر `[ ]` هستند.
- ممیزی هدفمند: موتور و پنل نقدینگی از آرشیو بازیابی شده‌اند اما SQL/ERP، عدم دوباره‌شماری، TypeScript و مرورگر تأیید نشده؛ گزارش‌ها و تسک‌ها زیرساخت پراکنده دارند و نباید ماژول موازی ساخته شود. ممیزی سرتاسری سورس/DB در این تحویل انجام نشده است.
- اولویت اجرای پس از رفع وابستگی‌های پایه: **F17-01 ← F17-02 ← F17-03 ← F17-04 ← F17-05 ← F17-06 ← F17-07 ← F17-08**. وابستگی‌های مستقل می‌توانند موازی در همان سورس تکمیل شوند؛ مالکیت موتورهای اصلی مطابق ردیف‌های قبلی حفظ شود.

## تحویل موقت ۱۴۰۵/۰۸/۲۸ — بازیابی فاز ۶ از Archive.zip
- موتور `cashFlowEngine.ts` و پنل `CashFlowPanel.tsx` از آرشیو واقعی بازیابی و در سورس اصلی اضافه شدند؛ DataProvider در هر دو حالت متد `getCashFlowData` دارد؛ پنل در مسیر `fin-liquidity` نمایش داده می‌شود.
- فایل `cashFlowEngineV2.candidate.ts` صرفاً نامزد نسخه دوم است و به‌طور عمدی جایگزین موتور پنل نشده؛ API دو موتور ناسازگار است. Codex باید با تست تطبیقی و بررسی داده واقعی آن‌ها را ادغام کند.
- هشدار: snapshot در صورت پنهان‌بودن منابع ناقص است؛ هیچ تصمیم پرداختی با داده ناقص تأیید نمی‌شود.
- NOT VERIFIED: build، TypeScript، مرورگر، SQL Server واقعی، RBAC سمت سرور، صحت موجودی و جلوگیری از دوباره‌شماری چک/فاکتور، تمام فازهای ۵ و ۶.
- کار بعدی: اجرای تست‌های اختصاصی و رفع خطاها، اتصال نسخه نهایی موتور به SQL/API، بررسی ردیف‌های F6-01 تا F6-09؛ هیچ فازی کامل اعلام نشده است.

## ثبت اجرای ۱۴۰۵/۰۸/۲۸ — ادامه فاز ۳ (F3-09)
- **PASS (تست قرارداد ۵/۵):** هشت کامپوننت مشترک `SectionHeader`، `StatusChip`، `RankList`، `FilterChips`، `SegmentedTabs`، `ReportTimeline`، `ReportSkeleton`، `ReportEmptyState` در کیت موجود `src/components/charts/` اضافه شد؛ `SectionHeader` به `ReportsHub` متصل شد.
- **NOT VERIFIED:** TypeScript، رندر مرورگر، داده ERP، و یکپارچگی سایر مصرف‌کنندگان.
- **NOT IMPLEMENTED (کامل):** F3-09 هنوز شامل ویجت‌های باقیمانده و آزمون‌های بصری است؛ فاز ۲ و فاز ۳ کامل نشده‌اند. ردیف بعد: F3-09 و F3-10.

## ثبت اجرای ۱۴۰۵/۰۸/۲۹ — تکمیل T1 تا T10 (محافظ پاسخ کهنه، کلید فروشنده، پیش‌بینی واقعی، mutation رسمی، Endpoint P&L، Provider، آستانه‌های نسخه‌دار، تست‌های FAIL، حذف alert)

- **T1 PASS** (`tests/dataQueryRaceContracts.test.mjs` ۷/۷): `useDataQuery` با شمارنده درخواست + `mountedRef`؛ منطق خالص در `src/lib/dataQueryRace.ts`. API هوک بدون تغییر.
- **T2 PASS**: `resolveSellerKey` export از `receivableReports.ts`؛ سهم فروشندگان با UNASSIGNED → «فروشنده نامشخص»؛ حذف `as Task`.
- **T3 PASS**: پیش‌بینی پایان دوره از elapsed واقعی (تاریخ فاکتورها یا cutoff–asOf)؛ در غیر این صورت «نامشخص».
- **T4 PASS**: `handleCreateReportTask` از `generateId` + `enqueueOptimisticMutation`؛ بدون جهش مستقیم state و بدون `user-admin` ثابت.
- **T5 PASS** (`tests/ledgerPnlQueryContracts.test.mjs` ۵/۵): `PNL_ACCOUNT_PREFIXES` / `normalizeSqlPnlRows` / `buildLedgerPnlInputs` دو شکل؛ `server/ledgerPnlQuery.mjs` + `GET /api/v1/ledger/pnl`؛ Server Provider به Endpoint وصل شد. اتصال SQL زنده = NOT VERIFIED.
- **T6 PARTIAL**: متدهای `getZoneAssignments` و `getPaymentAllocations` به هر دو Provider اضافه شد. خواندن فقط-طول برای کلید ابطال کش مجاز ماند. مصرف‌کنندگان کامل آرایه (Geo/Finance allocations) هنوز در صف تبدیل تدریجی با `useDataQuery` هستند.
- **T7 PASS (کد)**: `isChurnThresholdsDefault` / `getChurnThresholdsMeta` / `DEFAULT_CHURN_THRESHOLDS` export؛ UI نسخه‌دار آستانه‌های ریزش در Settings با effectiveFrom و recordedBy. مسیر SQL/API end-to-end = NOT VERIFIED.
- **T8 NOT VERIFIED**: F0-03 ممیزی تاریخی کامل تکرار نشد (مطابق دستور قبلی)؛ یافته‌های بسته‌شده با شواهد T1–T7 در این ثبت آمده‌اند.
- **T9 PASS**: deepAuditRegressionContracts، domainIntegrationContracts، profitabilityTruthContracts، reportEngineUiContracts، workspaceRedesignContracts، erpDataQuality.test.mjs (۷/۷) پس از اصلاح ایمپورت `.ts` و قراردادهای کهنه.
- **T10 PASS**: `grep alert(` در `src` = صفر؛ Groups/Settings به toast منتقل شدند. `confirm()` دست نخورده.
- **NOT VERIFIED**: Build/tsc کامل، مرورگر، SQL Server زنده، تست‌های Manifest کامل.
- **ردیف بعدی قابل‌اجرا:** تکمیل F0-14 برای مصرف‌کنندگان باقی‌ماندهٔ state (Geo zones/assignments، paymentAllocations در Finance/Operations) از مسیر Provider؛ سپس F4-01 یکپارچگی تنظیمات نسخه‌دار با SQL.

## ثبت اجرای ۱۴۰۵/۰۸/۲۸ — F0-14 پنل کیفیت داده از مسیر DataProvider

- **PASS (تست اختصاصی `tests/dataQualityProviderContracts.test.mjs`، ۵ از ۵):** `DataQualityPanel` دیگر کل `state` را به موتور نمی‌دهد؛ داده از `provider.getStateSnapshot()` می‌آید و `src/lib/dataQualityInput.ts` ورودی ممیزی را می‌سازد. مجموعه‌های پنهان‌شده توسط Provider و حوزه‌های خارج از مجوز (مالی/مشتری) خالی می‌شوند و موتور آن‌ها را «ارزیابی‌نشده» اعلام می‌کند، نه «بدون مشکل». حالت بارگذاری و خطا (با «تلاش مجدد») افزوده شد؛ خطا هرگز به‌معنای تمیزبودن داده نیست.
- **باقی‌ماند:** `state` فقط برای `useCan` و کلید ابطال کش (طول مجموعه‌ها) خوانده می‌شود، نه به‌عنوان منبع داده.
- **FAIL پیش‌موجود (رفع نشد):** `tests/erpDataQuality.test.mjs` روی زیپ اصلی هم با ERR_MODULE_NOT_FOUND (`../lib/geoIntelligence` بدون پسوند در Node ساده) شکست می‌خورد؛ ناشی از این تغییر نیست و ادعاهای متنی پنل در آن (`state`، `auditErpDataQuality(`، `can('finance','VIEW')`، «ارزیابی‌نشده») همچنان برقرارند.
- **NOT VERIFIED:** Build/TypeScript، مرورگر، رفتار `getStateSnapshot` روی SQL Server واقعی با حجم بالای `journalLines` (در محیط نصب باید با Endpoint تجمیعی/صفحه‌بندی بررسی شود).
- **ردیف بعدی قابل‌اجرا:** F0-14 (کلیدهای شمارش در سایر Workspaceها) یا F0-12 (تنظیمات نسخه‌دار آستانه‌های ریزش).

## ثبت اجرای ۱۴۰۵/۰۸/۲۹ — F0-14 صداقت داده و حذف بینش ساختگی در ReportEnginePanels
- **PASS (کد + تست اختصاصی):** حذف کامل خواندن مستقیم state.coaMirror / state.journalLines از مسیر P&L در ReportEnginePanels؛ وابستگی useDataQuery P&L فقط به canSeeLedger، pnlFetchFrom، asOf (`coaCount` حذف شد). تست tests/reportPnlDataProviderContracts.test.mjs = ۵/۵ PASS.
- **PASS (صداقت UI):** بخش «بینش‌های راهبردی» که حاوی متن ثابت زون ساوه و کالای برنج طارم بود حذف و با پیام صریح «بینش فقط از قواعد/موتور واقعی (F6-08 / F9-18)» جایگزین شد؛ هیچ عدد یا توصیه ساختگی نمایش داده نمی‌شود.
- **PASS (UX):** جایگزینی alert() با toast در ReportEnginePanels (ثبت وظیفه)، QuotesWorkspace (نبود حساب)، AttachmentManager (حد حجم فایل).
- **NOT VERIFIED:** Build/TypeScript کامل، مرورگر، SQL/ERP زنده، سایر alert() در Settings/Groups، Endpoint تجمیعی /ledger/pnl.
- **F0-14 همچنان [~]:** مصرف‌کنندگان مستقیم State در موتور کیفیت داده (erpDataQuality) و برخی کلیدهای شمارش در سایر Workspaceها باقی است؛ گام بعد: ادامه F0-14 یا تکمیل مسیر تنظیمات نسخه‌دار F0-12/F4-01.
- **ردیف بعدی قابل‌اجرا:** F0-14 (مصرف‌کنندگان باقی‌مانده) یا F0-12 (تنظیمات نسخه‌دار آستانه‌های ریزش).
- **اصلاح هنگام اعمال پچ (۱۴۰۵/۰۸/۲۸):** پچ اصلی `const ledgerLineCount` را حذف کرده بود در حالی که کوئری مانده تفصیلی در همان کامپوننت هنوز از آن استفاده می‌کند (ReferenceError). تعریف `ledgerLineCount` فقط برای کوئری مانده نگه داشته شد؛ سایر بخش‌های پچ عیناً اعمال شد. `QuotesWorkspace` و `AttachmentManager` عیناً جایگزین شدند.
- **تست:** `reportPnlDataProviderContracts`، `productZoneHeatmap`، `geoMapControlsContracts`، `geoWorkspaceContracts` PASS (۱۲ از ۱۲). ۵ تست `deepAuditRegression`، `domainIntegration`، `profitabilityTruth`، `reportEngineUi`، `workspaceRedesign` هم روی زیپ اصلی v0.12.90 و هم پس از پچ FAIL هستند؛ پیش‌موجود و ناشی از پچ نیست و رفع نشده (FAIL ثبت می‌شود).

## ثبت ممیزی ۱۴۰۵/۰۸/۲۸ — تطبیق A.txt / B.txt / Ch.txt با سورس v0.12.90

- **تطبیق شد (بایت‌به‌بایت پس از نرمال‌سازی پایان خط):** `dataProvider.ts`، `ProfitLossWidget.tsx`، `TasksWorkspace.tsx`، `reportPnlDataProviderContracts.test.mjs`؛ `ReportEnginePanels.tsx` به‌جز یک مورد.
- **اصلاح در این نوبت:** وابستگی `state` در `useDataQuery` پنل P&L با `coaCount` جایگزین شد (مطابق A).
- **عمداً اعمال نشد:** `GeoIntelligenceWorkspace.tsx` نسخهٔ A (ناقص، ۲۴۶ خط) و بخش‌های معیوب نسخهٔ B (`queueGeoMutation` با entityType/entityId اشتباه و انتساب زون بدون نسخه‌بندی)؛ سورس نسخهٔ اصلاح‌شده را دارد. مدخل `geoAssignmentSyncContracts` در manifest از سورس حفظ شد.
- **اعمال‌نشده از Ch (کنترل):** Endpoint سبک `/ledger/pnl` و `server/ledgerPnlQuery.mjs`، `ledgerPnlView.ts`، هوک مشترک با محافظ پاسخ کهنه، حذف زون‌های هاردکد نقشهٔ حرارتی، تطبیق کلید فروشنده، جایگزینی `alert()`.
- **NOT VERIFIED:** Build/TypeScript، اجرای تست‌ها، SQL/ERP واقعی. گام بعد: F0-14.
- **F0-14 (ادامه، ۱۴۰۵/۰۸/۲۸) — PASS (تست اختصاصی `tests/productZoneHeatmap.test.mjs`، ۳ از ۳):** نقشهٔ حرارتی کالا×زون در `ReportEnginePanels` از زون‌های هاردکد و حدس شهر/آدرس به `src/lib/productZoneHeatmap.ts` منتقل شد؛ زون فقط از `geoZones` و انتساب فعال `zoneAssignments`، مشتریِ بدون انتساب در ستون «بدون زون»، سفارش لغوشده کنار گذاشته می‌شود و حالت خالی صریح دارد. **NOT VERIFIED:** Build/TypeScript و مرورگر.
- **Geo/نقشه (۱۴۰۵/۰۸/۲۸) — PASS (تست قراردادی `tests/geoMapControlsContracts.test.mjs`، ۳ از ۳) / NOT VERIFIED (مرورگر و GPS واقعی):** به `GeoZoneMapEditor` دکمهٔ «موقعیت من» (Geolocation با پیام رد دسترسی/عدم پشتیبانی و نشانگر روی نقشه) و «تمام‌صفحه» (خروج با Esc) اضافه شد؛ معماری کاشی XYZ حذف نشده و الگوی `{z}/{x}/{y}` با توضیح فارسی زیر «تنظیمات پیشرفتهٔ منبع نقشه» جمع شد.
- **باقی از Ch:** هوک مشترک با محافظ پاسخ کهنه، کلید فروشنده، `alert()`/دادهٔ هاردکد ساوه و طارم، Endpoint `/ledger/pnl`. ردیف بعد: F0-14.


## ثبت تکمیلی ۱۴۰۵/۰۸/۲۸ — بازبینی ادغام A/B و اصلاح محدود F0-14
- **PASS (کد و آزمون اختصاصی):** وابستگی واکنشی گزارش P&L به تغییر State بازگردانده شد بدون رجوع مستقیم به `state.coaMirror` برای محاسبه؛ `tests/reportPnlDataProviderContracts.test.mjs` = ۵ PASS.
- **PASS (قرارداد کد):** انتساب‌های مکانی فقط برای مشتریان جدید ایجاد و برای مشتریان خارج‌شده نسخه قبلی منقضی می‌شود؛ شناسه ثابت برای CREATE/UPDATE و payload کامل در صف ثبت می‌شود؛ `tests/geoAssignmentSyncContracts.test.mjs` = ۱ PASS، در Manifest ثبت شد.
- **NOT VERIFIED:** SQL Server/ERP زنده، اجرای end-to-end صف آفلاین، TypeScript/Build کامل و تست بصری؛ قرارداد تست Geo قدیمی در مسیر Landing با عنوان متفاوت شکست دارد و نیازمند بازبینی مستقل است. گزارش Ch شامل دستورها و خروجی‌های پیشنهادی عامل دیگر است؛ اجرای همه بخش‌های آن در این نوبت ادعا نمی‌شود.
- **F0-14 همچنان باز است:** اجرای عملیاتی و قرارداد کامل API/SQL و مصرف‌کنندگان باقیمانده تأیید نشده است. ردیف بعد: F0-14.

## ثبت اجرای ۱۴۰۵/۰۸/۲۷ — اعمال پچ ممیزی UX / Design System (AKHAVAN_CRM_UX_AUDIT_PATCH_F0_14)
- **اعمال‌شده (به درخواست صریح مالک):** `src/theme/colors.css` (کنتراست ثانویه/کم‌رنگ در روشن و تیره)، `ThemeProvider.tsx` (ثبت رویداد تغییر تم؛ `setThemePreference` با `useCallback` پایدار شد)، `Skeleton.tsx` (`ErrorState` دسترس‌پذیر با prop اختیاری `surface`)، `LoadingState.tsx`، `EmptyState.tsx` (prop اختیاری `surface` و ثبت رویداد)، `Button.tsx` (فقط توضیح)، `ui/index.ts` (export `ToastProvider`/`toast`)، فایل‌های جدید `src/components/ui/Toast.tsx` و `src/lib/analytics.ts`؛ `<ToastProvider />` یک‌بار در ریشهٔ `App.tsx` نصب شد. ساختار هدر/منو/توکن‌های رنگی دیگر دست‌نخورده است.
- **تطبیق برای عدم حذف قابلیت:** نسخهٔ پچ صادرات قدیمی `Skeleton`/`SkeletonProps`/`CardSkeleton` را از `EmptyState.tsx` و `export default LoadingState` را حذف می‌کرد؛ هر دو حفظ شدند (تست `phase01EmptyLoadingStateContracts` به آن‌ها وابسته است). `import { createRoot }` بلااستفادهٔ Toast حذف شد.
- **تغییر انتظار تست (به‌دلیل تغییر توکن مصوب مالک):** در `tests/designTokenMigrationContracts.test.mjs` مقدار `--c-ink-secondary` به `#334155` (روشن) و `#CBD5E1` (تیره) هماهنگ شد؛ بخش بررسی توکن‌ها پس از تغییر پاس می‌شود.
- **PASS:** `phase01EmptyLoadingStateContracts`، `paletteLockContracts`. **FAIL (قبلاً هم در سورس اصلی وجود داشت، مرتبط با پچ نیست):** `designTokenMigrationContracts` در بررسی `text-[Npx]` فایل `AuditWorkspace.tsx`.
- **تکمیل مرحلهٔ دوم (همان روز):** (۱) prop `surface` برای ۲۴ مصرف‌کنندهٔ `EmptyState` در ۱۶ فایل و `ErrorState` در `DataTable` پر شد. (۲) رویدادهای funnel: `page_view` (فقط دو بخش اول مسیر، بدون شناسهٔ رکورد) و `logout` در `App.tsx`، `login_success` در `LoginWorkspace`، `export` در `ExportMenuButton`، `command_palette` در `CommandPalette`. (۳) Lazy-loading مسیرها: ۲۳ Workspace با `React.lazy` و `Suspense` (Home/Login/Landing eager ماندند؛ JSX مسیرها بدون تغییر). (۴) تست جدید `tests/uxAuditPatchContracts.test.mjs` در Manifest ثبت شد.
- **PASS:** `uxAuditPatchContracts`، `phase01EmptyLoadingStateContracts`، `paletteLockContracts`، `moduleLandingContracts` (5/0)، `tourCoverageContracts` (9/0)، `compactUiContracts`. **بدون رگرسیون نسبت به سورس اصلی (نتیجهٔ یکسان با ZIP اولیه، شامل شکست‌های قبلی):** `auditLandingContracts` (۲ پاس/۱ شکست)، `plannedModulesContracts` (۲/۲)، `navigationHierarchyContracts`، `designTokenMigrationContracts` (`text-[Npx]` در AuditWorkspace).
- **BLOCKED / باقی:** Visual regression (Playwright) و axe در CI نیازمند نصب بسته/شبکه‌اند (طبق دستورالعمل اجرا نشد)؛ parity هدر موبایل/دسکتاپ به‌دلیل قفل طراحی بدون دستور صریح انجام نشد؛ رویدادهای `search_open`/`filter_apply`/`record_create` هنوز وصل نیستند. **NOT VERIFIED:** Build/TypeScript (به‌ویژه تایپ `lazy` و named exports)، مرورگر، اندازه‌گیری واقعی کنتراست WCAG.

## ثبت اجرای ۱۴۰۵/۰۸/۲۷ — F0-14 یکپارچگی تاریخ و صفحه‌بندی گردش سند
- **PASS (تست اختصاصی):** در `src/lib/receivableReconciliation.ts` فیلتر تاریخ دیگر ردیف فاقد تاریخ را به‌عنوان سند داخل بازه نمی‌پذیرد؛ صفحه‌بندی محلی مانند `server/ledgerJournalQuery.mjs` فقط اعداد صحیح امن با محدودهٔ صفحهٔ ۱..۱۰۰۰۰۰۰ و اندازهٔ ۱..۲۰۰ را می‌پذیرد. تست رگرسیون در `tests/ledgerProviderFilterParity.test.mjs` اضافه شد.
- **شواهد:** `node --experimental-strip-types --import ./scripts/register-ts-resolver.mjs --test tests/ledgerProviderFilterParity.test.mjs tests/detailSubsidiaryBalance.test.mjs tests/ledgerJournalQuery.test.mjs tests/ledgerBalanceProjection.test.mjs tests/subsidiaryBalancesPanel.test.mjs` = **۱۹ PASS / ۰ FAIL**.
- **NOT VERIFIED:** SQL Server واقعی، مرورگر، کامپایل TypeScript و اجرای کل تست‌ها. **F0-14 همچنان باز است:** مصرف‌کنندگان مستقیم State و هم‌ارزی کامل منبع داده باید جداگانه بررسی شوند. گام بعد: F0-14 بررسی مصرف‌کنندگان مستقیم State، سپس F0-12/F4-01.

## ثبت اجرای ۱۴۰۵/۰۸/۲۷ — F0-14 یکپارچگی فیلتر گردش سند
- **PASS (سورس + تست اختصاصی):** `src/services/dataProvider.ts` از serializer مشترک `src/lib/ledgerQueryParams.mjs` استفاده می‌کند تا `unmapped=false` در درخواست HTTP حذف نشود؛ `src/lib/receivableReconciliation.ts` نیز برای `unmapped=false` فقط سطرهای دارای کد معین را نگه می‌دارد و برای `true` فقط فاقد کد را. تست جدید `tests/ledgerProviderFilterParity.test.mjs` در Manifest ثبت شد.
- **شواهد اجرا:** `node --test tests/ledgerProviderFilterParity.test.mjs tests/ledgerJournalQuery.test.mjs tests/ledgerBalanceProjection.test.mjs` = **۸ PASS / ۰ FAIL**؛ `node --check server/index.mjs` و `node --check src/lib/ledgerQueryParams.mjs` = PASS. وجود فایل‌های اصلاح‌شده در ZIP خروجی جداگانه کنترل شد.
- **NOT VERIFIED:** SQL Server واقعی، RBAC/RLS انتهابه‌انتها، اجرای برنامه در مرورگر، Build/TypeScript کامل. `F0-14` همچنان باز است؛ ادامه: شناسایی و اصلاح مصرف‌کنندگان مستقیم State با اولویت موارد مالی و قراردادهای refresh؛ سپس `F0-12/F4-01` تنظیمات نسخه‌دار.

## ثبت اجرای ۱۴۰۵/۰۸/۲۷ — F0-14 گردش سند (ادامه)
- **PASS — پیاده‌سازی در سورس:** مسیر `GET /api/v1/ledger/journal-lines` در `server/index.mjs` اضافه شد و از `crm.JournalLineMirror` و `crm.JournalEntryMirror` و `crm.JournalStatusMap` و `crm.FiscalPeriod` می‌خواند. احراز هویت و `finance.VIEW`، TenantContext/RLS، فیلترهای پارامتری، سند شماره‌دار غیرابطالی و وضعیت `IncludeInBalance=1`، صفحه‌بندی قطعی و شمارش کل رعایت شده‌اند؛ هیچ fallback محلی وجود ندارد. فایل جدید `server/ledgerJournalQuery.mjs` ورودی‌ها را اعتبارسنجی می‌کند. مصرف‌کننده `HttpBackendDataProvider.getJournalLines` از قبل همین مسیر را فراخوانی می‌کند و تغییر نداشت.
- **PASS — شواهد تست:** `node --check server/index.mjs` و `node --check server/ledgerJournalQuery.mjs` موفق؛ `node --test tests/ledgerJournalQuery.test.mjs` برابر ۳ PASS / ۰ FAIL؛ Manifest شامل تست جدید شد.
- **NOT VERIFIED:** اتصال SQL واقعی، رفتار HTTP/RBAC/RLS انتهابه‌انتها، سازگاری عملی داده‌های ERP، کامپایل TypeScript و اجرای تمام تست‌ها. این موارد PASS اعلام نمی‌شوند.
- **باقی در F0-14:** بررسی سایر مصرف‌کنندگان مستقیم State و تست واقعی Provider/API/SQL؛ تکمیل F0-12 تنظیمات نسخه‌دار با F4-01. ردیف F0-14 همچنان `[~]` است.

# چک‌لیست واحد وضعیت AKHAVAN CRM

**قاعده:** تنها مرجع وضعیت و گام بعد. `[x]` = انجام + آزمون/شاهد ثبت‌شده؛ `[~]` = بخشی؛ `[ ]` = باز یا آزمون‌نشده؛ `[B]` = مسدود با علت. فقط پس از پیاده‌سازی **و** تست واقعی روی سورس تیک بزن؛ وجود فایل/متن قبلی شاهد نیست.
**روش:** ممیزی پایه فقط یک‌بار برای هر نسخه؛ سپس ممیزی محدود به ردیف جاری و وابستگی‌هایش. هر قابلیت به‌صورت Vertical Slice تا تکمیل UI+Provider/API+SQL+تست+مستندات بسته شود؛ فایل نیمه‌تمام تحویل نشود. SQL Server منبع داده عملیاتی است و fallback به داده محلی ممنوع. پس از تست واقعی `[x]` با شاهد؛ در پایان ZIP معتبر. شرح هر مورد: `docs/MASTER_SPEC_FA.md`.
**ترتیب فازها وابستگی را رعایت می‌کند:** هویت و تعاریف پایه (فاز ۲) پیش از Landing و ماژول‌های عملیاتی است، چون حوزهٔ دید همهٔ گزارش‌ها به آن وابسته است.
**خط پایه اندازه‌گیری‌شده:** `node scripts/run-tests.mjs` = ۱۰۳ PASS / ۷ FAIL / ۰ خارج از Manifest (قبل و بعد از پاک‌سازی اسناد یکسان). هفت شکست فقط نبود وابستگی (`jalaali-js`×۵: mention، churn، payroll، hrIntegration، taxAndPaya؛ `zustand`: dataProviderParity؛ `react`: useDocumentAutoFillAndSync). Build/tsc: BLOCKED (`vite` نصب نیست). نسخه تاریخی آزمون: v0.12.62؛ نسخه سورس ورودی این نوبت: v0.12.90. آزمون‌های این نوبت فقط قرارداد مستندات هستند.

## ثبت اجرای ۱۴۰۵/۰۸/۲۷ — ادامه F0-14 (اتصال مانده دفتری به SQL)
- **F0-14 / F10-02b — PASS (تست واحد و بررسی نحو) / NOT VERIFIED (اتصال SQL واقعی):** مسیر خواندنی `GET /api/v1/ledger/balances` به `server/index.mjs` افزوده شد؛ احراز هویت، مجوز `finance.VIEW`، محدوده مستأجر، فیلتر تفصیلی پارامتری و گروه‌بندی مستقل تفصیلی×معین×دوره بر اساس View موجود Migration 027 دارد. هیچ fallback محلی یا داده نمایشی ندارد. `server/ledgerBalances.mjs` پاسخ را به قرارداد موجود `DataProvider.getDetailSubsidiaryBalances` تبدیل می‌کند و نگاشت‌نشده را مشخص می‌کند. تست `tests/ledgerBalanceProjection.test.mjs`: **۲ PASS / ۰ FAIL**؛ `node --check` روی هر دو فایل سرور: **PASS**؛ Manifest به‌روز شد. **NOT VERIFIED:** اجرای واقعی SQL Server، RLS، HTTP/RBAC انتهابه‌انتها و کامپایل TypeScript. **باقی:** `GET /api/v1/ledger/journal-lines`، مصرف‌کنندگان مستقیم State، قرارداد تنظیمات نسخه‌دار F0-12/F4-01. F0-14 همچنان `[~]` است.
- **ردیف بعدی قابل‌اجرا:** `F0-14` — تکمیل گردش سند از SQL با فیلتر/صفحه‌بندی و تست؛ سپس F0-12 تنظیمات نسخه‌دار و F0-03 تطبیق موردی.

## ثبت اجرای ۱۴۰۵/۰۸/۲۷ — ادامه توسعه بر پایه ZIP Landing/Tour fixed
- **F0-03 — NOT VERIFIED:** سندهای `BOOTSTRAP.md` و `docs/AI_EXECUTION/{README.md,MASTER_EXECUTION_SPEC_FA.md}` در ZIP موجود نیستند؛ طبق `INSTRUCTIONS.md` همین سورس، پنج سند اصلی مرجع‌اند. ممیزی کامل تاریخی تکرار نشد؛ تطبیق همه یافته‌های `customer_sync` همچنان باز است.
- **F0-12 — PASS (آزمون‌های محلی) / NOT VERIFIED (یکپارچگی عملیاتی):** تست قدیمی `tests/churnPredictionService.test.mjs` به‌جای Quote از فاکتور معتبر تاریخ‌دار استفاده می‌کند؛ چهار آزمون PASS. `src/lib/metricConfig.ts` اصلاح شد تا `null`/رشته خالی به صفر تبدیل نشود و مرزهای نامعتبر aging پذیرفته نشوند. تست `tests/churnErpInvoiceSource.test.mjs` با assertion جدید برای تنظیمات نامعتبر PASS. کد تولیدی بدون تغییر طراحی هدر/منو؛ هیچ داده عملیاتی ساختگی اضافه نشد. **F0-12 همچنان `[~]` است:** مسیر تنظیمات نسخه‌دار SQL و تست ERP زنده، API/Provider end-to-end و F4-01 کامل نیست.
- **F0-14 — NOT VERIFIED:** پس از F0-12 ردیف وابستهٔ بعدی؛ Endpointهای `/ledger/*` و مصرف‌کنندگان مستقیم State همچنان نیازمند بررسی و پیاده‌سازی هستند.
- **تست‌های واقعاً اجراشده:** `node --experimental-strip-types --import ./scripts/register-ts-resolver.mjs --test tests/churnPredictionService.test.mjs` = ۴ PASS/۰ FAIL؛ `node --experimental-strip-types --import ./scripts/register-ts-resolver.mjs tests/churnErpInvoiceSource.test.mjs` = PASS. Build/tsc/کل Manifest/SQL Server/ERP: NOT VERIFIED (طبق منع اجرای غیرضروری).
- **گام بعد:** F0-12 تکمیل مسیر تنظیمات نسخه‌دار از Provider/API/SQL با بررسی F4-01؛ سپس F0-14. F0-03 صرفاً به اندازه شواهد موجود ادامه یابد.

## وضعیت جاری
- نسخه سورس مبنا: `v0.12.90`؛ ممیزی فنی تاریخی نسخه `v0.12.62` است و هنوز برای نسخه جدید تکرار نشده.
- ثبت نوبت ۱۴۰۵/۰۸/۲۶ — الحاقیهٔ اجرایی A9: سه قانون عدم تخریب/تکمیل Vertical Slice، منبع عملیاتی SQL Server بدون fallback محلی، و قفل UI با Landing آیکون‌محور و + زمینه‌ای در INSTRUCTIONS/CONSTITUTION/MASTER_SPEC درج شد؛ F1-04 و F3-06 دقیق شدند. این نوبت مستندسازی است؛ هیچ ردیف پیاده‌سازی تیک نخورد. تست‌های documentationSetContracts و analyticsConstitutionContracts (۴/۴) PASS؛ Build/TS/SQL/ERP/تست بصری اجرا نشدند و NOT VERIFIED باقی‌اند.
- فاز فعلی: ۰ (حقیقت پایه) با ادامهٔ ۲/۳؛ شمار ردیف‌های شناسه‌دار: [x]=9، [~]=37، [ ]=167، [B]=1.
- نوبت جاری (۱۴۰۵/۰۸/۲۶، ادامه): F0-15 [~] — Migration ۰۲۷ (دوره مالی، نگاشت وضعیت سند، ابعاد ردیف، View مانده تفصیلی×معین×دوره)؛ تست ایستا PASS؛ SQL Server NOT VERIFIED. پیش‌تر: F0-16 [~] — مانده هر فاکتور واقعاً LIFO از مانده دفتری (`estimateInvoiceRemaining`)؛ Drill-down، مانده قابل پرداخت سفارش، `collectionEngine`، Geo، گزارش‌های سنی/میانگین/خارج از مهلت/به‌تفکیک فروشنده (`receivableReports.ts` + `ReceivablesLifoPanel`) و مالیات به‌تفکیک کالا (`taxRate.ts`) انجام شد. ETL ورود `taxRatePercent` کالا (موجودیت `PRODUCT`) انجام شد. مانده: ستون مالیات در صفحهٔ «تعاریف پایه» (F2-02)، شکستن بقیهٔ بخش‌های `ReportEnginePanels` به فایل‌های ریز.
- نوبت قبل: F0-11 بسته شد (وصل `NotificationCenter` و `notifyAndPush`؛ تعیین تکلیف ۱۶ فایل).
- تست‌های اجراشده: fiscalPeriodBalanceViewSql (جدید)، chartOfAccountsDetailGroupsSql، sqlSchemaContracts = PASS؛ قبلی: productTaxEtl، erpImportService، etlPipelineContracts، invoiceLifoRemaining = PASS؛ قبلی: reportReceivablesLedgerOnly، ledgerReceivablesSummary، crossModuleConsistencyContracts، reportEngineUiContracts = PASS.
- **FAIL از پیش موجود (نه ناشی از این نوبت؛ روی ZIP اصلی هم رخ می‌دهد):** `tests/tourCoverageContracts` — «route /audit has no tour module»؛ خط پایه ۱۰۳/۷ بالا دقیق نیست؛ رفع با F1-05 (به‌روزرسانی تور).
- BLOCKED/NOT VERIFIED: نصب وابستگی (`jalaali-js` و…)، build/tsc، SQL Server/ERP زنده، بازبینی بصری.
- قاعدهٔ مالک: مانده فقط از گردش مالی (بدهکار−بستانکار)؛ `financialIntelligence` اصلاح شد؛ مصرف‌کنندگان فاکتوری دیگر در F0-16.
- قاعدهٔ مالک (۱۴۰۵/۰۸/۲۶): CRM یک سیستم کمکیار هوشمند است؛ فقط داده لازم برای گزارش‌گیری (سود و زیان، ترازنامه، تحلیل هزینه، خطایابی اسناد) منتقل می‌شود. مانده فقط دفتری از اسناد قطعی؛ بدون مانده کلی؛ از خزانه‌داری فقط چک‌ها. **اولویت اصلی محصول (۱۴۰۵/۰۸/۲۶):** خطایابی و پایش — تخفیف نقد و اضافه‌فاکتور (فاکتورهایی با تخفیف نقد بیش از حد)، اسناد اشتباه کاربران، الگوهای مشکوک به تقلب، خلأهای شرکت و پیشنهاد بهبود. صاحب‌ردیف‌ها: F2-20، F6-08، F12-23. **شکاف داده:** فقط `InvoiceLineMirror.DiscountAmount` (سطح ردیف) موجود است؛ تخفیف نقد و اضافه‌فاکتور سطح سرفاکتور در Schema نیست و با Data Dictionary ERP و Migration افزایشی جدید (فقط همین فیلدها) اضافه می‌شود؛ هر آستانه/قاعده از کاتالوگ F2-20 می‌آید نه هاردکد.
- تصمیم مالک (۱۴۰۵/۰۸/۲۶): آموزش و آزمون پرسنل، جذب و استخدام، پلکان رشد، صندوق و بودجه‌ریزی، پیش‌بینی/توان پرداخت و درخواست خرید **حفظ می‌شوند** (فریز/حذف نمی‌شوند). فهرست کامل برای بازبینی مالک تحویل شد؛ هر ردیفی که مالک بگوید حذف می‌شود.
- گام بعدی: F0-03 (تطبیق یافته‌های ممیزی)، F0-12 (منبع ریزش)، سپس F0-14؛ بقیهٔ F0-16 (شکستن `ReportEnginePanels` + ستون مالیات در F2-02) و F0-15 (ETL/DataProvider/UI).

## فاز ۰ — حقیقت پایه و پاک‌سازی
- [x] F0-01 اسناد یکپارچه به پنج سند دستی (`INSTRUCTIONS.md`، سند جامع، چک‌لیست، قانون اساسی، سیستم طراحی) + سند تولیدی KPI؛ همهٔ فایل‌های MD قبلی (AGENTS، BOOTSTRAP، VERSION، docs/AI_EXECUTION/*، معماری، موجودی/ناوبری، فرمول‌ها، ETL، ممیزی فارسی‌سازی، مهارت `.agents`، `formulaSources.md`) ادغام و حذف شدند. شاهد: `documentationSetContracts`، `paletteLockContracts`، `analyticsConstitutionContracts`، `designLockContracts`، `persianLocalizationContracts`، `reportAnalyticsContracts` PASS؛ کل مجموعه ۱۰۳ PASS / ۷ FAIL (همان ۷ شکست وابستگی). یادداشت: کامنت Migration 017 هنوز به مسیر قدیمی ETL اشاره می‌کند و عمداً دست نخورد (Migration تغییر نمی‌کند)؛ مرجع جدید = سند جامع پیوست ب
- [~] F0-02 نصب وابستگی و Build موفق؛ تست جامع و TypeScript هنوز خطا دارند. نتیجه و شمارش فعلی در ثبت اجرای ۲۰۲۶-۱۱-۱۹ آمده است.
- [B] F0-03 تطبیق همه یافته‌های ممیزی (نسخه customer_sync) روی همین سورس؛ گزارش یا ZIP مبنای یافته‌ها در Git موجود نیست. هر مورد پس از دریافت مرجع با شاهد تأیید یا رد شود.
- [x] F0-04 دو `StateSyncEngine` هم‌زمان (`App.tsx`, `stateSyncRuntime.ts`, `dataSyncController.ts`) به یکی. — شاهد: tests/singleSyncEngine PASS؛ tests/sqlFirstStateLayer PASS (۱۰/۱۰)؛ tests/customerSyncExperienceContracts PASS؛ مالک یگانه = `dataSyncController` (`getEngine()` + رویداد focus)، `stateSyncRuntime` نمای نازک، `App.tsx` یک راه‌اندازی؛ ۱۴۰۵/۰۸/۲۵
- [x] F0-05 مانده بدهی فهرست مشتری با کنترل مجوز مالی (`CustomersWorkspace`). — شاهد: tests/customerListBalancePermission PASS؛ rbac، rbacScopeContracts، customerSyncExperienceContracts PASS؛ `canSeeBalance = can('finance','VIEW')` هم محاسبه و هم نمایش را گارد می‌کند؛ **اصلاح به دستور مالک:** مانده = Σ بدهکار − Σ بستانکار سطرهای سند هر مشتری (`computeCustomerLedgerBalances` در `receivableReconciliation.ts`؛ مثبت=بدهکار، منفی=بستانکار، بدون سطر=«مانده نامشخص»؛ سند باطل/پیش‌نویس حذف)؛ assertion قدیمی `invoice.balance` در customerSyncExperienceContracts به قرارداد جدید تبدیل شد؛ شاهد افزوده: receivableReconciliation، receivableCredits، receivableSingleSourceContracts PASS؛ **نیاز بعدی (F2):** اتصال سطر سند به مشتری فعلاً با `accountId`؛ با کد تفصیلی در فاز ۲ تکمیل شود؛ ۱۴۰۵/۰۸/۲۵؛ نکته: این فقط گارد UI است و جایگزین مجوز API/RLS نیست (قانون اساسی G)؛
- [x] F0-06 OCR فقط فرم را پر کند؛ ثبت از فرم؛ `targetAction` استفاده شود؛ جهت چک از فرم (نه ثابت RECEIVABLE) (`GlobalFloatingIntakeDrawer`). — انجام‌شده: `resolveIntakeCommit` (`documentCapture.ts`) تضمین می‌کند ثبت مستقیم و ارسال به فرم هرگز هم‌زمان نباشند (پایان ثبت مضاعف)؛ `targetAction` با انتخابگر واقعی فعال شد؛ جهت چک از انتخاب کاربر (بدون پیش‌فرض، تا انتخاب مسدود)؛ شاهد: tests/intakeCommitRouting PASS، documentCaptureContracts PASS (۱۱/۱۱)؛ useDocumentAutoFillAndSync = BLOCKED (نبود پکیج react)؛ تکمیل ۱۴۰۵/۰۸/۲۵: `Layout` اکنون مقادیر استخراج‌شده را با state ناوبری (`intakePrefill`) به `/finance?tab=payments|invoices` می‌برد؛ `FinanceWorkspace` آن را یک‌بار مصرف و فرم دریافت/چک را از طریق `buildPaymentFormPrefill` (`documentCapture.ts`، منبع یگانهٔ پیش‌پر؛ مقدار نامعلوم = رشتهٔ خالی، جهت چک فقط از انتخاب کاربر) پیش‌پر می‌کند؛ ایمپورت گمشدهٔ `DOCUMENT_TYPE_LABELS`/`CapturedDocumentType` در `FinanceWorkspace` اصلاح شد. شاهد: tests/intakePrefillBridge PASS، intakeCommitRouting PASS، documentCaptureContracts PASS (۱۱/۱۱)؛ NOT VERIFIED: رفتار بصری/مرورگر و tsc (طبق دستور اجرا نشد)؛ انواع هزینه/شناسنامه‌ی پرسنل هنوز فقط ناوبری‌اند (فرم مصرف‌کننده ندارند—با ردیف‌های فاز ۶/۸).
- [~] F0-14 ممیزی «State به‌عنوان منبع داده» و عبور همهٔ دسترسی‌ها از `DataProvider` (قانون اساسی §D): فهرست کامپوننت/موتورهایی که مستقیم از `state`/Store/آرایهٔ ثابت داده اصلی می‌خوانند (نمونهٔ شناخته‌شده: `executePayrollRun(state…)` و `OnboardingAdminWorkspace`)؛ تعریف قرارداد Provider برای گردش مالی و مانده (`getLedgerMovements`، `getBalances(تفصیلی، معین، دوره)`) و وضعیت اتصال؛ تست Refresh/ثبت-ویرایش-حذف از مسیر Provider. شاهد ممیزی اولیه: `dataProvider.ts` دو پیاده‌سازی `ClientStorageDataProvider` و `HttpBackendDataProvider` دارد و انتخاب با `VITE_DATA_PROVIDER`؛ رابط `DataProvider` هنوز API گردش/مانده ندارد. — **انجام‌شده (۱۴۰۵/۰۸/۲۵):** قرارداد `DataProvider.getJournalLines(filter, pagination)` و `getDetailSubsidiaryBalances({detailKey, byPeriod})` در هر دو Provider؛ منطق مشترک و تست‌پذیر `queryJournalLines`/`buildDetailBalancesResult` در `receivableReconciliation.ts`؛ وضعیت نتیجه `LIVE/EMPTY/UNAVAILABLE` با `source`؛ در `HttpBackendDataProvider` برای این دو متد **fallback به داده محلی وجود ندارد** (خطا ⇒ UNAVAILABLE). شاهد: tests/detailSubsidiaryBalance PASS (۹/۹)؛ customerListBalancePermission، receivableSingleSourceContracts PASS. **یافته‌های ممیزی (مانده):** (۱) `HttpBackendDataProvider` در `getAccounts/getAccountById/...` هنوز هنگام خالی‌بودن/خطا به `ClientStorageDataProvider` برمی‌گردد ⇒ منبع داده پنهان عوض می‌شود؛ باید با وضعیت منبع شفاف شود؛ (۲) `ClientStorageDataProvider.executePayrollRun` فقط رکورد با جمع‌های ۰ و وضعیت COMPLETED می‌سازد (نه محاسبهٔ واقعی)؛ (۳) `CustomersWorkspace` هنوز `state.journalLines` را مستقیم می‌خواند و باید به `getDetailSubsidiaryBalances` وصل شود؛ (۴) `AppState.journalLines` در `types.ts` تایپ ندارد؛ (۵) Endpointهای سرور `/ledger/journal-lines` و `/ledger/balances` هنوز نیستند (F10-02b). — **به‌روز ۱۴۰۵/۰۸/۲۵:** مورد (۳) رفع شد: `CustomersWorkspace` مانده را از `getDetailSubsidiaryBalances` (useDataQuery) می‌گیرد؛ مورد (۱) و (۲) رفع شد (۱۴۰۵/۰۸/۲۵، نوبت بعد): `HttpBackendDataProvider.getAccounts/getAccountById` بدون fallback محلی (خالی = خالیِ واقعی؛ خطا پرتاب می‌شود)؛ `ClientStorageDataProvider.executePayrollRun` با موتور واقعی (`payrollEngine`) محاسبه و فیش/مساعده را ثبت می‌کند، idempotent است و بدون حقوق ثبت‌شده خطای `PAYROLL_NO_ELIGIBLE_EMPLOYEES` می‌دهد (نه جمع صفر COMPLETED). شاهد: tests/providerHonestyAndPayroll PASS (۳/۳؛ بخش زنده با stub موقت `zustand`/`jalaali-js` خارج از ZIP)، dataProviderParityContracts، payrollNoHardcodes، detailSubsidiaryBalance PASS. **به‌روز (نوبت بعد):** (۳) رفع شد: `OnboardingAdminWorkspace.handleExecutePayroll` اکنون فقط از `PayrollRepository.runPayroll` استفاده می‌کند (شمار ردشده‌ها = کاربران فعال − `run.totalEmployees`)؛ (۴) رفع شد: `AppState.journalLines` تایپ شد. **مانده:** (۵) Endpointهای سرور `/ledger/*` (F10-02b)؛ بررسی بقیهٔ مصرف‌کنندگان مستقیم `state`؛ تایید tsc (NOT VERIFIED، اجرا نشد).
- [~] F0-15 مدل داده مانده تفکیکی (Migration افزایشی ۰۲۶ پس از ممیزی ۰۱۷/۰۲۲): موجود = `crm.LedgerAccount`، `crm.JournalEntryMirror`، `crm.JournalLineMirror` (ExternalAccountCode، ExternalDetailCode، بدهکار/بستانکار)، `integration.CodeMapping`، `LedgerAccountSourceMap`. **کمبود شناسایی‌شده:** ستون/جدول دوره مالی و وضعیت سند، ابعاد تکمیلی، ارتباط تفصیلی↔معین صریح، View/Procedure مانده به‌ازای (تفصیلی، معین، دوره) و جمع تفصیلی از همان؛ فقط کمبود واقعی اضافه شود. تست: مانده مستقل دو معین یک تفصیلی (با Seed فقط در تست). — **انجام‌شده (۱۴۰۵/۰۸/۲۵):** Migration `026_chart_of_accounts_detail_groups.sql`: آینهٔ کدینگ گروه حساب/کل/معین با گسترش همان `crm.LedgerAccountSourceMap` (ستون‌های `ExternalLevelCode`، `ExternalParentCode`، `ExternalNatureCode`، `IsActive`، `SyncedAtUtc`)؛ جدول‌های جدید `crm.DetailGroup` (گروه تفصیلی: مشتریان/تأمین‌کنندگان/پرسنل/مراکز هزینه/جاری شرکا/بانک‌ها/سایر؛ فقط دسته‌بندی و بدون ارتباط با اسناد)، `crm.DetailAccount` (کد تفصیلی ERP + گروه + نگاشت به `crm.Account`)، `crm.DetailSubsidiaryLink` (چندبه‌چند تفصیلی↔معین)؛ ستون `JournalLineMirror.DetailAccountId`؛ RLS؛ بدون Seed. شاهد: tests/chartOfAccountsDetailGroupsSql PASS (۶/۶، ایستا)؛ tests/sqlSchemaContracts PASS (۲۶ Migration، ۸۷ جدول، ۲۰۲ FK). **اجرای واقعی روی SQL Server: NOT VERIFIED.** **مانده:** دوره مالی و وضعیت سند، ابعاد تکمیلی، View/Procedure مانده به‌ازای (تفصیلی، معین، دوره) و جمع تفصیلی؛ ETL پرکردن این جدول‌ها از ERP (F10-03)؛ قرارداد DataProvider (F0-14)؛ ماژول/صفحهٔ مدیریت (F2-07). — **انجام‌شده (۱۴۰۵/۰۸/۲۶):** Migration `027_fiscal_period_doc_status_balance_view.sql` (افزایشی/idempotent): `crm.FiscalPeriod` (دوره مالی ERP با وضعیت OPEN/CLOSED/LOCKED/UNKNOWN)، `crm.JournalStatusMap` (نگاشت صریح وضعیت سند ERP ← وضعیت نرمال + `IncludeInBalance`؛ وضعیت بدون نگاشت وارد مانده نمی‌شود و در `UnmappedStatusLineCount` شمرده می‌شود)، `crm.JournalLineDimension` (ابعاد تکمیلی ردیف: مرکز هزینه/پروژه/شعبه…)، ستون‌های `JournalEntryMirror.FiscalPeriodId/ExternalPeriodCode`، RLS؛ View `analytics.vw_DetailSubsidiaryBalance` (مانده مستقل هر تفصیلی×معین×دوره = Σبدهکار−Σبستانکار؛ سند باطل کنار؛ دورهٔ نامشخص = NULL) و `analytics.vw_DetailBalanceTotal` (فقط تجمیع همان View تفکیکی + `SubsidiaryCount`). شاهد: tests/fiscalPeriodBalanceViewSql PASS (۷/۷، ایستا؛ جدید، در Manifest)؛ chartOfAccountsDetailGroupsSql PASS (۶/۶)؛ sqlSchemaContracts PASS (۲۷ Migration، ۹۰ جدول، ۲۰۷ FK). **اجرای واقعی روی SQL Server: NOT VERIFIED.** **مانده (به‌روز):** ETL پرکردن این جدول‌ها از ERP (F10-03؛ نگاشت ستون‌های منبع نیازمند Data Dictionary)، اتصال `getDetailSubsidiaryBalances({byPeriod})` در DataProvider سرور به View (F0-14)، صفحهٔ مدیریت نگاشت وضعیت/دوره (F2-07)؛ جدول «بالانس آزمایشی» ندارد. — **تصمیم مالک (۱۴۰۵/۰۸/۲۶، اصلاح‌شده):** هدف انتقال داده فقط گزارش‌گیری است: سود و زیان، ترازنامه، تحلیل هزینه‌ها و خطایابی اسناد حسابداری. فقط اسناد حسابداری قطعی (دارای شماره سند) منتقل می‌شود؛ همان `JournalEntryMirror/JournalLineMirror` و View دفتری ۰۲۷ کافی است. «مانده کلی» و آینهٔ اسناد غیرقطعی بازرگانی/خزانه‌داری **ساخته نمی‌شود** (Migration ۰۲۸ لغو). از خزانه‌داری فقط چک‌های دریافتی و پرداختی ارزش دارند؛ حواله‌های بانکی و بقیه منتقل نمی‌شوند. **مانده:** فقط فهرست مقادیر وضعیت/شماره سند ERP برای `JournalStatusMap`؛ و (در صورت تأیید مالک) آینهٔ چک‌ها در ردیف جداگانه.
- [~] F0-07 ثبت مشتری محلی یکپارچه با مسیر پیشنهاد مشتری ERP (`CustomersWorkspace`, `server/index.mjs`). — انجام‌شده (۱۴۰۵/۰۸/۲۵): ثبت محلی اکنون صریحاً «پیش‌نویس» است (`erpProposalStatus=LOCAL_DRAFT`، نشان «پیش‌نویس» در فهرست، متن اعلان/ممیزی بدون ادعای ساخت مشتری رسمی)؛ تطبیق تکراری پیش از ثبت (`matchExistingCustomers` در `enterprise.ts`: کد ملی/اقتصادی = مسدود، تلفن/نام = هشدار)؛ قرارداد پیشنهاد کلاینت مطابق سرور (`src/lib/customerProposal.ts`: بدنه، کلید تکرارناپذیر، وضعیت). شاهد: tests/customerProposalContract PASS، backendSecurityContracts، customerListBalancePermission، customerSyncExperienceContracts، b15_b18_truth_contracts، compactUiContracts PASS. **چه مانده:** ارسال واقعی پیشنهاد از `CustomersWorkspace` از مسیر `DataProvider.createAccount` (+ نگهداری پاسخ `WAITING_FOR_ERP_REVIEW` و به‌روزرسانی وضعیت به `PENDING_ERP_REVIEW`) — نیازمند سرور با `ACCOUNTS_SOURCE=typed` و SQL؛ **BLOCKED/NOT VERIFIED** (محیط بدون سرور/SQL)؛ مسیر پیش‌فرض `entity` هنوز رکورد را در صف همگام‌سازی عمومی می‌برد (ممیزی A1).
- [x] F0-08 وضعیت گزارش API: اجرای Query واقعی یا UNAVAILABLE؛ نه READY/isAuthoritative ثابت (`server/index.mjs`). — شاهد: tests/reportStatusHonesty PASS (UNAVAILABLE بدون SQL/با خطا بدون نشت پیام، EMPTY/PARTIAL/READY از شمارش واقعی جدول‌های آینه)؛ `node --check server/index.mjs` سالم؛ فایل‌ها: `server/reportStatus.mjs` (جدید)، `server/index.mjs`؛ ۱۴۰۵/۰۸/۲۵؛ **توجه (NOT VERIFIED):** Query روی SQL Server واقعی اجرا نشد (SQL در دسترس نیست)؛ endpoint هنوز ردیف داده‌ی گزارش برنمی‌گرداند (`reportDataAvailable:false`) تا ویوهای گزارش در فاز ۱۰ وصل شوند؛
- [x] F0-09 حذف اعداد نمونه `ProfitLossWidget`؛ اتصال `ledgerPnl` یا Empty State. — شاهد: tests/profitLossWidgetLedger PASS؛ reportEngineUiContracts/analyticsReportIntegration/reportsDashboardStyleContracts PASS؛ فایل‌ها: `src/lib/ledgerPnl.ts` (`buildLedgerPnlInputs`، `pnlSeriesByJalali`)، `ProfitLossWidget.tsx`، `ReportEnginePanels.tsx` (استفادهٔ مجدد از سازندهٔ ورودی)؛ نکته: فروش خالص تا ثبت «برگشت از فروش» NULL است (سیاست موجود موتور)؛ ۱۴۰۵/۰۸/۲۵
- [x] F0-10 حذف هاردکدهای حقوق/شبیه‌ساز: هدف ۵۰۰M، حقوق ۲۰۰M، انطباق ۸۲٪، جریمه ۳٪ ← تنظیم سازمان یا NULL. — شاهد: tests/payrollNoHardcodes PASS (۳/۳)، payrollEngineContracts PASS (۵/۵)، hrIntegrationContracts PASS (۳/۳) — با stub موقت `jalaali-js` در کپی خارج از ZIP (وابستگی نامرتبط نصب نیست)؛ فایل‌ها: `src/services/payrollEngine.ts` (حقوق/هدف/اضافه‌کاری/مأموریت/مزایا ۰ یا رد کاربر در نبود داده؛ `skippedUserIds`؛ شبیه‌ساز با `basePenaltyRatePercent` و `complianceByUserId` و `unavailableReason`)، `OnboardingAdminWorkspace.tsx` (Empty State؛ انطباق از آخرین ارزیابی واقعی)، `tests/payrollNoHardcodes.test.mjs`، manifest؛ ۱۴۰۵/۰۸/۲۵. **مانده:** نرخ پایهٔ جریمه هنوز منبع تنظیم ندارد (NULL ⇒ شبیه‌ساز UNAVAILABLE)؛ منبع در F2-08 (اصول پایهٔ حقوق). پلکان پیش‌فرض پورسانت در `calculateCommissionForSeller` هنوز هاردکد است ⇒ F2-08/F8.
- [~] F0-13 اصل «مانده = تفصیلی × معین» (قانون اساسی §C): ممیزی همهٔ محاسبه/نمایش مانده (`CustomersWorkspace`، `financialIntelligence`، `etlPipeline`، فهرست مشتری/تأمین‌کننده/پرسنل/بانک) و جایگزینی مانده صرفاً‌تفصیلی با مانده تفکیکی به‌ازای هر (تفصیلی، معین)؛ ماهیت بدهکار/بستانکار/تسویه‌شده؛ جمع شخص کنار تفکیکی؛ Drill-down گردش/اسناد هر معین؛ بدون نگاشت ⇒ «فاقد نگاشت». شاهد ممیزی اولیه: ارجاعات معین فقط در ۴ فایل (CustomersWorkspace≈۵، financialIntelligence، etlPipeline، seedExtended) ⇒ مدل داده مانده تفکیکی وجود ندارد. — **انجام‌شده (۱۴۰۵/۰۸/۲۵):** موتور `computeDetailSubsidiaryBalances` در `src/lib/receivableReconciliation.ts` (کنار موتور قبلی؛ موازی نساخته شد): مانده مستقل هر (تفصیلی، معین، [دوره]) = Σبدهکار−Σبستانکار، ماهیت `DEBIT/CREDIT/SETTLED`، جمع تفصیلی فقط تجمیع تفکیکی‌ها، سطر بدون معین ⇒ سطل `null` و وضعیت `HAS_UNMAPPED` (بدون ادغام/مانده ساختگی). شاهد: tests/detailSubsidiaryBalance PASS (۶/۶)؛ customerListBalancePermission، receivableSingleSourceContracts، customerSyncExperienceContracts PASS. **مانده (به‌روز ۱۴۰۵/۰۸/۲۵):** Drill-down گردش/اسناد هر معین و جدول مانده‌های تفکیکی در پرونده ۳۶۰ مشتری (`Customer360`)؛ همین نمایش برای تأمین‌کننده/پرسنل/بانک؛ ممیزی `financialIntelligence`/`etlPipeline`. **انجام‌شده این نوبت:** فهرست مشتری اکنون مانده را از `DataProvider.getDetailSubsidiaryBalances` می‌گیرد (پشت مجوز مالی؛ بدون مجوز اصلاً درخواست نمی‌شود)، کنار جمع تعداد معین و «فاقد نگاشت» را نشان می‌دهد (`resolveCustomerBalanceView`، `receivableReconciliation.ts`)؛ وضعیت‌های «در حال دریافت / منبع در دسترس نیست / مانده نامشخص» جدا از «تسویه». شاهد: tests/customerBalanceView PASS، customerListBalancePermission/customerSyncExperienceContracts (به قرارداد جدید به‌روز شدند)، receivableSingleSourceContracts، detailSubsidiaryBalance، rbac PASS. — **افزوده (۱۴۰۵/۰۸/۲۵):** پانل `SubsidiaryBalancesPanel` در تب «مالی و خدمات» `Customer360` (پشت `canViewFinance`): جدول مانده به‌ازای معین، «فاقد نگاشت»، جمع تفصیلی، Drill-down گردش هر معین از `DataProvider.getJournalLines` (فیلتر `unmapped` جدید)؛ `resolveCustomerBalanceView` اکنون `detailKey` برمی‌گرداند. شاهد: tests/subsidiaryBalancesPanel PASS (مجموع Drill-down = مانده معین). **چه مانده:** همین نمایش برای تأمین‌کننده/پرسنل/بانک؛ ممیزی financialIntelligence/etlPipeline. — **به‌روز (۱۴۰۵/۰۸/۲۵، نوبت بعد) — قاعدهٔ قطعی مالک: هیچ مانده‌ای از فاکتور/صورتحساب باز نیست؛ همهٔ مانده‌ها فقط Σبدهکار − Σبستانکار کدینگ مالی هر موجودیت:** در `financialIntelligence` تابع `ledgerBalanceFact` (بر پایهٔ `computeDetailSubsidiaryBalances`) جایگزین مانده فاکتوری شد: `credit.balance` و `supplier.balance` فقط از `journalLines` (بدون گردش = نامشخص، نه صفر؛ مثبت=بدهکار، منفی=بستانکار؛ سطر بدون معین ⇒ PARTIAL)؛ `credit.overdue`/`credit.notDue` که از فاکتور ساخته می‌شدند اکنون «نامشخص» با علت (تفکیک سررسید نیازمند تخصیص اسناد ERP) — کلیدها حفظ شد. `etlPipeline` مانده نمی‌سازد. یافته: صفحهٔ مانده برای تأمین‌کننده/پرسنل/بانک هنوز وجود ندارد (پنل عمومی `SubsidiaryBalancesPanel` هنگام ساخت آن‌ها در فاز ۲ سوار شود). شاهد: tests/ledgerOnlyBalances PASS؛ tests/financialIntelligence PASS (۱۰۷؛ شامل مانده دو معین، تأمین‌کننده بستانکار=−۸۰M، نبود گردش=null)؛ customerBalanceView، subsidiaryBalancesPanel PASS. **چه مانده:** F0-16 (مصرف‌کنندگان فاکتوری مانده) و نصب پنل برای تأمین‌کننده/پرسنل/بانک.
- [x] F0-11 تعیین تکلیف ۱۶ فایل بدون ارجاع (وصل/نگه‌داشتن با دلیل؛ حذف فقط با ممیزی+تست): ReportEnginePanels, LightHighwayCanvas, ProfitWaterfallChart, MotionListItem, NotificationCenter, useDocumentAutoFill, confetti, erpContracts, erpImportService, etlPipeline, ledgerPnl, metricRegistry, negotiationErpLifecycle, notifyAndPush, reportAnalytics, repository. — **انجام‌شده (۱۴۰۵/۰۸/۲۵) — تعیین تکلیف هر ۱۶ فایل با ممیزی grep:** (الف) **وصل‌شده:** `NotificationCenter` جایگزین لیست درون‌خطی کشوی «مرکز اعلان‌ها» در `App.tsx` (فیلتر خوانده‌نشده/وظایف/مالی/سیستم + «همه خوانده شد» فقط برای اعلان‌های کاربر جاری؛ هدر و منوی قفل‌شده دست‌نخورده)؛ `notifyAndPush.pushNotification` در `InternalAutomationWorkspace` برای سه اعلان به‌سوی کاربر دیگر (رد درخواست، ثبت درخواست جدید، ارجاع) جایگزین `draft.notifications.push` دستی شد (فقط یک ثبت دستی «پیشرفت گردش» برای سازنده باقی ماند). (ب) **بازتعیین‌شده — در واقع مصرف‌کننده دارند (فهرست قبلی کهنه بود):** `ProfitWaterfallChart`، `ledgerPnl`، `negotiationErpLifecycle`، `reportAnalytics` ← `ReportEnginePanels`؛ `ledgerPnl` ← `ProfitLossWidget`؛ `erpContracts` ← `erpImportService` ← `etlPipeline` ← نوع در `ledgerPnl`؛ `repository` ← `OnboardingAdminWorkspace`؛ `metricRegistry` ← سند KPI/تست‌ها. (ج) **نگه‌داشته‌شده با دلیل (بدون حذف):** `ReportEnginePanels` (ریشهٔ زنجیرهٔ بالا؛ ۱۴۸۵ خط؛ نصب در فاز ۹ با طراحی §۹ — اکنون در هیچ مسیر UI سوار نیست)؛ `useDocumentAutoFill` (هوک موازیِ مسیر `GlobalFloatingIntakeDrawer`/`documentCapture`؛ وصل‌کردن در این نوبت ریسک رگرسیون F0-06 داشت ← یکپارچه‌سازی در پیگیری F0-06/F13)؛ `LightHighwayCanvas` (پس‌زمینهٔ جایگزین ورود؛ `accessibilityContracts` به آن ارجاع می‌دهد)؛ `MotionListItem`، `confetti` (تزئینی، بدون ریسک؛ بازبینی در F13 با خروجی bundle). شاهد: tests/notificationCenterWiring PASS (ایستا + اجرایی؛ بخش اجرایی با stub موقت `jalaali-js` خارج از ZIP؛ بدون آن، بخش اجرایی BLOCKED و بخش ایستا PASS)؛ seamlessHeaderContracts، designLockContracts، internalWorkflowWorkspaceContracts، navigationHierarchyContracts، auditLandingContracts PASS. Build/tsc: NOT VERIFIED.
- [~] F0-12 منبع ریزش از فاکتور ERP (نه Quote) و انتقال آستانه‌های ریسک/ریزش به تنظیم (با F4-01). **۱۴۰۵/۰۸/۲۷:** کدهای Ki برای `metricConfig.ts`، `churnPredictionService.ts` و `collectionEngine.ts` به‌صورت هدفمند اعمال شدند؛ `churnErpInvoiceSource` PASS. تست قدیمی `churnPredictionService.test.mjs` به‌علت انتظار استفاده از Quote و دادهٔ بدون تاریخ فاکتور ۲/۴ FAIL (قرارداد قدیمی نیازمند بازنگری)؛ build/tsc و ERP واقعی NOT VERIFIED؛ F4-01 و منبع تنظیمات SQL هنوز کامل نیستند. بنابراین این ردیف تکمیل‌شده نیست.
- [~] F0-16 حذف هر مانده مبتنی بر فاکتور/صورتحساب باز و اتصال به مانده دفتری (Σبدهکار−Σبستانکار تفصیلی×معین) در مصرف‌کنندگان شناخته‌شدهٔ ممیزی: `FinanceWorkspace` (`receivableReconciliation.invoices`، `outstandingAmount`، خط ≈۱۴۰/۱۴۷/۳۷۶)، `ReportEnginePanels` (aging/مطالبات، خط ≈۵۳۷/۵۴۹/۱۲۷۲/۱۳۰۴)، `OrderDetailsDrawer` (`remainingBalance`)، `DrilldownSheet`/`DocumentDetailModal` (`outstanding`)، و موتور `buildAgingBuckets`. سررسید/Aging فقط با تخصیص اسناد واقعی ERP؛ بدون آن «نامشخص». هیچ قابلیت حذف نشود؛ جایگزینی منبع. — **انجام‌شده (۱۴۰۵/۰۸/۲۵):** `FinanceWorkspace`: KPI «کل مطالبات» اکنون از `summarizeCustomerLedgerReceivables` (جدید، در همان `receivableReconciliation.ts`؛ بر پایهٔ `DataProvider.getDetailSubsidiaryBalances`؛ پشت `finance.view`) می‌آید: مجموع مانده‌های بدهکار؛ بستانکارها جدا؛ مشتری بدون گردش ⇒ «نامشخص» نه صفر؛ سطر بدون معین ⇒ «ناقص». «معوقات سررسیدشده»، نوار حکم و کارت Aging فقط وقتی `reconcileReceivables.authoritative` و منبع اعتبار CONNECTED باشد مقدار دارند، وگرنه «نامشخص» با علت؛ موتورهای `reconcileReceivables`/`buildAgingBuckets` حذف نشدند. شاهد: tests/ledgerReceivablesSummary PASS؛ customerBalanceView، receivableSingleSourceContracts، crossModuleConsistencyContracts، geoWorkspaceContracts، primaryWorkspaceRedesignContracts، designSystem2026Contracts PASS. (FAIL از پیش موجود روی ZIP اصلی: audit2026Contracts [`invoice.balance` در CustomersWorkspace]، persianLocalizationContracts [واژه‌های لاتین].) **به‌روز (قاعدهٔ مالک):** تخصیص CRM مبنا نیست؛ سیاست مصوب: Aging «تخمینی» از مانده دفتری، از آخرین فاکتور به عقب (`estimateLedgerAging` در `agingBuckets.ts`؛ قانون اساسی §D)؛ `FinanceWorkspace` با برچسب «تخمینی» و جزئیات هر مشتری (مانده بدهکار؛ آخرین فاکتور با شماره/تاریخ/مبلغ پوشش‌یافته، سپس فاکتور قبل)؛ مازاد = «بدون انتساب»؛ شاهد: tests/ledgerReceivablesSummary PASS. **چه مانده:** `ReportEnginePanels` (خطوط ≈۵۳۷/۵۴۹/۱۲۷۲/۱۳۰۴؛ تست crossModule آن را به `reconcileReceivables`/`buildAgingBuckets` گره زده؛ باید هم‌زمان به‌روز شود)، `OrderDetailsDrawer` (`remainingBalance`)، `DrilldownSheet`/`DocumentDetailModal` (`outstanding`)، `collectionEngine`؛ همچنین `collectionScopeState` در FinanceWorkspace هنوز مبتنی بر فاکتور است. — **انجام‌شده (۱۴۰۵/۰۸/۲۶):** `ReportEnginePanels` گزارش ۷: کل مطالبات = `summarizeCustomerLedgerReceivables` (مانده دفتری از `DataProvider.getDetailSubsidiaryBalances`، پشت `finance.view`)، سررسیدگذشته/Aging/فهرست اولویت‌ها «تخمینی» از `estimateLedgerAging`؛ بدون گردش ⇒ «نامشخص»؛ `reconcileReceivables` فقط برای نشان انطباق می‌ماند؛ Drill-down دیگر `outstanding` هر فاکتور را از `inv.balance` نمی‌سازد (⇒ `DrilldownSheet`/`DocumentDetailModal` فقط نمایشی و بدون تأمین‌کنندهٔ مانده‌اند)؛ `OrderDetailsDrawer`: «مانده قابل پرداخت» حذف و «نامشخص» شد؛ تابع مشترک `buildLedgerAgingInputs` (`agingBuckets.ts`) که `FinanceWorkspace` هم از آن استفاده می‌کند. شاهد: tests/reportReceivablesLedgerOnly PASS؛ ledgerReceivablesSummary، crossModuleConsistencyContracts، reportEngineUiContracts PASS؛ NOT VERIFIED: tsc/بصری. **چه مانده (به‌روز):** `collectionEngine` (`reconcileReceivables` خط ≈۱۷۴/`remaining` ≈۱۹۵) و `collectionScopeState` در FinanceWorkspace؛ `GeoIntelligenceWorkspace` (≈۱۶۹) و `geoIntelligence` (OUTSTANDING_RECEIVABLES فاکتوری)؛ `paidAmount` در OrderDetailsDrawer و نرخ مالیات ۹٪ هاردکد (خط ≈۷۴)؛ ReportEnginePanels هنوز در هیچ مسیری رندر نمی‌شود (فقط تست‌ها/dataPorts ارجاع دارند). — **انجام‌شده (۱۴۰۵/۰۸/۲۶، ادامه، قاعدهٔ LIFO مالک):** مانده دفتری هر مشتری از آخرین فاکتور به عقب بین فاکتورها پخش می‌شود (مثال: مانده ۲۵ و فاکتورها ۳/۷/۸/۱۲ ⇒ ۰/۵/۸/۱۲)؛ `allocateLifo`/`estimateInvoiceRemaining` در `agingBuckets.ts`؛ گزارش‌ها در `src/services/receivableReports.ts` و پنل `src/components/reports/ReceivablesLifoPanel.tsx` (در `FinanceWorkspace` و گزارش ۷)؛ مهلت مجاز در تنظیمات (`orgConfig.allowedCreditDays`)؛ `OrderDetailsDrawer` مانده/پرداخت‌شده تخمینی؛ نرخ ۹٪ هاردکد حذف، مالیات هر کالا از `taxRatePercent` ERP (`src/lib/taxRate.ts`)، ویزارد پیش‌فاکتور هم‌راستا، ستون «مالیات (ERP)» در فهرست کالا؛ `collectionEngine` (پارامتر `ledgerBalances`)، `TasksWorkspace`، `GeoIntelligenceWorkspace`/`geoIntelligence` به LIFO. شاهد: tests/invoiceLifoRemaining PASS؛ receivableSingleSourceContracts، geoWorkspaceContracts به قرارداد جدید به‌روز و PASS. NOT VERIFIED: tsc/build/بصری. — **انجام‌شده (۱۴۰۵/۰۸/۲۶، ادامه، ETL مالیات کالا):** موجودیت `PRODUCT` به همان موتور واردسازی موجود (`erpImportService`) و روی مجموعهٔ موجود `externalProducts` اضافه شد (بدون مجموعهٔ موازی)؛ `taxRatePercent` نبود/خالی ⇒ `null` (نامشخص، نه ۰)؛ قاعدهٔ ETL «`PRODUCT_TAX_RATE_INVALID`» برای مقدار خارج از ۰..۱۰۰ یا غیرعددی (`etlPipeline.ts`). شاهد: tests/productTaxEtl PASS (جدید؛ ثبت در Manifest)؛ erpImportService، etlPipelineContracts، invoiceLifoRemaining PASS (`node --experimental-strip-types`). NOT VERIFIED: tsc/build؛ نگاشت ستون واقعی مالیات در Query/سرور ERP (نیازمند Schema/Data Dictionary — بدون حدس نام ستون). **چه مانده:** صفحهٔ تعاریف پایه (F2-02) با ستون مالیات؛ شکستن بخش‌های ۱ تا ۱۱ `ReportEnginePanels` به فایل‌های ریز.

## فاز ۱ — ناوبری: کاتالوگ یگانه و هشت فضای کاری
- [~] F1-00 زیرساخت موجود: `ModuleLandingWorkspace` مشترک، ۸ فضای کاری قدیمی و **۷۳ کاشی (۲۷ «در دست تکمیل»)**، Route `/workspace/:moduleId`، RBAC روی کاشی‌ها، تور. شاهد: `moduleLandingContracts`، `navigationHierarchyContracts`، `tourCoverageContracts` PASS. (فضاها باید طبق سند جامع §۳ بازچینی شوند.)
- [ ] F1-01 کاتالوگ یگانه ناوبری+Landing (ادغام `NAV_SECTIONS` و `MODULE_LANDINGS`).
- [ ] F1-02 هشت فضای کاری نهایی طبق سند جامع §۳: خانه و کارهای من، تعاریف پایه و داده، مشتریان و فروش، بازرگانی و توزیع، خرید و تأمین، مالی و خزانه‌داری، منابع انسانی و حقوقی، سازمان و تنظیمات. Deep Linkهای قدیمی حفظ شوند؛ `moduleOwnerOfRoute` و `DesktopSidebar`/`NavigationDrawer` هم‌راستا شوند.
- [ ] F1-03 حذف «مرکز گزارشات» از منو؛ گزارش‌ها زیر فضای مالک؛ Deep Linkهای قدیمی حفظ.
- [ ] F1-04 «+» هدرِ زمینه‌مند: Action Registry یگانه بر اساس Route+RBAC؛ مشتری→مشتری جدید، اتوماسیون→تسک/گردش، جلسات→جلسه، کمپین→کمپین، مالی→دستور پرداخت و عملیات مجاز همان صفحه؛ حذف دکمه‌های Create تکراری بدنه پس از ممیزی مصرف‌کنندگان؛ تست نقش/Route/عدم مجوز و جلوگیری از عملیات تکراری.
- [ ] F1-05 هم‌راستاسازی `DesktopSidebar`؛ به‌روزرسانی تور.
- [ ] F1-06 تب‌ها و مسیرهای یتیم صاحب و کاشی بگیرند: `operations` (overview، purchasing، profitability)، `finance?tab=overview`، دو دامنهٔ `ReportsHub` (finance، receivables). تست قرارداد: هر تب/دامنه یک کاشی دارد.
- [ ] F1-07 «جلسات و مصوبات» و «تقویم کاری» در دستهٔ «زمان‌بندی» فضای خانه با مقصد یگانهٔ جلسات (اکنون هم در `CalendarWorkspace` و هم در تب جلسات `InternalAutomationWorkspace`).

## فاز ۲ — تعاریف پایه، هویت و همگام‌سازی
- [ ] F2-01 ممیزی دقیق ~۳۰ موجودیت سند جامع §۵-۲ (جدول/مجموعهٔ EntityStore/صفحه ویرایش/اتصال ERP هر کدام) ← جدول شکاف در همان بخش به‌روز شود.
- [ ] F2-02 فضای «تعاریف پایه و داده» + «مرکز داده و همگام‌سازی»: جدول هر موجودیت با منبع (ERP/محلی/خالی)، تعداد، تازگی، درصد نگاشت‌شدگی؛ ادغام `/sync-center` و مغایرت فنی ETL.
- [ ] F2-03 کالا و قیمت: کالا (فقط‌خواندنی)، گروه کالا، برند، واحد، کلاس/لیست قیمت؛ ساخت محلی در نبود ERP.
- [ ] F2-04 طرح پروموشن و بودجه پروموشن: خروج از «تنظیمات»، انتقال به تعاریف پایه (مصرف‌کنندگان ممیزی شوند؛ Deep Link قدیمی حفظ).
- [ ] F2-05 تأمین‌کنندگان، گروه و کلاس مشتری.
- [ ] F2-06 جغرافیا و توزیع: استان/شهر، زون، مسیر، **تور ویزیت** (فروشنده × روز × مسیر)، انبار، خودرو، راننده.
- [ ] F2-07 (شامل صفحهٔ مدیریت «گروه تفصیلی» (مشتریان/پرسنل/مراکز هزینه/جاری شرکا/بانک‌ها؛ فقط دسته‌بندی)، مشاهدهٔ کدینگ گروه حساب/کل/معین/تفصیلی همگام‌شده از ERP (منبع: ERP/محلی/خالی) و اصل مانده تفصیلی×معین و نگاشت چندمعینی هر تفصیلی؛ F0-13) مالی و حسابداری: نمایش کدینگ چندسطحی، گروه تفصیلی، بانک و حساب بانکی، دستهٔ هزینه.
- [ ] F2-08 هدف‌گذاری فروش، پلکان پورسانت و اصول پایهٔ حقوق: تعریف محلی نسخه‌دار هنگام نبود ERP؛ در صورت وجود ERP منتقل‌شده و فقط‌خواندنی.
- [ ] F2-09 انتقال تعریف کاربر، نقش و سلسله‌مراتب نقش، پرسنل، تیم/شعبه/قلمرو از «تنظیمات» به «تعاریف پایه»؛ «تنظیمات» فقط دسترسی و سیاست (مجموعه دسترسی، اختصاص دسترسی، مجوز دستگاه، سیاست حوزهٔ دید) را نگه دارد.
- [ ] F2-10 مدل هویت: ستون «کد تفصیلی» روی کاربر/پرسنل/مشتری/تأمین‌کننده/بانک/شریک و/یا دامنه‌های `integration.CodeMapping` (`USER_SALES_CODE`، `USER_DETAIL_ACCOUNT`، `PARTY_DETAIL_ACCOUNT`)؛ Migration افزایشی؛ بدون جدول موازی (سند جامع §۵-۳).
- [ ] F2-11 فرم تعریف کاربر/پرسنل با «تشخیص هویت»: نقش ← کدهای الزامی ← جست‌وجو در داده ERP ← تأیید ← لینک تفصیلی؛ وضعیت تطبیق‌شده / محلی / ناقص.
- [ ] F2-12 فهرست کدهای الزامی هر نقش (فروشنده: کد بازرگانی+تفصیلی؛ حسابدار: کد سیستمی+تفصیلی؛ مدیر: کد سیستم حسابداری+تفصیلی) قابل تنظیم.
- [ ] F2-13 اعتبارسنجی لینک: وجود در فهرست تفصیلی ERP، یکتایی، کامل‌بودن برای نقش؛ گزارش «کاربران/طرف‌حساب‌های ناقص» در مرکز داده.
- [ ] F2-14 حوزهٔ دید گزارش‌ها از روی کدهای لینک‌شده + سلسله‌مراتب (سرپرست = تیم خود)؛ fail-closed؛ گسترش RLS موجود (`006`، `010`، `013`، `020`)؛ تست: سرپرست فقط داده تیم خود را می‌بیند و کاربر بدون لینک هیچ نمی‌بیند.
- [ ] F2-15 صفحهٔ «نگاشت حساب» (`LedgerAccountSourceMap`) و «نگاشت طرف‌حساب» (تفصیلی) با وضعیت `UNMAPPED/MAPPED/APPROVED/REJECTED` و اعتبار زمانی.
- [ ] F2-16 پالس هر صفحه + Push مرکزی/مجموعه‌ای با نتیجه و تست idempotency.
- [~] F2-17 مرکز همگام‌سازی `/sync-center` و نشانگر هدر موجود؛ دوگانگی موتور (P0-04) رفع شود.
- [ ] F2-18 اتصال `erpImportService`/`etlPipeline`/`erpContracts` به رابط عملیاتی.
- [~] F2-19 **کنترل کیفیت داده ERP (درخواست مالک):** موتور یگانهٔ `src/lib/erpDataQuality.ts` (`auditErpDataQuality`) برای تشخیص اشتباهات ERP: مشتری (کد ملی/شناسهٔ ملی با چک‌سام، موبایل نامعتبر، تکراری بر پایهٔ کد ملی/کد اقتصادی/موبایل/نام)، مسیر (مشتری بدون مسیر، بدون مختصات، مختصات مشکوک، خارج از چندضلعی مسیر، دورافتاده از هم‌مسیری‌ها)، کالا (گروه‌بندی مشکوک، بدون گروه، کد تکراری، قیمت/بها)، کدینگ (ماهیت نادرست مثل «جاری شرکا» بدهکار، والد/سطح، کد تکراری، مانده خلاف ماهیت)، اسناد (سند نامتوازن، سطر دوطرفه/منفی، حساب ناشناخته/غیرفعال/کل، ناهم‌خوانی شرح و حساب). هر یافته ruleCode، شاهد و درجهٔ اطمینان (قطعی/نیازمند بازبینی) دارد؛ منبع ناموجود ⇒ «ارزیابی‌نشده» نه صفر. — **انجام‌شده:** موتور + `DataQualityPanel` در `/sync-center` با حوزهٔ دید مالی/مشتری؛ شاهد: tests/erpDataQuality PASS (۷/۷)، customerSyncExperienceContracts، tourCoverageContracts PASS. **مانده:** (الف) قواعد ماهیت/شرح اکنون ثابت‌های قابل‌override در کدند ⇒ صفحهٔ تعریف قواعد در «تعاریف پایه» (F2-02/F2-07)؛ (ب) مسیر مشتری = زون/تخصیص زون؛ پس از F2-06 (تور ویزیت/مسیر) نگاشت مسیر واقعی؛ (ج) صفحهٔ مالی «اسناد مشکوک» با ریز سند و Drill-down (F9/فاز ۶)؛ (د) دکمهٔ «ایجاد تسک اصلاح» و ثبت وضعیت رسیدگی (تأیید/رد/رفع) در DB با Migration؛ (هـ) اجرای زمان‌بندی‌شده پس از هر همگام‌سازی و اعلان؛ (و) گروه‌بندی کالا اکنون توکن‌محور است، نه مدل معنایی؛ (ز) ممیزی روی دادهٔ واقعی ERP (NOT VERIFIED). **توسعه این نوبت:** صفحهٔ مستقل `/audit?module=...` به‌عنوان نمای حوزه‌ای، با نمودار توزیع یافته‌ها، ترکیب شدت، فیلتر و شواهد، از همان موتور `auditErpDataQuality` استفاده می‌کند؛ ورودی پایش به هشت Landing موجود اضافه شد. دامنه‌های بدون قانون متصل به‌صراحت ارزیابی‌نشده نمایش داده می‌شوند. شاهد: `tests/auditLandingContracts.test.mjs` (۳/۳ PASS)، `tests/moduleLandingContracts.test.mjs` (۵/۵ PASS)، `tests/designLockContracts.test.mjs` PASS، `tests/seamlessHeaderContracts.test.mjs` PASS. `tsc/build` و بازبینی بصری مرورگر NOT VERIFIED؛ اجرای موتور روی داده واقعی ERP NOT VERIFIED.

- [ ] F2-20 کاتالوگ پارامتری قوانین پایش: ruleCode/version/severity/source mapping/threshold/evidence/confidence/coverage؛ قوانین شرح↔کدینگ، طبقه‌بندی هزینه، مساعده در برابر سرفصل هزینه، تخفیف نقد به‌ازای فاکتور، حداقل سود فاکتور با بهای تمام‌شده معتبر، قیمت صنف، لیست سیاه، برنامه حمل باز/فاقد سند، فاکتور قدیمی بدون برنامه حمل و فاکتور تکراری در یک پخش. هیچ آستانهٔ تجاری هاردکد نشود.
- [ ] F2-21 اولویت «مانده بستانکار مشتری»: محاسبهٔ تفصیلی×معین×دوره؛ Drill-down گردش و اسناد؛ تطبیق دریافت و فاکتور؛ تشخیص دریافت مازاد/پیش‌دریافت، دریافت تخصیص‌نیافته، برگشت/اعتبار، اصلاحیه، انتقال/تفصیلی اشتباه، سند تکراری/معکوس؛ علت محتمل با Confidence و بدون ادعای علت قطعی بی‌شاهد؛ نمایش سن مانده و فاکتورهای باز.
- [ ] F2-22 صفحهٔ پایش یکپارچه و مینیمال: یک صفحه برای هر حوزه، حداکثر ۴ KPI، نمودار روند/شدت، فیلتر مشترک، گروه‌های کنترل جمع‌شونده، فهرست یافته و پنل شواهد؛ ادغام قوانین هم‌معنا در گروه‌ها؛ بدون آیکون برای هر قانون و بدون تب‌های متعدد؛ وضعیت پوشش/منبع همیشه روشن.
- [ ] F2-23 اتصال قوانین و شواهد به جداول واقعی دیتابیس تجمیعی ERP؛ تعیین دقیق شناسه سند/ردیف/مشتری/کالا و lineage؛ قواعد بدون منبع معتبر `UNAVAILABLE/NOT_EVALUATED` بمانند.

## فاز ۳ — Landing و پوسته مینیمال
- [~] F3-01 کامپوننت Landing جدید طبق سند جامع §۴ (کارت دسته + «مشاهده بیشتر/کمتر» + کاشی آیکونی ۴ستونه؛ سبک تصویر مرجع `docs/design-reference/landing-reference-bank.webp`) برای هر ۸ فضا؛ هدر/منو دست‌نخورده. — **انجام اولیه:** گروه‌های Landing به کارت‌های جمع‌شونده با کاشی آیکونی گرد و چهارستونه در موبایل تبدیل شدند؛ ورودی پایش مغایرت به هر هشت فضای کاری افزوده شد. **مانده:** بازبینی بصری در اندازه‌های هدف، کنترل دقیق RBAC هر نقش و تکمیل پوشش همهٔ قوانین اختصاصی هر حوزه.
- [ ] F3-02 مجموعهٔ آیکون یکدست (Lucide، stroke ≈۱٫۵) با جدول یگانهٔ آیکون هر کاشی؛ هر کاشی آیکون یکتا در فضای خود.
- [ ] F3-03 کاشی «در دست تکمیل» و `PlannedModulePage` هم‌سبک (کم‌رنگ، آخرین ردیف کارت).
- [ ] F3-04 تست بصری Landing همهٔ فضاها 320–1440، Light/Dark، RTL، Safe Area (`NOT VERIFIED` تا اجرا در مرورگر).
- [~] F3-09 کیت ویجت گزارش طبق `docs/DESIGN_SYSTEM_FA.md` §۹-۲ (`KpiStat`، `ChartCard` با فیلتر محلی، `RankList`، `ScoreRing`، `InsightRow`/`StatusChip`، `SegmentedTabs`، `PeriodChip` جلالی، `FilterChips`، `SectionHeader`، `Timeline`، `StageSummary`، `EmptyState`/`Skeleton`)؛ ابتدا `src/components/charts/` را گسترش بده، نسخهٔ موازی نساز؛ موضوع‌بندی ECharts با توکن‌ها (`echartsTheme.ts`).
- [ ] F3-10 نوار فیلتر گزارش مشترک: تب قرصی نما، چیپ بازهٔ جلالی، Export، چیپ فیلتر فعال + بازنشانی، فیلتر در URL؛ فیلتر محلی هر کارت. تست قرارداد: فیلتر دوره واقعاً محاسبه را عوض می‌کند (اکنون در `ReportsHub` نمی‌کند).
- [ ] F3-05 کامپوننت مشترک ردیف مینیمال (از ردیف مشتری موجود تعمیم بده) برای سفارش، فاکتور، مشتری و…
- [ ] F3-06 صفحه جزئیات استاندارد (الگوی پرونده ۳۶۰) برای سفارش/فاکتور/پخش/…؛ پروفایل مشتری و کاربر/پرسنل با هویت، وضعیت، اطلاعات پایه، KPI واقعی، تایم‌لاین مستند، نمودار ماهانه و اقدام مجاز مطابق `report-reference-entity360.jpeg`.
- [~] F3-07 اکشن مشترک ایجاد تسک: مشتری/Customer360 انجام (۳/۳ PASS قرارداد فاز اول). باقی: سفارش، مذاکره/CPQ، فاکتور، برنامه پخش، برگشتی، رسید، چک، تسویه، دستور پرداخت، درخواست سازمانی.
- [ ] F3-08 تست بصری/تعاملی Drawer چت و اعلان (Escape، بیرون‌کلیک، RTL، Safe Area، Dark).

## فاز ۴ — موتورهای مشترک
- [ ] F4-01 (۲.۱) Rule Registry: شرط/عمل/محدوده/اولویت/تقدم/نسخه/فعال‌سازی/تعارض/تاریخچه/آزمون پیش از فعال‌سازی؛ پذیرش: یک قاعده در >۱ ماژول.
- [ ] F4-02 (۲.۲) فرم پویا: Schema، شرط نمایش، چندمرحله‌ای، Field Permission، اعتبارسنجی بک‌اند، نسخه؛ نمونه مساعده/مرخصی/چک.
- [ ] F4-03 (۲.۳) Workflow و تأیید: Trigger، Transition، SLA، Retry، نسخه، ضد‌حلقه؛ پذیرش: یک گردش واقعی کامل.
- [~] F4-04 (۲.۴) وظیفه/Smart Task: موتورها موجود (taskWorkflow, taskIntelligence, taskActivity, taskAccessEngine)؛ باقی: Escalation، کنترل تکراری/هم‌زمان، ساخت از پیام/رویداد، آزمون پذیرش.
- [ ] F4-05 (۲.۵) یادآوری: تکرار/سررسید/تغییر وضعیت، تقویم تعطیلات، لغو پس از تکمیل؛ سناریو ۷ روز/۲ روز/سررسید.
- [ ] F4-06 (۲.۶) ارجاع هوشمند: قلمرو/تخصص/ظرفیت/Override/ثبت علت.
- [ ] F4-07 (۲.۷) اعلان: وصل `notifyAndPush`+`NotificationCenter`؛ خوانده‌شدن، ضد‌تکرار، صف/Retry.
- [ ] F4-08 (۲.۸) Audit و تاریخچه مشترک سراسری (کامپوننت یگانه؛ ثبت سمت سرور؛ نمایش `accountAuditLogs` در Customer360؛ `ActivitiesWorkspace` همه `auditLogs`).
- [ ] F4-09 (۲.۹) موتور جریمه مشترک (سیاست‌محور، بازتولیدپذیر، ضد اعمال مجدد).
- [ ] F4-10 (۲.۱۰) Job Registry + Outbox + Retry/Backoff + Idempotency + پایش صف.

## فاز ۵ — بازرگانی
- [ ] F5-01 فهرست سفارش ERP مینیمال (بدون ثبت «سفارش آزمایشی» در مسیر عملیاتی؛ داده LOCAL_TEST برچسب‌دار).
- [ ] F5-02 جزئیات سفارش + مذاکره CPQ/افزایش فروش درون آن (`phase2Flow`: isNegotiableErpOrder, evaluateOrderCpq, validateOrderForCpq, makeErpChangeRequest, applyErpChangeResponse؛ `negotiationErpLifecycle`).
- [ ] F5-03 اعمال سفارش: ارسال(Push)، ابطال، بررسی اعتبار مشتری؛ پاسخ واقعی ERP.
- [ ] F5-04 فاکتور ERP-only زیر بازرگانی (فیلتر مبدأ، فقط‌خواندنی، پیوند به برنامه پخش در صورت وجود).
- [ ] F5-05 برنامه پخش + تسک «چرا با N فاکتور؟».
- [ ] F5-06 برگشتی فروش (بازرگانی) + `deliveryEvents` در Registry.
- [ ] F5-07 ویزیت (اجرا) زیر «مشتریان و فروش»؛ سرنخ/فرصت همان‌جا.
- [ ] F5-08 کاتالوگ کالا فقط‌خواندنی + موجودی (وابسته فاز ۷).
- [ ] F5-09 حذف صفحه مغایرت‌های توزیع از مقصد عملیاتی (مغایرت فنی ETL جدا می‌ماند).
- [ ] F5-10 قواعد پایش بازرگانی/پخش: سفارش تکراری؛ فروش زیر کف؛ تخفیف/قیمت غیرمجاز؛ حداقل سود فاکتور؛ مشتری لیست سیاه؛ برگشت غیرعادی؛ برنامه حمل باز/بدون سند؛ فاکتور قدیمی بدون برنامه حمل؛ فاکتور تکراری در یک پخش؛ مغایرت سفارش↔فاکتور↔بارگیری↔تحویل↔تسویه؛ سودآوری مشتری/کالا/مسیر/ویزیتور. UI در صفحهٔ حوزه‌ای تجمیع شود، نه تب/آیکون مستقل.

## فاز ۶ — مالی و خزانه‌داری
- [ ] F6-01 درخواست پرداخت قطعی/غیرقطعی: OCR→فرم→ثبت→تسک تأیید حسابداری→Push.
- [ ] F6-02 نگاشت حساب هنگام ثبت (هزینه/بهای تمام‌شده) با نمایش کدینگ به حسابدار.
- [ ] F6-03 چک دریافتی/پرداختی: واگذاری، وصول، برگشت؛ جهت صحیح؛ ضمانتی/باطل خارج از محاسبه.
- [~] F6-04 بانک/صندوق/انتقال/مانده (رابط واقعی روی `treasuryAccounts/Transactions`). — موتور پیش‌بینی و پنل به Provider متصل شد؛ اتصال SQL/ERP، تست مرورگر و TypeScript و تطبیق نسخه دوم موتور هنوز NOT VERIFIED؛ بانک/صندوق/انتقال کامل نیست.
- [ ] F6-05 مطالبات و وصول؛ اسناد خرید.
- [ ] F6-06 سود و زیان دفتری واقعی (`ledgerPnl` + View SQL) و ترازنامه.
- [ ] F6-07 گزارش‌های مالی R1, R7, R8 (فاز ۹).
- [ ] F6-08 قواعد پایش مالی بحرانی: سند نامتوازن/تکراری/دستی غیرعادی/بدون شرح/دوره اشتباه/تغییر سند قطعی؛ شرح↔کدینگ و هزینه↔مرکز هزینه؛ حساب/مانده/واسطه غیرمنطقی؛ دفتر کل↔معین؛ هزینه غیرعادی؛ فروش/خرید/برگشت↔سند مالی؛ تخفیف نقد به‌ازای فاکتور.
- [ ] F6-09 پایش مانده بستانکار مشتری و علت‌یابی شواهدمحور؛ پرداخت تکراری/بدون مجوز، مغایرت بانک و صندوق، چک سررسیدگذشته، انتقال تکراری و پرداخت به حساب بانکی تغییر‌یافته.

## فاز ۷ — خرید و تأمین و FIFO
- [ ] F7-01 درخواست تأمین بار، سفارش خرید، رسید کالا (صفحات واقعی؛ نه فقط PR-TEST).
- [ ] F7-02 برگشت از خرید + `purchaseReturns` در Registry + Migration.
- [ ] F7-03 مدیریت تأمین‌کنندگان + عملکرد تأمین.
- [~] F7-04 موتور FIFO — **قاعده مالک ۱۴۰۵/۰۸/۲۶: CRM موتور FIFO یا لایه جدید نمی‌سازد؛ فقط از DataProvider می‌خواند و نمایش می‌دهد (نبود مقدار = «نامشخص»).** نمایش `inventoryValueFifo` در تب «کالا و موجودی» پیاده‌سازی شده. مانده: نگاشت ETL مقدار واقعی از دیتابیس/ERP. وضعیت: PARTIAL (UI + type + honesty rule) — محاسبه واقعی NOT VERIFIED بدون اتصال زنده SQL/ERP.

## فاز ۸ — منابع انسانی، حقوق، پورسانت، عملکرد
- [~] F8-00 موجود: `payrollEngine` (فرمول پایه/مالیات/مساعده/پورسانت ساده/فیش)، Migration 021، UI در OnboardingAdmin، `/personnel-file`. شاهد تست: BLOCKED (`jalaali-js`).
- [ ] F8-01 فضای کاری HR مستقل (Landing، پرونده، حضور و غیاب، مرخصی، اضافه‌کاری، مأموریت، تاریخچه فیش). — **تصمیم مالک ۱۴۰۵/۰۸/۲۶: ضروری؛ درخواست مرخصی/ماموریت/اضافه‌کاری با تسک و تأیید مدیر؛ مساعده: ثبت درخواست ← تأیید مدیر ← ارجاع به حسابداری (با F8-04).**
- [ ] F8-02 مبنای روزانه/ضرایب/سقف مساعده قابل تنظیم (حذف هاردکد)؛ مالیات نسخه‌دار.
- [~] F8-03 Migration افزایشی ۰۲۸ اضافه شد: `hr.Employee`, `hr.Attendance`, `hr.LeaveRequest`, `hr.OvertimeRequest`, `hr.MissionRequest`, `hr.ApprovalHistory`, `hr.TargetAssignment`. جداول حقوق/مساعده/پورسانت از قبل در ۰۲۱ موجود بودند. مانده: AdvanceSettlement کامل، CommissionRule/Tier نسخه‌دار، اتصال DataProvider کامل و تست یکپارچگی روی SQL زنده (NOT VERIFIED بدون محیط). فایل: `database/sqlserver/v1/028_hr_employee_attendance_leave_mission.sql`.
- [ ] F8-04 اتوماسیون مساعده ۷ مرحله‌ای؛ تأیید ≠ پرداخت. — **تصمیم مالک: ضروری؛ درخواست نیرو ← تأیید مدیر ← ارجاع به حسابداری.**
- [ ] F8-05 هدف‌گذاری ۸ مدل + موتور پورسانت ۶ نوع + ضرایب + سه وضعیت + تعدیل مرجوعی/ابطال. (تعریف هدف و پلکان: F2-08؛ این ردیف تحقق/محاسبه است.)
- [ ] F8-06 داشبورد فروشنده (تحقق، فروش، کارتن، پورسانت، پیش‌بینی، روند، ریز فاکتور، سهم برند).
- [ ] F8-07 موتور ارزیابی عملکرد (Score=Σ FactorScore×Weight)؛ اعتراض و تأیید مدیر.
- [ ] F8-08 اتصال خروجی موتور جریمه دیرکرد مشتری به پرونده مطالبات/گزارش و گردش تأیید؛ خود موتور مشترک فقط در F4-09 تعریف و توسعه می‌شود و این ردیف موتور موازی نمی‌سازد.
- [ ] F8-09 شبیه‌ساز حقوق/عملکرد با داده واقعی و بدون ثبت تراکنش.
- [ ] F8-10 Snapshot محاسباتی و اصلاحات هر فیش در SQL.
- [ ] F8-11 چرخهٔ کامل جذب تا استخدام: درخواست جذب و فرم متقاضی، بررسی مدارک و بررسی اولیه، زمان‌بندی/ارجاع مصاحبه، نتیجه و تأیید استخدام، تبدیل پذیرفته‌شده به پرونده پرسنلی، تاریخ شروع و تاریخچه actor/time/status/reason؛ اتصال پذیرفته‌شده به هویت و حساب کاربری با جداسازی تأیید استخدام از فعال‌سازی دسترسی؛ ممیزی Provider/API/Migration و جلوگیری از Person/Employee/User تکراری.
- [ ] F8-12 مدل یگانه هویت انسانی و منبع: Person/Employee/UserAccount بدون تکثیر شخص؛ اتصال کد کاربری، کد بازرگانی، کد تفصیلی، شعبه، واحد، سمت، نقش عملیاتی و مدیر مستقیم؛ ERP read-only و موجودیت محلی فقط در نبود مرجع با `origin=LOCAL` و مالک/زمان/علت؛ انتقال تعریف کاربر/نقش عملیاتی به تعاریف پایه و باقی‌ماندن RBAC/سیاست در Settings.
- [ ] F8-13 وضعیت شغلی و تاریخچه: نوع همکاری، سمت، مسئولیت، چند نقش عملیاتی، تیم/شعبه/قلمرو، مدیر مستقیم، تاریخ شروع/پایان اعتبار و وضعیت فعال/تعلیق/خروج؛ تغییر نقش/سمت/مدیر/واحد با actor/time/reason و تاریخ اثر؛ هدف‌گذاری یا پلکان برای نقش فاقد سیاست اجباری نشود.
- [ ] F8-14 پنل آموزش اختصاصی و مسیر نقش‌محور: سطح فعلی/بعدی، دوره، محتوای نسخه‌دار، فایل و منبع، بانک سؤال، آزمون، حدنصاب، مدت/تعداد تلاش و دسترسی؛ سطح‌بندی قابل پیکربندی برای حسابدار، فروشنده، ویزیتور، راننده، موزع و سایر نقش‌ها؛ مسیرهایی مانند ویزیتور پایه ← ویزیتور حرفه‌ای ← سرپرست یا ویزیتور ← موزع فقط نمونه‌اند، نه هاردکد.
- [ ] F8-15 گردش آموزش و ارزیابی: ثبت هر تلاش/نمره؛ تکمیل محتوا → آزمون → حدنصاب → «قبول منتظر تأیید» → تأیید مدیر مجاز با هویت/زمان/نظر/نسخه محتوا و آزمون → تأیید سطح؛ مردودی، قبولی مشروط، توقف و تلاش مجدد با تاریخچه. حضور یا نمره به‌تنهایی قبولی نهایی نیست.
- [ ] F8-16 پلکان رشد و حقوق: اتصال سطح تأییدشده به سیاست حقوق/مزایا نسخه‌دار؛ پیش‌نمایش اثر، تاریخ اثر، درخواست تغییر، تأیید حقوق/مدیر مجاز، Snapshot و audit؛ بدون تغییر یا پرداخت خودکار. داشبورد رشد شامل سطح فعلی/بعدی، دوره‌ها، آزمون‌های مانده، نمرات، تأیید مدیر، درخواست حقوق و تاریخچه؛ نبود پلکان برای یک نقش «تعریف‌نشده» است نه خطای صفر. تحقق هدف و عملکرد فقط ورودی ارزیابی است و به‌تنهایی تصمیم خودکار مرخصی/مساعده/حقوق نیست.
- [ ] F8-17 محرمانگی و مجوزهای HR: تفکیک مشاهده/ویرایش پرونده، آموزش، آزمون، ارزیابی و حقوق؛ کنترل API/RLS هم‌سطح UI؛ audit همه تغییرات و تأییدها و تست دسترسی.

## فاز ۹ — گزارش‌ها و تحلیل
- [~] F9-00 موجود: `ReportsHub` (۱۱ کارت)، نمای permission-scoped، نمایش وضعیت منبع، `NeoHeatmapChart` (روز×مالک). شاهد: `reportsDashboardStyleContracts`, `reportUi/Analytics` PASS.
- [ ] F9-01 یک فهرست یگانه ۱۱ گزارش + اتصال هر KPI به `metricRegistry`؛ تعیین تکلیف `ReportEnginePanels`.
- [ ] F9-02 فیلتر دوره واقعاً محاسبه را تغییر دهد؛ گروه‌بندی ماه شمسی.
- [ ] F9-03 R1 مالی-سودآوری، R7 مطالبات (کنترل جمع بازه‌ها)، R8 نقدینگی — در مالی.
- [ ] F9-04 R2, R3, R4, R5, R6, R9 در «مشتریان و فروش»؛ R10, R11 در «بازرگانی و توزیع» (مالک پیشنهادی؛ تأیید مالک).
- [ ] F9-05 گزارش‌های تشخیصی چهارلایه D1 (ویزیت) و D2 (برگشتی) با کلیک علت=فیلتر، «ایجاد تسک».
- [ ] F9-06 گزارش‌های ضعف (W) و ۴ ترکیبی طلایی؛ «مقایسه سفارش و فروش» و «تسویه».
- [ ] F9-07 چیدمان صفحات چارت‌محور S (سودآوری، داشبورد، مالی، فروش، فروشندگان، ویزیت/پخش، خانه، عملیات، مطالبات، کالا، هوش مکانی).
- [ ] F9-08 آیکون حرارتی کنار هر گزارش؛ فعال فقط با داده مکانی واقعی؛ Heatmap مستقل برای فروش/تیم/توزیع/تحویل/مرجوعی.
- [ ] F9-09 کامپوننت‌های مشترک: کارت KPI+اسپارک، نوار فیلتر+Chip+بازنشانی، کارت بینش، Tooltip با مقایسه.
- [ ] F9-10 قوانین فنی: موبایل خوانا، Empty/Skeleton، Export تصویر/Excel، فیلتر در URL، پیام ضعف/فرصت.
- [ ] F9-11 ۵ گزارش مکانی (نقشه جامع، زون‌ها، پتانسیل، مسیر ویزیت، ناوگان) و آیکون نقشه در گزارش‌ها.
- [ ] F9-12 حذف گزارش «مغایرت‌ها و استثناها» از مقصد عملیاتی؛ تکمیل `deliveryEvents`.
- [ ] F9-13 تأیید اعداد با داده واقعی ERP/حسابداری.
- [ ] F9-14 همهٔ گزارش‌ها از حوزهٔ دید F2-14 استفاده کنند (فیلتر بر پایهٔ کد فروشنده/تفصیلی؛ سرپرست فقط تیم خود).
- [ ] F9-15 داشبورد فروش (R2+R3+R5+R6) به سبک §۹: KPI ۲×۲ با اسپارک واقعی، روند درآمد با میلهٔ برجسته، دونات منبع/گروه، رتبهٔ فروشندگان؛ تب‌های نمای کلی/فروش/عملکرد/فعالیت.
- [ ] F9-16 داشبورد خط لوله (سرنخ/فرصت/مذاکره): مجموع ارزش + ناحیه‌ای، کارت مراحل، جست‌وجو و نمای کانبان/فهرست.
- [ ] F9-17 داشبوردهای توزیع (R10+R11+D2) و مالی (R1+R7+R8) به همان کیت و الگو.
- [ ] F9-18 کارت‌ها و صفحهٔ «بینش‌ها»: ردیف بینش با برچسب وضعیت و دکمهٔ اقدام (ایجاد تسک)؛ فقط از موتور/قاعدهٔ واقعی؛ بدون AI ساختگی.
- [ ] F9-19 بازطراحی «پرونده ۳۶۰ مشتری» (`/accounts`) طبق §۹-۱ بند ۱۰: امتیاز سلامت از موتور واقعی، تایم‌لاین، نمودار ماهانه، یادداشت/توصیه، دکمهٔ گزارش.
- [ ] F9-20 تأیید بصری همهٔ داشبوردها در مرورگر 320–1440، Light/Dark، RTL (تا آن زمان `NOT VERIFIED`).
- [ ] F9-21 ریزش و زمان خرید: فهرست مشتریان در آستانهٔ ریزش و مشتریان «وقت خریدشان» (از چرخهٔ خرید واقعی فاکتور ERP، با F0-12)؛ هر ردیف دکمهٔ «ایجاد تسک ویزیت/بار دادن»؛ بدون آستانهٔ هاردکد (F2-20).
- [ ] F9-22 پیشنهاد فروش به مشتری برای ویزیتور: کالاهای پیشنهادی از سابقهٔ خرید واقعی، کالاهای ازدست‌رفته، پروموشن فعال؛ فقط از موتور/قاعدهٔ واقعی.
- [ ] F9-23 ارزش موجودی انبار (از ارزش‌گذاری/موجودی ERP) و توان پرداخت شرکت: پیش‌بینی نقدینگی آزاد و امکان انجام هزینه/صدور چک در تاریخ آینده با لحاظ موجودی نقد و بانک، وصولی‌های مورد انتظار، بدهی‌ها، چک‌ها، حقوق و تعهدات؛ این شاخص درباره توان مالی شرکت است، نه اعتبار یا سقف اعتبار مشتری. فرض‌ها و پوشش داده باید نمایش داده شود.

## فاز ۱۰ — داده، سرور و ERP واقعی
- [~] F10-00 قراردادهای SQL (۲۵ Migration؛ ممیزی ایستا ۸۴ جدول/۸۰ RLS/۵ View PASS در نوبت قبل).
- [ ] F10-00b (الزام معماری سرور) جابه‌جایی محلی→سرور فقط با تنظیمات اتصال/Provider؛ تست انتقال بدون تغییر منطق.
- [ ] F10-02b Endpointهای سرور `/ledger/journal-lines` و `/ledger/balances` (مانده تفکیکی تفصیلی×معین×دوره از `JournalLineMirror` + `DetailAccount` + `DetailSubsidiaryLink`) با RLS و مجوز مالی سمت سرور؛ پرکردن جدول‌های کدینگ/تفصیلی/گروه تفصیلی از ERP (با F10-03).
- [ ] F10-01 اجرای Migrationها روی SQL Server واقعی + آزمون RLS.
- [~] F10-02 Backend عملیاتی + مجوز سمت سرور + تست امنیت. آمادگی API تولید و جداسازی Adapter آزمایشی در ثبت اجرای ۲۰۲۶-۱۱-۱۹ آزموده شد؛ SQL Server، احراز هویت و RLS زنده همچنان بازند.
- [ ] F10-03 اتصال ERP زنده + reconciliation.
- [ ] F10-04 ممیزی نهایی FK/Index/Coverage در محیط واقعی.
- [ ] F10-05 Worker/Snapshot تولیدی KPIها.

## فاز ۱۱ — حقوقی و قراردادها
- [F] F11-01 ماژول مستقل حقوقی: جداول قرارداد، پرونده حقوقی، سند/مجوز با تاریخ انقضا، گردش تأیید، هشدار چندمرحله‌ای متصل به وظیفه/اعلان، بایگانی با دسترسی محرمانه (کاشی‌ها در فاز ۱۲). — **فریز (مالک ۱۴۰۵/۰۸/۲۶): خارج از دامنهٔ فعلی؛ حذف نشده، تا اطلاع بعدی ساخته نشود.**

## فاز ۱۲ — واحدهای سازمانی سند معماری سازمانی (منو ✔ / ماژول ناتمام)
هر ردیف ۲۷گانه: ورودی منو، آیکون و صفحهٔ وضعیت «در دست تکمیل» ساخته شده (شاهد: `plannedModulesContracts`، `moduleLandingContracts`، `navigationHierarchyContracts` PASS؛ ظاهر مرورگر NOT VERIFIED). **ماژول تکمیل‌شده نیست.** هر ردیف فقط وقتی `[x]` می‌شود که هر هفت تحویل‌شدنی در کد و تست واقعی ثابت شده باشد: ۱) رابط کاربری ۲) منطق و گردش کار ۳) پایگاه داده ۴) رابط‌های برنامه‌نویسی ۵) گزارش و داشبورد ۶) تست عملکرد/یکپارچگی ۷) نقش/مجوز/تاریخچه. وضعیت ماژول: اجراشده / ناموفق / مسدود / تأییدنشده.
- [~] F12-01 (`hr-recruitment`) جذب و استخدام — اجرا در فاز 8؛ منو/آیکون ✔؛ هفت تحویل‌شدنی `[ ]`. — **ردیف منو؛ هنگام ساخت با صاحب فاز اصلی ادغام می‌شود.**
- [~] F12-02 (`hr-applicants`) متقاضیان و پرونده استخدامی — اجرا در فاز 8؛ منو/آیکون ✔؛ هفت تحویل‌شدنی `[ ]`. — **ردیف منو؛ هنگام ساخت با صاحب فاز اصلی ادغام می‌شود.**
- [~] F12-03 (`hr-payroll`) حقوق و دستمزد (موتور حقوق موجود؛ تأییدنشده) — اجرا در فاز 8؛ منو/آیکون ✔؛ هفت تحویل‌شدنی `[ ]`. — **ردیف منو؛ هنگام ساخت با صاحب فاز اصلی ادغام می‌شود.**
- [~] F12-04 (`hr-payslip`) فیش حقوقی، مزایا و کسورات — اجرا در فاز 8؛ منو/آیکون ✔؛ هفت تحویل‌شدنی `[ ]`. — **ردیف منو؛ هنگام ساخت با صاحب فاز اصلی ادغام می‌شود.**
- [~] F12-05 (`hr-training`) آموزش کارکنان و مراحل آموزش — اجرا در فاز 8؛ منو/آیکون ✔؛ هفت تحویل‌شدنی `[ ]`. — **ردیف منو؛ هنگام ساخت با صاحب فاز اصلی ادغام می‌شود.**
- [~] F12-06 (`hr-evaluation`) سوابق آموزشی و ارزیابی عملکرد — اجرا در فاز 8؛ منو/آیکون ✔؛ هفت تحویل‌شدنی `[ ]`. — **ردیف منو؛ هنگام ساخت با صاحب فاز اصلی ادغام می‌شود.**
- [F] F12-07 (`legal-contracts`) تنظیم و مدیریت قراردادها — اجرا در فاز 11؛ منو/آیکون ✔؛ هفت تحویل‌شدنی `[ ]`. — **فریز (مالک ۱۴۰۵/۰۸/۲۶): خارج از دامنهٔ فعلی؛ حذف نشده، تا اطلاع بعدی ساخته نشود.**
- [F] F12-08 (`legal-archive`) ثبت و بایگانی قراردادها — اجرا در فاز 11؛ منو/آیکون ✔؛ هفت تحویل‌شدنی `[ ]`. — **فریز (مالک ۱۴۰۵/۰۸/۲۶): خارج از دامنهٔ فعلی؛ حذف نشده، تا اطلاع بعدی ساخته نشود.**
- [F] F12-09 (`legal-renewal`) تمدید و کنترل تاریخ اعتبار قراردادها — اجرا در فاز 11؛ منو/آیکون ✔؛ هفت تحویل‌شدنی `[ ]`. — **فریز (مالک ۱۴۰۵/۰۸/۲۶): خارج از دامنهٔ فعلی؛ حذف نشده، تا اطلاع بعدی ساخته نشود.**
- [F] F12-10 (`legal-cases`) پیگیری پرونده‌های حقوقی — اجرا در فاز 11؛ منو/آیکون ✔؛ هفت تحویل‌شدنی `[ ]`. — **فریز (مالک ۱۴۰۵/۰۸/۲۶): خارج از دامنهٔ فعلی؛ حذف نشده، تا اطلاع بعدی ساخته نشود.**
- [F] F12-11 (`legal-expiry`) هشدار انقضای اسناد و مجوزها — اجرا در فاز 11؛ منو/آیکون ✔؛ هفت تحویل‌شدنی `[ ]`. — **فریز (مالک ۱۴۰۵/۰۸/۲۶): خارج از دامنهٔ فعلی؛ حذف نشده، تا اطلاع بعدی ساخته نشود.**
- [~] F12-12 (`fin-credit-scoring`) اعتبارسنجی مشتریان — اجرا در فاز 6؛ منو/آیکون ✔؛ هفت تحویل‌شدنی `[ ]`. — **ردیف منو؛ هنگام ساخت با صاحب فاز اصلی ادغام می‌شود.**
- [~] F12-13 (`fin-liquidity`) نقدینگی و حساب‌های بانکی — اجرا در فاز 6؛ منو/آیکون ✔؛ هفت تحویل‌شدنی `[ ]`. — **ردیف منو؛ هنگام ساخت با صاحب فاز اصلی ادغام می‌شود.**
- [~] F12-14 (`fin-payments`) مدیریت پرداخت‌ها — اجرا در فاز 6؛ منو/آیکون ✔؛ هفت تحویل‌شدنی `[ ]`. — **ردیف منو؛ هنگام ساخت با صاحب فاز اصلی ادغام می‌شود.**
- [~] F12-15 (`fin-cashbox`) مدیریت صندوق — اجرا در فاز 6؛ منو/آیکون ✔؛ هفت تحویل‌شدنی `[ ]`. — **ردیف منو؛ هنگام ساخت با صاحب فاز اصلی ادغام می‌شود.**
- [~] F12-16 (`fin-budget`) بودجه‌ریزی — اجرا در فاز 6؛ منو/آیکون ✔؛ هفت تحویل‌شدنی `[ ]`. — **ردیف منو؛ هنگام ساخت با صاحب فاز اصلی ادغام می‌شود.**
- [~] F12-17 (`fin-cost-control`) کنترل هزینه‌ها — اجرا در فاز 6؛ منو/آیکون ✔؛ هفت تحویل‌شدنی `[ ]`. — **ردیف منو؛ هنگام ساخت با صاحب فاز اصلی ادغام می‌شود.**
- [~] F12-18 (`fin-reports`) گزارش‌های مالی — اجرا در فاز 9؛ منو/آیکون ✔؛ هفت تحویل‌شدنی `[ ]`. — **ردیف منو؛ هنگام ساخت با صاحب فاز اصلی ادغام می‌شود.**
- [~] F12-19 (`fin-commission`) محاسبه پورسانت — اجرا در فاز 8؛ منو/آیکون ✔؛ هفت تحویل‌شدنی `[ ]`. — **ردیف منو؛ هنگام ساخت با صاحب فاز اصلی ادغام می‌شود.**
- [~] F12-20 (`fin-invoice-discount`) تخفیفات فاکتور — اجرا در فاز 6؛ منو/آیکون ✔؛ هفت تحویل‌شدنی `[ ]`. — **ردیف منو؛ هنگام ساخت با صاحب فاز اصلی ادغام می‌شود.**
- [~] F12-21 (`fin-invoice-profit`) سود فاکتور (وابسته به FIFO) — اجرا در فاز 7؛ منو/آیکون ✔؛ هفت تحویل‌شدنی `[ ]`. — **ردیف منو؛ هنگام ساخت با صاحب فاز اصلی ادغام می‌شود.**
- [~] F12-22 (`fin-dispatch-profit`) سود برنامه توزیع — اجرا در فاز 7؛ منو/آیکون ✔؛ هفت تحویل‌شدنی `[ ]`. — **ردیف منو؛ هنگام ساخت با صاحب فاز اصلی ادغام می‌شود.**
- [~] F12-23 (`fin-cash-discount`) تخفیف نقد فاکتور و برنامه توزیع — اجرا در فاز 6؛ منو/آیکون ✔؛ هفت تحویل‌شدنی `[ ]`. — **ردیف منو؛ هنگام ساخت با صاحب فاز اصلی ادغام می‌شود.**
- [~] F12-24 (`fin-targets`) تعریف و تحقق اهداف فروش — اجرا در فاز 8؛ منو/آیکون ✔؛ هفت تحویل‌شدنی `[ ]`. — **ردیف منو؛ هنگام ساخت با صاحب فاز اصلی ادغام می‌شود.**
- [~] F12-25 (`dist-route-planning`) برنامه‌ریزی مسیر و تور ویزیت — اجرا در فاز 5؛ منو/آیکون ✔؛ هفت تحویل‌شدنی `[ ]`. — **ردیف منو؛ هنگام ساخت با صاحب فاز اصلی ادغام می‌شود.**
- [~] F12-26 (`dist-settlement-sales`) هماهنگی تسویه/برگشتی هر فاکتور با واحد فروش — اجرا در فاز 5؛ منو/آیکون ✔؛ هفت تحویل‌شدنی `[ ]`. — **ردیف منو؛ هنگام ساخت با صاحب فاز اصلی ادغام می‌شود.**
- [~] F12-27 (`dist-operations`) یکپارچگی عملیات توزیع (فاکتور، موجودی، خودرو، راننده، مشتری، تسویه، برگشتی) — اجرا در فاز 5؛ منو/آیکون ✔؛ هفت تحویل‌شدنی `[ ]`. — **ردیف منو؛ هنگام ساخت با صاحب فاز اصلی ادغام می‌شود.**
- [ ] F12-28 اطمینان نهایی: هر قابلیت فهرست سند معماری سازمانی در منو وجود دارد و هر واحد تکمیل و آزمون‌شده است؛ در غیر این صورت وضعیتش صریح «ساخته‌نشده/تأییدنشده» می‌ماند.
- [ ] F12-29 الزامات یکپارچگی ۱۲‌گانه برای تک‌تک واحدها: ماژول مستقل، منوی استاندارد، داشبورد، جداول و روابط، ذخیره دائمی در پایگاه داده، ممنوعیت داده آزمایشی، نقش و مجوز، تاریخچه تغییرات، گردش کار و تأییدیه، گزارش، هشدار سررسید/بدهی/قرارداد/وظیفه، رابط فارسی راست‌چین موبایل و دسکتاپ.

## فاز ۱۳ — کیفیت و انتشار
- [~] F13-00 تثبیت‌شده: هدر جزیره‌ای/منوی شیشه‌ای قفل (`designLockContracts`, `seamlessHeaderContracts` PASS)؛ Design Token (صفر hex خارج از seed، ۲۳۰ متغیر)؛ فارسی‌سازی (باقی‌مانده: `docs/DESIGN_SYSTEM_FA.md` §۸)؛ ثبت اولیه ممیزی (`audit:contracts` PASS ایستا).
- [ ] F13-01 تست بصری 320/360/375/390/430/768/1024/1440 + Light/Dark + RTL + Safe Area.
- [ ] F13-02 تعامل هدر/چت/اعلان/Drawer/Bottom Dock؛ دسترس‌پذیری؛ UAT.
- [x] F13-03 ادغام واژه‌نامه و وضعیت فارسی‌سازی در `docs/DESIGN_SYSTEM_FA.md` §۸ (سند جداگانهٔ ممیزی حذف شد). شاهد: `persianLocalizationContracts` (PASS در همین اجرا).
- [ ] F13-04 ZIP نهایی + `unzip -t` + بدون `node_modules`/secret.

## ثبت ممیزی‌ها (محل یگانهٔ نتایج ممیزی؛ هر ممیزی تاریخ و شاهد دارد)
- **A1 — ۱۴۰۵/۰۸/۲۵ — مسیر ثبت مشتری (F0-07).** یافته‌ها (با grep روی `server/index.mjs`، `CustomersWorkspace.tsx`، `dataProvider.ts`، `optimisticMutation.ts`): (۱) ثبت محلی مستقیم در `state.accounts` با `origin=CRM_LOCAL`/`isLocalDraft` و صف offline عمومی `accounts CREATE` انجام می‌شد؛ (۲) مسیر پیشنهاد سرور `POST /api/v1/accounts` (Outbox `crm.customer.create-proposed`، idempotency، audit، `canonicalRecordCreated:false`) فقط با `ACCOUNTS_SOURCE=typed` فعال است و هیچ مصرف‌کنندهٔ کلاینتی نداشت؛ `DataProvider.createAccount(account, idempotencyKey)` موجود ولی بی‌استفاده؛ (۳) `findDuplicateAccounts` فقط فهرست‌محور و فقط بر پایهٔ تلفن بود (تطبیق کد ملی/اقتصادی/نام نبود)؛ (۴) متن اعلان «با موفقیت در سامانه ایجاد شد» ادعای مشتری رسمی می‌کرد. وضعیت: ۲ و ۴ و ۳ اصلاح/تکمیل شد؛ ۱ (اتصال شبکه‌ای) باز و BLOCKED.
- **A2 — ۱۴۰۵/۰۸/۲۵ — `FinanceWorkspace` (F0-06).** `DOCUMENT_TYPE_LABELS`/`CapturedDocumentType` ایمپورت نشده بود (خطای زمان‌اجرا در شاخهٔ سایر اسناد) ← اصلاح؛ شاهد tests/intakePrefillBridge PASS. NOT VERIFIED: `tsc`.
- **A3 — ۱۴۰۵/۰۸/۲۵ — محدودیت روش.** این ممیزی‌ها فقط grep/خواندن بازه‌ای هدفمند بودند؛ ممیزی کل سورس (F0-03) هنوز انجام نشده است.

- **A4 — ۱۴۰۵/۰۸/۲۵ — مصرف مانده در فهرست مشتری (F0-13/F0-14).** یافته: `CustomersWorkspace` مانده را با `computeCustomerLedgerBalances(state.journalLines)` (خواندن مستقیم state، فقط تفصیلی) می‌ساخت ← با `getDetailSubsidiaryBalances` جایگزین شد. تست‌های `customerListBalancePermission` و `customerSyncExperienceContracts` قرارداد قدیمی را قفل کرده بودند و عمداً به قرارداد جدید به‌روز شدند (طراحی/قفل UI دست نخورد). **شکست از پیش موجود (نه ناشی از این نوبت، روی ZIP ورودی هم FAIL):** `tests/audit2026Contracts` سطر ۳۹ انتظار `invoice.balance` در `CustomersWorkspace` دارد که با اصل «مانده از دفتر کل» (F0-05) در تناقض است؛ نیازمند تصمیم مالک برای اصلاح/حذف آن assertion (دست‌کاری نشد). محدودیت: `ClientStorageDataProvider` مانده را از snapshot محلی می‌سازد؛ مسیر SQL (`/ledger/balances`) هنوز نیست (F10-02b) ⇒ LIVE سرور NOT VERIFIED.

- **A5 — ۲۰۲۶-۱۱-۱۶ — ممیزی هدفمند هویت و چرخه پرسنل (F2-09/F8).** یافته‌های سورس: (۱) `UserAccount` در `src/types.ts` دارای `employeeCode` است، اما فیلدهای قراردادی مشخص برای کد بازرگانی و کد تفصیلی ندارد؛ (۲) تعریف/مدیریت کاربر و نقش هنوز در `SettingsWorkspace` است؛ `handleCreateUser` رکورد را در `state.users` می‌سازد؛ (۳) `onboarding.ts` درخواست همکاری، ارجاع مصاحبه، نتیجه مصاحبه و پرونده پرسنلی متصل به `userId` را دارد و جداسازی «تأیید پرونده» از «فعال‌سازی حساب» را رعایت می‌کند؛ اما تبدیل پذیرفته‌شده به کارمند/کاربر و گردش جامع وضعیت شغلی در این مسیر اثبات نشد؛ (۴) `personnelFiles` و `onboardingApplications` در `AppState`/`stateCollections` وجود دارند، اما مسیرهای بررسی‌شده عمدتاً از State/ClientStorage استفاده می‌کنند؛ اتصال کامل سروری/Provider برای چرخه پرسنل اثبات نشد؛ (۵) در `payrollEngine` دادهٔ پرسنل و حقوق مصرف می‌شود، اما مسیر آموزشی نقش‌محور، سطوح، بانک سوالات/آزمون، تأیید PASS مدیر و اتصال قطعی سطح به پلکان افزایش حقوق در ممیزی هدفمند پیدا نشد؛ (۶) `core.AppUser` در SQL وجود دارد و `ManagerUserId` نیز Migration دارد، اما در جست‌وجوی هدفمند، مدل مستقل و کامل Employee با تاریخچه شغلی/آموزشی و نگاشت کد بازرگانی/تفصیلی اثبات نشد. وضعیت: همهٔ موارد فوق باز هستند؛ این ممیزی محدود به فایل‌ها و الگوهای ذکرشده است و جایگزین ممیزی کامل Migrationها/Provider نیست. گام اجرایی: F2-09 تا F2-13، سپس F8-11 تا F8-17؛ قبل از هر Migration، مدل و جداول موجود دوباره ممیزی شوند.

## معیار پذیرش هر صفحه (از چک‌لیست بازطراحی قبلی)
- [ ] اقدام اصلی روشن؛ ۳–۵ KPI؛ نمودار اصلی شاخص‌تر؛ رتبه‌بندی با معیار و دوره.
- [ ] داده واقعی و منبع‌دار؛ بدون اسپارک‌لاین/عدد ساختگی؛ Empty State به‌جای صفر ساختگی؛ وضعیت LIVE/LOCAL/DEMO/PARTIAL/STALE/UNAVAILABLE.
- [ ] Drill-down با RBAC؛ Timeline واقعی؛ اطلاعات حساس permission-scoped؛ CTA فقط برای عملیات مجاز.
- [ ] موبایل‌اول، RTL، Light/Dark، Touch target، Focus، Label.
- [ ] ردیف مشتری فقط نام/شماره/نشانی/مانده معتبر؛ سقف اعتبار هرگز جای بدهی نباشد؛ نشانگر سراسری سبز فقط پس از همگام‌سازی موفق بدون صف معوق.
- [ ] تست جدید در `scripts/tests.manifest.json`؛ این چک‌لیست و سند مرتبط با شاهد به‌روز.


## فاز ۱۴ — پایش عملیاتی ERP، موتور قوانین و چرخه عمر مغایرت (الحاقیه مالک ۲۰۲۶-۱۱-۱۶)
> تمام ردیف‌ها در زمان افزودن این الحاقیه `[ ]` هستند؛ وجود مشخصات یا کدهای اولیه قبلی به‌تنهایی PASS نیست. هر ردیف باید با ممیزی کد/Schema، پیاده‌سازی، تست اختصاصی و شاهد بسته شود.
- [ ] F14-01 ممیزی یکپارچه DataProvider/DataSyncController/ETL/SQL و اتصال دیتابیس تجمیعی ERP؛ تعیین منبع، نسخه، مجوز read-only، tenant/branch و پیش‌نیازهای واقعی. خروجی: نقشه مسیر داده و موارد BLOCKED.
- [ ] F14-02 انتخاب و پیاده‌سازی روش Change Detection پس از بررسی قابلیت واقعی DB (CDC/Change Tracking/Timestamp/Snapshot)؛ تشخیص Insert/Update/Delete با checkpoint و آزمون قطع/وصل.
- [ ] F14-03 تکمیل Sync Run/Event و checkpoint: batch ID، زمان، checksum، شمارش new/updated/deleted/rejected، خطا، retry و idempotent replay.
- [ ] F14-04 اجرای خودکار Ruleهای وابسته پس از Sync موفق/جزئی؛ جلوگیری از اجرای غیرضروری کل کاتالوگ و ثبت نسخه قانون/داده مبنا.
- [ ] F14-05 ممیزی و تکمیل مدل پایدار Finding در SQL؛ ابتدا جست‌وجوی جدول‌های هم‌معنا و Migrationهای موجود؛ طراحی کلید منطقی یکتا و tenant-scoped.
- [ ] F14-06 پیاده‌سازی Finding Evidence و نگهداری before/after، اسناد منبع، شواهد، confidence، source lineage و محدودیت پوشش.
- [ ] F14-07 پیاده‌سازی Finding Lifecycle و تاریخچه append-only برای NEW/OBSERVED/NEEDS_EXPLANATION/PENDING_CORRECTION/PENDING_APPROVAL/APPROVED_WITH_REASON/RESOLVED/REJECTED_WITH_REASON/REOPENED.
- [ ] F14-08 تخصیص مسئول، گروه رسیدگی، SLA/مهلت، ارجاع و تغییر مسئول با تاریخچه و RBAC.
- [ ] F14-09 ثبت نظر، توضیح، پیوست و مستندات پرونده؛ کنترل دسترسی فایل و نگهداری امن.
- [ ] F14-10 گردش تأیید/رد/استثنا با علت، مستند، تأییدکننده، تاریخ اعتبار و scope؛ استثنا نباید Rule یا تشخیص رخداد بعدی را خاموش کند.
- [ ] F14-11 Resolution Verification: فقط پس از Sync معتبر و اجرای مجدد Rule، پرونده رفع‌شده بسته شود؛ در قطع/کمبود داده پرونده باز بماند.
- [ ] F14-12 مدیریت occurrence و بازگشایی: رفع و وقوع مجدد به سابقه پیوند بخورد؛ از پرونده تکراری و حذف تاریخچه جلوگیری شود.
- [ ] F14-13 Badge Counter واقعی و تفکیک‌شده برای new/active/critical/action-required؛ Query پایدار، tenant/RBAC-scoped و تست شمارش.
- [ ] F14-14 Audit History و Notification Service برای ایجاد/تغییر/ارجاع/SLA/تأیید/رد/رفع/بازگشایی با dedupe و retry.
- [ ] F14-15 صفحه Landing حوزه‌ای: هر فضای کاری یک ورودی پایش؛ نگاشت ۱۱ حوزه مالک به ۸ فضای کاری؛ بدون آیکون یا تب مستقل برای تک‌تک قوانین.
- [ ] F14-16 صفحه یکپارچه حوزه: وضعیت منبع و آخرین Sync، KPIهای فعال/جدید/بحرانی/پوشش، روند، توزیع شدت، فهرست گروه‌بندی‌شده، فیلتر و جست‌وجو.
- [ ] F14-17 پرونده جزئیات کامل: عنوان/حوزه/شناسه ERP/نوع سند/مبلغ یا مقدار/تاریخ/شدت/Rule/قبل‌و‌بعد/شواهد/مسئول/توضیحات/پیوست/Timeline/نتیجه بررسی.
- [ ] F14-18 Rule Registry و نسخه‌بندی: شناسه، شرح، حوزه، شرط، پارامتر، شدت، پوشش، منبع، شواهد، تست و تاریخ اعتبار؛ فعال‌سازی/غیرفعال‌سازی با audit.
- [ ] F14-19 Rule Settings: آستانه، بازه زمانی، شعبه/انبار، مسئول، SLA، حداقل سود، سقف تخفیف و اقدام مورد انتظار؛ بدون business hardcode.
- [ ] F14-20 Data Mapping Catalog: برای هر قانون جدول/ویو و ستون واقعی، کلید اتصال، فیلتر tenant/branch/period، سند شواهد و وضعیت تأیید نگاشت ثبت شود؛ حدس ممنوع.
- [ ] F14-21 پوشش کامل حسابداری/مالی: تمام کنترل‌های فهرست §۱۲-۴(۱) Master Spec؛ هر کنترل دارای ruleCode/شرط/شدت/پارامتر/شواهد/تست.
- [ ] F14-22 پوشش کامل مشتری/اعتبار: تمام کنترل‌های §۱۲-۴(۲) شامل شناسه ملی مشترک، چندکدی شعب، بدهی معوق، سقف اعتبار و تغییرات غیرعادی.
- [ ] F14-23 پوشش کامل فروش/سفارش: تمام کنترل‌های §۱۲-۴(۳)، به‌ویژه سود فاکتور بر مبنای بهای تمام‌شده واقعی، مالیات، تخفیف و هزینه مرتبط.
- [ ] F14-24 پوشش کامل خرید/تأمین‌کننده: تمام کنترل‌های §۱۲-۴(۴) و تطبیق فاکتور/رسید/سند/پرداخت.
- [ ] F14-25 پوشش کامل خزانه/بانک: تمام کنترل‌های §۱۲-۴(۵) از جمله دریافت تخصیص‌نیافته، پرداخت تکراری، تغییر حساب بانکی و چک.
- [ ] F14-26 پوشش کامل انبار: تمام کنترل‌های §۱۲-۴(۶)؛ اختلاف واقعی فقط در صورت داده شمارش واقعی؛ عدم وجود شمارش = NOT EVALUATED.
- [ ] F14-27 پوشش کامل پخش/حمل/توزیع: تمام کنترل‌های §۱۲-۴(۷) و چرخه فاکتور تا تحویل و تسویه.
- [ ] F14-28 پوشش کامل قیمت‌گذاری/تخفیف: تمام کنترل‌های §۱۲-۴(۸)، طرح مصوب و حداقل حاشیه سود.
- [ ] F14-29 پوشش کامل پورسانت/عملکرد: تمام کنترل‌های §۱۲-۴(۹) با مبنای فروش قطعی/خالص/وصول طبق سیاست مصوب.
- [ ] F14-30 پوشش کامل کاربران/کنترل داخلی: تمام کنترل‌های §۱۲-۴(۱۰)، تفکیک وظایف و تغییرات حساس.
- [ ] F14-31 پوشش کامل کیفیت داده و ساختار: تمام کنترل‌های §۱۲-۴(۱۱)، ارتباطات شکسته و فرآیندهای نیمه‌تمام.
- [ ] F14-32 پوشش کامل تطبیق بین‌ماژولی: تمام کنترل‌های §۱۲-۴(۱۲) با مبلغ/تعداد/وضعیت و سندهای مرتبط.
- [ ] F14-33 پوشش کامل کنترل‌های اختصاصی پخش: تمام کنترل‌های §۱۲-۴(۱۳)، سودآوری و اختلاف عملکرد ویزیتورها.
- [ ] F14-34 علت‌یابی بستانکاری مشتری: تطبیق مانده تفصیلی×معین×دوره با فاکتور، برگشت، دریافت نقد/بانک، چک، پیش‌پرداخت، سند اصلاحی، تسویه و تخصیص‌ها.
- [ ] F14-35 سناریوهای علت‌یابی: دریافت تخصیص‌نیافته/پیش‌پرداخت/دریافت تکراری/برگشت/تفصیلی اشتباه/مشتری اشتباه/اصلاحیه/اختلاف زمانی/انتقال مانده/چک/تسویه؛ فقط با شواهد.
- [ ] F14-36 خروجی علت‌یابی: فرضیه، سند، مبلغ، تاریخ، confidence توضیح‌پذیر، شواهد موافق/مخالف، داده بررسی‌نشده و «علت نامشخص» در نبود شواهد.
- [ ] F14-37 کارتابل تصمیم مالی: تأیید بستانکاری معتبر با علت/مدرک و تأیید مدیر، یا اعلام مغایرت و ارجاع اصلاح در ERP؛ ثبت تاریخچه کامل.
- [ ] F14-38 آزمون end-to-end مغایرت: کشف، Badge، پرونده، توضیح/پیوست، تأیید، اصلاح ERP، Sync، رفع، حفظ سابقه، occurrence مجدد و dedupe.

## پیش‌نیازهای مشترک پایش ERP، منابع انسانی و تحویل
> ردیف‌های جذب، هویت، آموزش و پلکان حقوق فقط یک‌بار در فاز ۸ نگهداری می‌شوند؛ ردیف‌های F15-01 تا F15-18 در F8-11 تا F8-17 ادغام شدند. موارد زیر پیش‌نیاز مشترک باقی‌مانده‌اند و شناسه جدید F14-39 تا F14-47 دارند.
- [ ] F14-39 دریافت/ثبت مشخصات دیتابیس تجمیعی ERP، نسخه موتور، دسترسی read-only، Schema/Data Dictionary و محیط تست؛ در نبود آن، فقط ردیف‌های وابسته BLOCKED شوند.
- [ ] F14-40 تعیین و مستندسازی روابط واقعی اسناد مالی: فاکتور، برگشت، دریافت، تخصیص، چک، پیش‌پرداخت، سند اصلاحی، تسویه، تفصیلی و معین.
- [ ] F14-41 تعریف نقش‌های مسئول رسیدگی/تأیید در هر حوزه و ماتریس RBAC واقعی؛ تأییدکننده نباید در موارد نیازمند تفکیک وظایف همان ثبت‌کننده باشد.
- [ ] F14-42 تست حجم بالا، pagination، index/query plan و عدم افت عملکرد Sync/Rule/Badge؛ معیار حجم بر اساس داده واقعی/توافق مالک ثبت شود.
- [ ] F14-43 تست قطع و وصل ارتباط، retry/backoff، checkpoint، replay، عدم overwrite داده جدید و عدم بستن اشتباه پرونده.
- [ ] F14-44 ممیزی امنیتی secrets، read-only ERP، audit، RLS، tenant isolation، پیوست‌ها و دسترسی داده حساس.
- [ ] F14-45 کنترل تطبیق تمام داشبوردها و گزارش‌ها با Query دیتابیس و ثبت پوشش/تازگی/منبع.
- [ ] F14-46 گزارش نهایی قبل/بعد، قابلیت‌های عملیاتی، ناقص، BLOCKED و NOT VERIFIED؛ نصب/استقرار و نسخه/تاریخ دقیق.
- [ ] F14-47 ZIP کامل سورس با `unzip -t` موفق، فایل‌های پروژه حاضر، بدون node_modules/secret؛ Build و تست‌ها فقط در صورت اجرای واقعی PASS شوند.

### ثبت ممیزی مستندات — A7 (۲۰۲۶-۱۱-۱۷)
- تعریف محصول یکپارچه شد: مرز ERP/CRM، تحلیل سفارش و فاکتور ERP، طبقه‌بندی ریسک/نقدی/فرصت افزایش فروش، میز مذاکره روی سفارش، دستور پرداخت قطعی/غیرقطعی، توان پرداخت شرکت، تسک سراسری، مالی، HR، انبار، هوش جغرافیایی و پایش در Master Spec مرجع شدند.
- ردیف‌های تکراری مدیریت پرسنل F15-01 تا F15-18 با حفظ تمام الزامات در F8-11 تا F8-17 ادغام شدند؛ پیش‌نیازهای مشترک سابق F15-19 تا F15-27 به F14-39 تا F14-47 منتقل شدند. F4-09 تنها مالک موتور جریمه است؛ F8-08 فقط اتصال خروجی آن به مطالبات را پیگیری می‌کند.
- تعریف تفصیلی پایش/علت‌یابی/HR/مدل داده/پذیرش در بخش‌های ۱۲ تا ۱۶ Master Spec باقی ماند، اما بخش‌های اصلی فقط خلاصه و ارجاع می‌دهند تا مرجع موازی ساخته نشود. هیچ موتور یا فایل اجرایی حذف نشده است.
- تست‌های اجراشده این نوبت: `node tests/documentationSetContracts.test.mjs` = PASS؛ `node tests/analyticsConstitutionContracts.test.mjs` = 4/4 PASS. این نوبت فقط مستندات، README، قرارداد مستندات و Checklist را اصلاح می‌کند؛ هیچ قابلیت اجرایی، API، Provider، SQL یا موتور جدیدی پیاده‌سازی نشده و هیچ ردیف اجرایی به PASS تبدیل نشده است.

### ثبت ممیزی مستندات — A6
- **۲۰۲۶-۱۱-۱۶ — تبدیل درخواست جامع مالک به Backlog اجرایی برای عامل بعدی.** چهار سند موجود (`INSTRUCTIONS.md`، `docs/CONSTITUTION_FA.md`، `docs/CHECKLIST_FA.md`، `docs/MASTER_SPEC_FA.md`) به‌صورت الحاقی به‌روزرسانی شدند. Master Spec بخش‌های ۱۲ تا ۱۶ را دریافت کرد؛ Constitution اصول K/L؛ Checklist فازهای F14/F15؛ Instructions ترتیب خواندن و فرمان تحویل‌کار عامل بعدی. این تغییر فقط مستندات است؛ هیچ کد اجرایی/SQL/API/Provider تغییر نکرده و هیچ تست نرم‌افزاری اجرا نشده است. وضعیت تمام ردیف‌های جدید `[ ]`؛ اتصال ERP و نگاشت جداول تا دریافت Schema و دسترسی واقعی ممکن است BLOCKED بماند.


**گزارش ادغام کنترل‌شده ۱۴۰۵/۰۸/۲۷:** مبنا ZIP v0.12.90، کاندید Ki.txt و گزارش Py.txt. فقط سه فایل موتور/تنظیمات بالا اعمال شدند و یک تست جدید به Manifest اضافه شد؛ بقیهٔ کاندیدها، به‌خصوص فایل‌های دارای بلوک تکراری یا ناقص و تغییرات هدر قفل‌شده، عمداً جایگزین نشدند. آزمون‌های گسترده و اتصال SQL اجرا نشده‌اند؛ هیچ مورد دیگری تیک نخورده است.


## گزارش ممیزی ادغام کدهای AI — ۱۴۰۵/۰۸/۲۷ (۲۰۲۶-۱۱-۱۸)

مرجع: Ki.txt، گزارش بازبینی Py.txt و ZIP نسخه 0.12.90. وضعیت «ادغام» به معنای پایان قابلیت عملیاتی یا تأیید کامپایل نیست. فایل‌های تکراری/ناقص جایگزین نشده‌اند.

**مبنای کنترل رگرسیون:** نسخه reviewed_partial: ۱۱۸ تست PASS و ۱۵ FAIL؛ خروجی حاضر: ۱۱۸ PASS و ۱۵ FAIL؛ هیچ FAIL تازه در اجرای Manifest مشاهده نشد. ۱۵ FAIL قدیمی هنوز باید رفع شوند. اجرای TypeScript build و مرورگر/SQL/ERP: NOT VERIFIED.

**فایل‌های اعمال‌شده/تغییریافته نسبت به نسخه reviewed_partial:**
- [~] `src/lib/metricConfig.ts` — کد نامزد اعمال شد؛ تست جامع و سناریوی عملیاتی نهایی NOT VERIFIED.
- [~] `src/components/shared/GlobalFloatingIntakeDrawer.tsx` — کد نامزد اعمال شد؛ تست جامع و سناریوی عملیاتی نهایی NOT VERIFIED.
- [~] `src/components/HomeWorkspace.tsx` — کد نامزد اعمال شد؛ تست جامع و سناریوی عملیاتی نهایی NOT VERIFIED.
- [~] `src/components/LeadsWorkspace.tsx` — کد نامزد اعمال شد؛ تست جامع و سناریوی عملیاتی نهایی NOT VERIFIED.
- [~] `src/components/Customer360.tsx` — کد نامزد اعمال شد؛ تست جامع و سناریوی عملیاتی نهایی NOT VERIFIED.
- [~] `src/components/ReportsHub.tsx` — کد نامزد اعمال شد؛ تست جامع و سناریوی عملیاتی نهایی NOT VERIFIED.
- [~] `src/components/CalendarWorkspace.tsx` — کد نامزد اعمال شد؛ تست جامع و سناریوی عملیاتی نهایی NOT VERIFIED.

**فایل‌های بررسی‌شده ولی برای جلوگیری از رگرسیون به نسخه پایه برگردانده‌شده:**
- [ ] `src/services/churnPredictionService.ts` — نیازمند ادغام خطی، رفع ناسازگاری قرارداد و تست اختصاصی؛ جایگزینی خام پذیرفته نشد.
- [ ] `src/services/collectionEngine.ts` — نیازمند ادغام خطی، رفع ناسازگاری قرارداد و تست اختصاصی؛ جایگزینی خام پذیرفته نشد.
- [ ] `src/lib/headerQuickActions.ts` — نیازمند ادغام خطی، رفع ناسازگاری قرارداد و تست اختصاصی؛ جایگزینی خام پذیرفته نشد.
- [ ] `src/lib/moduleLanding.ts` — نیازمند ادغام خطی، رفع ناسازگاری قرارداد و تست اختصاصی؛ جایگزینی خام پذیرفته نشد.
- [ ] `src/lib/navigation.ts` — نیازمند ادغام خطی، رفع ناسازگاری قرارداد و تست اختصاصی؛ جایگزینی خام پذیرفته نشد.
- [ ] `src/components/Layout.tsx` — نیازمند ادغام خطی، رفع ناسازگاری قرارداد و تست اختصاصی؛ جایگزینی خام پذیرفته نشد.
- [ ] `src/components/ModuleLandingWorkspace.tsx` — نیازمند ادغام خطی، رفع ناسازگاری قرارداد و تست اختصاصی؛ جایگزینی خام پذیرفته نشد.
- [ ] `src/services/tourEngine.ts` — نیازمند ادغام خطی، رفع ناسازگاری قرارداد و تست اختصاصی؛ جایگزینی خام پذیرفته نشد.
- [ ] `tests/churnErpInvoiceSource.test.mjs` — نیازمند ادغام خطی، رفع ناسازگاری قرارداد و تست اختصاصی؛ جایگزینی خام پذیرفته نشد.
- [ ] `tests/headerQuickActionsAndNav.test.mjs` — نیازمند ادغام خطی، رفع ناسازگاری قرارداد و تست اختصاصی؛ جایگزینی خام پذیرفته نشد.
- [ ] `scripts/tests.manifest.json` — نیازمند ادغام خطی، رفع ناسازگاری قرارداد و تست اختصاصی؛ جایگزینی خام پذیرفته نشد.
- [ ] `src/components/DashboardWorkspace.tsx` — نیازمند ادغام خطی، رفع ناسازگاری قرارداد و تست اختصاصی؛ جایگزینی خام پذیرفته نشد.
- [ ] `src/components/QuotesWorkspace.tsx` — نیازمند ادغام خطی، رفع ناسازگاری قرارداد و تست اختصاصی؛ جایگزینی خام پذیرفته نشد.
- [ ] `src/components/EnterpriseWorkspaces.tsx` — نیازمند ادغام خطی، رفع ناسازگاری قرارداد و تست اختصاصی؛ جایگزینی خام پذیرفته نشد.
- [ ] `src/components/OperationsControlWorkspace.tsx` — نیازمند ادغام خطی، رفع ناسازگاری قرارداد و تست اختصاصی؛ جایگزینی خام پذیرفته نشد.

**ورودی ناقص:** `src/components/FinanceWorkspace.tsx` در Ki.txt فاقد FILE_END و کد انتهایی است؛ جایگزین نشده. همچنین شروع تکراری ناقص برای `Customer360.tsx` و `tests.manifest.json` نادیده گرفته شد. متن چک‌لیست تولیدشده توسط AI جایگزین چک‌لیست اصلی نشد تا ردیف‌های موجود از دست نروند.

**گام باقی‌مانده:** رفع ۱۵ تست پایه، ادغام خطی فایل‌های برگشتی با حفظ قفل هدر/منو و قرارداد ERP، TypeScript/Browser/SQL verification؛ وضعیت هیچ ردیف وابسته صرفاً بر اساس تولید کد `[x]` نشد.


### ممیزی ادغام کدهای AI — ۱۴۰۵/۰۸/۲۷ (۲۰۲۶-۱۱-۱۸)

این گزارش فقط وضعیت ادغام فایل‌های ارسالی Ki.txt را ثبت می‌کند؛ تکمیل کل پروژه را اثبات نمی‌کند. برای هیچ ردیف جدیدی بدون شواهد End-to-End علامت [x] درج نشده است.

| فایل | وضعیت |
|---|---|
| `src/lib/metricConfig.ts` | `APPLIED_EXACT` |
| `src/services/churnPredictionService.ts` | `APPLIED_EXACT` |
| `src/services/collectionEngine.ts` | `APPLIED_EXACT` |
| `src/lib/headerQuickActions.ts` | `APPLIED_EXACT` |
| `src/lib/moduleLanding.ts` | `APPLIED_EXACT` |
| `src/lib/navigation.ts` | `APPLIED_EXACT` |
| `src/components/Layout.tsx` | `APPLIED_EXACT` |
| `src/components/ModuleLandingWorkspace.tsx` | `APPLIED_EXACT` |
| `src/services/tourEngine.ts` | `APPLIED_EXACT` |
| `tests/churnErpInvoiceSource.test.mjs` | `APPLIED_EXACT` |
| `tests/headerQuickActionsAndNav.test.mjs` | `APPLIED_EXACT` |
| `scripts/tests.manifest.json` | `PENDING_MANIFEST_MERGE` |
| `docs/CHECKLIST_FA.md` | `RECONCILED_NOT_OVERWRITTEN` |
| `src/components/shared/GlobalFloatingIntakeDrawer.tsx` | `APPLIED_EXACT` |
| `src/components/HomeWorkspace.tsx` | `APPLIED_EXACT` |
| `src/components/DashboardWorkspace.tsx` | `REVIEWED_NOT_APPLIED_CONFLICT` |
| `src/components/LeadsWorkspace.tsx` | `APPLIED_EXACT` |
| `src/components/QuotesWorkspace.tsx` | `REVIEWED_NOT_APPLIED_CONFLICT` |
| `src/components/Customer360.tsx` | `APPLIED_EXACT` |
| `src/components/ReportsHub.tsx` | `APPLIED_EXACT` |
| `src/components/CalendarWorkspace.tsx` | `APPLIED_EXACT` |
| `src/components/EnterpriseWorkspaces.tsx` | `REVIEWED_NOT_APPLIED_CONFLICT` |
| `src/components/OperationsControlWorkspace.tsx` | `REVIEWED_NOT_APPLIED_CONFLICT` |

**بلوک‌های ناقص/تکراری در ورودی:** `scripts/tests.manifest.json`, `src/components/Customer360.tsx`, `src/components/FinanceWorkspace.tsx`؛ بخش ناقص FinanceWorkspace قابل جایگزینی نیست. نسخه کامل Customer360 از بلوک بسته استخراج شده ولی با سورس موجود تفاوت گسترده دارد؛ بدون کنترل قراردادها جایگزین نشد.

**شواهد تست در نسخه ادغام جدید:** `designLockContracts` PASS؛ `seamlessHeaderContracts` PASS؛ `headerQuickActionsAndNav` PASS با Node type-stripping و resolver؛ `moduleLandingContracts` ۵ PASS / ۰ FAIL؛ `tourCoverageContracts` ۹ PASS / ۰ FAIL (پس از اصلاح قراردادهای قدیمی و اتصال هدف‌های واقعی راهنما). اجرای کامل build/tsc، مرورگر، SQL Server و ERP = NOT VERIFIED. **این نسخه آماده انتشار نیست.**

**کار باقی‌مانده:** تطبیق قراردادهای قدیمی با مسیرهای مصوب بدون شکستن Deep Linkها؛ اصلاح تورها؛ حل تعارضات Dashboard/Quotes/Customer360/Enterprise/Operations؛ ادغام Manifest بدون حذف تست‌های پایه؛ بازبینی بصری و اجرای تست‌های سراسری و build؛ دریافت ادامهٔ FinanceWorkspace.

### رفع تعارض چهار فایل — ۲۰۲۶-۱۱-۱۸ (ادامه)

- [~] `DashboardWorkspace.tsx`: تغییرات Ki با مبنای ZIP اولیه و سورس ادغام‌شده با `git merge-file` سه‌طرفه ادغام شد؛ تعارض متنی صفر؛ بررسی اجرای UI/TypeScript هنوز تأیید نشده است.
- [~] `QuotesWorkspace.tsx`: ادغام سه‌طرفه انجام شد؛ تعارض متنی صفر؛ آزمون CPQ و ERP هنوز تأیید نشده است.
- [~] `EnterpriseWorkspaces.tsx`: ادغام سه‌طرفه انجام شد؛ تعارض متنی صفر؛ کنترل UI هنوز تأیید نشده است.
- [~] `OperationsControlWorkspace.tsx`: ادغام سه‌طرفه انجام شد؛ تعارض متنی صفر؛ کنترل گزارش‌های عملیاتی هنوز تأیید نشده است.
- [x] تست `headerQuickActionsAndNav.test.mjs` به Manifest اضافه شد و با runner رسمی PASS شد (۱ فایل تست موفق).
- [x] `moduleLandingContracts.test.mjs`: قرارداد هشت فضای مصوب و Deep Linkهای قدیمی بازنگری شد؛ ۵/۵ PASS در ۲۰۲۶-۱۱-۱۸.
- [x] `tourCoverageContracts.test.mjs`: هدف‌های واقعی Audit و ReportsHub متصل و شمارش ۲۷ ماژول اصلاح شد؛ ۹/۹ PASS در ۲۰۲۶-۱۱-۱۸.
- [ ] `FinanceWorkspace.tsx`: بلوک Ki ناقص است و جایگزینی مستقیم آن انجام نشده؛ حفظ سورس سالم.

**محدودیت مهم:** صفر بودن تعارض متنی به معنی موفقیت کامپایل، صحت عملکرد یا انتشارپذیری نیست. هیچ موردی بدون شاهد تست کامل به‌عنوان تکمیل نهایی ثبت نشده است. جدول قدیمی وضعیت ادغام در بالای این بخش تاریخچهٔ قبل از این ادغام است؛ وضعیت چهار فایل بالا اکنون «MERGED_UNVERIFIED» است.


### پیگیری اختصاصی رفع ۷ خطای Landing/Tour — ۲۰۲۶-۱۱-۱۸
- [x] چهار خطای `moduleLandingContracts`: پنج تست موفق؛ قراردادها با هشت فضای مصوب و نگاشت Deep Link قدیمی منطبق شد.
- [x] سه خطای `tourCoverageContracts`: نه تست موفق؛ شناسه واقعی `audit-heading` و `reports-domain-selector` در UI اضافه شد و تور به آن‌ها اشاره می‌کند؛ ماژول audit به شمارش تست افزوده شد.
- [x] تست هم‌حوزه `headerQuickActionsAndNav`: PASS.
- [ ] تأیید TypeScript/build و مرورگر: NOT VERIFIED (طبق محدودیت اجرای پروژه انجام نشد).
- [ ] سایر ردیف‌های باز چک‌لیست و یکپارچگی ERP/SQL: خارج از دامنه این اصلاح؛ همچنان NOT VERIFIED.

### اجرای ۲۰۲۶-۱۱-۱۸ — F0-14: وضعیت خطای Provider در مصرف‌کنندگان مالی
- **PASS (کد و تست هدفمند):** `FinanceWorkspace.tsx` خطای درخواست مانده را به `UNAVAILABLE` تبدیل می‌کند، به‌جای نمایش دائمی `LOADING`، و دکمه تلاش مجدد دارد. منبع خطا از Provider فعال گرفته می‌شود و عدد ساختگی ساخته نمی‌شود.
- **PASS (کد و تست هدفمند):** `OrderDetailsDrawer.tsx` فقط در حالت باز بودن پنجره، وجود سفارش و مجوز مالی درخواست مانده می‌دهد؛ خطای Provider به‌عنوان مانده قبلی معتبر تلقی نمی‌شود.
- **PASS (تست):** `node --experimental-strip-types --import ./scripts/register-ts-resolver.mjs --test tests/ledgerProviderUiFailureContracts.test.mjs tests/ledgerProviderFilterParity.test.mjs tests/ledgerJournalQuery.test.mjs tests/ledgerBalanceProjection.test.mjs` برابر **۱۱ PASS / ۰ FAIL**؛ تست جدید در Manifest ثبت و پرچم‌های اجرای تست parity اصلاح شد.
- **NOT VERIFIED:** اجرای UI در مرورگر، TypeScript/build کامل، اتصال ERP/SQL Server و بررسی همه مصرف‌کنندگان مستقیم State. F0-14 بسته نشده؛ گام بعدی F0-14 انتقال گزارش‌های دفتری `ReportEnginePanels` از `state.journalLines` به DataProvider با حفظ قرارداد محاسبه سود و زیان و فیلترهای مالی.


## ثبت یکپارچه‌سازی A/B و بررسی Ch — ۱۴۰۵/۰۸/۲۸
- **[~] F0-14:** تغییرات ارائه‌دهنده داده P&L و مصرف‌کنندگان گزارش‌ها از A اعمال شد؛ بخش‌های Geo/Tasks و آزمون قرارداد از B ادغام شدند. تداخل فایل Geo با نسخه ناقص A به نفع نسخه کامل B حل شد.
- **PASS:** آزمون اختصاصی `reportPnlDataProviderContracts.test.mjs` پس از اصلاح ارجاع مستقیم `coaMirror` در ReportEnginePanels.
- **اصلاح صف:** ثبت وضعیت زون با شناسه واقعی؛ ساخت وظیفه‌های وصول با شناسه و payload مستقل. صف انتساب‌های گروهی زون به دلیل نبود قرارداد اتمیک معتبر فعلاً ارسال نمی‌شود و به تکمیل Provider/API نیاز دارد.
- **NOT VERIFIED:** TypeScript/Build کامل، SQL Server، RLS و اجرای انتهابه‌انتها؛ گزارش Ch به‌عنوان شواهد بررسی ثانویه در نظر گرفته شد، نه تأیید قطعی رفع تمام ایرادها.
- **باقی:** اطمینان از ذخیره پایدار نسخه هندسه، پیوست مدارک و انتساب‌های گروهی در Backend؛ بررسی اتصال واقعی P&L و بهبود refresh در صورت تغییرات سرور.

### اصلاح رگرسیون قرارداد هوش مکانی — ۱۴۰۵/۰۸/۲۸
- **PASS (آزمون اختصاصی):** `node tests/geoWorkspaceContracts.test.mjs` — هر ۴۶ assertion موفق. تست قدیمی به‌جای وابستگی به رشتهٔ ثابت `path: '/workspace/commerce'`، نگاشت واقعی مسیر `/geo-intelligence` به فضای `commerce` را در `navigation.ts` بررسی می‌کند؛ وجود tile در Landing همچنان کنترل می‌شود.
- **PASS (آزمون اختصاصی):** قرارداد اعلان وظیفه با پذیرش cast نوعی `task as any` و بدون تغییر شرط اجرای موتور `processTaskCollaborationEvents` اصلاح شد.
- **بدون تغییر محصول:** فقط `tests/geoWorkspaceContracts.test.mjs` اصلاح شد؛ هدر، ناوبری، Landing و منطق اجرایی تغییر نکردند.
- **NOT VERIFIED:** تست مرورگر، Build/TypeScript و اتصال واقعی SQL/ERP. این اصلاح فقط شکست قدیمی قرارداد هوش مکانی را برطرف می‌کند و تکمیل F0-14 یا کل A/B/Ch محسوب نمی‌شود.
- **گام بعد:** F0-14 — صحت دریافت/تازه‌سازی داده‌های دفترکل در Provider و رفع موارد باز همگام‌سازی Geo.

---

## ثبت اجرای فاز ۷/۸/۱۲ — ۲۰۲۶-۱۱-۱۹ (v0.12.63)

**دامنه اجرا:** تکمیل قابل‌اجرای فازهای ۷، ۸ و ۱۲ روی سورس موجود (بدون بازنویسی موازی).

### تغییرات اعمال‌شده
1. **Migration 028** (`database/sqlserver/v1/028_hr_employee_attendance_leave_mission.sql`): جداول `hr.Employee`, `Attendance`, `LeaveRequest`, `OvertimeRequest`, `MissionRequest`, `ApprovalHistory`, `TargetAssignment` — افزایشی، idempotent، tenant-scoped.
2. **F7-04**: وضعیت به‌روز مطابق قاعده مالک (CRM فقط خواندن FIFO از DataProvider؛ نمایش «نامشخص»). UI موجود در `OperationsSupplementalTabs.InventoryTab` حفظ شد.
3. نسخه پکیج به `0.12.63` ارتقا یافت.
4. تست قرارداد `tests/fifoInventoryHonestyContracts.test.mjs` برای honesty قانون FIFO.

### وضعیت فازها (خلاصه صادقانه)
| فاز | وضعیت کلی | توضیح |
|-----|-----------|--------|
| فاز ۷ | PARTIAL | F7-01/02/03 هنوز درخواست آزمایشی (PR-TEST) و بدون سفارش/رسید/برگشت کامل؛ F7-04 طبق قاعده مالک فقط خواندن (PARTIAL) |
| فاز ۸ | PARTIAL | F8-00 موجود؛ F8-03 جداول پایه Migration شد؛ F8-01/04/05/… UI و گردش کامل و DataProvider پایدار نشده‌اند |
| فاز ۱۲ | MOSTLY MENU | اکثر ردیف‌ها منو/آیکون دارند و مالک منطق در فاز صاحب هستند؛ F12-07..11 FROZEN؛ F12-28/29 اطمینان نهایی باز است |

### موارد باقی‌مانده با اولویت
- F7-01: تبدیل جریان خرید از PR-TEST به سفارش واقعی + رسید + اتصال موجودی (بدون mock).
- F7-02: purchaseReturns + Migration + کنترل مقدار مجاز.
- F8-01: Landing مستقل HR + اتصال به جداول ۰۲۸.
- F8-04: گردش ۷مرحله‌ای مساعده (تأیید ≠ پرداخت).
- F8-05: مدل‌های هدف و موتور پورسانت بدون موازی‌سازی با payrollEngine موجود.
- اتصال سود فاکتور/برنامه (F12-21/22) به منبع بهای معتبر (نه آخرین خرید).
- تست‌های End-to-End روی SQL Server زنده → فعلاً NOT VERIFIED.

**قانون تحویل:** این نسخه کامل و نهایی اعلام نمی‌شود. ادامه کار از F7-01 و تکمیل DataProvider برای جداول ۰۲۸.


## فاز ۱۷ — اتاق فرمان مالی و پیگیری اجرایی (الحاقیه مالک؛ مالکیت موتورهای قبلی حفظ شود)
- [ ] F17-01 اتاق فرمان «فروش تا واریز قطعی»: آبشار فروش/مانده/چک/بانک، تفکیک وصول قطعی از چک در راه، علت اختلاف، دوره/منبع/Drill-down، عدم دوباره‌شماری؛ وابسته به F6-04 و منابع ERP/بانک.
- [ ] F17-02 کارتابل وصول مانورپذیر: سنی و ریسک مطالبات بر مبنای تفصیلی×معین×دوره، فیلتر/انتخاب گروهی/ارجاع، مالک/مبلغ هدف/SLA/وعده/تماس/مراجعه/یادآور/تشدید؛ نتیجه تنها با تطبیق وصول واقعی بسته شود؛ مرتبط با F8-08 و F4-09.
- [ ] F17-03 موتور نقدینگی عملیاتی: ادغام سنجیده دو نسخه cashFlowEngine، مانده بانک/صندوق، انتقال داخلی خنثی، پیش‌بینی سناریویی، تعهدات، تاریخ کسری، کیفیت داده و ممنوعیت توان پرداخت با داده ناقص؛ مالک فاز ۶.
- [ ] F17-04 موتور سود فاکتور و تحلیل چندبعدی: FIFO معتبر، تخفیف/برگشت/حمل، سود ناخالص و عملیاتی با تفکیک، مارجین/مارک‌آپ، گزارش زیان و کف سود؛ RBAC سمت API/SQL و Audit؛ مرتبط با F12-21/F14-23 و فاز ۷.
- [ ] F17-05 نقشه مصرف پول و هزینه: دو نمای «پرداخت نقدی» و «هزینه شناسایی‌شده»، Top N و روند/بودجه/انحراف، کدینگ/مرکز هزینه/پروژه/طرف حساب، جداسازی خرید موجودی، بدهی، انتقال و سرمایه‌ای؛ Drill-down سند واقعی.
- [ ] F17-06 پروژه‌ها و ساخت‌وساز: تفکیک CAPEX از OPEX، بودجه/قرارداد/پیمانکار/فاز/پیش‌پرداخت/تعهد/پرداخت/انحراف؛ طبقه‌بندی نامعلوم بدون حدس، ایجاد تسک مغایرت.
- [ ] F17-07 تاریخچه و عملکرد تسک: Timeline تغییرناپذیر، ارجاع/تمدید/تأیید/رد/بازگشایی، گزارش تیم/کارمند، SLA، اثربخشی مبلغ وصول‌شده، فیلتر و Drill-down به مشتری/چک/فاکتور/پروژه؛ مرتبط با F14-14.
- [ ] F17-08 پذیرش و کنترل: تست edge cases و سناریوهای واقعی/کنترل‌شده، reconciliation بانک/ERP، صحت محاسبات و دسترسی‌ها، UI موبایل RTL و طراحی قفل‌شده، تست‌های Provider/API/SQL و ثبت PASS/FAIL/BLOCKED/NOT VERIFIED با شاهد. گزارش‌های فاز ۹ نیز از حیث صحت داده، مجوز، فیلتر، Drill-down و تسک ممیزی شوند؛ تکمیل خودکار ممنوع.


## فاز ۱۸ — تکمیل سراسری و لندینگ مرجع مالک (وابسته به همه فازها؛ فاز مستقل موازی نساز)
- [ ] F18-01 بازبینی کل Checklist از اولین ردیف باز تا آخرین ردیف؛ تکمیل همهٔ فازها، نه فقط فاز مالی، با شواهد اجرایی و تست.
- [ ] F18-02 تطبیق Landing هشت فضای کاری با `docs/design-reference/landing-owner-reference-2026-11-19.webp`: گروه‌بندی زیرمجموعه‌ها، آیکون‌های گرد، شبکه ۴ستونه، باز/بسته‌شدن واقعی، RTL موبایل؛ بدون تغییر هدر/منوی قفل‌شده.
- [ ] F18-03 کنترل تک‌تک کاشی‌ها، Routeها، Deep Linkها، عملیات + زمینه‌ای و RBAC؛ هیچ دکمهٔ بی‌عمل یا صفحهٔ نمایشی.
- [ ] F18-04 قرارداد دادهٔ پویا و SQL-first برای تمام ماژول‌ها، گزارش‌ها، نمودارها و اعلان‌ها؛ جایگزینی خودکار منبع واقعی با اتصال معتبر، بدون fallback ساختگی و با نمایش وضعیت قطع اتصال.
- [ ] F18-05 نگاشت نسخه‌دار User↔PersonnelCode↔ERPUser و AccountDetailCode با Scope و تعارض/اعتبار؛ کنترل Role+Scope در API/SQL و منع افشای دادهٔ نامجاز.
- [ ] F18-06 اعلان امن سراسری: مجوز هنگام ایجاد/نمایش/بازکردن، Deep Link، dedupe، تاریخچه، تغییر نقش و ابطال نگاشت، عدم افشای پیش‌نمایش.
- [ ] F18-07 گزارش‌های قابل اقدام: فیلتر/Drill-down/سند/تسک/تاریخچه/کیفیت داده و تطبیق واقعی مالی؛ بازبینی تمام گزارش‌ها نه فقط گزارش‌های نقدینگی.
- [ ] F18-08 تست تصویری موبایل و RTL، ماتریس مجوز و نگاشت، تست SQL/ERP/API، build/typecheck، سناریوهای end-to-end و تحویل ZIP/GitHub با وضعیت PASS/FAIL/BLOCKED/NOT VERIFIED؛ بدون ادعای تکمیل غیرمستند.
