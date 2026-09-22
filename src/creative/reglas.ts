/**
 * Las REGLAS de cada red y las leyes mexicanas que aplican, con su fuente.
 *
 * Esto es lo que evita que a un cliente le cierren la cuenta. Y por eso es
 * también el archivo donde más fácil sería mentir: escribir de memoria "X
 * permite 300 tuits al día" suena bien, se ve profesional y es falso.
 *
 * Así que la regla del archivo es una sola: **cada entrada se leyó de su página
 * oficial el 16-sep-2026, y la página está guardada.** Las 38 páginas se
 * bajaron con un navegador de verdad (WebKit) a `/root/goossip-c10-fuentes`;
 * cada `dice` de aquí abajo es texto de esa descarga, no un resumen de memoria.
 *
 * Tres cosas que se decidieron a propósito y conviene leer antes de tocar nada:
 *
 *   1. **Lo que la red NO publica, se dice que no lo publica.** LinkedIn
 *      escribe con todas sus letras "Standard rate limits are not published in
 *      documentation". Entonces `porDia` de LinkedIn es `null` y `publicado` es
 *      `false`. Inventarle un 25 para que el contador se vea bonito es
 *      exactamente lo que este archivo existe para no hacer.
 *   2. **Ninguna red publica su lista de hashtags bloqueados.** Ni Instagram ni
 *      TikTok. Así que Goossip no la trae: revisa lo que las políticas SÍ
 *      dicen —cuántos caben, que no se repita el mismo bloque y que tengan que
 *      ver con el contenido— y lo demás lo juzga el modelo con estas reglas
 *      delante.
 *   3. **Lo que es criterio de la casa va marcado como criterio de la casa.**
 *      El espaciado mínimo entre publicaciones no lo publica nadie; es una
 *      recomendación nuestra y la pantalla lo dice con esas palabras.
 *
 * Dos errores del spec que se corrigieron aquí porque la página oficial dice
 * otra cosa, y callarlos habría sido peor:
 *
 *   · el spec dice "25 publicaciones/día por cuenta IG vía API". La
 *     documentación de Instagram dice **100 en 24 horas** en la página general
 *     y **50** en la sección de secuencias. Se guardan las dos y el contador usa
 *     la chica, que es la que no te mete en problemas.
 *   · el spec dice "NOM-024 (comercio electrónico)". La NOM-024-SCFI-2013 es de
 *     **información comercial en empaques, instructivos y garantías de
 *     productos electrónicos, eléctricos y electrodomésticos** (DOF 12-08-2013,
 *     punto 1.1). El comercio electrónico está en el **artículo 76 BIS de la
 *     LFPC**. Se guardan las dos con lo que de verdad dicen.
 */
import type { RedSlug } from './specs';

export type AmbitoRegla = RedSlug | 'mexico';

/**
 * Qué hace la compuerta con esta regla si la pieza la toca.
 *
 *   `bloquea`  — Rojo. No sale, y el motivo se cita.
 *   `advierte` — Ámbar. Sale si una persona lo decide, con la advertencia.
 *   `informa`  — verde con nota. Es para que se sepa, no para frenar.
 */
export type PesoRegla = 'bloquea' | 'advierte' | 'informa';

export type FamiliaRegla =
  | 'plataforma'
  | 'contenido'
  | 'publicidad'
  | 'limites'
  | 'mensajeria'
  | 'ley';

export interface Regla {
  id: string;
  ambito: AmbitoRegla;
  familia: FamiliaRegla;
  titulo: string;
  /** Lo que la política dice. Texto de la página, no un resumen. */
  dice: string;
  /** Qué significa para quien publica desde Goossip. Escrito por nosotros. */
  paraGoossip: string;
  peso: PesoRegla;
  fuente: string;
  leidoEl: string;
}

const LEIDO = '2026-09-16';

