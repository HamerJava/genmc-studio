import {env} from 'cloudflare:workers';
export function database(){return env.DB as D1Database}
export function storage(){return (env as unknown as {SKINS:R2Bucket}).SKINS}
export async function owner(req:Request){const match=req.headers.get('cookie')?.match(/(?:^|; )genmc_session=([a-f0-9]{64})(?:;|$)/);const token=match?.[1]??Array.from(crypto.getRandomValues(new Uint8Array(32))).map(n=>n.toString(16).padStart(2,'0')).join('');const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(n=>n.toString(16).padStart(2,'0')).join('');return {id:hash,cookie:`genmc_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000${new URL(req.url).protocol==='https:'?'; Secure':''}`}}
export function sameOrigin(req:Request){if(req.headers.get('origin')!==new URL(req.url).origin)throw Error('Invalid origin')}
export async function body(req:Request){if(Number(req.headers.get('content-length')||0)>100000)throw Error('Request too large');const t=await req.text();if(t.length>100000)throw Error('Request too large');return JSON.parse(t)}
