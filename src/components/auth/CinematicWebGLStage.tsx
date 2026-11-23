import React, { useEffect, useRef } from 'react';

/**
 * GPU-rendered copper sculpture and illuminated, reflective road.
 * Deliberately independent from the real login form / interactive pendant:
 * GPU failures, lost contexts, motion preferences, and hidden pages never
 * block authentication. Existing SVG is the low-power fallback.
 */
export function CinematicWebGLStage({ illuminated }: { illuminated: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lightRef = useRef(illuminated);
  lightRef.current = illuminated;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof window === 'undefined') return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const gl = canvas.getContext('webgl2', {
      alpha: true, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: false, powerPreference: 'low-power',
      preserveDrawingBuffer: false,
    });
    if (!gl) return;

    const vertex = `#version 300 es
    precision highp float;
    void main() {
      vec2 p = vec2((gl_VertexID == 2) ? 3.0 : -1.0,
                    (gl_VertexID == 1) ? 3.0 : -1.0);
      gl_Position = vec4(p,0.,1.);
    }`;

    const fragment = `#version 300 es
    precision highp float;
    out vec4 outColor;
    uniform vec2 uResolution;
    uniform float uTime;
    uniform float uLight;
    uniform float uQuality;

    float capsule(vec3 p, vec3 a, vec3 b, float r) {
      vec3 q=p-a, d=b-a;
      return length(q-d*clamp(dot(q,d)/dot(d,d),0.,1.))-r;
    }
    float torus(vec3 p, vec2 r) {
      vec2 q=vec2(length(p.xz)-r.x,p.y);
      return length(q)-r.y;
    }
    vec2 map(vec3 p) {
      // The brand A is a metallic spatial sculpture, not a flat texture.
      float a=capsule(p,vec3(-1.15,.35,0.),vec3(-.08,2.18,0.),.052);
      a=min(a,capsule(p,vec3(-.08,2.18,0.),vec3(1.04,.35,0.),.052));
      a=min(a,capsule(p,vec3(-.72,1.08,0.),vec3(.6,1.08,0.),.037));
      // Cursive copper crossbar passing in front of the A.
      vec3 q=p-vec3(.05,.83,.17);
      float ring=torus(vec3(q.x, q.y*.48,q.z),vec2(1.13,.045));
      a=min(a,ring);
      return p.y < .0 ? vec2(-p.y,2.) : vec2(a,1.);
    }
    vec3 normalAt(vec3 p) {
      float h=.003;
      vec2 e=vec2(h,0.);
      return normalize(vec3(
        map(p+e.xyy).x-map(p-e.xyy).x,
        map(p+e.yxy).x-map(p-e.yxy).x,
        map(p+e.yyx).x-map(p-e.yyx).x));
    }
    float pathLight(vec2 x) {
      // Curving luminous ribbons on the ground converge into the copper A.
      float z=x.y;
      float curve=.37*sin(z*.58)+.05*z*z;
      float width=.08+.035*abs(z);
      float bands=0.;
      for(int i=0;i<5;i++) {
        float offset=(float(i)-2.)*width*2.7;
        float dx=abs(x.x-curve-offset);
        bands+=exp(-dx*95.)*.95 + exp(-dx*9.)*.12;
      }
      return bands*exp(-max(0.,z-4.)*.15);
    }
    vec3 env(vec3 rd) {
      float h=max(rd.y,0.);
      vec3 navy=mix(vec3(.009,.018,.041),vec3(.042,.045,.057),pow(h,.7));
      float warm=pow(max(dot(rd,normalize(vec3(.22,.69,.7))),0.),24.);
      return navy+vec3(.9,.37,.14)*warm*.17*uLight;
    }
    vec3 shadeMetal(vec3 p, vec3 n, vec3 rd) {
      vec3 key=normalize(vec3(-.5,.85,1.0));
      vec3 fill=normalize(vec3(.9,.55,-.25));
      float diff=max(dot(n,key),0.);
      float fres=pow(1.-max(dot(n,-rd),0.),4.);
      vec3 reflected=env(reflect(rd,n));
      float spec=pow(max(dot(reflect(-key,n),-rd),0.),80.);
      float longSpec=pow(max(dot(reflect(-fill,n),-rd),0.),22.);
      vec3 copper=vec3(.43,.17,.075);
      return copper*(.13+.72*diff)+reflected*(.25+.7*fres)
        +vec3(1.,.75,.49)*(spec*1.6+longSpec*.33)*uLight;
    }
    void main() {
      vec2 uv=(gl_FragCoord.xy-.5*uResolution)/uResolution.y;
      float widescreen=uResolution.x/uResolution.y;
      // Negative perspective deliberately puts the sculpture behind the form.
      vec3 ro=vec3(.0,1.6,5.2);
      vec3 rd=normalize(vec3(uv.x*1.22,uv.y*1.22-.07,-1.7));
      vec3 color=env(rd);
      float d=0., material=0., hit=0.;
      vec3 p=ro;
      for(int i=0;i<72;i++) {
        p=ro+rd*d;
        vec2 m=map(p);
        if(m.x<.007) {material=m.y;hit=1.;break;}
        d+=max(m.x*.78,.014);
        if(d>22.)break;
      }
      if(hit>.5 && material<1.5) {
        vec3 n=normalAt(p);
        color=shadeMetal(p,n,rd);
        float rim=pow(1.-max(dot(n,-rd),0.),2.);
        color+=vec3(1.,.45,.19)*rim*.24*uLight;
      }
      if(hit>.5 && material>1.5) {
        // Reflective black marble with a high-frequency metallic light path.
        vec3 reflection=env(reflect(rd,vec3(0.,1.,0.)));
        vec3 x=p;
        float lanes=pathLight(vec2(x.x,x.z));
        float glow=pathLight(vec2(x.x+.025,x.z))*.23;
        vec3 copper=vec3(1.0,.43,.18);
        float floorGrid=pow(max(sin(x.z*9.)*sin(x.x*4.),0.),18.)*.013;
        color=vec3(.012,.018,.034)+reflection*.31
          +copper*(lanes*1.2+glow)*uLight+vec3(floorGrid);
        // A delicate reflection from the sculpture above the dark floor.
        float reflectA=exp(-length(x.xz-vec2(0.,0.))*1.3)*.09;
        color+=vec3(.46,.20,.08)*reflectA*uLight;
      }
      float haze=exp(-length(uv-vec2(-.06,.07))*3.2)*.046*uLight;
      color+=vec3(.75,.29,.11)*haze;
      color=vec3(1.)-exp(-color*1.45);
      color=pow(color,vec3(.89));
      float vignette=1.-smoothstep(.56,1.12,length(uv));
      color*=.46+.54*vignette;
      float grain=(fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-.5)*.006;
      outColor=vec4(max(color+grain,vec3(0.)),.94);
    }`;

    function compile(type: number, src: string) {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    }
    const vs = compile(gl.VERTEX_SHADER, vertex);
    const fs = compile(gl.FRAGMENT_SHADER, fragment);
    if (!vs || !fs) {
      if (vs) gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
      return;
    }
    const program = gl.createProgram();
    if (!program) { gl.deleteShader(vs); gl.deleteShader(fs); return; }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      return;
    }
    gl.useProgram(program);
    const resolution = gl.getUniformLocation(program, 'uResolution');
    const time = gl.getUniformLocation(program, 'uTime');
    const light = gl.getUniformLocation(program, 'uLight');
    const quality = gl.getUniformLocation(program, 'uQuality');
    let frame = 0;
    let last = 0;
    let brightness = lightRef.current ? 1 : 0.08;
    let disposed = false;
    let paused = false;
    const resize = () => {
      if (!canvas.isConnected) return;
      // Cap internal resolution on phones to prevent a costly GPU login.
      const mobile = window.innerWidth < 768;
      const scale = mobile ? .65 : .78;
      const maxW = mobile ? 660 : 1400;
      canvas.width = Math.max(1, Math.min(maxW, Math.round(canvas.clientWidth * scale)));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    const render = (stamp: number) => {
      if (disposed || paused) return;
      const cadence = reducedMotion.matches ? 1000 : (window.innerWidth < 768 ? 45 : 33);
      if (stamp-last >= cadence) {
        last=stamp;
        brightness += ((lightRef.current ? 1 : .08)-brightness)*.13;
        gl.useProgram(program);
        gl.uniform2f(resolution,canvas.width,canvas.height);
        gl.uniform1f(time, reducedMotion.matches ? 0 : stamp*.001);
        gl.uniform1f(light,brightness);
        gl.uniform1f(quality,window.innerWidth < 768 ? .65 : 1);
        gl.drawArrays(gl.TRIANGLES,0,3);
      }
      frame=window.requestAnimationFrame(render);
    };
    const onVisibility = () => {
      paused=document.hidden;
      if (paused) cancelAnimationFrame(frame);
      else {last=0;frame=requestAnimationFrame(render);}
    };
    const onContextLost = (event: Event) => {
      event.preventDefault(); paused=true;cancelAnimationFrame(frame);
    };
    resize();
    frame=requestAnimationFrame(render);
    window.addEventListener('resize',resize);
    document.addEventListener('visibilitychange',onVisibility);
    canvas.addEventListener('webglcontextlost',onContextLost);
    return () => {
      disposed=true;
      cancelAnimationFrame(frame);
      window.removeEventListener('resize',resize);
      document.removeEventListener('visibilitychange',onVisibility);
      canvas.removeEventListener('webglcontextlost',onContextLost);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" role="presentation"
    className="akhavan-webgl-stage absolute inset-0 h-full w-full pointer-events-none"
    style={{ opacity: illuminated ? .85 : .13, transition: 'opacity 900ms ease' }} />;
}
