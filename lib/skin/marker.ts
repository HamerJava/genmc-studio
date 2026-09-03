import {atlas} from './atlas';
import type {Skin} from './engine';
const signature='GenMC:v1';
const bits=Array.from(signature).flatMap(c=>Array.from({length:8},(_,i)=>(c.charCodeAt(0)>>(7-i))&1));
function positions(s:Skin){return atlas(s.model).filter(r=>r.layer==='base').flatMap(r=>Array.from({length:r.width*r.height},(_,i)=>(r.y+Math.floor(i/r.width))*64+r.x+i%r.width)).slice(0,bits.length*3)}
export function markSkin(s:Skin):Skin{const pixels=[...s.pixels];positions(s).forEach((p,i)=>{const c=pixels[p];const b=(parseInt(c.slice(5,7),16)&254)|bits[i%bits.length];pixels[p]=c.slice(0,5)+b.toString(16).padStart(2,'0')});return {...s,pixels};}
export function detectMarker(s:Skin){const pos=positions(s);let matches=0;for(let i=0;i<bits.length;i++){const votes=[0,1,2].map(k=>parseInt(s.pixels[pos[i+k*bits.length]].slice(5,7),16)&1);if((votes.reduce((a,b)=>a+b,0)>=2?1:0)===bits[i])matches++}return {detected:matches===bits.length,scheme:'GenMC v1',matchedBits:matches,totalBits:bits.length,notice:'A removable, copyable GenMC export marker. Not proof of AI generation or authorship; not Google SynthID.'};}