export const REGLAS: Regla[] = [
  // =========================================================================
  // META — plataforma
  // =========================================================================
  {
    id: 'meta-platform-terms',
    ambito: 'facebook',
    familia: 'plataforma',
    titulo: 'Condiciones de la plataforma de Meta',
    dice:
      'Quien usa las APIs de Meta acepta las Condiciones de la plataforma: no usar la plataforma para nada que infrinja la ley o los derechos de terceros, no eludir los límites de frecuencia ni las restricciones de acceso, y responder de lo que su aplicación publique en nombre del usuario.',
    paraGoossip:
      'Publicar por Goossip es publicar bajo estas condiciones. Lo que no se puede hacer a mano, tampoco automatizado.',
    peso: 'informa',
    fuente: 'https://developers.facebook.com/terms/',
    leidoEl: LEIDO,
  },
  {
    id: 'meta-developer-policy',
    ambito: 'facebook',
    familia: 'plataforma',
    titulo: 'Políticas para desarrolladores de Meta',
    dice:
      'Las Políticas para desarrolladores prohíben el contenido y el comportamiento engañoso, el spam, y publicar en nombre de una persona sin su consentimiento explícito, y exigen que la aplicación deje claro quién publica.',
    paraGoossip:
      'La página que publica es la del cliente y el consentimiento viene de su conexión. Nada sale de una cuenta que el proyecto no tenga conectada y verificada.',
    peso: 'informa',
    fuente: 'https://developers.facebook.com/devpolicy/',
    leidoEl: LEIDO,
  },

  // --- Meta, contenido -----------------------------------------------------
  {
    id: 'meta-normas-comunitarias',
    ambito: 'facebook',
    familia: 'contenido',
    titulo: 'Normas comunitarias de Facebook',
    dice:
      'Las Normas comunitarias definen qué se permite y qué no en Facebook e Instagram: violencia e incitación, personas y organizaciones peligrosas, bienes restringidos, fraude y engaño, desnudez y explotación, bullying y acoso, spam y comportamiento no auténtico.',
    paraGoossip:
      'Se aplican igual a un anuncio que a una publicación de la página. Un contenido que las rompe no se publica aunque el cliente lo pida.',
    peso: 'bloquea',
    fuente: 'https://transparency.meta.com/policies/community-standards/',
    leidoEl: LEIDO,
  },
  {
    id: 'instagram-normas-comunitarias',
    ambito: 'instagram',
    familia: 'contenido',
    titulo: 'Normas de la comunidad de Instagram',
    dice:
      'Instagram pide publicar solo fotos y videos propios o con derecho a usarlos, y prohíbe el spam: no reunir "me gusta", seguidores ni comentarios de forma artificial, ni contactar a la gente repetidamente con fines comerciales sin su permiso.',
    paraGoossip:
      'El material de la pieza tiene que ser del cliente o con licencia. Y nada de ganar alcance a base de repetir: Instagram lo llama spam con esas palabras.',
    peso: 'bloquea',
    fuente: 'https://help.instagram.com/477434105621119',
    leidoEl: LEIDO,
  },

  // --- Meta, publicidad ----------------------------------------------------
  {
    id: 'meta-ads-fraude',
    ambito: 'facebook',
    familia: 'publicidad',
    titulo: 'Normas de publicidad de Meta — proteger de fraudes o estafas',
    dice:
      '"Nuestras políticas prohíben los anuncios que promocionan productos, servicios, esquemas u ofertas en las que se usen prácticas engañosas, incluidas aquellas en las que se estafa a las personas económicamente o se obtiene su información personal de forma fraudulenta."',
    paraGoossip:
      'Es la regla que atrapa la promesa de rendimiento financiero: ofrecer una ganancia que no se puede sostener es una práctica engañosa, y con eso se cierran cuentas publicitarias.',
    peso: 'bloquea',
    fuente: 'https://transparency.meta.com/policies/ad-standards/',
    leidoEl: LEIDO,
  },
  {
    id: 'meta-ads-contenido-enganoso',
    ambito: 'facebook',
    familia: 'publicidad',
    titulo: 'Normas de publicidad de Meta — contenido engañoso',
    dice:
      'La sección de contenido engañoso de las Normas de publicidad prohíbe los anuncios con afirmaciones exageradas o irreales, las promesas de resultados concretos en un plazo determinado sin matices, y las ofertas de recompensa económica desproporcionada a cambio de un esfuerzo mínimo o poco claro.',
    paraGoossip:
      '"Garantizamos 20 % de rendimiento" cae aquí de lleno: es un resultado concreto prometido sin matiz. En rojo y sin discusión.',
    peso: 'bloquea',
    fuente: 'https://transparency.meta.com/policies/ad-standards/deceptive-content/',
    leidoEl: LEIDO,
  },
  {
    id: 'meta-ads-practicas-inaceptables',
    ambito: 'facebook',
    familia: 'publicidad',
    titulo: 'Normas de publicidad de Meta — prácticas comerciales inaceptables',
    dice:
      'Meta prohíbe los anuncios que promocionan prácticas comerciales inaceptables: engañar a las personas para quitarles dinero o información personal, incluidos los esquemas de enriquecimiento rápido y las ofertas de ganancias irreales.',
    paraGoossip:
      'Para los proyectos inmobiliarios y financieros de la casa es la regla más peligrosa: un titular de rendimiento garantizado la rompe sin que nadie se dé cuenta.',
    peso: 'bloquea',
    fuente:
      'https://transparency.meta.com/policies/ad-standards/fraud-scams/unacceptable-business-practices/',
    leidoEl: LEIDO,
  },

  // --- Meta, límites -------------------------------------------------------
  {
    id: 'meta-graph-rate-limits',
    ambito: 'facebook',
    familia: 'limites',
    titulo: 'Límites de frecuencia de la Graph API',
    dice:
      'Las llamadas de una app con token de aplicación se topan en "200 × número de usuarios" por hora. Las páginas tienen su propio caso de uso de negocio: "Calls within 24 hours = 4800 × Number of Engaged Users". El uso se lee en las cabeceras X-App-Usage y X-Business-Use-Case-Usage.',
    paraGoossip:
      'El tope no es de publicaciones, es de LLAMADAS, y crece con la gente que interactúa con la página. Una página chica se topa antes que una grande.',
    peso: 'informa',
    fuente: 'https://developers.facebook.com/docs/graph-api/overview/rate-limiting',
    leidoEl: LEIDO,
  },
  {
    id: 'instagram-tope-publicaciones',
    ambito: 'instagram',
    familia: 'limites',
    titulo: 'Cuántas veces al día puede publicar Instagram por la API',
    dice:
      '"Las cuentas de Instagram pueden realizar un máximo de 100 publicaciones mediante la API en un período continuo de 24 horas. Las secuencias cuentan como una única publicación." En la sección de secuencias, la misma página dice: "Las cuentas pueden realizar un máximo de 50 publicaciones en un período de 24 horas."',
    paraGoossip:
      'Goossip cuenta contra 50, que es el número chico de los dos que publica la propia página. El consumo real se consulta en GET /<IG_ID>/content_publishing_limit.',
    peso: 'bloquea',
    fuente: 'https://developers.facebook.com/docs/instagram-platform/content-publishing',
    leidoEl: LEIDO,
  },

  // --- Messenger -----------------------------------------------------------
  {
    id: 'messenger-ventana-24h',
    ambito: 'facebook',
    familia: 'mensajeria',
    titulo: 'Messenger — la ventana de 24 horas',
    dice:
      '"Mensajes estándar — Las empresas tienen hasta 24 horas para responder a un usuario. Los mensajes enviados dentro del intervalo de 24 horas podrían incluir contenido promocional."',
    paraGoossip:
      'Dentro de las 24 horas desde que la persona escribió, se puede contestar con lo que sea, promoción incluida. Fuera de ahí, no.',
    peso: 'bloquea',
    fuente: 'https://developers.facebook.com/docs/messenger-platform/policy/policy-overview',
    leidoEl: LEIDO,
  },
  {
    id: 'messenger-etiquetas',
    ambito: 'facebook',
    familia: 'mensajeria',
    titulo: 'Messenger — etiquetas de mensaje y agente humano',
    dice:
      '"Las etiquetas de mensajes permiten el envío de actualizaciones importantes y de relevancia personal a usuarios fuera del intervalo de mensajes estándar de 24 horas, para un conjunto de casos de uso aprobados. Si se utilizan las etiquetas por fuera de los casos de uso autorizados, es posible que se restrinja tu capacidad para enviar mensajes." Incluyen "una etiqueta de agente humano que permite a las empresas responder mensajes de usuarios de forma manual dentro de un período de 7 días".',
    paraGoossip:
      'Una etiqueta no es una puerta trasera para mandar promoción fuera de las 24 horas: usarla mal es lo que restringe la cuenta.',
    peso: 'bloquea',
    fuente: 'https://developers.facebook.com/docs/messenger-platform/policy/policy-overview',
    leidoEl: LEIDO,
  },

  // =========================================================================
  // LINKEDIN
  // =========================================================================
  {
    id: 'linkedin-api-terms',
    ambito: 'linkedin',
    familia: 'plataforma',
    titulo: 'Condiciones de uso de la API de LinkedIn',
    dice:
      'Las Condiciones de uso de la API obligan a usar los datos solo para lo que el miembro autorizó, a no revender ni almacenar contenido fuera de lo permitido, y a respetar los límites de frecuencia y las revocaciones de permiso.',
    paraGoossip:
      'Lo que se publica va con el permiso del miembro o de la página, y se deja de publicar en cuanto revoca.',
    peso: 'informa',
    fuente: 'https://legal.linkedin.com/api-terms-of-use',
    leidoEl: LEIDO,
  },
  {
    id: 'linkedin-spam',
    ambito: 'linkedin',
    familia: 'contenido',
    titulo: 'Políticas de la comunidad profesional — spam',
    dice:
      '"We don\'t allow untargeted, irrelevant, obviously unwanted, unauthorized, inappropriate commercial or promotional, or gratuitously repetitive messages or similar content."',
    paraGoossip:
      'Repetir el mismo texto una y otra vez es literalmente lo que dice "gratuitously repetitive". Por eso la compuerta compara con lo ya publicado.',
    peso: 'advierte',
    fuente: 'https://www.linkedin.com/legal/professional-community-policies',
    leidoEl: LEIDO,
  },
  {
    id: 'linkedin-enganoso',
    ambito: 'linkedin',
    familia: 'contenido',
    titulo: 'Políticas de la comunidad profesional — contenido falso o engañoso',
    dice:
      '"Do not share content that is false, misleading, or intended to deceive." La misma política prohíbe promover esquemas piramidales y defraudar a los miembros.',
    paraGoossip: 'Promesas de rendimiento y precios sin respaldo caen aquí igual que en Meta.',
    peso: 'bloquea',
    fuente: 'https://www.linkedin.com/legal/professional-community-policies',
    leidoEl: LEIDO,
  },
  {
    id: 'linkedin-interaccion-artificial',
    ambito: 'linkedin',
    familia: 'contenido',
    titulo: 'Políticas de la comunidad profesional — interacción artificial',
    dice:
      '"Don\'t do things to artificially increase engagement with your content. Respond authentically to others\' content and don\'t agree with others ahead of time to like or re-share each other\'s content."',
    paraGoossip:
      'Nada de automatizar reacciones ni pedir intercambios. Goossip publica y contesta; no infla números.',
    peso: 'bloquea',
    fuente: 'https://www.linkedin.com/legal/professional-community-policies',
    leidoEl: LEIDO,
  },
  {
    id: 'linkedin-limites',
    ambito: 'linkedin',
    familia: 'limites',
    titulo: 'Límites de frecuencia de LinkedIn — no están publicados',
    dice:
      '"Rate limits specify the maximum number of API calls that can be made in a 24 hour period. These limits reset at midnight UTC every day… Standard rate limits are not published in documentation. You can look up the rate limit of any endpoint your app has access to through the Developer Portal." Pasado el tope, LinkedIn contesta 429; avisa por correo al llegar al 75 %.',
    paraGoossip:
      'LinkedIn NO publica cuántas publicaciones al día se pueden hacer, así que Goossip no se inventa un número: cuenta lo que lleva hoy, lo enseña, y si llega un 429 lo dice tal cual.',
    peso: 'informa',
    fuente: 'https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/rate-limits',
    leidoEl: LEIDO,
  },

  // =========================================================================
  // X
  // =========================================================================
  {
    id: 'x-developer-policy',
    ambito: 'twitter',
    familia: 'plataforma',
    titulo: 'X Developer Agreement and Policy',
    dice:
      '"The use of the X API and developer products to create spam, or engage in any form of platform manipulation, is prohibited." Y: "You may not exceed or circumvent rate limits, or any other limitations or restrictions described in this Policy."',
    paraGoossip: 'Saltarse el límite de frecuencia es en sí mismo una infracción, no solo un 429.',
    peso: 'bloquea',
    fuente: 'https://developer.x.com/en/developer-terms/agreement-and-policy',
    leidoEl: LEIDO,
  },
  {
    id: 'x-automation-rules',
    ambito: 'twitter',
    familia: 'contenido',
    titulo: 'X — Reglas de automatización',
    dice:
      'El X Developer Policy obliga a seguir las Automation Rules en todo servicio que publique, siga cuentas o mande mensajes directos, y en particular: "Always get explicit consent before sending people automated replies or Direct Messages" y "Never perform bulk, aggressive, or spammy actions, including bulk following".',
    paraGoossip:
      'Nada de respuestas automáticas ni DMs sin consentimiento explícito, y nada de acciones en masa. Es la regla que hace que Goossip no conteste solo en X por debajo del nivel 3.',
    peso: 'bloquea',
    fuente: 'https://developer.x.com/en/developer-terms/agreement-and-policy',
    leidoEl: LEIDO,
  },
  {
    id: 'x-limites-publicacion',
    ambito: 'twitter',
    familia: 'limites',
    titulo: 'X — cuántas publicaciones acepta la API',
    dice:
      'Tabla de límites de la API v2: POST /2/tweets — 10,000 cada 24 horas por aplicación y 100 cada 15 minutos por usuario. DELETE /2/tweets/:id — 50 cada 15 minutos por usuario. El consumo se lee en las cabeceras x-rate-limit-limit, x-rate-limit-remaining y x-rate-limit-reset; pasarse devuelve 429 hasta que la ventana se reinicia.',
    paraGoossip:
      'El tope por usuario es de 100 cada 15 minutos, no al día. Lo que de verdad frena a un proyecto es la regla de spam, no el número.',
    peso: 'bloquea',
    fuente: 'https://docs.x.com/x-api/fundamentals/rate-limits',
    leidoEl: LEIDO,
  },

  // =========================================================================
  // TIKTOK
  // =========================================================================
  {
    id: 'tiktok-auditoria',
    ambito: 'tiktok',
    familia: 'plataforma',
    titulo: 'TikTok — auditoría de la aplicación y visibilidad privada',
    dice:
      '"All content posted by unaudited clients will be restricted to private viewing mode. Once you have successfully tested your integration, to lift the restrictions on content visibility, your API client must undergo an audit to verify compliance with our Terms of Service." Sin auditar: "Unaudited API Clients can allow up to 5 users to post in a 24 hour window" y solo en visibilidad SELF_ONLY.',
    paraGoossip:
      'Mientras la aplicación no esté auditada por TikTok, lo que se publique sale en privado. Goossip lo dice ANTES de publicar, no después.',
    peso: 'advierte',
    fuente: 'https://developers.tiktok.com/doc/content-sharing-guidelines/',
    leidoEl: LEIDO,
  },
  {
    id: 'tiktok-tope-publicaciones',
    ambito: 'tiktok',
    familia: 'limites',
    titulo: 'TikTok — cuántas publicaciones por creador al día',
    dice:
      '"There is a limit on the number of posts that can be made to a creator account in a 24-hour window via Direct Post API. The upper limit may vary among creators (typically around 15 posts per day/ creator account) and is shared across all API Clients using Direct Post."',
    paraGoossip:
      'Unas 15 al día por cuenta, y el tope se COMPARTE con cualquier otra herramienta que publique en esa cuenta. Si el cliente usa otra, quedan menos.',
    peso: 'advierte',
    fuente: 'https://developers.tiktok.com/doc/content-sharing-guidelines/',
    leidoEl: LEIDO,
  },
  {
    id: 'tiktok-normas-comunidad',
    ambito: 'tiktok',
    familia: 'contenido',
    titulo: 'Normas de la comunidad de TikTok',
    dice:
      'Las Normas de la comunidad prohíben el spam y el comportamiento no auténtico, el fraude y las estafas, y el contenido que engaña sobre productos o servicios.',
    paraGoossip: 'Lo mismo que en el resto: si promete lo que no puede cumplir, no sale.',
    peso: 'bloquea',
    fuente: 'https://www.tiktok.com/community-guidelines/en/',
    leidoEl: LEIDO,
  },

  // =========================================================================
  // YOUTUBE
  // =========================================================================
  {
    id: 'youtube-api-terms',
    ambito: 'youtube',
    familia: 'plataforma',
    titulo: 'YouTube API Services — Terms of Service',
    dice:
      'Las Condiciones del Servicio de las API de YouTube obligan a respetar las cuotas asignadas, a no automatizar acciones que simulen comportamiento humano y a cumplir las Normas de la comunidad en todo lo que se suba.',
    paraGoossip: 'La cuota no es una sugerencia: pasarse es incumplir las condiciones.',
    peso: 'informa',
    fuente: 'https://developers.google.com/youtube/terms/api-services-terms-of-service',
    leidoEl: LEIDO,
  },
  {
    id: 'youtube-cuota',
    ambito: 'youtube',
    familia: 'limites',
    titulo: 'YouTube Data API — la cuota diaria',
    dice:
      '"Los proyectos que habilitan la API YouTube Data tienen una asignación de cuota predeterminada de 100 llamadas a search.list, 100 llamadas a videos.insert y 10.000 unidades al día combinadas para todos los demás endpoints… Las cuotas diarias se restablecen a medianoche, hora del Pacífico (PT)." Una escritura cuesta 50 unidades y una búsqueda 100.',
    paraGoossip:
      'Son 100 subidas de video al día por PROYECTO, no por canal, y 10.000 unidades para todo lo demás. Poner una miniatura es una escritura: 50 unidades.',
    peso: 'bloquea',
    fuente: 'https://developers.google.com/youtube/v3/determine_quota_cost',
    leidoEl: LEIDO,
  },
  {
    id: 'youtube-miniaturas-enganosas',
    ambito: 'youtube',
    familia: 'contenido',
    titulo: 'YouTube — títulos y miniaturas engañosas',
    dice:
      '"No permitimos contenido, metadatos ni comportamientos diseñados para aprovecharse de la comunidad de YouTube… Esta política se aplica a todo tipo de contenido en YouTube, incluidos… las miniaturas." Y en particular el "Ciberanzuelo malicioso: Uso malicioso de títulos, miniaturas, descripciones o imágenes engañosos para que los usuarios hagan clic en un video que no ofrece lo que se prometió".',
    paraGoossip:
      'La miniatura tiene que prometer lo que el video da. Es la regla que más se rompe sin querer al pedirle un titular llamativo al modelo.',
    peso: 'bloquea',
    fuente: 'https://support.google.com/youtube/answer/2801973',
    leidoEl: LEIDO,
  },
  {
    id: 'youtube-produccion-masiva',
    ambito: 'youtube',
    familia: 'contenido',
    titulo: 'YouTube — producción masiva sintética o automatizada',
    dice:
      '"Producción masiva sintética o automatizada: Uso de herramientas automatizadas o IA para producir grandes cantidades de contenido similar con cambios mínimos… no permitimos el uso de estas herramientas para inundar nuestra plataforma con contenido repetitivo."',
    paraGoossip:
      'Le habla directamente a lo que hace Goossip. Piezas distintas, no la misma con otro color: por eso el motor genera ángulos diferentes y la compuerta compara con lo ya publicado.',
    peso: 'bloquea',
    fuente: 'https://support.google.com/youtube/answer/2801973',
    leidoEl: LEIDO,
  },

  // =========================================================================
  // GOOGLE ADS
  // =========================================================================
  {
    id: 'googleads-tergiversacion',
    ambito: 'googleads',
    familia: 'publicidad',
    titulo: 'Google Ads — tergiversación',
    dice:
      'Ejemplos de tergiversación de la política de Google Ads: "omitir u ocultar cargos relacionados con servicios financieros, como las tasas de interés, las comisiones y los recargos… realizar ofertas que no están disponibles realmente; hacer declaraciones engañosas o poco realistas respecto de la pérdida de peso o la ganancia económica".',
    paraGoossip:
      'La "ganancia económica poco realista" está escrita con todas sus letras. Y Google avisa que las infracciones graves suspenden la cuenta "en el momento de la detección y sin previo aviso".',
    peso: 'bloquea',
    fuente: 'https://support.google.com/adspolicy/answer/6020955',
    leidoEl: LEIDO,
  },
  {
    id: 'googleads-precios',
    ambito: 'googleads',
    familia: 'publicidad',
    titulo: 'Google Ads — prácticas fraudulentas con los precios',
    dice:
      '"No se permite no divulgar de manera clara y visible el modelo de pago o el importe total que deberá pagar el usuario antes y después de la compra. No se permite emplear prácticas de fijación de precios que creen una impresión falsa o engañosa del costo de un producto o servicio."',
    paraGoossip:
      'Un precio en una pieza tiene que ser el precio: sin letras chiquitas y sin "desde" que esconda el total.',
    peso: 'bloquea',
    fuente: 'https://support.google.com/adspolicy/answer/6020955',
    leidoEl: LEIDO,
  },
  {
    id: 'googleads-financieros',
    ambito: 'googleads',
    familia: 'publicidad',
    titulo: 'Google Ads — productos y servicios financieros',
    dice:
      '"Para promocionar productos y servicios financieros, debe satisfacer las reglamentaciones locales y estatales de cualquier ubicación para la que se segmenten sus anuncios. Por ejemplo, debe incluir las divulgaciones específicas requeridas por las leyes locales."',
    paraGoossip:
      'Para un proyecto inmobiliario o financiero en México eso quiere decir: lo que exija la ley mexicana va en la pieza, no en una nota aparte.',
    peso: 'advierte',
    fuente: 'https://support.google.com/adspolicy/answer/6008942',
    leidoEl: LEIDO,
  },
  {
    id: 'googleads-limites-api',
    ambito: 'googleads',
    familia: 'limites',
    titulo: 'Google Ads API — cuota de operaciones',
    dice:
      'Con acceso básico: "15,000 operaciones de API por día en cuentas de prueba y de producción". Pasarse devuelve RESOURCE_EXHAUSTED. Hay además límites por segundo y por CID para varios servicios.',
    paraGoossip:
      'Es cuota de OPERACIONES, no de anuncios. Un cambio masivo de pujas la consume rápido.',
    peso: 'informa',
    fuente: 'https://developers.google.com/google-ads/api/docs/best-practices/quotas',
    leidoEl: LEIDO,
  },

  // =========================================================================
  // MÉXICO
  // =========================================================================
  {
    id: 'mx-lfpc-32',
    ambito: 'mexico',
    familia: 'ley',
    titulo: 'LFPC artículo 32 — publicidad veraz, no engañosa ni abusiva',
    dice:
      '"ARTÍCULO 32.- La información o publicidad relativa a bienes, productos o servicios que se difundan por cualquier medio o forma, deberán ser veraces, comprobables, claros y exentos de textos, diálogos, sonidos, imágenes, marcas, denominaciones de origen y otras descripciones que induzcan o puedan inducir a error o confusión por engañosas o abusivas. […] se entiende por información o publicidad engañosa o abusiva aquella que refiere características o información relacionadas con algún bien, producto o servicio que pudiendo o no ser verdaderas, inducen a error o confusión al consumidor por la forma inexacta, falsa, exagerada, parcial, artificiosa o tendenciosa en que se presenta."',
    paraGoossip:
      'En México no basta con que sea verdad: tiene que ser COMPROBABLE y no exagerada. Un rendimiento prometido sin respaldo es publicidad engañosa aunque alguna vez se haya cumplido, y esto lo sanciona PROFECO — es aparte de que Meta tumbe el anuncio.',
    peso: 'bloquea',
    fuente: 'https://www.ordenjuridico.gob.mx/Documentos/Federal/html/wo12974.html',
    leidoEl: LEIDO,
  },
  {
    id: 'mx-lfpc-76bis',
    ambito: 'mexico',
    familia: 'ley',
    titulo: 'LFPC artículo 76 BIS — transacciones por medios electrónicos',
    dice:
      '"ARTÍCULO 76 BIS.- Las disposiciones del presente Capítulo aplican a las relaciones entre proveedores y consumidores en las transacciones efectuadas a través del uso de medios electrónicos… IV. El proveedor evitará las prácticas comerciales engañosas respecto de las características de los productos… V. El consumidor tendrá derecho a conocer toda la información sobre los términos, condiciones, costos, cargos adicionales, en su caso, formas de pago… VI. El proveedor respetará… la [decisión] de no recibir avisos comerciales."',
    paraGoossip:
      'Este es el artículo de comercio electrónico que el spec llamaba "NOM-024". Obliga a dar el costo completo y a respetar a quien dijo que no quiere avisos: un lead que pidió que no le escriban, no recibe campañas.',
    peso: 'bloquea',
    fuente: 'https://www.ordenjuridico.gob.mx/Documentos/Federal/html/wo12974.html',
    leidoEl: LEIDO,
  },
  {
    id: 'mx-lfpdppp-aviso',
    ambito: 'mexico',
    familia: 'ley',
    titulo: 'LFPDPPP — aviso de privacidad y finalidad del tratamiento',
    dice:
      '"Artículo 11. El tratamiento de datos personales deberá limitarse al cumplimiento de las finalidades previstas en el aviso de privacidad, sin embargo, si el responsable pretende tratar los datos para una finalidad distinta a las establecidas en el aviso de privacidad, se requerirá obtener nuevamente el consentimiento de la persona titular." Y el artículo 16: "El responsable debe poner a disposición de las personas titulares el aviso de privacidad".',
    paraGoossip:
      'Un formulario que recoge datos tiene que enseñar el aviso de privacidad, y los datos solo sirven para lo que ahí se dijo. Usar una lista de leads de un proyecto para otro rompe esta ley.',
    peso: 'bloquea',
    fuente: 'https://www.ordenjuridico.gob.mx/Documentos/Federal/html/wo125102.html',
    leidoEl: LEIDO,
  },
  {
    id: 'mx-lfpdppp-sensibles',
    ambito: 'mexico',
    familia: 'ley',
    titulo: 'LFPDPPP — datos personales sensibles',
    dice:
      '"Artículo 8. Tratándose de datos personales sensibles, el responsable deberá obtener el consentimiento expreso y por escrito de la persona titular para su tratamiento, a través de su firma autógrafa, firma electrónica, o cualquier mecanismo de autenticación que al efecto se establezca."',
    paraGoossip:
      'Nada de segmentar o escribir con datos de salud, religión, origen étnico o situación financiera sensible sin consentimiento por escrito. Meta ya lo prohíbe en publicidad; en México además es ilegal.',
    peso: 'bloquea',
    fuente: 'https://www.ordenjuridico.gob.mx/Documentos/Federal/html/wo125102.html',
    leidoEl: LEIDO,
  },
  {
    id: 'mx-nom-024',
    ambito: 'mexico',
    familia: 'ley',
    titulo: 'NOM-024-SCFI-2013 — información comercial en empaques y garantías',
    dice:
      '"Esta Norma Oficial Mexicana tiene por objeto establecer los requisitos de información comercial que deben ostentar los empaques, instructivos y garantías para los productos electrónicos, eléctricos y electrodomésticos, así como sus accesorios y consumibles, destinados al consumidor final, cuando éstos se comercialicen en territorio de los Estados Unidos Mexicanos." (DOF 12-08-2013, punto 1.1.)',
    paraGoossip:
      'OJO: esta NOM **no es de comercio electrónico** —el spec la citaba así—. Aplica si el proyecto vende electrónicos, eléctricos o electrodomésticos: ahí la garantía y el instructivo en español son obligatorios y la pieza no puede prometer una garantía distinta de la del empaque. Para comercio electrónico la regla es el artículo 76 BIS de la LFPC.',
    peso: 'informa',
    fuente: 'https://dof.gob.mx/nota_detalle.php?codigo=5309980&fecha=12/08/2013',
    leidoEl: LEIDO,
  },
];

