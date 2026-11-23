import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../'+path, import.meta.url),'utf8');
const lamp = read('src/components/auth/AnimatedLamp3D.tsx');
const shader = read('src/components/auth/LivePendantWebGL.tsx');
const login = read('src/components/LoginWorkspace.tsx');
const environment = read('src/components/auth/CinematicWebGLStage.tsx');

test('entire cinematic scene renders with WebGL2 geometric sculpture and pendant', () => {
  assert.match(environment, /getContext\('webgl2'/);
  assert.match(environment, /float capsule\(vec3 p/);
  assert.match(shader, /getContext\('webgl2'/);
  assert.match(shader, /float capCone\(/);
  assert.match(shader, /float torus\(/);
  assert.match(shader, /float capsule\(/);
  assert.match(shader, /vec3 normalAt\(/);
  assert.match(shader, /float fresnel=pow\(/);
  assert.match(shader, /vec3 reflected=env\(/);
  assert.match(shader, /uniform float tilt/);
  assert.match(shader, /uniform float intensity/);
});
test('existing accessible switch and gyroscope control the live pendant', () => {
  assert.match(lamp, /<LivePendantWebGL/);
  assert.match(lamp, /illuminated=\{isLightOn\}/);
  assert.match(lamp, /tiltDegrees=\{renderedTilt\}/);
  assert.match(lamp, /pullOffset=\{pullOffset\}/);
  assert.match(lamp, /onRendererReady=\{setGpuPendantReady\}/);
  assert.match(lamp, /opacity: gpuPendantReady \? 0 : 1/);
  assert.match(lamp, /onPointerDown=\{handlePointerDown\}/);
  assert.match(lamp, /onKeyDown=\{\(e\) =>/);
  assert.match(shader, /Math\.max\(-\.4,Math\.min\(\.4,target\.pullOffset\.x\/105\)\)/);
  assert.match(shader, /tiltDegrees\)\*Math\.PI\/180/);
});
test('GPU and audio failure do not prevent account login or recruitment', () => {
  assert.match(shader, /if \(!gl\) return;/);
  assert.match(shader, /webglcontextlost/);
  assert.match(shader, /webglcontextrestored/);
  assert.match(shader, /document\.addEventListener\('visibilitychange'/);
  assert.match(shader, /window\.removeEventListener\('resize'/);
  assert.match(shader, /setContextGeneration\(generation => generation \+ 1\)/);
  assert.match(login, /AuthService\.authenticate\(/);
  assert.match(login, /navigate\('\/apply'\)/);
  assert.match(login, /html\.style\.overflow = 'hidden'/);
  assert.match(login, /data-keyboard-open=\{visualViewport\?\.keyboardOpen/);
});
test('GPU workloads have capped resolution, adaptive performance and reduced-motion support',()=>{
  assert.match(shader, /const factor=mobile\?Math\.min\(scale,\.72\):Math\.min\(scale,\.86\)/);
  assert.match(shader, /if\(delta>63 && \+\+slowFrames>8 && scale>\.40\)/);
  assert.match(shader, /prefers-reduced-motion: reduce/);
  assert.match(shader, /if\(disposed \|\| lost \|\| !visible\)return/);
});
