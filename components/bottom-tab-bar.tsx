'use client';

import { usePathname, useRouter } from 'next/navigation';
import { IconHome, IconChat, IconPlug, IconTarget, IconMenu } from '@/components/icons';
import { cn } from '@/lib/utils';
import { useProjects } from './projects-provider';
import { canSeeSection, type ProjectSection } from '@/src/projects/types';

/**
 * La barra de abajo en móvil lleva a las cuatro secciones del PROYECTO activo,
 * no a rutas globales: en el celular es la navegación principal y tiene que
 * apuntar al mismo sitio que el menú lateral.
 *
 * Un `conector` solo ve Conexiones: la barra le muestra lo que puede abrir, no
 * cuatro botones que le van a contestar 403.
 */
const TABS: Array<{ section: ProjectSection; label: string; Icon: React.ElementType }> = [
  { section: 'inicio', label: 'Inicio', Icon: IconHome },
  { section: 'leads', label: 'Leads', Icon: IconTarget },
  { section: 'conversaciones', label: 'Chats', Icon: IconChat },
  { section: 'conexiones', label: 'Conexiones', Icon: IconPlug },
];

export function BottomTabBar({ onMore }: { onMore: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { active } = useProjects();

  const tabs = active
    ? TABS.filter((t) => canSeeSection(active.role, t.section)).map((t) => ({
        ...t,
        href: t.section === 'inicio' ? `/projects/${active.id}` : `/projects/${active.id}/${t.section}`,
      }))
    : [{ ...TABS[0], href: '/projects', label: 'Proyectos' }];

  /**
   * Inicio es el prefijo de todas las demás (`/projects/<id>` vs
   * `/projects/<id>/leads`), así que con un `startsWith` a secas se encendían
   * DOS pestañas a la vez. Inicio se compara exacto.
   */
  const estaActiva = (href: string, esInicio: boolean) =>
    esInicio ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav className="tabbar-safe fixed inset-x-0 bottom-0 z-40 lg:hidden" aria-label="Navegación principal">
      <div className="mx-3 mb-2 flex items-center justify-between gap-1 rounded-[26px] border border-white/40 bg-white/70 px-2 py-2 shadow-[0_8px_30px_rgba(107,37,69,0.14)] backdrop-blur-xl">
        {tabs.map(({ href, label, Icon, section }) => {
          const activo = estaActiva(href, section === 'inicio');
          return (
            <button
              key={href}
              onClick={() => router.push(href)}
              className={cn(
                'flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-1.5 transition-colors',
                activo
                  ? 'bg-gradient-to-br from-[var(--color-brand-1)] to-[var(--color-brand-3)] text-white shadow-sm'
                  : 'text-[var(--color-muted-foreground)]',
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-medium leading-none">{label}</span>
            </button>
          );
        })}
        <button
          onClick={onMore}
          className="flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[var(--color-muted-foreground)]"
        >
          <IconMenu className="h-5 w-5" />
          <span className="text-[10px] font-medium leading-none">Más</span>
        </button>
      </div>
    </nav>
  );
}
