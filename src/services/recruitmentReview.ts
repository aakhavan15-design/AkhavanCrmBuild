import type { ApplicationStatus, InterviewResult } from '../lib/onboarding';

export type RecruitmentAction = 'REVIEW'|'NEEDS_INFORMATION'|'SCHEDULE'|'INTERVIEW_RESULT'|'ACCEPT'|'REJECT'|'CREATE_EMPLOYEE'|'LINK_USER';
export interface RecruitmentReviewRow {
  id:string;version:string;firstName:string;lastName:string;mobile:string;desiredRole:string;status:ApplicationStatus;
  createdAt:string;notes?:string;documents:{kind:string;attachmentId:string}[];
  history:{at:string;by?:string;status:ApplicationStatus;note?:string}[];
  interview:{date:string;time:string;address:string;interviewerId:string;taskId:string;result?:InterviewResult;resultNote?:string}|null;
  employmentId:string|null;
  userLinked:boolean;
}
export interface RecruitmentReviewInput {
  commandId:string;version:string;action:RecruitmentAction;note:string;
  date?:string;time?:string;interviewerId?:string;address?:string;result?:InterviewResult;employeeCode?:string;hireDate?:string;
  username?:string;identityConfirmed?:boolean;
}
