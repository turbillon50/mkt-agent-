import { revalidatePath } from 'next/cache';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { enterProject } from '@/lib/project-access';

/**
 * Enseñarle algo al vendedor.
 *
 * Es una acción de servidor y NO confía en el `projectId` que llega del
 * formulario: lo vuelve a pasar por la puerta del proyecto. Un campo oculto lo
 * cambia cualquiera desde el navegador.
 */
async function guardar(formData: FormData) {
  'use server';
  const projectId = String(formData.get('projectId') ?? '');
  const acceso = await enterProject(projectId, 'conocimiento');
  if (!acceso.ok || !acceso.ctx.can('operar')) return;

  const content = String(formData.get('content') ?? '').trim();
  const title = String(formData.get('title') ?? '').trim() || null;
  const source = String(formData.get('source') ?? '').trim() || null;
  if (content.length < 20) return;

  const { db } = await import('@/src/db/client');
  const { knowledge } = await import('@/src/db/schema');
  const { remember } = await import('@/src/memory/index');
  const [row] = await db
    .insert(knowledge)
    .values({ orgId: acceso.ctx.orgId, campaignId: projectId, content, title, source })
    .returning({ id: knowledge.id });
  if (row) {
    await remember({ refType: 'knowledge', refId: row.id, content, metadata: { title, source } });
  }
  revalidatePath(`/projects/${projectId}/conocimiento`);
}

export function KnowledgeForm({ projectId }: { projectId: string }) {
  return (
    <Card className="card-glow">
      <CardHeader>
        <CardTitle className="text-base">Enséñale algo nuevo</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={guardar} className="space-y-3">
          <input type="hidden" name="projectId" value={projectId} />
          <Input name="title" placeholder="Título (opcional)" />
          <Input name="source" placeholder="De dónde salió (opcional)" />
          <Textarea
            name="content"
            required
            minLength={20}
            placeholder="Pega tus preguntas frecuentes, tus precios, tus formas de pago, cómo hablas con tus clientes…"
            className="min-h-[140px]"
          />
          <div className="flex justify-end">
            <Button type="submit" className="btn-brand">
              Guardar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
