'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  IconBolt,
  IconBrain,
  IconChat,
  IconChevronDown,
  IconFile,
  IconFolder,
  IconHome,
  IconPlug,
  IconPlus,
  IconSettings,
  IconTarget,
  IconUsers,
} from '@/components/icons';
import { cn } from '@/lib/utils';
import { PROJECT_SECTION_LABEL, type ProjectSection } from '@/src/projects/types';
import { useProjects } from './projects-provider';

/**
 * Navegación del proyecto: primero CUÁL, después QUÉ.
 *
 * Hasta la corrida 2 el menú era una lista plana de módulos y el proyecto era
 * un chip perdido arriba. Ahora el proyecto manda: se elige uno y el menú es lo
 * que ese proyecto tiene adentro.
 */

const SECTION_ICON: Record<ProjectSection, React.ElementType> = {
  inicio: IconHome,
  leads: IconTarget,
  conversaciones: IconChat,
  campanas: IconFolder,
  contenido: IconFile,
  automatizaciones: IconBolt,
  conocimiento: IconBrain,
  conexiones: IconPlug,
  equipo: IconUsers,
  ajustes: IconSettings,
};

export function ProjectNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { projects, activeId, sections, loading, setActiveId } = useProjects();
  const active = projects.find((p) => p.id === activeId) ?? projects[0] ?? null;

  if (loading) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-muted-foreground)]">
        Cargando tus proyectos…
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <ProjectPicker
        projects={projects}
        active={active}
        onPick={(id) => {
          setActiveId(id);
          onNavigate?.();
        }}
        onNavigate={onNavigate}
      />

      {active && (
        <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
          <div className="px-1 pb-1 pt-2 text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
            {active.name}
          </div>
          {sections.map((section) => {
            const href =
              section === 'inicio' ? `/projects/${active.id}` : `/projects/${active.id}/${section}`;
            const activo =
              section === 'inicio' ? pathname === href : pathname.startsWith(href);
            const Icon = SECTION_ICON[section];
            return (
              <Link
                key={section}
                href={href}
                onClick={onNavigate}
                className={cn(
                  'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                  activo
                    ? 'bg-[var(--color-accent)] text-[var(--color-foreground)]'
                    : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]/60 hover:text-[var(--color-foreground)]',
                )}
              >
                {activo && (
                  <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-gradient-to-b from-[var(--color-brand-1)] to-[var(--color-primary)]" />
                )}
                <Icon className={cn('h-4 w-4', activo && 'text-[var(--color-primary)]')} />
                <span>{PROJECT_SECTION_LABEL[section]}</span>
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}

function ProjectPicker({
  projects,
  active,
  onPick,
  onNavigate,
}: {
  projects: Array<{ id: string; name: string }>;
  active: { id: string; name: string } | null;
  onPick: (id: string) => void;
  onNavigate?: () => void;
}) {
  if (projects.length === 0) {
    return (
      <Link
        href="/projects/new"
        onClick={onNavigate}
        className="flex items-center gap-2 rounded-xl border border-dashed border-[var(--color-border)] px-3 py-2.5 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
      >
        <IconPlus className="h-3.5 w-3.5" />
        Crea tu primer proyecto
      </Link>
    );
  }

  return (
    <details className="group/picker relative">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2.5 text-sm hover:bg-[var(--color-accent)]/60">
        <span className="flex min-w-0 items-center gap-2">
          <IconFolder className="h-4 w-4 shrink-0 text-[var(--color-primary)]" />
          <span className="truncate font-medium">{active?.name ?? 'Elige un proyecto'}</span>
        </span>
        <IconChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-open/picker:rotate-180" />
      </summary>
      <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] py-1 shadow-xl">
        {projects.map((p) => (
          <button
            key={p.id}
            onClick={() => onPick(p.id)}
            className={cn(
              'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs',
              p.id === active?.id
                ? 'bg-[var(--color-accent)] text-[var(--color-foreground)]'
                : 'hover:bg-[var(--color-accent)]/60',
            )}
          >
            <span className="truncate">{p.name}</span>
          </button>
        ))}
        <Link
          href="/projects/new"
          onClick={onNavigate}
          className="mt-1 flex items-center gap-2 border-t border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-primary)] hover:bg-[var(--color-accent)]"
        >
          <IconPlus className="h-3 w-3" />
          Nuevo proyecto
        </Link>
      </div>
    </details>
  );
}
