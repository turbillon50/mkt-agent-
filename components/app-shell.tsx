'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { IconClose, IconLogoMark } from '@/components/icons';
import { Sidebar } from './sidebar';
import { BottomTabBar } from './bottom-tab-bar';
import { ProjectsProvider } from './projects-provider';
import { AssistantDrawer } from './assistant/assistant-drawer';
import { AssistantPanel } from './assistant/assistant-panel';
import { panelBoot, PANEL_DEFAULT } from './assistant/panel-prefs';
import { SIDEBAR_BOOT } from './sidebar-prefs';
import { cn } from '@/lib/utils';

/** Lo que el servidor sabe del panel antes de que el navegador diga nada. */
export interface PanelInicial {
  ancho: number;
  plegado: boolean;
  autonomia: 'propone' | 'publica';
}

export function AppShell({
  children,
  isAdmin = false,
  orgName,
  panel,
}: {
  children: React.ReactNode;
  isAdmin?: boolean;
  orgName?: string;
  panel?: PanelInicial;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    // Una sola lista de proyectos para todo el shell: el menú lateral y la
    // barra de abajo miran la misma, así no se contradicen.
    <ProjectsProvider>
      {/*
        Corre ANTES del primer pintado y deja el ancho y el plegado del menú
        puestos en el `<html>`. Con un efecto de React el menú se pintaría de
        264 px abierto y saltaría al estado guardado en cada navegación.
      */}
      <script dangerouslySetInnerHTML={{ __html: SIDEBAR_BOOT }} />
      {/*
        Lo mismo para el panel de Goossip, con una diferencia: aquí el valor de
        respaldo lo manda el SERVIDOR (`users.settings`). `localStorage` no
        existe la primera vez que alguien entra desde otra máquina, y ahí es
        donde el panel tiene que nacer como lo dejó, no en 360 px.
      */}
      <script
        dangerouslySetInnerHTML={{
          __html: panelBoot({
            ancho: panel?.ancho ?? PANEL_DEFAULT,
            plegado: panel?.plegado ?? false,
          }),
        }}
      />
      <div className="flex min-h-screen flex-col lg:flex-row">
        {/* Barra superior en móvil — respeta el notch/isla dinámica de verdad */}
        <header className="header-safe sticky top-0 z-30 flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-background)]/90 backdrop-blur-xl lg:hidden">
          <div className="flex items-center gap-2 px-4 py-3">
            <div className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-[var(--color-brand-1)] to-[var(--color-brand-3)] text-white">
              <IconLogoMark className="h-4 w-4" />
            </div>
            <span className="text-lg font-semibold tracking-tight brand-gradient">goossip</span>
          </div>
          {orgName && (
            <span className="max-w-[45%] truncate px-4 py-3 text-xs text-[var(--color-muted-foreground)]">
              {orgName}
            </span>
          )}
        </header>

        {/*
          Menú lateral. En celular es el cajón de siempre (se abre desde el
          botón "Más" de la barra de abajo) con su ancho fijo: esta corrida no
          toca el móvil. De 1024 px para arriba el ancho lo manda
          `--sidebar-w`, que escribe el script de arranque y mueve el arrastre
          del borde — por eso va en `style` y no en una clase de Tailwind: es un
          número que cambia en tiempo real, no uno de doce que existan de antes.
        */}
        <aside
          style={{ ['--aside-w' as string]: 'var(--sidebar-w, 264px)' }}
          className={cn(
            'sidebar-aside fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw] shrink-0 border-r border-[var(--color-border)] transition-transform duration-200 ease-out',
            // En celular el cajón va OPACO. El menú está vestido de `glass`
            // (blanco al 70 %), que se ve bien pegado a la columna de
            // escritorio y encima del contenido se vuelve ilegible: en la
            // captura de móvil se leían los números del panel ATRAVESADOS
            // entre los renglones del menú.
            'bg-[var(--color-background-elevated)] lg:bg-transparent',
            'lg:sticky lg:top-0 lg:h-[100dvh] lg:w-[var(--aside-w)] lg:max-w-none lg:translate-x-0',
            open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          )}
        >
          <div className="flex h-full flex-col">
            {open && (
              <button
                aria-label="Cerrar menú"
                onClick={() => setOpen(false)}
                className="absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-md text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] lg:hidden"
                style={{ marginTop: 'env(safe-area-inset-top)' }}
              >
                <IconClose className="h-4 w-4" />
              </button>
            )}
            <Sidebar onNavigate={() => setOpen(false)} isAdmin={isAdmin} />
          </div>
        </aside>

        {open && (
          <button
            aria-label="Cerrar"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 bg-[var(--color-foreground)]/30 backdrop-blur-sm lg:hidden"
          />
        )}

        <main className="flex-1 overflow-x-hidden px-4 py-6 pb-28 lg:p-8 lg:pb-8">{children}</main>

        <BottomTabBar onMore={() => setOpen(true)} />

        {/*
          Goossip vive AQUÍ, en el shell, y no en una sección: por eso está en
          las diez pantallas. Va dentro del `ProjectsProvider` porque siempre es
          el Goossip de un proyecto — el activo.

          Son DOS montajes y uno solo se ve a la vez, lo decide CSS:
          · `AssistantPanel` es la tercera columna, de 1280 px para arriba. Es
            hermano de `<main>` en el mismo `flex`, que es lo que hace que el
            contenido se REACOMODE en vez de quedar tapado.
          · `AssistantDrawer` es el cajón de celular de siempre, intacto.

          Decidirlo con CSS y no con un `useMediaQuery` es a propósito: un hook
          pinta primero uno, luego el otro, y ese salto se ve en cada carga.
        */}
        <AssistantPanel inicialAutonomia={panel?.autonomia} />
        <AssistantDrawer />
      </div>
    </ProjectsProvider>
  );
}
