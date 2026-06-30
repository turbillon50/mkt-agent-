import { ComentariosWorkspace } from '@/components/comentarios/workspace';

export const dynamic = 'force-dynamic';

export default function ComentariosPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Venta por comentario</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Detecta palabras de compra ("quiero", "precio", "info"…) en los comentarios de tus redes y responde
          automático con tu mensaje + link de pago. Cada comentarista se guarda como lead nuevo con fuente comentario.
        </p>
      </header>
      <ComentariosWorkspace />
    </div>
  );
}