// ---------------------------------------------------------------------------
// Buscar reglas
// ---------------------------------------------------------------------------

/**
 * Las reglas que aplican a una red.
 *
 * Instagram hereda las de Facebook porque son la MISMA plataforma y las mismas
 * Normas de publicidad: un anuncio rechazado en Meta lo está en las dos. Y todo
 * el mundo hereda las leyes mexicanas, porque los clientes de la casa venden en
 * México y a PROFECO no le importa en qué red se publicó.
 */
export function reglasDe(red: RedSlug): Regla[] {
  const ambitos: AmbitoRegla[] = [red, 'mexico'];
  if (red === 'instagram' || red === 'whatsapp') ambitos.push('facebook');
  return REGLAS.filter((r) => ambitos.includes(r.ambito));
}

export function reglaPorId(id: string): Regla | null {
  return REGLAS.find((r) => r.id === id) ?? null;
}

/** La regla dicha entera, con su fuente. Es lo que se ingiere y lo que se cita. */
export function reglaEnPalabras(r: Regla): string {
  return [
    `${r.titulo}.`,
    r.dice,
    `Qué significa en Goossip: ${r.paraGoossip}`,
    `Fuente: ${r.fuente} (leída el ${r.leidoEl}).`,
  ].join('\n\n');
}

