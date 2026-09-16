import Link from 'next/link';
import { IconArrowLeft } from '@/components/icons';
import { PROJECT_ROLE_LABEL, type ProjectRole } from '@/src/projects/types';
import { PROJECT_KIND_LABEL, type ProjectKind } from '@/src/sales/types';

/**
 * Encabezado común de las secciones del proyecto: en qué proyecto estás, qué
 * eres aquí y qué estás mirando. Lo mismo en las diez secciones, para que nadie
 * tenga que adivinar en cuál de sus tres clientes está escribiendo.
 */
export function ProjectHeader({
  projectId,
  name,
  kind,
  role,
  section,
  description,
  action,
}: {
  projectId: string;
  name: string;
  kind: ProjectKind;
  role: ProjectRole;
  section: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="space-y-2">
      <Link
        href={`/projects/${projectId}`}
        className="inline-flex items-center gap-1 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      >
        <IconArrowLeft className="h-3 w-3" />
        {name}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">{section}</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {description ?? `${PROJECT_KIND_LABEL[kind] ?? kind} · eres ${PROJECT_ROLE_LABEL[role].toLowerCase()} aquí`}
          </p>
        </div>
        {action}
      </div>
    </header>
  );
}
