/**
 * Adaptadores de CONOCIMIENTO Y VERDAD: Google Sheets, Airtable, Notion,
 * Google Drive y HubSpot.
 *
 * De aquí sale con qué cotiza el vendedor. Todos devuelven documentos con la
 * misma forma (`KnowledgeDoc`) para que la importación a `knowledge` sea una
 * sola función y no cinco parecidas que se van separando con el tiempo.
 */
import type { Project } from '../db/schema';
import { cuerpo, run, verifyChannel, type ChannelAdapter, type KnowledgeDoc } from './base';

// ---------------------------------------------------------------------------
// Google Sheets
// ---------------------------------------------------------------------------

export const googlesheets: ChannelAdapter = {
  toolkit: 'googlesheets',
  verify: (project) => verifyChannel(project, 'googlesheets'),

  /** Lee los rangos de una hoja. Sin rango, la hoja completa. */
  async readRows(project: Project, input: Record<string, unknown>) {
    const spreadsheetId = String(input.spreadsheetId ?? '');
    if (!spreadsheetId) throw new Error('Falta la hoja de cálculo.');
    const ranges = Array.isArray(input.ranges) ? (input.ranges as string[]) : undefined;
    const data: any = cuerpo(
      await run(project, 'googlesheets', 'GOOGLESHEETS_BATCH_GET', {
        spreadsheet_id: spreadsheetId,
        ...(ranges ? { ranges } : {}),
      }),
    );
    return data?.valueRanges ?? data?.value_ranges ?? data;
  },

  /** Escribe una fila al final. Es la prueba de que la conexión sirve en serio. */
  async writeContact(project: Project, input: Record<string, unknown>) {
    const spreadsheetId = String(input.spreadsheetId ?? '');
    const range = String(input.range ?? 'A1');
    const values = (input.values as unknown[][]) ?? [[]];
    if (!spreadsheetId) throw new Error('Falta la hoja de cálculo.');
    return run(project, 'googlesheets', 'GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND', {
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      values,
    });
  },

  async readDocs(project: Project, input: Record<string, unknown> = {}): Promise<KnowledgeDoc[]> {
    const spreadsheetId = String(input.spreadsheetId ?? '');
    if (!spreadsheetId) return [];
    const info: any = cuerpo(
      await run(project, 'googlesheets', 'GOOGLESHEETS_GET_SPREADSHEET_INFO', {
        spreadsheet_id: spreadsheetId,
      }).catch(() => null),
    );
    const titulo = info?.properties?.title ?? 'Hoja de cálculo';
    const data: any = cuerpo(
      await run(project, 'googlesheets', 'GOOGLESHEETS_BATCH_GET', {
        spreadsheet_id: spreadsheetId,
      }),
    );
    const rangos: any[] = data?.valueRanges ?? data?.value_ranges ?? [];
    return rangos
      .map((r, i): KnowledgeDoc => {
        const filas: any[][] = r?.values ?? [];
        return {
          id: `${spreadsheetId}:${r?.range ?? i}`,
          titulo: `${titulo} · ${r?.range ?? `rango ${i + 1}`}`,
          contenido: filas.map((f) => f.join(' · ')).join('\n'),
          fuente: `googlesheets:${spreadsheetId}`,
        };
      })
      .filter((d) => d.contenido.trim().length > 0);
  },
};

// ---------------------------------------------------------------------------
// Airtable
// ---------------------------------------------------------------------------

export const airtable: ChannelAdapter = {
  toolkit: 'airtable',
  verify: (project) => verifyChannel(project, 'airtable'),

  async readRows(project: Project, input: Record<string, unknown>) {
    const baseId = String(input.baseId ?? '');
    const tabla = String(input.table ?? input.tableIdOrName ?? '');
    if (!baseId || !tabla) throw new Error('Falta la base o la tabla de Airtable.');
    return cuerpo(
      await run(project, 'airtable', 'AIRTABLE_LIST_RECORDS', {
        baseId,
        tableIdOrName: tabla,
        pageSize: Number(input.pageSize ?? 50),
      }),
    );
  },

  async readDocs(project: Project, input: Record<string, unknown> = {}): Promise<KnowledgeDoc[]> {
    const baseId = String(input.baseId ?? '');
    const tabla = String(input.table ?? input.tableIdOrName ?? '');
    if (!baseId || !tabla) return [];
    const data: any = cuerpo(
      await run(project, 'airtable', 'AIRTABLE_LIST_RECORDS', {
        baseId,
        tableIdOrName: tabla,
        pageSize: Number(input.pageSize ?? 50),
      }),
    );
    return (data?.records ?? []).map(
      (r: any): KnowledgeDoc => ({
        id: String(r.id),
        titulo: String(Object.values(r.fields ?? {})[0] ?? r.id),
        contenido: Object.entries(r.fields ?? {})
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
          .join('\n'),
        fuente: `airtable:${baseId}/${tabla}`,
      }),
    );
  },

  async writeContact(project: Project, input: Record<string, unknown>) {
    const baseId = String(input.baseId ?? '');
    const tabla = String(input.table ?? '');
    if (!baseId || !tabla) throw new Error('Falta la base o la tabla de Airtable.');
    return run(project, 'airtable', 'AIRTABLE_CREATE_RECORD', {
      baseId,
      tableIdOrName: tabla,
      fields: input.fields ?? {},
    });
  },
};

// ---------------------------------------------------------------------------
// Notion
// ---------------------------------------------------------------------------

