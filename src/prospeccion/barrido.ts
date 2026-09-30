/**
 * El recorrido: Goossip barriendo la zona cuadrante por cuadrante, en vivo.
 *
 * Luis lo pidió con estas palabras: *"quiero que se vea Google Maps y se vea
 * cómo trabaja, que está recorriendo un browser por demostración"*. Lo que hay
 * aquí abajo es esa frase vuelta código, y la línea que no se cruza es la misma
 * de la corrida 7: **nada se simula.** Cada marcador que cae en el mapa es un
 * `place_id` que Google acaba de devolver y que ya quedó guardado en
 * `prospects`. Una demo con resultados de mentira se cae sola en la primera
 * pregunta del prospecto —"¿ese restaurante existe?"— y se lleva la venta.
 *
 * La forma es un **generador asíncrono**: el recorrido va escupiendo eventos
 * conforme pasan las cosas y quien lo consuma decide qué hacer con ellos. La
 * ruta los manda por SSE al navegador; la prueba los junta en un arreglo y los
 * cuenta. Los dos ven exactamente la misma secuencia, que es la única forma de
 * que lo que se prueba sea lo que se ve.
 *
 * Tres cosas que este archivo cuida y que no se ven en la pantalla:
 *
 *   · **el gasto** — cada llamada a Google se cuenta ANTES de hacerla contra lo
 *     que le queda al proyecto en el mes, y el recorrido se corta a media zona
 *     si se acaba el presupuesto, avisando. Un barrido de 3×3 con dos giros son
 *     18 llamadas: quien tiene tope de 50 se lo gasta en tres recorridos, y
 *     enterarse por el recibo no es enterarse.
 *   · **el corte del usuario** — si cierra la pestaña, la señal aborta y se deja
 *     de preguntarle a Google. Sin eso, cerrar la pantalla seguiría gastando.
 *   · **la búsqueda queda registrada pase lo que pase**, con lo que llevaba
 *     gastado cuando tronó. Google cobra el intento.
 */
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import {
  prospects,
  prospectSearches,
  type Project,
  type Prospect,
  type ProspectEnrichment,
} from '../db/schema';
import {
  busquedasDelMes,
  enriquecerDesdeSitio,
  guardarLugares,
  MapsNoDisponible,
  paraElNavegador,
  pedirLugares,
  topeDeBusquedas,
  ubicarZona,
  viaDisponible,
  type Lugar,
  type ProspectoFuera,
  type ViaMaps,
} from './maps';
import { cuadrantes, type Cuadrante, type Punto } from './geo';
import {
  filtrosDesde,
  filtrosEnPalabras,
  pasaFiltros,
  type FiltrosBarrido,
} from './objetivos';
import {
  contar,
  hallazgos,
  lineaDeContadores,
  narrarCierre,
  narrarCuadrante,
  narrarEntrada,
  narrarLectura,
  narrarLeido,
  type Contadores,
  type NegocioVisto,
} from './narracion';

// ---------------------------------------------------------------------------
// Lo que el recorrido va contando
// ---------------------------------------------------------------------------

export interface CostoBarrido {
  /** Llamadas facturables que van en el mes, contando las de este recorrido. */
  mes: number;
  tope: number;
  /** Cuántas llamadas se pensaban hacer. */
  previsto: number;
  /** Cuántas se hicieron de verdad. */
  hechas: number;
}

export type EventoBarrido =
  | {
      tipo: 'inicio';
      via: ViaMaps;
      zona: string;
      centro: Punto;
      radioM: number;
      lado: number;
      cuadrantes: Cuadrante[];
      giros: string[];
      filtros: FiltrosBarrido;
      costo: CostoBarrido;
      texto: string;
    }
  | { tipo: 'cuadrante'; i: number; n: number; cuadrante: Cuadrante; giro: string; texto: string }
  | {
      tipo: 'negocio';
      prospecto: ProspectoFuera;
      nuevo: boolean;
      cuadrante: number;
      contadores: Contadores;
    }
  | { tipo: 'cuadranteListo'; i: number; encontrados: number; texto: string }
  | { tipo: 'fase'; fase: 'barrido' | 'enriquecimiento'; texto: string }
  | { tipo: 'leyendo'; prospectId: string; nombre: string; texto: string }
  | {
      tipo: 'leido';
      prospectId: string;
      enrichment: ProspectEnrichment;
      contadores: Contadores;
      texto: string;
    }
  /** Se leyó su sitio y no cumple el filtro de WhatsApp: sale de la lista. */
  | { tipo: 'fuera'; prospectId: string; motivo: string }
  | { tipo: 'aviso'; texto: string }
  | {
      tipo: 'resumen';
      total: number;
      nuevos: number;
      contadores: Contadores;
      hallazgos: string[];
      costo: CostoBarrido;
      texto: string;
      searchId: string;
    }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'fin' };

