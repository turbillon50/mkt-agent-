import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

type Project = {
  name: string;
  kind: string;
  pieces: number;
  progress: number;
  networks: Array<'IG' | 'X' | 'LI' | 'TT'>;
};

const projects: Project[] = [
  { name: 'Lanzamiento Goossip', kind: 'Contenido', pieces: 12, progress: 75, networks: ['IG', 'X', 'LI', 'TT'] },
  { name: 'Marca Personal',     kind: 'Estrategia', pieces: 8,  progress: 60, networks: ['IG', 'X', 'LI'] },
  { name: 'VanDeFi',            kind: 'Campaña',    pieces: 15, progress: 40, networks: ['IG', 'X', 'LI', 'TT'] },
];

const networkColors: Record<Project['networks'][number], string> = {
  IG: 'from-fuchsia-500 to-orange-400',
  X: 'from-zinc-400 to-zinc-200',
  LI: 'from-blue-500 to-blue-400',
  TT: 'from-pink-500 to-cyan-400',
};

export function ProjectsRow() {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Proyectos activos</h2>
        <Link href="/projects" className="text-sm text-[var(--color-muted-foreground)] hover:underline">
          Ver todos
        </Link>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {projects.map((p) => (
          <Card key={p.name} className="card-glow">
            <CardContent className="space-y-3 p-4">
              <div>
                <div className="text-sm font-semibold">{p.name}</div>
                <div className="text-xs text-[var(--color-muted-foreground)]">
                  {p.kind} · {p.pieces} piezas
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {p.networks.map((n) => (
                  <span
                    key={n}
                    className={`grid h-5 w-5 place-items-center rounded bg-gradient-to-br ${networkColors[n]} text-[10px] font-semibold text-white/90`}
                  >
                    {n}
                  </span>
                ))}
                <span className="ml-auto text-xs text-[var(--color-muted-foreground)]">{p.progress}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-muted)]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-pink-500"
                  style={{ width: `${p.progress}%` }}
                />
              </div>
            </CardContent>
          </Card>
        ))}
        <Link
          href="/projects"
          className="flex min-h-[140px] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[var(--color-border)] text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-accent)]"
        >
          <Plus className="h-5 w-5" />
          <span className="text-sm">Nuevo proyecto</span>
        </Link>
      </div>
      <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
        Estos son ejemplos visuales — el módulo Proyectos llegará en una fase posterior.
      </p>
    </section>
  );
}
