#!/usr/bin/env node
/** Compile both production login WebGL vertex/fragment shaders in a real
 * headless browser WebGL2 context. Does not require npm/bun dependencies.
 * Pass means shader compile + link on the tested browser/driver, NOT visual QA.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const files = [
  'src/components/auth/CinematicWebGLStage.tsx',
  'src/components/auth/LivePendantWebGL.tsx',
];
const shaders = files.map(path => {
  const source = readFileSync(resolve(path), 'utf8');
  const extract = name => {
    const match = source.match(new RegExp('const\\s+' + name + '\\s*=\\s*`([\\s\\S]*?)`\\s*;'));
    if (!match) throw new Error(path + ': missing static ' + name + ' shader');
    return match[1];
  };
  return { path, vertex: extract('vertex'), fragment: extract('fragment') };
});

const chrome = ['google-chrome','google-chrome-stable','chromium','chromium-browser']
  .find(command => spawnSync('which',[command],{encoding:'utf8'}).status===0);
if (!chrome) {
  console.error('WebGL browser smoke test BLOCKED: no Chrome/Chromium executable');
  process.exitCode = 2;
} else {
  const dir = mkdtempSync(join(tmpdir(),'akhavan-webgl-'));
  const page = join(dir,'shader-smoke.html');
  const tests = JSON.stringify(shaders).replaceAll('<','\\u003c');
  writeFileSync(page, `<!doctype html><html><head><meta charset="utf-8"></head><body data-result="PENDING">
<script>
const shaders = ${tests};
let result = 'PASS';
try {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 128;
  const gl = canvas.getContext('webgl2',{alpha:true,antialias:false});
  if (!gl) throw new Error('WebGL2 unavailable');
  function compile(kind,code) {
    const shader = gl.createShader(kind);
    gl.shaderSource(shader,code);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader)||'shader compile failed');
    }
    return shader;
  }
  shaders.forEach(test => {
    try {
      const v = compile(gl.VERTEX_SHADER,test.vertex);
      const f = compile(gl.FRAGMENT_SHADER,test.fragment);
      const program = gl.createProgram();
      gl.attachShader(program,v); gl.attachShader(program,f);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program,gl.LINK_STATUS))
        throw new Error(gl.getProgramInfoLog(program)||'shader link failed');
      gl.useProgram(program);
      gl.viewport(0,0,128,128);
      gl.drawArrays(gl.TRIANGLES,0,3);
      if (gl.getError() !== gl.NO_ERROR) throw new Error('GPU draw failed');
      gl.deleteProgram(program); gl.deleteShader(v); gl.deleteShader(f);
    } catch(err) {throw new Error(test.path+': '+err.message);}
  });
} catch(error) {result = 'FAIL: '+String(error.message);}
document.body.dataset.result=result;
document.body.textContent=result;
</script></body></html>`);
  try {
    const args = [
      '--headless=new','--no-sandbox','--disable-dev-shm-usage',
      '--enable-webgl','--enable-unsafe-swiftshader',
      '--use-gl=angle','--use-angle=swiftshader',
      '--virtual-time-budget=5000','--dump-dom','file://'+page,
    ];
    const res=spawnSync(chrome,args,{encoding:'utf8',timeout:30000,maxBuffer:2*1024*1024});
    const match=(res.stdout||'').match(/data-result="([^"]+)"/);
    const status=match?.[1]?.replaceAll('&quot;','"') ?? 'UNKNOWN';
    if (res.error || res.status!==0 || status!=='PASS') {
      console.error('WebGL headless compile failed:',status);
      console.error((res.stderr||'').slice(-1800));
      process.exitCode=1;
    } else console.log('PASS: both login WebGL2 shaders compiled, linked and drew in',chrome);
  } finally {rmSync(dir,{recursive:true,force:true});}
}