export interface EncargoBarrido {
  project: Project;
  /** "Tulum", "Playa del Carmen centro". */
  zona: string;
  /** Los giros en SINGULAR, uno por búsqueda: ["restaurante", "cafetería"]. */
  giros: string[];
  /** Si ya se sabe el centro (el usuario movió el mapa), no se geocodifica. */
  centro?: Punto | null;
  filtros?: Partial<FiltrosBarrido>;
  /**
   * Dejar que el radio lo proponga la zona.
   *
   * Apagado por omisión y eso NO es un detalle: la primera versión usaba el
   * radio sugerido cada vez que el que llegaba era el de fábrica, y el usuario
   * que escribía "3 km" a mano terminaba con un barrido de 6.1 km porque 3 000
   * resultaba ser también el número de fábrica. El radio que manda el usuario
   * se respeta siempre; la sugerencia solo entra cuando alguien la pide.
   */
  radioAuto?: boolean;
  /** 3 = cuadrícula de 3×3. */
  lado?: number;
  /** Páginas por celda y giro. 1 = hasta 20 negocios; 2 = hasta 40. */
  paginas?: number;
  /** Modo presentación: más lento, para que se vea. */
  demo?: boolean;
  /** Cuántos sitios leer al terminar el barrido. 0 = ninguno. */
  enriquecer?: number;
  quien?: string | null;
  señal?: AbortSignal;
}

/** Cuántas llamadas máximo puede pedir un solo recorrido, pase lo que pase. */
export const TOPE_LLAMADAS_POR_BARRIDO = 60;

const RITMO = {
  normal: { cuadrante: 120, negocio: 0 },
  // En demo el recorrido va a la velocidad a la que una persona lo puede
  // CONTAR. No es una animación bonita: es que a Luis le dé tiempo de decir
  // "mira, este no tiene sitio web" antes de que caiga el siguiente.
  demo: { cuadrante: 1100, negocio: 240 },
};

const dormir = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

/**
 * Cuántas llamadas va a costar el recorrido, ANTES de lanzarlo.
 *
 * La pantalla lo enseña al lado del botón. Enterarse de que un clic valía 18
 * búsquedas de tus 50 cuando ya se fueron no es enterarse: es el recibo.
 */
export function costoPrevisto(input: {
  lado: number;
  giros: number;
  paginas: number;
  geocodificar: boolean;
}): number {
  const barrido = Math.max(1, input.lado) ** 2 * Math.max(1, input.giros) * Math.max(1, input.paginas);
  return Math.min(barrido + (input.geocodificar ? 1 : 0), TOPE_LLAMADAS_POR_BARRIDO);
}

// ---------------------------------------------------------------------------
// El recorrido
// ---------------------------------------------------------------------------

