import React, { useEffect, useRef, useState } from 'react';

interface LivePendantWebGLProps {
  illuminated: boolean;
  tiltDegrees: number;
  pullOffset: { x: number; y: number };
  onRendererReady?: (ready: boolean) => void;
}

/**
 * Live WebGL2 signed-distance-field pendant. Unlike the SVG safety fallback,
 * this draws actual spatial geometry: a copper spun-metal shade, brass collar,
 * suspension cord, ceramic diffuser, pull chain and bead. Surface normals,
 * moving highlights, Fresnel reflection and the lamp beam are evaluated per
 * fragment. The existing accessible pull control remains the interaction layer.
 */
export function LivePendantWebGL({
  illuminated, tiltDegrees, pullOffset, onRendererReady,
}: LivePendantWebGLProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef({ illuminated, tiltDegrees, pullOffset });
  const readyRef = useRef(onRendererReady);
  const [ready, setReady] = useState(false);
  const [contextGeneration, setContextGeneration] = useState(0);
  propsRef.current = { illuminated, tiltDegrees, pullOffset };
  readyRef.current = onRendererReady;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl2', {
      alpha: true, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: false, powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    if (!gl) return;

    const vertex = `#version 300 es
      precision highp float;
      void main() {
        vec2 xy = vec2(gl_VertexID == 2 ? 3.0 : -1.0, gl_VertexID == 1 ? 3.0 : -1.0);
        gl_Position = vec4(xy,0.0,1.0);
      }`;
    const fragment = `#version 300 es
      precision highp float;
      out vec4 outColor;
      uniform vec2 resolution;
      uniform float elapsed;
      uniform float intensity;
      uniform float tilt;
      uniform vec2 pull;

      // A compact PBR-inspired distance-field scene with different material IDs.
      float capsule(vec3 p, vec3 a, vec3 b, float r) {
        vec3 v=b-a;
        return length(p-a-v*clamp(dot(p-a,v)/dot(v,v),0.,1.))-r;
      }
      float torus(vec3 p, vec2 r) {
        return length(vec2(length(p.xz)-r.x,p.y))-r.y;
      }
      float capCone(vec3 p, float h, float ra, float rb) {
        vec2 q=vec2(length(p.xz),p.y);
        vec2 k1=vec2(rb,h), k2=vec2(rb-ra,2.*h);
        vec2 ca=vec2(q.x-min(q.x,q.y<0.?ra:rb),abs(q.y)-h);
        vec2 cb=q-k1+k2*clamp(dot(k1-q,k2)/dot(k2,k2),0.,1.);
        float signV=cb.x<0.&&ca.y<0.?-1.:1.;
        return signV*sqrt(min(dot(ca,ca),dot(cb,cb)));
      }
      vec3 pivot(vec3 p) {
        // Inverse rotation of the entire physical lamp about its ceiling anchor.
        p.y-=2.85;
        float a=-tilt, c=cos(a),s=sin(a);
        p.xy=mat2(c,-s,s,c)*p.xy;
        p.y+=2.85;
        return p;
      }
      vec2 scene(vec3 worldP) {
        vec3 p=pivot(worldP);
        // Spun-metal bell: thin-shell shade with open illuminated underside.
        // True open-bottom spun shade, not a filled cone blocking the glowing bulb.
        float shadeY=p.y-2.10;
        float shadeRadius=mix(.84,.29,clamp((shadeY+.39)/.78,0.,1.));
        float shell=max(abs(length(p.xz)-shadeRadius)-.031,abs(shadeY)-.39);
        float lip=torus(p-vec3(0.,1.708,0.),vec2(.835,.045));
        float copper=min(shell,lip);
        float socket=capsule(p,vec3(0.,2.49,0.),vec3(0.,2.64,0.),.15);
        copper=min(copper,socket);
        // Ceiling rosette and fine suspension wire.
        float wire=capsule(p,vec3(0.,2.60,0.),vec3(0.,2.78,0.),.013);
        float ceiling=capCone(p-vec3(0.,2.8,0.),.055,.20,.13);
        float metal=min(copper,min(wire,ceiling));
        // Interior ceramic/glass globe, recessed into shade.
        float glass=length((p-vec3(0.,1.82,0.))*vec3(1.,1.16,1.))-.31;
        glass=max(glass,p.y-2.11); // hide only the part above the inner hood
        // Pull chain and bead, linked to the unchanged accessible drag handle.
        float chain=capsule(p,vec3(.72,1.94,.0),vec3(.72+pull.x,.97-pull.y,.0),.012);
        float bead=length(p-vec3(.72+pull.x,.97-pull.y,0.))-.077;
        float brass=min(chain,bead);
        vec2 result=vec2(metal,1.);
        if(glass<result.x) result=vec2(glass,2.);
        if(brass<result.x) result=vec2(brass,3.);
        return result;
      }
      vec3 normalAt(vec3 p) {
        float h=.003;
        vec2 e=vec2(h,0.);
        return normalize(vec3(
          scene(p+e.xyy).x-scene(p-e.xyy).x,
          scene(p+e.yxy).x-scene(p-e.yxy).x,
          scene(p+e.yyx).x-scene(p-e.yyx).x
        ));
      }
      vec3 env(vec3 d) {
        float band=pow(max(dot(d,normalize(vec3(-.65,.22,.75))),0.),19.);
        float edge=pow(max(dot(d,normalize(vec3(.82,.53,.12))),0.),45.);
        return vec3(.012,.025,.049)+vec3(.85,.42,.18)*band*.23
          +vec3(1.,.88,.68)*edge*.27;
      }
      vec3 shading(vec3 p,vec3 n,vec3 viewDir,float material) {
        vec3 toEye=-viewDir;
        vec3 key=normalize(vec3(-.62,.84,1.12));
        vec3 bounce=normalize(vec3(.8,-.1,.7));
        float diffuse=max(dot(n,key),0.);
        vec3 halfV=normalize(key+toEye);
        float specular=pow(max(dot(n,halfV),0.),material==1.?80.:120.);
        float glint=pow(max(dot(n,normalize(bounce+toEye)),0.),150.);
        float fresnel=pow(1.-max(dot(n,toEye),0.),5.);
        vec3 reflected=env(reflect(viewDir,n));
        if(material==2.) {
          return vec3(.18,.16,.115)+vec3(1.,.75,.43)*intensity*(1.8+diffuse*.3)
            +reflected*.22;
        }
        vec3 copper=material==3.?vec3(.71,.38,.15):vec3(.47,.21,.082);
        float brushed=.96+.025*sin(p.y*130.+sin(p.x*14.))+.015*sin(elapsed*.86+p.x*7.);
        return copper*brushed*(.24+.56*diffuse)
          +reflected*(.40+.68*fresnel)
          +vec3(1.,.76,.49)*(specular*1.7+glint*.4)*(.36+intensity*.64);
      }
      void main() {
        vec2 uv=(gl_FragCoord.xy-.5*resolution)/resolution.y;
        // Portrait studio lens aligned with the existing SVG pull control and ceiling rosette.
        vec3 ro=vec3(0.,1.14,6.6);
        vec3 look=vec3(0.,.83,0.);
        vec3 forward=normalize(look-ro);
        vec3 right=normalize(cross(forward,vec3(0.,1.,0.)));
        vec3 up=cross(right,forward);
        vec3 rd=normalize(forward*1.68+right*uv.x*1.16+up*uv.y*1.16);
        float distanceTravelled=0.;
        float material=0.;
        vec3 p=ro;
        for(int i=0;i<88;i++) {
          p=ro+rd*distanceTravelled;
          vec2 hit=scene(p);
          if(hit.x<.004) {material=hit.y;break;}
          distanceTravelled+=max(hit.x*.76,.009);
          if(distanceTravelled>13.)break;
        }
        vec3 result=vec3(0.);
        float alpha=0.;
        if(material>.5) {
          vec3 n=normalAt(p);
          result=shading(p,n,rd,material);
          alpha=1.;
        }
        // Warm volumetric cone under the suspended shade; responds to sway.
        vec3 lamp=vec3(0.,1.70,0.);
        lamp=pivot(lamp);
        float beam=0.;
        float bloom=0.;
        for(int i=0;i<12;i++) {
          float t=float(i)*.30+.24;
          vec3 sampleP=ro+rd*t;
          vec3 direction=sampleP-lamp;
          float down=lamp.y-sampleP.y;
          float radius=.27+max(0.,down)*.68;
          float d=length(direction.xz);
          float mask=smoothstep(radius,radius*.38,d)*smoothstep(0.,.32,down);
          beam+=mask*.034*intensity;
        }
        float lp=length(uv-vec2(0.,-.10));
        bloom=exp(-lp*12.)*.11*intensity;
        vec3 mist=vec3(.93,.48,.19)*(beam*.35+bloom);
        result+=mist*(1.-alpha*.35);
        alpha=max(alpha,min(.62,beam*.60+bloom*.20));
        result=vec3(1.)-exp(-result*1.48);
        result=pow(max(result,vec3(0.)),vec3(.86));
        outColor=vec4(result,alpha);
      }`;

    const shaders: WebGLShader[] = [];
    function shader(type: number, source: string) {
      const sh=gl!.createShader(type);
      if(!sh) return null;
      gl!.shaderSource(sh,source);
      gl!.compileShader(sh);
      if(!gl!.getShaderParameter(sh,gl!.COMPILE_STATUS)) {
        gl!.deleteShader(sh);
        return null;
      }
      shaders.push(sh);
      return sh;
    }
    const vs=shader(gl.VERTEX_SHADER,vertex);
    const fs=shader(gl.FRAGMENT_SHADER,fragment);
    if(!vs || !fs) { shaders.forEach(s=>gl.deleteShader(s)); return; }
    const program=gl.createProgram();
    if(!program) { shaders.forEach(s=>gl.deleteShader(s)); return; }
    gl.attachShader(program,vs);
    gl.attachShader(program,fs);
    gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      shaders.forEach(s=>gl.deleteShader(s));
      return;
    }
    gl.useProgram(program);
    const resolution=gl.getUniformLocation(program,'resolution');
    const elapsed=gl.getUniformLocation(program,'elapsed');
    const intensity=gl.getUniformLocation(program,'intensity');
    const tilt=gl.getUniformLocation(program,'tilt');
    const pull=gl.getUniformLocation(program,'pull');
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    let raf=0;
    let last=0;
    let brightness=propsRef.current.illuminated?1:.08;
    let swing=0;
    let reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
    let visible=!document.hidden;
    let lost=false;
    let disposed=false;
    let painted=false;
    let scale=window.innerWidth<768?.58:.76;
    let slowFrames=0;
    const resize=()=>{
      const w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight);
      const mobile=window.innerWidth<768;
      const factor=mobile?Math.min(scale,.72):Math.min(scale,.86);
      canvas.width=Math.max(1,Math.min(mobile?420:680,Math.round(w*factor)));
      canvas.height=Math.max(1,Math.min(mobile?680:960,Math.round(h*factor)));
      gl.viewport(0,0,canvas.width,canvas.height);
    };
    const render=(t:number)=>{
      if(disposed || lost || !visible)return;
      if(last && t-last<(reducedMotion.matches?500:window.innerWidth<768?34:25)) {
        raf=requestAnimationFrame(render);return;
      }
      const delta=last?Math.min(90,t-last):25;
      last=t;
      const target=propsRef.current;
      brightness+=( (target.illuminated?1:.06)-brightness)*(1-Math.exp(-delta/210));
      swing+=( (reducedMotion.matches?0:target.tiltDegrees)*Math.PI/180-swing)*(1-Math.exp(-delta/145));
      gl.useProgram(program);
      gl.uniform2f(resolution,canvas.width,canvas.height);
      gl.uniform1f(elapsed,t*.001);
      gl.uniform1f(intensity,brightness);
      gl.uniform1f(tilt,swing);
      gl.uniform2f(pull,Math.max(-.4,Math.min(.4,target.pullOffset.x/105)),
        Math.max(0,Math.min(.8,target.pullOffset.y/110)));
      gl.clearColor(0,0,0,0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES,0,3);
      if (!painted && gl.getError() !== gl.NO_ERROR) {
        // Keep SVG visible on a driver that accepts but cannot render the shader.
        lost=true;
        cancelAnimationFrame(raf);
        readyRef.current?.(false);
        return;
      }
      if(!painted) {
        painted=true;
        setReady(true);
        readyRef.current?.(true);
      }
      // Slow GPUs are re-rendered at reduced resolution, never blocking the form.
      if(delta>63 && ++slowFrames>8 && scale>.40) {
        scale=Math.max(.4,scale*.82);
        slowFrames=0;
        resize();
      } else if(delta<=63)slowFrames=Math.max(0,slowFrames-1);
      raf=requestAnimationFrame(render);
    };
    const onVisibility=()=>{visible=!document.hidden;if(!visible)cancelAnimationFrame(raf);else {last=0;raf=requestAnimationFrame(render);}};
    const onLost=(e:Event)=>{e.preventDefault();lost=true;cancelAnimationFrame(raf);setReady(false);readyRef.current?.(false);};
    const onRestore=()=>{
      // Restored contexts lose their GPU programs; recreate the whole effect.
      setContextGeneration(generation => generation + 1);
    };
    const onResize=()=>resize();
    resize();
    raf=requestAnimationFrame(render);
    window.addEventListener('resize',onResize);
    document.addEventListener('visibilitychange',onVisibility);
    canvas.addEventListener('webglcontextlost',onLost);
    canvas.addEventListener('webglcontextrestored',onRestore);
    return()=>{
      disposed=true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize',onResize);
      document.removeEventListener('visibilitychange',onVisibility);
      canvas.removeEventListener('webglcontextlost',onLost);
      canvas.removeEventListener('webglcontextrestored',onRestore);
      gl.deleteProgram(program);
      shaders.forEach(sh=>gl.deleteShader(sh));
      readyRef.current?.(false);
    };
  },[contextGeneration]);

  return (
    <canvas ref={canvasRef} role="presentation" aria-hidden="true"
      data-live-pendant-ready={ready?'true':'false'}
      className="pointer-events-none absolute inset-0 z-20 h-full w-full"
      style={{opacity:ready?1:0,transition:'opacity 550ms ease'}}
    />
  );
}
