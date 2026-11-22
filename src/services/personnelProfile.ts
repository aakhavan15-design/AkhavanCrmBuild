export interface EmploymentProfile {
  status:'LINKED'|'UNLINKED'|'AMBIGUOUS';
  user:{userCode:string;name:string;branchName:string|null;managerName:string|null};
  employment:{employeeCode:string;commercialCode:string|null;detailCode:string|null;position:string|null;operationalRole:string|null;
    branchName:string|null;employmentStatus:'ACTIVE'|'SUSPENDED'|'TERMINATED'|'PROBATION'|'ONBOARDING';origin:'LOCAL'|'ERP_MIRROR';hireDate:string|null}|null;
}

export interface OwnPersonnelProfile extends EmploymentProfile {
  payslips:{id:string;period:string;gross:string;deductions:string;net:string}[];
  advances:{id:string;number:string;requested:string;approved:string|null;status:string;managerNotes:string|null;createdAt:string;accountingStage?:AdvanceAccountingStage|null}[];
  advanceReview:AdvanceForReview[];
}

export interface AdvanceForReview {id:string;number:string;employee:string;requested:string;reason:string;createdAt:string}
export interface AdvanceDecisionInput {commandId:string;status:'APPROVED'|'REJECTED';amount:string|null;reason:string}
export type AdvanceAccountingStage='AWAITING_REVIEW'|'ON_HOLD'|'READY_FOR_ERP';
export const advanceAccountingLabels:Record<AdvanceAccountingStage,string>={
  AWAITING_REVIEW:'در انتظار بررسی حسابداری',ON_HOLD:'نیازمند بررسی بیشتر',READY_FOR_ERP:'آمادهٔ اقدام در سامانهٔ مالی',
};
export interface AdvanceAccountingRow {
  id:string;number:string;employee:string;amount:string;approvedAt:string;stage:AdvanceAccountingStage;
  accountingNote:string|null;reviewer:string|null;reviewedAt:string|null;
}
export interface AdvanceAccountingInput {
  commandId:string;
  expectedStage:Exclude<AdvanceAccountingStage,'READY_FOR_ERP'>;
  stage:Exclude<AdvanceAccountingStage,'AWAITING_REVIEW'>;
  note:string;
}

export interface PersonnelAdvanceInput {id:string;amount:string;reason:string}
export interface PersonnelAdvanceReceipt {id:string;number:string;replayed:boolean}