export async function* barrer(encargo: EncargoBarrido): AsyncGenerator<EventoBarrido> {
  const { project } = encargo;
  const filtros = filtrosDesde({ ...encargo.filtros });
  const lado = Math.min(Math.max(Math.floor(encargo.lado ?? 3), 1), 5);
  const paginas = Math.min(Math.max(Math.floor(encargo.paginas ?? 1), 1), 3);
  const giros = encargo.giros
    .map((g) => g.trim())
    .filter((g) => g.length >= 3)
    .slice(0, 6);
  const ritmo = encargo.demo ? RITMO.demo : RITMO.normal;
  const abortado = () => Boolean(encargo.señal?.aborted);

  if (giros.length === 0) {
    yield { tipo: 'error', mensaje: 'Dime al menos un giro: restaurantes, gimnasios, notarías…' };
    return;
  }
  if (encargo.zona.trim().length < 3 && !encargo.centro) {
    yield { tipo: 'error', mensaje: 'Dime la zona: "Tulum", "Playa del Carmen centro".' };
    return;
  }

  const via = await viaDisponible(project);
  if (!via) {
    yield { tipo: 'error', mensaje: new MapsNoDisponible().message };
    return;
  }

  // ------------------------------------------------------------ el presupuesto
  const tope = topeDeBusquedas(project);
  const mesPrevio = await busquedasDelMes(project.id);
  if (tope > 0 && mesPrevio >= tope) {
    yield {
      tipo: 'error',
      mensaje: `Este proyecto ya lleva ${mesPrevio} búsquedas de mapa este mes y su tope es ${tope}. Súbelo en Ajustes si quieres seguir — cada búsqueda se la cobra Google.`,
    };
    return;
  }
  const presupuesto = Math.min(
    tope > 0 ? tope - mesPrevio : TOPE_LLAMADAS_POR_BARRIDO,
    TOPE_LLAMADAS_POR_BARRIDO,
  );

  // La fila se abre ANTES de la primera llamada y con cero gastado. Si el
  // proceso se muere a media zona, lo que alcanzó a costar ya quedó anotado.
  const [fila] = await db
    .insert(prospectSearches)
    .values({
      orgId: project.orgId,
      projectId: project.id,
      kind: 'barrido',
      query: `${giros.join(', ')} en ${encargo.zona}`.slice(0, 500),
      zone: encargo.centro ? `${encargo.centro.lat},${encargo.centro.lng}` : encargo.zona,
      radiusM: filtros.radioM,
      via,
      results: 0,
      nuevos: 0,
      costUnits: 0,
      createdBy: encargo.quien ?? null,
    })
    .returning();
  const searchId = fila!.id;

  let llamadas = 0;
  let error: string | null = null;
  const vistos = new Set<string>();
  const negocios: NegocioVisto[] = [];
  /**
   * El mismo negocio, alcanzable por el id de su fila. Hace falta porque al
   * leer su sitio hay que volver a tocarlo, y buscarlo por NOMBRE era el bug
   * esperando: en un barrido de Tulum salen tres "Taquería El Paisa" y el
   * WhatsApp del primero se le habría pegado al tercero.
   */
  const porId = new Map<string, NegocioVisto>();
  const guardados: Prospect[] = [];
  let nuevos = 0;

  /**
   * Anota en la fila lo que este recorrido lleva gastado. Se puede llamar las
   * veces que sea —escribe los mismos números— y se llama en el `finally`
   * justamente porque el caso que importa es el que NO termina bien: si el
   * usuario cierra la pestaña en el cuadrante 4, esas cuatro llamadas ya se las
   * cobró Google y tienen que estar contadas.
   */
  const cerrar = async () => {
    await db
      .update(prospectSearches)
      .set({ results: vistos.size, nuevos, costUnits: llamadas, error })
      .where(eq(prospectSearches.id, searchId));
  };

  try {
    // ---------------------------------------------------------- dónde es esto
    let centro = encargo.centro ?? null;
    let nombreZona = encargo.zona.trim();
    let radioM = filtros.radioM;
    if (!centro) {
      const zona = await ubicarZona(project, nombreZona, via, filtros.radioM);
      llamadas += zona?.llamadas ?? 1;
      if (!zona) {
        error = `No encontré "${nombreZona}" en el mapa. Escríbela como la buscarías en Google Maps.`;
        yield { tipo: 'error', mensaje: error };
        await cerrar();
        return;
      }
      centro = zona.centro;
      nombreZona = zona.nombre.split(',')[0]!.trim() || nombreZona;
      if (encargo.radioAuto && zona.via === 'geocoding') {
        radioM = zona.radioSugeridoM;
        yield {
          tipo: 'aviso',
          texto: `${nombreZona} mide como ${(radioM / 1000).toFixed(1)} km de radio: ajusté el recorrido a eso.`,
        };
      }
    }

    const cuadris = cuadrantes(centro, radioM, lado);
    const previsto = costoPrevisto({
      lado,
      giros: giros.length,
      paginas,
      geocodificar: !encargo.centro,
    });

    const costo = (): CostoBarrido => ({
      mes: mesPrevio + llamadas,
      tope,
      previsto,
      hechas: llamadas,
    });

    yield {
      tipo: 'inicio',
      via,
      zona: nombreZona,
      centro,
      radioM,
      lado,
      cuadrantes: cuadris,
      giros,
      filtros,
      costo: costo(),
      texto: `Voy a recorrer ${nombreZona} en ${cuadris.length} cuadrantes buscando ${giros.join(
        ', ',
      )} · ${filtrosEnPalabras(filtros).join(' · ')}`,
    };

    if (previsto > presupuesto) {
      yield {
        tipo: 'aviso',
        texto: `Este recorrido pide ${previsto} búsquedas y a este proyecto le quedan ${presupuesto} en el mes. Voy hasta donde alcance y te digo dónde me quedé.`,
      };
    }

    // ------------------------------------------------------------- el barrido
    yield { tipo: 'fase', fase: 'barrido', texto: `Entrando a ${nombreZona}…` };

    let cortadoPorCosto = false;
    for (const cuadrante of cuadris) {
      if (abortado() || cortadoPorCosto) break;
      const antes = negocios.length;

      for (const giro of giros) {
        if (abortado() || cortadoPorCosto) break;

        yield {
          tipo: 'cuadrante',
          i: cuadrante.i,
          n: cuadris.length,
          cuadrante,
          giro,
          texto: narrarEntrada(nombreZona, cuadrante.nombre, cuadrante.i, cuadris.length),
        };
        await dormir(ritmo.cuadrante);

        let pageToken: string | null = null;
        for (let pagina = 0; pagina < paginas; pagina += 1) {
          if (abortado()) break;
          if (llamadas >= presupuesto) {
            cortadoPorCosto = true;
            break;
          }

          let respuesta;
          try {
            respuesta = await pedirLugares({
              project,
              via,
              consulta: giro,
              caja: cuadrante.caja,
              centro: { ...cuadrante.centro, radioM: cuadrante.radioM },
              limite: 20,
              pageToken,
              minRating: filtros.ratingMin,
              openNow: filtros.abiertosAhora,
              horarios: filtros.horarios,
              señal: encargo.señal,
            });
          } catch (e) {
            llamadas += 1;
            // Un cuadrante que truena no tira el recorrido: se anota y se sigue
            // con el siguiente. Nueve cuadrantes y que uno conteste 500 no es
            // motivo para dejar al usuario sin los otros ocho.
            yield {
              tipo: 'aviso',
              texto: `El ${cuadrante.nombre} no contestó (${
                e instanceof Error ? e.message.slice(0, 120) : 'sin detalle'
              }). Sigo con el resto.`,
            };
            break;
          }
          llamadas += 1;

          const frescos: Lugar[] = [];
          for (const l of respuesta.lugares) {
            if (vistos.has(l.placeId)) continue;
            if (!pasaFiltros(l, filtros)) continue;
            vistos.add(l.placeId);
            frescos.push(l);
          }

          if (frescos.length > 0) {
            const filas = await guardarLugares(project, frescos, searchId);
            for (const g of filas) {
              if (abortado()) break;
              if (g.nuevo) nuevos += 1;
              guardados.push(g.fila);
              const lugar = frescos.find((f) => f.placeId === g.fila.placeId);
              const visto: NegocioVisto = {
                name: g.fila.name,
                website: g.fila.website,
                phone: g.fila.phone,
                rating: g.fila.rating !== null ? Number(g.fila.rating) : null,
                ratingsCount: g.fila.ratingsCount,
                category: g.fila.category,
                abierto24h: lugar?.abierto24h ?? null,
              };
              negocios.push(visto);
              porId.set(g.fila.id, visto);
              yield {
                tipo: 'negocio',
                prospecto: paraElNavegador(g.fila),
                nuevo: g.nuevo,
                cuadrante: cuadrante.i,
                contadores: contar(negocios),
              };
              await dormir(ritmo.negocio);
            }
          }

          pageToken = respuesta.pageToken;
          if (!pageToken) break;
        }
      }

      if (!cortadoPorCosto && !abortado()) {
        const caidos = negocios.length - antes;
        const sinSitio = negocios.slice(antes).filter((n) => !n.website).length;
        yield {
          tipo: 'cuadranteListo',
          i: cuadrante.i,
          encontrados: caidos,
          texto: narrarCuadrante({
            zona: nombreZona,
            cuadrante: cuadrante.nombre,
            giro: giros[0]!,
            encontrados: caidos,
            sinSitio,
          }),
        };
      }
    }

    if (cortadoPorCosto) {
      yield {
        tipo: 'aviso',
        texto: `Me quedé sin presupuesto del mes: ${llamadas} búsquedas hechas de las ${previsto} que pedía el recorrido. Sube el tope en Ajustes y lo termino.`,
      };
    }

    // ------------------------------------------------- leer el sitio de cada uno
    const aLeer = guardados
      .filter((p) => p.website && !(p.enrichment as ProspectEnrichment)?.leido)
      .slice(0, Math.max(0, encargo.enriquecer ?? 0));

    if (aLeer.length > 0 && !abortado()) {
      yield {
        tipo: 'fase',
        fase: 'enriquecimiento',
        texto: `Ahora leo el sitio de ${aLeer.length} de ellos, solo lo que publican.`,
      };
      for (const p of aLeer) {
        if (abortado()) break;
        yield {
          tipo: 'leyendo',
          prospectId: p.id,
          nombre: p.name,
          texto: narrarLectura(p.name),
        };
        // Leer el sitio de un negocio NO es una llamada a Google: no cuenta al
        // tope ni cuesta un centavo. Es su página, abierta como la abriría
        // cualquiera.
        const enrichment = await enriquecerDesdeSitio(p.website!).catch(
          () => ({ redes: {}, leido: [] }) as ProspectEnrichment,
        );
        await db
          .update(prospects)
          .set({ enrichment, updatedAt: new Date() })
          .where(eq(prospects.id, p.id));

        const enLista = porId.get(p.id);
        if (enLista) {
          enLista.email = enrichment.email ?? null;
          enLista.whatsapp = enrichment.whatsapp ?? null;
        }

        yield {
          tipo: 'leido',
          prospectId: p.id,
          enrichment,
          contadores: contar(negocios),
          texto: narrarLeido(p.name, enrichment),
        };

        // El filtro "con WhatsApp en el sitio" solo se puede aplicar AQUÍ: no
        // es un dato de Maps, es un dato de su página, y hasta no leerla nadie
        // sabe. Por eso el negocio ya cayó al mapa y ahora sale, en vez de
        // fingir que el filtro se aplicó desde el principio.
        if (filtros.conWhatsapp && !enrichment.whatsapp) {
          yield {
            tipo: 'fuera',
            prospectId: p.id,
            motivo: 'su sitio no publica WhatsApp',
          };
        }
        await dormir(encargo.demo ? 200 : 0);
      }
    }

    // ------------------------------------------------------------- el resumen
    const conteo = contar(negocios);
    const lista = hallazgos(negocios, filtros.horarios);
    await cerrar();
    yield {
      tipo: 'resumen',
      total: conteo.total,
      nuevos,
      contadores: conteo,
      hallazgos: lista,
      costo: costo(),
      searchId,
      texto: `${narrarCierre({
        zona: nombreZona,
        total: conteo.total,
        nuevos,
        cuadrantes: cuadris.length,
        hallazgos: lista,
      })} ${lineaDeContadores(conteo)}.`,
    };
  } catch (e) {
    error = e instanceof Error ? e.message : 'El recorrido se cayó.';
    yield { tipo: 'error', mensaje: error };
  } finally {
    // Sin `yield` aquí dentro, a propósito: cuando quien consume el generador
    // corta en seco (el usuario cerró la pestaña), JavaScript entra a este
    // bloque con el generador ya cerrándose y un `yield` tronaría. Un `await`
    // sí se puede, y es todo lo que hace falta — lo que no se puede perder es
    // el registro de lo que se gastó.
    await cerrar().catch(() => undefined);
  }

  yield { tipo: 'fin' };
}
