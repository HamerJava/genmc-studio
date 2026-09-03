type Texture = {url:string;metadata?:{model?:string}};
async function officialSkin(name:string):Promise<{bytes:ArrayBuffer;slim:boolean;cached:boolean}>{
 let profile=await fetch(`https://api.minecraftservices.com/minecraft/profile/lookup/name/${name}`,{signal:AbortSignal.timeout(6000)});
 if(!profile.ok)profile=await fetch(`https://api.mojang.com/users/profiles/minecraft/${name}`,{signal:AbortSignal.timeout(6000)});
 if(!profile.ok)throw Error('Official profile service unavailable');
 const p=await profile.json() as {id:string};
 if(!/^[a-f0-9]{32}$/.test(p.id))throw Error('Invalid profile');
 const response=await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${p.id}`,{signal:AbortSignal.timeout(6000)});
 if(!response.ok)throw Error('Skin service unavailable');
 const session=await response.json() as {properties:{name:string;value:string}[]};
 const value=session.properties.find(p=>p.name==='textures')?.value;
 if(!value)throw Error('No custom skin');
 const texture=JSON.parse(atob(value)).textures?.SKIN as Texture;
 const url=new URL(texture?.url);
 if(url.hostname!=='textures.minecraft.net'||!/^\/texture\/[a-f0-9]+$/.test(url.pathname))throw Error('Invalid texture host');
 url.protocol='https:';
 const png=await fetch(url,{signal:AbortSignal.timeout(6000),redirect:'manual'});
 if(!png.ok)throw Error('Skin download failed');
 return {bytes:await png.arrayBuffer(),slim:texture.metadata?.model==='slim',cached:false};
}
async function cachedSkin(name:string){
 // Public, documented profile cache. No user-provided URL is ever fetched.
 const response=await fetch(`https://api.ashcon.app/mojang/v2/user/${name}`,{signal:AbortSignal.timeout(8000),redirect:'manual'});
 if(!response.ok)throw Error(response.status===404?'Player not found.':'Minecraft profile services are unavailable. Try PNG upload.');
 const profile=await response.json() as {textures?:{slim?:boolean;skin?:{data?:string}}};
 const data=profile.textures?.skin?.data;
 if(!data||data.length>1400000)throw Error('No supported player skin found');
 const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));
 return {bytes:bytes.buffer,slim:!!profile.textures?.slim,cached:true};
}
export async function GET(req:Request){
 const name=new URL(req.url).searchParams.get('name')??'';
 if(!/^[A-Za-z0-9_]{3,16}$/.test(name))return Response.json({error:'Enter a valid Java player name.'},{status:400});
 try{
  let result;try{result=await officialSkin(name)}catch{result=await cachedSkin(name)}
  if(result.bytes.byteLength>1024*1024)throw Error('Skin too large');
  const bytes=new Uint8Array(result.bytes);
  if(bytes.length<24||bytes[0]!==137||bytes[1]!==80)throw Error('Invalid skin image');
  return new Response(result.bytes,{headers:{'Content-Type':'image/png','X-Skin-Model':result.slim?'slim':'classic','X-Skin-Source':result.cached?'public-cache':'official','Cache-Control':'public, max-age=300'}});
 }catch(e){return Response.json({error:(e as Error).message},{status:502})}
}
