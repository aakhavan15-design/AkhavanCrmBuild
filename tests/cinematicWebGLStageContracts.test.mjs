import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/components/auth/CinematicWebGLStage.tsx',import.meta.url),'utf8');
const login=readFileSync(new URL('../src/components/LoginWorkspace.tsx',import.meta.url),'utf8');

test('GPU stage remains independent from the login session and has a fallback',()=>{
  assert.match(login,/CinematicWebGLStage illuminated=\{isLightOn\}/);
  assert.match(login,/AuthLightRoad isLightOn=\{isLightOn\}/);
  assert.doesNotMatch(source,/AuthService|setSession|onAuthenticated/);
  assert.match(source,/if \(!context\) return/);
  assert.match(source,/const gl: WebGL2RenderingContext = context/);
  assert.match(source,/webglcontextlost/);
  assert.match(source,/visibilitychange/);
});
test('photometric copper and moving road are GPU-shaded',()=>{
  assert.match(source,/vec3 shadeMetal/);
  assert.match(source,/f0\+\(1\.-f0\)\*pow/);
  assert.match(source,/movingGlint/);
  assert.match(source,/pendantPool/);
  assert.match(source,/uniform float uLight/);
  assert.match(source,/uniform float uTime/);
  assert.match(source,/uQuality<\.8/);
});
test('rendering quality is bounded and scene is disposed on exit',()=>{
  assert.match(source,/Math\.min\(window\.devicePixelRatio \|\| 1/);
  assert.match(source,/maxW = mobile \? 980 : 1900/);
  assert.match(source,/gl\.deleteProgram\(program\)/);
  assert.match(source,/window\.removeEventListener\('resize',resize\)/);
});
