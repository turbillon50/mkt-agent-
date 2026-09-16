'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  IconBarChart,
  IconBolt,
  IconBrain,
  IconCalendar,
  IconChat,
  IconChevronDown,
  IconFile,
  IconFolder,
  IconHome,
  IconMegaphone,
  IconPalette,
  IconPlug,
  IconPlus,
  IconSettings,
  IconTarget,
  IconUsers,
} from '@/components/icons';
import { cn } from '@/lib/utils';
import {
  canSeeSection,
  PROJECT_SECTION_LABEL,
  type ProjectSection,
} from '@/src/projects/types';
import { useProjects, type ProjectSummary } from './projects-provider';

/**
 * La zona de navegación del menú: primero CUÁL proyecto, después QUÉ hay dentro.
 *
 * Esta es la caja que arregla el bug que señaló Luis. Antes era
 * `flex-1` DENTRO de otro contenedor que ya tenía altura fija, así que se
 * quedaba con lo que sobrara — unos 40 px — y la lista de diez secciones
 * scrolleaba de a un renglón. Ahora es el ÚNICO elemento que crece
 * (`flex-1 min-h-0 overflow-y-auto`) dentro de un menú de `100dvh`, y no hay
 * ninguna otra caja con scroll adentro.
 */

const SECTION_ICON: Record<ProjectSection, React.ElementType> = {
  inicio: IconHome,
  leads: IconTarget,
  conversaciones: IconChat,
  // Megáfono, no gráfica de barras: la gráfica ya es Competencia y dos
  // secciones con el mismo ícono se leen como la misma cosa.
  campanas: IconMegaphone,
  contenido: IconFile,
  marca: IconPalette,
  automatizaciones: IconBolt,
  conocimiento: IconBrain,
  conexiones: IconPlug,
  equipo: IconUsers,
  ajustes: IconSettings,
};

/** Lo que hay ARRIBA del separador: el trabajo del día. */
const SECCIONES: ProjectSection[] = [
  'inicio',
  'leads',
  'conversaciones',
  'campanas',
  'contenido',
  'marca',
  'automatizaciones',
  'conocimiento',
];

/** Lo que hay ABAJO, bajo la etiqueta "Proyecto": cómo está armado. */
const DEL_PROYECTO: ProjectSection[] = ['conexiones', 'equipo', 'ajustes'];

/** Herramientas de la organización entera, no de un proyecto. */
const DE_LA_ORG = [
  { href: '/projects', label: 'Todos los proyectos', Icon: IconFolder },
  { href: '/prospectos', label: 'Prospección', Icon: IconUsers },
  { href: '/competencia', label: 'Competencia', Icon: IconBarChart },
  { href: '/plan', label: 'Calendario', Icon: IconCalendar },
];

interface Badges {
  leads: number;
  conversaciones: number;
  automatizaciones: number;
  conexiones: { estado: 'verde' | 'ambar' | 'rojo'; conectados: number; conectables: number };
}

const SALUD_COLOR: Record<Badges['conexiones']['estado'], string> = {
  verde: 'bg-[var(--color-success)]',
  ambar: 'bg-amber-500',
  rojo: 'bg-[var(--color-destructive)]',
};

const SALUD_TEXTO: Record<Badges['conexiones']['estado'], string> = {
  verde: 'Todos tus canales están conectados',
  ambar: 'Te faltan canales por conectar',
  rojo: 'No tienes ningún canal conectado',
};

