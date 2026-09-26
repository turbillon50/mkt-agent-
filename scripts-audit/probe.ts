import { readFileSync } from 'node:fs';
// cargar env del repo c5
const envRaw = readFileSync('/root/repos/goossip-composio-c5/.env.local','utf8');
for (const line of envRaw.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) { let v = m[2].trim().replace(/^["']|["']$/g,''); if(!process.env[m[1]]) process.env[m[1]]=v; }
}
const CLERK='https://api.clerk.com/v1';
const CK=process.env.CLERK_SECRET_KEY!;
async function clerk(r:string,init:RequestInit={}):Promise<any>{
  const res=await fetch(`${CLERK}${r}`,{...init,headers:{Authorization:`Bearer ${CK}`,'Content-Type':'application/json',...(init.headers??{})}});
  const t=await res.text(); const b=t?JSON.parse(t):null;
  if(!res.ok) throw new Error(`clerk ${r} -> ${res.status} ${JSON.stringify(b).slice(0,300)}`);
  return b;
}
function frontendApi(){const pk=process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY??'';return Buffer.from(pk.split('_')[2]??'','base64').toString('utf8').replace(/\$$/,'');}
(async()=>{
  console.log('frontendApi:', frontendApi());
  const users=await clerk('/users?email_address=turbillon50@gmail.com');
  const u=users[0];
  console.log('user:', u?.id, u?.email_addresses?.[0]?.email_address, 'admin?', JSON.stringify(u?.public_metadata||{}).slice(0,100));
  const orgs=await clerk(`/users/${u.id}/organization_memberships`);
  console.log('orgs:', (orgs.data||orgs).map((m:any)=>`${m.organization?.slug}:${m.organization?.id}:${m.role}`).join(' | '));
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
