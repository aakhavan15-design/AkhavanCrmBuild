import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const lamp=read('src/components/auth/AnimatedLamp3D.tsx');
const login=read('src/components/LoginWorkspace.tsx');

test('iPhone motion requires an explicit gesture and safely falls back',()=>{
 assert.match(lamp,/const enableMotion = async \(\) =>/);
 assert.match(lamp,/requestPermission\(\)/);
 assert.match(lamp,/window\.addEventListener\('deviceorientation'/);
 assert.match(lamp,/window\.removeEventListener\('deviceorientation'/);
 assert.match(lamp,/Math\.max\(-30, Math\.min\(30, event\.gamma \* 0\.75\)\)/);
 assert.match(lamp,/setMotionEnabled\(false\)/);
 assert.match(lamp,/aria-pressed=\{motionEnabled\}/);
});
test('pull string stays available when motion is denied',()=>{
 assert.match(lamp,/onPointerDown=\{handlePointerDown\}/);
 assert.match(lamp,/onPointerUp=\{handlePointerUp\}/);
 assert.match(lamp,/onKeyDown=\{\(e\) =>/);
});
test('light-off transition fades the form before unmount and never grants access',()=>{
 assert.match(login,/setTimeout\(\(\) => setShowLoginPanel\(false\), 480\)/);
 assert.match(login,/\{showLoginPanel \? \(/);
 assert.match(login,/lampCardFadeOut 480ms/);
 assert.match(login,/if \(!isLightOn\) \{/);
 assert.match(login,/AuthService\.authenticate/);
});

test('pull-string target tracks the rotated pendant at every SVG viewport size',()=>{
 assert.match(lamp,/const beadX = 160 \+ \(targetX - 160\) \* Math\.cos\(tiltRadians\)/);
 assert.match(lamp,/const beadY = 2 \+ \(targetX - 160\) \* Math\.sin\(tiltRadians\)/);
 assert.match(lamp,/left: `\$\{\(beadX \/ 320\) \* 100\}%`/);
 assert.match(lamp,/top: `\$\{\(beadY \/ 620\) \* 100\}%`/);
 assert.doesNotMatch(lamp,/\(targetX - 160\) \* 0\.95/);
});
