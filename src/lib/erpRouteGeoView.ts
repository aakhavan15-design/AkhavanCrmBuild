import type { Customer } from '../types';
/** Source-scoped crosswalk: never match customers across ERP systems by display name/code. */
export interface RouteMembership {
 externalId:string;tenantId:string;sourceSystemCode:string;routeExternalId:string;
 externalCustomerId:string;subRouteCode?:string;effectiveFrom?:string;effectiveTo?:string|null;isDeleted?:boolean;
}
export interface RouteEmployee {
 externalId:string;tenantId:string;sourceSystemCode:string;routeExternalId:string;
 externalStaffId:string;staffRoleCode:'SALES_REP'|'SUPERVISOR';effectiveFrom?:string;effectiveTo?:string|null;isDeleted?:boolean;
}
export interface ErpRouteReference {
 externalId:string;tenantId:string;sourceSystemCode:string;routeCode:string;routeName:string;statusCode?:string;isDeleted?:boolean;
}
const key=(tenant:string,source:string,external:string)=>[tenant,source.toUpperCase(),external].join('|');
const activeOn=(record:{effectiveFrom?:string;effectiveTo?:string|null;isDeleted?:boolean},asOf:string)=>
 !record.isDeleted && (!record.effectiveFrom||record.effectiveFrom<=asOf) && (!record.effectiveTo||record.effectiveTo>=asOf);
export function inspectErpRouteMembership(
 route:ErpRouteReference,allCustomers:Customer[],memberships:RouteMembership[],employees:RouteEmployee[],asOf:string
){
 const crosswalk=new Map<string,Customer>();
 const collision=new Set<string>();
 for(const customer of allCustomers){
  const ext=String(customer.externalId||customer.externalAccountId||'').trim();
  const tenant=String(customer.tenantId||'').trim();
  const source=String(customer.sourceSystemCode||'').trim();
  if(!ext||!tenant||!source)continue;
  const identity=key(tenant,source,ext);
  if(collision.has(identity))continue;
  if(crosswalk.has(identity)&&crosswalk.get(identity)?.id!==customer.id){collision.add(identity);crosswalk.delete(identity);}
  else crosswalk.set(identity,customer);
 }
 const routeMembers=memberships.filter(m=>m.routeExternalId===route.externalId &&
   m.tenantId===route.tenantId && m.sourceSystemCode.toUpperCase()===route.sourceSystemCode.toUpperCase() && activeOn(m,asOf));
 const customers:Customer[]=[];
 const unmappedExternalIds:string[]=[];
 const subRoutes=new Map<string,number>();
 const seen=new Set<string>();
 for(const membership of routeMembers){
  if(membership.subRouteCode)subRoutes.set(membership.subRouteCode,(subRoutes.get(membership.subRouteCode)||0)+1);
  const customer=crosswalk.get(key(membership.tenantId,membership.sourceSystemCode,membership.externalCustomerId));
  if(!customer){unmappedExternalIds.push(membership.externalCustomerId);continue;}
  if(seen.has(customer.id))continue;
  seen.add(customer.id);customers.push(customer);
 }
 const staff=employees.filter(e=>e.routeExternalId===route.externalId&&e.tenantId===route.tenantId &&
   e.sourceSystemCode.toUpperCase()===route.sourceSystemCode.toUpperCase()&&activeOn(e,asOf));
 return {customers,unmappedCount:unmappedExternalIds.length,
   subRoutes:[...subRoutes].map(([code,count])=>({code,count})).sort((a,b)=>a.code.localeCompare(b.code)),
   sellerIds:[...new Set(staff.filter(e=>e.staffRoleCode==='SALES_REP').map(e=>e.externalStaffId))],
   supervisorIds:[...new Set(staff.filter(e=>e.staffRoleCode==='SUPERVISOR').map(e=>e.externalStaffId))],
   officialMembershipCount:routeMembers.length};
}
