'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { IconClose, IconLogoMark } from '@/components/icons';
import { Sidebar } from './sidebar';
import { BottomTabBar } from './bottom-tab-bar';
import { cn } from '@/lib/utils';

export function AppShell({ children }: { children: React.ReactNode }) {
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
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Mobile top bar — respeta el notch/isla dinámica de verdad */}
      <header className="header-safe sticky top-0 z-30 flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-background)]/90 backdrop-blur-xl lg:hidden">
        <div className="flex items-center gap-2 px-4 py-3">
          <div className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-[var(--color-brand-1)] to-[var(--color-brand-3)] text-white">
            <IconLogoMark className="h-4 w-4" />
          </div>
          <span className="text-lg font-semibold tracking-tight brand-gradient">goossip</span>
        </div>
      </header>

      {/* Sidebar — se abre desde el boton "Mas" del tab bar en movil */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw] shrink-0 border-r border-[var(--color-border)] transition-transform duration-200 ease-out',
          'lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:translate-x-0',
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
          <Sidebar onNavigate={() => setOpen(false)} />
        </div>
      </aside>

      {/* Backdrop on mobile */}
      {open && (
        <button
          aria-label="Cerrar"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-[var(--color-foreground)]/30 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* Main */}
      <main className="flex-1 overflow-x-hidden px-4 py-6 pb-28 lg:p-8 lg:pb-8">{children}</main>

      {/* Tab bar inferior — solo movil */}
      <BottomTabBar onMore={() => setOpen(true)} />
    </div>
  );
}

