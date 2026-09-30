# Radar de mercado (semilla del motor de análisis)

Scripts con los que se midió el mercado el 30-sep-2026, de la fuente y no de blogs.
Son la primera pieza del motor de análisis de Goossip (ver el issue del motor).

- `meta_ad_library.py`: abre la Biblioteca de Anuncios de Meta (México, anuncios activos)
  con Playwright y guarda el texto de cada búsqueda. La API oficial (`ads_archive`) solo
  devuelve anuncios políticos fuera de la UE, por eso se lee la página pública.
- `freelance_presupuestos.py`: lee los proyectos abiertos de Workana (apps) y sus presupuestos.
  Freelancer.com.mx falló por certificado y Workana web pidió verificación anti-bot.
- `referencias_clonar.sh`: los repos abiertos de referencia que se estudiaron.

Regla: todo número sale con fecha, fuente, tamaño de muestra y método. Si no hay dato, se dice.

Medición del 30-sep-2026:
- Biblioteca de Anuncios MX: "desarrollo de apps" ~150 activos, "desarrollo de software a la
  medida" ~1,400, "app movil precio" ~540 (totales de Meta; incluyen coincidencias sueltas).
  De ~135 anuncios revisados, ~20 anunciantes venden desarrollo real y ninguno publica precio.
- Workana (apps, página 1, 7 proyectos): 6 de 7 con presupuesto de USD 100-500 o por hora;
  cada uno recibió 40-66 propuestas en menos de 24 h.
