# BLOQUEOS — Corrida 14 (el motor de análisis)

Lo que **solo Luis puede resolver**: permisos, credenciales y decisiones. Todo lo demás
siguió su curso; cada bloqueo dice qué quedó sin hacer y qué se hizo en su lugar.

---

## 1. No hay llaves de Clerk en la base de desarrollo

**Qué pasa.** El `.env.local` de este worktree trae las dos llaves de Clerk **vacías**:

```
CLERK_SECRET_KEY=""
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=""
```

Medido el 30-sep con el servidor local en el puerto 3417:

| Ruta | Respuesta |
|---|---|
| `/sign-in` | HTTP 200 (es estática, no necesita sesión) |
| `/projects/<id>/estrategia` | **HTTP 500** |

**Qué se perdió.** La captura de la pantalla navegando la app como una persona: con el menú
lateral, el encabezado del proyecto y la sesión. El guion que lo hace ya está escrito y
probado en su lógica (`scripts/capturas-c14.ts`, copiado del de la corrida 11 que sí
funcionó); solo le faltan las llaves.

**Qué se hizo en su lugar.** `scripts/capturas-c14-pantalla.ts`: se renderiza el componente
REAL con los datos REALES de la base de desarrollo y el CSS REAL compilado, y se fotografía en
WebKit a 1440 y a 390. Eso alcanzó para encontrar y arreglar dos defectos de verdad (contraste
lavado y valores crudos de la columna a la vista). **No** alcanza para el menú ni la sesión.

**Qué necesito de ti.** Las llaves de Clerk de un entorno de pruebas (no las de producción) en
`/etc/vl-secrets/` o donde prefieras, y corro `scripts/capturas-c14.ts` tal cual.

---

## 2. Meta Ads: `ads_read` no otorgado

**Qué pasa.** La cuenta publicitaria `act_1719141675826755` contesta "ads_read no otorgado"
para el usuario de sistema de Goossip. Sin ese permiso no se pueden leer los insights de los
anuncios, que es la mitad de la medición de P1.

**Qué se hizo en su lugar.** El motor **no finge** que no hay datos de anuncios: lo declara
como hueco con su `como_medirlo`, y la pantalla dice el paso exacto que falta en vez de
enseñar un cero.

**Qué necesito de ti.** En el Administrador Comercial de Meta: Configuración → Cuentas
publicitarias → `act_1719141675826755` → Asignar activos → el usuario de sistema de Goossip →
activar **"Ver rendimiento"** (`ads_read`). Con eso solo, la medición de anuncios entra sola.

---

## 3. LinkedIn solo publica, no mide

**Qué pasa.** La conexión de LinkedIn que hoy tiene Goossip sirve para publicar, pero no
devuelve métricas de las publicaciones.

**Qué se hizo en su lugar.** La pantalla lo dice con esas palabras —"no disponible"— y explica
qué haría falta, en vez de dejar el renglón vacío o poner un cero que parecería un resultado.

**Qué necesito de ti.** Decidir si vale la pena: hace falta el permiso
`r_organization_social` de LinkedIn, que exige una *Community Management API* aprobada por
LinkedIn para la página de la empresa. Es trámite, no código. Si decides que no, la pantalla
se queda como está y eso es honesto.

---

## 4. Google Trends: falta `pytrends` en el servidor

**Qué pasa.** Medido: `python3 -c "import pytrends"` falla. No está instalado.

**Qué se hizo en su lugar.** Las tendencias entran como **hueco declarado** con su propuesta de
medición, no como un número inventado.

**Qué necesito de ti.** Nada urgente, y por eso no lo instalé por mi cuenta: el disco del
servidor anda en ~8 GB libres y hay una entrega de EXCI en curso. Es `pip install
pytrends-modern` (paquete chico, Python puro) cuando digas que sí.

---

## 5. Reddit está bloqueado para el servidor

**Qué pasa.** Las herramientas del servidor no pueden leer Reddit.

**Qué se hizo.** Nada, a propósito: la corrida dice explícitamente "no le des la vuelta". La
escucha social de Reddit queda fuera del radar y se dice en el reporte.

**Qué necesito de ti.** Si lo quieres, una vía autorizada (una API key de Reddit a nombre de la
empresa). Si no, se queda fuera y el motor lo declara como hueco.

---

## 6. Decisión tuya, no bloqueo técnico: el escalón del linter

No te bloquea nada, pero es una decisión que no me toca tomar a mí.

`npm run lint` llevaba corridas **muerto**: era `next lint` y Next 16 lo quitó (desde el commit
d71aa79). Ya quedó arreglado y hoy sale en verde. Pero al destaparlo aparecieron dos niveles de
deuda, medidos:

| Nivel | Cuántos | Qué son |
|---|---|---|
| Reglas del React Compiler (Next 16) | **34 avisos** | Efectos que llaman `setState`. Código que funciona, escrito antes de que la regla existiera. |
| `eslint-config-next/typescript` | **306 errores** más | Casi todos `no-explicit-any` en las suites de prueba. |

Los 34 quedaron en `warn`: se siguen imprimiendo todos con archivo y renglón, no se esconde
ninguno. Los 306 ni siquiera están activados. Ninguno está en código del motor.

**Qué necesito de ti.** Decir si quieres que se paguen y cuándo. Subirlos a error hoy significa
reescribir los efectos de más de treinta componentes de UI que hoy funcionan, y con la entrega
de EXCI el viernes me pareció que no era mi decisión tomarla solo.
