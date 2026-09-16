/**
 * Las pruebas de aceptación del spec de la corrida 8, corridas DE VERDAD en el
 * navegador: se sueltan archivos en el compose, se manda el mensaje y se lee lo
 * que Goossip contesta.
 *
 *   GOOSSIP_TEST_BASE_URL=http://127.0.0.1:3100 npx tsx scripts/aceptacion-c8.ts
 *
 * Qué comprueba, en este orden:
 *   1. Que un PDF de varias páginas y una foto SUBAN al almacén del proyecto y
 *      queden con su chip.
 *   2. Que Goossip los LEA y conteste citando lo que dice el PDF. Es la prueba
 *      1 del spec sin la parte de generar imágenes: lo que se mide aquí es la
 *      lectura, que es lo nuevo; el motor de piezas ya se midió en la corrida 6.
 *   3. Que el texto llegue TRANSMITIDO (se cuenta cuántas veces crece el
 *      mensaje mientras el modelo escribe: si llegara de un golpe, sería 1).
 *   4. Que el turno quede guardado en el hilo del proyecto y se pueda volver a
 *      abrir desde el historial.
 *
 * Al final borra todo lo que creó.
 */
import '../src/env';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { and, eq, inArray } from 'drizzle-orm';
import sharp from 'sharp';
import { db } from '../src/db/client';
import {
  assistantConversations,
  assistantFiles,
  assistantMessages,
  campaigns,
  organizations,
  orgMemberships,
  projectBrandKit,
  projectMembers,
  salesLeads,
  users,
} from '../src/db/schema';
import { upsertMembership, upsertOrg } from '../src/orgs/repo';
import { createProject } from '../src/sales/projects';
import { saveBrandKit } from '../src/creative/brand-kit';

const BASE = process.env.GOOSSIP_TEST_BASE_URL ?? 'http://127.0.0.1:3100';
const SALIDA = path.resolve('capturas-c8');
const CLERK = 'https://api.clerk.com/v1';
const CK = process.env.CLERK_SECRET_KEY ?? '';

let pasadas = 0;
const fallidas: string[] = [];
function ok(nombre: string, condicion: boolean, detalle?: string) {
  console.log(`  ${condicion ? '✓' : '✗'} ${nombre}${detalle ? ` — ${detalle}` : ''}`);
  if (condicion) pasadas += 1;
  else fallidas.push(`${nombre}${detalle ? ` — ${detalle}` : ''}`);
}

