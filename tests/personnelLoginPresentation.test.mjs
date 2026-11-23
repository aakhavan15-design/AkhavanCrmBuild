import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const login=read('src/components/LoginWorkspace.tsx');
const css=read('src/components/auth/loginCinematic.css');
const hiring=read('src/components/onboarding/ApplyPage.tsx');
const hiringCss=read('src/components/onboarding/recruitmentCinematic.css');

test('personnel login scene stays viewport-locked on desktop and mobile',()=>{
  assert.match(login,/className="akhavan-login-scene fixed inset-0 h-dvh max-h-dvh/);
  assert.match(css,/\.akhavan-login-scene\s*\{[^}]*height: 100dvh;/);
  assert.match(css,/\.akhavan-login-scene\s*\{[^}]*overflow: hidden !important;/);
  assert.match(css,/@media \(max-width: 767px\)/);
  assert.match(css,/@media \(max-height: 520px\)/);
  assert.match(css,/\.akhavan-login-form-shell:focus-within/);
  assert.match(login,/className="akhavan-login-stage /);
});
test('real existing applicant questionnaire is accessible with lamp both on and off',()=>{
  assert.match(login,/\{applyEnabled && \(/);
  assert.match(login,/navigate\('\/apply'\)/);
  assert.match(login,/ثبت‌نام و تکمیل پرسشنامه استخدامی/);
  assert.match(hiring,/submitPublicApplication/);
  assert.match(hiring,/getPublicRecruitment/);
  assert.match(hiring,/createApplicationFormSchema/);
  assert.match(hiring,/DocumentField/);
  assert.match(hiring,/className="akhavan-public-recruitment/);
  assert.match(hiringCss,/\.akhavan-public-recruitment/);
});
test('real sign in remains AuthService-backed; decorative stages do not bypass authentication',()=>{
  assert.match(login,/AuthService\.authenticate\(/);
  assert.match(login,/result\.status === 'AUTHENTICATED'/);
  assert.match(login,/onAuthenticated\?\.\(result\.user\)/);
  assert.match(login,/<AnimatedLamp3D/);
  assert.match(login,/<AuthLightRoad/);
  assert.match(css,/prefers-reduced-motion/);
});
test('login theme uses shared semantic colors instead of new literal hex colors',()=>{
  assert.doesNotMatch(css,/#[\da-fA-F]{3,8}\b/);
});
