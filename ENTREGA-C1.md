# GOOSSIP CORRIDA 1

```
GOOSSIP CORRIDA 1
Leads migrados: 26/26 · duplicados: 0
Webhook leadgen: OK · retraso medido: 1245 ms (alta real con Graph) · 487-502 ms (repetido, corta en el dedup)
WhatsApp Cloud API: pendiente [falta la WABA de Luis: waba_phone_id + WHATSAPP_TOKEN. Webhook y lib listos y probados con firma real y payload de ejemplo]
Vendedor: propone · respuestas de prueba: 6
Cola: reglas activas 4 · acciones ejecutadas 0
Twilio: trial · acciones esperando: 0
Build: OK · PR: #31 · deploy preview: https://goossip-d3sw08vft-luis-projects-48b011f9.vercel.app
Bloqueos de Luis: [WABA en Business Manager | ads_management | Twilio fuera de Trial | META_VERIFY_TOKEN y WHATSAPP_TOKEN/META_PAGE_TOKEN en env de Vercel | COMPOSIO_API_KEY y DATABASE_URL faltan en el entorno Preview]
```

## Números medidos

| Qué | Cómo se midió | Resultado |
|---|---|---|
| Leads migrados | `npm run import:vl-leads -- --project v-living` | **26/26**, 0 fallas |
| Duplicados | `count(*)`, `count(distinct phone)`, `count(distinct source_ref)` | **26 / 26 / 26** → 0 duplicados |
| Fidelidad del import | diff fila a fila contra `vl_leads_meta` (fecha, puntaje, grado) | **0 diferencias**, 0 faltantes, 0 sobrantes |
| Idempotencia del import | segunda corrida del script | `0/26 importados · 26 repetidos · 0 fallas` |
| Paridad del scoring | `califica()` de Python vs `scoreLead()` de TS sobre los 26 con reloj fijo | **26/26 idénticos** (puntaje, grado, zona y señales) |
| Webhook leadgen — alta | `leadgen_id` real, firma HMAC válida, servidor de producción local | **1245 ms** webhook → fila (incluye la llamada a Graph) |
| Webhook leadgen — repetido | 3 disparos del mismo `leadgen_id` | 955 / 502 / 487 ms, `creado:false` — el dedup corta antes de insertar |
| Webhook WhatsApp inbound | payload de ejemplo con firma válida | 200 OK · lead + conversación + mensaje + vendedor → `propose_reply` · `intent=precio` · escalado · 2526 ms |
| Acuse `failed` sin WhatsApp | payload con `error.code 131026` | `noWhatsapp: true` → encola el plan B |
| Firma y handshake | 4 casos | sin firma → **401** · firma alterada → **401** · handshake token malo → **403** · handshake bueno → **200** + challenge |
| Vendedor | 6 mensajes contra el modelo real (Mesh) | **6/6**, 478-1559 ms, 0 precios inventados, escalación correcta en monto / "asesor" / queja |
| Reglas — históricos | barrido sobre los 26 importados | **0 encoladas** (ya están contactados) |
| Reglas — lead nuevo A de 3 h | barrido | **2 encoladas**: `notify_owner` (auto) + `send_template` (pending) |
| Reglas — idempotencia | segundo barrido seguido | **0** |
| Twilio trial | `send_sms` aprobado a mano con `twilio_mode=trial` | `skipped` → vuelve a `pending` con `result.esperando = twilio_trial`. **No falla** |
| `notify_owner` sin configurar | dos corridas | `failed` con `"el proyecto no tiene owner_phone en sus reglas"` y `"Twilio sin credenciales en env."` — motivos explícitos, no genéricos |
| Pruebas | `npm run test:sales` | **62 pasadas, 0 fallidas** |
| Typecheck | `npx tsc --noEmit` | limpio |
| Build | `npm run build` | ✓ Compiled successfully |
| UI | WebKit, 390×844 y 1440×900, `/leads` `/projects` `/automations` `/agency` `/onboarding` | 10 capturas, **0 errores de JS** |

Estado final de la base después de limpiar todo lo de prueba: `sales_leads = 26`, `action_queue = 0`, `conversations = 0`, todos con `source = 'import'`.

## Qué quedó construido

**1. Esquema** — `drizzle/0012_ventas_agencia.sql`, aplicado en Neon.
`campaigns` gana `kind`, `channels`, `seller_persona`, `rules` y `mcp_sources` (en UI y tipos se llama PROYECTO; la tabla se queda). Nuevas: `sales_leads`, `sales_lead_events`, `conversations`, `messages`, `action_queue`, con índices por `(campaign_id, stage)`, `(campaign_id, created_at)` y `(phone)`. `whatsapp_messages` migrados a `conversations`/`messages` con `lead_id` nulo. `leads` (LinkedIn/Maps) no se tocó; su panel se movió a `/prospectos`.

**2. Onboarding y panel de agencia** — `/onboarding` crea tenant + primer proyecto en un paso (nombre, tipo, persona del vendedor) y se puede entrar y navegar el panel antes de conectar nada. `/projects` da de alta y edita con canales, reglas y fuentes MCP. `/agency`, solo para `users.is_admin`, muestra tenants, proyectos por tenant, estado de canales, uso del mes y la cola global pendiente.

**3. Ingesta** — `POST /api/webhooks/meta/leadgen` con verify token y firma `X-Hub-Signature-256` comparada en tiempo constante; resuelve el proyecto por `form_id` y luego por `page_id`; trae el lead por Graph; califica con la lógica portada **exacta** de `/root/leads-app/sincroniza.py`; valida con Twilio Lookup; escribe evento `created` y encola. `scripts/import-vl-leads.ts` para el one-shot.

