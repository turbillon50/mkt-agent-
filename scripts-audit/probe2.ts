import { readFileSync } from 'node:fs';
const envRaw = readFileSync('/root/repos/goossip-composio-c5/.env.local','utf8');
for (const line of envRaw.split('\n')){const m=line.match(/^([A-Z0-9_]+)=(.*)$/);if(m){let v=m[2].trim().replace(/^["']|["']$/g,'');if(!process.env[m[1]])process.env[m[1]]=v;}}
const CLERK='https://api.clerk.com/v1';const CK=process.env.CLERK_SECRET_KEY!;
const USER='user_3DsXdjWVZSvaRhIVrO77UeQkXVU';const ORG='org_3JOQsdjZaOp7tyVtbUr7Rc7GS5N';
const PROJ='5cf4d33c-3c3d-417a-a10d-212504d62773';const PROD='https://vliving.life';
async function clerk(r:string,init:RequestInit={}):Promise<any>{const res=await fetch(`${CLERK}${r}`,{...init,headers:{Authorization:`Bearer ${CK}`,'Content-Type':'application/json',...(init.headers??{})}});const t=await res.text();const b=t?JSON.parse(t):null;if(!res.ok)throw new Error(`clerk ${r} -> ${res.status} ${JSON.stringify(b).slice(0,300)}`);return b;}
function frontendApi(){const pk=process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY??'';return Buffer.from(pk.split('_')[2]??'','base64').toString('utf8').replace(/\$$/,'');}
const ORIGEN=`https://${frontendApi().replace(/^clerk\./,'')}`;
(async()=>{
  const sit=await clerk('/sign_in_tokens',{method:'POST',body:JSON.stringify({user_id:USER,expires_in_seconds:3600})});
  const r=await fetch(`https://${frontendApi()}/v1/client/sign_ins?__clerk_api_version=2025-04-10&_clerk_js_version=5.35.0`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Origin:ORIGEN},body:new URLSearchParams({strategy:'ticket',ticket:sit.token})});
  const cuerpo=await r.json();
  const cookie=(r.headers.getSetCookie?.()??[]).map(c=>c.split(';')[0]).find(c=>c?.startsWith('__client='))?.replace('__client=','');
  const sessionId=(cuerpo?.response??cuerpo)?.created_session_id;
  console.log('sessionId:',sessionId?.slice(0,20),'cookie?',Boolean(cookie));
  // jwt with active org
  const tr=await fetch(`https://${frontendApi()}/v1/client/sessions/${sessionId}/touch?__clerk_api_version=2025-04-10&_clerk_js_version=5.35.0`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Cookie:`__client=${cookie}`,Origin:ORIGEN},body:new URLSearchParams({active_organization_id:ORG})});
  const tb=await tr.json();const jwt=(tb?.response??tb)?.last_active_token?.jwt;
  console.log('jwt?',Boolean(jwt));
  for(const path of ['/projects',`/projects/${PROJ}`,'/admin']){
    const res=await fetch(`${PROD}${path}`,{headers:{Authorization:`Bearer ${jwt}`},redirect:'manual'});
    console.log(path,'->',res.status, res.headers.get('location')||'');
  }
  // revoke
  await clerk(`/sessions/${sessionId}/revoke`,{method:'POST'});
  console.log('revoked');
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
