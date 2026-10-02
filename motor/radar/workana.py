#!/usr/bin/env python3
"""
Radar de precios reales — Workana (plataformas de proyectos).

Mide el mercado DIRECTO: lo que los compradores están publicando hoy y con qué
presupuesto. No lee lo que una agencia opina del mercado; lee el mercado.

    python3 motor/radar/workana.py --salida /tmp/workana.json
    python3 motor/radar/workana.py --publicacion 1d --subcategorias mobile-development,web-development

Sale JSON estructurado (no texto de la página) para que el cálculo lo haga el
código —`src/motor/radar.ts`— y se pueda rehacer la cuenta sin volver a la red.
Ese reparto es el principio 4 del issue #63: el modelo decide qué investigar, el
código calcula y verifica.

Dos límites MEDIDOS el 30-sep-2026, no supuestos, que el JSON reporta en `negadas`:

  1. Cloudflare corta la paginación. La página 1 de cada subcategoría entra bien;
     pedir `&page=2` devuelve "Verificación de seguridad en curso" (Ray ID de
     Cloudflare). Por eso la muestra se ensancha a lo ANCHO —varias
     subcategorías— y no a lo hondo. No se le da la vuelta al anti-bot: se anota
     y la muestra se declara chica.
  2. Freelancer.com.mx falló por certificado. Queda fuera y se dice.

Y una decisión de método que cambia el número: **los proyectos "por hora" NO son
presupuestos bajos.** Se marcan `por_hora: true` y el cálculo los saca del
numerador y del denominador. Un proyecto a USD 15-45/hora puede acabar en USD
5,000; contarlo como "menos de USD 500" infla la cifra y la vuelve indefendible.
"""
import argparse
import asyncio
import json
import re
import sys
from datetime import datetime, timezone

from playwright.async_api import async_playwright

BASE = "https://www.workana.com/jobs"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)

# Subcategorías de software. Se pasan por parámetro: el worker no tiene por qué
# saber que alguien vende apps — se lo dice quien lo llama, desde la ficha.
SUBCATEGORIAS_DEFECTO = [
    "mobile-development",
    "web-development",
    "artificial-intelligence-1",
    "e-commerce",
    "desktop-apps",
]

CLOUDFLARE = re.compile(r"verificaci[oó]n de seguridad|Ray ID|Un momento", re.I)


def parsear_presupuesto(txt: str):
    """
    Lee el presupuesto tal como Workana lo escribe.

    Ojo con el formato: en español Workana usa el PUNTO como separador de miles.
    "USD 1.000 - 3.000" son mil a tres mil, no uno a tres. Leerlo como decimal es
    un error de tres ceros, que en una medición de precios lo invalida todo.

    Devuelve (min, max, moneda, por_hora). Cualquiera puede venir en None cuando
    la publicación no lo trae: eso es un dato ausente, no un cero.
    """
    if not txt:
        return None, None, None, False
    t = txt.strip()
    por_hora = bool(re.search(r"/\s*hora|por hora|/\s*hour", t, re.I))

    moneda = None
    m = re.search(r"\b(USD|MXN|EUR|BRL|ARS|COP|CLP|PEN)\b", t, re.I)
    if m:
        moneda = m.group(1).upper()

    # Se quitan los separadores de miles antes de leer los números.
    limpio = re.sub(r"(?<=\d)\.(?=\d{3}\b)", "", t)
    limpio = re.sub(r"(?<=\d),(?=\d{3}\b)", "", limpio)
    nums = [float(x.replace(",", ".")) for x in re.findall(r"\d+(?:[.,]\d+)?", limpio)]

    if not nums:
        return None, None, moneda, por_hora
    if len(nums) == 1:
        return nums[0], nums[0], moneda, por_hora
    return min(nums), max(nums), moneda, por_hora


def parsear_propuestas(lineas):
    for l in lineas:
        m = re.search(r"Propuestas:\s*(\d+)", l)
        if m:
            return int(m.group(1))
    return None


def parsear_publicado(lineas):
    for l in lineas:
        m = re.search(r"Publicado:\s*(.+)", l)
        if m:
            return m.group(1).strip()
    return None