export function ProjectNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { projects, active, loading, setActiveId } = useProjects();
  const badges = useBadges(active?.id ?? null);

  const base = active ? `/projects/${active.id}` : null;
  const href = (s: ProjectSection) => (s === 'inicio' ? base! : `${base}/${s}`);

  /**
   * "Inicio" es prefijo de todas las demás (`/projects/<id>` vs
   * `/projects/<id>/leads`), así que con un `startsWith` a secas se encendían
   * dos renglones a la vez. Inicio se compara exacto.
   */
  const activo = (h: string, exacto = false) =>
    exacto ? pathname === h : pathname === h || pathname.startsWith(`${h}/`);

  /** Cuánto falta por atender en cada sección. Cero no se pinta. */
  const badgeDe = (s: ProjectSection): number | null => {
    if (!badges) return null;
    const n =
      s === 'leads'
        ? badges.leads
        : s === 'conversaciones'
          ? badges.conversaciones
          : s === 'automatizaciones'
            ? badges.automatizaciones
            : 0;
    return n > 0 ? n : null;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-3 pb-2">
        <ProjectPicker
          projects={projects}
          active={active}
          loading={loading}
          onPick={(id) => {
            setActiveId(id);
            onNavigate?.();
          }}
          onNavigate={onNavigate}
        />
      </div>

      {/*
        LA zona con scroll. Una sola, del alto que quede. Nada de altura fija ni
        de listas con `max-height` propia adentro: eso era el bug.
      */}
      <nav
        aria-label="Secciones"
        className="min-h-0 flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden px-3 pb-3"
      >
        {active ? (
          <>
            {SECCIONES.filter((s) => canSeeSection(active.role, s)).map((s) => (
              <Fila
                key={s}
                href={href(s)}
                label={PROJECT_SECTION_LABEL[s]}
                Icon={SECTION_ICON[s]}
                activo={activo(href(s), s === 'inicio')}
                badge={badgeDe(s)}
                onNavigate={onNavigate}
              />
            ))}

            {/*
              El Asistente ya NO es un renglón del menú (corrida 6). Vive en el
              cajón de la derecha de TODAS las pantallas, con ⌘K. Mandarlo a su
              propia ruta obligaba a salirte de donde estabas para preguntarle
              algo, y —lo grave— el chat de esa ruta era global: no sabía de qué
              cliente le estaban hablando y publicaba con la cuenta de la casa.
            */}
            <Etiqueta>Proyecto</Etiqueta>
            {DEL_PROYECTO.filter((s) => canSeeSection(active.role, s)).map((s) => (
              <Fila
                key={s}
                href={href(s)}
                label={PROJECT_SECTION_LABEL[s]}
                Icon={SECTION_ICON[s]}
                activo={activo(href(s))}
                onNavigate={onNavigate}
                punto={
                  s === 'conexiones' && badges
                    ? { color: SALUD_COLOR[badges.conexiones.estado], texto: SALUD_TEXTO[badges.conexiones.estado] }
                    : undefined
                }
              />
            ))}
          </>
        ) : (
          !loading && (
            <p className="sidebar-label px-2 py-3 text-xs text-[var(--color-muted-foreground)]">
              Crea tu primer proyecto para empezar.
            </p>
          )
        )}

        <Etiqueta>Organización</Etiqueta>
        {DE_LA_ORG.map(({ href: h, label, Icon }) => (
          <Fila
            key={h}
            href={h}
            label={label}
            Icon={Icon}
            // `/projects` es prefijo de `/projects/<id>/…`: con `startsWith` se
            // quedaba encendido mientras navegabas DENTRO de un proyecto, al
            // mismo tiempo que su sección.
            activo={activo(h, h === '/projects')}
            onNavigate={onNavigate}
          />
        ))}
      </nav>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Etiqueta({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-3">
      <div className="mb-1 h-px bg-[var(--color-border)]" />
      <p className="sidebar-label px-2 pb-1 text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
        {children}
      </p>
    </div>
  );
}

function Fila({
  href,
  label,
  Icon,
  activo,
  badge,
  punto,
  onNavigate,
}: {
  href: string;
  label: string;
  Icon: React.ElementType;
  activo: boolean;
  badge?: number | null;
  punto?: { color: string; texto: string };
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={activo ? 'page' : undefined}
      /*
       * `title` nativo y no un globito de CSS. Lo intentamos con uno propio y se
       * veía RECORTADO en la captura: la zona de navegación scrollea
       * (`overflow-y:auto`), y en CSS eso obliga a recortar también en
       * horizontal — un globito que sale por el borde derecho se corta a la
       * mitad. El del navegador se pinta fuera del documento y no lo recorta
       * nadie. De pilón sirve plegado y abierto, donde caza los nombres largos
       * que el `truncate` deja a medias.
       */
      title={label}
      className={cn(
        'sidebar-fila relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
        activo
          ? 'fill-ghost-selected'
          : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]/60 hover:text-[var(--color-foreground)]',
      )}
    >
      <Icon className={cn('h-4 w-4 shrink-0', activo && 'text-[var(--color-primary)]')} />
      <span className="sidebar-label min-w-0 flex-1 truncate">{label}</span>

      {punto && (
        <span
          title={punto.texto}
          aria-label={punto.texto}
          className={cn('sidebar-badge block h-2 w-2 shrink-0 rounded-full', punto.color)}
        />
      )}

      {typeof badge === 'number' && badge > 0 && (
        <span className="sidebar-badge min-w-[1.25rem] shrink-0 rounded-full bg-[var(--color-primary)] px-1.5 py-0.5 text-center text-[10px] font-semibold leading-none text-[var(--color-primary-foreground)]">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  );
}

// ---------------------------------------------------------------------------

function ProjectPicker({
  projects,
  active,
  loading,
  onPick,
  onNavigate,
}: {
  projects: ProjectSummary[];
  active: ProjectSummary | null;
  loading: boolean;
  onPick: (id: string) => void;
  onNavigate?: () => void;
}) {
  if (loading) {
    return <div className="skeleton h-9 w-full" />;
  }

  if (projects.length === 0) {
    return (
      <Link
        href="/projects/new"
        onClick={onNavigate}
        title="Nuevo proyecto"
        className="sidebar-fila flex items-center gap-2 rounded-lg border border-dashed border-[var(--color-border)] px-2.5 py-2 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
      >
        <IconPlus className="h-4 w-4 shrink-0" />
        <span className="sidebar-label truncate">Nuevo proyecto</span>
      </Link>
    );
  }

  return (
    <details className="group/picker relative">
      <summary
        title={active?.name ?? 'Elige un proyecto'}
        className="sidebar-fila flex cursor-pointer list-none items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-2.5 py-2 text-sm hover:bg-[var(--color-accent)]/60"
      >
        <IconFolder className="h-4 w-4 shrink-0 text-[var(--color-primary)]" />
        <span className="sidebar-label min-w-0 flex-1 truncate font-medium">
          {active?.name ?? 'Elige un proyecto'}
        </span>
        <IconChevronDown className="sidebar-label h-3.5 w-3.5 shrink-0 transition-transform group-open/picker:rotate-180" />
      </summary>
      {/*
        El desplegable es `absolute`: flota SOBRE el menú en vez de empujarlo.
        Si creciera dentro del flujo, veinte proyectos volverían a comerse la
        zona de navegación — que es exactamente el bug que se vino a arreglar.
        Su `max-h` no es un scroll anidado dentro de la navegación: vive fuera
        del flujo, encima de todo.
      */}
      <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] py-1 shadow-xl">
        {projects.map((p) => (
          <button
            key={p.id}
            onClick={() => onPick(p.id)}
            className={cn(
              'flex w-full items-center gap-2 px-3 py-2 text-left text-xs',
              p.id === active?.id
                ? 'fill-ghost-selected'
                : 'hover:bg-[var(--color-accent)]/60',
            )}
          >
            <span className="truncate">{p.name}</span>
          </button>
        ))}
        {/* EL botón principal del menú. "Nueva campaña" no vive aquí: vive
            dentro de la sección Campañas del proyecto, que es otro nivel. */}
        <Link
          href="/projects/new"
          onClick={onNavigate}
          className="mt-1 flex items-center gap-2 border-t border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-primary)] hover:bg-[var(--color-accent)]"
        >
          <IconPlus className="h-3.5 w-3.5" />
          Nuevo proyecto
        </Link>
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------

/**
 * Los números del menú, del proyecto activo.
 *
 * Se piden cuando cambia el proyecto Y cuando cambia la ruta: mover un lead a
 * "contactado" tiene que apagar el badge de Leads sin que nadie recargue. No
 * hay `setInterval`: una pestaña abierta toda la tarde no va a pegarle a la
 * base cada treinta segundos para pintar un número que nadie está mirando.
 */
function useBadges(projectId: string | null): Badges | null {
  const pathname = usePathname();
  const [badges, setBadges] = useState<Badges | null>(null);

  useEffect(() => {
    if (!projectId) {
      setBadges(null);
      return;
    }
    let vivo = true;
    fetch(`/api/projects/${projectId}/badges`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        // Si la respuesta llega después de que cambiaron de proyecto, se tira:
        // pintar los números del proyecto anterior es peor que no pintar nada.
        if (vivo && d?.badges) setBadges(d.badges);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [projectId, pathname]);

  return badges;
}
