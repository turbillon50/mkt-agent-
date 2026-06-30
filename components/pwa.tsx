'use client';

import { useEffect, useState } from 'react';
import { IconDownload, IconShare } from '@/components/icons';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export function PWABoot() {
  const [installEvt, setInstallEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showIOSHint, setShowIOSHint] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }

    const ua = navigator.userAgent || '';
    const iOS = /iPad|iPhone|iPod/.test(ua) && !/MSStream/.test(ua);
    setIsIOS(iOS);

    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // @ts-expect-error iOS Safari quirk
      window.navigator.standalone === true;
    setIsStandalone(standalone);

    function onBIP(e: Event) {
      e.preventDefault();
      setInstallEvt(e as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setInstallEvt(null);
    }
    window.addEventListener('beforeinstallprompt', onBIP);
    window.addEventListener('appinstalled', onInstalled);

    if (iOS && !standalone) {
      const dismissed = localStorage.getItem('goossip-ios-install-dismissed');
      if (!dismissed) {
        const t = setTimeout(() => setShowIOSHint(true), 2500);
        return () => {
          window.removeEventListener('beforeinstallprompt', onBIP);
          window.removeEventListener('appinstalled', onInstalled);
          clearTimeout(t);
        };
      }
    }
    return () => {
      window.removeEventListener('beforeinstallprompt', onBIP);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (isStandalone) return null;

  if (installEvt) {
    return (
      <button
        onClick={async () => {
          await installEvt.prompt();
          await installEvt.userChoice;
          setInstallEvt(null);
        }}
        className="btn-brand fixed bottom-4 right-4 z-50 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold hover:opacity-95"
      >
        <IconDownload className="h-4 w-4" />
        Instalar Goossip
      </button>
    );
  }

  if (showIOSHint && isIOS) {
    return (
      <div className="fixed inset-x-3 bottom-3 z-50 rounded-2xl border border-[var(--color-primary)]/25 bg-[var(--color-card)]/95 p-4 shadow-2xl shadow-[var(--color-primary)]/10 backdrop-blur">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[var(--color-brand-1)] to-[var(--color-brand-3)] text-white">
            <IconShare className="h-4 w-4" />
          </div>
          <div className="flex-1 text-sm">
            <p className="font-medium">Instala Goossip en tu iPhone</p>
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
              Tap el botón <IconShare className="inline h-3 w-3 align-middle" /> (Compartir) y luego{' '}
              <b>Añadir a pantalla de inicio</b>. Va a abrir en pantalla completa, como app nativa.
            </p>
            <button
              onClick={() => {
                localStorage.setItem('goossip-ios-install-dismissed', '1');
                setShowIOSHint(false);
              }}
              className="mt-3 text-xs text-[var(--color-primary)] hover:underline"
            >
              No volver a mostrar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