export const notion: ChannelAdapter = {
  toolkit: 'notion',
  verify: (project) => verifyChannel(project, 'notion'),

  /**
   * Las páginas que el cliente compartió con la conexión. Notion no deja ver
   * nada que no se le haya compartido explícitamente, así que una lista vacía
   * casi siempre significa "no compartió ninguna página", no "no hay".
   */
  async readRows(project: Project, input: Record<string, unknown> = {}) {
    return run(project, 'notion', 'NOTION_SEARCH_NOTION_PAGE', {
      query: String(input.query ?? ''),
      page_size: Number(input.pageSize ?? 20),
    });
  },

  async readDocs(project: Project, input: Record<string, unknown> = {}): Promise<KnowledgeDoc[]> {
    const busqueda: any = cuerpo(
      await run(project, 'notion', 'NOTION_SEARCH_NOTION_PAGE', {
        query: String(input.query ?? ''),
        page_size: Number(input.pageSize ?? 10),
      }),
    );
    const paginas: any[] = busqueda?.results ?? [];
    const docs: KnowledgeDoc[] = [];
    for (const p of paginas.slice(0, Number(input.max ?? 10))) {
      const id = String(p.id ?? '');
      if (!id) continue;
      const titulo = tituloNotion(p) ?? 'Página de Notion';
      const bloques: any = cuerpo(
        await run(project, 'notion', 'NOTION_FETCH_BLOCK_CONTENTS', {
          block_id: id,
          page_size: 100,
        }).catch(() => null),
      );
      const texto = textoDeBloques(bloques);
      if (texto.trim()) {
        docs.push({ id, titulo, contenido: texto, fuente: `notion:${id}` });
      }
    }
    return docs;
  },
};

function tituloNotion(p: any): string | null {
  const props = p?.properties ?? {};
  for (const v of Object.values<any>(props)) {
    const t = v?.title?.[0]?.plain_text;
    if (t) return String(t);
  }
  return p?.title?.[0]?.plain_text ?? null;
}

function textoDeBloques(bloques: any): string {
  const lista: any[] = bloques?.results ?? [];
  const lineas: string[] = [];
  for (const b of lista) {
    const tipo = b?.type;
    const rich = tipo ? b?.[tipo]?.rich_text : null;
    if (Array.isArray(rich)) {
      const linea = rich.map((r: any) => r?.plain_text ?? '').join('');
      if (linea.trim()) lineas.push(linea);
    }
  }
  return lineas.join('\n');
}

// ---------------------------------------------------------------------------
// Google Drive
// ---------------------------------------------------------------------------

export const googledrive: ChannelAdapter = {
  toolkit: 'googledrive',
  verify: (project) => verifyChannel(project, 'googledrive'),

  async readRows(project: Project, input: Record<string, unknown> = {}) {
    return run(project, 'googledrive', 'GOOGLEDRIVE_LIST_FILES', {
      pageSize: Number(input.pageSize ?? 25),
      ...(input.folderId ? { folderId: String(input.folderId) } : {}),
      ...(input.q ? { q: String(input.q) } : {}),
    });
  },

  async readDocs(project: Project, input: Record<string, unknown> = {}): Promise<KnowledgeDoc[]> {
    const data: any = cuerpo(await run(project, 'googledrive', 'GOOGLEDRIVE_LIST_FILES', {
      pageSize: Number(input.pageSize ?? 10),
      ...(input.folderId ? { folderId: String(input.folderId) } : {}),
      // Documentos de texto: un PDF escaneado no aporta nada a los embeddings.
      q: String(
        input.q ??
          "mimeType='application/vnd.google-apps.document' or mimeType='text/plain'",
      ),
    }));
    const archivos: any[] = data?.files ?? data?.items ?? [];
    const docs: KnowledgeDoc[] = [];
    for (const f of archivos.slice(0, Number(input.max ?? 10))) {
      const contenido: any = cuerpo(
        await run(project, 'googledrive', 'GOOGLEDRIVE_DOWNLOAD_FILE', {
          file_id: String(f.id),
          mime_type: 'text/plain',
        }).catch(() => null),
      );
      const texto =
        typeof contenido === 'string'
          ? contenido
          : (contenido?.content ?? contenido?.text ?? contenido?.data ?? '');
      if (String(texto).trim()) {
        docs.push({
          id: String(f.id),
          titulo: f.name ?? String(f.id),
          contenido: String(texto),
          fuente: `googledrive:${f.id}`,
        });
      }
    }
    return docs;
  },
};

// ---------------------------------------------------------------------------
// HubSpot
// ---------------------------------------------------------------------------

export const hubspot: ChannelAdapter = {
  toolkit: 'hubspot',
  verify: (project) => verifyChannel(project, 'hubspot'),

  async readContacts(project: Project, input: Record<string, unknown> = {}) {
    return run(project, 'hubspot', 'HUBSPOT_HUBSPOT_LIST_CONTACTS', {
      limit: Number(input.limit ?? 25),
      properties: input.properties ?? ['email', 'firstname', 'lastname', 'phone', 'lifecyclestage'],
    });
  },

  /** Manda un lead de Goossip al CRM del cliente, sin pisar lo que ya existe. */
  async writeContact(project: Project, input: Record<string, unknown>) {
    return run(project, 'hubspot', 'HUBSPOT_CREATE_CONTACT', {
      ...(input.email ? { email: String(input.email) } : {}),
      ...(input.phone ? { phone: String(input.phone) } : {}),
      ...(input.firstname ? { firstname: String(input.firstname) } : {}),
      ...(input.lastname ? { lastname: String(input.lastname) } : {}),
      ...(input.company ? { company: String(input.company) } : {}),
      lifecyclestage: String(input.lifecyclestage ?? 'lead'),
    });
  },
};
