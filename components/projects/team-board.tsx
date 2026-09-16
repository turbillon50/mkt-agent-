'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast-provider';
import { IconCopy, IconLink, IconPlus, IconTrash } from '@/components/icons';
import {
  PROJECT_ROLE_HELP,
  PROJECT_ROLE_LABEL,
  PROJECT_ROLES,
  type ProjectRole,
} from '@/src/projects/types';

/**
 * El equipo del proyecto y los enlaces de conexión.
 *
 * Dos formas de meter gente, y son distintas a propósito:
 *
 *   · INVITAR — la persona entra a Goossip, a este proyecto, con un rol. Se usa
 *     para quien va a trabajar aquí.
 *   · ENLACE DE CONEXIÓN — la persona NO entra a Goossip. Abre un enlace, da
 *     permiso a su Facebook y se acabó. Es para el community manager del
 *     cliente, que no tiene por qué ver los leads de nadie.
 */

interface Miembro {
  id: string;
  email: string | null;
  role: ProjectRole;
  status: 'invitado' | 'activo';
  joinedAt: string | null;
  esTuyo: boolean;
}

interface Enlace {
  id: string;
  canal: string;
  canalLabel: string;
  nota: string | null;
  estado: 'activo' | 'usado' | 'expirado' | 'cancelado';
  expira: string;
  usadoEn: string | null;
  usadoPor: string | null;
}

const ESTADO_ENLACE: Record<Enlace['estado'], string> = {
  activo: 'Sin usar',
  usado: 'Ya se usó',
  expirado: 'Caducó',
  cancelado: 'Cancelado',
};

