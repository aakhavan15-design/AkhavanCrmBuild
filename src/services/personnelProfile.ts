export interface EmploymentProfile {
  status:'LINKED'|'UNLINKED'|'AMBIGUOUS';
  user:{userCode:string;name:string;branchName:string|null;managerName:string|null};
  employment:{employeeCode:string;commercialCode:string|null;detailCode:string|null;position:string|null;operationalRole:string|null;
    branchName:string|null;employmentStatus:'ACTIVE'|'SUSPENDED'|'TERMINATED'|'PROBATION'|'ONBOARDING';origin:'LOCAL'|'ERP_MIRROR';hireDate:string|null}|null;
}

export interface OwnPersonnelProfile extends EmploymentProfile {
  payslips:{id:string;period:string;gross:string;deductions:string;net:string}[];
  advances:{id:string;number:string;requested:string;approved:string|null;status:string;managerNotes:string|null;createdAt:string}[];
  advanceReview:AdvanceForReview[];
}

export interface AdvanceForReview {id:string;number:string;employee:string;requested:string;reason:string;createdAt:string}
export interface AdvanceDecisionInput {commandId:string;status:'APPROVED'|'REJECTED';amount:string|null;reason:string}

export interface PersonnelAdvanceInput {id:string;amount:string;reason:string}
export interface PersonnelAdvanceReceipt {id:string;number:string;replayed:boolean}
