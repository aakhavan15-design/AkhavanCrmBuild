import assert from 'node:assert/strict';
import { createPersonnelLearning, gradeLearningExam, learningAction, learningCourse } from '../server/personnelLearning.mjs';
import { churnNotice, createChurnAlertPublisher, parsePurchaseCycleQuery } from '../server/purchaseCycle.mjs';

const commandId = '444c593e-2848-4f99-88fa-0be038e24a08';
const employeeId = '854d987a-ff05-4bd8-a256-fb09e20501c1';
const auth = { tenantId: commandId, userId: employeeId };
const questions = [
  { prompt: 'پرسش اول', options: ['الف', 'ب'], correct: 1 },
  { prompt: 'پرسش دوم', options: ['الف', 'ب', 'ج'], correct: 0 },
  { prompt: 'پرسش سوم', options: ['الف', 'ب'], correct: 0 },
];
const course = {
  commandId, pathCode: 'sales-main', role: 'فروش', title: 'مبانی فروش', level: 1,
  passPercent: 67, timeLimit: 20, maxAttempts: 2, questions,
  lessons: [{ title: 'درس اول', body: 'آموزش ثبت سفارش', resource: 'https://example.test/training.pdf' }],
};
assert.ok(learningCourse(course));
assert.equal(learningCourse({ ...course, lessons: [{ ...course.lessons[0], resource: 'javascript:alert(1)' }] }), null);
assert.equal(learningCourse({ ...course, questions: [{ ...questions[0], correct: 2 }] }), null);
assert.equal(learningCourse({ ...course, questions: [{ ...questions[0], options: ['الف', 'الف'] }] }), null);
assert.equal(learningCourse({ ...course, maxAttempts: 0 }), null);
assert.deepEqual(gradeLearningExam(questions, [1, 0, 1], 67), { score: 66.67, passed: false });
assert.deepEqual(gradeLearningExam(questions, [1, 0, 1], 66), { score: 66.67, passed: true });
assert.equal(gradeLearningExam(questions, [2, 0, 1], 67), null);
assert.equal(learningAction({ commandId, revision: 1, action: 'SUBMIT_EXAM', attemptId: employeeId, answers: [1, 0, 0] }), null);
assert.equal(learningAction({ commandId, revision: 1, action: 'APPROVE', note: ' ' }), null);
assert.ok(learningAction({ commandId, revision: 1, action: 'COMPLETE_CONDITION', note: 'شواهد' }));

function queries(responses) {
  const working = [...responses];
  const calls = [];
  class Request {
    params = {};
    input(name, _type, value) { this.params[name] = value; return this; }
    async query(sqlText) {
      calls.push({ sqlText, params: this.params });
      assert.ok(working.length, 'Unexpected SQL call');
      return working.shift();
    }
  }
  return { calls, sql: { Request, VarChar: () => '', NVarChar: () => '', Decimal: () => '' }, run: (_auth, execute) => execute({}) };
}

const baseRow = { id: commandId, status: 'EXAM_READY', lessonsJson: JSON.stringify(course.lessons) };
const ownStudy = queries([
  { recordset: [baseRow] },
  { recordsets: [[{ id: employeeId, status: 'ACTIVE', deadline: '2026-11-22T13:00:00Z' }], []] },
  { recordset: [{ QuestionsJson: JSON.stringify(questions) }] },
]);
const ownDetail = await createPersonnelLearning(ownStudy).item(auth, commandId, false);
assert.equal(ownDetail.exam.questions.length, questions.length);
assert.ok(ownDetail.exam.questions.every(question => !Object.hasOwn(question, 'correct')));
assert.match(ownStudy.calls[0].sqlText, /AND u\.UserId=@actor/);

const managerStudy = queries([{ recordset: [baseRow] }, { recordsets: [[{ id: employeeId, status: 'ACTIVE' }], []] }]);
assert.equal((await createPersonnelLearning(managerStudy).item(auth, commandId, true)).exam, null);
assert.match(managerStudy.calls[0].sqlText, /u\.UserId<>@actor AND u\.ManagerUserId=@actor/);
assert.match(managerStudy.calls[0].sqlText, /N'internal\.manage'/);

const passedStudy = queries([
  { recordset: [{ ...baseRow, status: 'AWAITING_REVIEW', revision: 3, version: 1, maxAttempts: 2 }] },
  { recordset: [] },
  { recordset: [{ id: employeeId, status: 'PASSED' }] },
  { recordset: [] }, { recordset: [] }, { recordset: [{ ...baseRow, status: 'APPROVED' }] },
  { recordsets: [[], []] },
]);
const approved = await createPersonnelLearning(passedStudy).change(auth, commandId, {
  commandId: employeeId, action: 'APPROVE', revision: 3, note: 'بررسی شواهد',
});
assert.equal(approved.status, 'APPROVED');
assert.equal(passedStudy.calls[3].params.next, 'APPROVED');

assert.equal(parsePurchaseCycleQuery({ audience: 'supervisor' }).audience, 'supervisor');
assert.equal(parsePurchaseCycleQuery({ audience: 'arbitrary-recipient' }), null);
assert.equal(parsePurchaseCycleQuery({}).view, 'follow-up');
assert.deepEqual([1, 2, 3].map(rank => churnNotice(rank, 12).linkTab), ['churn-owner', 'churn-supervisor', 'churn-manager']);
assert.match(churnNotice(1, 12).message, /۱۲/);

const notices = queries([
  { recordset: [1, 2, 3].map(tier => ({ recipient: employeeId, tier, customerCount: 1 })) },
  { recordset: [] },
]);
await createChurnAlertPublisher(notices)(auth, '2026-11-22');
assert.match(notices.calls[0].sqlText, /sp_getapplock/);
assert.match(notices.calls[0].sqlText, /COUNT_BIG\(DISTINCT c\.AccountId\)/);
assert.match(notices.calls[0].sqlText, /DATEADD\(day,-7,SYSUTCDATETIME\(\)\)/);
assert.deepEqual(JSON.parse(notices.calls[1].params.articles).map(item => item.linkTab), [
  'churn-owner','churn-supervisor','churn-manager',
]);
console.log('Personnel learning and churn contract checks passed');
