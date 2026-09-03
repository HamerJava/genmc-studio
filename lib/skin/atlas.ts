export type Model = 'classic' | 'slim';
export type Part = 'head'|'body'|'right_arm'|'left_arm'|'right_leg'|'left_leg';
export type Layer = 'base'|'overlay';
export type Face = 'right'|'left'|'top'|'bottom'|'front'|'back';
export const parts: Part[] = ['head','body','right_arm','left_arm','right_leg','left_leg'];
export const faces: Face[] = ['right','left','top','bottom','front','back'];
export type Region = {id:string;part:Part;layer:Layer;face:Face;x:number;y:number;width:number;height:number;orientation:string};
export function dimensions(part:Part, model:Model):[number,number,number] {return part==='head'?[8,8,8]:part==='body'?[8,12,4]:[part.includes('arm')&&model==='slim'?3:4,12,4]}
export function atlas(model:Model):Region[]{
 const origins:Record<Part,number[][]>={head:[[0,0],[32,0]],body:[[16,16],[16,32]],right_arm:[[40,16],[40,32]],left_arm:[[32,48],[48,48]],right_leg:[[0,16],[0,32]],left_leg:[[16,48],[0,48]]};
 return parts.flatMap(part=>{const [w,h,d]=dimensions(part,model);return (['base','overlay'] as Layer[]).flatMap((layer,i)=>{const [u,v]=origins[part][i];const rects=[[u,v+d,d,h],[u+d+w,v+d,d,h],[u+d,v,w,d],[u+d+w,v,w,d],[u+d,v+d,w,h],[u+2*d+w,v+d,w,h]];return faces.map((face,j)=>({id:`${part}.${layer}.${face}`,part,layer,face,x:rects[j][0],y:rects[j][1],width:rects[j][2],height:rects[j][3],orientation:face==='top'?'left-to-right; back-to-front':face==='bottom'?'left-to-right; front-to-back':'left-to-right viewed from outside; top-to-bottom'}))})});
}
export function regionAt(model:Model,x:number,y:number){return atlas(model).find(r=>x>=r.x&&y>=r.y&&x<r.x+r.width&&y<r.y+r.height)}
export function atlasInfo(model:Model){const regions=atlas(model);return {model,width:64,height:64,origin:'top-left',characterSides:'left/right from character perspective',coordinates:'integer pixels; rectangles use exclusive right/bottom bounds',regions,unusedPixels:Array.from({length:4096},(_,i)=>i).filter(i=>!regionAt(model,i%64,Math.floor(i/64))).map(i=>[i%64,Math.floor(i/64)]),example:{region:'head.base.front',local:[0,0],canvas:[8,8]}}}
