import { revalidatePath } from 'next/cache';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { listPlanItems } from '@/lib/data';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function regeneratePlan() {
  'use server';
  const { buildPlan } = await import('@/src/planner');
  await buildPlan();
  revalidatePath('/plan');
}

export default async function PlanPage() {
  let items: Awaited<ReturnType<typeof listPlanItems>> = [];
  let error: string | null = null;
  try {
    items = await listPlanItems();
  } catch (e) {
    error = e instanceof Error ? e.message : 'failed to load plan';
  }

  const groupedByPlan = new Map<string, typeof items>();
  for (const item of items) {
    const arr = groupedByPlan.get(item.planId) ?? [];
    arr.push(item);
    groupedByPlan.set(item.planId, arr);
  }
  const plans = Array.from(groupedByPlan.entries()).sort(
    (a, b) => (b[1][0]?.createdAt.getTime() ?? 0) - (a[1][0]?.createdAt.getTime() ?? 0),
  );

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Plan</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Plan semanal generado por el agente. Cada fila marca el día (0–6) y la plataforma.
          </p>
        </div>
        <form action={regeneratePlan}>
          <Button type="submit">Regenerar plan</Button>
        </form>
      </header>

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

      {plans.length === 0 && !error && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-[var(--color-muted-foreground)]">
            Aún no hay un plan. Pulsa <em>Regenerar plan</em> arriba.
          </CardContent>
        </Card>
      )}

      {plans.map(([planId, group]) => (
        <Card key={planId}>
          <CardHeader>
            <CardTitle className="text-sm font-mono text-[var(--color-muted-foreground)]">
              {planId.slice(0, 8)}
            </CardTitle>
            <CardDescription>
              {group.length} entradas · creado {group[0]?.createdAt.toLocaleDateString('es')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2">
              {group
                .slice()
                .sort((a, b) => a.dayOffset - b.dayOffset)
                .map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm"
                  >
                    <Badge variant="outline">D+{item.dayOffset}</Badge>
                    <Badge variant="secondary">{item.platform}</Badge>
                    <div className="flex-1">
                      <div>{item.topic}</div>
                      {item.angle && (
                        <div className="text-xs text-[var(--color-muted-foreground)]">{item.angle}</div>
                      )}
                    </div>
                    {item.used && <Badge>publicado</Badge>}
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
