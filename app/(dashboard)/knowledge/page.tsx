import { revalidatePath } from 'next/cache';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { listKnowledge } from '@/lib/data';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function ingestKnowledge(formData: FormData) {
  'use server';
  const content = String(formData.get('content') ?? '').trim();
  const title = String(formData.get('title') ?? '').trim() || null;
  const source = String(formData.get('source') ?? '').trim() || null;
  if (content.length < 20) return;
  const { db } = await import('@/src/db/client');
  const { knowledge } = await import('@/src/db/schema');
  const { remember } = await import('@/src/memory/index');
  const [row] = await db
    .insert(knowledge)
    .values({ content, title, source })
    .returning({ id: knowledge.id });
  if (row) {
    await remember({ refType: 'knowledge', refId: row.id, content, metadata: { title, source } });
  }
  revalidatePath('/knowledge');
}

export default async function KnowledgePage() {
  let rows: Awaited<ReturnType<typeof listKnowledge>> = [];
  let error: string | null = null;
  try {
    rows = await listKnowledge();
  } catch (e) {
    error = e instanceof Error ? e.message : 'failed to load knowledge';
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Knowledge</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Lo que el agente sabe sobre tu marca, producto y narrativa.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Ingerir nuevo conocimiento</CardTitle>
          <CardDescription>Se embebe y queda disponible vía recall.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={ingestKnowledge} className="space-y-3">
            <Input name="title" placeholder="Título (opcional)" />
            <Input name="source" placeholder="Fuente (opcional)" />
            <Textarea
              name="content"
              required
              minLength={20}
              placeholder="Pega un manifiesto, un FAQ, las features del producto, ejemplos de tono…"
              className="min-h-[160px]"
            />
            <div className="flex justify-end">
              <Button type="submit">Guardar</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {error && (
        <Card>
          <CardHeader>
            <CardTitle>Error</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs whitespace-pre-wrap">{error}</pre>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {rows.map((k) => (
          <Card key={k.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{k.title ?? 'Sin título'}</CardTitle>
                <span className="text-xs text-[var(--color-muted-foreground)]">
                  {formatDate(k.createdAt)}
                </span>
              </div>
              {k.source && <CardDescription>{k.source}</CardDescription>}
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm line-clamp-6">{k.content}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
