import { readFileSync } from 'node:fs';
import path from 'node:path';
const envRaw = readFileSync('/root/repos/goossip-composio-c5/.env.local', 'utf8');
for (const line of envRaw.split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) { const v = m[2].trim().replace(/^["']|["']$/g, ''); if (!process.env[m[1]]) process.env[m[1]] = v; } }
const PROD='https://vliving.life', CLERK='https://api.clerk.com/v1', CK=process.env.CLERK_SECRET_KEY!;
const USER='user_3DsXdjWVZSvaRhIVrO77UeQkXVU', ORG='org_3JOQsdjZaOp7tyVtbUr7Rc7GS5N', PROJ='5cf4d33c-3c3d-417a-a10d-212504d62773';
const SALIDA='/root/capturas-audit-a';
async function clerk(r:string,init:RequestInit={}):Promise<any>{const res=await fetch(`${CLERK}${r}`,{...init,headers:{Authorization:`Bearer ${CK}`,'Content-Type':'application/json',...(init.headers??{})}});const t=await res.text();const b=t?JSON.parse(t):null;if(!res.ok)throw new Error(`clerk ${r} -> ${res.status}`);return b;}
function frontendApi(){const pk=process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY??'';return Buffer.from(pk.split('_')[2]??'','base64').toString('utf8').replace(/\$$/,'');}
const ORIGEN=`https://${frontendApi().replace(/^clerk\./,'')}`;
async function abrir(uid:string){const sit=await clerk('/sign_in_tokens',{method:'POST',body:JSON.stringify({user_id:uid,expires_in_seconds:3600})});const res=await fetch(`https://${frontendApi()}/v1/client/sign_ins?__clerk_api_version=2025-04-10&_clerk_js_version=5.35.0`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Origin:ORIGEN},body:new URLSearchParams({strategy:'ticket',ticket:sit.token})});const c=await res.json();const cookie=(res.headers.getSetCookie?.()??[]).map(x=>x.split(';')[0]).find(x=>x?.startsWith('__client='))?.replace('__client=','');const sid=(c?.response??c)?.created_session_id;return {sid,cookie};}
async function jwt(sid:string,cookie:string){const r=await fetch(`https://${frontendApi()}/v1/client/sessions/${sid}/touch?__clerk_api_version=2025-04-10&_clerk_js_version=5.35.0`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Cookie:`__client=${cookie}`,Origin:ORIGEN},body:new URLSearchParams({active_organization_id:ORG})});const b=await r.json();return (b?.response??b)?.last_active_token?.jwt;}
const prompts=['¿Qué debería publicar esta semana para MOMENTUM?','Redáctame 3 posts para Instagram para este fin de semana.','¿Cómo voy con mis leads y qué hago con los que no he contactado?'];
(async()=>{
  const webkit=(await import('/root/vulcano-audit/shot-tool/node_modules/playwright/index.mjs' as never)).webkit;
  const browser=await webkit.launch();
  const {sid,cookie}=await abrir(USER);
  const salida:any[]=[];
  for(let i=0;i<prompts.length;i++){
    const tok=await jwt(sid!,cookie!);
    const ctx=await browser.newContext({viewport:{width:1200,height:1200},deviceScaleFactor:2,locale:'es-MX',extraHTTPHeaders:{Authorization:`Bearer ${tok}`}});
    const page=await ctx.newPage();
    const js:string[]=[];
    page.on('pageerror',(e:any)=>js.push(String(e.message).slice(0,200)));
    let resp='';
    try{
      await page.goto(`${PROD}/projects/${PROJ}`,{waitUntil:'load',timeout:60000});
      await page.waitForLoadState('networkidle',{timeout:20000}).catch(()=>{});
      const ta=page.locator('textarea[placeholder^="Pídele algo"]');
      await ta.waitFor({state:'visible',timeout:15000});
      await ta.fill(prompts[i]!);
      await ta.press('Enter');
      // esperar respuesta del asistente
      for(let w=0;w<30;w++){
        await page.waitForTimeout(2000);
        const info=await page.evaluate(`(()=>{const t=document.body.innerText||'';return {pensando:/pensando|escribiendo|\\.\\.\\./i.test(t),len:t.length};})()`) as any;
        const msgs=await page.evaluate(`document.querySelectorAll('[data-rol="assistant"], [data-role="assistant"]').length`) as number;
        if(!info.pensando && w>2) break;
      }
      await page.waitForTimeout(1500);
      resp=await page.evaluate(`(()=>{const c=document.querySelector('main')||document.body;return c.innerText;})()`) as string;
    }catch(e){js.push('err: '+(e as Error).message.slice(0,160));}
    const archivo=path.join(SALIDA,`23-asistente-${i+1}-1200.png`);
    await page.screenshot({path:archivo,fullPage:true}).catch(()=>{});
    salida.push({i:i+1,prompt:prompts[i],js,respLen:resp.length});
    console.log(`#${i+1} · ${resp.length} chars · ${js.length}JS ${js.join('|')}`);
    console.log('  TXT:', resp.replace(/\n{2,}/g,' | ').slice(0,700));
    ctx.close();
  }
  await clerk(`/sessions/${sid}/revoke`,{method:'POST'}).catch(()=>{});
  console.log('sesión revocada');
  await browser.close();
})();
