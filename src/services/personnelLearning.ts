export interface LearningLesson {
  title: string;
  body: string;
  resource?: string | null;
}
export interface LearningQuestion {
  prompt: string;
  options: string[];
}
export interface LearningCourseInput {
  commandId: string;
  pathCode: string;
  role: string;
  level: number;
  title: string;
  passPercent: number;
  timeLimit: number;
  maxAttempts: number;
  lessons: LearningLesson[];
  questions: (LearningQuestion & { correct: number })[];
}
export interface LearningCatalog {
  employees: { id: string; name: string; code: string; role: string | null }[];
  courses: { id: string; title: string; role: string; pathCode: string; level: number; version: number }[];
}
export interface LearningAssignmentInput { commandId: string; employeeId: string; courseId: string }
export const learningStatuses = {
  LEARNING: 'در حال مطالعه', EXAM_READY: 'آمادهٔ آزمون', AWAITING_REVIEW: 'قبول، منتظر تأیید مدیر',
  CONDITIONAL: 'تأیید مشروط', RETRY: 'امکان آزمون مجدد', EXHAUSTED: 'پایان فرصت آزمون',
  APPROVED: 'سطح تأیید شده', PAUSED: 'متوقف‌شده',
};
export const learningActions = {
  COMPLETE_CONTENT: 'ثبت تکمیل مطالعه', START_EXAM: 'شروع آزمون', SUBMIT_EXAM: 'ارسال پاسخ‌ها',
  APPROVE: 'تأیید سطح', CONDITIONAL: 'ثبت تأیید مشروط', COMPLETE_CONDITION: 'ارسال شواهد انجام شرط', RETRY: 'ارجاع به آزمون مجدد',
  PAUSE: 'توقف آموزش', RESUME: 'ادامهٔ آموزش', HR_LEARNING_ASSIGNED: 'تخصیص دوره',
};
export type LearningStatus = keyof typeof learningStatuses;
export type LearningAction = Exclude<keyof typeof learningActions, 'HR_LEARNING_ASSIGNED'>;
export interface LearningActionInput {
  commandId: string;
  action: LearningAction;
  revision: number;
  attemptId?: string;
  answers?: number[];
  evidence?: string;
  note?: string;
}
export interface LearningEnrollment {
  id: string;
  status: LearningStatus;
  revision: number;
  assignedAt: string;
  completedAt: string | null;
  decisionAt: string | null;
  decisionNote: string | null;
  reviewer: string | null;
  title: string;
  pathCode: string;
  role: string;
  level: number;
  version: number;
  passPercent: number;
  timeLimit: number;
  maxAttempts: number;
  employee: string;
}
export interface LearningDetail extends LearningEnrollment {
  lessons: LearningLesson[];
  attempts: { id: string; number: number; startedAt: string; deadline: string; finishedAt: string | null;
    status: 'ACTIVE' | 'PASSED' | 'FAILED' | 'EXPIRED'; score: number | null; evidence: string | null }[];
  history: { id: string; at: string; action: keyof typeof learningActions; note: string | null; actor: string | null }[];
  exam: { id: string; deadline: string; questions: LearningQuestion[] } | null;
}
export interface LearningPage {
  items: LearningEnrollment[];
  paths: { pathCode: string; currentLevel: number; nextLevel: number | null; nextAssigned: boolean }[];
  hasMore: boolean;
}