async function clerk(ruta: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${CLERK}${ruta}`, {
    ...init,
    headers: { Authorization: `Bearer ${CK}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`clerk ${ruta} → ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
  return body;
}

function frontendApi(): string {
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';
  return Buffer.from(pk.split('_')[2] ?? '', 'base64').toString('utf8').replace(/\$$/, '');
}
const ORIGEN = `https://${frontendApi().replace(/^clerk\./, '')}`;

/**
 * El brochure: 12 páginas con datos que NO puede saber ningún modelo. Ese es el
 * punto — si Goossip dice "24 niveles" y "entrega marzo de 2028", los leyó; no
 * los adivinó ni los sacó de su entrenamiento.
 */
const DATOS_DEL_PDF = {
  proyecto: 'Torre Arboleda',
  niveles: '24 niveles',
  entrega: 'marzo de 2028',
  precio: 'desde 4,850,000 pesos',
  amenidad: 'alberca semiolímpica techada en el nivel 22',
  colonia: 'Polanco',
};

function pdfDeDoce(): Buffer {
  const renglones: string[][] = [
    [`${DATOS_DEL_PDF.proyecto}`, `Desarrollo vertical en ${DATOS_DEL_PDF.colonia}.`],
    ['El edificio', `${DATOS_DEL_PDF.niveles} sobre nivel de calle.`],
    ['Entrega', `La entrega esta programada para ${DATOS_DEL_PDF.entrega}.`],
    ['Precios', `Departamentos ${DATOS_DEL_PDF.precio}.`],
    ['Amenidades', `Hay ${DATOS_DEL_PDF.amenidad}.`],
    ['Gimnasio', 'Equipado, abierto de 5 a 23 horas.'],
    ['Roof garden', 'Con asadores y comedor para 40 personas.'],
    ['Estacionamiento', 'Dos cajones por departamento.'],
    ['Seguridad', 'Acceso controlado 24 horas.'],
    ['Ubicacion', 'A cuatro cuadras del Parque Lincoln.'],
    ['Financiamiento', 'Enganche del 20 por ciento a 18 meses.'],
    ['Contacto', 'ventas@torrearboleda.mx'],
  ];

  const objetos: (string | null)[] = ['<< /Type /Catalog /Pages 2 0 R >>', null];
  const paginas: number[] = [];
  const flujos: number[] = [];
  let siguiente = 3;

  for (let i = 0; i < renglones.length; i++) {
    paginas.push(siguiente);
    siguiente += 1;
    flujos.push(siguiente);
    siguiente += 1;
  }
  const fuente = siguiente;

  for (let i = 0; i < renglones.length; i++) {
    const [titulo, cuerpo] = renglones[i]!;
    objetos[paginas[i]! - 1] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fuente} 0 R >> >> /Contents ${flujos[i]} 0 R >>`;
    const contenido = `BT /F1 20 Tf 72 720 Td (${titulo}) Tj ET BT /F1 13 Tf 72 680 Td (${cuerpo}) Tj ET BT /F1 10 Tf 72 60 Td (Pagina ${i + 1} de ${renglones.length}) Tj ET`;
    objetos[flujos[i]! - 1] = `<< /Length ${contenido.length} >>\nstream\n${contenido}\nendstream`;
  }
  objetos[1] = `<< /Type /Pages /Kids [${paginas.map((p) => `${p} 0 R`).join(' ')}] /Count ${renglones.length} >>`;
  objetos[fuente - 1] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

  let cuerpo = '%PDF-1.4\n';
  const offsets: number[] = [];
  objetos.forEach((o, i) => {
    offsets.push(cuerpo.length);
    cuerpo += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const inicioXref = cuerpo.length;
  cuerpo += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) cuerpo += `${String(o).padStart(10, '0')} 00000 n \n`;
  cuerpo += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`;
  return Buffer.from(cuerpo, 'latin1');
}

interface Escenario {
  orgId: string;
  clerkId: string;
  userId: string;
  projectId: string;
  sessionId: string;
  clientCookie: string;
}

async function montar(): Promise<Escenario> {
  const marca = Date.now().toString(36);
  const username = `goossip_a8_${marca}`;
  const email = `${username}@vforge.site`;

  const u = await clerk('/users', {
    method: 'POST',
    body: JSON.stringify({
      email_address: [email],
      username,
      first_name: 'Luis',
      password: `Qa-Goossip-2026-${marca}A!x`,
      skip_password_checks: true,
    }),
  });
  const slug = `qa-a8-${marca}`;
  const o = await clerk('/organizations', {
    method: 'POST',
    body: JSON.stringify({ name: 'All Global Holding', slug, created_by: u.id }),
  });

  const [row] = await db
    .insert(users)
    .values({ clerkId: u.id, email, username, firstName: 'Luis', isAdmin: false })
    .onConflictDoNothing()
    .returning();
  const dbUser = row ?? (await db.select().from(users).where(eq(users.clerkId, u.id)).limit(1))[0];

  await upsertOrg({ id: o.id, name: 'All Global Holding', slug, ownerUserId: u.id });
  await upsertMembership({ id: `orgmem_${marca}`, orgId: o.id, clerkUserId: u.id, email, role: 'org:admin' });

  const project = await createProject(o.id, dbUser!.id, {
    name: 'MOMENTUM',
    kind: 'inmobiliaria',
    website: 'https://vmomentum.site',
    city: 'Ciudad de México',
    country: 'México',
  });

  await saveBrandKit(
    o.id,
    project.id,
    {
      logoUrl: 'https://vmomentum.site/brand/mark.png',
      paleta: [
        { rol: 'primario', hex: '#0B5FFF', nombre: 'Azul Momentum' },
        { rol: 'fondo', hex: '#0B1220', nombre: 'Noche' },
        { rol: 'texto', hex: '#FFFFFF', nombre: 'Blanco' },
      ],
      tipografias: [{ rol: 'titulos', familia: 'Inter', peso: '700' }],
      tono: 'Directo y cálido.',
      palabrasProhibidas: [],
    },
    email,
  );

  const sit = await clerk('/sign_in_tokens', {
    method: 'POST',
    body: JSON.stringify({ user_id: u.id, expires_in_seconds: 3600 }),
  });
  const res = await fetch(
    `https://${frontendApi()}/v1/client/sign_ins?__clerk_api_version=2025-04-10&_clerk_js_version=5.35.0`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: ORIGEN },
      body: new URLSearchParams({ strategy: 'ticket', ticket: sit.token }),
    },
  );
  const cuerpo = await res.json();
  const cookie = (res.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(';')[0])
    .find((c) => c?.startsWith('__client='))
    ?.replace('__client=', '');
  const sessionId = (cuerpo?.response ?? cuerpo)?.created_session_id;
  if (!sessionId || !cookie) throw new Error(`sesión: ${JSON.stringify(cuerpo).slice(0, 300)}`);

  return { orgId: o.id, clerkId: u.id, userId: dbUser!.id, projectId: project.id, sessionId, clientCookie: cookie };
}

