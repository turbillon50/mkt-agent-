'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';
import {
  IconBarChart,
  IconCalendar,
  IconChat,
  IconFolder,
  IconShield,
  IconUsers,
} from '@/components/icons';
import { cn } from '@/lib/utils';
import { OrgSwitcher } from './orgs/org-switcher';
import { ProjectNav } from './project-nav';

const clerkPK = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';
const isClerkConfiguredClient =
  /^pk_(test|live)_[A-Za-z0-9_-]{10,}$/.test(clerkPK) && !clerkPK.includes('REPLACE_ME');

/**
 * El menú, de arriba abajo, es la arquitectura de Goossip:
 *
 *   ORGANIZACIÓN  → el tenant (Clerk)
 *   PROYECTO      → la unidad de trabajo: se elige uno
 *   SECCIONES     → lo que ese proyecto tiene adentro
 *   HERRAMIENTAS  → lo que es de la organización entera, no de un proyecto
 *
 * Antes era una lista plana de quince módulos con el proyecto de adorno. El
 * bloque de "Redes conectadas" que vivía aquí abajo se fue: pintaba puntitos
 * fijos en el código que no miraban ninguna conexión real. Lo que hay de verdad
 * está en Conexiones, dentro del proyecto.
 */

type Item = { href: string; label: string; Icon: React.ElementType };

const HERRAMIENTAS: Item[] = [
  { href: '/chat', label: 'Chat', Icon: IconChat },
  { href: '/projects', label: 'Todos los proyectos', Icon: IconFolder },
  { href: '/prospectos', label: 'Prospección', Icon: IconUsers },
  { href: '/competencia', label: 'Competencia', Icon: IconBarChart },
  { href: '/plan', label: 'Calendario', Icon: IconCalendar },
  { href: '/organizacion', label: 'Mi organización', Icon: IconUsers },
];

/** Solo para `users.is_admin`: el dueño de la APLICACIÓN, no de una org. */
const ADMIN: Item = { href: '/admin', label: 'Administración', Icon: IconShield };

export function Sidebar({ onNavigate, isAdmin = false }: { onNavigate?: () => void; isAdmin?: boolean }) {
  const pathname = usePathname();
  const herramientas = isAdmin ? [ADMIN, ...HERRAMIENTAS] : HERRAMIENTAS;

  return (
    <div className="glass flex h-full w-full flex-col gap-4 p-4">
      <div className="flex items-center gap-2.5 px-2 pt-2">
        <div className="relative grid h-9 w-9 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-[var(--color-brand-1)] to-[var(--color-brand-3)] text-white shadow-lg shadow-[var(--color-primary)]/20">
          <svg viewBox="0 0 24 24" fill="none" className="relative z-10 h-5 w-5">
            <path
              d="M4 11a8 8 0 1 1 3.1 6.3L4 18l1-3.1A7.96 7.96 0 0 1 4 11z"
              stroke="currentColor"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="11" r="2" fill="currentColor" />
          </svg>
          <span className="absolute inset-0 bg-gradient-to-br from-white/25 to-transparent" />
        </div>
        <div className="text-[1.6rem] font-semibold leading-none tracking-tight brand-gradient">goossip</div>
      </div>

      {/* Primero la ORG (el tenant), luego el proyecto dentro de ella. */}
      <OrgSwitcher />

      <ProjectNav onNavigate={onNavigate} />

      <div className="flex flex-col gap-0.5 border-t border-[var(--color-border)] pt-3">
        {herramientas.map(({ href, label, Icon }) => {
          // `/projects` es prefijo de `/projects/<id>/…`, así que con un
          // `startsWith` a secas "Todos los proyectos" se quedaba encendido
          // mientras navegabas DENTRO de un proyecto, al mismo tiempo que su
          // sección. Se compara exacto.
          const activo = href === '/projects' ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-1.5 text-xs transition-colors',
                activo
                  ? 'bg-[var(--color-accent)] text-[var(--color-foreground)]'
                  : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]/60 hover:text-[var(--color-foreground)]',
              )}
            >
              <Icon className={cn('h-4 w-4', activo && 'text-[var(--color-primary)]')} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>

      <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-3">
        {isClerkConfiguredClient ? (
          <UserButton />
        ) : (
          <div className="grid h-8 w-8 place-items-center rounded-full bg-[var(--color-accent)] text-xs font-semibold text-[var(--color-primary)]">
            G
          </div>
        )}
      </div>
    </div>
  );
}
