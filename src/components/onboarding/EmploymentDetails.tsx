import { formatAppDate } from '../../lib/utils';
import { employmentStatusLabels, type EmploymentProfile } from '../../services/personnelProfile';

export function EmploymentDetails({profile}:{profile:EmploymentProfile}) {
  const {user,employment}=profile;
  const rows=[
    ['کد کاربری',user.userCode],['شعبه',employment?.branchName ?? user.branchName],['سرپرست مستقیم',user.managerName],
    ...(employment ? [['کد پرسنلی',employment.employeeCode],['کد بازرگانی',employment.commercialCode],['کد تفصیلی',employment.detailCode],
      ['سمت',employment.position],['نقش عملیاتی',employment.operationalRole],['وضعیت همکاری',employmentStatusLabels[employment.employmentStatus]],
      ['تاریخ شروع',employment.hireDate ? formatAppDate(employment.hireDate) : null],
      ...(employment.terminationDate ? [['تاریخ پایان',formatAppDate(employment.terminationDate)]] : [])] : []),
  ];
  return <div className="space-y-2">
    {profile.status!=='LINKED' && <p role="status" className="text-caption text-warning">{profile.status==='AMBIGUOUS'
      ? 'چند پروندهٔ استخدامی به این حساب پیوند خورده است. پیوند باید در پایگاه مرکزی بررسی شود.' : 'پروندهٔ استخدامی به این حساب پیوند نخورده است.'}</p>}
    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-caption sm:grid-cols-3">
      {rows.map(([label,value])=><div key={label} className="min-w-0"><dt className="text-text-secondary">{label}</dt><dd className="wrap-break-word font-semibold"><bdi>{value || 'نامشخص'}</bdi></dd></div>)}
    </dl>
    {employment && <p className="text-caption text-text-secondary">{employment.origin==='ERP_MIRROR' ? 'منشأ پرونده آینهٔ سامانهٔ مالی است.' : 'منشأ پرونده ثبت داخلی است.'}</p>}
  </div>;
}
