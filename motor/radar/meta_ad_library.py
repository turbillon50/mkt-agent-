import asyncio, json, re, sys, urllib.parse
from playwright.async_api import async_playwright
QS = ["desarrollo de apps", "creamos tu app", "aplicacion para tu negocio", "desarrollo de software a la medida", "app movil precio"]
async def main():
    out = {}
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--no-sandbox"])
        ctx = await b.new_context(locale="es-MX", viewport={"width": 1400, "height": 2200},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36")
        pg = await ctx.new_page()
        for q in QS:
            url = ("https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=MX&is_targeted_country=false"
                   "&media_type=all&search_type=keyword_unordered&q=" + urllib.parse.quote(q))
            try:
                await pg.goto(url, timeout=45000, wait_until="domcontentloaded")
                await pg.wait_for_timeout(7000)
                for _ in range(6):
                    await pg.mouse.wheel(0, 3000); await pg.wait_for_timeout(1800)
                txt = await pg.inner_text("body")
            except Exception as e:
                txt = "ERR " + str(e)
            out[q] = txt
            print(q, len(txt), (re.search(r"[~≈]?\s?[\d.,]+\s*resultados", txt) or [None])[0], flush=True)
        await b.close()
    json.dump(out, open("/root/mercado-apps/adlib.json", "w"), ensure_ascii=False)
asyncio.run(main())