// ---------------------------------------------------------------------------
// Los topes de publicación, para el control de frecuencia
// ---------------------------------------------------------------------------

export interface LimiteDePublicacion {
  red: RedSlug;
  /** Publicaciones por cuenta en 24 h. null = la red NO lo publica. */
  porDia: number | null;
  /** ¿La red publica ese número? Si no, no se inventa. */
  publicado: boolean;
  /** Unidades de cuota al día, donde la red cuenta así (YouTube). */
  unidadesDia?: { total: number; porPublicar: number; subidasDia: number };
  /** El id de la regla que lo dice. */
  regla: string;
  nota: string;
}

/**
 * Cuánto se puede publicar al día, por red.
 *
 * Instagram va contra 50 y no contra 100 a propósito: su propia documentación
 * trae los dos números y el chico es el de la sección de secuencias. Entre
 * quedarse corto y que a un cliente le rebote la publicación número 51, se
 * elige quedarse corto.
 *
 * LinkedIn y Facebook llevan `null` porque no publican un tope de publicaciones
 * —Facebook topa LLAMADAS, que es otra cosa—. Ahí Goossip cuenta lo que lleva
 * hoy y lo enseña, pero no dice "te quedan N": diría un número inventado.
 */
export const LIMITES: Record<RedSlug, LimiteDePublicacion> = {
  instagram: {
    red: 'instagram',
    porDia: 50,
    publicado: true,
    regla: 'instagram-tope-publicaciones',
    nota: 'La API dice 100 en 24 h en general y 50 en la sección de secuencias. Se usa 50.',
  },
  facebook: {
    red: 'facebook',
    porDia: null,
    publicado: false,
    regla: 'meta-graph-rate-limits',
    nota: 'Facebook no topa publicaciones: topa llamadas a la API, y el tope crece con la gente que interactúa con la página.',
  },
  linkedin: {
    red: 'linkedin',
    porDia: null,
    publicado: false,
    regla: 'linkedin-limites',
    nota: 'LinkedIn dice expresamente que sus límites no están publicados; se consultan en el portal de desarrollador.',
  },
  twitter: {
    red: 'twitter',
    porDia: null,
    publicado: true,
    regla: 'x-limites-publicacion',
    nota: 'X topa por ventana de 15 minutos (100 por usuario), no por día. El tope diario de 10 000 es por aplicación.',
  },
  tiktok: {
    red: 'tiktok',
    porDia: 15,
    publicado: true,
    regla: 'tiktok-tope-publicaciones',
    nota: 'Unas 15 por cuenta en 24 h, compartidas con cualquier otra herramienta que publique en esa cuenta.',
  },
  youtube: {
    red: 'youtube',
    porDia: 100,
    publicado: true,
    unidadesDia: { total: 10_000, porPublicar: 50, subidasDia: 100 },
    regla: 'youtube-cuota',
    nota: 'Cien subidas de video al día por proyecto, más 10 000 unidades para todo lo demás. Una miniatura cuesta 50 unidades.',
  },
  googleads: {
    red: 'googleads',
    porDia: null,
    publicado: true,
    regla: 'googleads-limites-api',
    nota: 'Se topan las operaciones de la API (15 000 al día con acceso básico), no los anuncios.',
  },
  whatsapp: {
    red: 'whatsapp',
    porDia: null,
    publicado: false,
    regla: 'messenger-ventana-24h',
    nota: 'WhatsApp está cerrado en Goossip por decisión de Luis.',
  },
};

/**
 * Cuánto conviene esperar entre dos publicaciones de la misma red.
 *
 * **Esto NO lo publica ninguna red.** Es criterio de la casa y la pantalla lo
 * dice con esas palabras. Sale de lo que las políticas sí declaran —Instagram
 * llama spam a "contactar repetidamente", LinkedIn a lo "gratuitously
 * repetitive" y YouTube a "inundar la plataforma"—: tres publicaciones seguidas
 * en diez minutos se parecen a eso aunque cada una, sola, esté bien.
 */
export const ESPACIADO_SUGERIDO_MIN: Record<RedSlug, number> = {
  instagram: 180,
  facebook: 120,
  linkedin: 240,
  twitter: 30,
  tiktok: 180,
  youtube: 360,
  googleads: 0,
  whatsapp: 0,
};

export const ESPACIADO_ES_CRITERIO_DE_LA_CASA = true;
