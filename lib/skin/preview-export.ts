import * as T from 'three';
import { atlas, dimensions, parts } from './atlas';
import { pixelCanvas, type Skin } from './engine';

export const previewAngles = ['front', 'back', 'left', 'right', 'perspective'] as const;
export type PreviewAngle = typeof previewAngles[number];
export function validatePreviewOptions(input: { views?: unknown; size?: unknown }) {
  const views = input.views ?? ['front', 'back', 'perspective'];
  const size = input.size ?? 512;
  if (!Array.isArray(views) || views.length < 1 || views.length > 5 || new Set(views).size !== views.length || views.some(v => !previewAngles.includes(v))) throw Error('Choose 1–5 distinct views: front, back, left, right, perspective');
  if (![256, 512, 768].includes(size as number)) throw Error('size must be 256, 512 or 768');
  return {views: views as PreviewAngle[], size: size as number};
}
/** Offscreen rendering from a frozen canonical skin; no editor camera or draft mutation. */
export function exportSkinPreviews(skin: Skin, input: {views?: unknown; size?: unknown; background?: string}) {
  const {views, size} = validatePreviewOptions(input);
  if (input.background && !['transparent','light','dark'].includes(input.background)) throw Error('Invalid background');
  const renderer = new T.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
  const texture = new T.CanvasTexture(pixelCanvas(skin.pixels));
  texture.magFilter = texture.minFilter = T.NearestFilter;
  texture.colorSpace = T.SRGBColorSpace;
  const scene = new T.Scene();
  const resources: {geometry:T.BufferGeometry;material:T.Material}[] = [];
  try {
    renderer.setPixelRatio(1); renderer.setSize(size,size,false); renderer.outputColorSpace=T.SRGBColorSpace;
    if(input.background !== 'transparent') scene.background = new T.Color(input.background === 'dark' ? '#181818' : '#f4f4f4');
    scene.add(new T.AmbientLight(0xffffff,2.2));
    const light=new T.DirectionalLight(0xffffff,1.5);light.position.set(-20,50,45);scene.add(light);
    const regions=atlas(skin.model);
    for(const part of parts){
      const [w,h,d]=dimensions(part,skin.model);
      const arm=part.includes('arm'), left=part.startsWith('left');
      const centerX=part==='head'||part==='body'?0:(left?1:-1)*(arm?4+w/2:2);
      const centerY=part==='head'?28:part==='body'||arm?18:6;
      for(const layer of ['base','overlay'] as const){
        const e=layer==='overlay'?(part==='head'?.5:.25):0;
        const geometry=new T.BoxGeometry(w+2*e,h+2*e,d+2*e);
        const uv=geometry.attributes.uv;
        ['left','right','top','bottom','front','back'].forEach((face,f)=>{
          const r=regions.find(r=>r.part===part&&r.layer===layer&&r.face===face)!;
          [[r.x,r.y],[r.x+r.width,r.y],[r.x,r.y+r.height],[r.x+r.width,r.y+r.height]].forEach(([x,y],j)=>uv.setXY(f*4+j,x/64,1-y/64));
        });
        const material=new T.MeshLambertMaterial({map:texture,transparent:layer==='overlay',alphaTest:layer==='base'?0:.01});
        resources.push({geometry,material});
        const mesh=new T.Mesh(geometry,material);mesh.position.set(centerX,centerY,0);scene.add(mesh);
      }
    }
    const camera=new T.OrthographicCamera(-21,21,21,-21,.1,500);
    const directions:Record<PreviewAngle,[number,number,number]>={front:[0,0,1],back:[0,0,-1],left:[1,0,0],right:[-1,0,0],perspective:[.65,.3,1]};
    const content: ({type:'text';text:string}|{type:'image';mimeType:'image/png';data:string})[]=[];
    const images=views.map(view=>{
      camera.position.copy(new T.Vector3(...directions[view]).normalize().multiplyScalar(80).add(new T.Vector3(0,16,0)));
      camera.lookAt(0,16,0);camera.updateMatrixWorld();renderer.render(scene,camera);
      const data=renderer.domElement.toDataURL('image/png').split(',')[1];
      const filename=`${skin.name.replace(/[^a-z0-9_-]/gi,'-').slice(0,60)||'skin'}-${view}.png`;
      content.push({type:'text',text:`${skin.name} · ${view} · revision ${skin.revision}`});
      const contentIndex=content.length;
      content.push({type:'image',mimeType:'image/png',data});
      return {view,filename,width:size,height:size,contentIndex};
    });
    return {name:skin.name,revision:skin.revision,model:skin.model,pose:'stand',layers:'base and outer',images,content,displayHint:'Display the image content blocks inline to the user. If your host exposes structured JSON instead of native image blocks, emit each image as data:image/png;base64,<data> using its supported image display tool. No browser needs to be opened by the user.'};
  } finally {for(const r of resources){r.geometry.dispose();r.material.dispose();}texture.dispose();renderer.dispose();renderer.forceContextLoss();}
}