export function TeamBoard({ projectId }: { projectId: string }) {
  const { push } = useToast();
  const [miembros, setMiembros] = useState<Miembro[]>([]);
  const [enlaces, setEnlaces] = useState<Enlace[]>([]);
  const [horas, setHoras] = useState(72);
  const [puedeAdministrar, setPuedeAdministrar] = useState(false);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [rol, setRol] = useState<ProjectRole>('editor');
  const [nuevoEnlace, setNuevoEnlace] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const [m, l] = await Promise.all([
        fetch(`/api/projects/${projectId}/members`, { cache: 'no-store' }).then((r) => r.json()),
        fetch(`/api/projects/${projectId}/links`, { cache: 'no-store' }).then((r) => r.json()),
      ]);
      setMiembros(m.members ?? []);
      setPuedeAdministrar(Boolean(m.puedeAdministrar));
      setEnlaces(l.links ?? []);
      if (l.horas) setHoras(l.horas);
    } catch {
      push({ title: 'No se pudo cargar el equipo', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [projectId, push]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function invitar() {
    if (trabajando) return;
    setTrabajando(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), role: rol }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'No se pudo invitar.');
      setEmail('');
      push({
        title: data.aviso ?? `Invitamos a ${data.member.email}`,
        variant: 'success',
      });
      await cargar();
    } catch (e) {
      push({ title: e instanceof Error ? e.message : 'Error', variant: 'error' });
    } finally {
      setTrabajando(false);
    }
  }

  async function cambiarRol(id: string, role: ProjectRole) {
    const res = await fetch(`/api/projects/${projectId}/members/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    const data = await res.json();
    if (!res.ok) {
      push({ title: data.error ?? 'No se pudo cambiar el rol', variant: 'error' });
      return;
    }
    push({ title: 'Rol actualizado', variant: 'success' });
    await cargar();
  }

  async function sacar(id: string, correo: string | null) {
    if (!window.confirm(`¿Sacar a ${correo ?? 'esta persona'} del proyecto?`)) return;
    const res = await fetch(`/api/projects/${projectId}/members/${id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      push({ title: data.error ?? 'No se pudo', variant: 'error' });
      return;
    }
    push({ title: 'Listo', variant: 'success' });
    await cargar();
  }

  async function crearEnlace() {
    setTrabajando(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canal: 'meta' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'No se pudo crear el enlace.');
      setNuevoEnlace(data.url);
      await cargar();
    } catch (e) {
      push({ title: e instanceof Error ? e.message : 'Error', variant: 'error' });
    } finally {
      setTrabajando(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-[var(--color-muted-foreground)]">Cargando el equipo…</p>;
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-3 pt-5">
          <h2 className="font-medium">Quién trabaja en este proyecto</h2>
          {miembros.length === 0 ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Todavía estás tú solo aquí.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {miembros.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{m.email ?? 'Sin correo'}</p>
                    <p className="text-[11px] text-[var(--color-muted-foreground)]">
                      {m.status === 'invitado'
                        ? 'Invitación enviada, todavía no entra'
                        : m.joinedAt
                          ? `Entró el ${new Date(m.joinedAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}`
                          : 'Activo'}
                      {m.esTuyo && ' · eres tú'}
                    </p>
                  </div>
                  {puedeAdministrar && !m.esTuyo ? (
                    <div className="flex items-center gap-2">
                      <select
                        value={m.role}
                        onChange={(e) => void cambiarRol(m.id, e.target.value as ProjectRole)}
                        className="h-8 rounded-md border border-[var(--color-border)] bg-transparent px-2 text-xs"
                      >
                        {PROJECT_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {PROJECT_ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="Sacar del proyecto"
                        onClick={() => void sacar(m.id, m.email)}
                      >
                        <IconTrash className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <span className="rounded-md bg-[var(--color-accent)] px-2 py-0.5 text-[11px]">
                      {PROJECT_ROLE_LABEL[m.role]}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {puedeAdministrar && (
        <>
          <Card className="card-glow">
            <CardContent className="space-y-3 pt-5">
              <h2 className="font-medium">Invitar a alguien</h2>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="correo@empresa.com"
                  type="email"
                />
                <select
                  value={rol}
                  onChange={(e) => setRol(e.target.value as ProjectRole)}
                  className="h-9 rounded-md border border-[var(--color-border)] bg-transparent px-3 text-sm"
                >
                  {PROJECT_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {PROJECT_ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
                <Button className="btn-brand" disabled={trabajando} onClick={() => void invitar()}>
                  <IconPlus className="h-4 w-4" /> Invitar
                </Button>
              </div>
              <p className="text-[11px] text-[var(--color-muted-foreground)]">
                {PROJECT_ROLE_HELP[rol]}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 pt-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-medium">Pedirle a alguien que conecte su Facebook</h2>
                  <p className="text-xs text-[var(--color-muted-foreground)]">
                    Mándale este enlace. Da permiso a su página y listo — no entra al resto de
                    Goossip. Sirve una vez y dura {horas} horas.
                  </p>
                </div>
                <Button variant="outline" disabled={trabajando} onClick={() => void crearEnlace()}>
                  <IconLink className="h-4 w-4" /> Crear enlace
                </Button>
              </div>

              {nuevoEnlace && (
                <div className="space-y-1 rounded-lg bg-[var(--color-accent)]/60 p-3">
                  <p className="text-[11px] font-medium">
                    Cópialo ahora: por seguridad no se vuelve a mostrar.
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded bg-[var(--color-card)] px-2 py-1.5 text-[11px]">
                      {nuevoEnlace}
                    </code>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        void navigator.clipboard.writeText(nuevoEnlace);
                        push({ title: 'Enlace copiado', variant: 'success' });
                      }}
                    >
                      <IconCopy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}

              {enlaces.length > 0 && (
                <ul className="divide-y divide-[var(--color-border)] text-xs">
                  {enlaces.map((l) => (
                    <li key={l.id} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0 truncate">
                        {l.canalLabel}
                        <span className="text-[var(--color-muted-foreground)]">
                          {' · '}
                          {ESTADO_ENLACE[l.estado]}
                          {l.usadoEn &&
                            ` el ${new Date(l.usadoEn).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}`}
                        </span>
                      </span>
                      {l.estado === 'activo' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            await fetch(`/api/projects/${projectId}/links/${l.id}`, {
                              method: 'DELETE',
                            });
                            push({ title: 'Enlace cancelado', variant: 'success' });
                            await cargar();
                          }}
                        >
                          Cancelar
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