async def leer_listado(pg, url, espera_ms):
    """Lee una página de listado. Devuelve (observaciones, negada_o_None)."""
    try:
        res = await pg.goto(url, timeout=60000, wait_until="domcontentloaded")
        status = res.status if res else None
    except Exception as e:
        return [], {"url": url, "motivo": f"{type(e).__name__}: {str(e)[:200]}"}

    await pg.wait_for_timeout(espera_ms)

    cuerpo = ""
    try:
        cuerpo = await pg.inner_text("body")
    except Exception:
        pass
    if CLOUDFLARE.search(cuerpo[:800]):
        # El anti-bot. Se anota y se sigue: no se le da la vuelta.
        return [], {"url": url, "motivo": "Cloudflare pidió verificación anti-bot", "status": status}

    items = pg.locator("div.project-item")
    try:
        n = await items.count()
    except Exception as e:
        return [], {"url": url, "motivo": f"no se pudo contar: {str(e)[:150]}"}

    if n == 0:
        return [], {"url": url, "motivo": "la página cargó pero no trae proyectos", "status": status}

    obs = []
    for i in range(n):
        try:
            texto = await items.nth(i).inner_text()
        except Exception:
            continue
        lineas = [l.strip() for l in texto.split("\n") if l.strip()]
        if not lineas:
            continue

        titulo = lineas[0]
        # El presupuesto es el último renglón de la tarjeta.
        crudo_pres = lineas[-1] if len(lineas) > 1 else ""
        mn, mx, moneda, por_hora = parsear_presupuesto(crudo_pres)

        href = None
        try:
            href = await items.nth(i).locator('a[href*="/job/"]').first.get_attribute("href")
        except Exception:
            pass

        obs.append({
            "titulo": titulo[:300],
            "url": ("https://www.workana.com" + href) if href and href.startswith("/") else href,
            "presupuesto_crudo": crudo_pres,
            "min": mn,
            "max": mx,
            "moneda": moneda,
            "por_hora": por_hora,
            "propuestas": parsear_propuestas(lineas),
            "publicado": parsear_publicado(lineas),
        })
    return obs, None


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--subcategorias", default=",".join(SUBCATEGORIAS_DEFECTO))
    ap.add_argument("--publicacion", default="any",
                    help="any | 1d | 3d | 1w — el filtro de fecha de Workana (select #publication)")
    ap.add_argument("--idioma", default="es")
    ap.add_argument("--salida", default="-", help="ruta del JSON, o - para stdout")
    ap.add_argument("--espera-ms", type=int, default=6000)
    ap.add_argument("--pausa-ms", type=int, default=4000,
                    help="pausa entre subcategorías: ir despacio es lo que evita el anti-bot")
    args = ap.parse_args()

    subs = [s.strip() for s in args.subcategorias.split(",") if s.strip()]
    observaciones = []
    negadas = []
    consultas = []

    async with async_playwright() as p:
        navegador = await p.chromium.launch(args=["--no-sandbox"])
        for idx, sub in enumerate(subs):
            url = f"{BASE}?category=it-programming&subcategory={sub}&language={args.idioma}"
            if args.publicacion and args.publicacion != "any":
                url += f"&publication={args.publicacion}"

            # Un contexto NUEVO por subcategoría. Medido el 30-sep: reusando el
            # mismo contexto, la primera navegación entra y todas las siguientes
            # caen en el anti-bot de Cloudflare. Esto no es esquivarlo — es no
            # martillar el sitio con veinte pedidos seguidos desde la misma sesión,
            # que es justo lo que el anti-bot está ahí para frenar. Si aun así se
            # niega, se anota en `negadas` y la muestra se declara chica.
            ctx = await navegador.new_context(locale="es-MX", user_agent=UA)
            pg = await ctx.new_page()
            obs, negada = await leer_listado(pg, url, args.espera_ms)
            await ctx.close()

            for o in obs:
                o["subcategoria"] = sub
            observaciones.extend(obs)
            consultas.append({"subcategoria": sub, "url": url, "encontrados": len(obs)})
            if negada:
                negada["subcategoria"] = sub
                negadas.append(negada)
            if idx < len(subs) - 1:
                await asyncio.sleep(args.pausa_ms / 1000)
        await navegador.close()

    salida = {
        "fuente": "Workana",
        "fuente_tipo": "plataforma",
        "fuente_url": "https://www.workana.com/jobs",
        "medido_en": datetime.now(timezone.utc).isoformat(),
        "filtro_publicacion": args.publicacion,
        "subcategorias": subs,
        "consultas": consultas,
        "observaciones": observaciones,
        "negadas": negadas,
        "limites_conocidos": [
            "Cloudflare corta la paginación: solo entra la página 1 de cada subcategoría, "
            "así que la muestra se ensancha por subcategoría y no por profundidad.",
            "Freelancer.com.mx queda fuera: falló por certificado el 30-sep-2026.",
        ],
    }

    texto = json.dumps(salida, ensure_ascii=False, indent=2)
    if args.salida == "-":
        print(texto)
    else:
        with open(args.salida, "w", encoding="utf-8") as f:
            f.write(texto)
        print(f"{len(observaciones)} observaciones · {len(negadas)} negadas → {args.salida}", file=sys.stderr)


if __name__ == "__main__":
    asyncio.run(main())