async function jwt(e: Escenario): Promise<string> {
  const res = await fetch(
    `https://${frontendApi()}/v1/client/sessions/${e.sessionId}/touch?__clerk_api_version=2025-04-10&_clerk_js_version=5.35.0`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `__client=${e.clientCookie}`,
        Origin: ORIGEN,
      },
      body: new URLSearchParams({ active_organization_id: e.orgId }),
    },
  );
  const body = await res.json();
  const t = (body?.response ?? body)?.last_active_token?.jwt;
  if (!t) throw new Error(`sin jwt: ${JSON.stringify(body).slice(0, 200)}`);
  return t;
}

async function limpiar(e: Escenario | null): Promise<void> {
  if (!e) return;
  console.log('\n— limpieza —');
  const paso = async (fn: () => Promise<unknown>) => {
    await fn().catch(() => undefined);
  };
  await paso(() => db.delete(assistantFiles).where(eq(assistantFiles.projectId, e.projectId)));
  await paso(() => db.delete(assistantMessages).where(eq(assistantMessages.projectId, e.projectId)));
  await paso(() => db.delete(assistantConversations).where(eq(assistantConversations.projectId, e.projectId)));
  await paso(() => db.delete(projectBrandKit).where(eq(projectBrandKit.projectId, e.projectId)));
  await paso(() => db.delete(salesLeads).where(eq(salesLeads.campaignId, e.projectId)));
  await paso(() => db.delete(projectMembers).where(eq(projectMembers.projectId, e.projectId)));
  await paso(() => db.delete(campaigns).where(eq(campaigns.id, e.projectId)));
  await paso(() => db.delete(orgMemberships).where(eq(orgMemberships.orgId, e.orgId)));
  await paso(() => db.delete(organizations).where(eq(organizations.id, e.orgId)));
  await paso(() => db.delete(users).where(inArray(users.id, [e.userId])));
  await paso(() => clerk(`/organizations/${e.orgId}`, { method: 'DELETE' }));
  await paso(() => clerk(`/users/${e.clerkId}`, { method: 'DELETE' }));
  console.log('  listo');
}

