'use client';

import Link from 'next/link';
import { UserButton, useUser } from '@clerk/nextjs';
import {
  IconChevronDown,
  IconLogoMark,
  IconSettings,
  IconShield,
} from '@/components/icons';
import { cn } from '@/lib/utils';
import { OrgSwitcher } from './orgs/org-switcher';
import { ProjectNav } from './project-nav';
import { useSidebarPrefs } from './sidebar-prefs';

const clerkPK = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';
const isClerkConfiguredClient =
  /^pk_(test|live)_[A-Za-z0-9_-]{10,}$/.test(clerkPK) && !clerkPK.includes('REPLACE_ME');

/**
 * El menú lateral, de arriba abajo, ES la arquitectura de Goossip:
 *
 *   ORGANIZACIÓN → PROYECTO → las secciones de ESE proyecto
 *
 * Tres cosas se corrigieron de raíz en la corrida 4:
 *
 * 1. UN SOLO SCROLL. Antes la lista de navegación vivía en una caja con altura
 *    propia; entre el logo, un botón gigante y dos selectores le quedaban unos
 *    40 px y se veía UN item con una barrita de scroll de juguete. Ahora el
 *    menú entero es `flex column` de `100dvh`: cabecera y pie con la altura que
 *    piden, y en medio una zona `flex-1 min-h-0 overflow-y-auto` que se lleva
 *    todo lo que sobra. Dentro de esa zona no hay ninguna otra caja con scroll.
 *
 * 2. ANCHO AJUSTABLE (200–320 px) y PLEGADO a 64 px, los dos guardados. Ver
 *    `sidebar-prefs`: el ancho es una variable CSS y el plegado un atributo del
 *    `<html>`, no estado de React, para que no parpadeen en cada navegación.
 *
 * 3. Se fue lo que no servía: el botón gigante de "Nuevo chat" (el chat es una
 *    sección más), la lista de "Redes conectadas" con puntitos que no miraban
 *    ninguna conexión real, "Mi organización" suelto y la etiqueta PRO.
 *
 * Alcance: ESCRITORIO (≥1024 px). En celular este mismo componente se pinta
 * dentro del cajón de siempre, con todo abierto, y la barra de abajo sigue
 * siendo la navegación principal. La adaptación móvil es otra corrida.
 */
export function Sidebar({
  onNavigate,
  isAdmin = false,
}: {
  onNavigate?: () => void;
  isAdmin?: boolean;
}) {
  const { collapsed, toggle, startDrag, dragging } = useSidebarPrefs();

  return (
    // Sin `overflow-hidden`: el tirador del ancho sobresale 3 px por el borde
    // derecho y el globito del menú plegado sale entero fuera del menú. Con
    // overflow recortado, el tirador quedaba de 3 px (imposible de agarrar) y
    // el globito salía cortado a la mitad.
    <div className="glass relative flex h-full w-full flex-col lg:h-[100dvh]">
      {/* ---- cabecera: altura natural, no se mueve ---- */}
      <header className="shrink-0 space-y-3 p-3">
        <Link
          href="/projects"
          onClick={onNavigate}
          className="sidebar-fila flex items-center gap-2 rounded-lg px-1.5 py-1"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[var(--color-brand-1)] to-[var(--color-brand-3)] text-white shadow-lg shadow-[var(--color-primary)]/20">
            <IconLogoMark className="h-4 w-4" />
          </span>
          <span className="sidebar-label truncate text-xl font-semibold leading-none tracking-tight brand-gradient">
            goossip
          </span>
        </Link>

        {/* Primero la ORG (el tenant), luego el proyecto dentro de ella. */}
        <div className="flex items-center gap-1.5">
          <div className="min-w-0 flex-1">
            <OrgSwitcher />
          </div>
          {/*
            "Mi organización" dejó de ser un renglón suelto perdido entre las
            secciones del proyecto — son dos niveles distintos y se leían igual.
            El engrane vive junto al selector de organización, que es donde
            alguien lo busca.
          */}
          <Link
            href="/organizacion"
            onClick={onNavigate}
            title="Ajustes de la organización"
            aria-label="Ajustes de la organización"
            className="sidebar-solo-abierto grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)]"
          >
            <IconSettings className="h-4 w-4" />
          </Link>
        </div>
      </header>

      {/* ---- navegación: UN solo scroll, del alto que quede ---- */}
      <ProjectNav onNavigate={onNavigate} />

      {/* ---- pie: quién eres y, si mandas, el escudo ---- */}
      <footer className="shrink-0 border-t border-[var(--color-border)] p-3">
        <div className="flex items-center gap-2">
          <Usuario />
          {isAdmin && (
            <Link
              href="/admin"
              onClick={onNavigate}
              title="Administración de Goossip"
              aria-label="Administración de Goossip"
              className="sidebar-solo-abierto grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-accent)] hover:text-[var(--color-primary)]"
            >
              <IconShield className="h-4 w-4" />
            </Link>
          )}
        </div>
      </footer>

      {/*
        Plegar / desplegar. Va montado SOBRE el borde derecho y a media altura,
        no en la esquina de abajo: ahí se encimaba con el escudo de /admin del
        pie, y dos botones en el mismo pixel es un botón que nadie aprieta.
      */}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Abrir el menú' : 'Plegar el menú'}
        title={collapsed ? 'Abrir el menú' : 'Plegar el menú'}
        className="absolute -right-3 top-1/2 z-30 hidden h-6 w-6 -translate-y-1/2 place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-muted-foreground)] shadow-sm transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] lg:grid"
      >
        <IconChevronDown
          className={cn('h-3.5 w-3.5 transition-transform', collapsed ? '-rotate-90' : 'rotate-90')}
        />
      </button>

      {/* ---- tirador del ancho ---- */}
      <span
        role="separator"
        aria-orientation="vertical"
        aria-label="Ajustar el ancho del menú"
        data-arrastrando={dragging ? 'si' : 'no'}
        onPointerDown={startDrag}
        className="sidebar-grip hidden lg:block"
      />
    </div>
  );
}

/**
 * El pie: avatar e iniciales con el nombre al lado.
 *
 * El avatar es el `UserButton` de Clerk y no un círculo pintado a mano: es el
 * único camino a "cerrar sesión" y a los datos de la cuenta, y reimplementarlo
 * sería tener dos verdades sobre quién está adentro. Colapsado no enseña texto,
 * así que no mete ni una palabra en inglés al menú.
 */
function Usuario() {
  const { user, isLoaded } = useUser();

  if (!isClerkConfiguredClient) {
    return (
      <div className="sidebar-fila flex min-w-0 flex-1 items-center gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--color-accent)] text-xs font-semibold text-[var(--color-primary)]">
          G
        </span>
        <span className="sidebar-label truncate text-xs text-[var(--color-muted-foreground)]">
          Sin sesión
        </span>
      </div>
    );
  }

  const nombre =
    user?.fullName ?? user?.username ?? user?.primaryEmailAddress?.emailAddress ?? null;

  return (
    <div className="sidebar-fila flex min-w-0 flex-1 items-center gap-2">
      <UserButton />
      <span className="sidebar-label min-w-0 flex-1 truncate text-xs text-[var(--color-muted-foreground)]">
        {isLoaded ? (nombre ?? 'Tu cuenta') : ''}
      </span>
    </div>
  );
}