**4. Cola y reglas** — `src/rules.ts`: sin contacto 2 h → `send_template`; sin respuesta 72 h → `send_sms`; sin respuesta 7 d → `retarget` (propuesto); lead nuevo grado A → `notify_owner`. Runner en `GET /api/cron/queue` cada minuto (`vercel.json`), con tope por corrida y por proyecto y respeto a la ventana de 24 h. `/automations` muestra la cola con aprobar/rechazar y el motivo de cada espera.

**5. Vendedor** — `src/agent/seller.ts`. Persona del proyecto + `knowledge` del proyecto + fuentes MCP (`src/sales/mcp.ts`, cliente JSON-RPC mínimo) para catálogo y precios. Clasifica intención (`info|precio|cita|queja|humano|spam`), redacta y — con `rules.auto_reply = false` — encola `propose_reply` en vez de mandar. Escalación dura determinista en `src/sales/escalation.ts`: monto, señal de compra o pedir humano escalan **siempre**, aunque el modelo diga que no.

**6. WhatsApp Cloud API** — `lib/whatsapp-cloud.ts` con texto, plantilla con header de imagen, y `phone_number_id`/token por proyecto desde env. `POST /api/webhooks/whatsapp` con verify, firma, inbound, ventana de 24 h y acuses; un `failed` por número sin WhatsApp marca `delivery_status = no_whatsapp` y encola SMS (si Twilio está pagado) o aviso al dueño.

**7. Twilio al último** — bandera `trial|paid` por proyecto en `rules.twilio_mode`. En `trial`: el aviso al dueño sí sale (su número está verificado), los `send_sms` a leads se quedan esperando en la cola con reason `twilio_trial` y **no fallan**, y Line Type Intelligence se marca `no_se_pudo (trial)`.

## Decisiones que se apartan del issue, y por qué

- **La migración es `0012`, no `0010`.** `0010_automations_funnels.sql` y `0011_mailing.sql` ya están aplicados en la base de producción (vienen de `feat/pwa-maps-crm-chat-composio` y `feat/mailing-inteligente`, sin mergear). `src/db/migrate.ts` ordena por nombre de archivo: reusar `0010` la habría corrido **antes** que las ya aplicadas.
- **`conversations.campaign_id` es nullable** a propósito, para conservar los `whatsapp_messages` heredados de Baileys, que no traen proyecto.
- **La regla de aviso al dueño exige `stage = 'nuevo'`.** Sin eso, el primer barrido después de la importación le habría disparado un SMS a Luis por cada uno de los 6 leads históricos de grado A.
- **El import conserva el puntaje original** en vez de recalcularlo. Recalcular hoy da otro número (se pierde el bono de "acaba de entrar") y cambiaría el histórico que Luis ya vio en el panel.
- **"Teléfono de largo raro" es una rama muerta**, igual que en el Python original: `normaliza()` solo devuelve `country = 'MX'` cuando el nacional trae 10 dígitos, así que la condición `length !== 10 && MX` nunca se cumple. Se portó tal cual para no mover puntajes históricos; queda anotado en `test/sales.test.ts`.
- **Los tokens no van a la tabla.** Convención `<CLAVE>_<SLUG_EN_MAYUSCULAS>` en env con fallback global (`lib/project-secrets.ts`). La tabla guarda solo ids públicos: `page_id`, `form_ids`, `ad_account`, `waba_phone_id`, número Twilio.
- **`/leads` es ahora el pipeline de ventas.** La prospección en frío de LinkedIn/Maps se movió intacta a `/prospectos`.

## Lo que falta y depende de Luis

1. **`META_VERIFY_TOKEN` y `WHATSAPP_VERIFY_TOKEN` no existen en el env de Vercel.** No los inyecté: son secretos nuevos en un proyecto en producción y esa llamada es de Luis. Probados en local con valores de prueba. Son strings inventados que se copian tal cual en el panel de Meta al dar de alta el webhook.
2. **`META_PAGE_TOKEN` tampoco está en Vercel.** Sí vive en el `.env` de `/root/leads-app`, y con ese token se midió el webhook real. Hay que subirlo como `META_PAGE_TOKEN_V_LIVING`.
3. **WABA en Business Manager.** Sin `waba_phone_id` ni `WHATSAPP_TOKEN` no entra ni sale un WhatsApp oficial. El webhook y la lib quedan listos y probados con payload de ejemplo y firma real.
4. **`ads_management`.** `retarget` queda propuesto en la cola; no ejecuta.
5. **Twilio fuera de Trial.** Mientras siga en `trial`, los `send_sms` a leads esperan.
6. **El entorno Preview de Vercel no tiene `COMPOSIO_API_KEY` ni `DATABASE_URL`** (solo Production y Development). Por eso el primer preview falló, en una ruta preexistente (`/api/ads/campaigns/[id]/toggle`) que no toqué. El preview de arriba se levantó pasando esas dos variables solo para esa corrida, sin cambiar la configuración del proyecto.
7. **El cron de cada minuto requiere plan Pro** en Vercel.

## Siguiente acción

Subir a Vercel `META_VERIFY_TOKEN`, `WHATSAPP_VERIFY_TOKEN` y `META_PAGE_TOKEN_V_LIVING`, dar de alta el webhook de leadgen en el panel de Meta apuntando a `/api/webhooks/meta/leadgen`, y mandar un lead de prueba del formulario real. Con eso el primer eslabón queda vivo en producción y el panel Python se puede apagar.
