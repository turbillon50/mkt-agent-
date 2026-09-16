'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast-provider';
import { defaultLogo } from '@/src/projects/catalog';

/**
 * Traer lo que el cliente ya escribió, en vez de pedirle que lo escriba otra
 * vez. Sus precios viven en una hoja, su manual en Notion y sus fichas en
 * Drive: de ahí salen, con embeddings, a la memoria del vendedor.
 *
 * Solo se enseñan las fuentes CONECTADAS. Ofrecer un botón que va a fallar por
 * falta de permiso es la clase de promesa que rompe la confianza en el panel.
 */
interface Campo {
  nombre: string;
  placeholder: string;
}

const FUENTES: Record<string, { label: string; campos: Campo[]; ayuda: string }> = {
  notion: {
    label: 'Notion',
    campos: [],
    ayuda: 'Trae las páginas que compartiste con la conexión.',
  },
  googledrive: {
    label: 'Google Drive',
    campos: [{ nombre: 'folderId', placeholder: 'Id de la carpeta (opcional)' }],
    ayuda: 'Déjalo vacío para tus documentos recientes, o pega el id de una carpeta.',
  },
  googlesheets: {
    label: 'Google Sheets',
    campos: [{ nombre: 'spreadsheetId', placeholder: 'Id de la hoja' }],
    ayuda: 'El id de la hoja es lo que va entre /d/ y /edit en su dirección.',
  },
  airtable: {
    label: 'Airtable',
    campos: [
      { nombre: 'baseId', placeholder: 'Id de la base (appXXXX)' },
      { nombre: 'table', placeholder: 'Nombre de la tabla' },
    ],
    ayuda: 'El id de la base empieza con "app" y sale en la dirección de Airtable.',
  },
};

export function KnowledgeImport({
  projectId,
  conectadas,
}: {
  projectId: string;
  conectadas: string[];
}) {
  const router = useRouter();
  const { push } = useToast();
  const [abierta, setAbierta] = useState<string | null>(null);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [trabajando, setTrabajando] = useState<string | null>(null);

  const disponibles = conectadas.filter((c) => FUENTES[c]);
  if (disponibles.length === 0) return null;

  async function importar(fuente: string) {
    const spec = FUENTES[fuente];
    setTrabajando(fuente);
    try {
      const datos: Record<string, string> = {};
      for (const campo of spec.campos) {
        const v = (valores[campo.nombre] ?? '').trim();
        if (v) datos[campo.nombre] = v;
      }
      const res = await fetch(`/api/projects/${projectId}/knowledge/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fuente, ...datos }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'No se pudo importar.');
      push({
        title:
          data.nuevos + data.actualizados === 0
            ? 'No encontramos nada que traer'
            : `${data.nuevos} nuevos · ${data.actualizados} actualizados`,
        variant: data.nuevos + data.actualizados === 0 ? 'error' : 'success',
      });
      setAbierta(null);
      setValores({});
      router.refresh();
    } catch (e) {
      push({ title: e instanceof Error ? e.message : 'Error', variant: 'error' });
    } finally {
      setTrabajando(null);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div>
          <h3 className="text-sm font-medium">Traer lo que ya tienes escrito</h3>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            De tus cuentas conectadas, sin volver a capturar nada.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {disponibles.map((fuente) => (
            <Button
              key={fuente}
              size="sm"
              variant={abierta === fuente ? 'default' : 'outline'}
              disabled={trabajando !== null}
              onClick={() => {
                const spec = FUENTES[fuente];
                if (spec.campos.length === 0) return void importar(fuente);
                setAbierta(abierta === fuente ? null : fuente);
                setValores({});
              }}
            >
              <img
                src={defaultLogo(fuente)}
                alt=""
                className="mr-1.5 h-3.5 w-3.5 rounded-sm bg-white"
              />
              {trabajando === fuente ? 'Trayendo…' : `Importar de ${FUENTES[fuente].label}`}
            </Button>
          ))}
        </div>

        {abierta && FUENTES[abierta].campos.length > 0 && (
          <div className="space-y-2 border-t border-[var(--color-border)] pt-3">
            {FUENTES[abierta].campos.map((campo) => (
              <Input
                key={campo.nombre}
                value={valores[campo.nombre] ?? ''}
                onChange={(e) =>
                  setValores((v) => ({ ...v, [campo.nombre]: e.target.value }))
                }
                placeholder={campo.placeholder}
              />
            ))}
            <p className="text-[11px] text-[var(--color-muted-foreground)]">
              {FUENTES[abierta].ayuda}
            </p>
            <Button
              size="sm"
              className="btn-brand"
              disabled={trabajando !== null}
              onClick={() => void importar(abierta)}
            >
              Importar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
