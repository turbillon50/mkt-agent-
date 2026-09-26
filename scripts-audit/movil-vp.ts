import { readFileSync } from 'node:fs';
import path from 'node:path';
const envRaw = readFileSync('/root/repos/goossip-composio-c5/.env.local', 'utf8');
for (const line of envRaw.split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) { const v = m[2].trim().replace(/^["']|["']$/g, ''); if (!process.env[m[1]]) process.env[m[1]] = v; } }
const PROD='https://vliving.life', CLERK='https://api.clerk.com/v1', CK=process.env.CLERK_SECRET_KEY!;
const USER='user_3DsXdjWVZSvaRhIVrO77UeQkXVU', ORG='org_3JOQsdjZaOp7tyVtbUr7Rc7GS5N', PROJ='5cf4d33c-3c3d-417a-a10d-212504d62773';
const SALIDA='/root/capturas-audit-a';
async function clerk(r:string,init:RequestInit={}):Promise<any>{const res=await fetch(`${CLERK}${r}`,{...init,headers:{Authorization:`Bearer ${CK}`,'Content-Type':'application/json',...(init.headers??{})}});const t=await res.text();return t?JSON.parse(t):null;}
function fa(){const pk=process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY??'';return Buffer.from(pk.split('_')[2]??'','base64').toString('utf8').replace(/\$$/,'');}
const ORIGEN=`https://${fa().replace(/^clerk\./,'')}`;
async function abrir(uid:string){const sit=await clerk('/sign_in_tokens',{method:'POST',body:JSON.stringify({user_id:uid,expires_in_seconds:3600})});const res=await fetch(`https://${fa()}/v1/client/sign_ins?__clerk_api_version=2025-04-10&_clerk_js_version=5.35.0`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Origin:ORIGEN},body:new URLSearchParams({strategy:'ticket',ticket:sit.token})});const c=await res.json();const cookie=(res.headers.getSetCookie?.()??[]).map(x=>x.split(';')[0]).find(x=>x?.startsWith('__client='))?.replace('__client=','');const sid=(c?.response??c)?.created_session_id;return {sid,cookie};}
async function jwt(sid:string,cookie:string){const r=await fetch(`https://${fa()}/v1/client/sessions/${sid}/touch?__clerk_api_version=2025-04-10&_clerk_js_version=5.35.0`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Cookie:`__client=${cookie}`,Origin:ORIGEN},body:new URLSearchParams({active_organization_id:ORG})});const b=await r.json();return (b?.response??b)?.last_active_token?.jwt;}
const pantallas:[string,string][]=[['09-inicio',`/projects/${PROJ}`],['13-leads',`/projects/${PROJ}/leads`],['14-conversaciones',`/projects/${PROJ}/conversaciones`],['11-contenido',`/projects/${PROJ}/contenido`]];
(async()=>{
  const webkit=(await import('/root/vulcano-audit/shot-tool/node_modules/playwright/index.mjs' as never)).webkit;
  const browser=await webkit.launch();
  const {sid,cookie}=await abrir(USER);
  for(const [nom,ruta] of pantallas){
    const tok=await jwt(sid!,cookie!);
    const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,locale:'es-MX',extraHTTPHeaders:{Authorization:`Bearer ${tok}`}});
    const page=await ctx.newPage();
    await page.goto(`${PROD}${ruta}`,{waitUntil:'load',timeout:60000}).catch(()=>{});
    await page.waitForLoadState('networkidle',{timeout:15000}).catch(()=>{});
    await page.waitForTimeout(1500);
    // viewport-only (para ver el tab bar fijo y el safe-area)
    await page.screenshot({path:path.join(SALIDA,`${nom}-390vp.png`),fullPage:false}).catch(()=>{});
    // y scrolleado al fondo, para ver si el tab bar tapa el último contenido
    await page.evaluate(`window.scrollTo(0, document.body.scrollHeight)`);
    await page.waitForTimeout(800);
    await page.screenshot({path:path.join(SALIDA,`${nom}-390vp-fondo.png`),fullPage:false}).catch(()=>{});
    console.log('vp',nom);
    ctx.close();
  }
  await clerk(`/sessions/${sid}/revoke`,{method:'POST'}).catch(()=>{});
  await browser.close();
  console.log('listo, sesión revocada');
})();
