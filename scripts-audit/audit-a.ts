/**
 * AUDITORÍA A — UX, recorrido completo de Goossip en PRODUCCIÓN (vliving.life).
 * Solo lectura. No commitea. Con la sesión REAL de turbillon50 (Bearer JWT) y el
 * proyecto MOMENTUM. Crea un usuario desechable SOLO para ver el onboarding de
 * "alguien que llega de cero" y lo borra al final. Revoca toda sesión al cerrar.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// --- cargar env del repo c5 ANTES de tocar db/config ------------------------
const envRaw = readFileSync('/root/repos/goossip-composio-c5/.env.local', 'utf8');
for (const line of envRaw.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) {
    const v = m[2].trim().replace(/^["']|["']$/g, '');
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

const PROD = 'https://vliving.life';
const CLERK = 'https://api.clerk.com/v1';
const CK = process.env.CLERK_SECRET_KEY!;
const USER = 'user_3DsXdjWVZSvaRhIVrO77UeQkXVU'; // turbillon50@gmail.com
const ORG = 'org_3JOQsdjZaOp7tyVtbUr7Rc7GS5N'; // all-global
const PROJ = '5cf4d33c-3c3d-417a-a10d-212504d62773'; // MOMENTUM
const SALIDA = '/root/capturas-audit-a';

async function clerk(r: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${CLERK}${r}`, {
    ...init,
    headers: { Authorization: `Bearer ${CK}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const t = await res.text();
  const b = t ? JSON.parse(t) : null;
  if (!res.ok) throw new Error(`clerk ${r} -> ${res.status} ${JSON.stringify(b).slice(0, 300)}`);
  return b;
}
function frontendApi() {
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';
  return Buffer.from(pk.split('_')[2] ?? '', 'base64').toString('utf8').replace(/\$$/, '');
}
const ORIGEN = `https://${frontendApi().replace(/^clerk\./, '')}`;

interface Sesion { userId: string; sessionId: string; clientCookie: string; }
async function abrirSesion(userId: string): Promise<Sesion> {
  const sit = await clerk('/sign_in_tokens', { method: 'POST', body: JSON.stringify({ user_id: userId, expires_in_seconds: 3600 }) });
  const res = await fetch(`https://${frontendApi()}/v1/client/sign_ins?__clerk_api_version=2025-04-10&_clerk_js_version=5.35.0`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: ORIGEN },
    body: new URLSearchParams({ strategy: 'ticket', ticket: sit.token }),
  });
  const cuerpo = await res.json();
  const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).find((c) => c?.startsWith('__client='))?.replace('__client=', '');
  const sessionId = (cuerpo?.response ?? cuerpo)?.created_session_id;
  if (!sessionId || !cookie) throw new Error(`no se abrió sesión: ${JSON.stringify(cuerpo).slice(0, 300)}`);
  return { userId, sessionId, clientCookie: cookie };
}
async function jwt(s: Sesion, orgId?: string): Promise<string> {
  const body = new URLSearchParams();
  if (orgId) body.set('active_organization_id', orgId);
  const res = await fetch(`https://${frontendApi()}/v1/client/sessions/${s.sessionId}/touch?__clerk_api_version=2025-04-10&_clerk_js_version=5.35.0`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: `__client=${s.clientCookie}`, Origin: ORIGEN }, body,
  });
  const b = await res.json();
  const t = (b?.response ?? b)?.last_active_token?.jwt;
  if (!t) throw new Error(`sin jwt: ${JSON.stringify(b).slice(0, 200)}`);
  return t;
}

// Lo que un cliente NO debe leer en pantalla.
const JERGA = ['auth_config','api key','api_key','request_id',': undefined','[object','internal server error','application error','unhandled','forbidden','traceback','env var','process.env','oauth','aspect_ratio','data:image','postgres','endpoint','TODO','FIXME','lorem ipsum','placeholder','coming soon','client-side exception','something went wrong','404','not found','500'];
const INGLES = [' the ',' your ',' settings',' loading',' welcome',' sign in',' sign up',' dashboard',' save ',' cancel',' submit',' error',' failed',' retry',' comingsoon'];

interface Rec { pantalla: string; ruta: string; viewport: string; status: number|null; tLoad: number|null; tIdle: number|null; ttfb: number|null; dom: number|null; load: number|null; jerga: string[]; ingles: string[]; jsErrores: string[]; archivo: string; textoInicio: string; }
const recs: Rec[] = [];

let webkit: any;
async function nuevoContexto(browser: any, viewport: {width:number;height:number}, token?: string) {
  return browser.newContext({
    viewport, deviceScaleFactor: 2, locale: 'es-MX',
    ...(token ? { extraHTTPHeaders: { Authorization: `Bearer ${token}` } } : {}),
  });
}

async function capturar(browser: any, pantalla: string, ruta: string, opts: { token?: string; viewport: {nombre:string;width:number;height:number}; prep?: (p:any)=>Promise<void>; fullPage?: boolean }) {
  const ctx = await nuevoContexto(browser, { width: opts.viewport.width, height: opts.viewport.height }, opts.token);
  const page = await ctx.newPage();
  const jsErrores: string[] = [];
  page.on('pageerror', (e: any) => jsErrores.push(String(e.message).slice(0, 200)));
  page.on('console', (m: any) => { if (m.type() === 'error') { const t = m.text(); if (!/clerk|Failed to load resource|favicon|net::ERR/i.test(t)) jsErrores.push(t.slice(0, 200)); } });

  let status: number|null = null, tLoad: number|null = null, tIdle: number|null = null;
  let ttfb: number|null = null, dom: number|null = null, load: number|null = null;
  let jerga: string[] = [], ingles: string[] = [], textoInicio = '';
  const t0 = Date.now();
  try {
    const res = await page.goto(`${PROD}${ruta}`, { waitUntil: 'load', timeout: 60_000 });
    status = res?.status() ?? null;
    tLoad = Date.now() - t0;
    await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => undefined);
    tIdle = Date.now() - t0;
    if (opts.prep) await opts.prep(page);
    await page.waitForTimeout(1200);
    const perf = (await page.evaluate(`(() => { const n = performance.getEntriesByType('navigation')[0]; if(!n) return null; return { ttfb: Math.round(n.responseStart), dom: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd) }; })()`)) as any;
    if (perf) { ttfb = perf.ttfb; dom = perf.dom; load = perf.load; }
    const visible = (await page.evaluate(`document.body.innerText || ''`)) as string;
    const t2 = visible.toLowerCase();
    jerga = JERGA.filter((j) => t2.includes(j.toLowerCase()));
    ingles = INGLES.filter((j) => t2.includes(j));
    textoInicio = visible.replace(/\n{2,}/g, '\n').slice(0, 1500);
  } catch (e) {
    jsErrores.push(`navegación: ${(e as Error).message.slice(0, 160)}`);
  }
  const archivo = path.join(SALIDA, `${pantalla}-${opts.viewport.nombre}.png`);
  await page.screenshot({ path: archivo, fullPage: opts.fullPage ?? true }).catch(() => undefined);
  const r: Rec = { pantalla, ruta, viewport: opts.viewport.nombre, status, tLoad, tIdle, ttfb, dom, load, jerga, ingles, jsErrores, archivo, textoInicio };
  recs.push(r);
  console.log(`  ${status===200 && jsErrores.length===0 ? '✓':'✗'} ${pantalla} · ${opts.viewport.nombre} · HTTP ${status} · load ${tLoad}ms idle ${tIdle}ms · ${jsErrores.length}JS · jerga:${jerga.join(',')||'-'} · en:${ingles.length}`);
  await ctx.close();
}

const DESKTOP = { nombre: '1440', width: 1440, height: 900 };
const MOBILE = { nombre: '390', width: 390, height: 844 };
const MOBILE_VP = { nombre: '390vp', width: 390, height: 844 };

async function main() {
  mkdirSync(SALIDA, { recursive: true });
  if (!CK) throw new Error('CLERK_SECRET_KEY no está.');
  webkit = (await import('/root/vulcano-audit/shot-tool/node_modules/playwright/index.mjs' as never)).webkit;
  const browser = await webkit.launch();

  const sesiones: string[] = [];
  let desechable: { clerkId: string; sesion: Sesion } | null = null;
  try {
    // ---------- 1. PÚBLICO, sin sesión ----------
    console.log('\n== PÚBLICO (sin sesión) ==');
    const publicas: Array<[string,string]> = [['01-home','/'],['02-sign-in','/sign-in'],['03-sign-up','/sign-up'],['04-terminos','/terminos'],['05-privacidad','/privacidad']];
    for (const [nom, ruta] of publicas) {
      await capturar(browser, nom, ruta, { viewport: DESKTOP });
      await capturar(browser, nom, ruta, { viewport: MOBILE });
    }

    // ---------- 2. ONBOARDING de alguien que llega de cero ----------
    console.log('\n== ONBOARDING (usuario desechable, sin org) ==');
    const marca = Date.now().toString(36);
    const u = await clerk('/users', { method: 'POST', body: JSON.stringify({ email_address: [`goossip_qa_auditA_${marca}@vforge.site`], username: `goossip_qa_auditA_${marca}`, first_name: 'Prueba', password: `Qa-Audit-2026-${marca}A!x`, skip_password_checks: true }) });
    const sDes = await abrirSesion(u.id);
    sesiones.push(sDes.sessionId);
    desechable = { clerkId: u.id, sesion: sDes };
    // sin org: token sin active_organization_id
    for (const vp of [DESKTOP, MOBILE]) {
      const tok = await jwt(sDes);
      await capturar(browser, '06-onboarding', '/onboarding', { token: tok, viewport: vp });
    }

    // ---------- 3. SESIÓN REAL turbillon50 @ all-global ----------
    console.log('\n== SESIÓN REAL (turbillon50 / all-global) ==');
    const s = await abrirSesion(USER);
    sesiones.push(s.sessionId);

    const conAuth = async (nom: string, ruta: string, extra: {vp?: any[]; prep?: (p:any)=>Promise<void>}={}) => {
      for (const vp of (extra.vp ?? [DESKTOP, MOBILE])) {
        const tok = await jwt(s, ORG);
        await capturar(browser, nom, ruta, { token: tok, viewport: vp, prep: extra.prep });
      }
    };

    await conAuth('07-projects', '/projects');
    await conAuth('08-projects-new', '/projects/new');

    const secciones: Array<[string,string]> = [
      ['09-inicio', `/projects/${PROJ}`],
      ['10-conexiones', `/projects/${PROJ}/conexiones`],
      ['11-contenido', `/projects/${PROJ}/contenido`],
      ['12-campanas', `/projects/${PROJ}/campanas`],
      ['13-leads', `/projects/${PROJ}/leads`],
      ['14-conversaciones', `/projects/${PROJ}/conversaciones`],
      ['15-prospeccion', `/projects/${PROJ}/leads?vista=prospeccion`],
      ['16-competencia', `/projects/${PROJ}/competencia`],
      ['17-marca', `/projects/${PROJ}/marca`],
      ['18-conocimiento', `/projects/${PROJ}/conocimiento`],
      ['19-equipo', `/projects/${PROJ}/equipo`],
      ['20-automatizaciones', `/projects/${PROJ}/automatizaciones`],
      ['21-ajustes', `/projects/${PROJ}/ajustes`],
    ];
    for (const [nom, ruta] of secciones) await conAuth(nom, ruta);

    await conAuth('22-admin', '/admin');

    // ---------- 4. EL ASISTENTE: 3 peticiones normales ----------
    console.log('\n== ASISTENTE (3 peticiones) ==');
    const prompts = [
      '¿Qué debería publicar esta semana para MOMENTUM?',
      'Redáctame 3 posts para Instagram para este fin de semana.',
      '¿Cómo voy con mis leads y qué hago con los que no he contactado?',
    ];
    for (let i = 0; i < prompts.length; i++) {
      const tok = await jwt(s, ORG);
      const ctx = await nuevoContexto(browser, { width: DESKTOP.width, height: DESKTOP.height }, tok);
      const page = await ctx.newPage();
      const jsErrores: string[] = [];
      page.on('pageerror', (e: any) => jsErrores.push(String(e.message).slice(0, 200)));
      page.on('console', (m: any) => { if (m.type()==='error'){const t=m.text(); if(!/clerk|Failed to load resource|favicon|net::ERR/i.test(t)) jsErrores.push(t.slice(0,200));} });
      let respuesta = '';
      try {
        await page.goto(`${PROD}/projects/${PROJ}`, { waitUntil: 'load', timeout: 60_000 });
        await page.waitForTimeout(1500);
        await page.keyboard.press('Control+k');
        await page.waitForTimeout(1500);
        const ta = page.locator('textarea[aria-label="Mensaje para el Asistente"]');
        await ta.fill(prompts[i]!, { timeout: 8000 });
        await ta.press('Enter');
        // esperar respuesta (hasta 45s)
        await page.waitForTimeout(2000);
        for (let w = 0; w < 22; w++) {
          const pensando = await page.evaluate(`(document.body.innerText||'').toLowerCase().includes('pensando') || (document.body.innerText||'').toLowerCase().includes('escribiendo')`);
          if (!pensando) { const aside = await page.evaluate(`(() => { const a = document.querySelector('aside[aria-hidden="false"]'); return a ? a.innerText.length : 0; })()`); if ((aside as number) > 200) break; }
          await page.waitForTimeout(2000);
        }
        await page.waitForTimeout(1500);
        respuesta = (await page.evaluate(`(() => { const a = document.querySelector('aside[aria-hidden="false"]'); return a ? a.innerText : ''; })()`)) as string;
      } catch (e) { jsErrores.push(`asistente: ${(e as Error).message.slice(0,160)}`); }
      const archivo = path.join(SALIDA, `23-asistente-${i+1}-1440.png`);
      await page.screenshot({ path: archivo, fullPage: false }).catch(() => undefined);
      recs.push({ pantalla: `23-asistente-${i+1}`, ruta: '(Ctrl+K)', viewport: '1440', status: 200, tLoad: null, tIdle: null, ttfb: null, dom: null, load: null, jerga: [], ingles: [], jsErrores, archivo, textoInicio: `PROMPT: ${prompts[i]}\n---\n${respuesta.slice(0, 1800)}` });
      console.log(`  asistente #${i+1}: ${respuesta.length} chars · ${jsErrores.length}JS`);
      await ctx.close();
    }
  } catch (e) {
    console.error('\n✗ explotó:', e);
  } finally {
    // limpieza: borrar usuario desechable (Clerk + fila en DB) y revocar sesiones
    console.log('\n== LIMPIEZA ==');
    if (desechable) {
      try {
        const { db, schema } = await import('../src/db/client');
        const { eq } = await import('drizzle-orm');
        await db.delete(schema.users).where(eq(schema.users.clerkId, desechable.clerkId)).catch((e:any)=>console.log('  db del user:', e.message));
        console.log('  fila DB del desechable borrada (si existía)');
      } catch (e) { console.log('  no se pudo borrar fila DB:', (e as Error).message); }
      await clerk(`/users/${desechable.clerkId}`, { method: 'DELETE' }).then(()=>console.log('  usuario Clerk desechable borrado')).catch((e)=>console.log('  clerk del user:', e.message));
    }
    for (const sid of sesiones) await clerk(`/sessions/${sid}/revoke`, { method: 'POST' }).then(()=>console.log(`  sesión ${sid.slice(0,16)} revocada`)).catch(()=>undefined);
    await browser.close();
  }

  writeFileSync(path.join(SALIDA, 'resumen.json'), JSON.stringify({ base: PROD, capturas: recs.length, detalle: recs }, null, 2));
  const lentas = recs.filter((r) => (r.tLoad ?? 0) > 3000);
  console.log(`\n${recs.length} capturas · ${recs.filter(r=>r.status===200).length} HTTP200 · ${recs.reduce((n,r)=>n+r.jsErrores.length,0)} errores JS · ${lentas.length} pantallas >3s`);
  console.log(`resumen en ${path.join(SALIDA,'resumen.json')}`);
}

void main();
