import 'server-only';

/**
 * Fachada de servidor. La lógica vive en src/sales/queries.ts para que las
 * pruebas y los scripts de tsx la puedan usar sin `server-only`.
 */
export * from '@/src/sales/queries';
