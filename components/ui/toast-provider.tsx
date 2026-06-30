'use client';

import * as React from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { IconCheckCircle, IconClose, IconX } from '@/components/icons';
import { cn } from '@/lib/utils';

type ToastVariant = 'success' | 'error' | 'info';

type ToastItem = {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
};

type ToastContextValue = {
  push: (toast: Omit<ToastItem, 'id'>) => void;
};

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>');
  return ctx;
}

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: 'border-[var(--color-primary)]/30 bg-[var(--color-card)]',
  error: 'border-[var(--color-destructive)]/40 bg-[var(--color-card)]',
  info: 'border-[var(--color-border)] bg-[var(--color-card)]',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);

  const push = React.useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = Math.random().toString(36).slice(2);
    setItems((prev) => [...prev, { ...toast, id }]);
  }, []);

  const remove = React.useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      <ToastPrimitive.Provider swipeDirection="right" duration={4000}>
        {children}
        {items.map((t) => (
          <ToastPrimitive.Root
            key={t.id}
            onOpenChange={(open) => !open && remove(t.id)}
            className={cn(
              'data-[state=open]:animate-in data-[state=open]:slide-in-from-right-full data-[state=closed]:animate-out data-[state=closed]:fade-out-80',
              'flex w-full max-w-sm items-start gap-2.5 rounded-xl border p-3.5 shadow-lg',
              VARIANT_STYLES[t.variant],
            )}
          >
            {t.variant === 'success' ? (
              <IconCheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary)]" />
            ) : t.variant === 'error' ? (
              <IconX className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-destructive)]" />
            ) : null}
            <div className="min-w-0 flex-1">
              <ToastPrimitive.Title className="text-sm font-medium text-[var(--color-foreground)]">
                {t.title}
              </ToastPrimitive.Title>
              {t.description && (
                <ToastPrimitive.Description className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                  {t.description}
                </ToastPrimitive.Description>
              )}
            </div>
            <ToastPrimitive.Close className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
              <IconClose className="h-3.5 w-3.5" />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport className="fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2 outline-none sm:bottom-6 sm:right-6" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}
