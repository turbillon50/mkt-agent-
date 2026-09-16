'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { sectionsFor, type ProjectRole, type ProjectSection } from '@/src/projects/types';

/**
 * Los proyectos que ve quien está sentado frente a la pantalla, en un solo
 * lugar. Antes cada pieza del shell pedía su propia lista y se pisaban entre
 * ellas: el chip decía una cosa y el panel otra.
 *
 * Lo que llega de `/api/projects` YA viene filtrado por rol en el servidor.
 * Esto no esconde nada: pinta lo que el servidor dejó salir.
 */

export interface ProjectSummary {
  id: string;
  name: string;
  slug: string;
  kind: string;
  role: ProjectRole;
  canales: number;
  miembros: number;
}

interface ProjectsValue {
  projects: ProjectSummary[];
  activeId: string | null;
  active: ProjectSummary | null;
  sections: ProjectSection[];
  loading: boolean;
  setActiveId: (id: string) => void;
  refresh: () => Promise<void>;
}

const Ctx = createContext<ProjectsValue>({
  projects: [],
  activeId: null,
  active: null,
  sections: [],
  loading: true,
  setActiveId: () => undefined,
  refresh: async () => undefined,
});

export function ProjectsProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [activeId, setActive] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/projects', { cache: 'no-store' });
      if (!res.ok) {
        setProjects([]);
        return;
      }
      const data = await res.json();
      setProjects(data.projects ?? []);
      setActive(data.activeProjectId ?? null);
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setActiveId = useCallback(
    (id: string) => {
      setActive(id);
      // Entrar al proyecto es elegirlo: la propia navegación lo deja activo del
      // lado del servidor, así que aquí no hace falta un PATCH aparte.
      router.push(`/projects/${id}`);
    },
    [router],
  );

  const value = useMemo<ProjectsValue>(() => {
    const active = projects.find((p) => p.id === activeId) ?? projects[0] ?? null;
    return {
      projects,
      activeId: active?.id ?? null,
      active,
      sections: active ? sectionsFor(active.role) : [],
      loading,
      setActiveId,
      refresh,
    };
  }, [projects, activeId, loading, setActiveId, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProjects(): ProjectsValue {
  return useContext(Ctx);
}
