import 'server-only';

/**
 * Fachada de servidor. La lógica vive en src/sales/projects.ts para que los
 * scripts de tsx (seed, importación) la puedan usar sin `server-only`.
 */
export * from '@/src/sales/projects';
