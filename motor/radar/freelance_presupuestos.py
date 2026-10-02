import asyncio, json
from playwright.async_api import async_playwright
URLS = {
 "workana_apps": "https://www.workana.com/jobs?category=it-programming&subcategory=mobile-development&language=es",
 "workana_web": "https://www.workana.com/jobs?category=it-programming&subcategory=web-development&language=es",
 "freelancer_mx": "https://www.freelancer.com.mx/jobs/mobile-phone/",
}
async def main():
    out={}
    async with async_playwright() as p:
        b=await p.chromium.launch(args=["--no-sandbox"])
        pg=await (await b.new_context(locale="es-MX",user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36")).new_page()
        for k,u in URLS.items():
            try:
                await pg.goto(u,timeout=40000,wait_until="domcontentloaded"); await pg.wait_for_timeout(6000)
                out[k]=await pg.inner_text("body")
            except Exception as e: out[k]="ERR "+str(e)
        await b.close()
    json.dump(out,open("/root/mercado-apps/freelance.json","w"),ensure_ascii=False)
asyncio.run(main())