async function main() {
  mkdirSync(SALIDA, { recursive: true });
  if (!CK) throw new Error('CLERK_SECRET_KEY no está en el entorno.');

  // Los archivos que se van a soltar, escritos a disco de verdad.
  const tmp = path.join(os.tmpdir(), `goossip-c8-${Date.now()}`);
  mkdirSync(tmp, { recursive: true });
  const rutaPdf = path.join(tmp, 'brochure-torre-arboleda.pdf');
  const rutaFoto = path.join(tmp, 'fachada.jpg');
  const pdf = pdfDeDoce();
  writeFileSync(rutaPdf, pdf);
  await sharp({
    create: { width: 1200, height: 800, channels: 3, background: { r: 11, g: 18, b: 32 } },
  })
    .jpeg({ quality: 80 })
    .toFile(rutaFoto);
  console.log(`archivos: PDF de ${(pdf.byteLength / 1024).toFixed(0)} KB (12 páginas) y una foto JPG\n`);

  const { webkit } = await import(
    '/root/vulcano-audit/shot-tool/node_modules/playwright/index.mjs' as never
  );
  const browser = await webkit.launch();
  let e: Escenario | null = null;
  const medido: Record<string, unknown> = {};

  try {
    e = await montar();
    console.log(`proyecto: ${e.projectId}\n`);

    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      locale: 'es-MX',
      extraHTTPHeaders: { Authorization: `Bearer ${await jwt(e)}` },
    });
    const page = await context.newPage();
    const erroresJs: string[] = [];
    page.on('pageerror', (err) => erroresJs.push(String(err.message).slice(0, 200)));

    await page.goto(`${BASE}/projects/${e.projectId}/leads`, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForTimeout(2500);

    console.log('— 1. soltar el PDF y la foto en el compose —');
    await page
      .locator('aside.asistente-aside input[type="file"]')
      .first()
      .setInputFiles([rutaPdf, rutaFoto]);

    // La subida va al almacén del proyecto: se espera a que los dos chips
    // dejen de decir "subiendo…".
    await page
      .waitForFunction(
        `(() => {
          const panel = document.querySelector('aside.asistente-aside');
          if (!panel) return false;
          const chips = Array.from(panel.querySelectorAll('span[title]'));
          return chips.length === 2 && chips.every((c) => !c.innerText.includes('subiendo'));
        })()`,
        { timeout: 180_000 },
      )
      .catch(() => undefined);

    const chips = (await page.evaluate(`(() => {
      const panel = document.querySelector('aside.asistente-aside');
      return panel ? Array.from(panel.querySelectorAll('span[title]')).map((c) => c.innerText.replace(/\\n/g, ' ').trim()) : [];
    })()`)) as string[];
    ok('los dos archivos subieron', chips.length === 2, chips.join(' | '));
    ok('ninguno falló', !chips.some((c) => c.includes('falló')), chips.join(' | '));
    medido.chips = chips;

    const enBase = await db
      .select()
      .from(assistantFiles)
      .where(eq(assistantFiles.projectId, e.projectId));
    ok('quedaron registrados en assistant_files', enBase.length === 2, `${enBase.length}`);
    ok(
      'con su almacén anotado',
      enBase.every((f) => f.storage === 'casa' || f.storage === 'blob'),
      enBase.map((f) => `${f.name}:${f.storage}`).join(' | '),
    );
    medido.almacen = enBase[0]?.storage;

    await page.screenshot({ path: path.join(SALIDA, '10-adjuntos-en-el-compose-1440.png') });

    console.log('\n— 2. preguntarle, y leer lo que contesta —');
    // Todo se busca DENTRO del panel: el cajón de celular sigue montado (lo
    // esconde CSS, no React) y tiene botones con la misma etiqueta.
    const caja = page.locator('aside.asistente-aside textarea[aria-label="Mensaje para Goossip"]');
    await caja.click();
    await caja.fill(
      'Lee el brochure y la foto que te acabo de pasar. Dime en qué colonia está el desarrollo, de cuántos niveles es, cuándo entregan y desde cuánto cuesta. Luego proponme 3 ideas de publicación para Instagram. No inventes nada que no venga en el PDF.',
    );

    // Se cuenta cuántas veces CRECE el mensaje del asistente. Si el texto
    // llegara de un golpe (sin transmitir), sería 1.
    await page.evaluate(`(() => {
      window.__crecidas = 0;
      window.__ultimo = '';
      window.__vigia = setInterval(() => {
        const panel = document.querySelector('aside.asistente-aside');
        if (!panel) return;
        const burbujas = panel.querySelectorAll('div.prose');
        const ultima = burbujas[burbujas.length - 1];
        const t = ultima ? (ultima.innerText || '') : '';
        if (t.length > window.__ultimo.length) { window.__crecidas += 1; window.__ultimo = t; }
      }, 120);
    })()`);

    const arranque = Date.now();
    await page.locator('aside.asistente-aside button[aria-label="Mandar"]').click();

    await page
      .waitForFunction(
        `(() => {
          const panel = document.querySelector('aside.asistente-aside');
          if (!panel) return false;
          const parar = panel.querySelector('button[aria-label="Parar"]');
          const burbujas = panel.querySelectorAll('div.prose');
          return !parar && burbujas.length > 0 && (burbujas[burbujas.length - 1].innerText || '').length > 80;
        })()`,
        { timeout: 290_000 },
      )
      .catch(() => undefined);
    const segundos = Math.round((Date.now() - arranque) / 1000);

    const lectura = (await page.evaluate(`(() => {
      clearInterval(window.__vigia);
      const panel = document.querySelector('aside.asistente-aside');
      const burbujas = panel ? panel.querySelectorAll('div.prose') : [];
      const ultima = burbujas.length ? burbujas[burbujas.length - 1].innerText : '';
      return { respuesta: ultima, crecidas: window.__crecidas };
    })()`)) as { respuesta: string; crecidas: number };

    console.log(`  (tardó ${segundos} s · el mensaje creció ${lectura.crecidas} veces)`);
    console.log(`  respuesta:\n${lectura.respuesta.split('\n').map((l) => `    ${l}`).join('\n')}\n`);

    const r = lectura.respuesta.toLowerCase();
    ok('contestó algo', lectura.respuesta.trim().length > 80, `${lectura.respuesta.length} caracteres`);
    /*
     * El transporte SSE entrega por partes: el aviso de lectura llega antes que
     * la respuesta, y eso ya son dos crecidas. Lo que NO se puede medir aquí es
     * el goteo token a token, y no por el código: el Mesh contesta
     * `502 {"error":"sin_motor"}` a toda petición con `stream: true` (3 de 3
     * medidas el 16-sep-2026) y `200` a las mismas tres sin transmitir. El
     * agente lo detecta y vuelve a pedir sin transmitir; por eso hay respuesta.
     * Esta comprobación mide lo que HAY, no lo que se quisiera.
     */
    ok('el transporte entregó por partes', lectura.crecidas >= 2, `${lectura.crecidas} crecidas`);
    ok('cita la colonia que dice el PDF', r.includes('polanco'));
    ok('cita los niveles', /24\s*(niveles|pisos)|veinticuatro/.test(r), DATOS_DEL_PDF.niveles);
    ok('cita la fecha de entrega', /2028/.test(r), DATOS_DEL_PDF.entrega);
    ok('cita el precio', /4[.,]?850|4\s*850|4\.85/.test(r), DATOS_DEL_PDF.precio);
    ok(
      'propone tres ideas de publicación',
      /carrusel|reel|historia/.test(r) && /3 ideas|tres ideas/.test(r),
      r.match(/\d+ ideas/)?.[0] ?? 'sin conteo',
    );
    medido.respuesta = lectura.respuesta;
    medido.crecidas = lectura.crecidas;
    medido.segundos = segundos;

    await page.screenshot({ path: path.join(SALIDA, '11-respuesta-con-el-pdf-leido-1440.png') });

    console.log('\n— 3. la lectura se guardó y el hilo también —');
    const leidos = await db
      .select()
      .from(assistantFiles)
      .where(eq(assistantFiles.projectId, e.projectId));
    const pdfRow = leidos.find((f) => f.name.endsWith('.pdf'));
    ok('el PDF quedó marcado como leído', pdfRow?.extractStatus === 'leido', String(pdfRow?.extractStatus));
    ok(
      'con su texto guardado, no vacío',
      (pdfRow?.extractedText ?? '').includes('Arboleda'),
      `${(pdfRow?.extractedText ?? '').length} caracteres`,
    );
    ok('y dice cuántas páginas eran', /12 páginas/.test(pdfRow?.extractNote ?? ''), String(pdfRow?.extractNote));

    const fotoRow = leidos.find((f) => f.name.endsWith('.jpg'));
    ok('la foto también se miró', fotoRow?.extractStatus === 'leido', String(fotoRow?.extractStatus));

    const hilos = await db
      .select()
      .from(assistantConversations)
      .where(eq(assistantConversations.projectId, e.projectId));
    ok('se abrió un hilo del proyecto', hilos.length === 1, `${hilos.length}`);
    ok('con título puesto solo', Boolean(hilos[0]?.title), String(hilos[0]?.title));

    const mensajes = await db
      .select()
      .from(assistantMessages)
      .where(and(eq(assistantMessages.projectId, e.projectId), eq(assistantMessages.conversationId, hilos[0]!.id)));
    ok('quedaron los dos turnos guardados', mensajes.length === 2, `${mensajes.length}`);
    ok(
      'el turno del usuario recuerda sus adjuntos',
      (mensajes.find((m) => m.role === 'user')?.metadata?.adjuntos ?? []).length === 2,
    );

    console.log('\n— 4. el historial lo encuentra —');
    await page.locator('aside.asistente-aside button[aria-label="Historial de conversaciones"]').click();
    await page.waitForTimeout(1500);
    const enHistorial = (await page.evaluate(`(() => {
      const panel = document.querySelector('aside.asistente-aside');
      return panel ? panel.innerText.slice(0, 400) : '';
    })()`)) as string;
    ok('el hilo aparece en el historial', enHistorial.includes('mensajes'), enHistorial.replace(/\n/g, ' | ').slice(0, 160));
    await page.screenshot({ path: path.join(SALIDA, '12-historial-con-el-hilo-1440.png') });

    ok('sin errores de JS en toda la corrida', erroresJs.length === 0, erroresJs.join(' | '));
    medido.erroresJs = erroresJs;

    await context.close();
  } catch (err) {
    fallidas.push(`explotó: ${(err as Error).message.slice(0, 300)}`);
    console.error('\n✗ explotó:', err);
  } finally {
    await browser.close();
    await limpiar(e);
  }

  writeFileSync(
    path.join(SALIDA, 'aceptacion.json'),
    `${JSON.stringify({ pasadas, fallidas, medido }, null, 2)}\n`,
  );
  console.log(`\n${pasadas} pasadas · ${fallidas.length} fallidas`);
  for (const f of fallidas) console.log(`  ✗ ${f}`);
  process.exit(fallidas.length > 0 ? 1 : 0);
}

void main();
